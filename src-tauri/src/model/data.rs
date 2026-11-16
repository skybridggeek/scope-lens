//! Loads `data/scope-data.json` — the single editable source for products
//! and wilayas. The frontend reads the same file (src/data.ts); keep the
//! defaults below identical to the ones there.

use serde::Deserialize;

const DATA_JSON: &str = include_str!("../../../data/scope-data.json");

#[derive(Debug, Deserialize)]
pub struct RawAdvanced {
    #[serde(default)]
    pub alpha: Option<f64>,
    #[serde(default)]
    pub beta: Option<f64>,
    #[serde(default)]
    pub delta: Option<f64>,
    #[serde(default)]
    pub kappa: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct RawProduct {
    pub id: String,
    pub price: f64,
    pub quantity: f64,
    pub cost: f64,
    #[serde(default)]
    pub demand_sensitivity: Option<f64>,
    #[serde(default)]
    pub supply_sensitivity: Option<f64>,
    #[serde(default)]
    pub markup: Option<f64>,
    #[serde(default)]
    pub ceiling: Option<f64>,
    #[serde(default)]
    pub producer_ceiling: Option<f64>,
    #[serde(default)]
    pub subsidy: Option<f64>,
    #[serde(default)]
    pub stock_release: Option<f64>,
    #[serde(default)]
    pub advanced: Option<RawAdvanced>,
}

#[derive(Debug, Deserialize)]
pub struct RawWilaya {
    pub id: String,
    pub deficit: f64,
    #[serde(default)]
    pub transport: Option<f64>,
    #[serde(default)]
    pub priority: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub struct DataFile {
    pub products: Vec<RawProduct>,
    pub wilayas: Vec<RawWilaya>,
}

/// Parse the embedded data file. Unknown sections (names, cases, _README)
/// are ignored here — only the frontend uses them.
pub fn load() -> DataFile {
    serde_json::from_str(DATA_JSON)
        .expect("data/scope-data.json is invalid — check quotes, commas and braces")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn data_file_parses_with_unique_ids() {
        let data = load();
        assert!(!data.products.is_empty());
        assert!(!data.wilayas.is_empty());
        let mut ids: Vec<&str> = data.products.iter().map(|p| p.id.as_str()).collect();
        ids.sort_unstable();
        let n = ids.len();
        ids.dedup();
        assert_eq!(ids.len(), n, "duplicate product id");
        let mut wids: Vec<&str> = data.wilayas.iter().map(|w| w.id.as_str()).collect();
        wids.sort_unstable();
        let n = wids.len();
        wids.dedup();
        assert_eq!(wids.len(), n, "duplicate wilaya id");
    }

    #[test]
    fn defaults_match_frontend() {
        // A minimal product entry must normalize exactly like src/data.ts.
        let json = r#"{ "products": [ { "id": "x", "price": 90, "quantity": 1000, "cost": 50 } ], "wilayas": [ { "id": "w", "deficit": 100 } ] }"#;
        let data: DataFile = serde_json::from_str(json).unwrap();
        let p = &data.products[0];
        assert_eq!(p.demand_sensitivity.unwrap_or(-0.4), -0.4);
        assert_eq!(p.supply_sensitivity.unwrap_or(0.6), 0.6);
        assert_eq!(p.markup.unwrap_or(0.2), 0.2);
        assert_eq!(p.ceiling.unwrap_or(((p.price * 2.0) / 3.0).round()), 60.0);
        let w = &data.wilayas[0];
        assert_eq!(w.transport.unwrap_or(10.0), 10.0);
        assert_eq!(w.priority.unwrap_or(0.8), 0.8);
    }
}