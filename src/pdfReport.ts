import { demand, supply } from "./engine";
import type { Calibration, Outcome, Policy, ScenarioResult } from "./types";

export interface PdfPolyline {
  points: [number, number][];
  color: string;
  width_pt: number;
  dashed: boolean;
}

export interface PdfRect {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

export interface PdfCurveLabel {
  text: string;
  x: number;
  y: number;
  color: string;
}

export interface PdfCurve {
  polylines: PdfPolyline[];
  rects: PdfRect[];
  labels: PdfCurveLabel[];
}

export interface PdfReport {
  dir: string;
  title: string;
  subtitle: string;
  badge: string;
  commodity: string;
  timestamp: string;
  sec1_title: string;
  sec2_title: string;
  sec3_title: string;
  sec4_title: string;
  params: [string, string][];
  outcomes: [string, string][];
  scenario_header: string[];
  scenario_rows: string[][];
  curve: PdfCurve;
  methodology: string;
  elasticity_note: string;
  footer: string;
}

const NAVY = "#0F2942";
const TEAL = "#0D9488";
const AMBER = "#D97706";
const CRIMSON = "#DC2626";

/**
 * Vector snapshot of the supply/demand diagram in normalized chart space
 * (0..1, y up), mirroring SupplyDemandChart.tsx geometry without padding.
 */
export function buildCurve(
  cal: Calibration,
  pol: Policy,
  out: Outcome,
  labels: { demand: string; supply: string; pStar: string; ceiling: string; pPar: string; shortage: string },
): PdfCurve {
  const binding = pol.p_c_retail !== null && pol.p_c_retail < out.p_star;
  // Cap the price axis: an extreme parallel price (e.g. runaway spike) would
  // otherwise squash the whole diagram; the parallel line then clips at the
  // top edge.
  const pMax =
    Math.max(out.p_star * 1.15, Math.min(out.p_par, out.p_star * 2.6) * 1.05, 1) || 1;
  let qMax = Math.max(out.q_star * 1.3, demand(cal, pMax * 0.35) * 1.05, supply(cal, pMax) * 1.05);
  if (binding) {
    qMax = Math.max(qMax, (out.q_reg + out.shortage) * 1.08, demand(cal, pol.p_c_retail!) * 1.08);
  }
  qMax = qMax || 1;

  const X = (q: number) => q / qMax;
  const Y = (p: number) => p / pMax;

  const sample = (fn: (p: number) => number): [number, number][] => {
    const pts: [number, number][] = [];
    const n = 60;
    for (let i = 1; i <= n; i++) {
      const p = (pMax * i) / n;
      const q = fn(p);
      // p → 0 sends constant-elasticity demand to infinity; clamp to the edge.
      pts.push([Number.isFinite(q) ? Math.min(X(q), 1) : 1, Y(p)]);
    }
    return pts;
  };

  const polylines: PdfPolyline[] = [
    { points: sample((p) => demand(cal, p)), color: NAVY, width_pt: 1.6, dashed: false },
    { points: sample((p) => supply(cal, p)), color: TEAL, width_pt: 1.6, dashed: false },
  ];
  const rects: PdfRect[] = [];
  const curveLabels: PdfCurveLabel[] = [
    { text: labels.demand, x: X(demand(cal, pMax * 0.55)) + 0.06, y: Y(pMax * 0.55) + 0.04, color: NAVY },
    { text: labels.supply, x: X(supply(cal, pMax * 0.75)) + 0.08, y: Y(pMax * 0.75) - 0.05, color: TEAL },
    { text: labels.pStar, x: X(out.q_star) + 0.02, y: Y(out.p_star) - 0.07, color: TEAL },
  ];

  if (binding) {
    const pCeil = pol.p_c_retail!;
    polylines.push({
      points: [[0, Y(pCeil)], [1, Y(pCeil)]],
      color: AMBER,
      width_pt: 1.0,
      dashed: true,
    });
    const yCeilLabel = Math.min(Y(pCeil) + 0.04, 0.94);
    curveLabels.push({ text: labels.ceiling, x: 0.88, y: yCeilLabel, color: AMBER });

    if (out.shortage > 0) {
      const qD = demand(cal, pCeil);
      rects.push({ x: X(out.q_reg), y: 0, w: X(qD) - X(out.q_reg), h: Y(pCeil), color: AMBER });
      curveLabels.push({ text: labels.shortage, x: (X(out.q_reg) + X(qD)) / 2, y: Y(pCeil) * 0.45, color: AMBER });
    }
    if (out.p_par > pCeil) {
      const yPPar = Math.min(Y(out.p_par), 0.97);
      polylines.push({
        points: [[0, yPPar], [1, yPPar]],
        color: CRIMSON,
        width_pt: 1.0,
        dashed: true,
      });
      const yParLabel = Math.min(yPPar - 0.05, 0.94);
      // If the two price lines sit close together, move the parallel-price
      // label to the opposite side so the labels never stack.
      const xParLabel = Math.abs(yParLabel - yCeilLabel) < 0.08 ? 0.14 : 0.72;
      curveLabels.push({ text: labels.pPar, x: xParLabel, y: yParLabel, color: CRIMSON });
    }
  }

  return { polylines, rects, labels: curveLabels };
}

/** Four-scenario comparison grid: regimes as columns, metrics as rows. */
export function buildScenarioTable(
  scenarios: ScenarioResult[],
  regimeLabel: (regime: string) => string,
  metricLabels: string[],
  fmt: (v: number, digits?: number) => string,
): { header: string[]; rows: string[][] } {
  const header = ["", ...scenarios.map((s) => regimeLabel(s.regime))];
  const metric = (out: Outcome, i: number): number =>
    [out.q_reg, out.shortage, out.p_par, out.fiscal_cost, out.household_spending_change_pct][i];
  const digits = (i: number): number => (i === 2 || i === 3 || i === 4 ? 1 : 0);
  const rows = metricLabels.map((label, i) => [
    label,
    ...scenarios.map((s) => fmt(metric(s.outcome, i), digits(i))),
  ]);
  return { header, rows };
}
