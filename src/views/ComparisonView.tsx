import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { AnimatedNumber, SectionTitle, useFmt } from "../components/controls";
import { productName } from "../data";
import { useI18n } from "../i18n";
import { useSim } from "../state/SimContext";
import type { ScenarioResult } from "../types";

type MetricKey = "q_reg" | "shortage" | "p_par" | "fiscal_cost" | "household_spending_change_pct" | "theta" | "p_avg" | "dwl";

const METRICS: Array<{ key: MetricKey; i18n: string; digits: number; lowerIsBetter: boolean }> = [
  { key: "q_reg", i18n: "cmp.metricQReg", digits: 0, lowerIsBetter: false },
  { key: "shortage", i18n: "cmp.metricShortage", digits: 0, lowerIsBetter: true },
  { key: "p_par", i18n: "cmp.metricPPar", digits: 0, lowerIsBetter: true },
  { key: "fiscal_cost", i18n: "cmp.metricFiscal", digits: 1, lowerIsBetter: true },
  { key: "household_spending_change_pct", i18n: "cmp.metricSpending", digits: 1, lowerIsBetter: true },
  { key: "theta", i18n: "cmp.metricTheta", digits: 2, lowerIsBetter: true },
  { key: "p_avg", i18n: "cmp.metricPAvg", digits: 0, lowerIsBetter: true },
  { key: "dwl", i18n: "cmp.metricDwl", digits: 1, lowerIsBetter: true },
];

export default function ComparisonView() {
  const { t, lang } = useI18n();
  const fmt = useFmt();
  const sim = useSim();
  const { calibration: cal, policy } = sim;
  const [rows, setRows] = useState<ScenarioResult[]>([]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      api.compareScenarios(cal, policy).then((r) => !cancelled && setRows(r));
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cal, policy]);

  // Best/worst regime index per metric.
  const extremes = useMemo(() => {
    const map = new Map<MetricKey, { best: number; worst: number }>();
    for (const m of METRICS) {
      if (rows.length === 0) continue;
      const vals = rows.map((r) => r.outcome[m.key]);
      const bestIdx = vals.indexOf(m.lowerIsBetter ? Math.min(...vals) : Math.max(...vals));
      const worstIdx = vals.indexOf(m.lowerIsBetter ? Math.max(...vals) : Math.min(...vals));
      map.set(m.key, { best: bestIdx, worst: worstIdx });
    }
    return map;
  }, [rows]);

  return (
    <div className="p-6 space-y-4">
      <div className="card p-4 overflow-x-auto">
        <SectionTitle>{t("cmp.matrixTitle")}</SectionTitle>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline">
              <th className="text-start py-2 px-3 text-xs font-semibold text-slate2">{t("sim.product")}: {productName(sim.commodityId, lang)}</th>
              {rows.map((r) => (
                <th key={r.regime} className="py-2 px-3 text-xs font-semibold text-navy text-center">
                  {t(`cmp.regimes.${r.regime}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRICS.map((m) => {
              const ex = extremes.get(m.key);
              return (
                <tr key={m.key} className="border-b border-hairline/60">
                  <td className="py-2 px-3 text-slate2">{t(m.i18n)}</td>
                  {rows.map((r, i) => {
                    const isBest = ex?.best === i && rows.length > 1;
                    const isWorst = ex?.worst === i && rows.length > 1;
                    return (
                      <td
                        key={r.regime}
                        className={`py-2 px-3 text-center font-mono ${isBest ? "bg-teal/10 text-teal font-semibold" : isWorst ? "bg-crimson/10 text-crimson" : "text-ink"}`}
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        <AnimatedNumber value={r.outcome[m.key]} format={(v) => fmt(v, m.digits)} />
                        {isBest && <span className="block text-[10px] font-sans">{t("cmp.best")}</span>}
                        {isWorst && <span className="block text-[10px] font-sans">{t("cmp.worst")}</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card p-4">
        <SectionTitle>{t("cmp.chartTitle")}</SectionTitle>
        <GroupedBars rows={rows} fmt={fmt} t={t} />
      </div>
    </div>
  );
}

function GroupedBars({
  rows,
  fmt,
  t,
}: {
  rows: ScenarioResult[];
  fmt: (v: number, d?: number) => string;
  t: (k: string) => string;
}) {
  const series = [
    { key: "fiscal_cost" as MetricKey, label: t("cmp.fiscalBar"), color: "#0F2942" },
    { key: "shortage" as MetricKey, label: t("cmp.shortageBar"), color: "#D97706" },
    { key: "p_par" as MetricKey, label: t("cmp.pParBar"), color: "#DC2626" },
  ];
  const max = Math.max(...rows.flatMap((r) => series.map((s) => r.outcome[s.key])), 1);

  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <div key={r.regime} className="grid grid-cols-12 items-center gap-2">
          <span className="col-span-3 text-xs font-medium text-slate2 truncate">{t(`cmp.regimes.${r.regime}`)}</span>
          <div className="col-span-9 flex items-center gap-3">
            {series.map((s) => (
              <div key={s.key} className="flex-1">
                <div className="h-4 bg-hairline/60 rounded-input overflow-hidden">
                  <div
                    className="h-full rounded-input transition-all duration-200"
                    style={{ width: `${Math.max(0.5, (r.outcome[s.key] / max) * 100)}%`, backgroundColor: s.color }}
                  />
                </div>
                <div className="text-[10px] text-muted mt-0.5 font-mono" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {s.label}: {fmt(r.outcome[s.key], 1)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
