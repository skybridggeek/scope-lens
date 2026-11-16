//! Wilaya stock-release optimizer: allocates a constrained national buffer
//! stock across wilayas to minimize weighted shortage + logistics cost.
//! Solved with a pure-Rust LP (good_lp's bundled minilp) — no external
//! C-solver DLLs on Windows.

use good_lp::{default_solver, variable, variables, Expression, Solution, SolverModel};

/// Representative wilayas with illustrative demand weights.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WilayaInput {
    pub id: String,
    /// Local deficit to be covered, tonnes.
    pub deficit: f64,
    /// Transport cost, thousand DZD per tonne.
    pub transport: f64,
    /// Shortage-severity priority weight (higher = costlier to leave unmet).
    pub priority: f64,
}

pub fn default_wilayas() -> Vec<WilayaInput> {
    super::data::load()
        .wilayas
        .into_iter()
        .map(|w| WilayaInput {
            id: w.id,
            deficit: w.deficit,
            transport: w.transport.unwrap_or(10.0),
            priority: w.priority.unwrap_or(0.8),
        })
        .collect()
}

/// Optimal allocation result for one wilaya.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WilayaAllocation {
    pub id: String,
    pub allocated: f64,
    pub unmet: f64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct OptimizationResult {
    pub allocations: Vec<WilayaAllocation>,
    /// Weighted shortage coverage in [0, 1]: 1 = every tonne of priority-
    /// weighted deficit covered.
    pub efficiency: f64,
    /// Total logistics cost, million DZD.
    pub transport_cost: f64,
}

/// Penalty for leaving one tonne unmet, in million DZD, before the wilaya
/// priority multiplier.
const SHORTAGE_PENALTY_PER_T: f64 = 0.5;

/// Solve the LP: choose alloc_w to minimize
///   Σ_w [ priority_w · penalty · (deficit_w − alloc_w)
///         + transport_w/1000 · alloc_w ]
/// subject to Σ_w alloc_w ≤ total_stock and 0 ≤ alloc_w ≤ deficit_w.
pub fn optimize(total_stock: f64, wilayas: &[WilayaInput]) -> OptimizationResult {
    let mut vars = variables!();
    let alloc: Vec<_> = wilayas
        .iter()
        .map(|w| vars.add(variable().min(0.0).max(w.deficit)))
        .collect();

    let mut objective: Expression = 0.0.into();
    for (i, w) in wilayas.iter().enumerate() {
        // Constant part of the objective (priority·penalty·deficit) does not
        // affect the optimum; only the per-tonne coefficient matters.
        let coeff = w.transport / 1000.0 - w.priority * SHORTAGE_PENALTY_PER_T;
        objective += coeff * alloc[i];
    }

    let zero: Expression = 0.0.into();
    let total: Expression = alloc.iter().fold(zero, |acc, v| acc + *v);
    let model = vars
        .minimise(objective)
        .using(default_solver)
        .with(total.leq(total_stock));

    // A stock larger than total deficit would make the constraint slack;
    // minilp handles that fine, but clamp for numerical tidiness.
    let solution = model.solve().expect("wilaya LP must be feasible (alloc = 0 always works)");

    let allocations: Vec<WilayaAllocation> = wilayas
        .iter()
        .enumerate()
        .map(|(i, w)| {
            let a = solution.value(alloc[i]).max(0.0);
            WilayaAllocation {
                id: w.id.clone(),
                allocated: a,
                unmet: (w.deficit - a).max(0.0),
            }
        })
        .collect();

    let weighted_deficit: f64 = wilayas.iter().map(|w| w.priority * w.deficit).sum();
    let weighted_unmet: f64 = wilayas
        .iter()
        .zip(allocations.iter())
        .map(|(w, a)| w.priority * a.unmet)
        .sum();
    let efficiency = if weighted_deficit > 0.0 {
        (1.0 - weighted_unmet / weighted_deficit).clamp(0.0, 1.0)
    } else {
        1.0
    };

    let transport_cost: f64 = wilayas
        .iter()
        .zip(allocations.iter())
        .map(|(w, a)| w.transport / 1000.0 * a.allocated)
        .sum();

    OptimizationResult {
        allocations,
        efficiency,
        transport_cost,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn respects_total_stock_constraint() {
        let wilayas = default_wilayas();
        let stock = 10_000.0;
        let res = optimize(stock, &wilayas);
        let total: f64 = res.allocations.iter().map(|a| a.allocated).sum();
        assert!(total <= stock + 1e-6);
        for (w, a) in wilayas.iter().zip(res.allocations.iter()) {
            assert!(a.allocated <= w.deficit + 1e-6);
        }
    }

    #[test]
    fn abundant_stock_covers_all_deficits() {
        let wilayas = default_wilayas();
        let total_deficit: f64 = wilayas.iter().map(|w| w.deficit).sum();
        let res = optimize(total_deficit, &wilayas);
        assert!((res.efficiency - 1.0).abs() < 1e-6);
        assert!(res.allocations.iter().all(|a| a.unmet < 1e-6));
    }

    #[test]
    fn scarce_stock_prioritizes_high_priority_low_transport() {
        let wilayas = vec![
            WilayaInput { id: "a".to_string(), deficit: 100.0, transport: 50.0, priority: 1.0 },
            WilayaInput { id: "b".to_string(), deficit: 100.0, transport: 5.0, priority: 1.0 },
        ];
        let res = optimize(100.0, &wilayas);
        // Equal priority: serve the cheaper-to-reach wilaya first.
        let a = res.allocations.iter().find(|x| x.id == "a").unwrap();
        let b = res.allocations.iter().find(|x| x.id == "b").unwrap();
        assert_eq!(b.allocated, 100.0);
        assert_eq!(a.allocated, 0.0);
    }

    #[test]
    fn zero_stock_leaves_everything_unmet() {
        let wilayas = default_wilayas();
        let res = optimize(0.0, &wilayas);
        assert!(res.efficiency < 1e-9);
        assert!(res.allocations.iter().all(|a| a.allocated < 1e-9));
    }
}
