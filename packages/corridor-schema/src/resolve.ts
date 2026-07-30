/**
 * The resolution layer — the workbook's `E = IF(D="", F, D)` made explicit.
 *
 * Precedence: override > (derived | benchmark). "Derived" marks computed
 * benchmarks (distance-mode consumption, vessel premium, the fossil ×0.3 / =0
 * rules, Purchase-zeroing); in Excel those computations ARE the F benchmark
 * cells, so the precedence is identical — the tag only records HOW the
 * benchmark was produced, for provenance display.
 *
 * Two deliberate subtleties, both verbatim from the workbook:
 * - Purchase sourcing zeroes production capex/O&M BEFORE the override check
 *   (`E16 = IF(D9="Purchase", 0, IF(D16="", F16, D16))`) — an override cannot
 *   resurrect production cost on a purchased fuel.
 * - Distance-mode consumption divides by the side's RESOLVED LHV (`Fuel!E13`,
 *   which is itself overridable), not the table LHV.
 *
 * The engine never sees this module's `Resolved<>` wrappers — `toSideInputs`
 * strips to bare branded scalars.
 */

import {
  count,
  eurPerTonne,
  eurUsd,
  fraction,
  gCo2ePerMj,
  mjPerTonne,
  tCo2PerTonne,
  tonnesPerVesselYear,
  unitsPerYear,
  usdM,
  usdPerGallon,
  usdPerKg,
  usdPerTonne,
  calendarYear,
  type Fraction,
  type MjPerTonne,
  type UsdM,
} from "@h2map/units";
import type {
  FuelSideInput,
  RegulationInput,
  ScenarioInput,
  VesselSideInput,
} from "./scenario";
import type {
  Resolved,
  ResolvedFuelSide,
  ResolvedScenario,
  ScheduleStep,
  SideInputs,
  SideRegulations,
} from "./resolved";
import type { RefBundle, RefFuel, RefVesselType } from "./ref/bundle";
import { getCountry, getFuel, getVesselType } from "./ref/accessors";

// ---------------------------------------------------------------------------
// Primitive
// ---------------------------------------------------------------------------

function resolve<T>(
  override: number | null,
  brand: (n: number) => T,
  benchmark: () => Resolved<T>,
): Resolved<T> {
  return override !== null
    ? { value: brand(override), source: "override" }
    : benchmark();
}

function benchmark<T>(value: T): Resolved<T> {
  return { value, source: "benchmark" };
}

function derived<T>(value: T): Resolved<T> {
  return { value, source: "derived" };
}

// ---------------------------------------------------------------------------
// Per-side resolution
// ---------------------------------------------------------------------------

interface SideCtx {
  readonly input: FuelSideInput;
  readonly vesselOverrides: VesselSideInput;
  readonly fuel: RefFuel;
  readonly vesselType: RefVesselType;
  readonly isFossil: boolean;
}

