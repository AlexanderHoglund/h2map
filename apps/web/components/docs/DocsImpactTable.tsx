/**
 * §29's DEMOTED endpoint table: where each headline figure lands at the two
 * ends of an input's plausible range, on the frozen reference corridor.
 *
 * This used to be the section's flagship — an interactive island with rank
 * tabs and sentence-shaped cells. The lead role now belongs to the ranked
 * elasticity table (DocsElasticityTable): one standard nudge, one signed
 * number, no assumed ranges. What remains here is the reference this view is
 * genuinely for — "if I am wrong about this input, where does my number
 * land?" — so it renders statically (no tabs, both columns always shown,
 * ranked once by the gap's relative movement) with compact low → high cells:
 * set the input to the endpoint shown and the app prints the value in the
 * cell. Choices (options, not endpoints) name the option that moves the
 * figure furthest and the value it produces; their own baselines are stated
 * once in the caption rather than re-explained in every cell.
 */

import { usdM, usdPerT } from "./format";

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

type Kpi = "gap" | "abatement";
const fmt = (k: Kpi) => (k === "gap" ? usdM : usdPerT);

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
function EndpointsCell({ v, k }: { v: EndpointValues; k: Kpi }) {
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
 * A choice cell: the option that moves the figure furthest, and the value it
 * produces. Direction is measured against that choice's own baseline — the
 * caption states this once, so the cell stays a name and a number.
 */
function WorstCell({ w, k }: { w: WorstOption; k: Kpi }) {
  const f = fmt(k);
  const val = f(w.value);
  if (val === f(w.base)) return <>no option moves it ({val})</>;
  return (
    <>
      <code className="text-[12px]">{w.option}</code>: {val}{" "}
      <Arrow falls={w.value < w.base} />
    </>
  );
}

export default function DocsImpactTable({ rows }: { rows: ImpactRow[] }) {
  // Ranked once, by the gap's relative movement (the section's historical
  // default), abatement as the tie-break. Any negative $/t on display earns
  // the saving-per-tonne footnote — computed from the data rather than
  // toggled by hand, so the note can never linger after a regeneration
  // removes the last negative cell.
  const sorted = [...rows].sort(
    (a, b) => b.gap - a.gap || b.abatement - a.abatement,
  );
  const hasNegativePerTonne = rows.some(
    (r) =>
      (r.abatementValues &&
        (r.abatementValues.atLow < 0 || r.abatementValues.atHigh < 0)) ||
      (r.abatementWorst && r.abatementWorst.value < 0),
  );

  return (
    <div className="my-3">
      <p className="text-xs text-neutral-500">
        Every value is what the model computes on the frozen 500&nbsp;nm
        reference corridor (baseline: cost gap $167.5m, abatement cost
        $2,506/t) &mdash; set the input to the endpoint shown and the app
        prints the value in the cell. Rows marked <em>choice</em>{" "}name the
        option that moves the figure furthest; choices are evaluated against
        the current catalogue, each from its <strong>own</strong>{" "}baseline,
        so a choice cell&apos;s arrow is measured from that baseline rather
        than from the frozen figures above. Ranked by the cost-gap movement.
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border border-neutral-300 text-[13px] tabular-nums">
          <thead>
            <tr className="border-b border-neutral-300 bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-500">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Input</th>
              <th className="px-3 py-2 text-right font-medium">
                CO&#8322; abatement cost ($/t)
              </th>
              <th className="px-3 py-2 text-right font-medium">Cost gap ($m)</th>
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
                <td className="px-3 py-1.5 text-right text-neutral-700">
                  {row.abatementValues ? (
                    <EndpointsCell v={row.abatementValues} k="abatement" />
                  ) : (
                    <WorstCell w={row.abatementWorst!} k="abatement" />
                  )}
                </td>
                <td className="px-3 py-1.5 text-right text-neutral-700">
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
