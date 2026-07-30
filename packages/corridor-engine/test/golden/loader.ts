/**
 * Corridor golden-fixture loader. Fixtures live at the repo root
 * (`fixtures/golden/corridor/`, the build-plan location); this loader reaches
 * them relatively, the same way the lcoh loader reaches `data/spike/`.
 *
 * Deliberately NO regeneration script here (unlike lcoh's golden:update):
 * expected values come from the workbook's cached values via
 * `scripts/corridor/transcribe.py` — regenerating them from the engine would
 * make the fixture test the engine against itself.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURES_DIR = fileURLToPath(
  new URL("../../../../fixtures/golden/corridor/", import.meta.url),
);
const REF_DIR = fileURLToPath(new URL("../../../../data/corridor-ref/", import.meta.url));

export function loadFixtureJson(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf8"));
}

export function loadRefBundleJson(bundleId: string): unknown {
  return JSON.parse(readFileSync(join(REF_DIR, `${bundleId}.json`), "utf8"));
}

/**
 * Recursive numeric comparison at relative tolerance 1e-9 (corridor spec —
 * lcoh uses 1e-12). Survives legitimate refactors of floating-point
 * association order while catching real numeric drift; non-numbers compare
 * strictly.
 */
export function diffValues(
  actual: unknown,
  expected: unknown,
  path = "$",
  relTol = 1e-9,
): string[] {
  if (typeof actual === "number" && typeof expected === "number") {
    const denom = Math.max(Math.abs(expected), Math.abs(actual), 1e-300);
    if (actual !== expected && Math.abs(actual - expected) / denom > relTol) {
      return [`${path}: ${actual} != ${expected}`];
    }
    return [];
  }
  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) {
      return [`${path}: length ${actual.length} != ${expected.length}`];
    }
    return actual.flatMap((v, i) => diffValues(v, expected[i], `${path}[${i}]`, relTol));
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
