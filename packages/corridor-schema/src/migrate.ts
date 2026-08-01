/**
 * Scenario schema migrations (build-plan 4.1).
 *
 * A saved scenario pins the schemaVersion it was written with; loading it
 * under a newer schema walks the registry version-by-version until current,
 * then validates. The registry is append-only: every released version bump
 * adds exactly one entry, and old payloads (including the FROZEN golden
 * fixture, which stays at its original version forever) keep loading.
 *
 * v1 → v2: `regulation.ira45z.rateUsdPerGallon` → `creditUsdPerGallon`
 * (a deliberate rename proving the machinery; value-preserving).
 */

import { SCHEMA_VERSION, type ScenarioInput } from "./scenario";
import { parseScenarioInput } from "./validate";

type RawScenario = Record<string, unknown>;
type Migration = (raw: RawScenario) => RawScenario;

const MIGRATIONS: Record<number, Migration> = {
  1: (raw) => {
    const next = JSON.parse(JSON.stringify(raw)) as RawScenario;
    const reg = next.regulation as { ira45z?: Record<string, unknown> } | undefined;
    if (reg?.ira45z && "rateUsdPerGallon" in reg.ira45z) {
      reg.ira45z.creditUsdPerGallon = reg.ira45z.rateUsdPerGallon;
      delete reg.ira45z.rateUsdPerGallon;
    }
    next.schemaVersion = 2;
    return next;
  },
  // v2 → v3: fuel-sourcing restructure (spec §1).
  // - `construct` → `build-plant`; the Excel double-count survives as
  //   flags.legacyExcelConstruct ONLY where it was actually live (a price
  //   row that charges something — override non-zero, or no override, i.e.
  //   the benchmark price). construct + price-override-0 was already clean
  //   build-plant economics and converts silently.
  // - v2 `build-here` is REJECTED: its calculation basis changed from a
  //   delivered price in OPEX to capital+operating. The scenarios table was
  //   verified EMPTY at the time of this change (2026-08-01) — no archival
  //   machinery for an empty set; see fixtures/golden/corridor/README.md.
  2: (raw) => {
    const next = JSON.parse(JSON.stringify(raw)) as RawScenario;
    let legacy = false;
    for (const key of ["green", "fossil"] as const) {
      const side = next[key] as
        | { sourcing?: string; overrides?: { priceUsdPerTonne?: number | null } }
        | undefined;
      if (!side) continue;
      if (side.sourcing === "build-here") {
        throw new Error(
          "schema-v2 build-here scenarios are not supported: the calculation " +
            "basis changed (delivered price → capital + operating); re-create " +
            "the site pick on the map",
        );
      }
      if (side.sourcing === "construct") {
        side.sourcing = "build-plant";
        // Double count live unless the price override is exactly 0.
        if (side.overrides?.priceUsdPerTonne !== 0) legacy = true;
      }
    }
    if (legacy) {
      const flags = (next.flags ?? {}) as Record<string, unknown>;
      flags.legacyExcelConstruct = true;
      next.flags = flags;
    }
    next.schemaVersion = 3;
    return next;
  },
  // v3 → v4: `named-plant` folded into `purchase`. The two were the same
  // arithmetic (price × tonnage, production lines zeroed) — only the
  // provenance of the price differed. The contract price survives as a
  // price override, so the numbers are identical after migration. The
  // `deliveredPriceUsdPerTonne` field is removed from the schema.
  3: (raw) => {
    const next = JSON.parse(JSON.stringify(raw)) as RawScenario;
    for (const key of ["green", "fossil"] as const) {
      const side = next[key] as
        | {
            sourcing?: string;
            deliveredPriceUsdPerTonne?: number | null;
            overrides?: { priceUsdPerTonne?: number | null };
          }
        | undefined;
      if (!side) continue;
      if (side.sourcing === "named-plant") {
        side.sourcing = "purchase";
        side.overrides = {
          ...side.overrides,
          priceUsdPerTonne: side.deliveredPriceUsdPerTonne ?? null,
        };
      }
      delete side.deliveredPriceUsdPerTonne;
    }
    next.schemaVersion = 4;
    return next;
  },
};

export interface MigratedScenario {
  input: ScenarioInput;
  /** The version the payload arrived at, when older than current (else null). */
  migratedFrom: number | null;
}

/**
 * Migrate an arbitrary saved payload to the CURRENT schema and validate it.
 * Throws on unknown/future versions or on validation failure — never a
 * silent partial load.
 */
export function migrateScenarioInput(raw: unknown): MigratedScenario {
  if (raw === null || typeof raw !== "object") {
    throw new Error("scenario payload must be an object");
  }
  let working = raw as RawScenario;
  const from = typeof working.schemaVersion === "number" ? working.schemaVersion : NaN;
  if (!Number.isInteger(from) || from < 1 || from > SCHEMA_VERSION) {
    throw new Error(
      `unsupported scenario schemaVersion ${String(working.schemaVersion)} (current: ${SCHEMA_VERSION})`,
    );
  }
  for (let v = from; v < SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`missing migration for schemaVersion ${v}`);
    working = step(working);
  }
  return {
    input: parseScenarioInput(working),
    migratedFrom: from < SCHEMA_VERSION ? from : null,
  };
}
