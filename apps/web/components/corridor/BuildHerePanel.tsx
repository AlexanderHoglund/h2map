"use client";

import { useTranslations } from "next-intl";
import { formatSig } from "@h2map/units";
import { capitalRecoveryFactor, computeBand } from "@h2map/corridor-engine";
import { ARCHETYPE_FOAK_MULTIPLIER } from "@h2map/corridor-schema";
import ResolvedField from "./ResolvedField";
import { LCOH_ENGINE_VERSION, type CorridorModel } from "./state";

/**
 * Build-here (v3): the evaluated site's production cost as FIVE overridable
 * components — H2 plant capital/operating (LCOH cost structure), synthesis
 * plant capital/operating (scale-corrected), logistics operating — summing
 * to the corridor's production CAPEX/OPEX lines. Derived values are a seed,
 * not a lock: editing one field flips only that field to override, with the
 * derived value retained as the restorable benchmark (ResolvedField).
 *
 * The delivered $/t on the chip is a DISPLAY figure (CRF at the corridor
 * WACC over the plant life) — never an input to the calculation. The
 * LCOH-internal rate is surfaced for transparency and warned about when it
 * differs materially from the corridor rate; it is never used.
 */

type ComponentKey =
  | "h2Capital"
  | "h2Operating"
  | "synthCapital"
  | "synthOperating"
  | "logisticsOperating";

const COMPONENT_ROWS: { key: ComponentKey; capex: boolean }[] = [
  { key: "h2Capital", capex: true },
  { key: "synthCapital", capex: true },
  { key: "h2Operating", capex: false },
  { key: "synthOperating", capex: false },
  { key: "logisticsOperating", capex: false },
];

