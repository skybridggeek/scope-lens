import { useEffect, useState } from "react";
import { api } from "../api";
import { useI18n } from "../i18n";
import { useFmt } from "./controls";
import type { Calibration, Policy, SensitivityRow } from "../types";

type MetricKey = "shortage" | "p_par";

/**
 * Tornado/fan chart: for each deep parameter (eps_d, eps_s), the spread of
 * shortage and parallel price across the low/base/high calibration bounds.
 */
export default function TornadoChart({
  cal,
  pol,
}: {
  cal: Calibration;
  pol: Policy;
}) {
  const { t } = useI18n();
  const fmt = useFmt();
  const [rows, setRows] = useState<SensitivityRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      api.sensitivity(cal, pol).then((r) => !cancelled && setRows(r));
    }, 120); // debounce slider-driven recomputation
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cal, pol]);

  const panels: Array<{ metric: MetricKey; title: string; color: string }> = [
    { metric: "shortage", title: t("sim.tornadoShortage"), color: "#D97706" },
    { metric: "p_par", title: t("sim.tornadoPPar"), color: "#DC2626" },
  ];

  return (
    <div className="space-y-6">
      {panels.map(({ metric, title, color }) => {
        // Global scale across all rows for this metric.
        const vals = rows.flatMap((r) => [r.low[metric], r.base[metric], r.high[metric]]);
        if (vals.length === 0) return null;
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        const span = max - min || 1;
        const scale = (v: number) => ((v - min) / span) * 100;

        return (
          <div key={metric}>
            <div className="text-xs font-medium text-slate2 mb-2">{title}</div>
            <div className="space-y-2">
              {rows.map((row) => {
                const lo = Math.min(row.low[metric], row.high[metric]);
                const hi = Math.max(row.low[metric], row.high[metric]);
                const lowLabel = row.parameter === "eps_d" ? `${t("meth.vars.eps_d")} ±40%` : `${t("meth.vars.eps_s")} ±40%`;
                return (
                  <div key={row.parameter} className="flex items-center gap-2">
                    <span className="w-40 text-[11px] text-slate2 truncate" title={lowLabel}>
                      {lowLabel}
                    </span>
                    <div className="relative flex-1 h-4 bg-hairline/50 rounded-input">
                      <div
                        className="absolute h-full rounded-input opacity-70"
                        style={{
                          left: `${scale(lo)}%`,
                          width: `${Math.max(1, scale(hi) - scale(lo))}%`,
                          backgroundColor: color,
                        }}
                      />
                      <div
                        className="absolute top-[-2px] bottom-[-2px] w-[2px] bg-navy"
                        style={{ left: `${scale(row.base[metric])}%` }}
                        title={`${fmt(row.base[metric], 1)}`}
                      />
                    </div>
                    <span className="font-mono text-[11px] w-32 text-end text-slate2" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {fmt(lo, 0)}–{fmt(hi, 0)}
                    </span>
                  </div>
                );
              })}
              {rows.length === 0 && <div className="text-xs text-muted">…</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
