"use client";

import { useTranslations } from "next-intl";
import type { ScenarioInput } from "@h2map/corridor-schema";
import { NumberInput } from "@/components/ui/NumberInput";
import { Select } from "@/components/ui/Select";
import { TextInput } from "@/components/ui/TextInput";
import { SwitchRow } from "@/components/ui/Switch";
import { Section, Advanced } from "@/components/ui/Card";
import ResolvedField from "./ResolvedField";
import BuildHerePanel from "./BuildHerePanel";
import { CORRIDOR_COUNTRIES } from "@/lib/corridor-countries";
import { isAdvanced, type CorridorModel } from "./state";

/**
 * The five wizard steps, mirroring the workbook's input tabs (build-plan 3.1).
 * Every benchmarkable input renders through ResolvedField; field prominence
 * (top-level vs the Advanced fold) comes from the sensitivity-derived
 * ui-manifest (build-plan 3.2) — the interface tracks the model.
 */

interface StepProps {
  model: CorridorModel;
}

// ---------------------------------------------------------------------------
// Shared primitives (components/ui) + thin corridor bindings
// ---------------------------------------------------------------------------

/** Advanced fold labeled from the corridor namespace. */
function AdvancedFold({ children }: { children: React.ReactNode }) {
  const t = useTranslations("corridor.field");
  return <Advanced label={t("advanced")}>{children}</Advanced>;
}

/** Places a field in the main grid or collects it for the Advanced fold. */
function splitByManifest(
  entries: { id: string; node: React.ReactNode }[],
): { main: React.ReactNode[]; advanced: React.ReactNode[] } {
  const main: React.ReactNode[] = [];
  const advanced: React.ReactNode[] = [];
  for (const e of entries) (isAdvanced(e.id) ? advanced : main).push(e.node);
  return { main, advanced };
}

// ---------------------------------------------------------------------------
// Step 1 — Cargo & Corridor
// ---------------------------------------------------------------------------

