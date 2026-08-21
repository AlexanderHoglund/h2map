"use client";

import { useTranslations } from "next-intl";
import { FUEL_EMISSIONS_DATASET, type ScenarioInput } from "@h2map/corridor-schema";
import { NumberInput } from "@/components/ui/NumberInput";
import { Select } from "@/components/ui/Select";
import { TextInput } from "@/components/ui/TextInput";
import { SwitchRow } from "@/components/ui/Switch";
import { Section, Advanced } from "@/components/ui/Card";
import ResolvedField from "./ResolvedField";
import { sourceLabel } from "@/lib/corridor/provenance";
import SelectField from "./SelectField";
import CorridorRouteMap from "./CorridorRouteMap";
import RoutedDistanceField from "./RoutedDistanceField";
import { useSeaRoute } from "./useSeaRoute";
import BuildHerePanel from "./BuildHerePanel";
import { CORRIDOR_COUNTRIES } from "@/lib/corridor-countries";
import { anchorForCountry } from "@/lib/corridor/countryAnchors";
import { defaultScenario, isAdvanced, type CorridorModel } from "./state";

/**
 * The five wizard steps of the corridor model (build-plan 3.1).
 * Every benchmarkable input renders through ResolvedField; field prominence
 * (top-level vs the Advanced fold) comes from the sensitivity-derived
 * ui-manifest (build-plan 3.2) — the interface tracks the model.
 */

interface StepProps {
  model: CorridorModel;
  /** Simplified shows structural inputs + the sensitivity top-level set;
   *  Standard shows everything. */
  viewMode: "simplified" | "standard";
  /** "Switch to Standard" from a hidden-settings strip. */
  revealStandard: () => void;
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
  // Nothing set among the hidden fields -> nothing to say: the note-less
  // form IS the Simplified promise (2026-08-13 cleanup).
  if (count === 0) return null;
  return (
    <p className="sm:col-span-2 flex items-center gap-2 bg-brand-tint px-2.5 py-1.5 text-[11px] text-brand-deep">
      <span>{t("hiddenActive", { count })}</span>
      <button type="button" onClick={onReveal} className="font-medium underline">
        {t("switchToStandard")}
      </button>
    </p>
  );
}

/** Places a field in the main grid or collects it for the hidden set.
 *  Hidden = sensitivity-ranked advanced (ui-manifest) OR explicitly marked
 *  `hidden` (fields the sweep never ranked but that are not essential).
 *  `overridden` marks entries whose value the user has set — Simplified mode
 *  reports how many of those it is hiding. */
