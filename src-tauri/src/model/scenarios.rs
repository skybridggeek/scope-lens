//! The four standard policy regimes compared side by side, plus
//! elasticity sensitivity ranges for the tornado/fan chart.

use super::market::{simulate, Calibration, Outcome, Policy};

/// One row of the four-scenario comparison.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ScenarioResult {
    pub regime: String,
    pub policy: Policy,
    pub outcome: Outcome,
}

/// Compute all four policy regimes for the given calibration, deriving
/// each regime from the user's current control values.
pub fn compare_scenarios(cal: &Calibration, current: &Policy) -> Vec<ScenarioResult> {
    let mu = current.mu;
    let ceiling = current.p_c_retail;
    let stock = current.stock_release;
    let subsidy = current.subsidy;

    let regimes: Vec<(&'static str, Policy)> = vec![
        (
            "no_intervention",
            Policy { p_c_retail: None, p_c_producer: None, subsidy: 0.0, stock_release: 0.0, mu, ..current.clone() },
        ),
        (
            "ceiling_only",
            Policy { p_c_retail: ceiling, subsidy: 0.0, stock_release: 0.0, mu, ..current.clone() },
        ),
        (
            "ceiling_plus_stock",
            Policy { p_c_retail: ceiling, subsidy: 0.0, stock_release: stock, mu, ..current.clone() },
        ),
        (
            "direct_subsidy",
            Policy { p_c_retail: None, p_c_producer: None, subsidy, stock_release: 0.0, mu, ..current.clone() },
        ),
    ];

    regimes
        .into_iter()
        .map(|(regime, policy)| ScenarioResult {
            regime: regime.to_string(),
            outcome: simulate(cal, &policy),
            policy,
        })
        .collect()
}

/// Sensitivity of key outputs to deep parameters, each at low/base/high.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SensitivityRow {
    pub parameter: String,
    pub low: Outcome,
    pub base: Outcome,
    pub high: Outcome,
}

/// ±40% bounds on demand and supply elasticity (clamped to valid signs).
pub fn sensitivity(cal: &Calibration, pol: &Policy) -> Vec<SensitivityRow> {
    let mut rows = Vec::new();

    let mut low = cal.clone();
    low.eps_d = (cal.eps_d * 1.4).min(-0.02); // more elastic (more negative)
    let mut high = cal.clone();
    high.eps_d = (cal.eps_d * 0.6).max(-3.0); // more inelastic
    rows.push(SensitivityRow {
        parameter: "eps_d".to_string(),
        low: simulate(&low, pol),
        base: simulate(cal, pol),
        high: simulate(&high, pol),
    });

    let mut low = cal.clone();
    low.eps_s = (cal.eps_s * 0.6).max(0.02);
    let mut high = cal.clone();
    high.eps_s = cal.eps_s * 1.4;
    rows.push(SensitivityRow {
        parameter: "eps_s".to_string(),
        low: simulate(&low, pol),
        base: simulate(cal, pol),
        high: simulate(&high, pol),
    });

    rows
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::presets::commodity_presets;

    fn policy() -> Policy {
        Policy {
            p_c_retail: Some(80.0),
            p_c_producer: Some(65.0),
            subsidy: 20.0,
            stock_release: 5_000.0,
            mu: 0.5,
            c_stock: 0.05,
            c_enf: 200.0,
        }
    }

    #[test]
    fn four_regimes_return_in_order() {
        let cal = &commodity_presets()[0].calibration;
        let rows = compare_scenarios(cal, &policy());
        assert_eq!(rows.len(), 4);
        assert_eq!(rows[0].regime, "no_intervention");
        assert_eq!(rows[1].regime, "ceiling_only");
        // Direct subsidy with no ceiling must clear the market.
        assert_eq!(rows[3].outcome.shortage, 0.0);
        // Ceiling + stock must beat ceiling alone on shortage.
        assert!(rows[2].outcome.shortage <= rows[1].outcome.shortage);
    }

    #[test]
    fn sensitivity_bounds_bracket_base() {
        let cal = &commodity_presets()[0].calibration;
        let rows = sensitivity(cal, &policy());
        assert_eq!(rows.len(), 2);
        for row in &rows {
            let spread = [row.low.shortage, row.base.shortage, row.high.shortage];
            let min = spread.iter().cloned().fold(f64::INFINITY, f64::min);
            let max = spread.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
            assert!(row.base.shortage >= min && row.base.shortage <= max);
        }
    }
}
