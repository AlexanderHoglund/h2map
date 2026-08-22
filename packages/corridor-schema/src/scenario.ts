/**
 * Raw scenario input — what the user (or a fixture file) provides. Every
 * benchmarkable field is a nullable override: `null` = "use the benchmark",
 * mirroring the workbook's blank-D-cell convention (`E = IF(D="", F, D)`).
 * Numbers here are plain (unvalidated, unbranded); `resolveScenario` turns
 * them into branded `Resolved<T>` values against a reference bundle.
 */

/**
 * Current scenario schema version.
 * v2 renamed `regulation.ira45z.rateUsdPerGallon` → `creditUsdPerGallon`.
 * v3 restructured fuel sourcing: `construct` (the Excel double-count) became
 * `build-plant` + `flags.legacyExcelConstruct` where the double count was
 * live; v2 `build-here` (delivered-price basis) is REJECTED — the
 * calculation basis changed to capital+operating. See migrate.ts.
 */
// v6 replaced the workbook emission scalars with the refined
// fuel-emissions method: `regulation.emissions` (framework selector,
// default "fueleu") is INJECTED by migration — saved scenarios
// auto-upgrade on open (recorded product decision). See migrate.ts.
export const SCHEMA_VERSION = 7;

/**
 * Project archetype (realism pass, Task 4) — ONE selector that moves FOAK,
 * scale and firming coherently.
 *
 * Realism needs a first-of-a-kind premium, contingency, scale basis and
 * firming to move TOGETHER. Exposing them individually produces five inputs
 * a user cannot calibrate and will leave at defaults anyway; worse, the
 * previous defaults sat at the optimistic end of EVERY parameter at once —
 * each individually defensible, the compound not.
 *
 * - `foak-dedicated` (corridor default): one plant, one offtaker, no
 *   synergies — what a green corridor actually is, and what the MMMCZCS
 *   study costs. FOAK ×1.25, corridor-sized nameplate, firm power required.
 * - `noak-merchant`: mature supply chain, shared infrastructure, world-scale
 *   plant. FOAK ×1.0, PPA available.
 * - `match-study`: reproduce a specific published source — every value typed,
 *   provenance required per field.
 */
export type ProjectArchetype = "foak-dedicated" | "noak-merchant" | "match-study";

/** The multipliers each archetype implies. Reference data, not user inputs. */
export const ARCHETYPE_FOAK_MULTIPLIER: Record<ProjectArchetype, number> = {
  "foak-dedicated": 1.25,
  "noak-merchant": 1.0,
  "match-study": 1.0,
};

export type RouteType = "point-to-point" | "single-point";

/**
 * Fuel sourcing (restructured, spec §1 — no legacy in the menu):
 * - `purchase`      — price × tonnage (benchmark, or typed as an override —
 *                     a market assumption and a contracted delivered price
 *                     are the same arithmetic; v4 removed the separate
 *                     `named-plant` mode that only differed in provenance)
 * - `build-plant`   — production CAPEX + OPEX, typed directly
 * - `build-here`    — the SAME economics, inputs derived from the map
 * build-plant and build-here are ONE economic mode with two ways of
 * populating its inputs (override vs derived) — a single code path.
 * The Excel double-count (price AND capex/opex) survives only as
 * `flags.legacyExcelConstruct`, set by migration, never selectable.
 */
export type FuelSourcing = "purchase" | "build-plant" | "build-here";

/**
 * Divergences from the Excel (build-plan 1.4). Every field optional; the
 * default is ALWAYS the Excel behaviour, so the golden fixture passes with
 * `flags` absent.
 */