function resolveFuelSide(
  ctx: SideCtx,
  scenario: ScenarioInput,
  bundle: RefBundle,
): ResolvedFuelSide {
  const { input, vesselOverrides, fuel, vesselType, isFossil } = ctx;
  const o = input.overrides;

  const price = resolve(o.priceUsdPerTonne, usdPerTonne, () =>
    benchmark(usdPerTonne(fuel.priceUsdPerTonne)),
  );
  const combustionEf = resolve(o.combustionEfTco2PerTonne, tCo2PerTonne, () =>
    benchmark(tCo2PerTonne(fuel.combustionEfTco2PerTonne)),
  );
  const lhv = resolve(o.lhvMjPerTonne, mjPerTonne, () =>
    benchmark(mjPerTonne(fuel.lhvMjPerTonne)),
  );
  const wtw = resolve(o.wtwGco2PerMj, gCo2ePerMj, () =>
    benchmark(gCo2ePerMj(fuel.wtwGco2PerMj)),
  );

  // Fuel!F15/F28: distance mode derives from the RESOLVED LHV (E13/E26).
  const tonnes = resolve(o.fuelTonnesPerVesselYear, tonnesPerVesselYear, () =>
    scenario.vessel.consumptionMode === "distance"
      ? derived(
          tonnesPerVesselYear(
            ((scenario.cargo.oneWayDistanceNm * 2) *
              scenario.cargo.roundtripsPerYear *
              vesselType.gjPerNm *
              1000) /
              (lhv.value as MjPerTonne),
          ),
        )
      : benchmark(tonnesPerVesselYear(vesselType.fuelTonnesPerYear)),
  );

  // Purchase zeroes production cost BEFORE the override check (Fuel!E16/E17).
  const purchase = input.sourcing === "purchase";
  const prodCapex: Resolved<UsdM> = purchase
    ? derived(usdM(0))
    : resolve(o.prodCapexUsdM, usdM, () => benchmark(usdM(fuel.prodCapexUsdM)));
  const prodOpex: Resolved<UsdM> = purchase
    ? derived(usdM(0))
    : resolve(o.prodOpexUsdMPerYear, usdM, () =>
        benchmark(usdM(fuel.prodOpexUsdMPerYear)),
      );

  // Port storage & barge. Fossil benchmarks: capex = 0 ("existing
  // infrastructure assumed"), opex = fossil fuel-table opex × 0.3.
  const rules = bundle.benchmarkRules;
  const portStorageCapex = resolve(o.portStorageCapexUsdM, usdM, () =>
    isFossil
      ? derived(usdM(rules.fossilPortCapexUsdM))
      : benchmark(usdM(fuel.portStorageCapexUsdM)),
  );
  const portStorageOpex = resolve(o.portStorageOpexUsdMPerYear, usdM, () =>
    isFossil
      ? derived(usdM(fuel.portStorageOpexUsdMPerYear * rules.fossilPortLogisticsOpexFactor))
      : benchmark(usdM(fuel.portStorageOpexUsdMPerYear)),
  );
  const bargeCapex = resolve(o.bargeCapexUsdM, usdM, () =>
    isFossil
      ? derived(usdM(rules.fossilPortCapexUsdM))
      : benchmark(usdM(fuel.bargeCapexUsdM)),
  );
  const bargeOpex = resolve(o.bargeOpexUsdMPerYear, usdM, () =>
    isFossil
      ? derived(usdM(fuel.bargeOpexUsdMPerYear * rules.fossilPortLogisticsOpexFactor))
      : benchmark(usdM(fuel.bargeOpexUsdMPerYear)),
  );

  // Vessel: green benchmark = type capex × (1 + fuel premium) (Vessel!F12);
  // fossil benchmark = 0, the "existing baseline vessel" rule (Vessel!F18).
  const vesselCapex = resolve(vesselOverrides.capexUsdM, usdM, () =>
    isFossil
      ? derived(usdM(rules.fossilVesselCapexUsdM))
      : derived(usdM(vesselType.capexUsdM * (1 + fuel.vesselCapexPremium))),
  );
  const vesselOpex = resolve(vesselOverrides.opexUsdMPerYear, usdM, () =>
    benchmark(usdM(vesselType.opexUsdMPerYear)),
  );

  return {
    priceUsdPerTonne: price,
    combustionEf,
    lhv,
    wtw,
    tonnesPerVesselYear: tonnes,
    prodCapexUsdM: prodCapex,
    prodOpexUsdMPerYear: prodOpex,
    portStorageCapexUsdM: portStorageCapex,
    portStorageOpexUsdMPerYear: portStorageOpex,
    bargeCapexUsdM: bargeCapex,
    bargeOpexUsdMPerYear: bargeOpex,
    vesselCapexUsdM: vesselCapex,
    vesselOpexUsdMPerYear: vesselOpex,
  };
}

// ---------------------------------------------------------------------------
// Regulation shaping (side asymmetries as data)
// ---------------------------------------------------------------------------

function toSchedule(steps: readonly { fromCalendarYear: number; value: number }[]): ScheduleStep[] {
  return steps.map((s) => ({
    fromCalendarYear: calendarYear(s.fromCalendarYear),
    value: fraction(s.value),
  }));
}

