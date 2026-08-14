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
  type UsdPerTonne,
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
  FinancingParams,
  SideRegulations,
} from "./resolved";
import type { RefBundle, RefFuel, RefVesselType } from "./ref/bundle";
import { getCountry, getFuel, getVesselType } from "./ref/accessors";
import { deriveFuelFactors, type DerivedFuelFactors } from "./emissions";

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

/** Modes whose production capex/O&M are zeroed — the cost lives in the price. */
function pricedModes(sourcing: FuelSideInput["sourcing"]): boolean {
  return sourcing === "purchase";
}

/** Modes that build a plant: production CAPEX + OPEX, no merchant price. */
function plantModes(sourcing: FuelSideInput["sourcing"]): boolean {
  return sourcing === "build-plant" || sourcing === "build-here";
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
  /** v6 — refined factors, or null (legacy scalars / underivable fuel). */
  readonly derivedFactors: DerivedFuelFactors | null;
}

function resolveFuelSide(
  ctx: SideCtx,
  scenario: ScenarioInput,
  bundle: RefBundle,
): ResolvedFuelSide {
  const { input, vesselOverrides, fuel, vesselType, isFossil, derivedFactors: fe } = ctx;
  const o = input.overrides;

  // Sourcing semantics (spec §1; v4 folded named-plant into purchase):
  // - purchase: price × tonnage — benchmark, or typed as an override (a
  //   market assumption and a contracted delivered price are the same
  //   arithmetic).
  // - build-plant/build-here: NO merchant price — production cost is
  //   CAPEX + OPEX. Price row forced to derived(0)… UNLESS the scenario
  //   carries flags.legacyExcelConstruct (the migrated Excel double-count),
  //   in which case the old construct behaviour runs verbatim.
  const legacyConstruct =
    plantModes(input.sourcing) && scenario.flags?.legacyExcelConstruct === true;
  const price: Resolved<UsdPerTonne> =
    plantModes(input.sourcing) && !legacyConstruct
      ? derived(usdPerTonne(0))
      : resolve(o.priceUsdPerTonne, usdPerTonne, () =>
          benchmark(usdPerTonne(fuel.priceUsdPerTonne)),
        );
  // v6: refined factors take the derived slot — override still wins, and
  // an underivable fuel falls back to the bundle's legacy scalar (the
  // provenance note discloses which path ran).
  const combustionEf = resolve(o.combustionEfTco2PerTonne, tCo2PerTonne, () =>
    fe
      ? derived(tCo2PerTonne(fe.combustionEfTco2PerTonne))
      : benchmark(tCo2PerTonne(fuel.combustionEfTco2PerTonne)),
  );
  const lhv = resolve(o.lhvMjPerTonne, mjPerTonne, () =>
    fe
      ? derived(mjPerTonne(fe.lhvMjPerTonne))
      : benchmark(mjPerTonne(fuel.lhvMjPerTonne)),
  );
  const wtw = resolve(o.wtwGco2PerMj, gCo2ePerMj, () =>
    fe
      ? derived(gCo2ePerMj(fe.wtwGco2PerMj))
      : benchmark(gCo2ePerMj(fuel.wtwGco2PerMj)),
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

  // Priced modes zero production cost BEFORE the override check
  // (Fuel!E16/E17) — the cost lives inside the price. Plant modes charge
  // the production lines (typed for build-plant, map-derived for
  // build-here — one code path, different Resolved sources).
  const noProductionLines = pricedModes(input.sourcing);
  // build-here: the production lines are the SUM of the five evaluated
  // components, each override ?? derived (seed-not-lock). One code path
  // with build-plant — only the Resolved source differs.
  const bh = input.sourcing === "build-here" ? input.buildHere : null;
  if (input.sourcing === "build-here" && !bh) {
    throw new Error("build-here sourcing requires an evaluated buildHere site");
  }
  const comp = (c: { derivedUsdM: number; overrideUsdM: number | null }) =>
    c.overrideUsdM ?? c.derivedUsdM;
  const anyOverride = (...cs: { overrideUsdM: number | null }[]) =>
    cs.some((c) => c.overrideUsdM !== null);
  // Firm power (realism pass): when the evaluated site cannot meet the
  // carrier's duty, the chosen strategy's cost is part of producing the fuel
  // and rides the SAME production lines — a firming cost that sat outside
  // them would be a cost the corridor never sees.
  const firmCapexUsdM = bh?.firming ? bh.firming.capitalUsdM : 0;
  const firmOpexUsdM = bh?.firming ? bh.firming.operatingUsdMPerYear : 0;
  const prodCapex: Resolved<UsdM> = noProductionLines
    ? derived(usdM(0))
    : bh
      ? {
          value: usdM(
            comp(bh.components.h2Capital) +
              comp(bh.components.synthCapital) +
              firmCapexUsdM,
          ),
          source: anyOverride(bh.components.h2Capital, bh.components.synthCapital)
            ? "override"
            : "derived",
        }
      : resolve(o.prodCapexUsdM, usdM, () => benchmark(usdM(fuel.prodCapexUsdM)));
  const prodOpex: Resolved<UsdM> = noProductionLines
    ? derived(usdM(0))
    : bh
      ? {
          value: usdM(
            comp(bh.components.h2Operating) +
              comp(bh.components.synthOperating) +
              comp(bh.components.logisticsOperating) +
              firmOpexUsdM,
          ),
          source: anyOverride(
            bh.components.h2Operating,
            bh.components.synthOperating,
            bh.components.logisticsOperating,
          )
            ? "override"
            : "derived",
        }
      : resolve(o.prodOpexUsdMPerYear, usdM, () =>
        benchmark(usdM(fuel.prodOpexUsdMPerYear)),
      );

  // THE GUARD (spec §1): charging a fuel price AND production CAPEX/OPEX on
  // one side is the Excel double-count — allowed only under the migrated
  // legacy flag. A silent zero is what hid this; throw loudly.
  if (
    !legacyConstruct &&
    price.value > 0 &&
    (prodCapex.value > 0 || prodOpex.value > 0)
  ) {
    throw new Error(
      `${ctx.isFossil ? "fossil" : "green"} side charges a fuel price ` +
        `(${price.value} $/t) AND production CAPEX/OPEX — the Excel ` +
        "double-count. Load a legacy scenario (flags.legacyExcelConstruct) " +
        "or zero one of the two.",
    );
  }

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
    // Override precedence is absolute: an explicit wtw override governs
    // EVERY module, so the per-framework derived values attach only when
    // the wtw actually resolved to the derived path.
    ...(fe && wtw.source !== "override"
      ? {
          wtwByFramework: {
            ...(fe.wtwByFramework.fueleu !== undefined
              ? { fueleu: gCo2ePerMj(fe.wtwByFramework.fueleu) }
              : {}),
            ...(fe.wtwByFramework.imo !== undefined
              ? { imo: gCo2ePerMj(fe.wtwByFramework.imo) }
              : {}),
          },
          emissionsDerivation: fe.derivation,
        }
      : {}),
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
  // D3 — ETS gas coverage: shared GWPs/start year, per-side factors.
  const gasesFor = (side: "green" | "fossil") =>
    reg.ets.gasCoverage?.enabled
      ? {
          gases: {
            fromCalendarYear: calendarYear(reg.ets.gasCoverage.fromCalendarYear),
            ch4TPerTonne: reg.ets.gasCoverage[side].ch4TPerTonne,
            n2oTPerTonne: reg.ets.gasCoverage[side].n2oTPerTonne,
            gwpCh4: reg.ets.gasCoverage.gwpCh4,
            gwpN2o: reg.ets.gasCoverage.gwpN2o,
          },
        }
      : {};

  const etsFor = (side: "green" | "fossil") =>
    reg.ets.enabled
      ? {
          ets: {
            euaEurPerTonne: eurPerTonne(reg.ets.euaEurPerTonne),
            ...(reg.ets.euaEscalation !== undefined
              ? { euaEscalation: fraction(reg.ets.euaEscalation) }
              : {}),
            eurUsd: eurUsd(reg.eurUsd),
            scope: fraction(reg.ets.scope),
            phaseIn: toSchedule(bundle.schedules.etsPhaseIn),
            ...gasesFor(side),
          },
        }
      : {};

  const shared = {
    ...(reg.fuelEu.enabled
      ? {
          fuelEu: {
            penaltyEurPerTonne: eurPerTonne(reg.fuelEu.penaltyEurPerTonne),
            eurUsd: eurUsd(reg.eurUsd),
            scope: fraction(reg.fuelEu.scope),
            baselineGco2PerMj: gCo2ePerMj(reg.fuelEu.baselineGco2PerMj),
            vlsfoMjPerTonne: mjPerTonne(reg.fuelEu.vlsfoMjPerTonne),
            targets: toSchedule(bundle.schedules.fuelEuTargets),
            // D2 — over-compliance credit (Excel floors at 0 when absent).
            ...(reg.fuelEu.credit?.enabled
              ? {
                  credit: {
                    surplusValueEurPerTonne: eurPerTonne(
                      reg.fuelEu.credit.surplusValueEurPerTonneVlsfoEq,
                    ),
                    multiplier: reg.fuelEu.credit.rfnbo
                      ? reg.fuelEu.credit.rfnboMultiplier
                      : 1,
                    multiplierUntil: calendarYear(reg.fuelEu.credit.rfnboUntil),
                  },
                }
              : {}),
          },
        }
      : {}),
  };

  // Fix #6 — IMO Net-Zero: identical params both sides (the attained GFI
  // differs via each side's fuel). Only shaped when the bundle carries the
  // reference rows; the caller surfaces "not parameterised" otherwise.
  const imo = reg.imoNetZero;
  const imoRows = bundle.schedules.imoBaseTargets &&
    bundle.schedules.imoDirectTargets &&
    bundle.regulationDefaults.imoNetZero
    ? {
        base: bundle.schedules.imoBaseTargets,
        direct: bundle.schedules.imoDirectTargets,
        defaults: bundle.regulationDefaults.imoNetZero,
      }
    : null;
  const imoFor = () =>
    imo?.enabled && imoRows
      ? {
          imoNetZero: {
            effectiveFromCalendarYear: calendarYear(
              imoRows.defaults.effectiveFromCalendarYear,
            ),
            referenceIntensityGco2PerMj: gCo2ePerMj(
              imoRows.defaults.referenceIntensityGco2PerMj,
            ),
            baseTargets: toSchedule(imoRows.base),
            directTargets: toSchedule(imoRows.direct),
            tier1UsdPerTonneCo2e: usdPerTonne(imoRows.defaults.tier1UsdPerTonneCo2e),
            tier2UsdPerTonneCo2e: usdPerTonne(imoRows.defaults.tier2UsdPerTonneCo2e),
            scope: fraction(imo.scope),
            rewardUsdPerTonneCo2e: usdPerTonne(imo.rewardUsdPerTonneCo2e ?? 0),
            ...(imo.priceEscalation !== undefined
              ? { priceEscalation: fraction(imo.priceEscalation) }
              : {}),
          },
        }
      : {};

  const green: SideRegulations = {
    ...etsFor("green"),
    ...imoFor(),
    ...shared,
    // 45Z: green only, iff enabled AND US-produced (Regulation!D24 ∧ D25).
    // D5 — optional sunset (the workbook has none).
    ...(reg.ira45z.enabled && reg.ira45z.usProduced
      ? {
          ira45z: {
            rateUsdPerGallon: usdPerGallon(reg.ira45z.creditUsdPerGallon),
            mjPerGallon: bundle.constants.ira45zMjPerGallon,
            ...(reg.ira45z.effectiveUntil != null
              ? { effectiveUntil: calendarYear(reg.ira45z.effectiveUntil) }
              : {}),
          },
        }
      : {}),
    // Self-designed green: all five terms (Calculation r31).
    ...(reg.selfDesigned.enabled
      ? {
          selfDesigned: {
            co2PriceUsdPerTonne: usdPerTonne(reg.selfDesigned.co2PriceUsdPerTonne),
            ...(reg.selfDesigned.co2PriceEscalation !== undefined
              ? { co2PriceEscalation: fraction(reg.selfDesigned.co2PriceEscalation) }
              : {}),
            supportUsdPerKg: usdPerKg(reg.selfDesigned.supportUsdPerKg),
            capexSupport: fraction(reg.selfDesigned.capexSupport),
            opexSupport: fraction(reg.selfDesigned.opexSupport),
            otherUsdM: usdM(reg.selfDesigned.otherUsdM),
          },
        }
      : {}),
  };

  const fossil: SideRegulations = {
    ...etsFor("fossil"),
    ...imoFor(),
    ...shared,
    // Self-designed fossil: the CO2-price term ONLY (Calculation r56).
    ...(reg.selfDesigned.enabled
      ? {
          selfDesigned: {
            co2PriceUsdPerTonne: usdPerTonne(reg.selfDesigned.co2PriceUsdPerTonne),
            ...(reg.selfDesigned.co2PriceEscalation !== undefined
              ? { co2PriceEscalation: fraction(reg.selfDesigned.co2PriceEscalation) }
              : {}),
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

  // Family guard: a "fossil" corridor burning a green fuel (or vice versa)
  // computes happily while silently collapsing the comparison the model
  // exists to make. Reject loudly, naming the field — never silently
  // correct, which would change a stored result.
  for (const side of ["green", "fossil"] as const) {
    const fuel = getFuel(bundle, input[side].fuelId);
    if (fuel.family !== side) {
      throw new Error(
        `${side}.fuelId "${fuel.id}" is a ${fuel.family} fuel — the ` +
          `${side} side accepts only family: "${side}". Pick a ${side} ` +
          "fuel or move this selection to the other side.",
      );
    }
  }

  const wacc: Resolved<Fraction> = resolve(input.cargo.waccOverride, fraction, () =>
    benchmark(fraction(country.wacc)),
  );

  // v6: derive refined factors per side when the scenario carries the
  // emissions-accounting block (injected by migration; default FuelEU).
  const emissionsFramework = input.regulation.emissions?.framework;
  const factorsFor = (side: "green" | "fossil"): DerivedFuelFactors | null =>
    emissionsFramework
      ? deriveFuelFactors({
          bundle,
          corridorFuelId: input[side].fuelId,
          side,
          framework: emissionsFramework,
          em: input[side].emissions ?? null,
        })
      : null;

  const green = resolveFuelSide(
    {
      input: input.green,
      vesselOverrides: input.vessel.green,
      fuel: getFuel(bundle, input.green.fuelId),
      vesselType,
      isFossil: false,
      derivedFactors: factorsFor("green"),
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
      derivedFactors: factorsFor("fossil"),
    },
    input,
    bundle,
  );

  // Sprint 4 — green financing: shaped only when enabled; concrete values
  // are stored by the UI, so resolution is a pass-through with branding.
  const financing: FinancingParams | undefined =
    input.financing?.enabled === true
      ? {
          greenRate: fraction(input.financing.greenRate),
          baseRate: fraction(input.financing.baseRate),
          debtShare: fraction(input.financing.debtShare),
          tenorYears: input.financing.tenorYears,
          structure: input.financing.structure,
        }
      : undefined;

  // Sprint 4 — capital phasing: the sum-to-1 rule is re-checked here so a
  // scenario that bypassed zod still fails loudly, by field name.
  const capitalPhasing =
    input.capitalPhasing?.enabled === true
      ? (() => {
          for (const sideLabel of ["green", "fossil"] as const) {
            const w = input.capitalPhasing![sideLabel].weights;
            const sum = w.reduce((a, b) => a + b, 0);
            if (Math.abs(sum - 1) > 1e-6) {
              throw new Error(
                `capitalPhasing.${sideLabel}.weights must sum to 1 (got ${sum})`,
              );
            }
          }
          return {
            green: [...input.capitalPhasing!.green.weights],
            fossil: [...input.capitalPhasing!.fossil.weights],
          };
        })()
      : undefined;

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
    ...(financing ? { financing } : {}),
    ...(capitalPhasing ? { capitalPhasing } : {}),
    ...(input.regulation.imoNetZero?.enabled &&
    !(
      bundle.schedules.imoBaseTargets &&
      bundle.schedules.imoDirectTargets &&
      bundle.regulationDefaults.imoNetZero
    )
      ? { imoNotParameterised: true as const }
      : {}),
    flags: {
      ...(emissionsFramework ? { emissionsFramework } : {}),
      emissionsBasis: input.flags?.emissionsBasis ?? "combustion",
      rateBasis: input.flags?.rateBasis ?? "nominal",
    },
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
      ...(side.wtwByFramework ? { wtwByFramework: side.wtwByFramework } : {}),
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
    // Financing attaches to the green side's inputs — as data, exactly like
    // the green-only 45Z params; the evaluator stays label-blind.
    ...(label === "green" && resolved.financing
      ? { financing: resolved.financing }
      : {}),
    // Phasing weights attach to BOTH sides as data; the default (all
    // capital in year 1) stays encoded as absence.
    ...(resolved.capitalPhasing
      ? { capexWeights: resolved.capitalPhasing[label] }
      : {}),
  };
}
