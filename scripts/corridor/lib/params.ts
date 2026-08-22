/**
 * The sweep's shared vocabulary — the parameter table, the six KPIs, and a
 * scenario evaluator — extracted so more than one script can use them.
 *
 * `sensitivity.ts` used to hold all of this AND call `main()` at module load
 * with no exports, so importing it ran the whole sweep and wrote two
 * artifacts. Nothing could reuse the table. The elasticity harness needs the
 * same 61 parameters against DIFFERENT scenarios, so the table moved here and
 * `kpisFor` now takes its scenario and bundle as arguments instead of closing
 * over module state.
 *
 * NO BEHAVIOUR CHANGE: `sensitivity.ts` still owns its own baseline posture
 * and its own artifacts, and `sensitivity.json` regenerates byte-identical.
 * A test pins that, because every existing gate is blind to this refactor —
 * `--check` compares only the top-level id SET.
 */

import {
  migrateScenarioInput,
  resolveScenario,
  type RefBundle,
  type ScenarioInput,
} from "@h2map/corridor-schema";
import { evaluateScenario } from "@h2map/corridor-engine";

export /** A sweepable parameter: a path setter + its plausible [low, high] range. */
interface Param {
  id: string;
  label: string;
  step: 1 | 2 | 3 | 4 | 5; // wizard step (Cargo/Vessel/Fuel/Port/Regulation)
  /** Numeric params: the plausible range endpoints. */
  low?: number;
  high?: number;
  /**
   * Enum params: every defined option. Previously these were skipped and
   * ranked "—", which hid n2oScenarioId — the dominant uncertainty per §15
   * — from the sweep entirely. A categorical driver is swept across its
   * options and ranks like any other field.
   */
  options?: readonly string[];
  setOption?: (s: ScenarioInput, v: string) => void;
  /**
   * Part of the FROZEN UI prominence contract: only ui-flagged params feed
   * ui-manifest.json (top-level vs advanced) and the --check gate. The
   * docs-only params below rank in sensitivity.json without moving a single
   * field in the interface (user decision 2026-08-13: docs only, freeze UI).
   */
  ui?: boolean;
  set?: (s: ScenarioInput, v: number) => void;
  /**
   * "current" = evaluate this param against the CURRENT reference bundle,
   * with its own baseline, instead of the frozen sweep bundle.
   *
   * The choice params need this: the frozen bundle predates the researched
   * vessel catalogue and the modern fuels, so their options do not exist
   * there. Movement is measured against a base computed on the SAME bundle,
   * so the figure is "this choice, on today's data" — never a bundle change
   * disguised as a choice.
   */
  bundle?: "current";
}

// Plausible ranges: workbook-informed planning bands. Overrides go through the
// scenario's own override fields, so the sweep exercises the same resolution
// path the UI will.
/**
 * How a field should be nudged when measuring its LEVERAGE.
 *
 * `relative` (the default): ±10% of the field's own value. Right for prices,
 * quantities, capacities and distances.
 *
 * `absolutePp`: ±1 percentage point. Right for rates and fractions, because
 * ±10% of a 5.5% WACC is 6.05% and nobody reasons about rate uncertainty that
 * way — a rate moves in points, not in percentages of itself.
 *
 * DECLARED BY MEANING, NOT INFERRED FROM RANGE. A range-based rule would
 * misclassify `regulation.eurUsd` (0.9–1.3, an exchange rate),
 * `green.efficiencyRatio` (0.8–1.2), `green.combustionEf` (tCO2/t) and every
 * $m/yr port cost that happens to sit under 1.5 — all of which are ordinary
 * quantities that move proportionally.
 */
export type PerturbationType = "relative" | "absolutePp";

/** The fields that move in percentage points. Everything else is relative. */
const ABSOLUTE_PP: ReadonlySet<string> = new Set([
  "cargo.wacc",
  "cargo.inflation",
  "financing.greenRate",
  "financing.baseRate",
  "financing.debtShare",
  "regulation.etsScope",
  "regulation.fuelEuScope",
  "regulation.imoScope",
  "regulation.selfCapexSupport",
  "regulation.selfOpexSupport",
  "regulation.euaEscalation",
  "regulation.selfCo2PriceEscalation",
  "regulation.imoPriceEscalation",
  "green.pilotShare",
]);

export const perturbationType = (id: string): PerturbationType =>
  ABSOLUTE_PP.has(id) ? "absolutePp" : "relative";

