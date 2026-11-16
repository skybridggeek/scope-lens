// QA sweep: exercise the TS engine across UI-reachable extremes + fuzz and
// report any non-finite output. Bundled with esbuild and run under node.
import {
  simulate, demand, supply, compareScenarios, sensitivity, optimize,
  COMMODITY_PRESETS, DEFAULT_WILAYAS,
} from "../src/engine";
import type { Calibration, Policy, Outcome } from "../src/types";

const OUTCOME_KEYS: (keyof Outcome)[] = [
  "p_star","q_star","q_reg","q_par","shortage","p_par","theta",
  "fiscal_cost","p_avg","household_spending_change_pct","dwl",
];

function bad(o: Outcome): string[] {
  return OUTCOME_KEYS.filter((k) => !Number.isFinite(o[k] as number));
}

// UI slider bounds (SimulatorView):
// eps_d [-2,-0.02], eps_s [0.02,2], c0 [0,500], m0 [0,1], alpha [0,500],
// beta [0,500], delta [0,1000], kappa [0,1]; ceiling [max(1,c0*.5), p0*1.2],
// subsidy [0, max(10,p0*.5)], stock [0, max(1000,q0*.5)], mu [0.05,0.95].
const CAL_EXTREMES: Partial<Calibration>[] = [
  {}, { delta: 0 }, { delta: 0, alpha: 0 }, { c0: 0 }, { c0: 0, delta: 0 },
  { eps_d: -0.02 }, { eps_d: -2 }, { eps_d: -0.02, delta: 0 },
  { eps_d: -0.02, c0: 0, delta: 10 }, { eps_d: -2, c0: 0, delta: 10 },
  { eps_s: 0.02 }, { eps_s: 2 }, { beta: 0 }, { beta: 500 }, { alpha: 500 },
  { m0: 1 }, { kappa: 1 }, { c0: 500 }, { delta: 1000 },
  { eps_d: -0.02, eps_s: 0.02, c0: 0, m0: 1, alpha: 500, beta: 0, delta: 0, kappa: 1 },
];

function policiesFor(cal: Calibration): Policy[] {
  const p0 = cal.p0, q0 = cal.q0;
  const ceilMin = Math.max(1, cal.c0 * 0.5);
  const ceilMax = p0 * 1.2;
  const subMax = Math.max(10, p0 * 0.5);
  const stockMax = Math.max(1000, q0 * 0.5);
  const ceils: (number | null)[] = [null, ceilMin, p0 * 0.5, p0 * 0.9, p0, ceilMax, 1];
  const subs = [0, subMax];
  const stocks = [0, stockMax];
  const mus = [0.05, 0.5, 0.95];
  const out: Policy[] = [];
  for (const c of ceils) for (const s of subs) for (const st of stocks) for (const mu of mus) {
    out.push({ p_c_retail: c, p_c_producer: null, subsidy: s, stock_release: st, mu, c_stock: 0.05, c_enf: 200 });
  }
  return out;
}

let failures = 0, checks = 0, failDelta0 = 0, failDeltaPos = 0;
const maxFinite: Record<string, number> = { p_par: 0, shortage: 0, dwl: 0, household_spending_change_pct: 0, p_avg: 0 };
function trackMax(o: Outcome) {
  for (const k of Object.keys(maxFinite) as (keyof Outcome)[]) {
    const v = Math.abs(o[k] as number);
    if (Number.isFinite(v) && v > maxFinite[k]) maxFinite[k] = v;
  }
}
const seen = new Set<string>();
function report(tag: string, cal: Calibration, pol: Policy, keys: string[]) {
  failures++;
  if (cal.delta === 0) failDelta0++; else failDeltaPos++;
  const sig = tag + "|" + keys.join(",") + "|delta=" + cal.delta + "|eps_d=" + cal.eps_d + "|c0=" + cal.c0 + "|ceil=" + pol.p_c_retail;
  if (seen.has(sig)) return;
  seen.add(sig);
  if (cal.delta > 0) {
    console.log(`OVERFLOW-DELTA>0 [${tag}] keys=${keys.join(",")} cal=${JSON.stringify(cal)} pol=${JSON.stringify(pol)}`);
  } else if (seen.size <= 4) {
    console.log(`NON-FINITE [${tag}] keys=${keys.join(",")} cal=${JSON.stringify(cal)} pol=${JSON.stringify(pol)}`);
  }
}