function splitByManifest(
  entries: { id: string; node: React.ReactNode; overridden?: boolean; hidden?: boolean }[],
): { main: React.ReactNode[]; advanced: React.ReactNode[]; advancedOverrides: number } {
  const main: React.ReactNode[] = [];
  const advanced: React.ReactNode[] = [];
  let advancedOverrides = 0;
  for (const e of entries) {
    if (e.hidden || isAdvanced(e.id)) {
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
/** Regulation reference defaults — Simplified mode counts hidden departures. */
const REG_DEFAULTS = defaultScenario().regulation;
/** Model-option defaults (emissions/rate basis) for the Intro strip count. */
const FLAGS_DEFAULTS = defaultScenario().flags;

/** The (0,0) unset sentinel the coordinate inputs write for absent values
 *  (see CorridorRouteMap) — only OTHER coordinates count as typed. */
function typedCoords(
  c: { lat: number; lon: number } | undefined,
): { lat: number; lon: number } | undefined {
  return c && (c.lat !== 0 || c.lon !== 0) ? c : undefined;
}

/** Map label for an anchor-derived corridor end: the country's name. */
function countryName(id: string | undefined): string | undefined {
  return CORRIDOR_COUNTRIES.find((c) => c.value === id)?.label;
}

export function CargoStep({ model, viewMode, revealStandard }: StepProps) {
  const t = useTranslations("corridor.cargo");
  const tr = useTranslations("corridor.regulation");
  const tp = useTranslations("corridor.provenance");
  const { scenario, update } = model;

  const twoPorts = scenario.cargo.routeType === "point-to-point";

  // Country-level routing (render-time fallback, never stored): each end's
  // effective position is the typed coordinates when they exist, else the
  // country's port-area anchor — so picking two countries is enough to see
  // the corridor, and typing lat/lon overwrites the anchor automatically.
  const typedA = typedCoords(scenario.cargo.portACoords);
  const typedB = typedCoords(scenario.cargo.portBCoords);
  const anchorA = anchorForCountry(scenario.cargo.countryId);
  const anchorB = anchorForCountry(scenario.cargo.countryBId ?? scenario.cargo.countryId);
  const effectiveA = typedA ?? anchorA;
  const effectiveB = typedB ?? anchorB;
  const anchorAInUse = !typedA && anchorA !== undefined;
  const anchorBInUse = !typedB && anchorB !== undefined;

  // The routed figure from an anchor-derived pair enters exactly like any
  // other: as the DERIVED benchmark beside the distance field, adopted
  // only by the user's "use this" click. Country anchors change where the
  // route STARTS, never who writes the distance (adoption-only contract,
  // RoutedDistanceField's docblock).
  const route = useSeaRoute(effectiveA, twoPorts ? effectiveB : undefined);

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
          help={t("startYearHelp")}
          value={scenario.cargo.startYear}
          options={START_YEARS}
          benchmark={CARGO_DEFAULTS.startYear}
          citation={tp("yearsDefault")}
          docsId="tab-intro"
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
          help={t("horizonHelp")}
          value={scenario.cargo.horizonYears}
          options={HORIZON_YEARS}
          benchmark={CARGO_DEFAULTS.horizonYears}
          citation={tp("yearsDefault")}
          docsId="tab-intro"
          onChange={(v) => update((d) => void (d.cargo.horizonYears = v))}
        />
      ),
    },
    // Model options (moved from Regulation — slide 3): defaultable framing
    // choices, hidden in Simplified. Keys stay flags.*; i18n stays
    // corridor.regulation.
    {
      id: "flags.emissionsBasis",
      hidden: true,
      overridden:
        (scenario.flags?.emissionsBasis ?? "combustion") !==
        (FLAGS_DEFAULTS?.emissionsBasis ?? "combustion"),
      node: (
        <Select
          key="emissionsBasis"
          label={tr("emissionsBasis")}
          help={tr("emissionsBasisHelp")}
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
      ),
    },
  ]);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label={t("routeType")}
          help={t("routeTypeHelp")}
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
            {anchorAInUse && (
              <p className="text-[11px] leading-snug text-neutral-500">
                {t("countryAnchorCaption")}
              </p>
            )}
            <TextInput
              label={twoPorts ? t("portA") : t("singlePort")}
              help={t("portNameHelp")}
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
                help={t("countryHelp")}
                value={scenario.cargo.countryBId ?? scenario.cargo.countryId}
                options={CORRIDOR_COUNTRIES}
                onChange={(v) => update((d) => void (d.cargo.countryBId = v))}
              />
              {anchorBInUse && (
                <p className="text-[11px] leading-snug text-neutral-500">
                  {t("countryAnchorCaption")}
                </p>
              )}
              <TextInput
                label={t("portB")}
                help={t("portNameHelp")}
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
            degrading to a great-circle schematic when routing cannot.
            Anchor-derived ends draw at the country's port-area anchor and
            label as "<Country> (country)" until a port name or typed
            coordinates pin a real port. */}
        <CorridorRouteMap
          routeType={scenario.cargo.routeType}
          portA={{
            name:
              scenario.cargo.portAName ??
              (anchorAInUse
                ? t("countryAnchorMapLabel", {
                    country: countryName(scenario.cargo.countryId) ?? "",
                  })
                : undefined),
            coords: effectiveA,
          }}
          portB={{
            name:
              scenario.cargo.portBName ??
              (anchorBInUse
                ? t("countryAnchorMapLabel", {
                    country:
                      countryName(scenario.cargo.countryBId ?? scenario.cargo.countryId) ??
                      "",
                  })
                : undefined),
            coords: effectiveB,
          }}
          route={route}
          typedDistanceNm={scenario.cargo.oneWayDistanceNm}
          site={
            scenario.green.sourcing === "build-here" && scenario.green.buildHere
              ? { lat: scenario.green.buildHere.lat, lon: scenario.green.buildHere.lon }
              : null
          }
        />
        {fields.main}
        {viewMode === "standard" ? (
          fields.advanced
        ) : (
          <AdvancedHiddenStrip count={fields.advancedOverrides} onReveal={revealStandard} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step — Cargo (the MMMCZCS Cargo domain's own tab)
// ---------------------------------------------------------------------------

export function CargoTabStep({ model, viewMode, revealStandard }: StepProps) {
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
          help={t("unitsHelp")}
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
        help={t("unitHelp")}
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
            // TEU reveals the field on its 10 t benchmark (the previous
            // value was the tonne pin, meaningless for TEU).
            d.cargo.unitWeightTonnes = v === "teu" ? 10 : 1;
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
          value={scenario.cargo.unitWeightTonnes ?? 10}
          onChange={(v) => update((d) => void (d.cargo.unitWeightTonnes = Math.max(0.01, v)))}
        />
      ) : (
        <div />
      )}
      {fields.main}
      {viewMode === "standard" ? (
        fields.advanced
      ) : fields.advanced.length > 0 ? (
        <AdvancedHiddenStrip count={fields.advancedOverrides} onReveal={revealStandard} />
      ) : null}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Vessel
// ---------------------------------------------------------------------------

export function VesselStep({ model, viewMode, revealStandard }: StepProps) {
  const t = useTranslations("corridor.vessel");
  const tp = useTranslations("corridor.provenance");
  const { scenario, update, resolved, benchmarks, bundle } = model;
  if (!resolved || !benchmarks) return null;

  const vesselRow = bundle.vesselTypes.find((v) => v.id === scenario.vessel.typeId);
  const vesselCite = vesselRow
    ? {
        citation: sourceLabel(vesselRow.sourceNote) ?? tp("vesselTable"),
        verified: vesselRow.verified,
        docsId: "tab-vessels",
      }
    : undefined;

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
            : t("opexHelp")
        }
          provenance={{
          ...vesselCite,
          derivation: isCapex
            ? side === "green"
              ? tp("vesselCapexGreen")
              : tp("vesselFossil")
            : undefined,
        }}
        override={
          scenario.vessel[side][
            isCapex ? "capexUsdMPerShip" : "opexUsdMPerShipPerYear"
          ]
        }
        effective={
          isCapex
            ? r.vesselCapexUsdMPerShip.value
            : r.vesselOpexUsdMPerShipPerYear.value
        }
        source={
          isCapex
            ? r.vesselCapexUsdMPerShip.source
            : r.vesselOpexUsdMPerShipPerYear.source
        }
        benchmark={
          isCapex
            ? b.vesselCapexUsdMPerShip.value
            : b.vesselOpexUsdMPerShipPerYear.value
        }
        onChange={(v) =>
          update(
            (d) =>
              void (d.vessel[side][
                isCapex ? "capexUsdMPerShip" : "opexUsdMPerShipPerYear"
              ] = v),
          )
        }
      />
    );
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label={t("type")}
          help={t("typeHelp")}
          value={scenario.vessel.typeId}
          options={bundle.vesselTypes
            // Retired classes stay IN the bundle so saved scenarios keep
            // resolving, but must not be offered for new work: several are
            // superseded by a researched row of the same class carrying very
            // different energy (the v1 Handymax reads 3.2 GJ/nm against the
            // catalogue's 2.334 — a 27% burn difference for the same ship).
            // The one already pinned stays listed, or changing any other
            // field would silently re-point the scenario at a new vessel.
            .filter((v) => !v.deprecated || v.id === scenario.vessel.typeId)
            .map((v) => ({
              value: v.id,
              label: v.deprecated ? `${v.label} — retired` : v.label,
            }))}
          onChange={(v) => update((d) => void (d.vessel.typeId = v))}
        />
        <NumberInput
          label={t("vessels")}
          help={t("vesselsHelp")}
          step={1}
          value={scenario.cargo.vessels}
          onChange={(v) => update((d) => void (d.cargo.vessels = Math.max(1, Math.round(v))))}
        />
        <NumberInput
          label={t("roundtrips")}
          help={t("roundtripsHelp")}
          step={1}
          value={scenario.cargo.roundtripsPerYear}
          invalid={model.invalidFields.includes("cargo.roundtripsPerYear")}
          onChange={(v) => update((d) => void (d.cargo.roundtripsPerYear = v))}
        />
      </div>
      {/* The vessel's GJ/nm is a SERVICE-SPEED figure and meaningless
          without it — the absence of this field is what once made the
          researched data look like it contradicted the study
          reconstructions. Shown with the row, never on its own. */}
      {vesselRow?.serviceSpeedKn !== undefined && (
        <p className="text-[11px] text-neutral-500">
          {t("energyBasis", {
            gj: vesselRow.gjPerNm,
            kn: vesselRow.serviceSpeedKn,
          })}
        </p>
      )}
      {/* Port load is a property of the CORRIDOR, not the vessel: the same
          ship spends under 1% of its energy in port on a 9,500 nm run and a
          third of it on a short one. The day rates behind this are all
          tier-C estimates, so the share is what says whether that matters
          here — and past ~10% it stops being a rounding error. */}
      {model.result?.portEnergy && (
        <p
          className={`text-[11px] leading-snug ${
            model.result.portEnergy.material
              ? "bg-amber-500/10 px-2.5 py-1.5 text-amber-800"
              : "text-neutral-500"
          }`}
        >
          {t(
            model.result.portEnergy.material ? "portShareWarn" : "portShare",
            {
              pct: (model.result.portEnergy.share * 100).toFixed(1),
              days: model.result.portEnergy.portDaysPerRoundTrip,
            },
          )}
        </p>
      )}
      <Section title={t("green")}>
        {vesselField("green", "capex")}
        {vesselField("green", "opex")}
      </Section>
      {/* Fossil fleet costs are benchmarked and rank below the sensitivity
          threshold — Simplified runs them on their defaults. With nothing
          overridden the section renders NOTHING, not an empty heading: the
          strip only speaks when Simplified is hiding a set value. */}
      {viewMode === "standard" ? (
        <Section title={t("fossil")}>
          {vesselField("fossil", "capex")}
          {vesselField("fossil", "opex")}
        </Section>
      ) : (
        (scenario.vessel.fossil.capexUsdMPerShip != null ? 1 : 0) +
          (scenario.vessel.fossil.opexUsdMPerShipPerYear != null ? 1 : 0) >
          0 && (
          <Section title={t("fossil")}>
            <AdvancedHiddenStrip
              count={
                (scenario.vessel.fossil.capexUsdMPerShip != null ? 1 : 0) +
                (scenario.vessel.fossil.opexUsdMPerShipPerYear != null ? 1 : 0)
              }
              onReveal={revealStandard}
            />
          </Section>
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Fuel
// ---------------------------------------------------------------------------

function FuelSide({ model, viewMode, revealStandard, side }: StepProps & { side: "green" | "fossil" }) {
  const t = useTranslations("corridor.fuel");
  const tp = useTranslations("corridor.provenance");
  const { scenario, update, resolved, benchmarks, bundle } = model;
  if (!resolved || !benchmarks) return null;
  const s = scenario[side];
  const fuelRow = bundle.fuels.find((f) => f.id === s.fuelId);
  const fuelCite = fuelRow
    ? {
        citation: sourceLabel(fuelRow.sourceNote) ?? tp("fuelTable"),
        verified: fuelRow.verified,
        docsId: "ref-fuels",
      }
    : undefined;
  const vesselRow = bundle.vesselTypes.find((v) => v.id === scenario.vessel.typeId);
  const vesselCite = vesselRow
    ? {
        citation: sourceLabel(vesselRow.sourceNote) ?? tp("vesselTable"),
        verified: vesselRow.verified,
        docsId: "energy-perfuel",
      }
    : undefined;
  const r = resolved[side];
  const b = benchmarks[side];
  // v6 refined emissions: dataset-backed inputs (certified pathway, slip
  // scenario, pilot share, sulphur). null = the dataset default.
  const em = s.emissions ?? null;
  const refined = scenario.regulation.emissions != null;
  const framework = scenario.regulation.emissions?.framework ?? "fueleu";
  const feRow = (() => {
    const feId = bundle.fuelEmissions?.map[s.fuelId];
    return feId ? FUEL_EMISSIONS_DATASET.fuels.find((f) => f.id === feId) : undefined;
  })();
  const feCite = r.emissionsDerivation
    ? { ...fuelCite, derivation: r.emissionsDerivation, docsId: "fe-calculation" }
    : fuelCite;
  const setEm = (patch: Partial<NonNullable<ScenarioInput["green"]["emissions"]>>) =>
    update((d) => {
      d[side].emissions = {
        certifiedWttGco2ePerMj: null,
        n2oScenarioId: null,
        pilotShare: null,
        pilotFuelId: null,
        engineType: null,
        sulphurPercent: null,
        efficiencyRatio: null,
        ...(d[side].emissions ?? {}),
        ...patch,
      };
    });
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
    opts: {
      help: string;
      disabled?: boolean;
      disabledNote?: string;
      provenance?: { citation?: string; verified?: boolean; derivation?: string };
    },
  ) => (
    <ResolvedField
      key={`${side}-${key}`}
      label={label}
      unit={unit}
      help={opts.help}
      disabled={opts.disabled}
      disabledNote={opts.disabledNote}
      provenance={opts.provenance ?? fuelCite}
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
            node: overrideField("priceUsdPerTonne", "priceUsdPerTonne", t("price"), "$/t", {
              help: t("priceHelp"),
              provenance: { ...fuelCite, derivation: plantMode ? tp("priceZero") : undefined },
            }),
          },
        ]
      : []),
    {
      id: `${side}.fuelTonnesPerVesselYear`,
      hidden: side === "fossil",
      overridden: s.overrides.fuelTonnesPerVesselYear !== null,
      node: overrideField(
        "fuelTonnesPerVesselYear",
        "tonnesPerVesselYear",
        t("consumption"),
        "t/vessel/yr",
        {
          help: t("consumptionHelp"),
          provenance: { ...vesselCite, derivation: tp("consumption") },
        },
      ),
    },
    // Fuel-property fields are benchmarked physical constants — Simplified
    // runs them on their reference values.
    {
      id: `${side}.combustionEf`,
      hidden: true,
      overridden: s.overrides.combustionEfTco2PerTonne !== null,
      node: overrideField(
        "combustionEfTco2PerTonne",
        "combustionEf",
        t("combustionEf"),
        "t CO2/t",
        { help: t("combustionEfHelp"), provenance: feCite },
      ),
    },
    {
      id: `${side}.lhv`,
      hidden: true,
      overridden: s.overrides.lhvMjPerTonne !== null,
      node: overrideField("lhvMjPerTonne", "lhv", t("lhv"), "MJ/t", {
        help: t("lhvHelp"),
        provenance: feCite,
      }),
    },
    {
      id: `${side}.wtwGco2PerMj`,
      overridden: s.overrides.wtwGco2PerMj !== null,
      node: overrideField("wtwGco2PerMj", "wtw", t("wtw"), "gCO2e/MJ", {
        help: t(side === "green" ? "wtwGreenHelp" : "wtwFossilHelp"),
        provenance: feCite,
      }),
    },
    // v6 refined-emissions inputs. The certified pathway value is the
    // green side's normal lever (main); the slip scenario, pilot share
    // and sulphur are Advanced (hidden entries — outside the frozen
    // manifest, counted by the Simplified strip when departed from).
    ...(refined && side === "green" && feRow?.wttRangeGco2ePerMj
      ? [
          {
            id: `${side}.certifiedWtt`,
            overridden: em?.certifiedWttGco2ePerMj != null,
            node: (
              <NumberInput
                key={`${side}-certifiedWtt`}
                label={t("certifiedWtt")}
                unit="gCO2e/MJ"
                step={0.5}
                help={t("certifiedWttHelp")}
                value={
                  em?.certifiedWttGco2ePerMj ??
                  feRow.defaultCertifiedWttGco2ePerMj ??
                  15
                }
                onChange={(v) =>
                  setEm({ certifiedWttGco2ePerMj: Math.max(0.1, v) })
                }
              />
            ),
          },
        ]
      : []),
    ...(refined && side === "green" && feRow?.id === "e-ammonia"
      ? [
          {
            id: `${side}.n2oScenario`,
            hidden: true,
            overridden: em?.n2oScenarioId != null,
            node: (
              <Select
                key={`${side}-n2o`}
                label={t("n2oScenario")}
                help={t("n2oScenarioHelp")}
                value={em?.n2oScenarioId ?? "optimised-injection"}
                options={FUEL_EMISSIONS_DATASET.n2oSlip.scenarios.map((sc) => ({
                  value: sc.id,
                  label: sc.label,
                }))}
                onChange={(v) => setEm({ n2oScenarioId: v })}
              />
            ),
          },
        ]
      : []),
    ...(refined && side === "green"
      ? [
          {
            id: `${side}.pilotShare`,
            hidden: true,
            overridden: em?.pilotShare != null,
            node: (
              <NumberInput
                key={`${side}-pilotShare`}
                label={t("pilotShare")}
                unit="0–1"
                step={0.01}
                help={t("pilotShareHelp")}
                value={
                  em?.pilotShare ?? FUEL_EMISSIONS_DATASET.pilotFuel.defaultShareOfEnergy
                }
                onChange={(v) => setEm({ pilotShare: Math.min(0.5, Math.max(0, v)) })}
              />
            ),
          },
        ]
      : []),
    ...(refined && side === "fossil" && framework === "imo"
      ? [
          {
            id: `${side}.sulphur`,
            hidden: true,
            overridden: em?.sulphurPercent != null,
            node: (
              <NumberInput
                key={`${side}-sulphur`}
                label={t("sulphur")}
                unit="% S"
                step={0.1}
                help={t("sulphurHelp")}
                value={em?.sulphurPercent ?? 0.5}
                onChange={(v) => setEm({ sulphurPercent: Math.min(4.5, Math.max(0.1, v)) })}
              />
            ),
          },
        ]
      : []),
    // Under build-here the production lines are component sums shown in the
    // panel — the aggregate fields would fight the per-component overrides.
    // In Simplified a disabled field is noise: purchase zeroes production
    // costs, so the greyed pair renders only in Standard.
    ...(s.sourcing === "build-here" || (viewMode === "simplified" && prodZeroed)
      ? []
      : [
          {
            id: `${side}.prodCapexUsdM`,
            hidden: side === "fossil",
            overridden: s.overrides.prodCapexUsdM !== null,
            node: overrideField("prodCapexUsdM", "prodCapexUsdM", t("prodCapex"), "$m", {
              help: t("prodCapexHelp"),
              disabled: prodZeroed,
              disabledNote: t("prodZeroNote"),
            }),
          },
          {
            id: `${side}.prodOpexUsdMPerYear`,
            hidden: side === "fossil",
            overridden: s.overrides.prodOpexUsdMPerYear !== null,
            node: overrideField(
              "prodOpexUsdMPerYear",
              "prodOpexUsdMPerYear",
              t("prodOpex"),
              "$m/yr",
              { help: t("prodOpexHelp"), disabled: prodZeroed, disabledNote: t("prodZeroNote") },
            ),
          },
        ]),
  ]);

  return (
    <Section title={t(side)}>
      <Select
        label={t("type")}
        help={t("typeHelp")}
        value={s.fuelId}
        // Each side offers only its own family — a fossil corridor burning
        // e-ammonia would silently collapse the comparison (resolve.ts
        // rejects it too, for scenarios arriving by import or share link).
        options={bundle.fuels
          .filter((f) => f.family === side)
          .map((f) => ({ value: f.id, label: f.label }))}
        onChange={(v) => update((d) => void (d[side].fuelId = v))}
      />
      {/* Simplified projects are purchase-only: the sourcing selector is a
          Standard capability (one-way upgrade). Values are never rewritten —
          a non-purchase scenario arriving by import keeps computing and the
          note says where the control lives. */}
      {viewMode === "standard" ? (
        <div data-field-id={`${side}.sourcing`}>
          <Select
            label={t("sourcing")}
            help={t(side === "green" ? "sourcingGreenHelp" : "sourcingFossilHelp")}
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
      ) : s.sourcing !== "purchase" ? (
        <p className="sm:col-span-2 bg-neutral-500/5 px-2.5 py-1.5 text-[11px] leading-snug text-neutral-600">
          {t("sourcingSimplifiedNote")}
        </p>
      ) : null}
      {plantMode && legacy && (
        <p className="sm:col-span-2 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-amber-800">
          {t("legacyPriceNote")}
        </p>
      )}
      {viewMode === "standard" && s.sourcing === "build-here" && (
        <BuildHerePanel model={model} side={side} />
      )}
      {entries.main}
      {viewMode === "standard" ? (
        entries.advanced
      ) : (
        <AdvancedHiddenStrip count={entries.advancedOverrides} onReveal={revealStandard} />
      )}
    </Section>
  );
}