/**
 * Inputs that are NOT independent, and the rule that keeps them physical.
 *
 * The one-at-a-time sweep moves each field alone, which for coupled inputs
 * measures a state the model itself rejects. The clearest case: green and
 * fossil consumption are energy-matched on any real corridor
 * (`energyParity.ratio` is exactly 1.000000 at baseline), and moving one side
 * ±30% drives the ratio to 1.3000 / 0.7692 with `diverged: true`. The sweep
 * scores that as two independent 21.0% and 41.1% movers.
 *
 * A member may belong to MORE THAN ONE group — the burns are both an
 * energy-demand driver and half of a fuel-cost group — which is why this is a
 * separate declaration rather than a field on `Param`.
 *
 * The group figure is the honest one; the individual figures explain the
 * mechanism and are reported flagged `coupled`.
 */
export interface CouplingGroup {
  id: string;
  label: string;
  /** Sweep ids moved together. */
  members: readonly string[];
  /** Why these move together, and what the joint perturbation means. */
  rationale: string;
}

export const COUPLING_GROUPS: readonly CouplingGroup[] = [
  {
    id: "energy-demand",
    label: "Delivered energy demand",
    members: [
      "cargo.oneWayDistanceNm",
      "cargo.roundtripsPerYear",
      "green.fuelTonnesPerVesselYear",
      "fossil.fuelTonnesPerVesselYear",
    ],
    rationale:
      "Consumption scales with distance x roundtrips, and the two sides stay " +
      "energy-matched via their LHV ratio. Perturbed together, so the " +
      "corridor still delivers a physically consistent amount of energy.",
  },
  {
    id: "fuel-cost-green",
    label: "Green delivered fuel cost",
    members: ["green.priceUsdPerTonne", "green.fuelTonnesPerVesselYear"],
    rationale:
      "Price x consumption is one quantity — the cost of delivered energy. " +
      "Sweeping them apart double-counts the same exposure.",
  },
  {
    id: "fuel-cost-fossil",
    label: "Fossil delivered fuel cost",
    members: ["fossil.priceUsdPerTonne", "fossil.fuelTonnesPerVesselYear"],
    rationale: "As fuel-cost-green, on the incumbent side.",
  },
  {
    id: "fleet-capital",
    label: "Fleet capital",
    members: ["vessel.green.capexUsdM", "vessel.fossil.capexUsdM"],
    rationale:
      "Both sides are ordered from the same yard market, so a newbuild price " +
      "shock moves them together; their SPREAD is the green premium and is a " +
      "second axis, not this one. NOTE the researched caveat: over a 15-year " +
      "horizon yard prices across CLASSES do not move together (Ultramax -27% " +
      "and Kamsarmax -19% from 2007 to 2024 while the aggregate index moved " +
      "2.6%), so this group couples the two SIDES of one class, never two " +
      "classes — see docs/corridor/input-uncertainty-findings.md.",
  },
  {
    id: "vessel-opex",
    label: "Fleet operating cost",
    members: ["vessel.green.opexUsdMPerYear", "vessel.fossil.opexUsdMPerYear"],
    rationale:
      "Same reasoning as fleet-capital: one hull class crewed, insured and " +
      "maintained in one market, so an operating-cost move lifts both sides " +
      "together. The disclosed peer spread that sizes this range is itself " +
      "deadweight-normalised, which is why it measures management efficiency " +
      "rather than class.",
  },
];

/** Groups a sweep id belongs to (possibly none, possibly several). */
export const groupsFor = (id: string): readonly CouplingGroup[] =>
  COUPLING_GROUPS.filter((g) => g.members.includes(id));

