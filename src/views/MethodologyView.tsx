import katex from "katex";
import "katex/dist/katex.min.css";
import { useMemo } from "react";
import { SectionTitle } from "../components/controls";
import { useI18n } from "../i18n";

function TeX({ math, block = true }: { math: string; block?: boolean }) {
  const html = useMemo(
    () => katex.renderToString(math, { throwOnError: false, displayMode: block }),
    [math, block],
  );
  return <div dir="ltr" className={block ? "my-3 overflow-x-auto text-center" : "inline-block"} dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function MethodologyView() {
  const { t } = useI18n();

  const sections = [
    {
      title: t("meth.secEquilibrium"),
      note: t("meth.noteEquilibrium"),
      math: String.raw`Q_d(P) = Q_0 \left(\frac{P}{P_0}\right)^{\varepsilon_d}, \qquad Q_s(P) = Q_0 \left(\frac{P}{P_0}\right)^{\varepsilon_s}`,
      math2: String.raw`P_{\text{eff}} = \min\!\left(P^*,\, P_{c,\text{ret}}\right) + S, \qquad Q_{\text{total}} = Q_s(P_{\text{eff}}) + \Delta Q_{\text{stock}}`,
    },
    {
      title: t("meth.secRationing"),
      note: t("meth.noteRationing"),
      math: String.raw`\theta = 1 - \exp\!\left( -\alpha \cdot \frac{\max\!\left(0,\; C_0(1+m_0) - P_{c,\text{ret}}\right)}{C_0} \cdot (1-\mu)^{\beta} \right)`,
      math2: String.raw`Q_{\text{reg}} = (1-\theta)\, Q_{\text{total}}, \qquad \Delta Q_{\text{shortage}} = \max\!\left(0,\; Q_d(P_{c,\text{ret}}) - Q_{\text{reg}}\right)`,
    },
    {
      title: t("meth.secParallel"),
      note: t("meth.noteParallel"),
      math: String.raw`P_{\text{par}} = P_{c,\text{ret}} \cdot \left(1 + \frac{\Delta Q_{\text{shortage}}}{Q_{\text{par}} + \delta}\right)^{\frac{1}{|\varepsilon_d|}} \cdot \left(1 + \kappa\,\mu\right)`,
      math2: String.raw`Q_{\text{par}} = \theta \, Q_{\text{total}}`,
    },
    {
      title: t("meth.secWelfare"),
      note: t("meth.noteWelfare"),
      math: String.raw`G = S \cdot Q_{\text{total}} + c_{\text{stock}} \cdot \Delta Q_{\text{stock}} + c_{\text{enf}} \cdot \mu^{2}`,
      math2: String.raw`P_{\text{avg}} = \frac{Q_{\text{reg}} \cdot P_{c,\text{ret}} + Q_{\text{par}} \cdot P_{\text{par}}}{Q_{\text{reg}} + Q_{\text{par}}}, \qquad DWL = \tfrac{1}{2}\,(P_{\text{par}} - P_c)\,\Delta Q_{\text{shortage}} + (P_{\text{par}} - P_c)\,Q_{\text{par}}`,
    },
  ];

  const vars: Array<{ sym: string; i18n: string; unit: string }> = [
    { sym: "P_0", i18n: "meth.vars.p0", unit: "DZD/kg" },
    { sym: "Q_0", i18n: "meth.vars.q0", unit: "t" },
    { sym: "\\varepsilon_d", i18n: "meth.vars.eps_d", unit: "—" },
    { sym: "\\varepsilon_s", i18n: "meth.vars.eps_s", unit: "—" },
    { sym: "C_0", i18n: "meth.vars.c0", unit: "DZD/kg" },
    { sym: "m_0", i18n: "meth.vars.m0", unit: "—" },
    { sym: "\\mu", i18n: "meth.vars.mu", unit: "[0, 1]" },
    { sym: "\\theta", i18n: "meth.vars.theta", unit: "[0, 1]" },
    { sym: "\\Delta Q_{\\text{stock}}", i18n: "meth.vars.stock", unit: "t" },
    { sym: "S", i18n: "meth.vars.subsidy", unit: "DZD/kg" },
  ];

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <p className="text-sm text-slate2">{t("meth.intro")}</p>

      {sections.map((s) => (
        <div key={s.title} className="card p-5">
          <SectionTitle>{s.title}</SectionTitle>
          <p className="text-sm text-slate2 mb-2">{s.note}</p>
          <TeX math={s.math} />
          <TeX math={s.math2} />
        </div>
      ))}

      <div className="card p-5">
        <SectionTitle>{t("meth.varsTitle")}</SectionTitle>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-xs text-slate2">
              <th className="text-start py-2 px-3 font-medium">{t("meth.colSymbol")}</th>
              <th className="text-start py-2 px-3 font-medium">{t("meth.colMeaning")}</th>
              <th className="text-start py-2 px-3 font-medium">{t("meth.colUnit")}</th>
            </tr>
          </thead>
          <tbody>
            {vars.map((v) => (
              <tr key={v.sym} className="border-b border-hairline/60">
                <td className="py-2 px-3 w-32">
                  <TeX math={v.sym} block={false} />
                </td>
                <td className="py-2 px-3 text-slate2">{t(v.i18n)}</td>
                <td className="py-2 px-3 font-mono text-xs text-muted">{v.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11px] text-muted mt-3">{t("meth.elasticityNote")}</p>
      </div>
    </div>
  );
}
