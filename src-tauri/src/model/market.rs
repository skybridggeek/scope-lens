//! Constant-elasticity partial-equilibrium model with price ceilings,
//! channel diversion, and parallel-market clearing.

/// Deep structural calibration parameters for one commodity.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Calibration {
    /// Reference (observed) price, DZD/kg.
    pub p0: f64,
    /// Reference quantity, tonnes.
    pub q0: f64,
    /// Price elasticity of demand (negative).
    pub eps_d: f64,
    /// Price elasticity of supply (positive).
    pub eps_s: f64,
    /// Unit production/import cost, DZD/kg.
    pub c0: f64,
    /// Normal competitive margin (fraction, e.g. 0.15).
    pub m0: f64,
    /// Diversion response scale.
    pub alpha: f64,
    /// Enforcement-response exponent.
    pub beta: f64,
    /// Parallel-market small-quantity damping, tonnes.
    pub delta: f64,
    /// Enforcement risk-premium coefficient.
    pub kappa: f64,
}

/// Policy levers set by the user.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Policy {
    /// Retail price ceiling, DZD/kg. None = no ceiling.
    pub p_c_retail: Option<f64>,
    /// Producer price ceiling, DZD/kg (informational in v1 core).
    pub p_c_producer: Option<f64>,
    /// Unit subsidy, DZD/kg.
    pub subsidy: f64,
    /// Strategic stock release, tonnes.
    pub stock_release: f64,
    /// Monitoring/enforcement intensity in [0, 1].
    pub mu: f64,
    /// Marginal fiscal cost of stock, million DZD per tonne.
    pub c_stock: f64,
    /// Enforcement cost scale, million DZD.
    pub c_enf: f64,
}

/// Full simulation outcome for one regime.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Outcome {
    /// Unregulated equilibrium price, DZD/kg.
    pub p_star: f64,
    /// Unregulated equilibrium quantity, tonnes.
    pub q_star: f64,
    /// Quantity sold through the official channel, tonnes.
    pub q_reg: f64,
    /// Quantity diverted to the parallel market, tonnes.
    pub q_par: f64,
    /// Excess demand at the ceiling, tonnes.
    pub shortage: f64,
    /// Parallel-market clearing price, DZD/kg.
    pub p_par: f64,
    /// Diverted fraction of total supply in [0, 1].
    pub theta: f64,
    /// Government expenditure, million DZD.
    pub fiscal_cost: f64,
    /// Average effective household price, DZD/kg.
    pub p_avg: f64,
    /// Change in household expenditure vs. unregulated baseline, percent.
    pub household_spending_change_pct: f64,
    /// Deadweight loss (Harberger triangle + parallel rent dissipation),
    /// million DZD. Illustrative.
    pub dwl: f64,
}

/// Solve the baseline unregulated equilibrium P*, Q* for constant-elasticity
/// curves calibrated around (p0, q0): Qd = q0 (P/p0)^eps_d,
/// Qs = q0 (P/p0)^eps_s (no subsidy in the unregulated baseline).
pub fn equilibrium(cal: &Calibration) -> (f64, f64) {
    let ratio = cal.eps_d / cal.eps_s;
    // q0 (P/p0)^eps_d = q0 (P/p0)^eps_s  =>  (P/p0)^(eps_d - eps_s) = 1
    // Constant-elasticity curves through the same (p0, q0) only intersect
    // there, so P* = p0 by construction.
    let _ = ratio;
    (cal.p0, cal.q0)
}

/// Demand quantity at price P (tonnes).
pub fn demand(cal: &Calibration, p: f64) -> f64 {
    cal.q0 * (p / cal.p0).powf(cal.eps_d)
}

/// Supply quantity at effective producer price P (tonnes).
pub fn supply(cal: &Calibration, p: f64) -> f64 {
    cal.q0 * (p / cal.p0).powf(cal.eps_s)
}

/// Numerical safety cap on the parallel price (DZD/kg). The constant-elasticity
/// exponent 1/|eps_d| runs away for near-inelastic demand (and sensitivity
/// perturbs eps_d toward 0), which can overflow to Infinity or absurd 1e180+
/// values. Far above any realistic food price, so normal outputs are untouched.
const P_PAR_MAX: f64 = 1_000_000.0;

