"use client";

/**
 * The probabilistic section — the corridor as a distribution, not a point.
 *
 * Everything above this in the Results tab is a single number per figure. The
 * bundle's researched production parameters each ship as a sourced
 * {low, central, high} band, so the model already knows how uncertain those
 * inputs are; it simply never showed it. This runs the corridor many times
 * across those bands and reports percentiles.
 *
 * DELIBERATELY BEHIND A BUTTON, and deliberately last. The deterministic
 * report is what the rest of the tab means, and a distribution rendered
 * alongside it invites reading one as a correction of the other. It is opt-in,
 * it sits below everything, and it says in its own copy what it sampled.
 *
 * The run is synchronous: a full resolve + evaluate costs ~0.05 ms, so a few
 * thousand draws finish inside one interaction with no worker and no spinner.
 */

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ScenarioInput } from "@h2map/corridor-schema";
import type { McResult, SampledKey } from "@h2map/corridor-engine";
import { runMonteCarlo } from "@h2map/corridor-engine";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Note, SectionLabel } from "@/components/ui/Stat";
import { usdMShort } from "@/lib/corridor/format";
import { DEFAULT_BUNDLE } from "../state";
import { GRID_PROPS, X_AXIS_PROPS, Y_AXIS_PROPS } from "./charts";
import { warnIfDominated } from "./guard";

/** Draws per run. 2,000 is stable to the nearest $1m and still sub-200 ms. */
const RUNS = 2000;
/** Fixed seed: the same scenario must always produce the same percentiles. */
const SEED = 1;
/** Histogram resolution. */
const BINS = 28;

/** How each KPI is rendered. `usdM` values share the compact $m formatter. */
const KPI_FORMAT: Record<string, (v: number) => string> = {
  gapPvUsdM: usdMShort,
  greenTotalPvUsdM: usdMShort,
  fossilTotalPvUsdM: usdMShort,
  costPerUnitUsd: (v) => `$${v.toFixed(0)}/t`,
  costPerTonneCo2Usd: (v) => `$${v.toFixed(0)}/tCO2e`,
  co2AbatedTonnes: (v) => `${(v / 1000).toFixed(0)}k t`,
};

const fmt = (kpi: string, v: number): string =>
  Number.isFinite(v) ? (KPI_FORMAT[kpi] ?? ((x: number) => x.toFixed(1)))(v) : "—";

/** Equal-width bins over the sampled headline values. */
function histogram(sorted: readonly number[]): { x: number; n: number }[] {
  if (sorted.length === 0) return [];
  const lo = sorted[0]!;
  const hi = sorted[sorted.length - 1]!;
  if (!(hi > lo)) return [{ x: lo, n: sorted.length }];
  const width = (hi - lo) / BINS;
  const bins = Array.from({ length: BINS }, (_, i) => ({
    x: lo + width * (i + 0.5),
    n: 0,
  }));
  for (const v of sorted) {
    const i = Math.min(BINS - 1, Math.floor((v - lo) / width));
    bins[i]!.n += 1;
  }
  return bins;
}

