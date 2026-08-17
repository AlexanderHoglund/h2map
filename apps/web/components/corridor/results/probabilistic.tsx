"use client";

/**
 * The probabilistic view — a first, deliberately simple pass.
 *
 * Everything above this in the Results tab is a single number. This draws the
 * headline gap as a distribution instead: a symmetric bell centred on the
 * computed value with a fixed +/-30% half-width, plus the percentiles that
 * shape implies for each KPI.
 *
 * WHAT THIS IS NOT, AND THAT IS THE POINT FOR NOW. It does not sample the
 * bundle's researched cost ranges. The spread is an assumption, so the curve
 * and the table carry no information the point estimate does not already
 * have — every number here is the central value times a fixed factor. It
 * shows the SHAPE of the answer and holds the place while the real
 * distribution work is decided.
 *
 * It renders straight from the result with no button and no run step: the
 * whole thing is closed-form in one number, so it costs nothing and cannot go
 * stale against the inputs above.
 */

import React from "react";
import { useTranslations } from "next-intl";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import type { ScenarioSummary } from "@h2map/corridor-schema";
import { Card } from "@/components/ui/Card";
import { Note, SectionLabel } from "@/components/ui/Stat";
import { usdMShort } from "@/lib/corridor/format";
import { X_AXIS_PROPS, Y_AXIS_PROPS } from "./charts";

/**
 * Half-width of the illustrated spread, as a fraction of the central value.
 * A round, honest placeholder — NOT derived from the researched bands.
 */
const SPREAD = 0.3;
/**
 * The drawn half-width in standard deviations.
 *
 * Two, not three, so the chart and the table tell the SAME story: at 2 sigma
 * the P05-P95 span is +/-24.7%, near enough the +/-30% drawn edge to read as
 * one statement. At 3 sigma the table would say +/-16.4% while the axis said
 * +/-30%, and a reader comparing them would be right to think one was wrong.
 */
const SIGMAS = 2;
/** Points across the curve — dense enough to read as a smooth line. */
const POINTS = 121;

/** Standard-normal z for each percentile shown in the table. */
const PERCENTILES = [
  { p: 5, z: -1.6449 },
  { p: 10, z: -1.2816 },
  { p: 25, z: -0.6745 },
  { p: 50, z: 0 },
  { p: 75, z: 0.6745 },
  { p: 90, z: 1.2816 },
  { p: 95, z: 1.6449 },
] as const;

/**
 * The subset that gets its own line on the chart.
 *
 * Seven lines on a curve this size is clutter — P10/P90 sit close enough to
 * P05/P95 that their labels would overlap — so the chart marks the quartiles
 * and the outer edges, and the table carries the full set.
 */
const CHART_MARKS = [5, 25, 50, 75, 95] as const;

/** The KPIs the table covers, with their formatting. */
const ROWS = [
  { key: "gapPvUsdM", fmt: usdMShort },
  { key: "greenTotalPvUsdM", fmt: usdMShort },
  { key: "fossilTotalPvUsdM", fmt: usdMShort },
  { key: "costPerUnitUsd", fmt: (v: number) => `$${v.toFixed(0)}` },
  { key: "costPerTonneCo2Usd", fmt: (v: number) => `$${v.toFixed(0)}` },
] as const satisfies readonly { key: keyof ScenarioSummary; fmt: (v: number) => string }[];

/**
 * A symmetric bell over `central ± SPREAD`.
 *
 * Scaled so the peak is 1: only the SHAPE is shown, never a density value, so
 * the y-axis stays hidden and no reader can take a probability off it.
 */
function curve(central: number, half: number): { x: number; y: number }[] {
  const sigma = half / SIGMAS;
  return Array.from({ length: POINTS }, (_, i) => {
    const x = central - half + (2 * half * i) / (POINTS - 1);
    const z = (x - central) / sigma;
    return { x, y: Math.exp(-0.5 * z * z) };
  });
}

