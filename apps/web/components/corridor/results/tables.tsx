"use client";

/**
 * Table primitives for the by-tab result cards.
 *
 * Split out of ResultsPanel, which had grown to 1,300 lines holding layout,
 * the engine bridge, two chart components, three table components, a dev
 * guard and the number formatters. The calculator's equivalent is 133 lines
 * delegating to five focused files; this follows the same seams.
 */

import React from "react";
import { formatSig } from "@h2map/units";
import { usdM } from "@/lib/corridor/format";

/**
 * One label/value row for the by-tab result cards. A <div> child of <dl>
 * must contain dt then dd DIRECTLY (axe definition-list rule) — the sub-line
 * therefore lives inside the dd.
 */
export function TabRow({
  label,
  value,
  sub,
}: {
  label: React.ReactNode;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-2 border-b border-neutral-100 py-1.5 last:border-0">
      <dt className="text-neutral-600">{label}</dt>
      <dd className="text-right font-medium tabular-nums">
        {value}
        {sub && (
          <span className="block text-[11px] font-normal text-neutral-500">{sub}</span>
        )}
      </dd>
    </div>
  );
}

/** Green | fossil mini-table for the by-tab result cards. */
export function TabTable({
  rows,
  green,
  fossil,
  money,
}: {
  rows: [label: string, green: number, fossil: number | null][];
  green: string;
  fossil: string;
  /** Format values as $m (regulation PV); default plain numbers. */
  money?: boolean;
}) {
  // Non-money values are derived (fuel use, WTW intensity …): four
  // significant figures — never render precision the number doesn't have.
  // Money keeps the $X,XXX.XXm convention.
  const fmt = (n: number) => (money ? usdM(n) : formatSig(n));
  return (
    // These sit in sm:grid-cols-2 cards (~360px) carrying three columns of
    // money, so they scroll rather than overflow their card.
    <div className="overflow-x-auto">
    <table className="w-full min-w-[18rem] text-xs tabular-nums">
      <thead>
        <tr className="border-b border-neutral-300 text-[11px] uppercase tracking-wider text-neutral-500">
          <th className="py-1 text-left font-medium" scope="col">
            &nbsp;
          </th>
          <th className="py-1 pl-3 text-right font-medium" scope="col">
            {green}
          </th>
          <th className="py-1 pl-3 text-right font-medium" scope="col">
            {fossil}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, g, f]) => (
          <tr key={label} className="border-b border-neutral-100 last:border-0">
            <td className="py-1.5 pr-2 text-neutral-600">{label}</td>
            <td className="py-1.5 pl-3 text-right">{fmt(g)}</td>
            <td className="py-1.5 pl-3 text-right text-neutral-500">
              {f === null ? "—" : fmt(f)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

/**
 * The axis kit, shared by every chart on this page and matched to the
 * calculator's (components/calculator/results/*).
 *
 * The differences it removes were all small and all visible together: a
 * dashed grid against the calculator's solid, 10px ticks against 11px, tick
 * marks and a Y axis line the calculator drops, and the lighter
 * --viz-ink-muted where the calculator uses --viz-ink-secondary for text
 * that has to be read.
 *
 * Bars stay SQUARE. The calculator rounds them (radius={[3,3,0,0]}), and
 * that is a recharts SVG prop rather than a Tailwind utility, so the
 * design system's zeroed --radius-* scale does not reach it — the rounding
 * is real, and it contradicts the documented "straight lines, square boxes"
 * rule. Copying it would spread the inconsistency rather than settle it.
 */