export interface DivergenceFlags {
  /** D1 — basis for CO2-abated (and $/tCO2). Excel: combustion (TTW). */
  emissionsBasis?: "combustion" | "wellToWake";
  /** D6 — real deflates the OPEX inflation growth. Excel: nominal. */
  rateBasis?: "nominal" | "real";
  /**
   * The Excel construct double-count: a build-plant side charges the
   * merchant fuel price AND production CAPEX/OPEX. Set by MIGRATION when a
   * legacy `construct` scenario with a live price row is loaded (the golden
   * fixture); never offered in the UI. Without it, charging both throws.
   */
  legacyExcelConstruct?: boolean;
  /**
   * Set by the v6→v7 migration on a scenario that was consuming the vessel
   * table's flat annual tonnage. That burn is now frozen as an explicit
   * `fuelTonnesPerVesselYear` override so the numbers are unchanged, but the
   * user has been running a figure that reconciles with nothing else in the
   * model — the loader raises a dismissable note showing the frozen value
   * against the distance-derived benchmark it now sits beside. Not a
   * divergence in behaviour; a disclosure that one existed.
   */
  migratedVesselBenchmarkBurn?: boolean;
  /**
   * What the fossil counterfactual IS. Absent = `"existing"` = the Excel
   * behaviour, so the golden fixture is untouched by construction.
   *
   * The workbook benchmarks fossil vessel CAPEX to zero — the "existing
   * baseline fleet" rule: the ships are already afloat, so the comparison
   * charges the green corridor for newbuilds and the fossil one for
   * nothing. That is right for a retrofit-style question ("what does
   * switching cost?") and wrong for a greenfield one ("what does this trade
   * lane cost, either way?").
   *
   * Both published studies reconstructed against this model are the second
   * kind. Bahia Posesion-Algeciras costs TWO newbuild conventional carriers
   * at $368M; GMF explicitly overrides the zero for the same reason. Until
   * now the only signal that the assumption was even being made was a
   * DERIVED badge showing 0, and the only escape was a per-field override
   * that discards the vessel type's own cost.
   *
   * `"newbuild"` derives fossil vessel CAPEX from the vessel type instead,
   * with no green-fuel readiness premium — a conventional ship. The port
   * and logistics rules stay on the existing-infrastructure basis either
   * way: a greenfield fossil corridor still loads at existing oil terminals,
   * which is a different claim from needing new ships, and folding the two
   * together would overstate the fossil side.
   */
  fossilFleetBasis?: "existing" | "newbuild";
}

export interface CargoInput {
  /**
   * Corridor anchor country (port A's country): selects the WACC benchmark.
   * Descriptive port/second-country fields below don't affect the numbers.
   */
  countryId: string;
  routeType: RouteType;
  oneWayDistanceNm: number;
  startYear: number;
  /** Model years (workbook max 40). */
  horizonYears: number;
  unitsPerYear: number;
  inflation: number;
  vessels: number;
  roundtripsPerYear: number;
  /**
   * Steaming speed, knots. OPTIONAL — absent means "the vessel type's own
   * service speed", i.e. no correction, i.e. exactly today's arithmetic.
   *
   * A vessel's GJ/nm is measured AT a speed; sailing slower burns less per
   * mile. The correction is v² per nautical mile, NOT v³: power scales with
   * v³ so GJ/DAY does, but nm/day scales with v, so GJ/NM scales with v².
   * Applying the cube law to a per-nm quantity understates by 12% at 11.5
   * against 13 kn. Studies state this choice explicitly (Bahia: eco 14.5 kn
   * against nominal 16.5), so the model has to be able to express it.
   */
  serviceSpeedKn?: number;
  /**
   * Days in port per round trip, burning auxiliary and cargo-system fuel at
   * zero miles. OPTIONAL — absent means the port term is omitted entirely,
   * which is today's behaviour.
   *
   * Not a rounding error on short corridors: GMF's cycle is 24 laden + 7
   * port + 22 ballast days, so 13% of it burns fuel while stationary, and a
   * distance-only formula cannot express that at all.
   */
  portDaysPerRoundTrip?: number;
  /** Project-specific WACC; null → country benchmark. */
  waccOverride: number | null;
  /**
   * What one cargo unit IS (presentation + per-tonne derivations only —
   * the engine counts units). Absent = legacy generic "unit"; the UI
   * defaults tonne for bulk/tanker and TEU for container vessels.
   */
  unit?: "tonne" | "teu" | "passenger";
  /** Weight of one unit in tonnes (TEU: 10 t, the GLEC Framework default payload). Absent = 1. */
  unitWeightTonnes?: number;
  /** Port A (the anchor country's port) — descriptive. */
  portAName?: string;
  /**
   * Port A coordinates — functional for build-here (the plant→port
   * logistics leg computes from coordinates, spec §4). Optional; absent =
   * the panel's typed distance is used.
   */
  portACoords?: { lat: number; lon: number };
  /** Port B — descriptive; point-to-point only. */
  portBName?: string;
  /** Port B's country — descriptive; point-to-point only. */
  countryBId?: string;
  /**
   * Port B coordinates — with portACoords, they let the corridor route
   * over the maritime network (drawing + routed-distance benchmark).
   * Optional; absent = no route is computed and the typed distance stands.
   * The engine never reads these.
   */
  portBCoords?: { lat: number; lon: number };
  /**
   * The routed distance the user ADOPTED into oneWayDistanceNm, with the
   * graph version that produced it — provenance, written only by the
   * user's explicit "use this" action, never on load. The engine never
   * reads it; oneWayDistanceNm remains the single number the model uses.
   */
  routedDistance?: {
    nm: number;
    graphVersion: string;
    via: "panama" | "suez" | null;
  };
}