function resolveRegulations(
  reg: RegulationInput,
  bundle: RefBundle,
): { green: SideRegulations; fossil: SideRegulations } {
  const shared = {
    ...(reg.ets.enabled
      ? {
          ets: {
            euaEurPerTonne: eurPerTonne(reg.ets.euaEurPerTonne),
            eurUsd: eurUsd(reg.eurUsd),
            scope: fraction(reg.ets.scope),
            phaseIn: toSchedule(bundle.schedules.etsPhaseIn),
          },
        }
      : {}),
    ...(reg.fuelEu.enabled
      ? {
          fuelEu: {
            penaltyEurPerTonne: eurPerTonne(reg.fuelEu.penaltyEurPerTonne),
            eurUsd: eurUsd(reg.eurUsd),
            scope: fraction(reg.fuelEu.scope),
            baselineGco2PerMj: gCo2ePerMj(reg.fuelEu.baselineGco2PerMj),
            vlsfoMjPerTonne: mjPerTonne(reg.fuelEu.vlsfoMjPerTonne),
            targets: toSchedule(bundle.schedules.fuelEuTargets),
          },
        }
      : {}),
  };

  const green: SideRegulations = {
    ...shared,
    // 45Z: green only, iff enabled AND US-produced (Regulation!D24 ∧ D25).
    ...(reg.ira45z.enabled && reg.ira45z.usProduced
      ? {
          ira45z: {
            rateUsdPerGallon: usdPerGallon(reg.ira45z.rateUsdPerGallon),
            mjPerGallon: bundle.constants.ira45zMjPerGallon,
          },
        }
      : {}),
    // Self-designed green: all five terms (Calculation r31).
    ...(reg.selfDesigned.enabled
      ? {
          selfDesigned: {
            co2PriceUsdPerTonne: usdPerTonne(reg.selfDesigned.co2PriceUsdPerTonne),
            supportUsdPerKg: usdPerKg(reg.selfDesigned.supportUsdPerKg),
            capexSupport: fraction(reg.selfDesigned.capexSupport),
            opexSupport: fraction(reg.selfDesigned.opexSupport),
            otherUsdM: usdM(reg.selfDesigned.otherUsdM),
          },
        }
      : {}),
  };

  const fossil: SideRegulations = {
    ...shared,
    // Self-designed fossil: the CO2-price term ONLY (Calculation r56).
    ...(reg.selfDesigned.enabled
      ? {
          selfDesigned: {
            co2PriceUsdPerTonne: usdPerTonne(reg.selfDesigned.co2PriceUsdPerTonne),
          },
        }
      : {}),
  };

  return { green, fossil };
}

// ---------------------------------------------------------------------------
// Scenario resolution + engine-input assembly
// ---------------------------------------------------------------------------

export function resolveScenario(
  input: ScenarioInput,
  bundle: RefBundle,
): ResolvedScenario {
  if (input.refBundleId !== bundle.bundleId) {
    throw new Error(
      `scenario pins bundle "${input.refBundleId}" but got "${bundle.bundleId}"`,
    );
  }
  const vesselType = getVesselType(bundle, input.vessel.typeId);
  const country = getCountry(bundle, input.cargo.countryId);

  const wacc: Resolved<Fraction> = resolve(input.cargo.waccOverride, fraction, () =>
    benchmark(fraction(country.wacc)),
  );

  const green = resolveFuelSide(
    {
      input: input.green,
      vesselOverrides: input.vessel.green,
      fuel: getFuel(bundle, input.green.fuelId),
      vesselType,
      isFossil: false,
    },
    input,
    bundle,
  );
  const fossil = resolveFuelSide(
    {
      input: input.fossil,
      vesselOverrides: input.vessel.fossil,
      fuel: getFuel(bundle, input.fossil.fuelId),
      vesselType,
      isFossil: true,
    },
    input,
    bundle,
  );

  return {
    refBundleId: input.refBundleId,
    startYear: calendarYear(input.cargo.startYear),
    horizonYears: input.cargo.horizonYears,
    unitsPerYear: unitsPerYear(input.cargo.unitsPerYear),
    inflation: fraction(input.cargo.inflation),
    wacc,
    vessels: count(input.cargo.vessels),
    green,
    fossil,
    regulations: resolveRegulations(input.regulation, bundle),
  };
}

/** Strip a resolved side to the bare branded inputs the engine consumes. */
export function toSideInputs(
  resolved: ResolvedScenario,
  label: "green" | "fossil",
): SideInputs {
  const side = resolved[label];
  return {
    label,
    vessels: resolved.vessels,
    fuel: {
      priceUsdPerTonne: side.priceUsdPerTonne.value,
      combustionEf: side.combustionEf.value,
      lhv: side.lhv.value,
      wtw: side.wtw.value,
      tonnesPerVesselYear: side.tonnesPerVesselYear.value,
    },
    components: [
      {
        id: "fuelProduction",
        capexUsdM: side.prodCapexUsdM.value,
        opexUsdMPerYear: side.prodOpexUsdMPerYear.value,
      },
      {
        id: "portStorage",
        capexUsdM: side.portStorageCapexUsdM.value,
        opexUsdMPerYear: side.portStorageOpexUsdMPerYear.value,
      },
      {
        id: "barge",
        capexUsdM: side.bargeCapexUsdM.value,
        opexUsdMPerYear: side.bargeOpexUsdMPerYear.value,
      },
      {
        id: "vessel",
        capexUsdM: side.vesselCapexUsdM.value,
        opexUsdMPerYear: side.vesselOpexUsdMPerYear.value,
      },
    ],
    regulations: resolved.regulations[label],
  };
}
