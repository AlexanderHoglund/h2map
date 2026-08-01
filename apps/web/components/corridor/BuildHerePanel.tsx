"use client";

import { useTranslations } from "next-intl";
import { capitalRecoveryFactor } from "@h2map/corridor-engine";
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

      {/* Sizing line */}
      <p className="text-[11px] leading-snug text-neutral-600">
        {t("sizingLine", {
          demand: Math.round(demand).toLocaleString("en-US"),
          margin: site.sizing.nameplateMargin,
          nameplate: Math.round(site.sizing.nameplateTonnesPerYear).toLocaleString("en-US"),
          surplus: Math.round(site.sizing.surplusTonnesPerYear).toLocaleString("en-US"),
        })}
      </p>

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
