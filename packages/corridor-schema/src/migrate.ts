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
