"use client";

/**
 * §29's impact ranking, sortable by tab.
 *
 * The docs page is server-rendered; this island exists because re-ranking is
 * interaction. The tabs pick the basis — the cost gap (default) or the CO₂
 * abatement cost — and the table sorts by the active tab, renumbering as it
 * goes. The RANKING is the same relative-movement metric it has always been;
 * only the display moved from arithmetic to evidence. A percentage against a
 * baseline the reader cannot see ("−376.4%") means nothing, so each cell now
 * states the absolute value the model computes at the two ends of the input's
 * swept range on the reference corridor — set the input to the endpoint in
 * the app and this is the number it shows. Choices (options, not endpoints)
 * name the option that moves the figure furthest from that choice's own
 * baseline and the value it produces. Direction stays visible — ↓ (green)
 * when the value falls, ↑ when it rises — and the DATA never changes with
 * the tab: both columns stay on every row, only the order moves, so the
 * reader cannot lose sight of the divergences the two-column design exists
 * to show.
 */

import { useMemo, useState } from "react";

/** Absolute KPI values at the two swept endpoints of a numeric input. */
export interface EndpointValues {
  atLow: number;
  atHigh: number;
}

/**
 * The option that moved a KPI furthest, the value it produced, and the
 * baseline it moved from — a choice's OWN baseline (most choices are
 * evaluated on the current reference data), not necessarily the frozen
 * sweep baseline.
 */
export interface WorstOption {
  option: string;
  value: number;
  base: number;
}

export interface ImpactRow {
  id: string;
  label: string;
  isChoice: boolean;
  /** Swept endpoints, for the input cell; null for choices. */
  low: number | null;
  high: number | null;
  /** How many options a choice offers; 0 for numeric inputs. */
  optionCount: number;
  /** Relative movement metrics — the SORT keys only, never displayed. */
  gap: number;
  abatement: number;
  /** Absolute values at the endpoints; null for choices. */
  gapValues: EndpointValues | null;
  abatementValues: EndpointValues | null;
  /** Worst option per figure; null for numeric inputs. */
  gapWorst: WorstOption | null;
  abatementWorst: WorstOption | null;
}

