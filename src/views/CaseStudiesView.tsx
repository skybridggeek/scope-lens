import { SectionTitle, useFmt } from "../components/controls";
import { CASES, pickText, productName } from "../data";
import { useI18n } from "../i18n";
import { useSim } from "../state/SimContext";

export default function CaseStudiesView() {
  const { t, lang } = useI18n();
  const fmt = useFmt();
  const sim = useSim();

  return (
    <div className="p-6 space-y-4">
      <p className="text-sm text-slate2 max-w-3xl">{t("cases.intro")}</p>

      {CASES.map((c) => {
        const facts = c.facts.map((f) => ({ text: pickText(f.text, lang), status: f.status }));

        return (
          <div key={c.id} className="card p-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="text-xs text-muted mb-1">
                  {pickText(c.date, lang)} · {c.focus ? pickText(c.focus, lang) : `${t("cases.focusPrefix")}${productName(c.productId, lang)}`}
                </div>
                <SectionTitle>{pickText(c.title, lang)}</SectionTitle>
              </div>
              <button
                className="btn-primary"
                onClick={() => {
                  sim.setCommodity(c.productId);
                  // Defer loadCase one tick so the commodity reset (which
                  // clears overrides) lands first.
                  setTimeout(() => sim.loadCase({ calibration: c.calibration, policy: c.policy }), 0);
                }}
              >
                {t("cases.loadButton")}
              </button>
            </div>

            <p className="text-sm text-slate2 max-w-3xl mb-4">{pickText(c.body, lang)}</p>

            <div className="flex flex-wrap gap-2">
              {facts.map((f) => (
                <span
                  key={f.text}
                  className={`inline-flex items-center gap-1.5 rounded-input px-2 py-1 text-xs font-medium ${
                    f.status === "verified" ? "bg-teal/10 text-teal" : "bg-amber/10 text-amber"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${f.status === "verified" ? "bg-teal" : "bg-amber"}`} />
                  {f.text}
                  <span className="opacity-70">· {t(`cases.status${f.status === "verified" ? "Verified" : "Press"}`)}</span>
                </span>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 text-xs text-slate2">
              <div className="bg-canvas border border-hairline rounded-card p-2">
                <span className="text-muted">P* </span>
                <span className="font-mono">{fmt(c.calibration.p0)} {t("units.dzdKg")}</span>
              </div>
              <div className="bg-canvas border border-hairline rounded-card p-2">
                <span className="text-muted">{t("sim.ceilingRetail")} </span>
                <span className="font-mono">{fmt(c.policy.p_c_retail ?? 0)} {t("units.dzdKg")}</span>
              </div>
              <div className="bg-canvas border border-hairline rounded-card p-2">
                <span className="text-muted">{t("sim.monitoring")} </span>
                <span className="font-mono">μ = {c.policy.mu.toFixed(2)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}