"use client";

import { useTranslations } from "next-intl";
import type { ScenarioInput } from "@h2map/corridor-schema";
import { NumberInput } from "@/components/ui/NumberInput";
import { Select } from "@/components/ui/Select";
import { TextInput } from "@/components/ui/TextInput";
import { SwitchRow } from "@/components/ui/Switch";
import { Section, Advanced } from "@/components/ui/Card";
import ResolvedField from "./ResolvedField";
import SelectField from "./SelectField";
import CorridorRouteMap from "./CorridorRouteMap";
import RoutedDistanceField from "./RoutedDistanceField";
import { useSeaRoute } from "./useSeaRoute";
import BuildHerePanel from "./BuildHerePanel";
import { CORRIDOR_COUNTRIES } from "@/lib/corridor-countries";
import { defaultScenario, isAdvanced, type CorridorModel } from "./state";

/**
 * The five wizard steps of the corridor model (build-plan 3.1).
 * Every benchmarkable input renders through ResolvedField; field prominence
 * (top-level vs the Advanced fold) comes from the sensitivity-derived
 * ui-manifest (build-plan 3.2) — the interface tracks the model.
 */

interface StepProps {
  model: CorridorModel;
  /** Simple hides the sensitivity-ranked advanced set; Advanced shows all. */
  viewMode: "simple" | "advanced";
  /** "Switch to Advanced" from a hidden-settings strip. */
  revealAdvanced: () => void;
}

// ---------------------------------------------------------------------------
// Shared primitives (components/ui) + thin corridor bindings
// ---------------------------------------------------------------------------

/** Advanced fold labeled from the corridor namespace. */
function AdvancedFold({ children }: { children: React.ReactNode }) {
  const t = useTranslations("corridor.field");
  return <Advanced label={t("advanced")}>{children}</Advanced>;
}

/**
 * What stands in for hidden advanced content in Simple mode. With no
 * user-set values among the hidden fields, a muted one-liner says the tab
 * has more under Advanced. With N of them set, the strip turns emphatic:
 * hidden inputs that silently shape the result are exactly the class of
 * problem this tool tries not to have, so they are counted, named as in
 * effect, and one click away from review.
 */
function AdvancedHiddenStrip({
  count,
  onReveal,
}: {
  count: number;
  onReveal: () => void;
}) {
  const t = useTranslations("corridor.viewMode");
  if (count === 0) {
    return (
      <p className="sm:col-span-2 text-[11px] text-neutral-500">{t("hiddenNote")}</p>
    );
  }
  return (
    <p className="sm:col-span-2 flex items-center gap-2 bg-brand-tint px-2.5 py-1.5 text-[11px] text-brand-deep">
      <span>{t("hiddenActive", { count })}</span>
      <button type="button" onClick={onReveal} className="font-medium underline">
        {t("switchToAdvanced")}
      </button>
    </p>
  );
}

/** Places a field in the main grid or collects it for the Advanced fold.
 *  `overridden` marks entries whose value the user has set — Simple mode
 *  reports how many of those it is hiding. */
function splitByManifest(
  entries: { id: string; node: React.ReactNode; overridden?: boolean }[],
): { main: React.ReactNode[]; advanced: React.ReactNode[]; advancedOverrides: number } {
  const main: React.ReactNode[] = [];
  const advanced: React.ReactNode[] = [];
  let advancedOverrides = 0;
  for (const e of entries) {
    if (isAdvanced(e.id)) {
      advanced.push(e.node);
      if (e.overridden) advancedOverrides += 1;
    } else {
      main.push(e.node);
    }
  }
  return { main, advanced, advancedOverrides };
}

// ---------------------------------------------------------------------------
// Step 1 — Cargo & Corridor
// ---------------------------------------------------------------------------

/** Bounded year selectors (slide 3's dropdown triangles). The start-year
 *  range covers realistic corridor planning — the zod schema stays wider
 *  (2000–2100) and an out-of-range stored value is prepended, never moved.
 *  The horizon honours the schema's ≤40 cap exactly. */
const START_YEARS = Array.from({ length: 31 }, (_, i) => 2025 + i); // 2025–2055
const HORIZON_YEARS = Array.from({ length: 40 }, (_, i) => 1 + i); // 1–40
/** Reference defaults the selectors' badges compare against ([S] values). */
const CARGO_DEFAULTS = defaultScenario().cargo;
/** Regulation reference defaults — Simple mode counts hidden departures. */
const REG_DEFAULTS = defaultScenario().regulation;