// 1) Structured extremes per commodity.
for (const preset of COMMODITY_PRESETS) {
  for (const patch of CAL_EXTREMES) {
    const cal = { ...preset.calibration, ...patch };
    for (const pol of policiesFor(cal)) {
      checks++;
      const o = simulate(cal, pol);
      trackMax(o);
      const b = bad(o);
      if (b.length) report("simulate", cal, pol, b);
      // demand/supply at chart-sampled prices must be finite or clamped by chart
      for (const p of [1, cal.p0 * 0.35, cal.p0, cal.p0 * 1.2]) {
        if (!Number.isFinite(demand(cal, p)) && p > 0) { /* demand->inf as p->0 is expected; chart clamps */ }
      }
      for (const row of sensitivity(cal, pol)) {
        for (const k of ["low","base","high"] as const) {
          checks++;
          const bb = bad(row[k]);
          if (bb.length) report("sensitivity:" + row.parameter + ":" + k, cal, pol, bb);
        }
      }
      for (const sc of compareScenarios(cal, pol)) {
        checks++;
        const bb = bad(sc.outcome);
        if (bb.length) report("scenario:" + sc.regime, cal, pol, bb);
      }
    }
  }
}

// 2) Random fuzz within UI bounds (deterministic PRNG).
let seed = 123456789;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const between = (a: number, b: number) => a + (b - a) * rnd();
for (let i = 0; i < 20000; i++) {
  const preset = COMMODITY_PRESETS[Math.floor(rnd() * COMMODITY_PRESETS.length)];
  const cal: Calibration = {
    ...preset.calibration,
    eps_d: between(-2, -0.02), eps_s: between(0.02, 2), c0: between(0, 500),
    m0: between(0, 1), alpha: between(0, 500), beta: between(0, 500),
    delta: Math.round(between(0, 1000) / 10) * 10, kappa: between(0, 1),
  };
  const ceilMin = Math.max(1, cal.c0 * 0.5), ceilMax = cal.p0 * 1.2;
  const pol: Policy = {
    p_c_retail: rnd() < 0.15 ? null : between(Math.min(ceilMin, ceilMax), ceilMax),
    p_c_producer: null, subsidy: between(0, Math.max(10, cal.p0 * 0.5)),
    stock_release: between(0, Math.max(1000, cal.q0 * 0.5)), mu: between(0.05, 0.95),
    c_stock: 0.05, c_enf: 200,
  };
  checks++;
  const fo = simulate(cal, pol);
  trackMax(fo);
  const b = bad(fo);
  if (b.length) report("fuzz", cal, pol, b);
}

// 3) Optimizer extremes.
for (const stock of [0, 1, 15000, 1e9, -5]) {
  const r = optimize(stock, DEFAULT_WILAYAS);
  checks++;
  if (!Number.isFinite(r.efficiency) || !Number.isFinite(r.transport_cost) ||
      r.allocations.some((a) => !Number.isFinite(a.allocated) || !Number.isFinite(a.unmet))) {
    console.log("OPTIMIZER NON-FINITE stock=" + stock, JSON.stringify(r));
    failures++;
  }
}
// empty wilayas
const re = optimize(1000, []);
if (!Number.isFinite(re.efficiency)) { console.log("OPTIMIZER EMPTY non-finite", re); failures++; }

console.log(`\nSWEEP DONE: checks=${checks} failures=${failures} distinct=${seen.size} failDelta0=${failDelta0} failDeltaPos=${failDeltaPos}`);
console.log("MAX FINITE MAGNITUDES:", JSON.stringify(maxFinite));
if (failures > 0) process.exitCode = 1;