"use client";

/**
 * The probabilistic view — a first, deliberately simple pass.
 *
 * Everything above this in the Results tab is a single number. This draws that
 * number as a distribution instead: a symmetric bell centred on the computed
 * value, with a fixed ±% spread.
 *
 * WHAT THIS IS NOT, AND THAT IS THE POINT FOR NOW. It does not sample the
 * bundle's researched cost ranges, and the shape carries no information the
 * point estimate does not already have — the spread is an assumption, not a
 * measurement, so the curve is illustrative. It exists to show the shape of
 * the answer and to hold the place while the real distribution work is
 * decided.
 *
 * It renders straight from the result with no button and no run step, because
 * there is nothing to compute: the curve is a closed-form function of one
 * number, so it costs nothing and cannot go stale against the inputs above.
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
import { Card } from "@/components/ui/Card";
import { Note, SectionLabel } from "@/components/ui/Stat";
import { usdMShort } from "@/lib/corridor/format";
import { GRID_PROPS, X_AXIS_PROPS, Y_AXIS_PROPS } from "./charts";

/**
 * Half-width of the illustrated spread, as a fraction of the central value.
 * A round, honest placeholder — NOT derived from the researched bands.
 */
const SPREAD = 0.3;
/** Points across the curve. Enough to read as smooth at this size. */
const POINTS = 61;

/**
 * A symmetric bell over `central ± SPREAD`.
 *
 * A plain Gaussian shape, scaled so the peak is 1: only the SHAPE is shown,
 * never a density value, so the y-axis stays hidden and no reader can take a
 * probability off it. Sigma is a third of the half-width, which puts the
 * drawn range at about ±3 sigma and lets the tails land close to zero inside
 * the chart rather than being clipped.
 */
function curve(central: number): { x: number; y: number }[] {
  const half = Math.abs(central) * SPREAD;
  if (!(half > 0)) return [];
  const sigma = half / 3;
  return Array.from({ length: POINTS }, (_, i) => {
    const x = central - half + (2 * half * i) / (POINTS - 1);
    const z = (x - central) / sigma;
    return { x, y: Math.exp(-0.5 * z * z) };
  });
}

export function ProbabilisticSection({ gapPvUsdM }: { gapPvUsdM: number | null }) {
  const t = useTranslations("corridor.results");

  // Nothing to draw without a finite, non-zero central value — a corridor with
  // no gap has no spread to illustrate.
  if (gapPvUsdM === null || !Number.isFinite(gapPvUsdM) || gapPvUsdM === 0) {
    return null;
  }

  const data = curve(gapPvUsdM);
  const half = Math.abs(gapPvUsdM) * SPREAD;

  return (
    <Card as="section" className="mt-4">
      <SectionLabel>{t("probabilistic")}</SectionLabel>
      <p className="mt-1 text-xs leading-snug text-neutral-500">
        {t("probIntro")}
      </p>

      <div className="mt-3 h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis
              {...X_AXIS_PROPS}
              dataKey="x"
              type="number"
              domain={[gapPvUsdM - half, gapPvUsdM + half]}
              tickFormatter={(v: number) => usdMShort(v)}
            />
            {/* Hidden: the height is a shape, not a probability anyone should
                read a number off. */}
            <YAxis {...Y_AXIS_PROPS} hide domain={[0, 1.05]} />
            {/* No tooltip: the curve's height is not a readable quantity, and
                the axis plus the labelled centre below already carry every
                number worth taking off this chart. */}
            <ReferenceLine
              x={gapPvUsdM}
              stroke="var(--viz-reference)"
              strokeDasharray="4 3"
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

      <div className="mt-1 flex flex-wrap items-baseline gap-x-4 text-xs tabular-nums text-neutral-600">
        <span>
          {t("probCentre")}:{" "}
          <span className="font-medium text-neutral-900">
            {usdMShort(gapPvUsdM)}
          </span>
        </span>
        <span className="text-neutral-500">
          {usdMShort(gapPvUsdM - half)} – {usdMShort(gapPvUsdM + half)}
        </span>
      </div>

      <Note className="mt-3">{t("probCaveat")}</Note>
    </Card>
  );
}