export function FuelStep({ model, viewMode, revealStandard }: StepProps) {
  return (
    <div className="space-y-3">
      <FuelSide model={model} viewMode={viewMode} revealStandard={revealStandard} side="green" />
      <FuelSide model={model} viewMode={viewMode} revealStandard={revealStandard} side="fossil" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Port
// ---------------------------------------------------------------------------

function PortSide({ model, viewMode, revealStandard, side }: StepProps & { side: "green" | "fossil" }) {
  const t = useTranslations("corridor.port");
  const tp = useTranslations("corridor.provenance");
  const { scenario, update, resolved, benchmarks, bundle } = model;
  if (!resolved || !benchmarks) return null;
  const fuelRow = bundle.fuels.find((f) => f.id === scenario[side].fuelId);
  const portProvenance = {
    citation: fuelRow ? sourceLabel(fuelRow.sourceNote) ?? tp("fuelTable") : undefined,
    docsId: "tab-ports",
    verified: fuelRow?.verified,
    derivation: side === "fossil" ? tp("portFossil") : undefined,
  };
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
    help: string,
  ) => (
    <ResolvedField
      key={`${side}-${key}`}
      label={label}
      unit={unit}
      help={help}
      override={scenario[side].overrides[key]}
      effective={r[key].value}
      source={r[key].source}
      benchmark={b[key].value}
      provenance={portProvenance}
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
      {field("portStorageCapexUsdM", t("storageCapex"), "$m", t("storageCapexHelp"))}
      {field("portStorageOpexUsdMPerYear", t("storageOpex"), "$m/yr", t("storageOpexHelp"))}
      {/* The barge pair sits below the sensitivity threshold — Simplified
          runs it on the benchmarks. */}
      {viewMode === "standard" ? (
        <>
          {field("bargeCapexUsdM", t("bargeCapex"), "$m", t("bargeCapexHelp"))}
          {field("bargeOpexUsdMPerYear", t("bargeOpex"), "$m/yr", t("bargeOpexHelp"))}
        </>
      ) : (
        <AdvancedHiddenStrip
          count={
            (scenario[side].overrides.bargeCapexUsdM !== null ? 1 : 0) +
            (scenario[side].overrides.bargeOpexUsdMPerYear !== null ? 1 : 0)
          }
          onReveal={revealStandard}
        />
      )}
    </Section>
  );
}

export function PortStep({ model, viewMode, revealStandard }: StepProps) {
  return (
    <div className="space-y-3">
      <PortSide model={model} viewMode={viewMode} revealStandard={revealStandard} side="green" />
      <PortSide model={model} viewMode={viewMode} revealStandard={revealStandard} side="fossil" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5 — Regulation
// ---------------------------------------------------------------------------

export function FinancingStep({ model, viewMode, revealStandard }: StepProps) {
  const t = useTranslations("corridor.regulation");
  const tc = useTranslations("corridor.cargo");
  const tRes = useTranslations("corridor.results");
  const { scenario, update, resolved, benchmarks, bundle } = model;
  const countryRow =
    bundle.countries.find((c) => c.id === scenario.cargo.countryId) ??
    bundle.countries.find((c) => c.id === "other");
  const simple = viewMode === "simplified";
  // What Simplified is hiding per module, counted only while it is enabled
  // (a hidden value on a disabled module is inert). The green rate is
  // sensitivity top-level, so it stays VISIBLE and is not counted; the
  // others compare against their toggle-on init values.
  const fin = scenario.financing;
  const finInitBaseRate = Math.round((resolved?.wacc.value ?? 0.08) * 1000) / 1000;
  const finHidden = fin?.enabled
    ? (fin.baseRate !== finInitBaseRate ? 1 : 0) +
      (fin.debtShare !== 1 ? 1 : 0) +
      (fin.tenorYears !== Math.min(15, scenario.cargo.horizonYears) ? 1 : 0) +
      (fin.structure !== "amortizing" ? 1 : 0)
    : 0;
  const phasing = scenario.capitalPhasing;
  const isUnphased = (w: number[]) => w.length === 1 && w[0] === 1;
  const phasingHidden = phasing?.enabled
    ? (isUnphased(phasing.green.weights) ? 0 : 1) +
      (isUnphased(phasing.fossil.weights) ? 0 : 1)
    : 0;
  const phasingYears = phasing
    ? Math.max(phasing.green.weights.length, phasing.fossil.weights.length)
    : 1;
  const resizeWeights = (w: number[], n: number): number[] =>
    Array.from({ length: n }, (_, i) => w[i] ?? 0);

  return (
    <div className="space-y-3">
      {/* Its own tab since sprint 4's amendment: WACC/inflation (keys
          stay cargo.*), differentiated green financing, and the capital
          deployment schedule. Regulation schemes live on the next tab. */}
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
            provenance={
              countryRow
                ? {
                    citation: sourceLabel(countryRow.sourceNote) ?? tc("countryHelp"),
                    verified: countryRow.verified,
                    docsId: "tab-financing",
                  }
                : undefined
            }
            onChange={(v) => update((d) => void (d.cargo.waccOverride = v))}
          />
          </div>
        ) : null}
        <NumberInput
          label={tc("inflation")}
          help={tc("inflationHelp")}
          unit="fraction"
          step={0.005}
          value={scenario.cargo.inflation}
          onChange={(v) => update((d) => void (d.cargo.inflation = v))}
        />
        {/* Rate basis lives with the cost of money it governs (moved from
            Intro's model options): nominal discounts inflated costs, real
            deflates the escalation. Key stays flags.rateBasis. */}
        {!simple ? (
          <Select
            label={t("rateBasis")}
            help={t("rateBasisHelp")}
            value={scenario.flags?.rateBasis ?? "nominal"}
            options={[
              { value: "nominal", label: t("rateNominal") },
              { value: "real", label: t("rateReal") },
            ]}
            onChange={(v) =>
              update(
                (d) => void (d.flags = { ...d.flags, rateBasis: v as "nominal" | "real" }),
              )
            }
          />
        ) : (
          <AdvancedHiddenStrip
            count={
              (scenario.flags?.rateBasis ?? "nominal") !==
              (FLAGS_DEFAULTS?.rateBasis ?? "nominal")
                ? 1
                : 0
            }
            onReveal={revealStandard}
          />
        )}
        {/* Cargo-owner willingness to pay. NOT a cost line: it never enters
            the corridor's PV, so it cannot move the headline gap — a
            customer agreeing to pay does not make the corridor cheaper to
            run. It splits the gap that is already there into a customer
            share and the public support that remains, which is what the
            waterfall's last two bars show. Default 0 = off, because a
            willingness to pay is a fact about one negotiation, never a
            benchmark the model can supply.

            Placed BEFORE differential financing: it asks who covers the gap,
            which is the question a reader has before they ask how the debt on
            it is priced. */}
        <div className="sm:col-span-2 border-t border-neutral-200 pt-3">
          <NumberInput
            label={t("wtp")}
            unit="$/tCO2e"
            step={10}
            help={t("wtpHelp")}
            value={scenario.commercial?.willingnessToPayUsdPerTonneCo2 ?? 0}
            onChange={(v) =>
              update((d) => {
                const next = Math.max(0, Math.min(10_000, v));
                if (d.commercial) {
                  d.commercial.willingnessToPayUsdPerTonneCo2 = next;
                } else if (next > 0) {
                  d.commercial = { willingnessToPayUsdPerTonneCo2: next };
                }
              })
            }
          />
        </div>
        {/* Sprint 4 — differentiated green financing: an explicit interest
            saving/premium line, NEVER a per-side discount rate (which
            inverts the benefit in a cost model — see the methodology). */}
        <div className="sm:col-span-2 border-t border-neutral-200 pt-3">
          <SwitchRow
            label={t("finToggle")}
            help={t("finToggleHelp")}
            checked={scenario.financing?.enabled ?? false}
            onChange={(v) =>
              update((d) => {
                if (d.financing) {
                  d.financing.enabled = v;
                } else if (v) {
                  // Toggle-on initialises CONCRETE values: base rate = the
                  // corridor's current discount rate, tenor min(15, horizon).
                  d.financing = {
                    enabled: true,
                    greenRate: 0.06,
                    baseRate:
                      Math.round((resolved?.wacc.value ?? 0.08) * 1000) / 1000,
                    debtShare: 1,
                    tenorYears: Math.min(15, d.cargo.horizonYears),
                    structure: "amortizing",
                  };
                }
              })
            }
          />
        </div>
        {scenario.financing?.enabled && (
          <>
            <NumberInput
              label={t("finGreenRate")}
              unit="fraction"
              step={0.005}
              help={t("finGreenRateHelp")}
              value={scenario.financing.greenRate}
              onChange={(v) =>
                update((d) => void (d.financing && (d.financing.greenRate = v)))
              }
            />
            {!simple && (
              <>
                <NumberInput
                  label={t("finBaseRate")}
                  unit="fraction"
                  step={0.005}
                  help={t("finBaseRateHelp")}
                  value={scenario.financing.baseRate}
                  onChange={(v) =>
                    update((d) => void (d.financing && (d.financing.baseRate = v)))
                  }
                />
                <NumberInput
                  label={t("finDebtShare")}
                  unit="0–1"
                  step={0.05}
                  help={t("finDebtShareHelp")}
                  value={scenario.financing.debtShare}
                  onChange={(v) =>
                    update(
                      (d) =>
                        void (d.financing &&
                          (d.financing.debtShare = Math.min(1, Math.max(0, v)))),
                    )
                  }
                />
                <NumberInput
                  label={t("finTenor")}
                  unit="yr"
                  step={1}
                  help={t("finTenorHelp")}
                  value={scenario.financing.tenorYears}
                  onChange={(v) =>
                    update(
                      (d) =>
                        void (d.financing &&
                          (d.financing.tenorYears = Math.min(
                            40,
                            Math.max(1, Math.round(v)),
                          ))),
                    )
                  }
                />
                <Select
                  label={t("finStructure")}
                  help={t("finStructureHelp")}
                  value={scenario.financing.structure}
                  options={[
                    { value: "amortizing", label: t("finAmortizing") },
                    { value: "bullet", label: t("finBullet") },
                  ]}
                  onChange={(v) =>
                    update(
                      (d) =>
                        void (d.financing &&
                          (d.financing.structure = v as "amortizing" | "bullet")),
                    )
                  }
                />
              </>
            )}
            <p className="sm:col-span-2 text-[11px] leading-snug text-neutral-500">
              {t("finNote")}
            </p>
            {simple && (
              <AdvancedHiddenStrip count={finHidden} onReveal={revealStandard} />
            )}
          </>
        )}
        {/* Sprint 4 — capital deployment schedule: CAPEX over the first N
            years by explicit shares. Sum-to-1 is enforced by validation —
            the amber line below mirrors it live, nothing is normalised. */}
        <div className="sm:col-span-2 border-t border-neutral-200 pt-3">
          <SwitchRow
            label={t("phasingToggle")}
            help={t("phasingToggleHelp")}
            checked={phasing?.enabled ?? false}
            onChange={(v) =>
              update((d) => {
                if (d.capitalPhasing) {
                  d.capitalPhasing.enabled = v;
                } else if (v) {
                  d.capitalPhasing = {
                    enabled: true,
                    green: { weights: [1] },
                    fossil: { weights: [1] },
                  };
                }
              })
            }
          />
        </div>
        {phasing?.enabled && (
          <>
            {!simple && (
              <>
                <div className="flex items-end gap-2">
                  <Select
                    label={t("phasingYears")}
                    help={t("phasingYearsHelp")}
                    value={String(phasingYears)}
                    options={[1, 2, 3, 4, 5].map((n) => ({
                      value: String(n),
                      label: String(n),
                    }))}
                    onChange={(v) =>
                      update((d) => {
                        const n = Number(v);
                        if (!d.capitalPhasing) return;
                        d.capitalPhasing.green.weights = resizeWeights(
                          d.capitalPhasing.green.weights,
                          n,
                        );
                        d.capitalPhasing.fossil.weights = resizeWeights(
                          d.capitalPhasing.fossil.weights,
                          n,
                        );
                      })
                    }
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    className="border border-neutral-300 px-2 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                    onClick={() =>
                      update((d) => {
                        if (!d.capitalPhasing) return;
                        d.capitalPhasing.green.weights = [0.3, 0.4, 0.3];
                        d.capitalPhasing.fossil.weights = [0.3, 0.4, 0.3];
                      })
                    }
                  >
                    {t("phasingPreset")}
                  </button>
                </div>
                {(["green", "fossil"] as const).map((sideKey) => {
                  const weights = phasing[sideKey].weights;
                  const sum = weights.reduce((a, b) => a + b, 0);
                  const bad = Math.abs(sum - 1) > 1e-6;
                  return (
                    // A broken sum BLOCKS evaluation (resolution throws by
                    // name), so it wears red, not amber — on every weight
                    // field and on the line naming the rule. The id lets
                    // the red financing tab focus the offending grid.
                    <div
                      key={sideKey}
                      className="sm:col-span-2"
                      data-field-id={bad ? "capitalPhasing" : undefined}
                    >
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                        {weights.map((w, i) => (
                          <NumberInput
                            key={`${sideKey}-${i}`}
                            label={t(
                              sideKey === "green"
                                ? "phasingGreenYear"
                                : "phasingFossilYear",
                              { n: i + 1 },
                            )}
                            unit="0–1"
                            step={0.05}
                            help={t("phasingWeightHelp")}
                            value={w}
                            invalid={bad}
                            onChange={(v) =>
                              update((d) => {
                                if (!d.capitalPhasing) return;
                                d.capitalPhasing[sideKey].weights[i] = Math.min(
                                  1,
                                  Math.max(0, v),
                                );
                              })
                            }
                          />
                        ))}
                      </div>
                      {bad && (
                        <p className="mt-1 text-xs font-medium text-red-600">
                          {t("phasingSumBad", {
                            side: tRes(sideKey === "green" ? "sideGreen" : "sideFossil"),
                            sum: sum.toFixed(2),
                          })}
                        </p>
                      )}
                    </div>
                  );
                })}
              </>
            )}
            <p className="sm:col-span-2 text-[11px] leading-snug text-neutral-500">
              {t("phasingNote")}
            </p>
            {simple && (
              <AdvancedHiddenStrip count={phasingHidden} onReveal={revealStandard} />
            )}
          </>
        )}
      </Section>
    </div>
  );
}

