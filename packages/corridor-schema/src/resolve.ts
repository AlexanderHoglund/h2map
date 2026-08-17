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
import { scaledCapitalUsd } from "./ref/scale";
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
  // What the EU ETS may charge for, which is NOT the stack factor above for
  // a certified biogenic or RFNBO fuel. Follows the SAME override slot as
  // the combustion factor: someone overriding the stack CO2 by hand is
  // stating what the fuel emits, and the ETS charge has to follow it, or a
  // typed correction would silently apply to abatement but not to ETS.
  // Without the v6 path there is no carbon-origin data at all, so the legacy
  // scalar is charged in full — the pre-v6 behaviour, unchanged.
  const etsChargeableEf = resolve(o.combustionEfTco2PerTonne, tCo2PerTonne, () =>
    fe
      ? derived(tCo2PerTonne(fe.etsChargeableEfTco2PerTonne))
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

  // Fuel!F15/F28: consumption is ALWAYS derived from corridor geometry,
  // against the RESOLVED LHV (E13/E26).
  //
  // v7 removed `consumptionMode`. It offered the vessel table's flat annual
  // tonnage as an alternative "source" for the same quantity, but the two
  // are incompatible physical claims, not two readings of one: the flat
  // figure is a fleet average over an unstated trade pattern, while the
  // GJ/nm rate is a property of the hull. For the Handymax they agree only
  // at ~33,140 nm/yr, and the Chilean corridor steams 57,000 — a factor of
  // 1.72. The geometry side is corroborated by the cargo program (vessels x
  // roundtrips x dwt tracks annual throughput); the flat figure reconciles
  // with nothing else in the model. Switching modes moved the numbers with
  // no OVERRIDE badge, no benchmark underneath and no restore.
  //
  // A directly-stated burn is still expressible — as an OVERRIDE, which
  // shows the badge and keeps the derived value visible beneath it.
  // v3 catalogue: two OPTIONAL corrections, each a no-op when its scenario
  // input is absent, so a scenario written before them computes exactly what
  // it always did.
  //
  //   perRoundTrip = 2 x nm x gjPerNm x (vService / vDesign)^n
  //                + portDays x (portGjPerDay + cargoSystemGjPerDay)
  //
  // SPEED, exponent 2.0 — not 3.0. Power scales with v^3, so GJ per DAY
  // does; but nm/day scales with v, so GJ per NM scales with v^2. Applying
  // the cube law to a per-nm quantity understates by 12% at 11.5 against 13
  // kn. The bundle carries both exponents precisely so a consumer picks the
  // one matching the quantity it holds.
  //
  // PORT DAYS burn fuel at zero miles, which a distance-only formula cannot
  // express at all: GMF's cycle is 24 laden + 7 port + 22 ballast days, so
  // 13% of it is stationary. Note these day rates are all tier C — the
  // least-evidenced numbers in the catalogue — which is why the port term
  // is opt-in rather than assumed, and why `portEnergy.share` reports how
  // much a scenario leans on them.
  const speedFactor = (() => {
    const vService = scenario.cargo.serviceSpeedKn;
    const vDesign = vesselType.serviceSpeedKn;
    if (vService === undefined || vDesign === undefined || vDesign <= 0) return 1;
    const n = bundle.vesselDerivation?.speedLaw.perNmExponent ?? 2;
    return (vService / vDesign) ** n;
  })();
  const portGjPerRoundTrip = (() => {
    const days = scenario.cargo.portDaysPerRoundTrip;
    if (days === undefined || days <= 0) return 0;
    return (
      days *
      ((vesselType.portGjPerDay ?? 0) + (vesselType.cargoSystemGjPerDay ?? 0))
    );
  })();

  const tonnes = resolve(o.fuelTonnesPerVesselYear, tonnesPerVesselYear, () =>
    derived(
      tonnesPerVesselYear(
        ((scenario.cargo.oneWayDistanceNm *
          2 *
          vesselType.gjPerNm *
          speedFactor +
          portGjPerRoundTrip) *
          scenario.cargo.roundtripsPerYear *
          1000) /
          (lhv.value as MjPerTonne),
      ),
    ),
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
  // THE CORRIDOR'S OWN ANNUAL DEMAND — what a dedicated plant must be built
  // to supply. This is the quantity the researched $/tpa figures scale
  // against, and the reason `prodNameplateTonnesPerYear` existed in the data
  // for two weeks without a single reader: production cost resolved as a flat
  // scalar, so a 15 kt/yr corridor and a 600 kt/yr one were charged the same.
  const corridorDemandTonnesPerYear =
    (tonnes.value as number) * scenario.cargo.vessels;

  /**
   * Production capital from the researched $/tpa benchmark, scale-corrected.
   *
   * Returns null when the bundle carries no research block, so an older
   * bundle keeps resolving through the flat scalar below and its numbers do
   * not move.
   *
   * NOTE THE MISSING foakMultiplier, which is deliberate. The researched
   * central is ALREADY first-of-a-kind — it is anchored on NEOM at financial
   * close and AM Green at FID, both carrying FOAK contingency inside their
   * published figures. The band is there for a NOAK or study-derived
   * baseline; applying it here would charge FOAK twice.
   */
  const researchedProdCapexUsdM = (): number | null => {
    const r = fuel.research?.production;
    if (!r || r.referenceNameplateTonnesPerYear <= 0) return null;
    if (corridorDemandTonnesPerYear <= 0) return null;
    return (
      scaledCapitalUsd(
        r.capexUsdPerTpa.central,
        r.referenceNameplateTonnesPerYear,
        r.scaleExponent.central,
        corridorDemandTonnesPerYear,
      ) / 1e6
    );
  };

  /**
   * Production O&M, likewise per tpa and likewise scaled with demand.
   *
   * The research note flags that `opex = pct x capex` is wrong-signed under
   * scale — a small plant carries a higher capex/tpa AND a higher true
   * O&M/tpa, so a fixed percentage of an already-inflated capex counts the
   * penalty twice. The researched data gives an ABSOLUTE $/tpa/yr, so this
   * takes it directly and avoids the compounding.
   */
  const researchedProdOpexUsdM = (): number | null => {
    const r = fuel.research?.production;
    if (!r || corridorDemandTonnesPerYear <= 0) return null;
    return (r.opexUsdPerTpaPerYear.central * corridorDemandTonnesPerYear) / 1e6;
  };

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
      : resolve(o.prodCapexUsdM, usdM, () => {
          const scaled = researchedProdCapexUsdM();
          return benchmark(usdM(scaled ?? fuel.prodCapexUsdM));
        });
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
      : resolve(o.prodOpexUsdMPerYear, usdM, () => {
          const scaled = researchedProdOpexUsdM();
          return benchmark(usdM(scaled ?? fuel.prodOpexUsdMPerYear));
        });

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

  /**
   * Port storage & barge.
   *
   * THE AXIS CHANGED. This used to branch on `isFossil` — which is not the
   * fuel's family but WHICH SIDE OF THE COMPARISON it sits on — and it
   * discarded the row's own capex entirely, substituting
   * `benchmarkRules.fossilPortCapexUsdM` (zero). Two things wrong with that:
   *
   *  - LNG is fossil and needs a full cryogenic terminal plus a $55-90m
   *    bunker vessel. It already carries $8m port and $3m barge in the
   *    bundle, and the fossil side zeroed both, so the data was dead.
   *  - The same fuel on the green side got its real costs. A property of the
   *    comparison was deciding a property of the infrastructure.
   *
   * The real split is whether the fuel rides infrastructure that ALREADY
   * EXISTS at a commercial bunker port. LSFO does; so does a biodiesel blend
   * going into existing product tankage through the incumbent barge fleet.
   * Ammonia, methanol, LH2 and LNG do not.
   *
   * `incumbentInfrastructure` is optional, so a bundle published before this
   * change keeps the old side-based behaviour EXACTLY — that is what lets a
   * saved scenario pinning an older bundle reproduce its original numbers.
   */
  const rules = bundle.benchmarkRules;
  const incumbent = fuel.incumbentInfrastructure;
  /** Pre-flag bundles fall back to the side branch, unchanged. */
  const legacyPortAxis = incumbent === undefined;
  const noPortCapital = legacyPortAxis ? isFossil : incumbent;
  /**
   * The 0.3 factor was "existing infrastructure, so only a share of the
   * logistics O&M". That reasoning belongs to the incumbent case, not to the
   * fossil side, so it moves with it.
   */
  const portOpexFactor = noPortCapital ? rules.fossilPortLogisticsOpexFactor : 1;

  const portStorageCapex = resolve(o.portStorageCapexUsdM, usdM, () =>
    noPortCapital
      ? derived(usdM(rules.fossilPortCapexUsdM))
      : benchmark(usdM(fuel.portStorageCapexUsdM)),
  );
  const portStorageOpex = resolve(o.portStorageOpexUsdMPerYear, usdM, () =>
    noPortCapital
      ? derived(usdM(fuel.portStorageOpexUsdMPerYear * portOpexFactor))
      : benchmark(usdM(fuel.portStorageOpexUsdMPerYear)),
  );
  const bargeCapex = resolve(o.bargeCapexUsdM, usdM, () =>
    noPortCapital
      ? derived(usdM(rules.fossilPortCapexUsdM))
      : benchmark(usdM(fuel.bargeCapexUsdM)),
  );
  const bargeOpex = resolve(o.bargeOpexUsdMPerYear, usdM, () =>
    noPortCapital
      ? derived(usdM(fuel.bargeOpexUsdMPerYear * portOpexFactor))
      : benchmark(usdM(fuel.bargeOpexUsdMPerYear)),
  );

  // Vessel, PER SHIP (v7): green benchmark = type capex × (1 + fuel premium)
  // (Vessel!F12); fossil benchmark = 0, the "existing baseline vessel" rule
  // (Vessel!F18). Both benchmarks were always per-ship — it was the FIELD
  // that held a fleet total, so restoring a ten-ship fleet's green CAPEX to
  // its benchmark cut it tenfold in silence. The fleet total is now formed
  // in the engine by multiplying these by `cargo.vessels`.
  //
  // The fossil zero encodes "the ships are already afloat". That is right
  // for a retrofit question and wrong for a greenfield one, where the
  // counterfactual is newbuild conventional tonnage — which is what both
  // reconstructed studies actually cost. `flags.fossilFleetBasis:
  // "newbuild"` derives it from the vessel type instead, with NO green-fuel
  // readiness premium, because a conventional ship does not pay one.
  const fossilNewbuildFleet =
    scenario.flags?.fossilFleetBasis === "newbuild";
  const vesselCapexPerShip = resolve(vesselOverrides.capexUsdMPerShip, usdM, () =>
    isFossil
      ? derived(
          usdM(
            fossilNewbuildFleet
              ? vesselType.capexUsdM
              : rules.fossilVesselCapexUsdM,
          ),
        )
      : derived(usdM(vesselType.capexUsdM * (1 + fuel.vesselCapexPremium))),
  );
  const vesselOpexPerShip = resolve(
    vesselOverrides.opexUsdMPerShipPerYear,
    usdM,
    () => benchmark(usdM(vesselType.opexUsdMPerYear)),
  );
  // The fleet figures the cost lines consume. Multiplying HERE rather than
  // in the engine keeps every downstream consumer (engine, exports, the
  // resolved view) seeing one consistent quantity, and leaves the per-ship
  // value visible in `perShip` for the UI's benchmark comparison.
  const vessels = scenario.cargo.vessels;
  const vesselCapex: Resolved<UsdM> = {
    ...vesselCapexPerShip,
    value: usdM((vesselCapexPerShip.value as number) * vessels),
  };
  const vesselOpex: Resolved<UsdM> = {
    ...vesselOpexPerShip,
    value: usdM((vesselOpexPerShip.value as number) * vessels),
  };

  return {
    priceUsdPerTonne: price,
    combustionEf,
    etsChargeableEf,
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
    // Per-ship, before the fleet multiply — this is the dimension the UI
    // field and its benchmark both live in, so the override badge and the
    // "restore" value are comparing like with like.
    vesselCapexUsdMPerShip: vesselCapexPerShip,
    vesselOpexUsdMPerShipPerYear: vesselOpexPerShip,
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
  /** v6 derived factors per side — the source of the gas-coverage defaults. */
  derivedBySide: {
    green: DerivedFuelFactors | null;
    fossil: DerivedFuelFactors | null;
  },
): { green: SideRegulations; fossil: SideRegulations } {
  /**
   * ETS gas coverage — CH4 and N2O as well as CO2.
   *
   * DEFAULTS ON, from the bundle's year. This is not a preference: maritime
   * ETS accounts for CO2 only in 2024-25, with CH4 and N2O under scope from
   * 2026, and that is already in force. A corridor starting 2026 or later
   * that leaves it off understates the fossil side — decisively so for LNG,
   * where methane slip dominates.
   *
   * Three ways it resolves, in precedence order:
   *   1. an explicit scenario block wins outright, including `enabled: false`
   *      (a pre-2026 case must stay reproducible);
   *   2. otherwise the bundle's year plus DERIVED per-side factors;
   *   3. and absent both — an older bundle carrying no year — nothing, which
   *      is the CO2-only behaviour those scenarios were computed with.
   *
   * The factors are derived, never typed: methane slip is 3.1% under FuelEU
   * and 3.5% under IMO for the same engine, so a typed value silently
   * contradicts the framework selector. Same for the GWPs (AR4 25/298 vs AR5
   * 28/265).
   */
  const bundleGasYear = bundle.regulationDefaults.ets.gasCoverageFromCalendarYear;
  const gasesFor = (side: "green" | "fossil") => {
    const explicit = reg.ets.gasCoverage;
    if (explicit) {
      return explicit.enabled
        ? {
            gases: {
              fromCalendarYear: calendarYear(explicit.fromCalendarYear),
              ch4TPerTonne: explicit[side].ch4TPerTonne,
              n2oTPerTonne: explicit[side].n2oTPerTonne,
              gwpCh4: explicit.gwpCh4,
              gwpN2o: explicit.gwpN2o,
            },
          }
        : {};
    }
    const d = derivedBySide[side];
    if (bundleGasYear === undefined || !d) return {};
    return {
      gases: {
        fromCalendarYear: calendarYear(bundleGasYear),
        ch4TPerTonne: d.ch4TPerTonne,
        n2oTPerTonne: d.n2oTPerTonne,
        gwpCh4: d.gwpCh4,
        gwpN2o: d.gwpN2o,
      },
    };
  };

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
    // Geometry + the vessel's non-steaming day rates, so the engine can
    // report the port ENERGY SHARE rather than a raw GJ/day the user cannot
    // interpret. The day rates are optional catalogue additions; without
    // them no share is reported (rather than a share computed from zero,
    // which would read as "port load is negligible" when it is unknown).
    voyage: {
      oneWayDistanceNm: input.cargo.oneWayDistanceNm,
      roundtripsPerYear: input.cargo.roundtripsPerYear,
      wholeVoyageGjPerNm: vesselType.gjPerNm,
      // The user's choices, so the engine's port-share reports what the
      // burn actually used rather than a default it did not.
      ...(input.cargo.serviceSpeedKn !== undefined
        ? { scenarioSpeedKn: input.cargo.serviceSpeedKn }
        : {}),
      ...(input.cargo.portDaysPerRoundTrip !== undefined
        ? { scenarioPortDaysPerRoundTrip: input.cargo.portDaysPerRoundTrip }
        : {}),
      ...(vesselType.portGjPerDay !== undefined
        ? { portGjPerDay: vesselType.portGjPerDay }
        : {}),
      ...(vesselType.idleGjPerDay !== undefined
        ? { idleGjPerDay: vesselType.idleGjPerDay }
        : {}),
      ...(vesselType.cargoSystemGjPerDay !== undefined
        ? { cargoSystemGjPerDay: vesselType.cargoSystemGjPerDay }
        : {}),
      ...(vesselType.serviceSpeedKn !== undefined
        ? { serviceSpeedKn: vesselType.serviceSpeedKn }
        : {}),
    },
    green,
    fossil,
    regulations: resolveRegulations(input.regulation, bundle, {
      green: factorsFor("green"),
      fossil: factorsFor("fossil"),
    }),
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
      // Only an EXPLICIT opt-out discloses: the default is on, so this can
      // never fire by omission, and a bundle with no coverage year has
      // nothing to disclose against.
      ...(input.regulation.ets.gasCoverage?.enabled === false &&
      bundle.regulationDefaults.ets.gasCoverageFromCalendarYear !== undefined
        ? {
            etsGasCoverageDisabledFrom:
              bundle.regulationDefaults.ets.gasCoverageFromCalendarYear,
          }
        : {}),
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
      etsChargeableEf: side.etsChargeableEf.value,
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