export function ProbabilisticSection({ summary }: { summary: ScenarioSummary | null }) {
  const t = useTranslations("corridor.results");

  const central = summary?.gapPvUsdM ?? null;
  // Nothing to draw without a finite, non-zero central value — a corridor with
  // no gap has no spread to illustrate.
  if (summary === null || central === null || !Number.isFinite(central) || central === 0) {
    return null;
  }

  const half = Math.abs(central) * SPREAD;
  const data = curve(central, half);
  const sigma = half / SIGMAS;
  /** The same fixed factor is applied to every KPI — see the header. */
  const factor = (z: number) => 1 + (SPREAD * z) / SIGMAS;
  const marks = PERCENTILES.filter((q) =>
    (CHART_MARKS as readonly number[]).includes(q.p),
  );

  return (
    <Card as="section" className="mt-4">
      <SectionLabel>{t("probabilistic")}</SectionLabel>
      <p className="mt-1 text-xs leading-snug text-neutral-500">{t("probIntro")}</p>

      <div className="mt-3 h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {/* `top: 28` and the 1.28 y-domain together reserve a band above the
              peak for the P50 label. The label sits ABOVE the reference line,
              which runs to the top of the domain — with the old 1.08 domain
              and an 8px margin it had nowhere to go and was clipped by the
              card. */}
          <AreaChart data={data} margin={{ top: 28, right: 12, bottom: 4, left: 12 }}>
            {/* VERTICAL grid here, the opposite of the shared GRID_PROPS.
                The shared kit draws horizontal lines keyed to y-ticks, and
                this chart hides its y-axis — so the default grid rendered
                nothing at all. On a distribution the x-axis carries all the
                information, so the useful rules are the vertical ones. */}
            <CartesianGrid
              horizontal={false}
              vertical
              stroke="var(--viz-grid)"
            />
            <XAxis
              {...X_AXIS_PROPS}
              dataKey="x"
              type="number"
              domain={[central - half, central + half]}
              // Ticks at the marked percentiles, so chart and table line up by
              // eye rather than only by arithmetic.
              ticks={marks.map((q) => central + sigma * q.z)}
              tickFormatter={(v: number) => usdMShort(v)}
            />
            {/* Hidden: the height is a shape, not a probability anyone should
                read a number off. */}
            <YAxis {...Y_AXIS_PROPS} hide domain={[0, 1.28]} />

            {/* Every percentile the table lists gets its own line, labelled
                with the band it opens, so the curve can be read without
                cross-referencing the table. P50 is the emphasised one. */}
            {marks.filter((q) => q.p !== 50).map((q) => (
              <ReferenceLine
                key={q.p}
                x={central + sigma * q.z}
                stroke="var(--viz-grid)"
                strokeDasharray="2 3"
                label={{
                  value: `P${q.p}`,
                  // `insideTop`, not `top`: these labels are lower than the
                  // P50 one, which keeps the band above the peak clear for
                  // the central value and stops the P25/P75 labels colliding
                  // with it as the curve narrows.
                  position: "insideTop",
                  fontSize: 10,
                  fill: "var(--viz-ink-muted)",
                }}
              />
            ))}
            <ReferenceLine
              x={central}
              stroke="var(--viz-reference)"
              strokeDasharray="4 3"
              label={{
                value: `P50 ${usdMShort(central)}`,
                position: "top",
                fontSize: 11,
                fontWeight: 500,
                fill: "var(--viz-ink-secondary)",
              }}
            />

            <Area
              dataKey="y"
              stroke="var(--viz-anchor)"
              fill="var(--viz-anchor)"
              fillOpacity={0.15}
              strokeWidth={2}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
              <th className="py-1 pr-3 font-medium">{t("probKpi")}</th>
              {PERCENTILES.map((q) => (
                <th
                  key={q.p}
                  className="py-1 pr-3 text-right font-medium tabular-nums last:pr-0"
                >
                  P{q.p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.key} className="border-b border-neutral-100 last:border-0">
                <td className="py-1 pr-3 text-neutral-700">{t(`kpi.${row.key}`)}</td>
                {PERCENTILES.map((q) => (
                  <td
                    key={q.p}
                    className={`py-1 pr-3 text-right tabular-nums last:pr-0 ${
                      q.p === 50 ? "font-medium text-neutral-900" : "text-neutral-700"
                    }`}
                  >
                    {row.fmt(summary[row.key] * factor(q.z))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Note className="mt-3">{t("probCaveat")}</Note>
    </Card>
  );
}
