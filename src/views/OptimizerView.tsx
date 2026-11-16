import { useEffect, useState } from "react";
import { api } from "../api";
import { AnimatedNumber, SectionTitle, Slider, useFmt } from "../components/controls";
import { wilayaName } from "../data";
import { useI18n } from "../i18n";
import type { OptimizationResult, WilayaInput } from "../types";

export default function OptimizerView() {
  const { t, lang } = useI18n();
  const fmt = useFmt();
  const [wilayas, setWilayas] = useState<WilayaInput[]>([]);
  const [stock, setStock] = useState(15000);
  const [result, setResult] = useState<OptimizationResult | null>(null);

  useEffect(() => {
    api.getWilayas().then(setWilayas);
  }, []);

  useEffect(() => {
    if (wilayas.length === 0) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      api.optimizeWilayas(stock, wilayas).then((r) => !cancelled && setResult(r));
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [stock, wilayas]);

  const totalDeficit = wilayas.reduce((s, w) => s + w.deficit, 0);
  const totalAllocated = result?.allocations.reduce((s, a) => s + a.allocated, 0) ?? 0;

  return (
    <div className="p-6 space-y-4">
      <div className="card p-4">
        <SectionTitle>{t("opt.wilayaTableTitle")}</SectionTitle>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-xs text-slate2">
              <th className="text-start py-2 px-3 font-medium">{t("opt.colWilaya")}</th>
              <th className="text-end py-2 px-3 font-medium">{t("opt.colDeficit")}</th>
              <th className="text-end py-2 px-3 font-medium">{t("opt.colTransport")}</th>
              <th className="text-end py-2 px-3 font-medium">{t("opt.colPriority")}</th>
            </tr>
          </thead>
          <tbody>
            {wilayas.map((w) => (
              <tr key={w.id} className="border-b border-hairline/60">
                <td className="py-2 px-3">{wilayaName(w.id, lang)}</td>
                <td className="py-2 px-3 text-end font-mono" style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(w.deficit)}</td>
                <td className="py-2 px-3 text-end font-mono" style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(w.transport)}</td>
                <td className="py-2 px-3 text-end font-mono" style={{ fontVariantNumeric: "tabular-nums" }}>{w.priority.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-4 space-y-4">
        <Slider
          label={t("opt.stockBudget")}
          value={stock}
          min={0}
          max={Math.ceil(totalDeficit * 1.1)}
          step={250}
          onChange={setStock}
          display={`${fmt(stock)} ${t("units.tonnes")}`}
        />

        {result && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-canvas rounded-card p-3 border border-hairline">
              <div className="text-xs text-slate2">{t("opt.efficiency")}</div>
              <div className="text-[28px] font-bold text-teal">
                <AnimatedNumber value={result.efficiency * 100} format={(v) => fmt(v, 1)} />
                <span className="text-xs font-medium text-muted ms-1">{t("units.percent")}</span>
              </div>
            </div>
            <div className="bg-canvas rounded-card p-3 border border-hairline">
              <div className="text-xs text-slate2">{t("opt.totalAllocated")}</div>
              <div className="text-[28px] font-bold text-navy">
                <AnimatedNumber value={totalAllocated} format={(v) => fmt(v)} />
                <span className="text-xs font-medium text-muted ms-1">{t("units.tonnes")}</span>
              </div>
            </div>
            <div className="bg-canvas rounded-card p-3 border border-hairline">
              <div className="text-xs text-slate2">{t("opt.transportCost")}</div>
              <div className="text-[28px] font-bold text-navy">
                <AnimatedNumber value={result.transport_cost} format={(v) => fmt(v, 2)} />
                <span className="text-xs font-medium text-muted ms-1">{t("units.millionDzd")}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {result && (
        <div className="card p-4">
          <SectionTitle>{t("opt.resultTitle")}</SectionTitle>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs text-slate2">
                <th className="text-start py-2 px-3 font-medium">{t("opt.colWilaya")}</th>
                <th className="text-end py-2 px-3 font-medium">{t("opt.colDeficit")}</th>
                <th className="text-end py-2 px-3 font-medium">{t("opt.colAllocated")}</th>
                <th className="text-end py-2 px-3 font-medium">{t("opt.colUnmet")}</th>
                <th className="py-2 px-3 font-medium w-1/3">{t("opt.colAllocated")}</th>
              </tr>
            </thead>
            <tbody>
              {wilayas.map((w) => {
                const a = result.allocations.find((x) => x.id === w.id);
                if (!a) return null;
                const pct = w.deficit > 0 ? (a.allocated / w.deficit) * 100 : 0;
                return (
                  <tr key={w.id} className="border-b border-hairline/60">
                    <td className="py-2 px-3">{wilayaName(w.id, lang)}</td>
                    <td className="py-2 px-3 text-end font-mono" style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(w.deficit)}</td>
                    <td className="py-2 px-3 text-end font-mono text-teal font-medium" style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(a.allocated)}</td>
                    <td className="py-2 px-3 text-end font-mono text-amber" style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(a.unmet)}</td>
                    <td className="py-2 px-3">
                      <div className="h-3 bg-hairline/60 rounded-input overflow-hidden">
                        <div className="h-full bg-teal rounded-input transition-all duration-200" style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-[11px] text-muted mt-3">{t("opt.note")}</p>
        </div>
      )}
    </div>
  );
}
