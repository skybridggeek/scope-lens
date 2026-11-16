import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { useCallback, useState } from "react";
import { api } from "./api";
import { useFmt } from "./components/controls";
import { productName } from "./data";
import { useI18n } from "./i18n";
import { buildCurve, buildScenarioTable, type PdfReport } from "./pdfReport";
import { useSim } from "./state/SimContext";

// IBM Plex Sans Arabic lacks glyphs for the Unicode minus (emitted by
// Intl ar-DZ for negatives) and subscript digits — swap them for ASCII
// equivalents before anything reaches the PDF font.
const PDF_CHAR_FIXES: Record<string, string> = {
  "−": "-",
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
  "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
};

function pdfSafe(s: string): string {
  return s
    .replace(/[−₀-₉]/g, (ch) => PDF_CHAR_FIXES[ch] ?? ch)
    // Zero-width bidi marks (emitted by Intl ar-DZ) have no font glyph.
    .replace(/[\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/g, "")
    // Intl fr/ar-DZ emit NBSP (compact scale words) and narrow NBSP
    // (fr thousands separator); the embedded font may lack those glyphs,
    // so normalize to a plain space which is always present.
    .replace(/[\u00a0\u202f]/g, " ");
}

function sanitizeReport<T>(value: T): T {
  if (typeof value === "string") return pdfSafe(value) as T;
  if (Array.isArray(value)) return value.map(sanitizeReport) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, sanitizeReport(v)]),
    ) as T;
  }
  return value;
}

export function useExportPdf() {
  const { t, lang, tr } = useI18n();
  const fmt = useFmt();
  const { commodityId, calibration, policy, outcome } = useSim();
  const [busy, setBusy] = useState(false);

  const exportPdf = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const commodityName = productName(commodityId, lang);
      const scenarios = await api.compareScenarios(calibration, policy);
      const num = (v: number, digits = 0) => fmt(v, digits);
      const dzd = (v: number, digits = 0) => `${num(v, digits)} ${t("units.dzdKg")}`;
      const tonnes = (v: number) => `${num(v)} ${t("units.tonnes")}`;

      const params: [string, string][] = [
        [t("sim.ceilingRetail"), policy.p_c_retail !== null ? dzd(policy.p_c_retail) : t("sim.noCeiling")],
        [t("sim.ceilingProducer"), policy.p_c_producer !== null ? dzd(policy.p_c_producer) : t("sim.noCeiling")],
        [t("sim.subsidy"), dzd(policy.subsidy)],
        [t("sim.stockRelease"), tonnes(policy.stock_release)],
        [t("pdf.mu"), num(policy.mu, 2)],
        [t("pdf.p0"), dzd(calibration.p0)],
        [t("pdf.q0"), tonnes(calibration.q0)],
        [t("pdf.epsD"), num(calibration.eps_d, 2)],
        [t("pdf.epsS"), num(calibration.eps_s, 2)],
        [t("pdf.c0"), dzd(calibration.c0)],
        [t("pdf.m0"), num(calibration.m0, 2)],
      ];

      const sign = (v: number) => (v > 0 ? "+" : "") + num(v, 1);
      const outcomes: [string, string][] = [
        [t("sim.kpiQReg"), tonnes(outcome.q_reg)],
        [t("sim.kpiShortage"), tonnes(outcome.shortage)],
        [t("sim.kpiPPar"), dzd(outcome.p_par, 1)],
        [t("sim.kpiFiscal"), `${num(outcome.fiscal_cost, 1)} ${t("units.millionDzd")}`],
        [t("sim.kpiSpending"), `${sign(outcome.household_spending_change_pct)} ${t("units.percent")}`],
      ];

      const regimeLabel = (regime: string) => tr(`cmp.regimes.${regime}`) ?? regime;
      const metricLabels = [
        t("cmp.metricQReg"),
        t("cmp.metricShortage"),
        t("cmp.metricPPar"),
        t("cmp.metricFiscal"),
        t("cmp.metricSpending"),
      ];
      const table = buildScenarioTable(scenarios, regimeLabel, metricLabels, fmt);

      const curve = buildCurve(calibration, policy, outcome, {
        demand: t("sim.legendDemand"),
        supply: t("sim.legendSupply"),
        pStar: "P*",
        ceiling: t("sim.legendCeiling"),
        pPar: t("sim.legendPPar"),
        shortage: t("sim.legendShortage"),
      });

      const locale = lang === "ar" ? "ar-DZ" : lang;
      const timestamp = new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date());

      const report: PdfReport = sanitizeReport({
        dir: lang === "ar" ? "rtl" : "ltr",
        title: `${t("app.name")} — ${t("pdf.sec1")}`,
        subtitle: t("app.subtitle"),
        badge: t("app.badge"),
        commodity: String(commodityName),
        timestamp,
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
      });

      const bytes: number[] = await invoke("export_pdf", { report });

      // Browser fallback (dev without Tauri): download as a blob.
      if (!("__TAURI_INTERNALS__" in window)) {
        const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `scope-lens-${commodityId}-policy-brief.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }

      const path = await save({
        defaultPath: `scope-lens-${commodityId}-policy-brief.pdf`,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
        title: t("pdf.dialogTitle"),
      });
      if (!path) return; // user cancelled

      await invoke("write_pdf", { path, bytes });
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setBusy(false);
    }
  }, [busy, t, tr, fmt, lang, commodityId, calibration, policy, outcome]);

  return { exportPdf, busy };
}
