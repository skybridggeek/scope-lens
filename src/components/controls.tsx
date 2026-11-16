import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "../i18n";

/** Number formatting with Latin digits (ar-DZ convention) and tabular alignment. */
export function useFmt() {
  const { lang } = useI18n();
  const locale = lang === "ar" ? "ar-DZ" : lang;
  return (value: number, maxDigits = 0) => {
    if (!Number.isFinite(value)) return "—";
    // Extreme model outputs (runaway scarcity) would otherwise print as 100+
    // digit strings; compact notation keeps them readable and within layout.
    const compact = Math.abs(value) >= 100_000;
    return new Intl.NumberFormat(locale, {
      maximumFractionDigits: compact ? 1 : maxDigits,
      minimumFractionDigits: 0,
      notation: compact ? "compact" : "standard",
    }).format(value);
  };
}

/** KPI value that interpolates smoothly between updates (150ms ease-out). */
export function AnimatedNumber({ value, format }: { value: number; format: (v: number) => string }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;
    if (!Number.isFinite(value) || !Number.isFinite(from)) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const duration = 150;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = from + (value - from) * eased;
      setDisplay(v);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);

  return <span className="font-mono" style={{ fontVariantNumeric: "tabular-nums" }}>{format(display)}</span>;
}

/** KPI number + inline unit that auto-shrinks its font so long values — including
 *  Arabic compact scale words ("مليار"، "ألف"), 6-digit quantities and long unit
 *  labels ("millions DZD") — never overflow the card. The unit scales with the
 *  number (floor 9px) so a long unit cannot defeat the fit. Re-fits on value
 *  change and on container resize. */
export function KpiValue({
  value,
  digits = 0,
  unit,
  color = "text-ink",
}: {
  value: number;
  digits?: number;
  unit: string;
  color?: string;
}) {
  const fmt = useFmt();
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState(24);
  const target = fmt(value, digits);
  const unitSize = (s: number) => Math.max(9, Math.min(12, Math.round(s * 0.5)));

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;
    const fit = () => {
      const avail = container.clientWidth;
      if (avail <= 0) return;
      const unitEl = measure.querySelector<HTMLElement>("[data-unit]");
      const apply = (s: number) => {
        measure.style.fontSize = `${s}px`;
        if (unitEl) unitEl.style.fontSize = `${unitSize(s)}px`;
      };
      let size = 24;
      apply(size);
      while (size > 11 && measure.offsetWidth > avail) {
        size -= 1;
        apply(size);
      }
      setFontSize(size);
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(fit);
    ro.observe(container);
    return () => ro.disconnect();
  }, [target, unit]);

  return (
    <div ref={containerRef} className={`relative font-bold leading-none ${color}`} style={{ fontSize }}>
      <AnimatedNumber value={value} format={(v) => fmt(v, digits)} />
      <span className="font-medium text-muted ms-1" style={{ fontSize: unitSize(fontSize) }}>{unit}</span>
      <span
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute whitespace-nowrap"
        style={{ left: 0, top: 0, fontSize }}
      >
        <span className="font-mono" style={{ fontVariantNumeric: "tabular-nums" }}>{target}</span>
        <span data-unit className="font-medium ms-1" style={{ fontSize: unitSize(fontSize) }}>{unit}</span>
      </span>
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  display?: string;
  hint?: ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-slate2">{label}</span>
        <span className="font-mono text-xs text-ink" style={{ fontVariantNumeric: "tabular-nums" }}>
          {display ?? value}
        </span>
      </div>
      <input
        type="range"
        className="w-full cursor-ew-resize accent-teal"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <div className="text-[11px] text-muted mt-0.5">{hint}</div>}
    </label>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-[18px] font-semibold text-navy mb-3">{children}</h2>;
}