export function CargoStep({ model }: StepProps) {
  const t = useTranslations("corridor.cargo");
  const { scenario, update, resolved, benchmarks, bundle } = model;

  const fields = splitByManifest([
    {
      id: "cargo.oneWayDistanceNm",
      node: (
        <NumberInput
          key="dist"
          label={t("distance")}
          unit="nm"
          value={scenario.cargo.oneWayDistanceNm}
          onChange={(v) => update((d) => void (d.cargo.oneWayDistanceNm = v))}
        />
      ),
    },
    {
      id: "cargo.startYear",
      node: (
        <NumberInput
          key="start"
          label={t("startYear")}
          step={1}
          value={scenario.cargo.startYear}
          onChange={(v) => update((d) => void (d.cargo.startYear = Math.round(v)))}
        />
      ),
    },
    {
      id: "cargo.horizonYears",
      node: (
        <NumberInput
          key="horizon"
          label={t("horizon")}
          step={1}
          value={scenario.cargo.horizonYears}
          onChange={(v) =>
            update((d) => void (d.cargo.horizonYears = Math.max(1, Math.min(40, Math.round(v)))))
          }
        />
      ),
    },
    {
      id: "cargo.unitsPerYear",
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
    {
      id: "cargo.wacc",
      node:
        resolved && benchmarks ? (
          <ResolvedField
            key="wacc"
            label={t("wacc")}
            unit="fraction"
            step={0.005}
            help={t("waccHelp")}
            override={scenario.cargo.waccOverride}
            effective={resolved.wacc.value}
            source={resolved.wacc.source}
            benchmark={benchmarks.wacc.value}
            unverified
            onChange={(v) => update((d) => void (d.cargo.waccOverride = v))}
          />
        ) : null,
    },
    {
      id: "cargo.inflation",
      node: (
        <NumberInput
          key="infl"
          label={t("inflation")}
          unit="fraction"
          step={0.005}
          value={scenario.cargo.inflation}
          onChange={(v) => update((d) => void (d.cargo.inflation = v))}
        />
      ),
    },
  ]);

  const twoPorts = scenario.cargo.routeType === "point-to-point";
  // Cargo-unit identity: explicit choice, else derived from the vessel
  // (container → TEU, everything else → tonne). Presentation-only.
  const cargoUnit =
    scenario.cargo.unit ??
    (scenario.vessel.typeId.startsWith("container") ? "teu" : "tonne");

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
        {/* Port A + its country (the model's anchor: WACC benchmark) */}
        <TextInput
          label={twoPorts ? t("portA") : t("singlePort")}
          value={scenario.cargo.portAName ?? ""}
          onChange={(v) => update((d) => void (d.cargo.portAName = v || undefined))}
        />
        <Select
          label={twoPorts ? t("countryA") : t("country")}
          help={t("countryHelp")}
          value={scenario.cargo.countryId}
          options={CORRIDOR_COUNTRIES}
          onChange={(v) => update((d) => void (d.cargo.countryId = v))}
        />
        {twoPorts && (
          <>
            <TextInput
              label={t("portB")}
              value={scenario.cargo.portBName ?? ""}
              onChange={(v) => update((d) => void (d.cargo.portBName = v || undefined))}
            />
            <Select
              label={t("countryB")}
              value={scenario.cargo.countryBId ?? scenario.cargo.countryId}
              options={CORRIDOR_COUNTRIES}
              onChange={(v) => update((d) => void (d.cargo.countryBId = v))}
            />
          </>
        )}
        {/* What one cargo unit IS (tonne / TEU) + its weight */}
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
              d.cargo.unitWeightTonnes = v === "teu" ? (d.cargo.unitWeightTonnes ?? 14) : 1;
            })
          }
        />
        <NumberInput
          label={t("unitWeight")}
          unit="t"
          step={0.5}
          help={t("unitWeightHelp")}
          value={scenario.cargo.unitWeightTonnes ?? (cargoUnit === "teu" ? 14 : 1)}
          onChange={(v) => update((d) => void (d.cargo.unitWeightTonnes = Math.max(0.01, v)))}
        />
        {fields.main}
      </div>
      {fields.advanced.length > 0 && <AdvancedFold>{fields.advanced}</AdvancedFold>}
    </div>
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

function FuelSide({ model, side }: StepProps & { side: "green" | "fossil" }) {
  const t = useTranslations("corridor.fuel");
  const { scenario, update, resolved, benchmarks, bundle } = model;
  if (!resolved || !benchmarks) return null;
  const s = scenario[side];
  const r = resolved[side];
  const b = benchmarks[side];
  const delivered = s.sourcing === "named-plant" || s.sourcing === "build-here";
  const prodZeroed = s.sourcing !== "construct";

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
    ...(delivered
      ? []
      : [
          {
            id: `${side}.priceUsdPerTonne`,
            node: overrideField("priceUsdPerTonne", "priceUsdPerTonne", t("price"), "$/t"),
          },
        ]),
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
      node: overrideField("wtwGco2PerMj", "wtw", t("wtw"), "gCO2e/MJ", {
        help: t("wtwHelp"),
      }),
    },
    {
      id: `${side}.prodCapexUsdM`,
      node: overrideField("prodCapexUsdM", "prodCapexUsdM", t("prodCapex"), "$m", {
        disabled: prodZeroed,
        disabledNote: t("prodZeroNote"),
      }),
    },
    {
      id: `${side}.prodOpexUsdMPerYear`,
      node: overrideField("prodOpexUsdMPerYear", "prodOpexUsdMPerYear", t("prodOpex"), "$m/yr", {
        disabled: prodZeroed,
        disabledNote: t("prodZeroNote"),
      }),
    },
  ]);

  return (
    <Section title={t(side)}>
      <Select
        label={t("type")}
        value={s.fuelId}
        options={bundle.fuels.map((f) => ({ value: f.id, label: f.label }))}
        onChange={(v) => update((d) => void (d[side].fuelId = v))}
      />
      <Select
        label={t("sourcing")}
        value={s.sourcing}
        options={[
          { value: "construct", label: t("sourcingConstruct") },
          { value: "purchase", label: t("sourcingPurchase") },
          { value: "named-plant", label: t("sourcingNamedPlant") },
          // Build-here (pick an H2 production site) only makes sense green-side.
          ...(side === "green"
            ? [{ value: "build-here", label: t("sourcingBuildHere") }]
            : []),
        ]}
        onChange={(v) =>
          update((d) => {
            d[side].sourcing = v as ScenarioInput["green"]["sourcing"];
            if (v === "named-plant" || v === "build-here") {
              d[side].deliveredPriceUsdPerTonne ??=
                bundle.fuels.find((f) => f.id === d[side].fuelId)?.priceUsdPerTonne ?? 900;
            }
          })
        }
      />
      {s.sourcing === "construct" && (
        <p className="sm:col-span-2 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-amber-800">
          {t("constructNote")}
        </p>
      )}
      {delivered && (
        <NumberInput
          label={t("deliveredPrice")}
          unit="$/t"
          value={s.deliveredPriceUsdPerTonne ?? 0}
          onChange={(v) => update((d) => void (d[side].deliveredPriceUsdPerTonne = v))}
        />
      )}
      {s.sourcing === "build-here" && <BuildHerePanel model={model} side={side} />}
      {entries.main}
      {entries.advanced.length > 0 && (
        <div className="sm:col-span-2">
          <AdvancedFold>{entries.advanced}</AdvancedFold>
        </div>
      )}
    </Section>
  );
}

