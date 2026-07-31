"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import type { ScenarioInput } from "@h2map/corridor-schema";
import ResolvedField from "./ResolvedField";
import BuildHerePanel from "./BuildHerePanel";
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
// Local primitives
// ---------------------------------------------------------------------------

function PlainNumber({
  label,
  value,
  onChange,
  unit,
  step = "any",
  help,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  step?: number | "any";
  help?: string;
}) {
  const id = useId();
  return (
    <div>
      <label
        htmlFor={id}
        className="flex items-center gap-1.5 text-xs font-medium text-neutral-600"
        title={help}
      >
        {label}
      </label>
      <div className="mt-1 flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-500/40">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(n);
          }}
          className="min-w-0 flex-1 bg-transparent text-sm tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        {unit ? <span className="shrink-0 text-xs text-neutral-500">{unit}</span> : null}
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div>
      <label
        htmlFor={id}
        className="text-xs font-medium text-neutral-600"
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/40"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium">
      {label}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? "bg-blue-600" : "bg-neutral-300"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-neutral-200 p-3">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Advanced({ children }: { children: React.ReactNode }) {
  const t = useTranslations("corridor.field");
  return (
    <details className="rounded-lg border border-dashed border-neutral-300 p-3">
      <summary className="cursor-pointer select-none text-xs font-medium uppercase tracking-wide text-neutral-500">
        {t("advanced")}
      </summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{children}</div>
    </details>
  );
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
        <PlainNumber
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
        <PlainNumber
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
        <PlainNumber
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
        <PlainNumber
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
        <PlainNumber
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

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label={t("country")}
          value={scenario.cargo.countryId}
          options={bundle.countries.map((c) => ({ value: c.id, label: c.label }))}
          onChange={(v) => update((d) => void (d.cargo.countryId = v))}
        />
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
        {fields.main}
      </div>
      {fields.advanced.length > 0 && <Advanced>{fields.advanced}</Advanced>}
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
        <PlainNumber
          label={t("vessels")}
          step={1}
          value={scenario.cargo.vessels}
          onChange={(v) => update((d) => void (d.cargo.vessels = Math.max(1, Math.round(v))))}
        />
        <PlainNumber
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
        <PlainNumber
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
          <Advanced>{entries.advanced}</Advanced>
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
          <Toggle
            label={t("include")}
            checked={reg.ets.enabled}
            onChange={(v) => update((d) => void (d.regulation.ets.enabled = v))}
          />
        </div>
        {reg.ets.enabled && (
          <>
            <PlainNumber
              label={t("eua")}
              unit="€/t CO2"
              value={reg.ets.euaEurPerTonne}
              onChange={(v) => update((d) => void (d.regulation.ets.euaEurPerTonne = v))}
            />
            <PlainNumber
              label={t("eurUsd")}
              step={0.01}
              value={reg.eurUsd}
              onChange={(v) => update((d) => void (d.regulation.eurUsd = v))}
            />
            <PlainNumber
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
          <Toggle
            label={t("include")}
            checked={reg.fuelEu.enabled}
            onChange={(v) => update((d) => void (d.regulation.fuelEu.enabled = v))}
          />
        </div>
        {reg.fuelEu.enabled && (
          <>
            <PlainNumber
              label={t("penalty")}
              unit="€/t VLSFO-eq"
              value={reg.fuelEu.penaltyEurPerTonne}
              onChange={(v) => update((d) => void (d.regulation.fuelEu.penaltyEurPerTonne = v))}
            />
            <PlainNumber
              label={t("fuelEuScope")}
              unit="0–1"
              step={0.05}
              value={reg.fuelEu.scope}
              onChange={(v) => update((d) => void (d.regulation.fuelEu.scope = v))}
            />
            <PlainNumber
              label={t("vlsfo")}
              unit="MJ/t"
              value={reg.fuelEu.vlsfoMjPerTonne}
              onChange={(v) => update((d) => void (d.regulation.fuelEu.vlsfoMjPerTonne = v))}
            />
            <PlainNumber
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
          <Toggle
            label={t("include")}
            checked={reg.ira45z.enabled}
            onChange={(v) => update((d) => void (d.regulation.ira45z.enabled = v))}
          />
        </div>
        {reg.ira45z.enabled && (
          <>
            <div className="sm:col-span-2">
              <Toggle
                label={t("usProduced")}
                checked={reg.ira45z.usProduced}
                onChange={(v) => update((d) => void (d.regulation.ira45z.usProduced = v))}
              />
            </div>
            <PlainNumber
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
          <Toggle
            label={t("include")}
            checked={reg.selfDesigned.enabled}
            onChange={(v) => update((d) => void (d.regulation.selfDesigned.enabled = v))}
          />
        </div>
        {reg.selfDesigned.enabled && (
          <>
            <PlainNumber
              label={t("co2Price")}
              unit="$/t CO2"
              value={reg.selfDesigned.co2PriceUsdPerTonne}
              onChange={(v) =>
                update((d) => void (d.regulation.selfDesigned.co2PriceUsdPerTonne = v))
              }
            />
            <PlainNumber
              label={t("support")}
              unit="$/kg"
              step={0.05}
              value={reg.selfDesigned.supportUsdPerKg}
              onChange={(v) => update((d) => void (d.regulation.selfDesigned.supportUsdPerKg = v))}
            />
            <PlainNumber
              label={t("capexSupport")}
              unit="0–1"
              step={0.05}
              value={reg.selfDesigned.capexSupport}
              onChange={(v) => update((d) => void (d.regulation.selfDesigned.capexSupport = v))}
            />
            <PlainNumber
              label={t("opexSupport")}
              unit="0–1"
              step={0.05}
              value={reg.selfDesigned.opexSupport}
              onChange={(v) => update((d) => void (d.regulation.selfDesigned.opexSupport = v))}
            />
            <PlainNumber
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