export default function BuildHerePanel({
  model,
  side,
}: {
  model: CorridorModel;
  side: "green" | "fossil";
}) {
  const t = useTranslations("corridor.buildHere");
  const { scenario, update, resolved } = model;
  const s = scenario[side];
  const site = s.buildHere;

  if (!site) {
    return (
      <p className="sm:col-span-2 border border-dashed border-brand/50 bg-brand-tint px-2.5 py-2 text-[11px] leading-snug text-brand-deep">
        {t("pickOnMap")}
      </p>
    );
  }

  const comp = (c: { derivedUsdM: number; overrideUsdM: number | null }) =>
    c.overrideUsdM ?? c.derivedUsdM;
  const capexTotal =
    comp(site.components.h2Capital) + comp(site.components.synthCapital);
  const opexTotal =
    comp(site.components.h2Operating) +
    comp(site.components.synthOperating) +
    comp(site.components.logisticsOperating);

  // Display-only delivered $/t at the CORRIDOR's rate over the plant life —
  // the corridor engine itself discounts the raw CAPEX/OPEX lines.
  const corridorWacc = resolved?.wacc.value ?? 0.08;
  const demand = site.sizing.nameplateTonnesPerYear / site.sizing.nameplateMargin;
  const displayPerTonne =
    demand > 0
      ? ((capexTotal * capitalRecoveryFactor(corridorWacc, site.evaluated.plantLifeYears) +
          opexTotal) *
          1e6) /
        demand
      : 0;

  // Band (Task 5): vary the four sourced drivers across their published
  // ranges. The H2 block scales with electrolyser CAPEX and firming with the
  // firm multiplier; synthesis carries the scale exponent and FOAK.
  const crf = capitalRecoveryFactor(corridorWacc, site.evaluated.plantLifeYears);
  const h2Cap = comp(site.components.h2Capital);
  const synthCap = comp(site.components.synthCapital);
  const firmOpex = site.firming?.operatingUsdMPerYear ?? 0;
  const band =
    demand > 0
      ? computeBand((sample) => {
          const h2 = h2Cap * (sample.electrolyserCapex / 2300);
          const synth =
            (synthCap / (site.sizing.foakMultiplier || 1)) *
            sample.foak *
            (site.sizing.nameplateTonnesPerYear / 1_200_000) **
              (sample.scaleExponent - 0.6);
          const firm = firmOpex * (sample.firmMultiplier - 1) / 0.9;
          const capex = h2 + synth;
          const opex = opexTotal - firmOpex + firm;
          return ((capex * crf + opex) * 1e6) / demand;
        })
      : null;

  const rateGap = Math.abs(site.evaluated.lcohDiscountRate - corridorWacc);
  const engineMoved = site.evaluated.lcohEngineVersion !== LCOH_ENGINE_VERSION;

  const setOverride = (key: ComponentKey, v: number | null) =>
    update((d) => {
      const bh = d[side].buildHere;
      if (!bh) return;
      bh.components[key].overrideUsdM = v;
    });

  return (
    <div className="sm:col-span-2 space-y-2">
      {/* Lineage chip: the full chain, every element with provenance */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border border-emerald-300 bg-emerald-500/10 px-2.5 py-2 text-xs">
        <span className="font-semibold tabular-nums">
          ${Math.round(displayPerTonne).toLocaleString("en-US")}/t{" "}
          {band && (
            <span className="font-normal text-neutral-600">
              {t("bandRange", {
                low: Math.round(band.low).toLocaleString("en-US"),
                high: Math.round(band.high).toLocaleString("en-US"),
              })}{" "}
            </span>
          )}
          <span className="font-normal text-neutral-500">{t("displayOnly")}</span>
        </span>
        <span className="text-neutral-600">
          {t("chip", {
            cell: `${site.h3.slice(0, 6)}…`,
            lcoh: site.evaluated.lcohUsdPerKg.toFixed(2),
            rate: (site.evaluated.lcohDiscountRate * 100).toFixed(1),
            nameplate: Math.round(site.sizing.nameplateTonnesPerYear / 1000),
            scale: site.sizing.scaleFactor.toFixed(2),
            km: Math.round(site.sizing.distanceKm),
          })}
        </span>
        <span className="text-[11px] text-neutral-600">{t("repickNote")}</span>
      </div>

      {/* Project archetype — user-facing control #2. One selector moving
          FOAK, scale basis and firming together, because the previous
          defaults sat at the optimistic end of every parameter at once. */}
      <label className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-700">
        <span className="font-medium">{t("archetype")}</span>
        <select
          value={site.sizing.archetype ?? "noak-merchant"}
          onChange={(e) =>
            update((d) => {
              const sz = d[side].buildHere?.sizing;
              if (!sz) return;
              const next = e.target.value as NonNullable<typeof sz.archetype>;
              sz.archetype = next;
              sz.foakMultiplier = ARCHETYPE_FOAK_MULTIPLIER[next];
            })
          }
          className="border border-neutral-300 bg-white px-1.5 py-0.5 text-[11px]"
        >
          <option value="foak-dedicated">{t("archetypeFoak")}</option>
          <option value="noak-merchant">{t("archetypeNoak")}</option>
          <option value="match-study">{t("archetypeStudy")}</option>
        </select>
        <span className="text-neutral-500">
          {t("archetypeFoakFactor", { foak: site.sizing.foakMultiplier.toFixed(2) })}
        </span>
      </label>

      {/* Sizing line */}
      <p className="text-[11px] leading-snug text-neutral-600">
        {t("sizingLine", {
          demand: formatSig(demand),
          margin: site.sizing.nameplateMargin,
          nameplate: formatSig(site.sizing.nameplateTonnesPerYear),
          surplus: formatSig(site.sizing.surplusTonnesPerYear),
        })}
      </p>

      {/* Firm power: the site's duty vs what the carrier's loop needs.
          The ONE user-facing control the realism pass adds — it replaces
          what would otherwise be four or five separate parameters. */}
      {site.firming && (
        <div className="border border-amber-300 bg-amber-500/10 px-2.5 py-2 text-[11px] leading-snug text-amber-900">
          <p>
            {t("firmingHeadline", {
              evaluated: Math.round(site.firming.evaluatedDuty * 100),
              required: Math.round(site.firming.requiredDuty * 100),
            })}
          </p>
          <label className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="font-medium">{t("firmingStrategy")}</span>
            <select
              value={site.firming.strategy}
              onChange={(e) =>
                update((d) => {
                  const f = d[side].buildHere?.firming;
                  if (!f) return;
                  f.strategy = e.target.value as typeof f.strategy;
                  f.strategyOverridden = true;
                })
              }
              className="border border-amber-300 bg-white px-1.5 py-0.5 text-[11px]"
            >
              <option value="buffer-oversize">{t("firmingBuffer")}</option>
              <option value="firm-ppa">{t("firmingPpa")}</option>
              <option value="grid-hybrid">{t("firmingGrid")}</option>
            </select>
            {!site.firming.strategyOverridden && (
              <span className="text-amber-800">{t("firmingCheapest")}</span>
            )}
          </label>
          <p className="mt-1 tabular-nums">
            {t("firmingCost", {
              capital: site.firming.capitalUsdM.toFixed(2),
              operating: site.firming.operatingUsdMPerYear.toFixed(2),
            })}
            {site.firming.emissionsTco2PerYear > 0 &&
              ` · ${t("firmingEmissions", {
                tco2: formatSig(site.firming.emissionsTco2PerYear),
              })}`}
          </p>
        </div>
      )}

      {band?.largestDriver && (
        <p className="text-[11px] leading-snug text-neutral-500">
          {t("bandNote")}{" "}
          {t(`bandDriver.${band.largestDriver}`)}.
        </p>
      )}

      {/* Warnings: rate divergence + engine drift (never silent) */}
      {rateGap > 0.01 && (
        <p className="bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-amber-800">
          {t("rateWarning", {
            lcohRate: (site.evaluated.lcohDiscountRate * 100).toFixed(1),
            corridorRate: (corridorWacc * 100).toFixed(1),
          })}
        </p>
      )}
      {engineMoved && (
        <p className="bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-amber-800">
          {t("engineMoved", {
            evaluated: site.evaluated.lcohEngineVersion,
            current: LCOH_ENGINE_VERSION,
          })}
        </p>
      )}

      {/* The five components — derived seeds, individually overridable */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {COMPONENT_ROWS.map(({ key, capex }) => {
          const c = site.components[key];
          return (
            <ResolvedField
              key={key}
              label={t(`component.${key}`)}
              unit={capex ? "$m" : "$m/yr"}
              help={t(`componentHelp.${key}`)}
              override={c.overrideUsdM}
              effective={comp(c)}
              source={c.overrideUsdM !== null ? "override" : "derived"}
              benchmark={c.derivedUsdM}
              onChange={(v) => setOverride(key, v)}
            />
          );
        })}
        {/* The lines the corridor consumes (sums; read-only) */}
        <div className="text-[11px] leading-snug text-neutral-600 sm:col-span-2">
          {t("sumLine", {
            capex: capexTotal.toFixed(2),
            opex: opexTotal.toFixed(2),
          })}
        </div>
      </div>
      <p className="text-[10px] leading-snug text-neutral-500">{t("configNote")}</p>
    </div>
  );
}
