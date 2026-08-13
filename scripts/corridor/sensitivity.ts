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
const baseRaw = JSON.parse(
  readFileSync(new URL("fixtures/golden/corridor/excel-baseline.input.json", ROOT), "utf8"),
) as unknown;

/** A sweepable parameter: a path setter + its plausible [low, high] range. */
interface Param {
  id: string;
  label: string;
  step: 1 | 2 | 3 | 4 | 5; // wizard step (Cargo/Vessel/Fuel/Port/Regulation)
  low: number;
  high: number;
  /**
   * Part of the FROZEN UI prominence contract: only ui-flagged params feed
   * ui-manifest.json (top-level vs advanced) and the --check gate. The
   * docs-only params below rank in sensitivity.json without moving a single
   * field in the interface (user decision 2026-08-13: docs only, freeze UI).
   */
  ui?: boolean;
  set: (s: ScenarioInput, v: number) => void;
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
  { id: "vessel.green.capexUsdM", label: "Green vessel CAPEX ($m)", step: 2, low: 15, high: 120, ui: true, set: (s, v) => { s.vessel.green.capexUsdM = v; } },
  { id: "vessel.green.opexUsdMPerYear", label: "Green vessel OPEX ($m/yr)", step: 2, low: 0.8, high: 6, ui: true, set: (s, v) => { s.vessel.green.opexUsdMPerYear = v; } },
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
  { id: "vessel.fossil.capexUsdM", label: "Fossil vessel CAPEX ($m)", step: 2, low: 15, high: 100, set: (s, v) => { s.vessel.fossil.capexUsdM = v; } },
  { id: "vessel.fossil.opexUsdMPerYear", label: "Fossil vessel OPEX ($m/yr)", step: 2, low: 0.8, high: 5, set: (s, v) => { s.vessel.fossil.opexUsdMPerYear = v; } },
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
  { id: "financing.baseRate", label: "Base cost of debt (module on, green 6%)", step: 5, low: 0.05, high: 0.11, set: (s, v) => { s.financing = { enabled: true, greenRate: 0.06, baseRate: v, debtShare: 1, tenorYears: 15, structure: "amortizing" }; } },
  { id: "financing.debtShare", label: "Debt share of green CAPEX (module on)", step: 5, low: 0, high: 1, set: (s, v) => { s.financing = { enabled: true, greenRate: 0.06, baseRate: 0.08, debtShare: v, tenorYears: 15, structure: "amortizing" }; } },
  { id: "financing.tenorYears", label: "Loan tenor (yr, module on)", step: 5, low: 5, high: 25, set: (s, v) => { s.financing = { enabled: true, greenRate: 0.06, baseRate: 0.08, debtShare: 1, tenorYears: Math.round(v), structure: "amortizing" }; } },
];

function gapFor(mutate?: (s: ScenarioInput) => void): number {
  // The fixture is frozen at v1 — the migration registry brings it to current.
  const input = migrateScenarioInput(JSON.parse(JSON.stringify(baseRaw))).input;
  mutate?.(input);
  return evaluateScenario(resolveScenario(input, bundle)).summary.gapPvUsdM;
}

function main(): void {
  const checkMode = process.argv.includes("--check");
  const baseGap = gapFor();

  const rows = PARAMS.map((p) => {
    const lowGap = gapFor((s) => p.set(s, p.low));
    const highGap = gapFor((s) => p.set(s, p.high));
    const maxAbsDelta = Math.max(Math.abs(lowGap - baseGap), Math.abs(highGap - baseGap));
    return {
      id: p.id,
      label: p.label,
      step: p.step,
      range: [p.low, p.high] as const,
      gapAtLow: lowGap,
      gapAtHigh: highGap,
      maxAbsDeltaUsdM: maxAbsDelta,
      relHeadlineMovement: maxAbsDelta / Math.abs(baseGap),
    };
  }).sort((a, b) => b.maxAbsDeltaUsdM - a.maxAbsDeltaUsdM);

  // UI prominence is computed over the FROZEN ui-flagged subset only — the
  // docs-only extension must never move a field in the interface.
  const uiIds = new Set(PARAMS.filter((p) => p.ui).map((p) => p.id));
  const uiRows = rows.filter((r) => uiIds.has(r.id));
  const topLevel = uiRows
    .filter((r) => r.relHeadlineMovement >= TOP_LEVEL_THRESHOLD)
    .map((r) => r.id);
  const advanced = uiRows
    .filter((r) => r.relHeadlineMovement < TOP_LEVEL_THRESHOLD)
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
        baseGapPvUsdM: baseGap,
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
  console.log(`base gap ${baseGap.toFixed(3)} $m · ${rows.length} params swept`);
  console.log(`top-level (${topLevel.length}): ${topLevel.join(", ")}`);
  console.log(`wrote data/corridor-sensitivity/{sensitivity,ui-manifest}.json`);
}

main();