export function CargoStep({ model, viewMode, revealAdvanced }: StepProps) {
  const t = useTranslations("corridor.cargo");
  const tr = useTranslations("corridor.regulation");
  const { scenario, update } = model;

  const twoPorts = scenario.cargo.routeType === "point-to-point";
  const route = useSeaRoute(
    scenario.cargo.portACoords,
    twoPorts ? scenario.cargo.portBCoords : undefined,
  );

  const fields = splitByManifest([
    {
      id: "cargo.oneWayDistanceNm",
      node: (
        <RoutedDistanceField
          key="dist"
          label={t("distance")}
          value={scenario.cargo.oneWayDistanceNm}
          route={route}
          onChange={(v) =>
            update((d) => {
              d.cargo.oneWayDistanceNm = v;
              // A typed value is the user's own figure — the adopted-route
              // provenance no longer describes it.
              if (d.cargo.routedDistance && d.cargo.routedDistance.nm !== v) {
                delete d.cargo.routedDistance;
              }
            })
          }
          onAdopt={(nm, graphVersion, via) =>
            update((d) => {
              d.cargo.oneWayDistanceNm = nm;
              d.cargo.routedDistance = { nm, graphVersion, via };
            })
          }
        />
      ),
    },
    {
      id: "cargo.startYear",
      node: (
        <SelectField
          key="start"
          label={t("startYear")}
          value={scenario.cargo.startYear}
          options={START_YEARS}
          benchmark={CARGO_DEFAULTS.startYear}
          onChange={(v) => update((d) => void (d.cargo.startYear = v))}
        />
      ),
    },
    {
      id: "cargo.horizonYears",
      node: (
        <SelectField
          key="horizon"
          label={t("horizon")}
          value={scenario.cargo.horizonYears}
          options={HORIZON_YEARS}
          benchmark={CARGO_DEFAULTS.horizonYears}
          onChange={(v) => update((d) => void (d.cargo.horizonYears = v))}
        />
      ),
    },
  ]);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label={t("routeType")}
          value={scenario.cargo.routeType}
          options={[
            { value: "point-to-point", label: "Point-to-point" },
            { value: "single-point", label: "Single point" },
          ]}
          onChange={(v) =>
            update((d) => void (d.cargo.routeType = v as ScenarioInput["cargo"]["routeType"]))
          }
        />
        <div />
        {/* Each end of the corridor is its own discrete box — country first
            (the constraining choice: WACC benchmark, regulatory regime),
            then the port name, then the coordinates that drive the map
            below. Side by side, A left, B right. */}
        <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
          <div className="space-y-3 rounded-lg border border-neutral-200 p-3">
            <p className="text-[10px] font-medium uppercase tracking-widest text-neutral-500">
              {twoPorts ? t("portA") : t("singlePort")}
            </p>
            <Select
              label={twoPorts ? t("countryA") : t("country")}
              help={t("countryHelp")}
              value={scenario.cargo.countryId}
              options={CORRIDOR_COUNTRIES}
              onChange={(v) => update((d) => void (d.cargo.countryId = v))}
            />
            <TextInput
              label={twoPorts ? t("portA") : t("singlePort")}
              value={scenario.cargo.portAName ?? ""}
              onChange={(v) => update((d) => void (d.cargo.portAName = v || undefined))}
            />
            <div className="grid grid-cols-2 gap-3">
              <NumberInput
                label={t("portALat")}
                unit="°"
                step={0.01}
                help={t("portCoordsHelp")}
                value={scenario.cargo.portACoords?.lat ?? null}
                onChange={(v) =>
                  update(
                    (d) =>
                      void (d.cargo.portACoords = {
                        lat: Math.min(90, Math.max(-90, v)),
                        lon: d.cargo.portACoords?.lon ?? 0,
                      }),
                  )
                }
              />
              <NumberInput
                label={t("portALon")}
                unit="°"
                step={0.01}
                help={t("portCoordsHelp")}
                value={scenario.cargo.portACoords?.lon ?? null}
                onChange={(v) =>
                  update(
                    (d) =>
                      void (d.cargo.portACoords = {
                        lat: d.cargo.portACoords?.lat ?? 0,
                        lon: Math.min(180, Math.max(-180, v)),
                      }),
                  )
                }
              />
            </div>
          </div>
          {twoPorts && (
            <div className="space-y-3 rounded-lg border border-neutral-200 p-3">
              <p className="text-[10px] font-medium uppercase tracking-widest text-neutral-500">
                {t("portB")}
              </p>
              <Select
                label={t("countryB")}
                value={scenario.cargo.countryBId ?? scenario.cargo.countryId}
                options={CORRIDOR_COUNTRIES}
                onChange={(v) => update((d) => void (d.cargo.countryBId = v))}
              />
              <TextInput
                label={t("portB")}
                value={scenario.cargo.portBName ?? ""}
                onChange={(v) => update((d) => void (d.cargo.portBName = v || undefined))}
              />
              <div className="grid grid-cols-2 gap-3">
                <NumberInput
                  label={t("portBLat")}
                  unit="°"
                  step={0.01}
                  help={t("portBCoordsHelp")}
                  value={scenario.cargo.portBCoords?.lat ?? null}
                  onChange={(v) =>
                    update(
                      (d) =>
                        void (d.cargo.portBCoords = {
                          lat: Math.min(90, Math.max(-90, v)),
                          lon: d.cargo.portBCoords?.lon ?? 0,
                        }),
                    )
                  }
                />
                <NumberInput
                  label={t("portBLon")}
                  unit="°"
                  step={0.01}
                  help={t("portBCoordsHelp")}
                  value={scenario.cargo.portBCoords?.lon ?? null}
                  onChange={(v) =>
                    update(
                      (d) =>
                        void (d.cargo.portBCoords = {
                          lat: d.cargo.portBCoords?.lat ?? 0,
                          lon: Math.min(180, Math.max(-180, v)),
                        }),
                    )
                  }
                />
              </div>
            </div>
          )}
        </div>
        {/* The corridor as the ship actually sails it (slide 3's reserved
            block): routed over the maritime network, canal transits marked,
            degrading to a great-circle schematic when routing cannot. */}
        <CorridorRouteMap
          routeType={scenario.cargo.routeType}
          portA={{ name: scenario.cargo.portAName, coords: scenario.cargo.portACoords }}
          portB={{ name: scenario.cargo.portBName, coords: scenario.cargo.portBCoords }}
          route={route}
          typedDistanceNm={scenario.cargo.oneWayDistanceNm}
          site={
            scenario.green.sourcing === "build-here" && scenario.green.buildHere
              ? { lat: scenario.green.buildHere.lat, lon: scenario.green.buildHere.lon }
              : null
          }
        />
        {fields.main}
        {/* Everything standard on this tab — no Advanced fold. */}
        {viewMode === "advanced" ? (
          fields.advanced
        ) : fields.advanced.length > 0 ? (
          <AdvancedHiddenStrip count={fields.advancedOverrides} onReveal={revealAdvanced} />
        ) : null}
        {/* Model options (moved from Regulation — slide 3): the basis the
            whole comparison is read on belongs with the framing, not the
            schemes. Keys stay flags.*; i18n stays corridor.regulation. */}
        <Select
          label={tr("emissionsBasis")}
          value={scenario.flags?.emissionsBasis ?? "combustion"}
          options={[
            { value: "combustion", label: tr("basisCombustion") },
            { value: "wellToWake", label: tr("basisWtw") },
          ]}
          onChange={(v) =>
            update(
              (d) =>
                void (d.flags = {
                  ...d.flags,
                  emissionsBasis: v as "combustion" | "wellToWake",
                }),
            )
          }
        />
        <Select
          label={tr("rateBasis")}
          value={scenario.flags?.rateBasis ?? "nominal"}
          options={[
            { value: "nominal", label: tr("rateNominal") },
            { value: "real", label: tr("rateReal") },
          ]}
          onChange={(v) =>
            update((d) => void (d.flags = { ...d.flags, rateBasis: v as "nominal" | "real" }))
          }
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step — Cargo (the MMMCZCS Cargo domain's own tab)
// ---------------------------------------------------------------------------

export function CargoTabStep({ model, viewMode, revealAdvanced }: StepProps) {
  const t = useTranslations("corridor.cargo");
  const ts = useTranslations("corridor.steps");
  const { scenario, update } = model;
  // Cargo-unit identity: explicit choice, else derived from the vessel
  // (container → TEU, everything else → tonne). Presentation-only.
  const cargoUnit =
    scenario.cargo.unit ??
    (scenario.vessel.typeId.startsWith("container") ? "teu" : "tonne");

  // Throughput moved here from Intro's Advanced fold, but its sensitivity
  // rank still governs Simple mode — the manifest stays the source of truth.
  const fields = splitByManifest([
    {
      id: "cargo.unitsPerYear",
      overridden: scenario.cargo.unitsPerYear !== CARGO_DEFAULTS.unitsPerYear,
      node: (
        <NumberInput
          key="units"
          label={t("units")}
          unit="units/yr"
          value={scenario.cargo.unitsPerYear}
          onChange={(v) => update((d) => void (d.cargo.unitsPerYear = v))}
        />
      ),
    },
  ]);

  // The tab is deliberately thin — the Cargo domain's identity fields only.
  return (
    <Section title={ts("cargo")}>
      <Select
        label={t("unit")}
        value={cargoUnit}
        options={[
          { value: "tonne", label: t("unitTonne") },
          { value: "teu", label: t("unitTeu") },
        ]}
        onChange={(v) =>
          update((d) => {
            d.cargo.unit = v as "tonne" | "teu";
            // The user's own switch sets the weight — a visible consequence,
            // never a load-time rewrite. Tonne pins it to 1 by definition;
            // TEU reveals the field on its ~14 t benchmark (the previous
            // value was the tonne pin, meaningless for TEU).
            d.cargo.unitWeightTonnes = v === "teu" ? 14 : 1;
          })
        }
      />
      {/* Weight per unit exists only for TEU — for tonnes it is 1 by
          definition and the field hides. A stored tonne scenario with a
          different weight still computes with its stored value. */}
      {cargoUnit === "teu" ? (
        <NumberInput
          label={t("unitWeight")}
          unit="t"
          step={0.5}
          help={t("unitWeightHelp")}
          value={scenario.cargo.unitWeightTonnes ?? 14}
          onChange={(v) => update((d) => void (d.cargo.unitWeightTonnes = Math.max(0.01, v)))}
        />
      ) : (
        <div />
      )}
      {fields.main}
      {viewMode === "advanced" ? (
        fields.advanced
      ) : fields.advanced.length > 0 ? (
        <AdvancedHiddenStrip count={fields.advancedOverrides} onReveal={revealAdvanced} />
      ) : null}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Vessel
// ---------------------------------------------------------------------------

export function VesselStep({ model }: StepProps) {
  const t = useTranslations("corridor.vessel");
  const { scenario, update, resolved, benchmarks, bundle } = model;
  if (!resolved || !benchmarks) return null;

  const vesselField = (
    side: "green" | "fossil",
    kind: "capex" | "opex",
  ): React.ReactNode => {
    const r = resolved[side];
    const b = benchmarks[side];
    const isCapex = kind === "capex";
    return (
      <ResolvedField
        key={`${side}-${kind}`}
        label={t(isCapex ? "capex" : "opex")}
        unit={isCapex ? "$m" : "$m/yr"}
        help={
          isCapex
            ? side === "green"
              ? t("capexGreenHelp")
              : t("capexFossilHelp")
            : undefined
        }
        override={scenario.vessel[side][isCapex ? "capexUsdM" : "opexUsdMPerYear"]}
        effective={isCapex ? r.vesselCapexUsdM.value : r.vesselOpexUsdMPerYear.value}
        source={isCapex ? r.vesselCapexUsdM.source : r.vesselOpexUsdMPerYear.source}
        benchmark={isCapex ? b.vesselCapexUsdM.value : b.vesselOpexUsdMPerYear.value}
        onChange={(v) =>
          update((d) => void (d.vessel[side][isCapex ? "capexUsdM" : "opexUsdMPerYear"] = v))
        }
      />
    );
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label={t("type")}
          value={scenario.vessel.typeId}
          options={bundle.vesselTypes.map((v) => ({ value: v.id, label: v.label }))}
          onChange={(v) => update((d) => void (d.vessel.typeId = v))}
        />
        <Select
          label={t("consumptionMode")}
          value={scenario.vessel.consumptionMode}
          options={[
            { value: "distance", label: t("modeDistance") },
            { value: "vessel-benchmark", label: t("modeBenchmark") },
          ]}
          onChange={(v) =>
            update(
              (d) =>
                void (d.vessel.consumptionMode = v as ScenarioInput["vessel"]["consumptionMode"]),
            )
          }
        />
        <NumberInput
          label={t("vessels")}
          step={1}
          value={scenario.cargo.vessels}
          onChange={(v) => update((d) => void (d.cargo.vessels = Math.max(1, Math.round(v))))}
        />
        <NumberInput
          label={t("roundtrips")}
          step={1}
          value={scenario.cargo.roundtripsPerYear}
          onChange={(v) => update((d) => void (d.cargo.roundtripsPerYear = v))}
        />
      </div>
      <Section title={t("green")}>
        {vesselField("green", "capex")}
        {vesselField("green", "opex")}
      </Section>
      <Section title={t("fossil")}>
        {vesselField("fossil", "capex")}
        {vesselField("fossil", "opex")}
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Fuel
// ---------------------------------------------------------------------------

function FuelSide({ model, viewMode, revealAdvanced, side }: StepProps & { side: "green" | "fossil" }) {
  const t = useTranslations("corridor.fuel");
  const { scenario, update, resolved, benchmarks, bundle } = model;
  if (!resolved || !benchmarks) return null;
  const s = scenario[side];
  const r = resolved[side];
  const b = benchmarks[side];
  const plantMode = s.sourcing === "build-plant" || s.sourcing === "build-here";
  const prodZeroed = !plantMode;
  const legacy = scenario.flags?.legacyExcelConstruct === true;
  // The merchant price row exists for purchase — and for migrated legacy
  // scenarios, where it is charged ON TOP of the production lines.
  const showPrice = s.sourcing === "purchase" || (plantMode && legacy);

  const overrideField = (
    key:
      | "priceUsdPerTonne"
      | "combustionEfTco2PerTonne"
      | "lhvMjPerTonne"
      | "wtwGco2PerMj"
      | "fuelTonnesPerVesselYear"
      | "prodCapexUsdM"
      | "prodOpexUsdMPerYear",
    resolvedKey:
      | "priceUsdPerTonne"
      | "combustionEf"
      | "lhv"
      | "wtw"
      | "tonnesPerVesselYear"
      | "prodCapexUsdM"
      | "prodOpexUsdMPerYear",
    label: string,
    unit: string,
    opts: { help?: string; disabled?: boolean; disabledNote?: string } = {},
  ) => (
    <ResolvedField
      key={`${side}-${key}`}
      label={label}
      unit={unit}
      help={opts.help}
      disabled={opts.disabled}
      disabledNote={opts.disabledNote}
      override={s.overrides[key]}
      effective={r[resolvedKey].value}
      source={r[resolvedKey].source}
      benchmark={b[resolvedKey].value}
      onChange={(v) => update((d) => void (d[side].overrides[key] = v))}
    />
  );

  const entries = splitByManifest([
    ...(showPrice
      ? [
          {
            id: `${side}.priceUsdPerTonne`,
            overridden: s.overrides.priceUsdPerTonne !== null,
            node: overrideField("priceUsdPerTonne", "priceUsdPerTonne", t("price"), "$/t"),
          },
        ]
      : []),
    {
      id: `${side}.fuelTonnesPerVesselYear`,
      node: overrideField(
        "fuelTonnesPerVesselYear",
        "tonnesPerVesselYear",
        t("consumption"),
        "t/vessel/yr",
        { help: t("consumptionHelp") },
      ),
    },
    {
      id: `${side}.combustionEf`,
      node: overrideField(
        "combustionEfTco2PerTonne",
        "combustionEf",
        t("combustionEf"),
        "t CO2/t",
      ),
    },
    {
      id: `${side}.lhv`,
      node: overrideField("lhvMjPerTonne", "lhv", t("lhv"), "MJ/t"),
    },
    {
      id: `${side}.wtwGco2PerMj`,
      overridden: s.overrides.wtwGco2PerMj !== null,
      node: overrideField("wtwGco2PerMj", "wtw", t("wtw"), "gCO2e/MJ", {
        help: t("wtwHelp"),
      }),
    },
    // Under build-here the production lines are component sums shown in the
    // panel — the aggregate fields would fight the per-component overrides.
    ...(s.sourcing === "build-here"
      ? []
      : [
          {
            id: `${side}.prodCapexUsdM`,
            node: overrideField("prodCapexUsdM", "prodCapexUsdM", t("prodCapex"), "$m", {
              disabled: prodZeroed,
              disabledNote: t("prodZeroNote"),
            }),
          },
          {
            id: `${side}.prodOpexUsdMPerYear`,
            node: overrideField(
              "prodOpexUsdMPerYear",
              "prodOpexUsdMPerYear",
              t("prodOpex"),
              "$m/yr",
              { disabled: prodZeroed, disabledNote: t("prodZeroNote") },
            ),
          },
        ]),
  ]);

  return (
    <Section title={t(side)}>
      <Select
        label={t("type")}
        value={s.fuelId}
        // Each side offers only its own family — a fossil corridor burning
        // e-ammonia would silently collapse the comparison (resolve.ts
        // rejects it too, for scenarios arriving by import or share link).
        options={bundle.fuels
          .filter((f) => f.family === side)
          .map((f) => ({ value: f.id, label: f.label }))}
        onChange={(v) => update((d) => void (d[side].fuelId = v))}
      />
      <div data-field-id={`${side}.sourcing`}>
      <Select
        label={t("sourcing")}
        value={s.sourcing}
        options={[
          { value: "purchase", label: t("sourcingPurchase") },
          { value: "build-plant", label: t("sourcingBuildPlant") },
          // build-here (map-derived plant inputs) — green-side only.
          ...(side === "green"
            ? [{ value: "build-here", label: t("sourcingBuildHere") }]
            : []),
        ]}
        onChange={(v) =>
          update((d) => {
            d[side].sourcing = v as ScenarioInput["green"]["sourcing"];
          })
        }
      />
      </div>
      {plantMode && legacy && (
        <p className="sm:col-span-2 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-amber-800">
          {t("legacyPriceNote")}
        </p>
      )}
      {s.sourcing === "build-here" && <BuildHerePanel model={model} side={side} />}
      {/* Everything standard on this tab — no Advanced fold. */}
      {entries.main}
      {viewMode === "advanced" ? (
        entries.advanced
      ) : entries.advanced.length > 0 ? (
        <AdvancedHiddenStrip count={entries.advancedOverrides} onReveal={revealAdvanced} />
      ) : null}
    </Section>
  );
}

export function FuelStep({ model, viewMode, revealAdvanced }: StepProps) {
  return (
    <div className="space-y-3">
      <FuelSide model={model} viewMode={viewMode} revealAdvanced={revealAdvanced} side="green" />
      <FuelSide model={model} viewMode={viewMode} revealAdvanced={revealAdvanced} side="fossil" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Port
// ---------------------------------------------------------------------------

function PortSide({ model, viewMode, revealAdvanced, side }: StepProps & { side: "green" | "fossil" }) {
  const t = useTranslations("corridor.port");
  const { scenario, update, resolved, benchmarks } = model;
  if (!resolved || !benchmarks) return null;
  const r = resolved[side];
  const b = benchmarks[side];

  const field = (
    key:
      | "portStorageCapexUsdM"
      | "portStorageOpexUsdMPerYear"
      | "bargeCapexUsdM"
      | "bargeOpexUsdMPerYear",
    label: string,
    unit: string,
  ) => (
    <ResolvedField
      key={`${side}-${key}`}
      label={label}
      unit={unit}
      override={scenario[side].overrides[key]}
      effective={r[key].value}
      source={r[key].source}
      benchmark={b[key].value}
      onChange={(v) => update((d) => void (d[side].overrides[key] = v))}
    />
  );

  return (
    <Section title={t(side)}>
      {side === "fossil" && (
        <p className="sm:col-span-2 text-[11px] leading-snug text-neutral-500">
          {t("fossilNote")}
        </p>
      )}
      {field("portStorageCapexUsdM", t("storageCapex"), "$m")}
      {field("portStorageOpexUsdMPerYear", t("storageOpex"), "$m/yr")}
      {/* Barge CAPEX is advanced-ranked in the sensitivity manifest —
          Simple hides it wherever it renders, fold or not. */}
      {viewMode === "advanced" || !isAdvanced("port.bargeCapexUsdM")
        ? field("bargeCapexUsdM", t("bargeCapex"), "$m")
        : null}
      {field("bargeOpexUsdMPerYear", t("bargeOpex"), "$m/yr")}
      {viewMode === "simple" && isAdvanced("port.bargeCapexUsdM") ? (
        <AdvancedHiddenStrip
          count={scenario[side].overrides.bargeCapexUsdM !== null ? 1 : 0}
          onReveal={revealAdvanced}
        />
      ) : null}
    </Section>
  );
}

export function PortStep({ model, viewMode, revealAdvanced }: StepProps) {
  return (
    <div className="space-y-3">
      <PortSide model={model} viewMode={viewMode} revealAdvanced={revealAdvanced} side="green" />
      <PortSide model={model} viewMode={viewMode} revealAdvanced={revealAdvanced} side="fossil" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5 — Regulation
// ---------------------------------------------------------------------------

export function RegulationStep({ model, viewMode, revealAdvanced }: StepProps) {
  const t = useTranslations("corridor.regulation");
  const tc = useTranslations("corridor.cargo");
  const { scenario, update, resolved, benchmarks } = model;
  const reg = scenario.regulation;
  const simple = viewMode === "simple";
  // What Simple is hiding per scheme, counted only while the scheme is
  // enabled (a hidden value on a disabled scheme is inert).
  const etsHidden =
    (reg.ets.euaEurPerTonne !== REG_DEFAULTS.ets.euaEurPerTonne ? 1 : 0) +
    (reg.eurUsd !== REG_DEFAULTS.eurUsd ? 1 : 0) +
    (reg.ets.scope !== REG_DEFAULTS.ets.scope ? 1 : 0) +
    (reg.ets.euaEscalation != null ? 1 : 0);
  const fuelEuHidden =
    (reg.fuelEu.penaltyEurPerTonne !== REG_DEFAULTS.fuelEu.penaltyEurPerTonne ? 1 : 0) +
    (reg.fuelEu.scope !== REG_DEFAULTS.fuelEu.scope ? 1 : 0);
  const imoHidden =
    (reg.imoNetZero?.rewardUsdPerTonneCo2e != null ? 1 : 0) +
    (reg.imoNetZero?.priceEscalation != null ? 1 : 0);
  const selfHidden = reg.selfDesigned.co2PriceEscalation != null ? 1 : 0;

  return (
    <div className="space-y-3">
      {/* Financing (moved from Intro — slide 5): the tab is Regulation &
          FINANCING, and WACC/inflation are its financing half. Keys stay
          cargo.*; labels stay corridor.cargo. */}
      <Section title={t("financing")}>
        {resolved && benchmarks ? (
          <div data-field-id="cargo.wacc">
          <ResolvedField
            label={tc("wacc")}
            unit="fraction"
            step={0.005}
            help={tc("waccHelp")}
            override={scenario.cargo.waccOverride}
            effective={resolved.wacc.value}
            source={resolved.wacc.source}
            benchmark={benchmarks.wacc.value}
            unverified
            onChange={(v) => update((d) => void (d.cargo.waccOverride = v))}
          />
          </div>
        ) : null}
        <NumberInput
          label={tc("inflation")}
          unit="fraction"
          step={0.005}
          value={scenario.cargo.inflation}
          onChange={(v) => update((d) => void (d.cargo.inflation = v))}
        />
      </Section>
      <Section title={t("ets")}>
        <div className="sm:col-span-2">
          <SwitchRow
            label={t("include")}
            checked={reg.ets.enabled}
            onChange={(v) => update((d) => void (d.regulation.ets.enabled = v))}
          />
        </div>
        {reg.ets.enabled && (
          <>
            {!simple && (
              <>
                <NumberInput
                  label={t("eua")}
                  unit="€/t CO2"
                  value={reg.ets.euaEurPerTonne}
                  onChange={(v) => update((d) => void (d.regulation.ets.euaEurPerTonne = v))}
                />
                <NumberInput
                  label={t("eurUsd")}
                  step={0.01}
                  value={reg.eurUsd}
                  onChange={(v) => update((d) => void (d.regulation.eurUsd = v))}
                />
                <NumberInput
                  label={t("etsScope")}
                  unit="0–1"
                  step={0.05}
                  value={reg.ets.scope}
                  onChange={(v) => update((d) => void (d.regulation.ets.scope = v))}
                />
              </>
            )}
            <p className="sm:col-span-2 text-[11px] text-neutral-500">{t("phaseNote")}</p>
            {simple ? (
              <AdvancedHiddenStrip count={etsHidden} onReveal={revealAdvanced} />
            ) : (
            <div className="sm:col-span-2">
              <AdvancedFold>
                <NumberInput
                  label={t("escalation")}
                  unit="fraction/yr"
                  step={0.005}
                  help={t("escalationHelp")}
                  value={reg.ets.euaEscalation ?? 0}
                  onChange={(v) =>
                    update((d) => void (d.regulation.ets.euaEscalation = v || undefined))
                  }
                />
              </AdvancedFold>
            </div>
            )}
          </>
        )}
      </Section>

      <Section title={t("fuelEu")}>
        <div className="sm:col-span-2">
          <SwitchRow
            label={t("include")}
            checked={reg.fuelEu.enabled}
            onChange={(v) => update((d) => void (d.regulation.fuelEu.enabled = v))}
          />
        </div>
        {reg.fuelEu.enabled && (
          <>
            {!simple && (
              <>
                <NumberInput
                  label={t("penalty")}
                  unit="€/t VLSFO-eq"
                  value={reg.fuelEu.penaltyEurPerTonne}
                  onChange={(v) =>
                    update((d) => void (d.regulation.fuelEu.penaltyEurPerTonne = v))
                  }
                />
                <NumberInput
                  label={t("fuelEuScope")}
                  unit="0–1"
                  step={0.05}
                  value={reg.fuelEu.scope}
                  onChange={(v) => update((d) => void (d.regulation.fuelEu.scope = v))}
                />
              </>
            )}
            {simple && <AdvancedHiddenStrip count={fuelEuHidden} onReveal={revealAdvanced} />}
            <NumberInput
              label={t("vlsfo")}
              unit="MJ/t"
              value={reg.fuelEu.vlsfoMjPerTonne}
              onChange={(v) => update((d) => void (d.regulation.fuelEu.vlsfoMjPerTonne = v))}
            />
            <NumberInput
              label={t("baseline")}
              unit="gCO2e/MJ"
              step={0.01}
              value={reg.fuelEu.baselineGco2PerMj}
              onChange={(v) => update((d) => void (d.regulation.fuelEu.baselineGco2PerMj = v))}
            />
            <p className="sm:col-span-2 text-[11px] text-neutral-500">{t("targetNote")}</p>
          </>
        )}
      </Section>

      <Section title={t("ira")}>
        <div className="sm:col-span-2">
          <SwitchRow
            label={t("include")}
            checked={reg.ira45z.enabled}
            onChange={(v) => update((d) => void (d.regulation.ira45z.enabled = v))}
          />
        </div>
        {reg.ira45z.enabled && (
          <>
            <div className="sm:col-span-2">
              <SwitchRow
                label={t("usProduced")}
                checked={reg.ira45z.usProduced}
                onChange={(v) => update((d) => void (d.regulation.ira45z.usProduced = v))}
              />
            </div>
            <NumberInput
              label={t("rate")}
              unit="$/gal-eq"
              step={0.05}
              value={reg.ira45z.creditUsdPerGallon}
              onChange={(v) => update((d) => void (d.regulation.ira45z.creditUsdPerGallon = v))}
            />
          </>
        )}
      </Section>

      <Section title={t("imo")}>
        <div className="sm:col-span-2">
          <SwitchRow
            label={t("include")}
            checked={reg.imoNetZero?.enabled ?? false}
            onChange={(v) =>
              update(
                (d) =>
                  void (d.regulation.imoNetZero = {
                    enabled: v,
                    scope: d.regulation.imoNetZero?.scope ?? 1,
                    ...(d.regulation.imoNetZero?.rewardUsdPerTonneCo2e !== undefined
                      ? { rewardUsdPerTonneCo2e: d.regulation.imoNetZero.rewardUsdPerTonneCo2e }
                      : {}),
                  }),
              )
            }
          />
        </div>
        {reg.imoNetZero?.enabled && (
          <>
            <NumberInput
              label={t("imoScope")}
              unit="0–1"
              step={0.05}
              value={reg.imoNetZero.scope}
              onChange={(v) =>
                update((d) => void (d.regulation.imoNetZero!.scope = Math.min(1, Math.max(0, v))))
              }
            />
            <div />
            <p className="sm:col-span-2 text-[11px] leading-snug text-neutral-500">
              {t("imoNote")}
            </p>
            {simple ? (
              <AdvancedHiddenStrip count={imoHidden} onReveal={revealAdvanced} />
            ) : (
            <div className="sm:col-span-2">
              <AdvancedFold>
                <NumberInput
                  label={t("imoReward")}
                  unit="$/tCO2e"
                  step={5}
                  help={t("imoRewardHelp")}
                  value={reg.imoNetZero.rewardUsdPerTonneCo2e ?? 0}
                  onChange={(v) =>
                    update(
                      (d) =>
                        void (d.regulation.imoNetZero!.rewardUsdPerTonneCo2e = v || undefined),
                    )
                  }
                />
                <NumberInput
                  label={t("escalation")}
                  unit="fraction/yr"
                  step={0.005}
                  help={t("escalationHelp")}
                  value={reg.imoNetZero.priceEscalation ?? 0}
                  onChange={(v) =>
                    update(
                      (d) => void (d.regulation.imoNetZero!.priceEscalation = v || undefined),
                    )
                  }
                />
              </AdvancedFold>
            </div>
            )}
          </>
        )}
      </Section>

      <Section title={t("selfDesigned")}>
        <div className="sm:col-span-2">
          <SwitchRow
            label={t("include")}
            checked={reg.selfDesigned.enabled}
            onChange={(v) => update((d) => void (d.regulation.selfDesigned.enabled = v))}
          />
        </div>
        {reg.selfDesigned.enabled && (
          <>
            <NumberInput
              label={t("co2Price")}
              unit="$/t CO2"
              value={reg.selfDesigned.co2PriceUsdPerTonne}
              onChange={(v) =>
                update((d) => void (d.regulation.selfDesigned.co2PriceUsdPerTonne = v))
              }
            />
            <NumberInput
              label={t("support")}
              unit="$/kg"
              step={0.05}
              value={reg.selfDesigned.supportUsdPerKg}
              onChange={(v) => update((d) => void (d.regulation.selfDesigned.supportUsdPerKg = v))}
            />
            <NumberInput
              label={t("capexSupport")}
              unit="0–1"
              step={0.05}
              value={reg.selfDesigned.capexSupport}
              onChange={(v) => update((d) => void (d.regulation.selfDesigned.capexSupport = v))}
            />
            <NumberInput
              label={t("opexSupport")}
              unit="0–1"
              step={0.05}
              value={reg.selfDesigned.opexSupport}
              onChange={(v) => update((d) => void (d.regulation.selfDesigned.opexSupport = v))}
            />
            <NumberInput
              label={t("other")}
              unit="$m/yr"
              value={reg.selfDesigned.otherUsdM}
              onChange={(v) => update((d) => void (d.regulation.selfDesigned.otherUsdM = v))}
            />
            {simple ? (
              <AdvancedHiddenStrip count={selfHidden} onReveal={revealAdvanced} />
            ) : (
            <div className="sm:col-span-2">
              <AdvancedFold>
                <NumberInput
                  label={t("escalation")}
                  unit="fraction/yr"
                  step={0.005}
                  help={t("escalationHelp")}
                  value={reg.selfDesigned.co2PriceEscalation ?? 0}
                  onChange={(v) =>
                    update(
                      (d) =>
                        void (d.regulation.selfDesigned.co2PriceEscalation = v || undefined),
                    )
                  }
                />
              </AdvancedFold>
            </div>
            )}
          </>
        )}
      </Section>

    </div>
  );
}
