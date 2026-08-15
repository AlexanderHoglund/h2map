/**
 * Input sensitivity harness (build-plan 1.7).
 *
 * One-at-a-time sweep of every numeric scenario input across its plausible
 * range against the headline gap (PV $m), from the Excel-default baseline
 * scenario. Outputs:
 *
 *   data/corridor-sensitivity/sensitivity.json  — full ranked artifact
 *   data/corridor-sensitivity/ui-manifest.json  — the UI field hierarchy:
 *     params whose headline movement ≥ 5% are TOP-LEVEL, the rest advanced.
 *     Phase 3 renders form prominence from this file.
 *
 *   npx tsx scripts/corridor/sensitivity.ts           # regenerate both
 *   npx tsx scripts/corridor/sensitivity.ts --check   # CI drift gate:
 *     fails when the computed top-level set no longer matches the committed
 *     manifest — the interface must track the model.
 *
 * Deterministic (pure engine + committed bundle + committed fixture), so it
 * is safe to run per-PR in CI.
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import {
  migrateScenarioInput,
  parseRefBundle,
  resolveScenario,
  type ScenarioInput,
} from "@h2map/corridor-schema";
import { evaluateScenario } from "@h2map/corridor-engine";

const ROOT = new URL("../../", import.meta.url);
const OUT_DIR = new URL("data/corridor-sensitivity/", ROOT);
const SENS_PATH = new URL("sensitivity.json", OUT_DIR);
const MANIFEST_PATH = new URL("ui-manifest.json", OUT_DIR);
const TOP_LEVEL_THRESHOLD = 0.05; // ±5% headline movement

const bundle = parseRefBundle(
  JSON.parse(readFileSync(new URL("data/corridor-ref/2026-07-30-excel-v1.json", ROOT), "utf8")),
);
/**
 * THE SWEEP BASELINE.
 *
 * Starts from the frozen workbook fixture — deterministic, committed, and
 * the same corridor geometry the sensitivity figures have always described
 * — then applies the app's ACTUAL default posture on the two axes where the
 * fixture is deliberately not the app:
 *
 * 1. `emissionsBasis: "wellToWake"`. The fixture carries no flags, so it
 *    falls to the Excel-faithful COMBUSTION basis. That is correct for the
 *    fixture (the golden test proves the transcription) but wrong for a
 *    sweep that claims to say what moves the model people run: on a TTW
 *    basis a well-to-TANK factor is inert almost by definition, which is
 *    why `green.certifiedWttGco2ePerMj` measured ~0.0% while §21 records it
 *    moving abatement −23% and $/tCO2 +34%. Every scenario the UI creates
 *    has been well-to-wake since 2026-07-31.
 *
 * 2. Burn overrides NULL on both sides. A frozen burn makes consumption
 *    constant, so `cargo.oneWayDistanceNm` would measure 0.0%, lose its ≥5%
 *    top-level placement and be demoted — a real field pushed into the
 *    Advanced fold by a bookkeeping choice in the baseline rather than by
 *    its actual influence. (The fixture is already null here; this asserts
 *    it, so a future fixture edit cannot silently regress the manifest.)
 *
 * The FIXTURE FILE IS NEVER EDITED — the golden test still pins the
 * workbook's combustion-basis numbers exactly. This is a sweep-local copy.
 */
const baseRaw = (() => {
  const raw = JSON.parse(
    readFileSync(new URL("fixtures/golden/corridor/excel-baseline.input.json", ROOT), "utf8"),
  ) as Record<string, unknown>;
  const flags = (raw.flags ?? {}) as Record<string, unknown>;
  flags.emissionsBasis = "wellToWake";
  raw.flags = flags;
  for (const side of ["green", "fossil"] as const) {
    const s = raw[side] as { overrides: Record<string, unknown> };
    if (s.overrides.fuelTonnesPerVesselYear != null) {
      throw new Error(
        `sweep baseline: ${side}.overrides.fuelTonnesPerVesselYear must be null — ` +
          "a frozen burn makes corridor length measure 0% and demotes it",
      );
    }
  }
  return raw as unknown;
})();

