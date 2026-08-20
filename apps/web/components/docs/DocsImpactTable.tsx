"use client";

/**
 * §20's impact ranking, sortable by tab.
 *
 * The docs page is server-rendered; this island exists because re-ranking is
 * interaction. The tabs pick the basis — the cost gap (default) or the CO₂
 * abatement cost — and the table sorts by the active tab, renumbering as it
 * goes. Numeric rows render SIGNED in BOTH columns — an endpoint pair, or a
 * single signed extreme when one endpoint rounds to zero — rather than a
 * max-abs percentage that hides which end of the range produced it, or which
 * direction it moved. One row, one sign convention: an unsigned magnitude
 * must never sit next to a signed pair, because "376.4%" beside
 * "−376.4% … 0.0%" reads as a rise when the movement is a fall. Choices
 * (options, not endpoints) keep the unsigned single figure. The DATA never
 * changes with the tab: both figures stay visible on every row, only the
 * order moves, so the reader cannot lose sight of the divergences the
 * two-column design exists to show.
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

  // One row, one sign convention: wherever signed endpoint data exists it is
  // rendered signed in BOTH columns — the pair when both endpoints survive
  // rounding, a single signed extreme when one endpoint is 0.0 after
  // rounding (a pair whose other half is zero says nothing the sign alone
  // does not). Only choices (null signed) show an unsigned magnitude.
  const isZero = (v: number): boolean => (Math.abs(v) * 100).toFixed(1) === "0.0";
  const signedCell = (s: SignedPair): string => {
    if (isZero(s.atLow) && isZero(s.atHigh)) return "0.0%";
    if (isZero(s.atLow)) return signedPct(s.atHigh);
    if (isZero(s.atHigh)) return signedPct(s.atLow);
    return signedPair(s);
  };
  const abatementCell = (r: ImpactRow): string =>
    r.abatementSigned ? signedCell(r.abatementSigned) : pct(r.abatement);
  const gapCell = (r: ImpactRow): string =>
    r.gapSigned ? signedCell(r.gapSigned) : pct(r.gap);

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
      <p className="mt-1.5 text-xs text-neutral-500">
        All figures are measured on the frozen 500&nbsp;nm reference corridor,
        relative to its baseline (cost gap $167.5m, abatement cost $2,506/t)
        &mdash; not the scenario open in the app.
      </p>
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
