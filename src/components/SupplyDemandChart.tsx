import { useMemo } from "react";
import { demand, supply } from "../engine";
import { useI18n } from "../i18n";
import type { Calibration, Outcome, Policy } from "../types";

const W = 560;
const H = 380;
const PAD = { l: 56, r: 20, t: 20, b: 44 };

/**
 * Interactive supply/demand/rationing diagram: D(P), S(P), P*, the retail
 * ceiling, the parallel price, the shaded shortage gap and DWL wedge.
 */
export default function SupplyDemandChart({
  cal,
  pol,
  out,
}: {
  cal: Calibration;
  pol: Policy;
  out: Outcome;
}) {
  const { t, lang } = useI18n();
  // SVG text-anchor start/end follow inline direction, which flips in RTL.
  const rtl = lang === "ar";

  const binding = pol.p_c_retail !== null && pol.p_c_retail < out.p_star;

  // Price axis span: cover baseline and parallel price with headroom, but
  // cap extreme parallel prices so the curves stay readable (line clips).
  const pMax = Math.max(out.p_star * 1.15, Math.min(out.p_par, out.p_star * 2.6) * 1.08, 1) || 1;
  const pMin = 0;
  // Quantity span: cover demand at low price, supply and shortage.
  const qMax = useMemo(() => {
    let m = out.q_star * 1.3;
    m = Math.max(m, demand(cal, pMax * 0.35) * 1.05, supply(cal, pMax) * 1.05);
    if (binding) {
      m = Math.max(m, (out.q_reg + out.shortage) * 1.08, demand(cal, pol.p_c_retail!) * 1.08);
    }
    return m || 1;
  }, [cal, out, binding, pMax, pol.p_c_retail]);

  const x = (q: number) => PAD.l + (q / qMax) * (W - PAD.l - PAD.r);
  const y = (p: number) => H - PAD.b - ((p - pMin) / (pMax - pMin)) * (H - PAD.t - PAD.b);
  const yPar = Math.max(y(out.p_par), PAD.t + 2);

  const path = (fn: (p: number) => number) => {
    const pts: string[] = [];
    const n = 60;
    for (let i = 1; i <= n; i++) {
      const p = pMin + ((pMax - pMin) * i) / n;
      const q = fn(p);
      // p → 0 sends constant-elasticity demand to infinity; clamp to the edge.
      const px = Number.isFinite(q) ? Math.min(x(q), W - PAD.r) : W - PAD.r;
      pts.push(`${px.toFixed(1)},${y(p).toFixed(1)}`);
    }
    return pts.join(" ");
  };

  const demandPts = useMemo(() => path((p) => demand(cal, p)), [cal, pMax, qMax]); // eslint-disable-line react-hooks/exhaustive-deps
  const supplyPts = useMemo(() => path((p) => supply(cal, p)), [cal, pMax, qMax]); // eslint-disable-line react-hooks/exhaustive-deps

  const qCeiling = binding ? demand(cal, pol.p_c_retail!) : 0;

  return (
    <div>
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full cursor-crosshair select-none"
      role="img"
      aria-label={t("sim.chartSdTitle")}
    >
      {/* axes */}
      <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke="#94A3B8" strokeWidth="1" />
      <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} stroke="#94A3B8" strokeWidth="1" />
      <text x={W - PAD.r} y={H - PAD.b + 30} textAnchor={rtl ? "start" : "end"} fontSize="11" fill="#475569">
        {t("sim.volume")}
      </text>
      <text x={PAD.l} y={PAD.t - 7} textAnchor={rtl ? "end" : "start"} fontSize="11" fill="#475569">
        {t("sim.price")}
      </text>

      {/* shortage gap shading between Q_reg and Q_demand at the ceiling */}
      {binding && out.shortage > 0 && (
        <polygon
          points={`${x(out.q_reg)},${y(pol.p_c_retail!)} ${x(qCeiling)},${y(pol.p_c_retail!)} ${x(qCeiling)},${y(0)} ${x(out.q_reg)},${y(0)}`}
          fill="#D97706"
          opacity="0.15"
        />
      )}

      {/* DWL wedge between ceiling and parallel price over diverted qty */}
      {binding && out.q_par > 0 && (
        <polygon
          points={`${x(out.q_reg)},${y(pol.p_c_retail!)} ${x(out.q_reg + out.q_par)},${yPar} ${x(out.q_reg)},${yPar}`}
          fill="#DC2626"
          opacity="0.18"
        />
      )}

      {/* equilibrium dot */}
      <circle cx={x(out.q_star)} cy={y(out.p_star)} r="4" fill="#0D9488" />
      <text x={x(out.q_star) + 8} y={y(out.p_star) - 8} fontSize="11" fill="#0D9488" fontFamily="IBM Plex Mono, monospace" style={{ direction: "ltr" }}>
        P*
      </text>

      {/* curves (transition via CSS on opacity; geometry re-renders with sliders) */}
      <polyline points={demandPts} fill="none" stroke="#0F2942" strokeWidth="2" strokeLinejoin="round" style={{ transition: "all 200ms cubic-bezier(0.2,0,0,1)" }} />
      <polyline points={supplyPts} fill="none" stroke="#0D9488" strokeWidth="2" strokeLinejoin="round" style={{ transition: "all 200ms cubic-bezier(0.2,0,0,1)" }} />

      {/* ceiling line */}
      {binding && (
        <>
          <line x1={PAD.l} y1={y(pol.p_c_retail!)} x2={W - PAD.r} y2={y(pol.p_c_retail!)} stroke="#D97706" strokeWidth="1.5" strokeDasharray="6 4" />
          <text x={W - PAD.r - 4} y={y(pol.p_c_retail!) - 6} textAnchor={rtl ? "start" : "end"} fontSize="11" fill="#D97706">
            {t("sim.legendCeiling")}
          </text>
          {/* parallel price line */}
          {out.p_par > pol.p_c_retail! && (
            <>
              <line x1={PAD.l} y1={yPar} x2={W - PAD.r} y2={yPar} stroke="#DC2626" strokeWidth="1.5" strokeDasharray="2 4" />
              <text
                x={PAD.l + 4}
                y={yPar + 14}
                textAnchor={rtl ? "end" : "start"}
                fontSize="11"
                fill="#DC2626"
              >
                {t("sim.legendPPar")}
              </text>
            </>
          )}
          {/* official quantity marker */}
          <line x1={x(out.q_reg)} y1={y(pol.p_c_retail!)} x2={x(out.q_reg)} y2={H - PAD.b} stroke="#D97706" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
        </>
      )}

    </svg>
    <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1.5 px-1 text-[11px]" style={{ color: "#475569" }}>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-[2px] w-5 rounded" style={{ background: "#0F2942" }} />
        {t("sim.legendDemand")}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-[2px] w-5 rounded" style={{ background: "#0D9488" }} />
        {t("sim.legendSupply")}
      </span>
      {binding && (
        <>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-3 rounded-[2px]" style={{ background: "#D97706", opacity: 0.3 }} />
            {t("sim.legendShortage")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-3 rounded-[2px]" style={{ background: "#DC2626", opacity: 0.3 }} />
            {t("sim.legendDwl")}
          </span>
        </>
      )}
    </div>
    </div>
  );
}