/// Run the full policy simulation for one commodity + policy regime.
pub fn simulate(cal: &Calibration, pol: &Policy) -> Outcome {
    let (p_star, q_star) = equilibrium(cal);

    let (p_c, q_reg, q_par, shortage, theta, p_par) = match pol.p_c_retail {
        None => {
            let q = supply(cal, p_star + pol.subsidy) + pol.stock_release;
            (p_star, q, 0.0, 0.0, 0.0, p_star)
        }
        Some(p_c) if p_c >= p_star => {
            // Ceiling non-binding: no distortion.
            let q = supply(cal, p_star + pol.subsidy) + pol.stock_release;
            (p_star, q, 0.0, 0.0, 0.0, p_star)
        }
        Some(p_c) => {
            let p_eff = p_c + pol.subsidy;
            let q_total = supply(cal, p_eff) + pol.stock_release;

            let margin_squeeze = ((cal.c0 * (1.0 + cal.m0) - p_c) / cal.c0).max(0.0);
            let one_minus_mu = (1.0 - pol.mu.clamp(0.0, 1.0)).powf(cal.beta);
            let theta = if margin_squeeze > 0.0 {
                1.0 - (-cal.alpha * margin_squeeze * one_minus_mu).exp()
            } else {
                0.0
            };
            let theta = theta.clamp(0.0, 1.0);

            let q_par = theta * q_total;
            let q_reg = (1.0 - theta) * q_total;
            let q_demand_at_ceiling = demand(cal, p_c);
            let shortage = (q_demand_at_ceiling - q_reg).max(0.0);

            // Guard the scarcity denominator (delta can be 0) and clamp the
            // runaway exponent so p_par stays finite and sane.
            let denom = q_par + cal.delta;
            let base = if denom > 0.0 { 1.0 + shortage / denom } else { 1.0 };
            let raw_par = p_c * base.powf(1.0 / cal.eps_d.abs()) * (1.0 + cal.kappa * pol.mu);
            let p_par = if raw_par.is_finite() { raw_par.clamp(0.0, P_PAR_MAX) } else { P_PAR_MAX };

            (p_c, q_reg, q_par, shortage, theta, p_par)
        }
    };

    let q_total = q_reg + q_par;
    let fiscal_cost =
        pol.subsidy * q_total / 1_000_000.0 + pol.c_stock * pol.stock_release + pol.c_enf * pol.mu.powi(2);
    let p_avg = if q_total > 0.0 {
        (q_reg * p_c + q_par * p_par) / q_total
    } else {
        p_c
    };

    // Baseline household expenditure at the unregulated equilibrium.
    let e0 = p_star * demand(cal, p_star);
    let e1 = p_avg * q_total;
    let household_spending_change_pct = if e0 > 0.0 {
        (e1 - e0) / e0 * 100.0
    } else {
        0.0
    };

    let dwl = if shortage > 0.0 {
        (0.5 * (p_par - p_c) * shortage + (p_par - p_c) * q_par) / 1_000_000.0
    } else {
        0.0
    };

    Outcome {
        p_star,
        q_star,
        q_reg,
        q_par,
        shortage,
        p_par,
        theta,
        fiscal_cost,
        p_avg,
        household_spending_change_pct,
        dwl,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cal() -> Calibration {
        Calibration {
            p0: 120.0,
            q0: 50_000.0,
            eps_d: -0.4,
            eps_s: 0.6,
            c0: 70.0,
            m0: 0.2,
            alpha: 3.0,
            beta: 2.0,
            delta: 100.0,
            kappa: 0.1,
        }
    }

    fn no_policy() -> Policy {
        Policy {
            p_c_retail: None,
            p_c_producer: None,
            subsidy: 0.0,
            stock_release: 0.0,
            mu: 0.5,
            c_stock: 0.05,
            c_enf: 200.0,
        }
    }

    #[test]
    fn market_clears_when_ceiling_above_equilibrium() {
        let out = simulate(&cal(), &Policy { p_c_retail: Some(150.0), ..no_policy() });
        assert_eq!(out.p_star, 120.0);
        assert_eq!(out.q_star, 50_000.0);
        assert_eq!(out.shortage, 0.0);
        assert_eq!(out.q_par, 0.0);
    }

    #[test]
    fn no_ceiling_means_no_distortion() {
        let out = simulate(&cal(), &no_policy());
        assert_eq!(out.shortage, 0.0);
        assert_eq!(out.theta, 0.0);
    }

    #[test]
    fn binding_ceiling_with_weak_monitoring_creates_shortage_and_parallel_price() {
        // Ceiling 80 < c0(1+m0) = 84: margin squeeze with mu = 0.1.
        let out = simulate(&cal(), &Policy { p_c_retail: Some(80.0), mu: 0.1, ..no_policy() });
        assert!(out.theta > 0.0);
        assert!(out.shortage > 0.0);
        assert!(out.p_par > out.p_star);
    }

    #[test]
    fn stock_release_mitigates_shortage() {
        let base = simulate(&cal(), &Policy { p_c_retail: Some(80.0), mu: 0.1, ..no_policy() });
        let with_stock = simulate(&cal(), &Policy {
            p_c_retail: Some(80.0),
            mu: 0.1,
            stock_release: 5_000.0,
            ..no_policy()
        });
        assert!(with_stock.shortage < base.shortage);
        assert!(with_stock.p_par < base.p_par);
    }

    #[test]
    fn strict_monitoring_reduces_diversion() {
        let weak = simulate(&cal(), &Policy { p_c_retail: Some(80.0), mu: 0.1, ..no_policy() });
        let strict = simulate(&cal(), &Policy { p_c_retail: Some(80.0), mu: 0.95, ..no_policy() });
        assert!(strict.theta < weak.theta);
    }

    #[test]
    fn zero_delta_never_produces_infinite_parallel_price() {
        let c = Calibration { delta: 0.0, ..cal() };
        // Ceiling 108 < P* 120 but > C0(1+m0)=84 => theta=0, q_par=0, shortage>0.
        let out = simulate(&c, &Policy { p_c_retail: Some(108.0), mu: 0.05, ..no_policy() });
        assert!(out.shortage > 0.0);
        assert_eq!(out.q_par, 0.0);
        assert!(out.p_par.is_finite() && out.p_par <= P_PAR_MAX);
        assert!(out.p_avg.is_finite());
        assert!(out.dwl.is_finite());
        assert!(out.household_spending_change_pct.is_finite());
    }

    #[test]
    fn near_inelastic_demand_clamps_runaway_parallel_price() {
        // eps_d=-0.012 (as sensitivity produces) => exponent ~83 overflows f64.
        let c = Calibration { eps_d: -0.012, c0: 0.0, delta: 10.0, ..cal() };
        let out = simulate(&c, &Policy { p_c_retail: Some(1.0), mu: 0.05, ..no_policy() });
        assert!(out.p_par.is_finite() && out.p_par <= P_PAR_MAX);
        assert!(out.p_avg.is_finite());
        assert!(out.dwl.is_finite());
        assert!(out.household_spending_change_pct.is_finite());
    }
}