/**
 * Vessel cost overrides, PER SHIP (v7).
 *
 * These were fleet totals that the engine never multiplied by vessel count,
 * while the benchmark underneath them was per-ship (`type CAPEX x (1 +
 * premium)`). Pressing "restore" on a ten-ship fleet therefore cut green
 * vessel CAPEX by an order of magnitude in silence. Per-ship makes the
 * field and its benchmark the same dimension, and `cargo.vessels`
 * multiplies in the engine.
 */
export interface VesselSideInput {
  capexUsdMPerShip: number | null;
  opexUsdMPerShipPerYear: number | null;
}

export interface VesselInput {
  typeId: string;
  green: VesselSideInput;
  fossil: VesselSideInput;
}

/** Per-side fuel/port overrides — one nullable field per workbook D cell. */
export interface FuelSideOverrides {
  priceUsdPerTonne: number | null;
  combustionEfTco2PerTonne: number | null;
  lhvMjPerTonne: number | null;
  wtwGco2PerMj: number | null;
  fuelTonnesPerVesselYear: number | null;
  prodCapexUsdM: number | null;
  prodOpexUsdMPerYear: number | null;
  portStorageCapexUsdM: number | null;
  portStorageOpexUsdMPerYear: number | null;
  bargeCapexUsdM: number | null;
  bargeOpexUsdMPerYear: number | null;
}

/** One build-here production-cost component: map-derived + overridable. */
export interface BuildHereComponent {
  derivedUsdM: number;
  overrideUsdM: number | null;
}

export interface BuildHereSite {
  h3: string;
  lat: number;
  lon: number;
  /** The LCOH evaluation snapshot (archived provenance; display + restore). */
  evaluated: {
    lcohUsdPerKg: number;
    /** Year-1 H2 at the EVALUATED config, kg. */
    annualH2Kg: number;
    /** LCOH cost structure at the evaluated config, USD. */
    capitalUsd: number;
    annualOperatingUsd: number;
    /** LCOH-internal rate — display/transparency only, never the corridor rate. */
    lcohDiscountRate: number;
    lcohEngineVersion: string;
    plantLifeYears: number;
  };
  /** The decomposition the corridor consumes (spec §5): each overridable. */
  components: {
    h2Capital: BuildHereComponent;
    h2Operating: BuildHereComponent;
    synthCapital: BuildHereComponent;
    synthOperating: BuildHereComponent;
    logisticsOperating: BuildHereComponent;
  };
  /**
   * Firm-power resolution (realism pass). Present when the evaluated site's
   * duty falls short of the carrier's firmness requirement — the corridor
   * prices a strategy rather than silently producing a carrier the plant
   * could not make. Absent when the site already meets the requirement.
   */
  firming?: {
    /** Duty the evaluated configuration achieves, 0-1. */
    evaluatedDuty: number;
    /** Duty the carrier's synthesis loop requires, 0-1. */
    requiredDuty: number;
    /** Chosen strategy; user-overridable, defaults to the cheapest. */
    strategy: "buffer-oversize" | "firm-ppa" | "grid-hybrid";
    /** True when the user picked the strategy rather than taking the cheapest. */
    strategyOverridden: boolean;
    capitalUsdM: number;
    operatingUsdMPerYear: number;
    /** Added CO2 from imported grid power, t/yr (grid-hybrid only). */
    emissionsTco2PerYear: number;
  } | null;
  sizing: {
    nameplateTonnesPerYear: number;
    nameplateMargin: number;
    scaleFactor: number;
    /**
     * Project archetype driving foakMultiplier and the firming default.
     * Optional: sites picked before v5 carry no archetype and are read as
     * the historical `noak-merchant` behaviour (foak 1.0).
     */
    archetype?: ProjectArchetype;
    foakMultiplier: number;
    /** Nameplate above corridor demand — reported, never apportioned. */
    surplusTonnesPerYear: number;
    distanceKm: number;
  };
}

/**
 * Per-side refined-emissions inputs (v6). Every field nullable: null =
 * the fuel-emissions dataset's default (certified prefill, default slip
 * scenario, documented pilot share…). The green side uses the pathway /
 * slip / pilot fields; the fossil side uses `sulphurPercent` (IMO
 * sulphur-band classification). Irrelevant fields stay null.
 */
