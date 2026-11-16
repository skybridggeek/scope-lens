import { useI18n } from "../i18n";
import type { ViewKey } from "../views";

const NAV_ITEMS: { key: ViewKey; icon: string }[] = [
  { key: "simulator", icon: "M4 20V10m6 10V4m6 16v-7" },
  { key: "comparison", icon: "M4 18h6M4 14h4m4 4h8m-8-4h6M16 6v12" },
  { key: "optimizer", icon: "M12 3v18m-7-9h14" },
  { key: "cases", icon: "M5 4h14v16H5zM9 8h6M9 12h6" },
  { key: "methodology", icon: "M7 4h10v6a5 5 0 01-10 0zM12 15v5" },
];

export default function Sidebar({
  active,
  onSelect,
}: {
  active: ViewKey;
  onSelect: (v: ViewKey) => void;
}) {
  const { t } = useI18n();

  return (
    <nav className="w-64 shrink-0 bg-white border-e border-hairline p-3 flex flex-col gap-1">
      {NAV_ITEMS.map(({ key, icon }) => (
        <button
          key={key}
          onClick={() => onSelect(key)}
          className={`flex items-center gap-3 rounded-card px-3 py-2.5 text-sm text-start cursor-pointer transition-colors duration-150 ${
            active === key
              ? "bg-navy text-white font-medium"
              : "text-slate2 hover:bg-hairline"
          }`}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d={icon} />
          </svg>
          {t(`nav.${key}`)}
        </button>
      ))}
    </nav>
  );
}