export const PARAMS: Param[] = [
  { id: "cargo.oneWayDistanceNm", label: "Corridor length (nm)", step: 1, low: 100, high: 5000, ui: true, set: (s, v) => { s.cargo.oneWayDistanceNm = v; } },
  { id: "cargo.horizonYears", label: "Years modelled", step: 1, low: 10, high: 40, ui: true, set: (s, v) => { s.cargo.horizonYears = Math.round(v); } },
  { id: "cargo.unitsPerYear", label: "Cargo throughput (units/yr)", step: 1, low: 11083, high: 33250, ui: true, set: (s, v) => { s.cargo.unitsPerYear = v; } },
  { id: "cargo.wacc", label: "Discount rate (WACC)", step: 1, low: 0.03, high: 0.12, ui: true, set: (s, v) => { s.cargo.waccOverride = v; } },
  { id: "cargo.inflation", label: "Inflation", step: 1, low: 0, high: 0.05, ui: true, set: (s, v) => { s.cargo.inflation = v; } },
  { id: "cargo.vessels", label: "Number of vessels", step: 2, low: 1, high: 5, ui: true, set: (s, v) => { s.cargo.vessels = Math.round(v); } },
  { id: "cargo.roundtripsPerYear", label: "Roundtrips per year", step: 2, low: 6, high: 24, ui: true, set: (s, v) => { s.cargo.roundtripsPerYear = Math.round(v); } },
  { id: "vessel.green.capexUsdM", label: "Green vessel CAPEX ($m)", step: 2, low: 15, high: 120, ui: true, set: (s, v) => { s.vessel.green.capexUsdMPerShip = v; } },
  { id: "vessel.green.opexUsdMPerYear", label: "Green vessel OPEX ($m/yr)", step: 2, low: 0.8, high: 6, ui: true, set: (s, v) => { s.vessel.green.opexUsdMPerShipPerYear = v; } },
  { id: "green.priceUsdPerTonne", label: "Green fuel price ($/t)", step: 3, low: 500, high: 1500, ui: true, set: (s, v) => { s.green.overrides.priceUsdPerTonne = v; } },
  { id: "green.fuelTonnesPerVesselYear", label: "Green fuel consumption (t/vessel/yr)", step: 3, low: 1300, high: 5200, ui: true, set: (s, v) => { s.green.overrides.fuelTonnesPerVesselYear = v; } },
  { id: "green.prodCapexUsdM", label: "Fuel production CAPEX ($m)", step: 3, low: 0, high: 110, ui: true, set: (s, v) => { s.green.overrides.prodCapexUsdM = v; } },
  { id: "green.prodOpexUsdMPerYear", label: "Fuel production O&M ($m/yr)", step: 3, low: 0, high: 6, ui: true, set: (s, v) => { s.green.overrides.prodOpexUsdMPerYear = v; } },
  { id: "green.wtwGco2PerMj", label: "Green fuel WTW intensity (gCO2e/MJ)", step: 3, low: 1, high: 40, ui: true, set: (s, v) => { s.green.overrides.wtwGco2PerMj = v; } },
  { id: "fossil.priceUsdPerTonne", label: "Fossil fuel price ($/t)", step: 3, low: 300, high: 900, ui: true, set: (s, v) => { s.fossil.overrides.priceUsdPerTonne = v; } },
  { id: "fossil.wtwGco2PerMj", label: "Fossil fuel WTW intensity (gCO2e/MJ)", step: 3, low: 80, high: 100, ui: true, set: (s, v) => { s.fossil.overrides.wtwGco2PerMj = v; } },
  { id: "port.storageCapexUsdM", label: "Green port storage CAPEX ($m)", step: 4, low: 0, high: 30, ui: true, set: (s, v) => { s.green.overrides.portStorageCapexUsdM = v; } },
  { id: "port.storageOpexUsdMPerYear", label: "Green port storage OPEX ($m/yr)", step: 4, low: 0, high: 1.5, ui: true, set: (s, v) => { s.green.overrides.portStorageOpexUsdMPerYear = v; } },
  { id: "port.bargeCapexUsdM", label: "Green port barge CAPEX ($m)", step: 4, low: 0, high: 12, ui: true, set: (s, v) => { s.green.overrides.bargeCapexUsdM = v; } },
  { id: "regulation.euaEurPerTonne", label: "EUA price (€/tCO2)", step: 5, low: 40, high: 200, ui: true, set: (s, v) => { s.regulation.ets.euaEurPerTonne = v; } },
  { id: "regulation.eurUsd", label: "EUR/USD", step: 5, low: 0.9, high: 1.3, ui: true, set: (s, v) => { s.regulation.eurUsd = v; } },
  { id: "regulation.fuelEuPenalty", label: "FuelEU penalty (€/t VLSFO-eq)", step: 5, low: 1200, high: 4800, ui: true, set: (s, v) => { s.regulation.fuelEu.penaltyEurPerTonne = v; } },
  { id: "regulation.etsScope", label: "ETS scope (%)", step: 5, low: 0, high: 1, ui: true, set: (s, v) => { s.regulation.ets.scope = v; } },
  { id: "regulation.fuelEuScope", label: "FuelEU scope (%)", step: 5, low: 0, high: 1, ui: true, set: (s, v) => { s.regulation.fuelEu.scope = v; } },
  // Sprint 4 — green financing: the sweep enables the module with the
  // reference structure (amortizing, full debt, tenor 15) and moves the
  // green cost of debt around the 8% base rate.
  { id: "financing.greenRate", label: "Green cost of debt (fraction)", step: 5, low: 0.04, high: 0.1, ui: true, set: (s, v) => { s.financing = { enabled: true, greenRate: v, baseRate: 0.08, debtShare: 1, tenorYears: 15, structure: "amortizing" }; } },
  // Sprint 4 — capital phasing: swept over deployment years with fixed
  // profiles (1 → up-front, 2 → 50/50, 3 → 30/40/30) on BOTH sides.
  { id: "capitalPhasing.years", label: "Capital deployment years (30/40/30 at 3)", step: 3, low: 1, high: 3, ui: true, set: (s, v) => { const w = [[1], [0.5, 0.5], [0.3, 0.4, 0.3]][Math.round(v) - 1]!; s.capitalPhasing = { enabled: true, green: { weights: w }, fossil: { weights: w } }; } },

  // -------------------------------------------------------------------------
  // DOCS-ONLY sweep extension (2026-08-13): ranks + max-gap-movement for the
  // complete input inventory. NOT part of the UI prominence contract — no
  // ui flag, so these never enter ui-manifest.json. Module-enabling entries
  // measure the module switched ON at the range endpoints vs the (module-off)
  // baseline, the same semantics as financing.greenRate above.
  // -------------------------------------------------------------------------
  { id: "cargo.startYear", label: "Start year (calendar anchoring)", step: 1, low: 2025, high: 2035, set: (s, v) => { s.cargo.startYear = Math.round(v); } },
  // Low end 0, NOT a plausible newbuild price: the reference corridor's
  // fossil fleet is already afloat (resolved CAPEX $0/ship), and a sweep
  // whose range excludes its own baseline shows two endpoint dollars the
  // baseline sits outside of — the reader has no anchor. 0 IS the baseline.
  { id: "vessel.fossil.capexUsdM", label: "Fossil vessel CAPEX ($m)", step: 2, low: 0, high: 100, set: (s, v) => { s.vessel.fossil.capexUsdMPerShip = v; } },
  { id: "vessel.fossil.opexUsdMPerYear", label: "Fossil vessel OPEX ($m/yr)", step: 2, low: 0.8, high: 5, set: (s, v) => { s.vessel.fossil.opexUsdMPerShipPerYear = v; } },
  { id: "green.combustionEf", label: "Green combustion EF (tCO2/t)", step: 3, low: 0, high: 1, set: (s, v) => { s.green.overrides.combustionEfTco2PerTonne = v; } },
  { id: "green.lhvMjPerTonne", label: "Green energy density, LHV (MJ/t)", step: 3, low: 16000, high: 21000, set: (s, v) => { s.green.overrides.lhvMjPerTonne = v; } },
  // Low 1,000, not the green side's 1,300: the reference corridor's derived
  // fossil burn is 1,185 t/vessel/yr (energy-denser fuel), which the old
  // range excluded — every endpoint dollar sat on one side of the baseline.
  { id: "fossil.fuelTonnesPerVesselYear", label: "Fossil fuel consumption (t/vessel/yr)", step: 3, low: 1000, high: 5200, set: (s, v) => { s.fossil.overrides.fuelTonnesPerVesselYear = v; } },
  { id: "fossil.combustionEf", label: "Fossil combustion EF (tCO2/t)", step: 3, low: 2.5, high: 3.5, set: (s, v) => { s.fossil.overrides.combustionEfTco2PerTonne = v; } },
  { id: "fossil.lhvMjPerTonne", label: "Fossil energy density, LHV (MJ/t)", step: 3, low: 38000, high: 43000, set: (s, v) => { s.fossil.overrides.lhvMjPerTonne = v; } },
  { id: "port.bargeOpexUsdMPerYear", label: "Green port barge OPEX ($m/yr)", step: 4, low: 0, high: 1.5, set: (s, v) => { s.green.overrides.bargeOpexUsdMPerYear = v; } },
  { id: "port.fossilStorageCapexUsdM", label: "Fossil port storage CAPEX ($m)", step: 4, low: 0, high: 30, set: (s, v) => { s.fossil.overrides.portStorageCapexUsdM = v; } },
  { id: "port.fossilStorageOpexUsdMPerYear", label: "Fossil port storage OPEX ($m/yr)", step: 4, low: 0, high: 1.5, set: (s, v) => { s.fossil.overrides.portStorageOpexUsdMPerYear = v; } },
  { id: "port.fossilBargeCapexUsdM", label: "Fossil port barge CAPEX ($m)", step: 4, low: 0, high: 12, set: (s, v) => { s.fossil.overrides.bargeCapexUsdM = v; } },
  { id: "port.fossilBargeOpexUsdMPerYear", label: "Fossil port barge OPEX ($m/yr)", step: 4, low: 0, high: 1.5, set: (s, v) => { s.fossil.overrides.bargeOpexUsdMPerYear = v; } },
  { id: "regulation.euaEscalation", label: "EUA price escalation (/yr)", step: 5, low: 0, high: 0.05, set: (s, v) => { s.regulation.ets.euaEscalation = v; } },
  { id: "regulation.fuelEuVlsfoMjPerTonne", label: "FuelEU VLSFO energy (MJ/t)", step: 5, low: 39000, high: 43000, set: (s, v) => { s.regulation.fuelEu.vlsfoMjPerTonne = v; } },
  { id: "regulation.fuelEuBaselineGco2PerMj", label: "FuelEU baseline intensity (gCO2e/MJ)", step: 5, low: 85, high: 95, set: (s, v) => { s.regulation.fuelEu.baselineGco2PerMj = v; } },
  { id: "regulation.fuelEuCreditSurplusValue", label: "FuelEU credit value (€/t VLSFO-eq, credit on)", step: 5, low: 0, high: 2400, set: (s, v) => { s.regulation.fuelEu.credit = { enabled: true, surplusValueEurPerTonneVlsfoEq: v, rfnbo: true, rfnboMultiplier: 2, rfnboUntil: 2033 }; } },
  { id: "regulation.selfCo2PriceUsdPerTonne", label: "Self-designed CO2 price ($/t, module on)", step: 5, low: 0, high: 500, set: (s, v) => { s.regulation.selfDesigned.enabled = true; s.regulation.selfDesigned.co2PriceUsdPerTonne = v; } },
  { id: "regulation.selfCo2PriceEscalation", label: "Self-designed CO2 escalation (/yr, at $280)", step: 5, low: 0, high: 0.05, set: (s, v) => { s.regulation.selfDesigned.enabled = true; s.regulation.selfDesigned.co2PriceUsdPerTonne = 280; s.regulation.selfDesigned.co2PriceEscalation = v; } },
  { id: "regulation.selfSupportUsdPerKg", label: "H2 fuel support ($/kg, module on)", step: 5, low: 0, high: 1, set: (s, v) => { s.regulation.selfDesigned.enabled = true; s.regulation.selfDesigned.supportUsdPerKg = v; } },
  { id: "regulation.selfCapexSupport", label: "CAPEX support (fraction, module on)", step: 5, low: 0, high: 0.5, set: (s, v) => { s.regulation.selfDesigned.enabled = true; s.regulation.selfDesigned.capexSupport = v; } },
  { id: "regulation.selfOpexSupport", label: "OPEX support (fraction, module on)", step: 5, low: 0, high: 0.5, set: (s, v) => { s.regulation.selfDesigned.enabled = true; s.regulation.selfDesigned.opexSupport = v; } },
  { id: "regulation.selfOtherUsdM", label: "Other support ($m/yr, module on)", step: 5, low: 0, high: 50, set: (s, v) => { s.regulation.selfDesigned.enabled = true; s.regulation.selfDesigned.otherUsdM = v; } },
  { id: "regulation.ira45zCreditUsdPerGallon", label: "45Z credit ($/gal, module on, US-produced)", step: 5, low: 0, high: 1.75, set: (s, v) => { s.regulation.ira45z.enabled = true; s.regulation.ira45z.usProduced = true; s.regulation.ira45z.creditUsdPerGallon = v; } },
  { id: "regulation.imoScope", label: "IMO NZF scope (module on)", step: 5, low: 0, high: 1, set: (s, v) => { s.regulation.imoNetZero = { enabled: true, scope: v }; } },
  { id: "regulation.imoRewardUsdPerTonneCo2e", label: "IMO ZNZ reward ($/tCO2e, module on)", step: 5, low: 0, high: 100, set: (s, v) => { s.regulation.imoNetZero = { enabled: true, scope: 1, rewardUsdPerTonneCo2e: v }; } },
  { id: "regulation.imoPriceEscalation", label: "IMO price escalation (/yr, module on)", step: 5, low: 0, high: 0.05, set: (s, v) => { s.regulation.imoNetZero = { enabled: true, scope: 1, priceEscalation: v }; } },
  // v6 — refined-emissions inputs (docs-only; the slip scenario is an
  // enum and stays unranked like routeType/consumptionMode).
  { id: "green.certifiedWttGco2ePerMj", label: "Green certified pathway WtT (gCO2e/MJ)", step: 3, low: 5, high: 28.2, set: (s, v) => { s.green.emissions = { ...{ certifiedWttGco2ePerMj: null, n2oScenarioId: null, pilotShare: null, pilotFuelId: null, engineType: null, sulphurPercent: null, efficiencyRatio: null }, ...(s.green.emissions ?? {}), certifiedWttGco2ePerMj: v }; } },
  { id: "green.pilotShare", label: "Pilot fuel share of energy (0–1)", step: 3, low: 0, high: 0.08, set: (s, v) => { s.green.emissions = { ...{ certifiedWttGco2ePerMj: null, n2oScenarioId: null, pilotShare: null, pilotFuelId: null, engineType: null, sulphurPercent: null, efficiencyRatio: null }, ...(s.green.emissions ?? {}), pilotShare: v }; } },
  { id: "green.efficiencyRatio", label: "Engine efficiency ratio (green vs fossil)", step: 3, low: 0.8, high: 1.2, set: (s, v) => { s.green.emissions = { ...{ certifiedWttGco2ePerMj: null, n2oScenarioId: null, pilotShare: null, pilotFuelId: null, engineType: null, sulphurPercent: null, efficiencyRatio: null }, ...(s.green.emissions ?? {}), efficiencyRatio: v }; } },
  // Low end 0.5 = the IMO accounting DEFAULT, so the row's low endpoint IS
  // its own (module-on) baseline. The old 0.1 low was a dead point anyway:
  // IMO's fossil WtT defaults are binned by sulphur band and 0.1 lands in
  // the same band as 0.5, so the sweep measured the identical state under a
  // label that suggested it had reached a cleaner fuel. This row still flips
  // the accounting framework to IMO for its own sweep (the field does not
  // exist under FuelEU accounting), which is why both endpoint dollars sit
  // below the FuelEU-accounted baseline — the module-on caveat above.
  { id: "fossil.sulphurPercent", label: "Fossil sulphur content (% S, IMO accounting; 0.5 = default)", step: 3, low: 0.5, high: 3, set: (s, v) => { s.regulation.emissions = { framework: "imo" }; s.fossil.emissions = { ...{ certifiedWttGco2ePerMj: null, n2oScenarioId: null, pilotShare: null, pilotFuelId: null, engineType: null, sulphurPercent: null, efficiencyRatio: null }, sulphurPercent: v }; } },
  { id: "financing.baseRate", label: "Base cost of debt (module on, green 6%)", step: 5, low: 0.05, high: 0.11, set: (s, v) => { s.financing = { enabled: true, greenRate: 0.06, baseRate: v, debtShare: 1, tenorYears: 15, structure: "amortizing" }; } },
  { id: "financing.debtShare", label: "Debt share of green CAPEX (module on)", step: 5, low: 0, high: 1, set: (s, v) => { s.financing = { enabled: true, greenRate: 0.06, baseRate: 0.08, debtShare: v, tenorYears: 15, structure: "amortizing" }; } },
  { id: "financing.tenorYears", label: "Loan tenor (yr, module on)", step: 5, low: 5, high: 25, set: (s, v) => { s.financing = { enabled: true, greenRate: 0.06, baseRate: 0.08, debtShare: 1, tenorYears: Math.round(v), structure: "amortizing" }; } },
  // ---------------------------------------------------------------------
  // ENUM params. Previously skipped and ranked "—", which hid the model's
  // dominant emissions uncertainty from the sweep entirely (§15). Swept
  // across every defined option.
  // ---------------------------------------------------------------------
  {
    id: "green.n2oScenarioId",
    label: "N2O slip scenario (e-ammonia)",
    step: 3,
    // The published span is ×37 in slip mass (6.81e-05 → 0.0025 g N2O/g NH3),
    // adding 1.0 → 36.69 gCO2e/MJ. It also flips ZNZ qualification, which no
    // continuous parameter in this sweep does.
    options: ["tested-two-stroke", "optimised-injection", "highest-observed"],
    setOption: (s, v) => {
      s.green.emissions = {
        ...{
          certifiedWttGco2ePerMj: null,
          n2oScenarioId: null,
          pilotShare: null,
          pilotFuelId: null,
          engineType: null,
          sulphurPercent: null,
          efficiencyRatio: null,
        },
        ...(s.green.emissions ?? {}),
        n2oScenarioId: v,
      };
    },
  },

  // -------------------------------------------------------------------------
  // CHOICES (2026-08-19): the discrete inputs. A choice's impact is the
  // largest KPI movement across the options it offers — read as "how much
  // does this decision change the answer", not a ±range. All docs-only: no
  // ui flag, so ui-manifest.json and the placement contract are untouched.
  //
  // The sweep baseline carries NO typed overrides (asserted against the
  // fixture), so switching a fuel or a hull re-derives every benchmark from
  // the bundle row — the choice is measured clean, not through a mask of
  // typed values.
  //
  // Option lists are literals; drift guards in sweepParams.test.ts assert
  // each one matches the bundle catalogue, so an option added to the data but
  // absent here fails loudly.
  // -------------------------------------------------------------------------
  {
    id: "green.fuelId",
    bundle: "current",
    label: "Green fuel choice",
    step: 3,
    options: ["e-ammonia", "e-methanol", "biodiesel-hvo", "lh2"],
    setOption: (s, v) => { s.green.fuelId = v; },
  },
  {
    id: "fossil.fuelId",
    bundle: "current",
    label: "Fossil fuel choice",
    step: 3,
    options: ["lsfo", "lng"],
    setOption: (s, v) => { s.fossil.fuelId = v; },
  },
  {
    id: "vessel.typeId",
    bundle: "current",
    label: "Vessel class choice",
    step: 2,
    // Every non-retired class. Large movement is legitimate: the hull sets
    // the energy-per-mile figure and the per-ship CAPEX/OPEX benchmarks, so
    // this is the model's biggest single decision and should rank like it.
    options: [
      "bulk-handysize-35k", "bulk-handymax-58k", "bulk-ultramax-64k",
      "bulk-panamax-76k", "bulk-kamsarmax-82k", "bulk-postpanamax-93k",
      "bulk-capesize-180k", "bulk-newcastlemax-210k", "bulk-vloc-325k",
      "tank-small-15k", "tank-mr1-40k", "tank-mr2-50k", "tank-lr1-75k",
      "tank-lr2-115k", "tank-suezmax-160k", "tank-vlcc-300k",
      "chem-imo2-12k", "chem-imo2-25k", "chem-imo2-40k",
      "cont-feeder-1800", "cont-handy-2800", "cont-subpanamax-5000",
      "cont-panamax-6400", "cont-8000", "cont-neopanamax-13640",
      "cont-ulcv-18000", "cont-ulcv-24000",
      "gas-lng-174k", "gas-vlgc-84k", "vlac-93k", "pctc-7000ceu",
      "roro-cargo-12k", "ropax-8k", "genc-12k", "genc-25k",
      // Cruise classes are deliberately excluded: the sweep baseline is a
      // CARGO corridor, and substituting a cruise liner onto it is a change
      // of product, not a sensitivity (it measured 2889% headline movement
      // and swamped the ranking). Documented in sweepParams.test.ts, which
      // asserts this list equals the non-retired CARGO classes exactly.
    ],
    setOption: (s, v) => { s.vessel.typeId = v; },
  },
  {
    id: "green.sourcing",
    bundle: "current",
    label: "Green fuel sourcing choice",
    step: 3,
    // build-here is deliberately absent: it requires an evaluated site from
    // the map flow, which the sweep cannot supply.
    options: ["purchase", "build-plant"],
    setOption: (s, v) => { s.green.sourcing = v as "purchase" | "build-plant"; },
  },
  {
    id: "fossil.sourcing",
    bundle: "current",
    label: "Fossil fuel sourcing choice",
    step: 3,
    options: ["purchase", "build-plant"],
    setOption: (s, v) => { s.fossil.sourcing = v as "purchase" | "build-plant"; },
  },
  {
    id: "cargo.countryId",
    bundle: "current",
    label: "Country choice (WACC benchmark)",
    step: 1,
    // Bites only when no WACC override is typed — the country row supplies
    // the discount-rate benchmark, itself flagged unverified in the bundle.
    options: ["denmark", "netherlands", "india", "brazil", "singapore", "united-states", "other"],
    setOption: (s, v) => { s.cargo.countryId = v; },
  },
  {
    id: "regulation.emissions.framework",
    bundle: "current",
    label: "Emission accounting framework",
    step: 5,
    options: ["fueleu", "imo"],
    setOption: (s, v) => { s.regulation.emissions = { framework: v as "fueleu" | "imo" }; },
  },
  {
    id: "flags.emissionsBasis",
    bundle: "current",
    label: "Emissions basis (abatement accounting)",
    step: 5,
    options: ["combustion", "wellToWake"],
    setOption: (s, v) => {
      s.flags = { ...(s.flags ?? {}), emissionsBasis: v as "combustion" | "wellToWake" };
    },
  },
  {
    id: "green.emissions.engineType",
    bundle: "current",
    label: "Engine type (methane slip)",
    step: 3,
    // Near-zero on this baseline and honestly so: per-engine slip only bites
    // for an LNG candidate, and the baseline's green fuel is ammonia. The
    // row still belongs here — absence would read as "not measured".
    options: [
      "lng-otto-df-medium-speed", "lng-otto-df-slow-speed",
      "lng-diesel-df-slow-speed", "lng-lbsi", "steam-turbine-boiler",
    ],
    setOption: (s, v) => {
      s.green.emissions = {
        ...{
          certifiedWttGco2ePerMj: null,
          n2oScenarioId: null,
          pilotShare: null,
          pilotFuelId: null,
          engineType: null,
          sulphurPercent: null,
          efficiencyRatio: null,
        },
        ...(s.green.emissions ?? {}),
        engineType: v,
      };
    },
  },
  {
    id: "cargo.unit",
    bundle: "current",
    label: "Cargo unit choice (tonne vs TEU)",
    step: 1,
    // Measures 0.0% on every KPI, and honestly: the unit is a LABEL for the
    // per-unit denominator — `unitsPerYear` is the count either way, so no
    // headline output can move. Kept so the table can say so.
    options: ["tonne", "teu"],
    setOption: (s, v) => { s.cargo.unit = v as "tonne" | "teu"; },
  },
  {
    id: "cargo.unitWeightTonnes",
    label: "Cargo unit weight (t/unit)",
    step: 1,
    // Inert on a tonne-denominated baseline (weight only converts TEU
    // counts); measured anyway so the table can SAY that rather than omit it.
    low: 10,
    high: 28,
    set: (s, v) => { s.cargo.unitWeightTonnes = v; },
  },
];

