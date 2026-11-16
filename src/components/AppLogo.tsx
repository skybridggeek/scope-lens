import { useEffect, useState } from "react";
import { useI18n } from "../i18n";

const LOGO_CANDIDATES = ["logo.png", "logo.svg", "logo.jpg"];

/**
 * Renders the first logo file found in public/logo/ (logo.png, then
 * logo.svg, then logo.jpg). If none exists, falls back to a clean
 * typographic monogram badge — never a broken image icon.
 */
export default function AppLogo({ size = 40 }: { size?: number }) {
  const { t } = useI18n();
  const [logoSrc, setLogoSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const name of LOGO_CANDIDATES) {
        const url = `/logo/${name}`;
        try {
          const res = await fetch(url, { method: "HEAD" });
          if (res.ok) {
            if (!cancelled) setLogoSrc(url);
            return;
          }
        } catch {
          // try the next candidate
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (logoSrc) {
    return (
      <img
        src={logoSrc}
        alt={`${t("app.name")} logo`}
        width={size}
        height={size}
        className="rounded-card object-contain"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className="flex items-center justify-center rounded-card bg-navy text-white font-mono font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.32 }}
      aria-label={`${t("app.name")} logo`}
    >
      SL
    </div>
  );
}
