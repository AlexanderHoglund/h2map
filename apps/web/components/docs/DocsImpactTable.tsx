"use client";

/**
 * §20's impact ranking, sortable by tab.
 *
 * The docs page is server-rendered; this island exists because re-ranking is
 * interaction. The tabs pick the basis — the cost gap (default) or the CO₂
 * abatement cost — and the table sorts by the active tab, renumbering as it
 * goes. The gap is the default because it responds near-linearly across the
 * swept ranges; the abatement cost is a ratio whose denominator many inputs
 * also move, so its figures are shown as SIGNED endpoint pairs for numeric
 * rows rather than a single max-abs percentage that hides which end of the
 * range produced it. The DATA never changes with the tab: both figures stay
 * visible on every row, only the order moves, so the reader cannot lose
 * sight of the divergences the two-column design exists to show.
 */

import { useMemo, useState } from "react";

/** Signed relative movement at the two swept endpoints of a numeric input. */
export interface SignedPair {
  atLow: number;
  atHigh: number;
}

export interface ImpactRow {
  id: string;
  label: string;
  isChoice: boolean;
  gap: number;
  abatement: number;
  /** Signed endpoint movements; null for choices (options, not endpoints). */
  gapSigned: SignedPair | null;
  abatementSigned: SignedPair | null;
}

const TABS = [
  { key: "gap", label: "Cost gap" },
  { key: "abatement", label: "CO₂ abatement cost" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const valueOf = (r: ImpactRow, k: TabKey): number =>
  k === "gap" ? r.gap : r.abatement;

const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;
/** "−82.3%" / "+366.0%" — the sign is the information; a true zero is bare. */
const signedPct = (v: number): string => {
  const mag = (Math.abs(v) * 100).toFixed(1);
  return mag === "0.0" ? "0.0%" : `${v < 0 ? "−" : "+"}${mag}%`;
};
// Rendered as a span, most negative first — corridor length reads
// "−82.3% … +366.0%", not "+366.0% … −82.3%", because a reader scans it as
// a range of outcomes; which end of the INPUT range produced which figure
// is the prose's job (§29 works the corridor-length case).
const signedPair = (s: SignedPair): string => {
  const [lo, hi] =
    s.atLow <= s.atHigh ? [s.atLow, s.atHigh] : [s.atHigh, s.atLow];
  return `${signedPct(lo)} … ${signedPct(hi)}`;
};

export default function DocsImpactTable({ rows }: { rows: ImpactRow[] }) {
  const [tab, setTab] = useState<TabKey>("gap");
  const other: TabKey = tab === "gap" ? "abatement" : "gap";
  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          valueOf(b, tab) - valueOf(a, tab) || valueOf(b, other) - valueOf(a, other),
      ),
    [rows, tab, other],
  );

  const activeCol = (k: TabKey): string => (tab === k ? " text-neutral-800" : "");

  // The column the table is ranked by is BOLD, so the sort key is always a
  // number the reader can see.
  const cell = (k: TabKey): string =>
    `px-3 py-1.5 text-right${
      tab === k ? " font-medium text-neutral-900" : " text-neutral-600"
    }`;

  // Abatement is a ratio: numeric rows always show the signed endpoint pair.
  // The gap keeps the single figure unless the endpoints disagree in sign —
  // then a max-abs percentage would hide a direction change, so the pair
  // renders there too.
  const abatementCell = (r: ImpactRow): string =>
    r.abatementSigned ? signedPair(r.abatementSigned) : pct(r.abatement);
  const gapCell = (r: ImpactRow): string =>
    r.gapSigned && r.gapSigned.atLow * r.gapSigned.atHigh < 0
      ? signedPair(r.gapSigned)
      : pct(r.gap);

  return (
    <div className="my-3">
      <div
        role="tablist"
        aria-label="Rank the inputs by"
        className="flex flex-wrap items-center gap-1 text-xs"
      >
        <span className="mr-1 text-neutral-500">Rank by</span>
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`border px-2.5 py-1 ${
              tab === t.key
                ? "border-neutral-800 bg-neutral-800 font-medium text-white"
                : "border-neutral-300 bg-white text-neutral-600 hover:border-neutral-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "abatement" && (
        <p className="mt-1.5 text-xs text-neutral-500">
          Worst-case endpoint movement; for inputs that also change the tonnes
          abated, the figure is dominated by the short end of the swept range
          — see the flaw list under &ldquo;Impact: leverage &times;
          exposure&rdquo;.
        </p>
      )}
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border border-neutral-300 text-[13px] tabular-nums">
          <thead>
            <tr className="border-b border-neutral-300 bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-500">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Input</th>
              <th
                className={`px-3 py-2 text-right font-medium${activeCol("abatement")}`}
              >
                CO&#8322; abatement cost impact
              </th>
              <th className={`px-3 py-2 text-right font-medium${activeCol("gap")}`}>
                Cost gap impact
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={row.id} className="border-b border-neutral-200 last:border-0">
                <td className="px-3 py-1.5">{i + 1}</td>
                <td className="px-3 py-1.5">
                  {row.label}
                  {row.isChoice && (
                    <span className="ml-1.5 text-[11px] text-neutral-500">
                      (choice)
                    </span>
                  )}
                </td>
                <td className={cell("abatement")}>{abatementCell(row)}</td>
                <td className={cell("gap")}>{gapCell(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
