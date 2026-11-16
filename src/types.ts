// Mirrors the serde structs in src-tauri/src/model/. Keep field names in
// snake_case to match the Rust side over IPC.

export interface Calibration {
  p0: number;
  q0: number;
  eps_d: number;
  eps_s: number;
  c0: number;
  m0: number;
  alpha: number;
  beta: number;
  delta: number;
  kappa: number;
}

export interface Policy {
  p_c_retail: number | null;
  p_c_producer: number | null;
  subsidy: number;
  stock_release: number;
  mu: number;
  c_stock: number;
  c_enf: number;
}

export interface Outcome {
  p_star: number;
  q_star: number;
  q_reg: number;
  q_par: number;
  shortage: number;
  p_par: number;
  theta: number;
  fiscal_cost: number;
  p_avg: number;
  household_spending_change_pct: number;
  dwl: number;
}

export interface CommodityPreset {
  id: string;
  calibration: Calibration;
  suggested_retail_ceiling: number;
  suggested_producer_ceiling: number;
  suggested_subsidy: number;
  suggested_stock_release: number;
}

export interface ScenarioResult {
  regime: string;
  policy: Policy;
  outcome: Outcome;
}

export interface SensitivityRow {
  parameter: string;
  low: Outcome;
  base: Outcome;
  high: Outcome;
}

export interface WilayaInput {
  id: string;
  deficit: number;
  transport: number;
  priority: number;
}

export interface WilayaAllocation {
  id: string;
  allocated: number;
  unmet: number;
}

export interface OptimizationResult {
  allocations: WilayaAllocation[];
  efficiency: number;
  transport_cost: number;
}
