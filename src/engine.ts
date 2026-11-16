// TypeScript mirror of the Rust economic engine (src-tauri/src/model/).
// Used as a fallback when the frontend runs outside Tauri (e.g. plain
// browser preview); inside the app, the Rust commands are authoritative.
// Keep the math identical to market.rs / scenarios.rs / optimizer.rs.

import type {
  Calibration,
  OptimizationResult,
  Outcome,
  Policy,
  ScenarioResult,
  SensitivityRow,
  WilayaAllocation,
  WilayaInput,
} from "./types";

// Products and wilayas come from data/scope-data.json (see src/data.ts).
export { COMMODITY_PRESETS, DEFAULT_WILAYAS } from "./data";

export function demand(cal: Calibration, p: number): number {
  return cal.q0 * Math.pow(p / cal.p0, cal.eps_d);
}

export function supply(cal: Calibration, p: number): number {
  return cal.q0 * Math.pow(p / cal.p0, cal.eps_s);
}

// Numerical safety cap on the parallel price (DZD/kg). The constant-elasticity
// exponent 1/|eps_d| runs away for near-inelastic demand (and sensitivity
// perturbs eps_d toward 0), which can overflow to Infinity or absurd 1e180+
// values. Far above any realistic food price, so normal outputs are untouched.
const P_PAR_MAX = 1_000_000;

export function simulate(cal: Calibration, pol: Policy): Outcome {
  const p_star = cal.p0;
  const q_star = cal.q0;

  let p_c = p_star;
  let q_reg: number;
  let q_par = 0;
  let shortage = 0;
  let theta = 0;
  let p_par = p_star;

  if (pol.p_c_retail !== null && pol.p_c_retail < p_star) {
    p_c = pol.p_c_retail;
    const p_eff = p_c + pol.subsidy;
    const q_total = supply(cal, p_eff) + pol.stock_release;

    const marginSqueeze = Math.max(0, (cal.c0 * (1 + cal.m0) - p_c) / cal.c0);
    const oneMinusMu = Math.pow(1 - Math.min(1, Math.max(0, pol.mu)), cal.beta);
    theta =
      marginSqueeze > 0
        ? Math.min(1, Math.max(0, 1 - Math.exp(-cal.alpha * marginSqueeze * oneMinusMu)))
        : 0;

    q_par = theta * q_total;
    q_reg = (1 - theta) * q_total;
    const qDemandAtCeiling = demand(cal, p_c);
    shortage = Math.max(0, qDemandAtCeiling - q_reg);

    // Guard the scarcity denominator (delta can be 0) and clamp the runaway
    // exponent so p_par stays finite and sane.
    const denom = q_par + cal.delta;
    const base = denom > 0 ? 1 + shortage / denom : 1;
    const rawPar = p_c * Math.pow(base, 1 / Math.abs(cal.eps_d)) * (1 + cal.kappa * pol.mu);
    p_par = Number.isFinite(rawPar) ? Math.min(P_PAR_MAX, Math.max(0, rawPar)) : P_PAR_MAX;
  } else {
    q_reg = supply(cal, p_star + pol.subsidy) + pol.stock_release;
  }

  const q_total = q_reg + q_par;
  const fiscalCost =
    (pol.subsidy * q_total) / 1_000_000 +
    pol.c_stock * pol.stock_release +
    pol.c_enf * Math.pow(pol.mu, 2);
  const p_avg = q_total > 0 ? (q_reg * p_c + q_par * p_par) / q_total : p_c;

  const e0 = p_star * demand(cal, p_star);
  const e1 = p_avg * q_total;
  const householdSpendingChangePct = e0 > 0 ? ((e1 - e0) / e0) * 100 : 0;

  const dwl =
    shortage > 0
      ? (0.5 * (p_par - p_c) * shortage + (p_par - p_c) * q_par) / 1_000_000
      : 0;

  return {
    p_star,
    q_star,
    q_reg,
    q_par,
    shortage,
    p_par,
    theta,
    fiscal_cost: fiscalCost,
    p_avg,
    household_spending_change_pct: householdSpendingChangePct,
    dwl,
  };
}

export function compareScenarios(cal: Calibration, current: Policy): ScenarioResult[] {
  const base = { ...current };
  const regimes: Array<[string, Policy]> = [
    ["no_intervention", { ...base, p_c_retail: null, p_c_producer: null, subsidy: 0, stock_release: 0 }],
    ["ceiling_only", { ...base, subsidy: 0, stock_release: 0 }],
    ["ceiling_plus_stock", { ...base, subsidy: 0 }],
    ["direct_subsidy", { ...base, p_c_retail: null, p_c_producer: null, stock_release: 0 }],
  ];
  return regimes.map(([regime, policy]) => ({ regime, policy, outcome: simulate(cal, policy) }));
}

export function sensitivity(cal: Calibration, pol: Policy): SensitivityRow[] {
  const mk = (patch: Partial<Calibration>): Calibration => ({ ...cal, ...patch });
  return [
    {
      parameter: "eps_d",
      low: simulate(mk({ eps_d: Math.min(cal.eps_d * 1.4, -0.02) }), pol),
      base: simulate(cal, pol),
      high: simulate(mk({ eps_d: Math.max(cal.eps_d * 0.6, -3.0) }), pol),
    },
    {
      parameter: "eps_s",
      low: simulate(mk({ eps_s: Math.max(cal.eps_s * 0.6, 0.02) }), pol),
      base: simulate(cal, pol),
      high: simulate(mk({ eps_s: cal.eps_s * 1.4 }), pol),
    },
  ];
}

// Greedy water-filling identical in optimum to the LP (single coupling
// constraint + per-variable box bounds ⇒ LP is integral): sort wilayas by
// (priority · penalty − transport/1000) descending and fill deficits.
const SHORTAGE_PENALTY_PER_T = 0.5;

export function optimize(totalStock: number, wilayas: WilayaInput[]): OptimizationResult {
  const order = wilayas
    .map((w, i) => ({ i, gain: w.priority * SHORTAGE_PENALTY_PER_T - w.transport / 1000 }))
    .sort((a, b) => b.gain - a.gain);

  let remaining = Math.max(0, totalStock);
  const allocated = new Array<number>(wilayas.length).fill(0);
  for (const { i } of order) {
    const a = Math.min(wilayas[i].deficit, remaining);
    allocated[i] = a;
    remaining -= a;
  }

  const allocations: WilayaAllocation[] = wilayas.map((w, i) => ({
    id: w.id,
    allocated: allocated[i],
    unmet: Math.max(0, w.deficit - allocated[i]),
  }));

  const weightedDeficit = wilayas.reduce((s, w) => s + w.priority * w.deficit, 0);
  const weightedUnmet = wilayas.reduce((s, w, i) => s + w.priority * allocations[i].unmet, 0);
  const efficiency = weightedDeficit > 0 ? Math.min(1, Math.max(0, 1 - weightedUnmet / weightedDeficit)) : 1;
  const transportCost = wilayas.reduce((s, w, i) => s + (w.transport / 1000) * allocations[i].allocated, 0);

  return { allocations, efficiency, transport_cost: transportCost };
}
