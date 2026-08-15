/**
 * The curation rule — the first test this area has ever had.
 *
 * It exists because of a real failure mode: the scheduled ingest runs every
 * three hours against production, and before this rule it rewrote `source`
 * unconditionally and re-wrote every existing WACC. Storing researched
 * country data in that table without these guarantees would have meant
 * citations quietly disappearing on the next cron tick.
 */
import { describe, expect, it } from "vitest";
import {
  censusOf,
  mergeCountryRow,
  type ExistingCountryRow,
  type IngestedCountryRow,
} from "./mergeCountryRow";

const ingested: IngestedCountryRow = {
  iso2: "ID",
  grid_ef_tco2_mwh: 0.65,
  wacc_suggestion: 0.1,
  source: "Grid EF: OWID/Ember carbon intensity 2024; WACC: World Bank income-group heuristic",
  updated_at: "2026-08-15T00:00:00.000Z",
};

describe("mergeCountryRow", () => {
  it("a heuristic row takes every ingested field", () => {
    const merged = mergeCountryRow(ingested, undefined);
    expect(merged).toEqual(ingested);
  });

  it("an un-curated row's WACC tracks the heuristic again", () => {
    // The bug this replaces: the old ingest read the stored WACC back and
    // re-wrote it, so whatever the FIRST run produced froze forever and the
    // income-group heuristic could never correct itself.
    const stale: ExistingCountryRow = {
      iso2: "ID",
      curated: false,
      wacc_curated: null,
      grid_ef_tco2_mwh: 0.9,
    };
    expect(mergeCountryRow(ingested, stale).wacc_suggestion).toBe(0.1);
  });

  it("a curated row keeps its own `source`, and it is ECHOED not omitted", () => {
    const curated: ExistingCountryRow = {
      iso2: "ID",
      curated: true,
      wacc_curated: 0.113,
      grid_ef_tco2_mwh: 0.65,
      source: "Researched profile v1 — see profile_source",
    };
    const merged = mergeCountryRow(ingested, curated);
    // Echoed, NOT omitted. An upsert is an insert-with-conflict, so a
    // column absent from the payload is written as NULL rather than left
    // alone — measured against the live table, where omitting it blanked
    // the column on the first run.
    expect(merged.source).toBe("Researched profile v1 — see profile_source");
    expect(merged.source).not.toBe(ingested.source);
  });

  it("a curated row never has its curated fields overwritten", () => {
    const curated: ExistingCountryRow = {
      iso2: "ID",
      curated: true,
      wacc_curated: 0.113,
      grid_ef_tco2_mwh: 0.65,
    };
    const merged = mergeCountryRow(ingested, curated);
    // wacc_curated is not in the ingest's vocabulary at all — it cannot be
    // clobbered because it is never written here.
    expect("wacc_curated" in merged).toBe(false);
    // A pinned grid EF stays pinned.
    expect("grid_ef_tco2_mwh" in merged).toBe(false);
  });

  it("curation is per FIELD: a null curated field still refreshes", () => {
    // A profile may research the cost of capital and quite reasonably leave
    // the grid factor to OWID, which updates as the grid decarbonises.
    const partial: ExistingCountryRow = {
      iso2: "ID",
      curated: true,
      wacc_curated: 0.113,
      grid_ef_tco2_mwh: null,
    };
    const merged = mergeCountryRow(ingested, partial);
    expect(merged.grid_ef_tco2_mwh).toBe(0.65);
  });

  it("the heuristic WACC keeps refreshing beneath a curated one", () => {
    // So the comparison stays visible in the UI, and un-curating a country
    // does not leave it on a stale guess.
    const curated: ExistingCountryRow = {
      iso2: "ID",
      curated: true,
      wacc_curated: 0.113,
      grid_ef_tco2_mwh: 0.65,
    };
    expect(mergeCountryRow(ingested, curated).wacc_suggestion).toBe(0.1);
  });

  it("census counts curated vs heuristic rows", () => {
    const existing = new Map<string, ExistingCountryRow>([
      ["ID", { iso2: "ID", curated: true }],
      ["CL", { iso2: "CL", curated: false }],
    ]);
    const rows = [{ iso2: "ID" }, { iso2: "CL" }, { iso2: "KE" }];
    expect(censusOf(rows, existing)).toEqual({ curated: 1, heuristic: 2 });
  });
});