/**
 * The headline KPIs the model actually reports.
 *
 * The sweep measured movement of the GAP alone, which made every driver of
 * every other output invisible: n2oScenarioId ranked "—" while §15 calls it
 * the dominant uncertainty, and cargo.unitsPerYear measured 0.0% while being
 * the sole driver of $/cargo unit, the study's own headline figure. A field's
 * placement now comes from the MAX movement across all of these, and the KPI
 * that produced it is recorded so the placement is traceable.
 */
export const KPIS = [
  { id: "gapPvUsdM", label: "Cost gap (PV $m)" },
  { id: "costPerUnitUsd", label: "$ per cargo unit" },
  { id: "costPerTonneCo2Usd", label: "$ per tCO2 abated" },
  { id: "greenTotalPvUsdM", label: "Green total (PV $m)" },
  { id: "fossilTotalPvUsdM", label: "Fossil total (PV $m)" },
  { id: "co2AbatedTonnes", label: "Lifetime CO2 abated (t)" },
] as const;
export type KpiId = (typeof KPIS)[number]["id"];

export type KpiVector = Record<KpiId, number>;

/**
 * Evaluate one scenario, optionally mutated, into the six KPIs.
 *
 * `baseRaw` is RAW (pre-migration) scenario JSON: the frozen fixtures are
 * schema v1 and the migration registry brings them to current, so the caller
 * hands over what it read from disk and this owns the clone + migrate. The
 * deep clone is per call and deliberate — a mutation must never leak into the
 * next evaluation.
 */
export function kpisFor(
  baseRaw: unknown,
  bundle: RefBundle,
  mutate?: (s: ScenarioInput) => void,
): KpiVector {
  const input = migrateScenarioInput(JSON.parse(JSON.stringify(baseRaw))).input;
  mutate?.(input);
  const summary = evaluateScenario(resolveScenario(input, bundle)).summary;
  return {
    gapPvUsdM: summary.gapPvUsdM,
    costPerUnitUsd: summary.costPerUnitUsd,
    costPerTonneCo2Usd: summary.costPerTonneCo2Usd,
    greenTotalPvUsdM: summary.greenTotalPvUsdM,
    fossilTotalPvUsdM: summary.fossilTotalPvUsdM,
    co2AbatedTonnes: summary.co2AbatedTonnes,
  };
}