export interface FuelEmissionsSideInput {
  /** Certified pathway WtT (PoS E-value), gCO2e/MJ. Pathway fuels. */
  certifiedWttGco2ePerMj: number | null;
  /** N2O slip scenario id (e-ammonia). */
  n2oScenarioId: string | null;
  /** Pilot share of delivered energy, 0–1. */
  pilotShare: number | null;
  pilotFuelId: string | null;
  /** LNG engine technology id (methaneSlip.byEngine). */
  engineType: string | null;
  /** Baseline sulphur mass % — IMO residual band resolution. */
  sulphurPercent: number | null;
  efficiencyRatio: number | null;
}

export interface FuelSideInput {
  fuelId: string;
  sourcing: FuelSourcing;
  /**
   * build-here (v3): the evaluated site and the DECOMPOSED production cost.
   * The five components each carry a map-derived value and an optional
   * override (seed, not lock): the resolver sums override ?? derived into
   * the production CAPEX/OPEX lines. A scenario reproduces without
   * re-calling the LCOH service; the engine-version pin drives the
   * recompute affordance.
   */
  buildHere?: BuildHereSite | null;
  overrides: FuelSideOverrides;
  /** v6 refined-emissions inputs. Absent = all dataset defaults. */
  emissions?: FuelEmissionsSideInput;
}

/** D3 — per-side non-CO2 combustion factors (tonnes of gas per tonne fuel). */
export interface EtsGasFactors {
  ch4TPerTonne: number;
  n2oTPerTonne: number;
}

export interface EtsInput {
  enabled: boolean;
  euaEurPerTonne: number;
  /**
   * Fix #3 — annual EUA price escalation, fraction/yr. Absent/0 = flat
   * nominal price (the Excel behaviour; a FALLING real price under
   * inflation). Effective price in year t = eua × (1+esc)^(t−1).
   */
  euaEscalation?: number;
  scope: number;
  /**
   * D3 — maritime ETS covers CH4 + N2O from 2026 (material for LNG slip and
   * ammonia N2O). Off (absent) = Excel behaviour (CO2 only).
   */
  gasCoverage?: {
    enabled: boolean;
    fromCalendarYear: number;
    gwpCh4: number;
    gwpN2o: number;
    green: EtsGasFactors;
    fossil: EtsGasFactors;
  };
}

export interface FuelEuInput {
  enabled: boolean;
  penaltyEurPerTonne: number;
  vlsfoMjPerTonne: number;
  baselineGco2PerMj: number;
  scope: number;
  /**
   * D2 — over-compliance value. Excel floors at MAX(0, ·): a surplus is worth
   * nothing. Enabled: a negative deficit earns `surplusValueEurPerTonneVlsfoEq`
   * per notional tonne, with the RFNBO ×multiplier until `rfnboUntil`.
   */
  credit?: {
    enabled: boolean;
    surplusValueEurPerTonneVlsfoEq: number;
    rfnbo: boolean;
    rfnboMultiplier: number;
    rfnboUntil: number;
  };
}

export interface Ira45zInput {
  enabled: boolean;
  usProduced: boolean;
  /** Credit rate, $/gallon-equivalent (v1 name: rateUsdPerGallon). */
  creditUsdPerGallon: number;
  /**
   * D5 — the credit as legislated runs to end-2027; the workbook has no
   * sunset. Absent/null = no sunset (Excel behaviour); parameterized rather
   * than hardcoded either way.
   */
  effectiveUntil?: number | null;
}

export interface SelfDesignedInput {
  enabled: boolean;
  co2PriceUsdPerTonne: number;
  /** Fix #3 — annual CO2-price escalation, fraction/yr. Absent/0 = flat nominal. */
  co2PriceEscalation?: number;
  supportUsdPerKg: number;
  capexSupport: number;
  opexSupport: number;
  otherUsdM: number;
}

/**
 * Fix #6 — IMO Net-Zero Framework (draft MEPC 83; provisional pending
 * adoption). Trajectories, reference intensity and tier prices come from
 * the reference bundle — never hardcoded here. The ZNZ reward rate is
 * undetermined at source: the optional parameter defaults to zero, and the
 * surplus balance is reported in tonnes regardless.
 */