const TABS = [
  { key: "gap", label: "Cost gap" },
  { key: "abatement", label: "CO₂ abatement cost" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const valueOf = (r: ImpactRow, k: TabKey): number =>
  k === "gap" ? r.gap : r.abatement;

const MINUS = "−";
/** "$167.5m" / "−$462.9m"; a magnitude that rounds to zero drops its sign. */
const usdM = (v: number): string => {
  const mag = Math.abs(v).toFixed(1);
  return `${v < 0 && mag !== "0.0" ? MINUS : ""}$${mag}m`;
};
/** "$2,506/t" / "−$6,928/t" — whole dollars; the cents are noise here. */
const usdPerT = (v: number): string => {
  const mag = Math.round(Math.abs(v));
  return `${v < 0 && mag !== 0 ? MINUS : ""}$${mag.toLocaleString("en-US")}/t`;
};
const fmt = (k: TabKey) => (k === "gap" ? usdM : usdPerT);

/** Swept endpoints in the input's own units; calendar years stay ungrouped. */
const inputValue = (n: number): string =>
  Number.isInteger(n) && n >= 1900 && n <= 2100
    ? String(n)
    : n.toLocaleString("en-US", { maximumFractionDigits: 4 });

/** Direction of travel; a fall is green because both figures are costs. */
function Arrow({ falls }: { falls: boolean }) {
  return falls ? (
    <span className="text-green-700" aria-label="falls">
      ↓
    </span>
  ) : (
    <span className="text-red-700" aria-label="rises">
      ↑
    </span>
  );
}

/**
 * A numeric cell: the model's output at the low endpoint → at the high
 * endpoint. Endpoints that round to the same figure are a measured
 * no-change, said outright rather than rendered as a pair of equal numbers.
 */
function EndpointsCell({ v, k }: { v: EndpointValues; k: TabKey }) {
  const f = fmt(k);
  const lo = f(v.atLow);
  const hi = f(v.atHigh);
  if (lo === hi) return <>no change ({lo})</>;
  return (
    <>
      {lo} {"→"} {hi} <Arrow falls={v.atHigh < v.atLow} />
    </>
  );
}

/**
 * A choice cell: the option that moves the figure furthest, and the value
 * it produces — direction measured against that choice's own baseline,
 * WHICH IS STATED IN THE CELL. Two baselines coexist in this table: numeric
 * rows move from the frozen sweep baseline ($167.5m / $2,506/t), while
 * choices are evaluated on the current reference data from their own
 * baseline (e.g. $140.2m). Leaving the second number implicit made every
 * choice arrow look measured from the frozen figure, which it is not.
 */
function WorstCell({ w, k }: { w: WorstOption; k: TabKey }) {
  const f = fmt(k);
  const val = f(w.value);
  if (val === f(w.base)) return <>no option moves it ({val})</>;
  return (
    <>
      e.g. <code className="text-[12px]">{w.option}</code>: {val}{" "}
      <Arrow falls={w.value < w.base} />{" "}
      <span className="whitespace-nowrap text-[11px] text-neutral-500">
        from its own {f(w.base)}
      </span>
    </>
  );
}

export default function DocsImpactTable({ rows }: { rows: ImpactRow[] }) {
  const [tab, setTab] = useState<TabKey>("gap");
  const other: TabKey = tab === "gap" ? "abatement" : "gap";
  // Any negative $/t on display earns the saving-per-tonne footnote —
  // computed from the data rather than toggled by hand, so the note can
  // never linger after a regeneration removes the last negative cell.
  const hasNegativePerTonne = rows.some(
    (r) =>
      (r.abatementValues &&
        (r.abatementValues.atLow < 0 || r.abatementValues.atHigh < 0)) ||
      (r.abatementWorst && r.abatementWorst.value < 0),
  );
  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          valueOf(b, tab) - valueOf(a, tab) || valueOf(b, other) - valueOf(a, other),
      ),
    [rows, tab, other],
  );

  const activeCol = (k: TabKey): string => (tab === k ? " text-neutral-800" : "");

  // The column the table is ranked by is BOLD, so the reader can see which
  // figure ordered the rows even though the sort key itself (relative
  // movement) is not printed.
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
      <p className="mt-1.5 text-xs text-neutral-500">
        Every value is what the model computes on the frozen 500&nbsp;nm
        reference corridor (baseline: cost gap $167.5m, abatement cost
        $2,506/t) &mdash; not on the scenario open in the app. Set the input
        to the endpoint shown and the app prints the value in the cell.
      </p>
      {tab === "abatement" && (
        <p className="mt-1.5 text-xs text-neutral-500">
          The abatement cost divides the gap by the tonnes abated, so an
          input that also changes the tonnes moves the denominator of its own
          measurement &mdash; the short end of a distance-like range can
          balloon. See the flaw list under &ldquo;Impact: leverage &times;
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
                CO&#8322; abatement cost ($/t)
              </th>
              <th className={`px-3 py-2 text-right font-medium${activeCol("gap")}`}>
                Cost gap ($m)
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
                  <span className="ml-1.5 whitespace-nowrap text-[11px] text-neutral-500">
                    {row.isChoice
                      ? `· ${row.optionCount} options`
                      : `· ${inputValue(row.low!)} → ${inputValue(row.high!)}`}
                  </span>
                </td>
                <td className={cell("abatement")}>
                  {row.abatementValues ? (
                    <EndpointsCell v={row.abatementValues} k="abatement" />
                  ) : (
                    <WorstCell w={row.abatementWorst!} k="abatement" />
                  )}
                </td>
                <td className={cell("gap")}>
                  {row.gapValues ? (
                    <EndpointsCell v={row.gapValues} k="gap" />
                  ) : (
                    <WorstCell w={row.gapWorst!} k="gap" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasNegativePerTonne && (
        <p className="mt-1.5 text-xs text-neutral-500">
          A negative $/t is a <strong>saving per tonne</strong>: at that
          setting the green corridor is outright cheaper than fossil, so each
          abated tonne of CO&#8322; saves money instead of costing it
          (&minus;$6,928/t under $50m/yr of other support: the corridor
          banks $6,928 per tonne it abates).
        </p>
      )}
    </div>
  );
}