/** A sweepable parameter: a path setter + its plausible [low, high] range. */
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
}

// Plausible ranges: workbook-informed planning bands. Overrides go through the
// scenario's own override fields, so the sweep exercises the same resolution
// path the UI will.
const PARAMS: Param[] = [
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
  { id: "vessel.fossil.capexUsdM", label: "Fossil vessel CAPEX ($m)", step: 2, low: 15, high: 100, set: (s, v) => { s.vessel.fossil.capexUsdMPerShip = v; } },
  { id: "vessel.fossil.opexUsdMPerYear", label: "Fossil vessel OPEX ($m/yr)", step: 2, low: 0.8, high: 5, set: (s, v) => { s.vessel.fossil.opexUsdMPerShipPerYear = v; } },
  { id: "green.combustionEf", label: "Green combustion EF (tCO2/t)", step: 3, low: 0, high: 1, set: (s, v) => { s.green.overrides.combustionEfTco2PerTonne = v; } },
  { id: "green.lhvMjPerTonne", label: "Green energy density, LHV (MJ/t)", step: 3, low: 16000, high: 21000, set: (s, v) => { s.green.overrides.lhvMjPerTonne = v; } },
  { id: "fossil.fuelTonnesPerVesselYear", label: "Fossil fuel consumption (t/vessel/yr)", step: 3, low: 1300, high: 5200, set: (s, v) => { s.fossil.overrides.fuelTonnesPerVesselYear = v; } },
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
  { id: "fossil.sulphurPercent", label: "Fossil sulphur content (% S, IMO accounting)", step: 3, low: 0.1, high: 3, set: (s, v) => { s.regulation.emissions = { framework: "imo" }; s.fossil.emissions = { ...{ certifiedWttGco2ePerMj: null, n2oScenarioId: null, pilotShare: null, pilotFuelId: null, engineType: null, sulphurPercent: null, efficiencyRatio: null }, sulphurPercent: v }; } },
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
const KPIS = [
  { id: "gapPvUsdM", label: "Cost gap (PV $m)" },
  { id: "costPerUnitUsd", label: "$ per cargo unit" },
  { id: "costPerTonneCo2Usd", label: "$ per tCO2 abated" },
  { id: "greenTotalPvUsdM", label: "Green total (PV $m)" },
  { id: "fossilTotalPvUsdM", label: "Fossil total (PV $m)" },
  { id: "co2AbatedTonnes", label: "Lifetime CO2 abated (t)" },
] as const;
type KpiId = (typeof KPIS)[number]["id"];

type KpiVector = Record<KpiId, number>;

function kpisFor(mutate?: (s: ScenarioInput) => void): KpiVector {
  // The fixture is frozen at v1 — the migration registry brings it to current.
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

function main(): void {
  const checkMode = process.argv.includes("--check");
  const base = kpisFor();

  /** Relative movement of every KPI between a param's sampled settings. */
  const movementOf = (samples: KpiVector[]) => {
    const per = {} as Record<KpiId, number>;
    for (const { id } of KPIS) {
      const b = base[id];
      let worst = 0;
      for (const v of samples) {
        // Relative to the BASELINE value of that KPI, so KPIs on wildly
        // different scales ($m vs tonnes vs $/t) compare on equal terms.
        const rel = b === 0 ? (v[id] === 0 ? 0 : Infinity) : Math.abs((v[id] - b) / b);
        if (Number.isFinite(rel) && rel > worst) worst = rel;
      }
      per[id] = worst;
    }
    return per;
  };

  const rows = PARAMS.map((p) => {
    // Numeric params sample their endpoints; enum params sample every
    // defined option, so a categorical driver can rank instead of being
    // skipped as "—".
    const samples = p.options
      ? p.options.map((o) => kpisFor((s) => p.setOption!(s, o)))
      : [kpisFor((s) => p.set!(s, p.low!)), kpisFor((s) => p.set!(s, p.high!))];
    const per = movementOf(samples);
    // Placement comes from the MAX across KPIs; the KPI that produced it is
    // recorded so a field's prominence is traceable to the output it moves.
    let binding: KpiId = "gapPvUsdM";
    for (const { id } of KPIS) if (per[id] > per[binding]) binding = id;
    const gapSamples = samples.map((v) => v.gapPvUsdM);
    return {
      id: p.id,
      label: p.label,
      step: p.step,
      range: p.options ? p.options : ([p.low, p.high] as const),
      // Gap columns kept for continuity — §20's primary ranking is still
      // the gap, so the historical figures stay comparable.
      gapAtLow: gapSamples[0]!,
      gapAtHigh: gapSamples[gapSamples.length - 1]!,
      maxAbsDeltaUsdM: Math.max(
        ...gapSamples.map((g) => Math.abs(g - base.gapPvUsdM)),
      ),
      relHeadlineMovement: per.gapPvUsdM,
      /** Per-KPI relative movement, and the one that binds placement. */
      movementByKpi: per,
      bindingKpi: binding,
      maxRelMovement: per[binding],
    };
  }).sort((a, b) => b.maxAbsDeltaUsdM - a.maxAbsDeltaUsdM);

  // UI prominence is computed over the FROZEN ui-flagged subset only — the
  // docs-only extension must never move a field in the interface.
  const uiIds = new Set(PARAMS.filter((p) => p.ui).map((p) => p.id));
  const uiRows = rows.filter((r) => uiIds.has(r.id));
  // Placement from the MAX across KPIs, not the gap alone: a field that
  // barely moves the gap but drives $/cargo unit or $/tCO2 is a top-level
  // field, and was previously buried in advanced.
  const topLevel = uiRows
    .filter((r) => r.maxRelMovement >= TOP_LEVEL_THRESHOLD)
    .map((r) => r.id);
  const advanced = uiRows
    .filter((r) => r.maxRelMovement < TOP_LEVEL_THRESHOLD)
    .map((r) => r.id);

  if (checkMode) {
    if (!existsSync(MANIFEST_PATH)) {
      console.error("ui-manifest.json missing — run: npx tsx scripts/corridor/sensitivity.ts");
      process.exitCode = 1;
      return;
    }
    const committed = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as {
      topLevel: string[];
    };
    const want = new Set(topLevel);
    const have = new Set(committed.topLevel);
    const missing = topLevel.filter((id) => !have.has(id));
    const stale = committed.topLevel.filter((id) => !want.has(id));
    if (missing.length || stale.length) {
      console.error(
        "SENSITIVITY DRIFT: the model's top-level input set changed — the UI manifest must track the model.\n" +
          (missing.length ? `  now ≥5% but not in manifest: ${missing.join(", ")}\n` : "") +
          (stale.length ? `  in manifest but now <5%:     ${stale.join(", ")}\n` : "") +
          "Regenerate + review: npx tsx scripts/corridor/sensitivity.ts",
      );
      process.exitCode = 1;
      return;
    }
    console.log(`sensitivity check OK: ${topLevel.length} top-level params unchanged`);
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    SENS_PATH,
    JSON.stringify(
      {
        baseline: "excel-baseline",
        refBundleId: bundle.bundleId,
        baseGapPvUsdM: base.gapPvUsdM,
        baseKpis: base,
        kpis: KPIS,
        topLevelThreshold: TOP_LEVEL_THRESHOLD,
        ranked: rows,
      },
      null,
      1,
    ) + "\n",
  );
  writeFileSync(
    MANIFEST_PATH,
    JSON.stringify(
      {
        generatedFrom: "sensitivity.json",
        note: "Field prominence for the corridor UI: topLevel ≥5% headline movement among the ui-flagged sweep params, rest advanced. Docs-only sweep params never enter this file. CI (--check) fails when this drifts from the model.",
        topLevel,
        advanced,
      },
      null,
      1,
    ) + "\n",
  );
  console.log(`base gap ${base.gapPvUsdM.toFixed(3)} $m · ${rows.length} params swept`);
  console.log(`top-level (${topLevel.length}): ${topLevel.join(", ")}`);
  console.log(`wrote data/corridor-sensitivity/{sensitivity,ui-manifest}.json`);
}

main();