export function ProbabilisticSection({
  scenario,
  ready,
}: {
  scenario: ScenarioInput;
  /** False when the scenario cannot be evaluated — the button explains why. */
  ready: boolean;
}) {
  const t = useTranslations("corridor.results");
  const [run, setRun] = useState<McResult | null>(null);
  const [ranFor, setRanFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The corridor recomputes on every keystroke, so a completed run goes stale
  // the moment anything is edited. Say so rather than show numbers that no
  // longer describe the inputs on screen.
  const signature = JSON.stringify(scenario);
  const stale = run !== null && ranFor !== signature;

  const headline = run?.distributions.find((d) => d.kpi === "gapPvUsdM");
  const bins = run ? histogram(run.headlineSorted) : [];

  // The dominance guard is aimed at the SAMPLED VALUES, not the bin counts.
  // A healthy distribution is peaked by definition — its modal bin routinely
  // exceeds 5x the median bin — so guarding the counts would warn on correct
  // output. Guarding the values catches the case the rule is actually about:
  // one draw so extreme it sets the axis and flattens everything else.
  if (run && run.headlineSorted.length > 0) {
    warnIfDominated("probabilistic-headline", run.headlineSorted, {
      separated: false,
    });
  }

  return (
    <Card as="section" className="mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionLabel>{t("probabilistic")}</SectionLabel>
        <Button
          variant="primary"
          disabled={!ready || busy}
          onClick={() => {
            // The run is synchronous (~0.5s for 2,000 draws), so it would
            // otherwise block the paint and the button would sit unchanged
            // until results appeared. Flip to a pending label first and let
            // the browser render one frame before starting.
            setBusy(true);
            requestAnimationFrame(() => {
              setRun(runMonteCarlo(scenario, DEFAULT_BUNDLE, { runs: RUNS, seed: SEED }));
              setRanFor(signature);
              setBusy(false);
            });
          }}
        >
          {busy ? t("probRunning") : run ? t("probRerun") : t("probRun")}
        </Button>
      </div>

      <p className="mt-1 text-xs leading-snug text-neutral-500">
        {t("probIntro")}
      </p>

      {!ready && <Note className="mt-2">{t("probUnavailable")}</Note>}

      {run?.degenerate && (
        // Not a failure — the scenario simply overrides the inputs this
        // samples, so there is nothing to vary. Saying that is far better
        // than drawing a single-spike histogram, which reads as certainty.
        <Note className="mt-3">{t("probDegenerate")}</Note>
      )}

      {run && !run.degenerate && (
        <>
          {stale && <Note className="mt-3">{t("probStale")}</Note>}

          {headline && (
            <div className="mt-4">
              <div className="text-xs text-neutral-500">{t("probHeadline")}</div>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="text-2xl font-semibold tabular-nums text-neutral-900">
                  {fmt("gapPvUsdM", headline.percentiles[50]!)}
                </span>
                <span className="text-sm tabular-nums text-neutral-600">
                  {t("probRange")}: {fmt("gapPvUsdM", headline.percentiles[5]!)} –{" "}
                  {fmt("gapPvUsdM", headline.percentiles[95]!)}
                </span>
                <span className="text-xs tabular-nums text-neutral-500">
                  {t("probPoint")}: {fmt("gapPvUsdM", headline.deterministic)}
                </span>
              </div>
            </div>
          )}

          <div className="mt-3 h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bins} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis
                  {...X_AXIS_PROPS}
                  dataKey="x"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(v: number) => usdMShort(v)}
                />
                <YAxis {...Y_AXIS_PROPS} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: "var(--viz-grid)" }}
                  formatter={(v) => [`${Number(v)}`, t("probDraws")]}
                  labelFormatter={(v) => usdMShort(Number(v))}
                />
                {headline && (
                  <ReferenceLine
                    x={headline.deterministic}
                    stroke="var(--viz-reference)"
                    strokeDasharray="4 3"
                  />
                )}
                <Bar dataKey="n" fill="var(--viz-anchor)" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-136 text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                  <th className="py-1 pr-3 font-medium">{t("probKpi")}</th>
                  {[5, 25, 50, 75, 95].map((p) => (
                    <th key={p} className="py-1 pr-3 text-right font-medium tabular-nums">
                      P{p}
                    </th>
                  ))}
                  <th className="py-1 text-right font-medium">{t("probPoint")}</th>
                </tr>
              </thead>
              <tbody>
                {run.distributions.map((d) => (
                  <tr key={d.kpi} className="border-b border-neutral-100 last:border-0">
                    <td className="py-1 pr-3 text-neutral-700">{t(`kpi.${d.kpi}`)}</td>
                    {[5, 25, 50, 75, 95].map((p) => (
                      <td
                        key={p}
                        className="py-1 pr-3 text-right tabular-nums text-neutral-800"
                      >
                        {fmt(d.kpi, d.percentiles[p]!)}
                      </td>
                    ))}
                    <td className="py-1 text-right tabular-nums text-neutral-500">
                      {fmt(d.kpi, d.deterministic)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {run.largestDriver && (
            <p className="mt-3 text-xs leading-snug text-neutral-600">
              {t("probDriver")}:{" "}
              <span className="font-medium text-neutral-800">
                {t(`probParam.${run.largestDriver satisfies SampledKey}`)}
              </span>
              {run.contributions.length > 1 && (
                <>
                  {" "}
                  <span className="text-neutral-500">
                    (
                    {run.contributions
                      .map(
                        (c) =>
                          `${t(`probParam.${c.key}`)} ${usdMShort(c.swing)}`,
                      )
                      .join(" · ")}
                    )
                  </span>
                </>
              )}
            </p>
          )}

          <Note className="mt-3">{t("probCaveat")}</Note>
        </>
      )}
    </Card>
  );
}
