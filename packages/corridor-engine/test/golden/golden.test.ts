/**
 * The Phase-0 gate: the engine must reproduce the workbook's cached values
 * exactly (1e-9 relative) from the raw fixture scenario — resolution layer
 * included, since every fixture override is null.
 */

import { describe, expect, it } from "vitest";
import {
  migrateScenarioInput,
  parseRefBundle,
  resolveScenario,
} from "@h2map/corridor-schema";
import { evaluateScenario } from "../../src/index";
import { diffValues, loadFixtureJson, loadRefBundleJson } from "./loader";

interface ExpectedFile {
  source: unknown; // transcription metadata — not an engine output
  summary: Record<string, number>;
  intermediates: Record<string, number>;
  perYear: Record<string, unknown>;
}

describe("golden: excel-baseline", () => {
  // The frozen v1 fixture loads through the migration registry (4.1).
  const input = migrateScenarioInput(loadFixtureJson("excel-baseline.input.json")).input;
  const bundle = parseRefBundle(loadRefBundleJson(input.refBundleId));
  const expected = loadFixtureJson("excel-baseline.expected.json") as ExpectedFile;

  // JSON round-trip so the comparison covers exactly what a client would see.
  const result = JSON.parse(
    JSON.stringify(evaluateScenario(resolveScenario(input, bundle))),
  ) as { summary: unknown; intermediates: unknown; perYear: unknown };

  it("reproduces every summary metric (1e-9 relative)", () => {
    expect(diffValues(result.summary, expected.summary, "$.summary")).toEqual([]);
  });

  it("reproduces the resolved intermediates", () => {
    expect(
      diffValues(result.intermediates, expected.intermediates, "$.intermediates"),
    ).toEqual([]);
  });

  it("reproduces all 20 per-year rows for both sides + CO2", () => {
    expect(diffValues(result.perYear, expected.perYear, "$.perYear")).toEqual([]);
  });

  it("hits the structurally-exact anchors bit-for-bit", () => {
    const summary = result.summary as Record<string, number>;
    // Year-1 discount factor is exactly 1 → green CAPEX PV is exactly
    // 55+12+5+25 = 97 (integer arithmetic, no tolerance needed).
    expect(summary.greenCapexPvUsdM).toBe(97);
    // Green e-ammonia (WTW 15) is always FuelEU-compliant → exactly 0 via
    // the deficit clamp.
    expect(summary.fuelEuGreenPvUsdM).toBe(0);
  });
});
