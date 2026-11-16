import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { useI18n, type Lang } from "../i18n";
import { useExportPdf } from "../useExportPdf";
import AppLogo from "./AppLogo";

const LANGS: Lang[] = ["ar", "fr", "en"];

export default function TopBar() {
  const { t, lang, setLang } = useI18n();
  const { exportPdf, busy } = useExportPdf();

  // Keeps the Rust PDF-header logo check warm so a missing logo is handled
  // gracefully there too (returns null → typographic header).
  useEffect(() => {
    invoke<string | null>("get_logo_asset").catch(() => null);
  }, []);

  return (
    <header className="h-16 shrink-0 bg-white border-b border-hairline flex items-center gap-4 px-4">
      <AppLogo size={40} />
      <div className="flex flex-col leading-tight">
        <span className="text-[18px] font-semibold text-navy">{t("app.name")}</span>
        <span className="text-xs text-slate2">{t("app.subtitle")}</span>
      </div>
      <span className="badge-amber ms-2">{t("app.badge")}</span>

      <div className="flex-1" />

      <select
        className="rounded-input border border-hairline px-2 py-1.5 text-sm bg-white cursor-pointer"
        aria-label={t("topbar.language")}
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
      >
        {LANGS.map((l) => (
          <option key={l} value={l}>
            {l === "ar" ? "العربية" : l === "fr" ? "Français" : "English"}
          </option>
        ))}
      </select>

      <button className="btn-primary" onClick={exportPdf} disabled={busy}>
        {busy ? "…" : t("topbar.exportPdf")}
      </button>
    </header>
  );
}
