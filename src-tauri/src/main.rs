#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod model;
mod pdf;

use model::market::{Calibration, Outcome, Policy};
use model::optimizer::{self, OptimizationResult, WilayaInput};
use model::presets::{commodity_presets, CommodityPreset};
use model::scenarios::{self, ScenarioResult, SensitivityRow};
use std::path::PathBuf;

const LOGO_CANDIDATES: [&str; 3] = ["logo.png", "logo.svg", "logo.jpg"];

/// Returns the file name of the first logo found in `src-tauri/assets/logo/`
/// (checked in order: logo.png, logo.svg, logo.jpg), or None if the folder
/// is empty. Used by the PDF report header so it never shows a broken image.
#[tauri::command]
fn get_logo_asset() -> Option<String> {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("assets").join("logo");
    for name in LOGO_CANDIDATES {
        if dir.join(name).is_file() {
            return Some(name.to_string());
        }
    }
    None
}

/// Product presets defined in data/scope-data.json.
#[tauri::command]
fn get_commodities() -> Vec<CommodityPreset> {
    commodity_presets()
}

/// Run a single policy simulation.
#[tauri::command]
fn run_simulation(calibration: Calibration, policy: Policy) -> Outcome {
    model::market::simulate(&calibration, &policy)
}

/// Compute all four policy regimes from the current control values.
#[tauri::command]
fn compare_scenarios(calibration: Calibration, policy: Policy) -> Vec<ScenarioResult> {
    scenarios::compare_scenarios(&calibration, &policy)
}

/// Elasticity sensitivity ranges for the tornado chart.
#[tauri::command]
fn sensitivity(calibration: Calibration, policy: Policy) -> Vec<SensitivityRow> {
    scenarios::sensitivity(&calibration, &policy)
}

/// Wilayas defined in data/scope-data.json (illustrative deficits/costs).
#[tauri::command]
fn get_wilayas() -> Vec<WilayaInput> {
    optimizer::default_wilayas()
}

/// Solve the wilaya allocation LP for a given national stock budget.
#[tauri::command]
fn optimize_wilayas(total_stock: f64, wilayas: Vec<WilayaInput>) -> OptimizationResult {
    optimizer::optimize(total_stock, &wilayas)
}

/// Build a Policy Brief PDF (all strings pre-localized by the frontend).
#[tauri::command]
fn export_pdf(report: pdf::PdfReport) -> Result<Vec<u8>, String> {
    pdf::build_pdf(&report)
}

/// Write the exported PDF bytes to the user-chosen path.
#[tauri::command]
fn write_pdf(path: String, bytes: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, bytes).map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_logo_asset,
            get_commodities,
            run_simulation,
            compare_scenarios,
            sensitivity,
            get_wilayas,
            optimize_wilayas,
            export_pdf,
            write_pdf,
        ])
        .run(tauri::generate_context!())
        .expect("error while running SCOPE Lens");
}
