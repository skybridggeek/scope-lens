// IPC layer: uses the Rust backend inside Tauri, and the mirrored
// TypeScript engine when running in a plain browser (dev preview).

import { invoke } from "@tauri-apps/api/core";
import * as local from "./engine";
import type {
  Calibration,
  CommodityPreset,
  OptimizationResult,
  Outcome,
  Policy,
  ScenarioResult,
  SensitivityRow,
  WilayaInput,
} from "./types";

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function ipc<T>(cmd: string, args?: Record<string, unknown>, fallback?: () => T | Promise<T>): Promise<T> {
  if (inTauri) return invoke<T>(cmd, args);
  if (fallback) return fallback();
  throw new Error(`No fallback for ${cmd} outside Tauri`);
}

export const api = {
  getCommodities: () =>
    ipc<CommodityPreset[]>("get_commodities", undefined, () => local.COMMODITY_PRESETS),
  runSimulation: (calibration: Calibration, policy: Policy) =>
    ipc<Outcome>("run_simulation", { calibration, policy }, () => local.simulate(calibration, policy)),
  compareScenarios: (calibration: Calibration, policy: Policy) =>
    ipc<ScenarioResult[]>("compare_scenarios", { calibration, policy }, () =>
      local.compareScenarios(calibration, policy),
    ),
  sensitivity: (calibration: Calibration, policy: Policy) =>
    ipc<SensitivityRow[]>("sensitivity", { calibration, policy }, () =>
      local.sensitivity(calibration, policy),
    ),
  getWilayas: () => ipc<WilayaInput[]>("get_wilayas", undefined, () => local.DEFAULT_WILAYAS),
  optimizeWilayas: (totalStock: number, wilayas: WilayaInput[]) =>
    ipc<OptimizationResult>("optimize_wilayas", { totalStock, wilayas }, () =>
      local.optimize(totalStock, wilayas),
    ),
};
