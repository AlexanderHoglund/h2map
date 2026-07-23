"use client";

import { useTranslations } from "next-intl";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_INITIALS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/** Sequential single-hue ramp, light → dark. */
const RAMP_FROM: [number, number, number] = [0xcd, 0xe2, 0xfb];
const RAMP_TO: [number, number, number] = [0x0d, 0x36, 0x6b];

function rampColor(f: number): string {
  const k = Math.max(0, Math.min(1, f));
  const c = RAMP_FROM.map((a, i) => Math.round(a + (RAMP_TO[i]! - a) * k));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

/**
 * 12×24 month-by-hour average electrolyzer load heat-map (CSS grid of divs).
 * Note: the engine emits a 12×24 month×hour matrix (not 365×24 — the source
 * dispatch repeats a representative year averaged per month).
 */
export default function HeatMap({ matrix }: { matrix: number[][] }) {
  const t = useTranslations("calculator.results.heatmap");
  const max = Math.max(1e-9, ...matrix.flat());

  return (
    <figure>
      <figcaption className="mb-2 text-sm font-semibold">{t("title")}</figcaption>
      <div className="overflow-x-auto">
        <div
          className="grid min-w-105 gap-px"
          style={{ gridTemplateColumns: "1.5rem repeat(24, minmax(0, 1fr))" }}
          role="img"
          aria-label={t("srSummary", { max: max.toFixed(1) })}
        >
          {matrix.map((row, m) => (
            <MonthRow key={m} month={m} row={row} max={max} />
          ))}
          {/* Hour axis */}
          <div />
          {Array.from({ length: 24 }, (_, h) => (
            <div
              key={h}
              className="pt-0.5 text-center text-[9px] tabular-nums text-neutral-400 dark:text-neutral-500"
            >
              {h % 3 === 0 ? h : ""}
            </div>
          ))}
        </div>
      </div>
      {/* Compact color key */}
      <div className="mt-2 flex items-center gap-2 text-[10px] text-neutral-500 dark:text-neutral-400">
        <span className="tabular-nums">0</span>
        <div
          className="h-2 w-28 rounded-sm"
          style={{
            background: `linear-gradient(to right, ${rampColor(0)}, ${rampColor(1)})`,
          }}
        />
        <span className="tabular-nums">{max.toFixed(0)} MW</span>
        <span className="ml-2">{t("keyLabel")}</span>
      </div>
    </figure>
  );
}

function MonthRow({
  month,
  row,
  max,
}: {
  month: number;
  row: number[];
  max: number;
}) {
  return (
    <>
      <div className="flex items-center justify-end pr-1 text-[9px] font-medium text-neutral-500 dark:text-neutral-400">
        {MONTH_INITIALS[month]}
      </div>
      {Array.from({ length: 24 }, (_, h) => {
        const mw = row[h] ?? 0;
        return (
          <div
            key={h}
            title={`${MONTHS[month]} ${String(h).padStart(2, "0")}:00 — ${mw.toFixed(1)} MW`}
            className="h-4 rounded-xs"
            style={{ backgroundColor: rampColor(mw / max) }}
          />
        );
      })}
    </>
  );
}
