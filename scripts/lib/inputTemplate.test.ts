import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  fromCompleteScenarioJson,
  migrateScenarioInput,
  parseRefBundle,
  resolveScenario,
  SCHEMA_VERSION,
} from "@h2map/corridor-schema";
import { evaluateScenario } from "@h2map/corridor-engine";
import { ROOT } from "./serviceDeps";

/**
 * The published input template is a CONTRACT with desk researchers and with
 * models writing scenario files. If it stops importing, every reader
 * following it produces a rejected file — and they have no way to tell it is
 * the template's fault rather than theirs. So the template is generated
 * (never hand-written) and these tests keep it honest.
 */

const md = readFileSync(`${ROOT}docs/corridor/input-template.md`, "utf8");
const templateJson = (): unknown => {
  const block = md.split("```json")[1]?.split("```")[0];
  if (!block) throw new Error("no ```json block in input-template.md");
  return JSON.parse(block) as unknown;
};

/**
 * The bundle the TEMPLATE pins, not a hardcoded one — resolution rejects a
 * mismatch outright, so pinning a bundle here would just mean this test
 * fails whenever the template is regenerated against a newer catalogue.
 */
const bundle = parseRefBundle(
  JSON.parse(
    readFileSync(
      `${ROOT}data/corridor-ref/${
        (templateJson() as { refBundleId: string }).refBundleId
      }.json`,
      "utf8",
    ),
  ),
);

describe("the published input template", () => {
  it("is valid JSON and imports without edits", () => {
    const input = migrateScenarioInput(
      fromCompleteScenarioJson(templateJson()),
    ).input;
    expect(input.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("computes a complete scenario as shipped", () => {
    // "Copy this and fill it in" has to mean it already works — a template
    // that needs undocumented edits before it runs is not a template.
    const input = migrateScenarioInput(
      fromCompleteScenarioJson(templateJson()),
    ).input;
    const r = evaluateScenario(resolveScenario(input, bundle));
    expect(Number.isFinite(r.summary.gapPvUsdM)).toBe(true);
    expect(Number.isFinite(r.summary.costPerUnitUsd)).toBe(true);
    expect(r.summary.co2AbatedTonnes).toBeGreaterThan(0);
  });

  it("demonstrates the derived chain: energy parity is exactly 1.000", () => {
    // A blank template must show distance driving the result, not a frozen
    // burn — that is the whole point of shipping it with null overrides.
    const input = migrateScenarioInput(
      fromCompleteScenarioJson(templateJson()),
    ).input;
    expect(input.green.overrides.fuelTonnesPerVesselYear).toBeNull();
    expect(input.fossil.overrides.fuelTonnesPerVesselYear).toBeNull();
    const r = evaluateScenario(resolveScenario(input, bundle));
    expect(r.energyParity.ratio).toBeCloseTo(1, 12);
    expect(r.energyParity.diverged).toBe(false);
  });

  it("states the CURRENT schema version in its prose", () => {
    // A template advertising a stale version sends the reader to write a
    // payload the importer will migrate or reject.
    expect(md).toContain(`Schema version **${SCHEMA_VERSION}**`);
  });

  it("documents every id vocabulary the schema will reject you for", () => {
    // An unknown id is a hard error with no fallback, so the legal values
    // must be in the document, not in the reader's head.
    for (const v of bundle.vesselTypes) expect(md).toContain(`\`${v.id}\``);
    for (const f of bundle.fuels) expect(md).toContain(`\`${f.id}\``);
    for (const c of bundle.countries) expect(md).toContain(`\`${c.id}\``);
  });

  it("carries no retired v6 field", () => {
    // The template is the thing people copy. A retired field surviving here
    // would be reproduced across every researched scenario.
    for (const gone of [
      "consumptionMode",
      "capexUsdM\"",
      "opexUsdMPerYear\"",
    ]) {
      expect(md.includes(gone), `retired field in template: ${gone}`).toBe(false);
    }
  });
});

describe("the template warns about the failure mode that is silent", () => {
  it("says an unknown key is ignored rather than rejected", () => {
    // Measured: fromCompleteScenarioJson accepts unknown keys and drops
    // them. A researcher who misspells a field gets a clean import and a
    // silently unchanged model, so the document must say so explicitly —
    // this test fails if that warning is ever softened away.
    expect(md).toMatch(/unknown key is SILENTLY IGNORED/i);
  });

  it("does not claim unknown keys are rejected", () => {
    expect(md).not.toMatch(/[Uu]nknown keys are rejected/);
  });
});