export interface ImoNetZeroInput {
  enabled: boolean;
  /** Fraction of voyages/fuel in scope (consistent with the other modules). */
  scope: number;
  /** ZNZ reward, $/tCO2e of surplus below the direct target. Default 0. */
  rewardUsdPerTonneCo2e?: number;
  /** Fix #3-style escalation on both tier prices (post-2030 prices unset). */
  priceEscalation?: number;
}

/**
 * v6 — the emission-accounting framework. PRESENT = refined factors
 * derived from the fuel-emissions dataset (injected by migration for
 * every scenario; default framework "fueleu"). ABSENT = the legacy
 * workbook scalars — kept only for the Excel golden fixture's
 * legacy-path gate and explicit calibration tests.
 */
export interface EmissionsAccountingInput {
  framework: "fueleu" | "imo";
}

export interface RegulationInput {
  eurUsd: number;
  ets: EtsInput;
  fuelEu: FuelEuInput;
  ira45z: Ira45zInput;
  selfDesigned: SelfDesignedInput;
  /** Absent = module off (legacy scenarios). */
  imoNetZero?: ImoNetZeroInput;
  /** v6 refined emission accounting. Absent = legacy workbook scalars. */
  emissions?: EmissionsAccountingInput;
}

/**
 * Differentiated green financing (sprint 4, task 1): the interest saving
 * (or premium) on the green side's debt-financed capital relative to the
 * corridor's base rate, as an EXPLICIT per-year line.
 *
 * Deliberately NOT a per-side discount rate: in a cost model a lower green
 * discount rate makes future costs LARGER in present value — the exact
 * inversion of the benefit (see the methodology's worked $141m example).
 * Absent = module off (legacy scenarios load unchanged).
 */
export interface FinancingInput {
  enabled: boolean;
  /** Cost of debt for green assets, fraction (a negotiation outcome). */
  greenRate: number;
  /** The rate the green capital would otherwise pay. UI initialises it to
   *  the corridor discount rate at toggle-on; stored concretely. */
  baseRate: number;
  /** Share of green CAPEX that is debt-financed. */
  debtShare: number;
  /** Loan tenor in model years. UI initialises min(15, horizon). */
  tenorYears: number;
  /** Straight-line principal vs full balance to maturity. */
  structure: "amortizing" | "bullet";
}

/**
 * What the cargo owner is prepared to pay toward decarbonising this
 * corridor, expressed per tonne of CO2e ABATED rather than per tonne of
 * cargo — that is the unit a customer green-premium commitment is actually
 * negotiated in, and it makes the number comparable to the corridor's
 * $/tCO2 abatement cost directly.
 *
 * DELIBERATELY NOT A COST LINE. It never enters `totalPvUsdM`, so it cannot
 * move the headline gap: what the corridor costs to run does not change
 * because a customer agreed to help pay for it. It funds the gap that is
 * already there, and the waterfall shows it that way — the bar after the
 * headline, with public support as whatever remains.
 *
 * Absent, or zero, = off. That is the default: a willingness to pay is a
 * commercial fact about a specific negotiation, never a benchmark, so the
 * model must not invent one.
 */
export interface CommercialInput {
  /** $/tCO2e abated the cargo owner will fund. 0 = none. */
  willingnessToPayUsdPerTonneCo2: number;
}

/**
 * Capital deployment schedule (sprint 4, task 2): CAPEX charged over the
 * first N years by explicit weights instead of landing entirely in year 1
 * at a discount factor of exactly 1.0. Weights MUST sum to 1 per side —
 * validation rejects anything else by name; nothing is silently
 * normalised. Absent = legacy behaviour (all capital in year 1).
 */
export interface CapitalPhasingSide {
  /** Year-1..N shares of the side's CAPEX. Sum must equal 1. */
  weights: number[];
}

export interface CapitalPhasingInput {
  enabled: boolean;
  green: CapitalPhasingSide;
  fossil: CapitalPhasingSide;
}

export interface ScenarioInput {
  schemaVersion: typeof SCHEMA_VERSION;
  refBundleId: string;
  cargo: CargoInput;
  vessel: VesselInput;
  green: FuelSideInput;
  fossil: FuelSideInput;
  regulation: RegulationInput;
  /** Green-financing effect line. Absent = off (legacy scenarios). */
  financing?: FinancingInput;
  /** Cargo-owner willingness to pay. Absent = 0 = off. */
  commercial?: CommercialInput;
  /** Capital deployment schedule. Absent = all CAPEX in year 1. */
  capitalPhasing?: CapitalPhasingInput;
  /** Divergence flags (D1/D6). Absent = pure Excel behaviour. */
  flags?: DivergenceFlags;
}
