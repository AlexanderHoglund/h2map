"use client";

/**
 * §20's impact ranking, sortable by tab.
 *
 * The docs page is server-rendered; this island exists because re-ranking is
 * interaction. The tabs pick the basis — the larger of the two impacts, the
 * cost gap alone, or the CO₂ abatement cost alone — and the table sorts by
 * the active tab, renumbering as it goes. The DATA never changes with the
 * tab: both figures stay visible on every row, only the order moves, so the
 * reader cannot lose sight of the divergences the two-column design exists
 * to show.
 */

import { useMemo, useState } from "react";

export interface ImpactRow {
  id: string;
  label: string;
  isChoice: boolean;
  gap: number;
  abatement: number;
}

const TABS = [
  { key: "abatement", label: "CO₂ abatement cost" },
  { key: "gap", label: "Cost gap" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const valueOf = (r: ImpactRow, k: TabKey): number =>
  k === "gap" ? r.gap : r.abatement;

export default function DocsImpactTable({ rows }: { rows: ImpactRow[] }) {
  const [tab, setTab] = useState<TabKey>("abatement");
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
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border border-neutral-300 text-[13px] tabular-nums">
          <thead>
            <tr className="border-b border-neutral-300 bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-500">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Input</th>
              <th className={`px-3 py-2 text-right font-medium${activeCol("gap")}`}>
                Cost gap impact
              </th>
              <th
                className={`px-3 py-2 text-right font-medium${activeCol("abatement")}`}
              >
                CO&#8322; abatement cost impact
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
                <td className={cell("gap")}>
                  {(row.gap * 100).toFixed(1)}%
                </td>
                <td className={cell("abatement")}>
                  {(row.abatement * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
