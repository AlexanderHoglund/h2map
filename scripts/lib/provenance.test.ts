import { describe, expect, it } from "vitest";
import { sourceLabel } from "../../apps/web/lib/corridor/provenance";

/**
 * Source notes shown to the user must not carry the data's internals:
 * spreadsheet cells, dataset-version prefixes, quality-tier codes. The
 * sanitizer keeps whatever human sentence remains and returns undefined
 * when nothing does (the caller then falls back to a plain label).
 */
describe("sourceLabel strips internals, keeps sentences", () => {
  it("a bare spreadsheet cell yields nothing", () => {
    expect(sourceLabel("Data_tables!B17")).toBeUndefined();
  });

  it("keeps the vessel note's physics, drops version and tier codes", () => {
    expect(
      sourceLabel("2026-08-17-vessel-v3: B: EEDI reference line (bulk) x k=0.832; CAPEX A, OPEX A"),
    ).toBe("EEDI reference line (bulk) x k=0.832");
  });

  it("keeps the country caveat, drops the parenthesised cell", () => {
    expect(
      sourceLabel(
        "Illustrative country risk-premium benchmarks, not a verified source - replace with your own project finance / country-risk data. (Data_tables!B33)",
      ),
    ).toBe(
      "Illustrative country risk-premium benchmarks, not a verified source - replace with your own project finance / country-risk data.",
    );
  });

  it("drops tier tags like [S]", () => {
    expect(sourceLabel("study default [S]")).toBe("study default");
  });

  it("handles absence", () => {
    expect(sourceLabel(undefined)).toBeUndefined();
    expect(sourceLabel("")).toBeUndefined();
  });
});