export function FuelStep({ model }: StepProps) {
  return (
    <div className="space-y-3">
      <FuelSide model={model} side="green" />
      <FuelSide model={model} side="fossil" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Port
// ---------------------------------------------------------------------------

function PortSide({ model, side }: StepProps & { side: "green" | "fossil" }) {
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
      {field("bargeCapexUsdM", t("bargeCapex"), "$m")}
      {field("bargeOpexUsdMPerYear", t("bargeOpex"), "$m/yr")}
    </Section>
  );
}

export function PortStep({ model }: StepProps) {
  return (
    <div className="space-y-3">
      <PortSide model={model} side="green" />
      <PortSide model={model} side="fossil" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5 — Regulation
// ---------------------------------------------------------------------------

export function RegulationStep({ model }: StepProps) {
  const t = useTranslations("corridor.regulation");
  const { scenario, update } = model;
  const reg = scenario.regulation;

  return (
    <div className="space-y-3">
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
            <p className="sm:col-span-2 text-[11px] text-neutral-500">{t("phaseNote")}</p>
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
            <NumberInput
              label={t("penalty")}
              unit="€/t VLSFO-eq"
              value={reg.fuelEu.penaltyEurPerTonne}
              onChange={(v) => update((d) => void (d.regulation.fuelEu.penaltyEurPerTonne = v))}
            />
            <NumberInput
              label={t("fuelEuScope")}
              unit="0–1"
              step={0.05}
              value={reg.fuelEu.scope}
              onChange={(v) => update((d) => void (d.regulation.fuelEu.scope = v))}
            />
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
          </>
        )}
      </Section>

      <Section title={t("flags")}>
        <Select
          label={t("emissionsBasis")}
          value={scenario.flags?.emissionsBasis ?? "combustion"}
          options={[
            { value: "combustion", label: t("basisCombustion") },
            { value: "wellToWake", label: t("basisWtw") },
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
          label={t("rateBasis")}
          value={scenario.flags?.rateBasis ?? "nominal"}
          options={[
            { value: "nominal", label: t("rateNominal") },
            { value: "real", label: t("rateReal") },
          ]}
          onChange={(v) =>
            update((d) => void (d.flags = { ...d.flags, rateBasis: v as "nominal" | "real" }))
          }
        />
      </Section>
    </div>
  );
}
