"use client";

/**
 * What actually drives THIS corridor.
 *
 * The §20 sweep and the elasticity artifact both answer questions about
 * reference scenarios. This answers one about the scenario on screen, and it
 * is the only place the two halves of impact meet: LEVERAGE is how hard an
 * input pushes (a property of the model), EXPOSURE is how uncertain that input
 * actually is (researched, cited, versioned in
 * `data/input-uncertainty-ref/`). A field can have huge leverage and be known
 * precisely; another can be a coin-flip that barely matters. Only the product
 * tells you where the risk is.
 *
 * EVERY BAR IS TWO REAL ENGINE EVALUATIONS at the declared bounds — never an
 * elasticity multiplied by a width. The arithmetic lives in
 * `lib/corridor/tornado.ts` so it can be tested without React.
 *
 * The provenance line under each bar is the point of the whole panel: when
 * someone challenges a range — and they will — the answer is on screen. The
 * leverage is the model's, the range is declared and cited, and changing the
 * range rescales the bar.
 */

import React, { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { ScenarioInput } from "@h2map/corridor-schema";
import { parseUncertaintyDataset } from "@h2map/corridor-schema";
import { Card } from "@/components/ui/Card";
import { Note, SectionLabel } from "@/components/ui/Stat";
import { usdMShort } from "@/lib/corridor/format";
import { buildTornado, TORNADO_KPIS, type TornadoKpi } from "@/lib/corridor/tornado";
import { DEFAULT_BUNDLE } from "../state";
import uncertaintyJson from "../../../../../data/input-uncertainty-ref/2026-08-19-uncertainty-v1.json";

/** Parsed once at module load, exactly as `state.ts` does with the bundle. */
const UNCERTAINTY = parseUncertaintyDataset(uncertaintyJson);

/**
 * Which scoped ranges apply to a user's own scenario.
 *
 * The archetypes are reference corridors, and a user's scenario is not one of
 * them. Scoped rows exist because a researched range can be fuel- or
 * class-specific — the e-methanol price is wrong on an ammonia corridor — so
 * an arbitrary scenario is matched on the property the scope is really about
 * rather than being handed one archetype's ranges wholesale.
 */
function scopeKeyFor(scenario: ScenarioInput): string {
  const green = (scenario as unknown as Record<string, Record<string, unknown>>).green;
  const fuelId = String(green?.fuelId ?? "");
  // C is the methanol archetype; A and B run ammonia. Anything else falls to
  // A, whose ranges are the class-agnostic ones (energy demand, WACC,
  // inflation) plus a bulk-carrier vessel band.
  return fuelId === "e-methanol" ? "C" : "A";
}

const KPI_FORMAT: Record<TornadoKpi, (v: number) => string> = {
  gapPvUsdM: usdMShort,
  greenTotalPvUsdM: usdMShort,
  fossilTotalPvUsdM: usdMShort,
  costPerUnitUsd: (v) => `$${v.toFixed(0)}`,
  costPerTonneCo2Usd: (v) => `$${v.toFixed(0)}`,
  co2AbatedTonnes: (v) => `${(v / 1000).toFixed(0)}k t`,
};

/**
 * A dataset id as an i18n message key.
 *
 * next-intl reserves "." for NESTING, so a key of `cargo.wacc` is read as
 * `cargo` -> `wacc` and the provider throws INVALID_KEY at the root layout —
 * taking the whole app down, not just this panel. The ids themselves keep
 * their dots: they are the join between the uncertainty dataset, the sweep
 * parameters and the coupling groups, and renaming them there would break
 * that contract to satisfy a message-format quirk. So they are slugified at
 * the lookup boundary instead, and `tornado.test.ts` asserts every id has a
 * key under its slugified name.
 */
const messageKey = (id: string): string => id.replace(/\./g, "-");

/** The declared range in its own units — "$70–82m", "−5%…+12%". */
function rangeLabel(low: number, high: number, unit: string): string {
  if (unit.startsWith("fraction of")) {
    const pct = (v: number) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(0)}%`;
    return `${pct(low)}…${pct(high)}`;
  }
  if (unit.startsWith("percentage points")) return `${low}–${high}%`;
  if (unit.startsWith("USD million")) return `$${low}–${high}m`;
  if (unit.startsWith("USD per tonne")) return `$${low}–${high}/t`;
  return `${low}–${high}`;
}

export function TornadoSection({ scenario }: { scenario: ScenarioInput | null }) {
  const t = useTranslations("corridor.results");
  const [kpi, setKpi] = useState<TornadoKpi>("gapPvUsdM");

  const scopeKey = scenario ? scopeKeyFor(scenario) : "A";
  const tornado = useMemo(
    () =>
      scenario
        ? buildTornado(scenario, DEFAULT_BUNDLE, UNCERTAINTY, kpi, scopeKey)
        : null,
    [scenario, kpi, scopeKey],
  );

  if (!tornado || tornado.bars.length === 0) return null;

  const fmt = KPI_FORMAT[kpi];
  // One shared axis across every bar, so bar LENGTH is comparable — a
  // per-bar axis would make the smallest driver look like the largest.
  const lo = Math.min(...tornado.bars.map((b) => Math.min(b.low, b.high)), tornado.base);
  const hi = Math.max(...tornado.bars.map((b) => Math.max(b.low, b.high)), tornado.base);
  const pad = (hi - lo) * 0.06 || 1;
  const axisLo = lo - pad;
  const axisHi = hi + pad;
  const pct = (v: number) => ((v - axisLo) / (axisHi - axisLo)) * 100;

  return (
    <Card as="section" className="mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionLabel>{t("tornado")}</SectionLabel>
        <label className="flex items-center gap-2 text-xs text-neutral-600">
          {t("tornadoKpiLabel")}
          <select
            value={kpi}
            onChange={(e) => setKpi(e.target.value as TornadoKpi)}
            className="border border-neutral-300 bg-white px-2 py-1 text-xs"
          >
            {TORNADO_KPIS.map((k) => (
              <option key={k} value={k}>
                {t(`kpi.${k}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-1 text-xs leading-snug text-neutral-500">{t("tornadoIntro")}</p>

      <div className="mt-4 space-y-2.5">
        {tornado.bars.map((b) => {
          const left = Math.min(pct(b.low), pct(b.high));
          const width = Math.abs(pct(b.high) - pct(b.low));
          return (
            <div key={b.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
                <span className="font-medium text-neutral-800">
                  {t(`tornadoRow.${messageKey(b.id)}`)}
                  {b.coupled && (
                    <span className="ml-1.5 font-normal text-neutral-500">
                      {t("tornadoCoupled")}
                    </span>
                  )}
                  {!b.verified && (
                    <span className="ml-1.5 font-normal text-amber-700">
                      {t("tornadoUnverified")}
                    </span>
                  )}
                </span>
                <span className="tabular-nums text-neutral-600">
                  {rangeLabel(b.rangeLow, b.rangeHigh, b.unit)} → {fmt(Math.min(b.low, b.high))}
                  –{fmt(Math.max(b.low, b.high))}
                </span>
              </div>
              <div className="relative mt-1 h-5 w-full bg-neutral-100">
                {/* The baseline, drawn behind every bar so the reader can see
                    which direction each range pushes. */}
                <div
                  className="absolute inset-y-0 w-px bg-neutral-400"
                  style={{ left: `${pct(tornado.base)}%` }}
                />
                <div
                  className="absolute inset-y-1"
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(width, 0.4)}%`,
                    background: "var(--viz-anchor)",
                  }}
                  title={b.uncertaintyBasis}
                />
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-neutral-500">
                {b.uncertaintyBasis}
              </p>
            </div>
          );
        })}
      </div>

      {tornado.inapplicable.length > 0 && (
        <Note className="mt-3">
          {t("tornadoInapplicable")}:{" "}
          {tornado.inapplicable.map((i) => `${t(`tornadoRow.${messageKey(i.id)}`)} (${i.reason})`).join("; ")}
        </Note>
      )}

      <Note className="mt-3">{t("tornadoCaveat")}</Note>
    </Card>
  );
}
