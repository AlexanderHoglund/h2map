"use client";

/**
 * Chart primitives and the shared visual kit: axis treatment, the waterfall,
 * the cost-nature fills and the legend swatch.
 *
 * The axis constants live here rather than in each chart so the three charts
 * on the results page cannot drift apart again — they previously differed on
 * grid style, tick size and axis lines all at once.
 */

import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const AXIS_TICK = { fontSize: 11, fill: "var(--viz-ink-secondary)" } as const;
/** Solid, horizontal only — a dashed grid competes with dashed reference lines. */
export const GRID_PROPS = {
  vertical: false,
  stroke: "var(--viz-grid)",
} as const;
/** The category axis keeps its baseline; the value axis does not need one. */
export const X_AXIS_PROPS = {
  tickLine: false,
  axisLine: { stroke: "var(--viz-baseline)" },
  tick: AXIS_TICK,
  tickMargin: 4,
} as const;
export const Y_AXIS_PROPS = {
  tickLine: false,
  axisLine: false,
  tick: AXIS_TICK,
} as const;

// Viz tokens (globals.css): the corridor identities — series green for the
// green total, neutral for fossil, brand blue for the incremental bars, the
// light baseline neutral for the regulation float (its sign is carried by
// position, the signed label and the tooltip).
export const WF_COLORS = {
  greenTotal: "var(--viz-series-green)",
  fossilTotal: "var(--viz-total)",
  incremental: "var(--viz-series-1)",
  // A float that CLOSES the gap vs one that WIDENS it. Previously both used
  // the neutral baseline and direction lived only in the label's minus sign,
  // so an instrument that made the corridor more expensive looked identical
  // to one that made it cheaper. These are the purpose-built CVD-safe
  // diverging pair (globals.css) rather than an invented colour.
  reduction: "var(--viz-delta-down)",
  increase: "var(--viz-delta-up)",
} as const;

export interface WfStep {
  key: string;
  label: string;
  base: number;
  span: number;
  kind: keyof typeof WF_COLORS;
  labelText: string;
  exitLevel: number;
  /** Instruments inside a grouped bar, for the tooltip. Absent on totals. */
  parts?: readonly { key: string; label: string; text: string }[];
}

/** The MMMCZCS float-bar waterfall, denomination-agnostic: the same chart
 *  draws PV \u0024m and \u0024/t CO2 abated. */
/* Every value arrives pre-formatted on the datum (`labelText`, `parts[].text`)
   because the two denominations format differently — so the chart itself needs
   no formatter. */
export function WaterfallChart({ data }: { data: WfStep[] }) {
  return (
    <>
    {/* A bar chart carries no text alternative, so state the sequence. Built
        from the same data the bars use, so it cannot drift out of date. */}
    <p className="sr-only">
      {data
        .map((d) => `${d.label.split(String.fromCharCode(10)).join(" ")}: ${d.labelText}`)
        .join(". ")}
    </p>
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid {...GRID_PROPS} />
          {/* Keeps its own tick renderer — these labels wrap to two lines —
              but takes the shared axis-line and tick-mark treatment. */}
          <XAxis
            dataKey="label"
            tick={<WrappedTick />}
            tickLine={false}
            axisLine={{ stroke: "var(--viz-baseline)" }}
            interval={0}
            height={34}
          />
          <YAxis {...Y_AXIS_PROPS} width={44} />
          <Tooltip
            cursor={{ fill: "var(--viz-grid)", fillOpacity: 0.35 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const step = payload[0]?.payload as WfStep | undefined;
              if (!step) return null;
              return (
                <div className="border border-neutral-300 bg-white px-2.5 py-1.5 text-xs">
                  <div className="font-medium">{step.label.split(String.fromCharCode(10)).join(' ')}</div>
                  <div className="tabular-nums">{step.labelText}</div>
                  {/* A grouped bar breaks out its instruments here — including
                      the inactive ones, which is where "does not apply to this
                      corridor" gets said rather than silently omitted. */}
                  {step.parts && step.parts.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 border-t border-neutral-200 pt-1.5">
                      {step.parts.map((p) => (
                        <li key={p.key} className="flex justify-between gap-4">
                          <span className="text-neutral-600">
                            {p.label.split(String.fromCharCode(10)).join(' ')}
                          </span>
                          <span className="tabular-nums">{p.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            }}
          />
          <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="span" stackId="w" isAnimationActive={false}>
            {data.map((step) => (
              <Cell key={step.key} fill={WF_COLORS[step.kind]} />
            ))}
            <LabelList
              dataKey="labelText"
              position="top"
              style={{ fontSize: 10, fill: "var(--viz-ink-secondary)" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
    </>
  );
}

/** Two-line x-axis tick: label strings carry an explicit \n. */
function WrappedTick(props: { x?: number; y?: number; payload?: { value?: string } }) {
  const { x = 0, y = 0, payload } = props;
  const lines = String(payload?.value ?? "").split("\n");
  return (
    <text
      x={x}
      y={y + 10}
      textAnchor="middle"
      fontSize={AXIS_TICK.fontSize}
      fill={AXIS_TICK.fill}
    >
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : 11}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

/** A small filled square + label for chart legends (colour is never the sole cue). */
export function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span aria-hidden className="h-2.5 w-2.5" style={{ background: color }} />
      {label}
    </span>
  );
}


/** Δ colors reuse the CVD-safe waterfall pair; near-zero stays neutral. */
export function deltaStyle(delta: number): React.CSSProperties | undefined {
  if (Math.abs(delta) < 0.005) return undefined;
  return { color: delta > 0 ? "var(--viz-delta-up)" : "var(--viz-delta-down)" };
}

/**
 * Cost-nature fills for the annual chart: side identity (green vs fossil)
 * carried by colour family, nature (CAPEX / operating) by shade, and
 * regulation in a carbon accent so the charge is visible on both sides.
 *
 * Every value is a token. These were four raw hexes that near-missed the
 * tokens they should have been — #006b00 against --viz-series-green
 * (#008300), #4c4b48 against --viz-total (#52514e), #a6a49d against
 * --viz-baseline — so "the green side" was one green in this chart and a
 * different green in the waterfall directly above it. #5cb85c was
 * Bootstrap 3's success green and appeared in no token file at all.
 */
export const NATURE_FILLS = {
  gCapex: "var(--viz-series-green)",
  gOpex: "var(--viz-series-green-2)",
  fCapex: "var(--viz-fossil)",
  fOpex: "var(--viz-fossil-2)",
  // NOT --viz-delta-up: regulation here is a neutral cost CATEGORY, not a
  // direction. Sharing the "this got more expensive" red made a reader who
  // had just learned the waterfall read this segment as bad news.
  reg: "var(--viz-carbon)",
} as const;

/** Bar dataKey → nature label message key (for the tooltip). */
export const NATURE_NAMES: Record<string, string> = {
  gCapex: "natureCapex",
  gOpex: "natureOperating",
  gReg: "natureRegulation",
  fCapex: "natureCapex",
  fOpex: "natureOperating",
  fReg: "natureRegulation",
};
