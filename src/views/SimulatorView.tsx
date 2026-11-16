import { useEffect, useState } from "react";
import ChannelBars from "../components/ChannelBars";
import { KpiValue, SectionTitle, Slider, useFmt } from "../components/controls";
import SupplyDemandChart from "../components/SupplyDemandChart";
import TornadoChart from "../components/TornadoChart";
import { productName } from "../data";
import { useI18n } from "../i18n";
import { useSim } from "../state/SimContext";

export default function SimulatorView() {
  const { t, lang } = useI18n();
  const fmt = useFmt();
  const sim = useSim();
  const { calibration: cal, policy, outcome: out, commodities, commodityId } = sim;
  const [drawerOpen, setDrawerOpen] = useState(false);

  const preset = commodities.find((c) => c.id === commodityId);
  const ceilingOn = policy.p_c_retail !== null;

  // Ceiling bounds must stay ordered even when cost is high relative to P*
  // (c0*0.5 can otherwise exceed p0*1.2, giving min > max and a dead slider).
  // Bounds are integers so the step=1 grid aligns with min: a fractional min
  // (c0*0.5 with odd c0) offsets the browser's step grid half a step from the
  // stored integer value, making the thumb snap/fight the drag ("stuck").
  const ceilMax = Math.round(cal.p0 * 1.2);
  const ceilMin = Math.max(1, Math.min(Math.floor(cal.c0 * 0.5), ceilMax - 1));
  useEffect(() => {
    if (policy.p_c_retail !== null && (policy.p_c_retail < ceilMin || policy.p_c_retail > ceilMax)) {
      sim.setPolicy({ p_c_retail: Math.round(Math.min(ceilMax, Math.max(ceilMin, policy.p_c_retail))) });
    }
  }, [ceilMin, ceilMax, policy.p_c_retail]); // eslint-disable-line react-hooks/exhaustive-deps

  const kpis = [
    { label: t("sim.kpiQReg"), value: out.q_reg, unit: t("units.tonnes"), digits: 0, color: "text-ink" },
    { label: t("sim.kpiShortage"), value: out.shortage, unit: t("units.tonnes"), digits: 0, color: out.shortage > 0 ? "text-amber" : "text-teal" },
    { label: t("sim.kpiPPar"), value: out.p_par, unit: t("units.dzdKg"), digits: 0, color: out.p_par > out.p_star ? "text-crimson" : "text-ink" },
    { label: t("sim.kpiFiscal"), value: out.fiscal_cost, unit: t("units.millionDzd"), digits: 1, color: "text-ink" },
    { label: t("sim.kpiSpending"), value: out.household_spending_change_pct, unit: t("units.percent"), digits: 1, color: out.household_spending_change_pct > 0 ? "text-crimson" : "text-teal" },
  ];

  const calFields: Array<{ key: keyof typeof cal; label: string; step: number }> = [
    { key: "eps_d", label: t("sim.epsD"), step: 0.01 },
    { key: "eps_s", label: t("sim.epsS"), step: 0.01 },
    { key: "c0", label: t("sim.c0"), step: 1 },
    { key: "m0", label: t("sim.m0"), step: 0.01 },
    { key: "alpha", label: t("sim.alpha"), step: 0.1 },
    { key: "beta", label: t("sim.beta"), step: 0.1 },
    { key: "delta", label: t("sim.delta"), step: 10 },
    { key: "kappa", label: t("sim.kappa"), step: 0.01 },
  ];

  return (
    <div className="p-6 grid grid-cols-12 gap-4">
      {/* Control panel */}
      <aside className="col-span-3 space-y-4">
        <div className="card p-4 space-y-4">
          <SectionTitle>{t("sim.controlsTitle")}</SectionTitle>

          <label className="block">
            <span className="text-xs font-medium text-slate2">{t("sim.product")}</span>
            <select
              className="mt-1 w-full rounded-input border border-hairline px-2 py-1.5 text-sm bg-white cursor-pointer"
              value={commodityId}
              onChange={(e) => sim.setCommodity(e.target.value)}
            >
              {commodities.map((c) => (
                <option key={c.id} value={c.id}>
                  {productName(c.id, lang)}
                </option>
              ))}
            </select>
          </label>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-slate2">{t("sim.ceilingRetail")}</span>
              <label className="flex items-center gap-1.5 text-xs text-slate2 cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-teal cursor-pointer"
                  checked={ceilingOn}
                  onChange={(e) => sim.setPolicy({ p_c_retail: e.target.checked ? (preset?.suggested_retail_ceiling ?? cal.p0 * 0.8) : null })}
                />
                {ceilingOn ? undefined : t("sim.noCeiling")}
              </label>
            </div>
            {ceilingOn && (
              <input
                type="range"
                className="w-full cursor-ew-resize accent-amber"
                min={ceilMin}
                max={ceilMax}
                step={1}
                value={policy.p_c_retail ?? 0}
                onChange={(e) => sim.setPolicy({ p_c_retail: Number(e.target.value) })}
              />
            )}
            <div className="font-mono text-xs text-ink mt-0.5" style={{ fontVariantNumeric: "tabular-nums" }}>
              {ceilingOn ? `${fmt(policy.p_c_retail!)} ${t("units.dzdKg")}` : `P* = ${fmt(out.p_star)} ${t("units.dzdKg")}`}
            </div>
          </div>

          <Slider
            label={t("sim.subsidy")}
            value={policy.subsidy}
            min={0}
            max={Math.max(10, cal.p0 * 0.5)}
            step={1}
            onChange={(v) => sim.setPolicy({ subsidy: v })}
            display={`${fmt(policy.subsidy)} ${t("units.dzdKg")}`}
          />
          <Slider
            label={t("sim.stockRelease")}
            value={policy.stock_release}
            min={0}
            max={Math.max(1000, cal.q0 * 0.5)}
            step={100}
            onChange={(v) => sim.setPolicy({ stock_release: v })}
            display={`${fmt(policy.stock_release)} ${t("units.tonnes")}`}
          />
          <Slider
            label={t("sim.monitoring")}
            value={policy.mu}
            min={0.05}
            max={0.95}
            step={0.05}
            onChange={(v) => sim.setPolicy({ mu: v })}
            display={policy.mu.toFixed(2)}
            hint={`${t("sim.monitoringWeak")} ←→ ${t("sim.monitoringStrict")}`}
          />

          <div>
            <div className="text-xs font-medium text-slate2 mb-2">{t("sim.presetsTitle")}</div>
            <div className="grid grid-cols-1 gap-1.5">
              <button className="btn-ghost border border-hairline text-start" onClick={() => sim.applyPreset({ p_c_retail: null, subsidy: 0, stock_release: 0, mu: 0.5 })}>
                {t("sim.preset1")}
              </button>
              <button className="btn-ghost border border-hairline text-start" onClick={() => sim.applyPreset({ p_c_retail: preset?.suggested_retail_ceiling ?? cal.p0 * 0.8, subsidy: 0, stock_release: 0, mu: 0.3 })}>
                {t("sim.preset2")}
              </button>
              <button className="btn-ghost border border-hairline text-start" onClick={() => sim.applyPreset({ p_c_retail: preset?.suggested_retail_ceiling ?? cal.p0 * 0.8, subsidy: 0, stock_release: preset?.suggested_stock_release ?? 0, mu: 0.5 })}>
                {t("sim.preset3")}
              </button>
              <button className="btn-ghost border border-hairline text-start" onClick={() => sim.applyPreset({ p_c_retail: null, subsidy: preset?.suggested_subsidy ?? 10, stock_release: 0, mu: 0.5 })}>
                {t("sim.preset4")}
              </button>
            </div>
          </div>

          <button className="btn-ghost border border-hairline w-full text-start" onClick={() => setDrawerOpen(!drawerOpen)}>
            {drawerOpen ? "▾" : "▸"} {t("sim.calibrationTitle")}
          </button>
          {drawerOpen && (
            <div className="space-y-3 border-t border-hairline pt-3">
              {preset && (
                <p className="text-[11px] text-muted">
                  {t("sim.suggested")}: P₀={fmt(preset.calibration.p0)}, Q₀={fmt(preset.calibration.q0)} {t("units.tonnes")}
                </p>
              )}
              {calFields.map((f) => (
                <Slider
                  key={f.key}
                  label={f.label}
                  value={cal[f.key]}
                  min={f.key === "eps_d" ? -2 : f.key === "eps_s" ? 0.02 : f.key === "delta" ? 10 : 0}
                  max={f.key === "eps_d" ? -0.02 : f.key === "eps_s" ? 2 : f.key === "m0" ? 1 : f.key === "kappa" ? 1 : f.key === "delta" ? 5000 : 500}
                  step={f.step}
                  onChange={(v) => sim.setCalibration({ [f.key]: v })}
                  display={f.key.startsWith("eps") ? v_eps(cal[f.key]) : String(cal[f.key])}
                />
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* KPI strip + charts */}
      <div className="col-span-9 space-y-4">
        <div className="grid grid-cols-5 gap-3">
          {kpis.map((k) => (
            <div key={k.label} className="card p-3">
              <div className="text-xs text-slate2 mb-1">{k.label}</div>
              <KpiValue value={k.value} digits={k.digits} unit={k.unit} color={k.color} />
            </div>
          ))}
        </div>

        <div className="card p-4">
          <SectionTitle>{t("sim.chartSdTitle")}</SectionTitle>
          <SupplyDemandChart cal={cal} pol={policy} out={out} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="card p-4">
            <SectionTitle>{t("sim.chartChannelTitle")}</SectionTitle>
            <ChannelBars out={out} />
          </div>
          <div className="card p-4">
            <SectionTitle>{t("sim.chartTornadoTitle")}</SectionTitle>
            <TornadoChart cal={cal} pol={policy} />
          </div>
        </div>
      </div>
    </div>
  );
}

function v_eps(v: number): string {
  return v.toFixed(2);
}