export function RegulationStep({ model, viewMode, revealStandard }: StepProps) {
  const t = useTranslations("corridor.regulation");
  const { scenario, update } = model;
  const reg = scenario.regulation;
  const simple = viewMode === "simplified";
  // What Simple is hiding per scheme, counted only while the scheme is
  // enabled (a hidden value on a disabled scheme is inert).
  const etsHidden =
    (reg.ets.euaEurPerTonne !== REG_DEFAULTS.ets.euaEurPerTonne ? 1 : 0) +
    (reg.eurUsd !== REG_DEFAULTS.eurUsd ? 1 : 0) +
    (reg.ets.scope !== REG_DEFAULTS.ets.scope ? 1 : 0) +
    (reg.ets.euaEscalation != null ? 1 : 0);
  const fuelEuHidden =
    (reg.fuelEu.penaltyEurPerTonne !== REG_DEFAULTS.fuelEu.penaltyEurPerTonne ? 1 : 0) +
    (reg.fuelEu.scope !== REG_DEFAULTS.fuelEu.scope ? 1 : 0) +
    (reg.fuelEu.vlsfoMjPerTonne !== REG_DEFAULTS.fuelEu.vlsfoMjPerTonne ? 1 : 0) +
    (reg.fuelEu.baselineGco2PerMj !== REG_DEFAULTS.fuelEu.baselineGco2PerMj ? 1 : 0);
  const iraHidden =
    reg.ira45z.creditUsdPerGallon !== REG_DEFAULTS.ira45z.creditUsdPerGallon ? 1 : 0;
  const imoHidden =
    ((reg.imoNetZero?.scope ?? 1) !== 1 ? 1 : 0) +
    (reg.imoNetZero?.rewardUsdPerTonneCo2e != null ? 1 : 0) +
    (reg.imoNetZero?.priceEscalation != null ? 1 : 0);
  // co2Price is NOT counted: it stays visible in Simplified (the scheme's
  // one headline lever).
  const selfHidden =
    (reg.selfDesigned.supportUsdPerKg !== REG_DEFAULTS.selfDesigned.supportUsdPerKg ? 1 : 0) +
    (reg.selfDesigned.capexSupport !== REG_DEFAULTS.selfDesigned.capexSupport ? 1 : 0) +
    (reg.selfDesigned.opexSupport !== REG_DEFAULTS.selfDesigned.opexSupport ? 1 : 0) +
    (reg.selfDesigned.otherUsdM !== REG_DEFAULTS.selfDesigned.otherUsdM ? 1 : 0) +
    (reg.selfDesigned.co2PriceEscalation != null ? 1 : 0);

  // Simplified shows ONLY the self-designed scheme. The other four sections
  // do not render at all; this counter reports any of them that a scenario
  // carries ENABLED (import/upgrade-history safety net) so nothing shapes
  // the result invisibly: each active scheme counts 1 + its parameter
  // departures.
  const otherSchemesHidden =
    (reg.ets.enabled ? 1 + etsHidden : 0) +
    (reg.fuelEu.enabled ? 1 + fuelEuHidden : 0) +
    (reg.ira45z.enabled ? 1 + iraHidden : 0) +
    (reg.imoNetZero?.enabled ? 1 + imoHidden : 0);

  return (
    <div className="space-y-3">
      {/* v6 — the emission-accounting framework, visible in BOTH modes
          (explicit product decision): which framework's factors the
          corridor's intensities derive from. Default FuelEU. The FuelEU
          and IMO compliance modules each still price with their OWN
          accounting regardless of this selection. */}
      <Section title={t("emissionAccounting")}>
        <Select
          label={t("framework")}
          help={t("frameworkHelp")}
          value={reg.emissions?.framework ?? "fueleu"}
          options={[
            { value: "fueleu", label: t("frameworkFuelEu") },
            { value: "imo", label: t("frameworkImo") },
          ]}
          onChange={(v) =>
            update((d) => {
              d.regulation.emissions = { framework: v as "fueleu" | "imo" };
            })
          }
        />
        <p className="sm:col-span-2 text-[11px] leading-snug text-neutral-500">
          {reg.emissions ? t("frameworkNote") : t("frameworkLegacyNote")}
        </p>
      </Section>
      {/* Silent-active safety net ONLY: the section appears when a scheme
          the Simplified view cannot show is switched on in the scenario
          (import/upgrade history) — otherwise Simplified has no trace of
          the EU/IMO/US modules at all. */}
      {simple && otherSchemesHidden > 0 && (
        <Section title={t("otherSchemes")}>
          <AdvancedHiddenStrip count={otherSchemesHidden} onReveal={revealStandard} />
        </Section>
      )}
      {!simple && (
        <>
      <Section title={t("ets")}>
        <div className="sm:col-span-2">
          <SwitchRow
            label={t("include")}
            help={t("etsIncludeHelp")}
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
                  help={t("euaHelp")}
                  unit="€/t CO2"
                  value={reg.ets.euaEurPerTonne}
                  onChange={(v) => update((d) => void (d.regulation.ets.euaEurPerTonne = v))}
                />
                <NumberInput
                  label={t("eurUsd")}
                  help={t("eurUsdHelp")}
                  step={0.01}
                  value={reg.eurUsd}
                  invalid={model.invalidFields.includes("regulation.eurUsd")}
                  onChange={(v) => update((d) => void (d.regulation.eurUsd = v))}
                />
                {/* The likeliest misconfiguration in the whole module: the
                    1.0/0.5 split is a property of the ROUTE, not a modelling
                    preference, and leaving it at 1.0 on an extra-EEA corridor
                    doubles the charge. */}
                <NumberInput
                  label={t("etsScope")}
                  unit="0–1"
                  step={0.05}
                  help={t("etsScopeHelp")}
                  value={reg.ets.scope}
                  onChange={(v) => update((d) => void (d.regulation.ets.scope = v))}
                />
              </>
            )}
            <p className="sm:col-span-2 text-[11px] text-neutral-500">{t("phaseNote")}</p>
            {simple ? (
              <AdvancedHiddenStrip count={etsHidden} onReveal={revealStandard} />
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
            help={t("fuelEuIncludeHelp")}
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
                  help={t("penaltyHelp")}
                  unit="€/t VLSFO-eq"
                  value={reg.fuelEu.penaltyEurPerTonne}
                  onChange={(v) =>
                    update((d) => void (d.regulation.fuelEu.penaltyEurPerTonne = v))
                  }
                />
                <NumberInput
                  label={t("fuelEuScope")}
                  help={t("fuelEuScopeHelp")}
                  unit="0–1"
                  step={0.05}
                  value={reg.fuelEu.scope}
                  onChange={(v) => update((d) => void (d.regulation.fuelEu.scope = v))}
                />
              </>
            )}
            {!simple && (
              <>
                <NumberInput
                  label={t("vlsfo")}
                  help={t("vlsfoHelp")}
                  unit="MJ/t"
                  value={reg.fuelEu.vlsfoMjPerTonne}
                  onChange={(v) => update((d) => void (d.regulation.fuelEu.vlsfoMjPerTonne = v))}
                />
                <NumberInput
                  label={t("baseline")}
                  help={t("baselineHelp")}
                  unit="gCO2e/MJ"
                  step={0.01}
                  value={reg.fuelEu.baselineGco2PerMj}
                  onChange={(v) =>
                    update((d) => void (d.regulation.fuelEu.baselineGco2PerMj = v))
                  }
                />
              </>
            )}
            {simple && <AdvancedHiddenStrip count={fuelEuHidden} onReveal={revealStandard} />}
            <p className="sm:col-span-2 text-[11px] text-neutral-500">{t("targetNote")}</p>
          </>
        )}
      </Section>

      <Section title={t("ira")}>
        <div className="sm:col-span-2">
          <SwitchRow
            label={t("include")}
            help={t("iraIncludeHelp")}
            checked={reg.ira45z.enabled}
            onChange={(v) => update((d) => void (d.regulation.ira45z.enabled = v))}
          />
        </div>
        {reg.ira45z.enabled && (
          <>
            <div className="sm:col-span-2">
              <SwitchRow
                label={t("usProduced")}
                help={t("usProducedHelp")}
                checked={reg.ira45z.usProduced}
                onChange={(v) => update((d) => void (d.regulation.ira45z.usProduced = v))}
              />
            </div>
            {!simple && (
              <NumberInput
                label={t("rate")}
                help={t("rateHelp")}
                unit="$/gal-eq"
                step={0.05}
                value={reg.ira45z.creditUsdPerGallon}
                onChange={(v) =>
                  update((d) => void (d.regulation.ira45z.creditUsdPerGallon = v))
                }
              />
            )}
            {simple && <AdvancedHiddenStrip count={iraHidden} onReveal={revealStandard} />}
          </>
        )}
      </Section>

      <Section title={t("imo")}>
        <div className="sm:col-span-2">
          <SwitchRow
            label={t("include")}
            help={t("imoIncludeHelp")}
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
            {!simple && (
              <>
                <NumberInput
                  label={t("imoScope")}
                  help={t("imoScopeHelp")}
                  unit="0–1"
                  step={0.05}
                  value={reg.imoNetZero.scope}
                  onChange={(v) =>
                    update(
                      (d) =>
                        void (d.regulation.imoNetZero!.scope = Math.min(1, Math.max(0, v))),
                    )
                  }
                />
                <div />
              </>
            )}
            <p className="sm:col-span-2 text-[11px] leading-snug text-neutral-500">
              {t("imoNote")}
            </p>
            {simple ? (
              <AdvancedHiddenStrip count={imoHidden} onReveal={revealStandard} />
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

        </>
      )}
      <Section title={t("selfDesigned")}>
        <div className="sm:col-span-2">
          <SwitchRow
            label={t("include")}
            help={t("selfIncludeHelp")}
            checked={reg.selfDesigned.enabled}
            onChange={(v) => update((d) => void (d.regulation.selfDesigned.enabled = v))}
          />
        </div>
        {reg.selfDesigned.enabled && (
          <>
            <NumberInput
              label={t("co2Price")}
              help={t("co2PriceHelp")}
              unit="$/t CO2"
              value={reg.selfDesigned.co2PriceUsdPerTonne}
              onChange={(v) =>
                update((d) => void (d.regulation.selfDesigned.co2PriceUsdPerTonne = v))
              }
            />
            {!simple && (
              <>
                <NumberInput
                  label={t("support")}
                  help={t("supportHelp")}
                  unit="$/kg"
                  step={0.05}
                  value={reg.selfDesigned.supportUsdPerKg}
                  onChange={(v) =>
                    update((d) => void (d.regulation.selfDesigned.supportUsdPerKg = v))
                  }
                />
                <NumberInput
                  label={t("capexSupport")}
                  help={t("capexSupportHelp")}
                  unit="0–1"
                  step={0.05}
                  value={reg.selfDesigned.capexSupport}
                  onChange={(v) =>
                    update((d) => void (d.regulation.selfDesigned.capexSupport = v))
                  }
                />
                <NumberInput
                  label={t("opexSupport")}
                  help={t("opexSupportHelp")}
                  unit="0–1"
                  step={0.05}
                  value={reg.selfDesigned.opexSupport}
                  onChange={(v) =>
                    update((d) => void (d.regulation.selfDesigned.opexSupport = v))
                  }
                />
                <NumberInput
                  label={t("other")}
                  help={t("otherHelp")}
                  unit="$m/yr"
                  value={reg.selfDesigned.otherUsdM}
                  onChange={(v) => update((d) => void (d.regulation.selfDesigned.otherUsdM = v))}
                />
              </>
            )}
            {simple ? (
              <AdvancedHiddenStrip count={selfHidden} onReveal={revealStandard} />
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
