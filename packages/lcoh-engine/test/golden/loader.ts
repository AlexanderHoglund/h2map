import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { LCOHInputs, ResourceProfiles } from "../../src/types";

const CASES_DIR = fileURLToPath(new URL("./cases/", import.meta.url));
const SPIKE_DIR = fileURLToPath(
  new URL("../../../../data/spike/", import.meta.url),
);

interface ProfileRef {
  site: string;
  file: string;
  series: "pvCf" | "windCf";
}

export interface GoldenCase {
  name: string;
  inputs: LCOHInputs;
  profiles: ResourceProfiles;
}

interface GoldenInputFile {
  inputs: LCOHInputs;
  profiles: { pv?: ProfileRef; wind?: ProfileRef };
}

/** Load a spike output series, mapping data gaps (null) to 0 CF. */
function loadSpikeSeries(ref: ProfileRef): number[] {
  const raw = JSON.parse(
    readFileSync(join(SPIKE_DIR, ref.site, ref.file), "utf8"),
  ) as { hourly: Record<string, (number | null)[]> };
  const series = raw.hourly[ref.series];
  if (!series) {
    throw new Error(`${ref.site}/${ref.file} has no ${ref.series} series`);
  }
  return series.map((v) => v ?? 0);
}

export function caseNames(): string[] {
  return readdirSync(CASES_DIR)
    .filter((f) => f.endsWith(".input.json"))
    .map((f) => f.replace(/\.input\.json$/, ""))
    .sort();
}

export function loadCase(name: string): GoldenCase {
  const spec = JSON.parse(
    readFileSync(join(CASES_DIR, `${name}.input.json`), "utf8"),
  ) as GoldenInputFile;
  const profiles: ResourceProfiles = {};
  if (spec.profiles.pv) profiles.pv = loadSpikeSeries(spec.profiles.pv);
  if (spec.profiles.wind) profiles.wind = loadSpikeSeries(spec.profiles.wind);
  return { name, inputs: spec.inputs, profiles };
}

export function expectedPath(name: string): string {
  return join(CASES_DIR, `${name}.expected.json`);
}

/**
 * Recursive numeric comparison at relative tolerance 1e-12 — survives
 * legitimate refactors of floating-point association order while catching
 * real numeric drift. Non-numbers compare strictly.
 */
export function diffValues(
  actual: unknown,
  expected: unknown,
  path = "$",
  relTol = 1e-12,
): string[] {
  if (typeof actual === "number" && typeof expected === "number") {
    const denom = Math.max(Math.abs(expected), Math.abs(actual), 1e-300);
    if (
      actual !== expected &&
      Math.abs(actual - expected) / denom > relTol
    ) {
      return [`${path}: ${actual} != ${expected}`];
    }
    return [];
  }
  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) {
      return [`${path}: length ${actual.length} != ${expected.length}`];
    }
    return actual.flatMap((v, i) =>
      diffValues(v, expected[i], `${path}[${i}]`, relTol),
    );
  }
  if (
    actual !== null &&
    expected !== null &&
    typeof actual === "object" &&
    typeof expected === "object"
  ) {
    const aKeys = Object.keys(actual as object).sort();
    const eKeys = Object.keys(expected as object).sort();
    if (aKeys.join(",") !== eKeys.join(",")) {
      return [`${path}: keys [${aKeys}] != [${eKeys}]`];
    }
    return aKeys.flatMap((k) =>
      diffValues(
        (actual as Record<string, unknown>)[k],
        (expected as Record<string, unknown>)[k],
        `${path}.${k}`,
        relTol,
      ),
    );
  }
  return actual === expected ? [] : [`${path}: ${String(actual)} != ${String(expected)}`];
}
