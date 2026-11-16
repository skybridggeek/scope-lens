//! Product presets, loaded from data/scope-data.json (see model::data).
//! All figures are clearly labeled illustrative/demo data in the UI.

use super::data;
use super::market::Calibration;

/// A commodity preset with its suggested policy anchor values.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CommodityPreset {
    pub id: String,
    pub calibration: Calibration,
    /// Suggested retail ceiling for the "ceiling" scenarios, DZD/kg.
    pub suggested_retail_ceiling: f64,
    /// Suggested producer ceiling, DZD/kg.
    pub suggested_producer_ceiling: f64,
    /// Suggested direct subsidy, DZD/kg.
    pub suggested_subsidy: f64,
    /// Suggested strategic stock release, tonnes.
    pub suggested_stock_release: f64,
}

/// All products defined in the data file, in file order. Defaults for
/// omitted fields must stay identical to src/data.ts on the frontend.
pub fn commodity_presets() -> Vec<CommodityPreset> {
    data::load()
        .products
        .into_iter()
        .map(|p| {
            let adv = p.advanced.unwrap_or(data::RawAdvanced {
                alpha: None,
                beta: None,
                delta: None,
                kappa: None,
            });
            CommodityPreset {
                id: p.id,
                calibration: Calibration {
                    p0: p.price,
                    q0: p.quantity,
                    eps_d: p.demand_sensitivity.unwrap_or(-0.4),
                    eps_s: p.supply_sensitivity.unwrap_or(0.6),
                    c0: p.cost,
                    m0: p.markup.unwrap_or(0.2),
                    alpha: adv.alpha.unwrap_or(3.0),
                    beta: adv.beta.unwrap_or(2.0),
                    delta: adv.delta.unwrap_or(100.0),
                    kappa: adv.kappa.unwrap_or(0.1),
                },
                suggested_retail_ceiling: p.ceiling.unwrap_or(((p.price * 2.0) / 3.0).round()),
                suggested_producer_ceiling: p.producer_ceiling.unwrap_or(0.0),
                suggested_subsidy: p.subsidy.unwrap_or(0.0),
                suggested_stock_release: p.stock_release.unwrap_or(0.0),
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shipped_products_keep_their_calibrated_values() {
        let presets = commodity_presets();
        let potatoes = presets.iter().find(|p| p.id == "potatoes").expect("potatoes");
        let c = &potatoes.calibration;
        assert_eq!((c.p0, c.q0, c.eps_d, c.eps_s, c.c0, c.m0), (120.0, 50_000.0, -0.4, 0.6, 70.0, 0.2));
        assert_eq!((c.alpha, c.beta, c.delta, c.kappa), (3.0, 2.0, 100.0, 0.1));
        assert_eq!(potatoes.suggested_retail_ceiling, 80.0);
        assert_eq!(potatoes.suggested_producer_ceiling, 65.0);
        assert_eq!(potatoes.suggested_subsidy, 20.0);
        assert_eq!(potatoes.suggested_stock_release, 5_000.0);
        assert!(presets.iter().any(|p| p.id == "bananas"));
        assert!(presets.iter().any(|p| p.id == "oil"));
    }
}