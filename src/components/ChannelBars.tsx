import { useI18n } from "../i18n";
import { useFmt } from "./controls";
import type { Outcome } from "../types";

/** Volume + price split between the official and parallel channels. */
export default function ChannelBars({ out }: { out: Outcome }) {
  const { t } = useI18n();
  const fmt = useFmt();

  // Official-channel price: implied from the volume-weighted average
  // (equals the ceiling when binding, P* otherwise). Parallel price is
  // reported directly by the engine.
  const totalQ = out.q_reg + out.q_par;
  const officialPrice =
    out.q_reg > 0 && out.q_par > 0
      ? (out.p_avg * totalQ - out.q_par * out.p_par) / out.q_reg
      : out.q_reg > 0
        ? out.p_star
        : 0;

  const groups = [
    {
      label: t("sim.volume"),
      bars: [
        { name: t("sim.regChannel"), value: out.q_reg, color: "#0D9488" },
        { name: t("sim.parChannel"), value: out.q_par, color: "#DC2626" },
      ],
      unit: t("units.tonnes"),
    },
    {
      label: t("sim.price"),
      bars: [
        { name: t("sim.regChannel"), value: officialPrice, color: "#0D9488" },
        { name: t("sim.parChannel"), value: out.p_par, color: "#DC2626" },
      ],
      unit: t("units.dzdKg"),
    },
  ];

  const maxValue = Math.max(...groups.flatMap((g) => g.bars.map((b) => b.value)), 1);

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="text-xs font-medium text-slate2 mb-2">{g.label}</div>
          <div className="space-y-2">
            {g.bars.map((b) => (
              <div key={b.name} className="flex items-center gap-2">
                <span className="w-28 text-xs text-slate2 truncate">{b.name}</span>
                <div className="flex-1 h-5 bg-hairline/60 rounded-input overflow-hidden">
                  <div
                    className="h-full rounded-input transition-all duration-200"
                    style={{ width: `${Math.max(0.5, (b.value / maxValue) * 100)}%`, backgroundColor: b.color }}
                  />
                </div>
                <span className="font-mono text-xs w-24 text-end" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {fmt(b.value, b.value < 100 ? 1 : 0)} {g.unit}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="text-[11px] text-muted">
        {t("sim.regChannel")}: {fmt(out.q_reg)} {t("units.tonnes")} · {t("sim.parChannel")}:{" "}
        {fmt(out.q_par)} {t("units.tonnes")} · θ = {out.theta.toFixed(2)}
      </p>
    </div>
  );
}
