// Generates realistic PdfReport payloads exactly as the frontend would
// (src/useExportPdf.ts + src/pdfReport.ts) for contract testing in Rust.
// Run: npx esbuild scripts/gen-pdf-fixture.mts --bundle --format=esm --outfile=scripts/gen-pdf-fixture.bundle.mjs && node scripts/gen-pdf-fixture.bundle.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { productName } from "../src/data";
import { COMMODITY_PRESETS, compareScenarios, simulate } from "../src/engine";
import { buildCurve, buildScenarioTable } from "../src/pdfReport";
import type { Calibration, Policy } from "../src/types";

const dict: any = {
  ar: JSON.parse(readFileSync(new URL("../src/i18n/ar.json", import.meta.url), "utf8")),
  fr: JSON.parse(readFileSync(new URL("../src/i18n/fr.json", import.meta.url), "utf8")),
};

function build(lang: "ar" | "fr", cal: Calibration, policy: Policy, commodityId: string) {
  const t = (key: string): string => key.split(".").reduce((o: any, k) => o?.[k], dict[lang]) ?? key;
  // Mirror of useFmt (src/components/controls.tsx): compact notation for
  // extreme magnitudes so the fixtures exercise the same strings the app emits.
  const fmt = (v: number, maxDigits = 0) => {
    if (!Number.isFinite(v)) return "—";
    const compact = Math.abs(v) >= 100_000;
    return new Intl.NumberFormat(lang === "ar" ? "ar-DZ" : lang, {
      maximumFractionDigits: compact ? 1 : maxDigits,
      minimumFractionDigits: 0,
      notation: compact ? "compact" : "standard",
    }).format(v);
  };
  const out = simulate(cal, policy);
  const scenarios = compareScenarios(cal, policy);

  const dzd = (v: number, d = 0) => `${fmt(v, d)} ${t("units.dzdKg")}`;
  const tonnes = (v: number) => `${fmt(v)} ${t("units.tonnes")}`;
  const sign = (v: number) => (v > 0 ? "+" : "") + fmt(v, 1);

  const params: [string, string][] = [
    [t("sim.ceilingRetail"), policy.p_c_retail !== null ? dzd(policy.p_c_retail) : t("sim.noCeiling")],
    [t("sim.ceilingProducer"), policy.p_c_producer !== null ? dzd(policy.p_c_producer) : t("sim.noCeiling")],
    [t("sim.subsidy"), dzd(policy.subsidy)],
    [t("sim.stockRelease"), tonnes(policy.stock_release)],
    [t("pdf.mu"), fmt(policy.mu, 2)],
    [t("pdf.p0"), dzd(cal.p0)],
    [t("pdf.q0"), tonnes(cal.q0)],
    [t("pdf.epsD"), fmt(cal.eps_d, 2)],
    [t("pdf.epsS"), fmt(cal.eps_s, 2)],
    [t("pdf.c0"), dzd(cal.c0)],
    [t("pdf.m0"), fmt(cal.m0, 2)],
  ];
  const outcomes: [string, string][] = [
    [t("sim.kpiQReg"), tonnes(out.q_reg)],
    [t("sim.kpiShortage"), tonnes(out.shortage)],
    [t("sim.kpiPPar"), dzd(out.p_par, 1)],
    [t("sim.kpiFiscal"), `${fmt(out.fiscal_cost, 1)} ${t("units.millionDzd")}`],
    [t("sim.kpiSpending"), `${sign(out.household_spending_change_pct)} ${t("units.percent")}`],
  ];

  const table = buildScenarioTable(
    scenarios,
    (r) => t(`cmp.regimes.${r}`),
    [t("cmp.metricQReg"), t("cmp.metricShortage"), t("cmp.metricPPar"), t("cmp.metricFiscal"), t("cmp.metricSpending")],
    fmt,
  );
  const curve = buildCurve(cal, policy, out, {
    demand: t("sim.legendDemand"),
    supply: t("sim.legendSupply"),
    pStar: "P*",
    ceiling: t("sim.legendCeiling"),
    pPar: t("sim.legendPPar"),
    shortage: t("sim.legendShortage"),
  });

  return {
    dir: lang === "ar" ? "rtl" : "ltr",
    title: `${t("app.name")} — ${t("pdf.sec1")}`,
    subtitle: t("app.subtitle"),
    badge: t("app.badge"),
    commodity: productName(commodityId, lang),
    timestamp: "2026-11-15 18:00",
    sec1_title: t("pdf.sec1"),
    sec2_title: t("pdf.sec2"),
    sec3_title: t("pdf.sec3"),
    sec4_title: t("pdf.sec4"),
    params,
    outcomes,
    scenario_header: table.header,
    scenario_rows: table.rows,
    curve,
    methodology: t("pdf.methodology"),
    elasticity_note: t("meth.elasticityNote"),
    footer: `${t("app.name")} — ${t("app.badge")}`,
  };
}

// Mirror of the pdfSafe sanitizer in src/useExportPdf.ts.
const FIXES: Record<string, string> = {
  "−": "-",
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
  "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
};
const sanitize = (v: any): any =>
  typeof v === "string"
    ? v
        .replace(/[−₀-₉]/g, (ch) => FIXES[ch] ?? ch)
        .replace(/[\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/g, "")
        .replace(/[\u00a0\u202f]/g, " ")
    : Array.isArray(v)
      ? v.map(sanitize)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sanitize(x)]))
        : v;

const potatoes = COMMODITY_PRESETS[0];
const normalPolicy: Policy = {
  p_c_retail: potatoes.suggested_retail_ceiling,
  p_c_producer: potatoes.suggested_producer_ceiling || null,
  subsidy: potatoes.suggested_subsidy,
  stock_release: potatoes.suggested_stock_release,
  mu: 0.5,
  c_stock: 0.05,
  c_enf: 200.0,
};

// Extreme case: near-inelastic demand + zero cost drives the parallel price
// to the safety clamp (compact "1 مليون" / "1 M") and spending to ~−99%.
const extremeCal: Calibration = {
  ...potatoes.calibration,
  eps_d: -0.02, eps_s: 0.02, c0: 0, m0: 0, alpha: 500, beta: 0.1, delta: 10, kappa: 1,
};
const extremePolicy: Policy = {
  p_c_retail: 1, p_c_producer: null, subsidy: 0, stock_release: 0, mu: 0.05, c_stock: 0.05, c_enf: 200,
};

const write = (name: string, report: any) =>
  writeFileSync(new URL(`../src-tauri/tests/fixtures/${name}`, import.meta.url), JSON.stringify(sanitize(report), null, 1));

for (const lang of ["ar", "fr"] as const) {
  write(`report-${lang}.json`, build(lang, potatoes.calibration, normalPolicy, "potatoes"));
  write(`report-${lang}-extreme.json`, build(lang, extremeCal, extremePolicy, "potatoes"));
}
console.log("fixtures written (normal + extreme, ar + fr)");