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

/**
 * `vesselType.fuelTonnesPerYear` as published in bundle
 * 2026-07-30-excel-v1, frozen here for the v6→v7 migration.
 *
 * The field is retired from the schema by that migration, but a
 * `vessel-benchmark` scenario was burning these exact figures and the burn
 * must survive unchanged. A migration cannot load a reference bundle (it is
 * pure, and the bundle is resolved at runtime by id), and it should not
 * depend on one anyway: pinning the values here keeps a decade-old payload
 * migrating to the same numbers even if a future bundle revises the table.
 */
const VESSEL_BENCHMARK_TONNES: Record<string, number> = {
  "tanker-35k": 2400,
  "tanker-80k": 5200,
  "bulk-60k": 3000,
  "container-5k": 6500,
  "container-15k": 14000,
  "roro-ferry": 3500,
  "handymax-bulk-58k": 2638,
};

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
  // v4 -> v5: the project archetype (realism pass). Purely additive - the
  // field is optional and an absent archetype reads as the historical
  // behaviour (foak 1.0, i.e. noak-merchant), so v4 scenarios reproduce
  // their numbers exactly. Only the version literal moves.
  4: (raw) => {
    const next = JSON.parse(JSON.stringify(raw)) as RawScenario;
    next.schemaVersion = 5;
    return next;
  },
  // v5 -> v6: THE EMISSION-METHOD REPLACEMENT — deliberately
  // behaviour-changing, unlike every migration before it. Injecting
  // `regulation.emissions` switches factor resolution from the workbook's
  // flat scalars to values derived from the fuel-emissions dataset
  // (framework default "fueleu"): saved scenarios AUTO-UPGRADE on open,
  // per the recorded product decision. Explicit factor overrides still
  // win, so a scenario that pinned its numbers keeps them; benchmark-path
  // scenarios move to the refined values. Tests exercising the legacy
  // workbook path delete the injected block (the Excel golden's gate).
  5: (raw) => {
    const next = JSON.parse(JSON.stringify(raw)) as RawScenario;
    const reg = (next.regulation ?? {}) as Record<string, unknown>;
    if (reg.emissions == null) reg.emissions = { framework: "fueleu" };
    next.regulation = reg;
    next.schemaVersion = 6;
    return next;
  },
  // v6 -> v7: the derived-value layer. TWO concerns, one version bump,
  // applied in this order because the second reads `cargo.vessels` and the
  // first does not touch it.
  //
  // NUMERICALLY IDENTICAL BY CONSTRUCTION. Every scenario recomputes to the
  // same numbers after migration; the test asserts that at 1e-9 over the
  // maximal fixture and every stored scenario. If a number moves, this
  // migration is wrong — not the tolerance.
  //
  // 1. CONSUMPTION MODE removed. `vessel-benchmark` scenarios were burning
  //    the vessel table's flat annual tonnage; that value is frozen into
  //    `overrides.fuelTonnesPerVesselYear` so the burn survives exactly, now
  //    as an explicit override with a visible badge and a derived benchmark
  //    beneath it. `distance` scenarios were already on the derived chain,
  //    so the field is simply dropped. An override that was ALREADY set won
  //    under both modes and is left untouched.
  //
  // 2. VESSEL COSTS become per-ship. Stored fleet totals divide by
  //    `cargo.vessels`; the engine multiplies back. `null` stays `null` — it
  //    means "use the benchmark", and the benchmark was always per-ship, so
  //    a null is precisely the case this change FIXES rather than preserves.
  6: (raw) => {
    const next = JSON.parse(JSON.stringify(raw)) as RawScenario;

    // --- 1. consumption mode ------------------------------------------------
    const vessel = (next.vessel ?? {}) as Record<string, unknown>;
    if (vessel.consumptionMode === "vessel-benchmark") {
      // Freeze what this scenario was ACTUALLY burning. A migration must be
      // pure (no bundle load), so the flat tonnages are inlined above — they
      // are immutable published data, and pinning them here is what makes
      // the migration reproducible years from now even if a future bundle
      // revises the table. An override that was already set governed under
      // both modes, so it is left exactly as it is.
      const typeId = typeof vessel.typeId === "string" ? vessel.typeId : "";
      const flat = VESSEL_BENCHMARK_TONNES[typeId];
      let froze = false;
      for (const key of ["green", "fossil"] as const) {
        const side = (next[key] ?? {}) as Record<string, unknown>;
        const ov = (side.overrides ?? {}) as Record<string, unknown>;
        if (ov.fuelTonnesPerVesselYear == null) {
          if (flat === undefined) {
            throw new Error(
              `cannot migrate vessel-benchmark scenario: unknown vessel type "${typeId}". ` +
                "Its annual tonnage is needed to preserve the burn exactly.",
            );
          }
          ov.fuelTonnesPerVesselYear = flat;
          side.overrides = ov;
          next[key] = side;
          froze = true;
        }
      }
      // Surfaced on load (like the v3/v4 notes): these users were running a
      // burn that reconciles with nothing else in the model, and should see
      // the frozen value against the distance-derived benchmark it now sits
      // beside — plus the energy-parity ratio where the two sides diverge.
      if (froze) {
        const flags = (next.flags ?? {}) as Record<string, unknown>;
        flags.migratedVesselBenchmarkBurn = true;
        next.flags = flags;
      }
    }
    delete vessel.consumptionMode;

    // --- 2. vessel cost dimension -------------------------------------------
    const cargo = (next.cargo ?? {}) as Record<string, unknown>;
    const vesselsRaw = cargo.vessels;
    // Guard: a zero or absent count would divide a real cost to Infinity.
    // Treat it as 1 — the fleet total IS the per-ship figure when there is
    // no fleet to divide by, and validation rejects vessels < 1 anyway.
    const vessels =
      typeof vesselsRaw === "number" && Number.isFinite(vesselsRaw) && vesselsRaw > 0
        ? vesselsRaw
        : 1;
    for (const key of ["green", "fossil"] as const) {
      const side = (vessel[key] ?? {}) as Record<string, unknown>;
      const capex = side.capexUsdM;
      const opex = side.opexUsdMPerYear;
      side.capexUsdMPerShip =
        typeof capex === "number" && Number.isFinite(capex) ? capex / vessels : null;
      side.opexUsdMPerShipPerYear =
        typeof opex === "number" && Number.isFinite(opex) ? opex / vessels : null;
      delete side.capexUsdM;
      delete side.opexUsdMPerYear;
      vessel[key] = side;
    }
    next.vessel = vessel;

    next.schemaVersion = 7;
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
