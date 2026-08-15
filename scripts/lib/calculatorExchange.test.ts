import { describe, expect, it } from "vitest";
import {
  buildExchangeFile,
  EXCHANGE_VERSION,
  exchangeInputsSchema,
  parseExchangeFile,
} from "../../apps/web/components/calculator/exchange";
import {
  CALCULATOR_DEFAULTS,
  type CalculatorValues,
} from "../../apps/web/components/calculator/schema";

/**
 * The exchange format's job is that a file can be re-run. The old export
 * wrote results with no inputs, so it could not be — and nothing failed,
 * because nothing checked. These tests check.
 */

const AT = new Date("2026-08-15T12:00:00.000Z");

/** A scenario that differs from defaults in EVERY section. */
function editedValues(): CalculatorValues {
  return {
    location: { lat: -9.1, lon: 124.7, country: "ID" },
    general: {
      lifetimeYears: 25,
      discountRatePct: 6.73,
      waterPriceUsdPerM3: 1.21,
      waterTransportUsdPerM3Per100Km: 0.12,
      waterTransportDistanceKm: 40,
      waterDesalinated: true,
      waterPumpingHeadM: 120,
    },
    electrolyzer: {
      capacityMw: 150,
      efficiencyPct: 62,
      capexUsdPerKw: 1950,
      opexPctPerYear: 2,
      stackLifetimeHours: 75_000,
      stackReplacementPct: 15,
      degradationPctPerYear: 0.8,
    },
    pv: {
      enabled: true,
      capacityMw: 220,
      coupled: false,
      kind: "pv_1axis",
      pricingMode: "capex",
      lcoeUsdPerMwh: 28,
      capexUsdPerKw: 691,
      opexPctPerYear: 1.5,
    },
    wind: {
      enabled: false,
      capacityMw: 80,
      coupled: true,
      kind: "wind_160",
      pricingMode: "lcoe",
      lcoeUsdPerMwh: 33,
      capexUsdPerKw: 1041,
      opexPctPerYear: 2.5,
    },
    grid: {
      enabled: true,
      priceUsdPerMwh: 62.9,
      maxImportMw: 40,
      coupled: false,
      emissionFactorTco2PerMwh: 0.68,
    },
  };
}

describe("export/import round trip", () => {
  it("returns every input field unchanged", () => {
    const values = editedValues();
    const file = buildExchangeFile(values, null, null, AT);
    const back = parseExchangeFile(JSON.stringify(file));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    // Deep equality across the whole form — not a spot check, because the
    // failure mode is a single field quietly not surviving the trip.
    expect(back.values).toEqual(values);
  });

  it("round-trips the defaults too", () => {
    const file = buildExchangeFile(CALCULATOR_DEFAULTS, null, null, AT);
    const back = parseExchangeFile(JSON.stringify(file));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.values).toEqual(CALCULATOR_DEFAULTS);
  });

  it("survives a JSON.stringify/parse cycle with formatting", () => {
    const values = editedValues();
    const file = buildExchangeFile(values, null, null, AT);
    const back = parseExchangeFile(JSON.stringify(file, null, 2));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.values).toEqual(values);
  });
});

describe("the exchange schema tracks the form", () => {
  it("accepts exactly the form's current shape", () => {
    // Guards BOTH directions of drift. A field added to the form but not to
    // the exchange schema fails here (unknown key, because the schema is
    // strict); a field removed from the form but left in the schema fails
    // too (missing key). Either way the export stops silently losing data.
    const parsed = exchangeInputsSchema.safeParse(CALCULATOR_DEFAULTS);
    if (!parsed.success) {
      throw new Error(
        `exchange schema out of sync with CALCULATOR_DEFAULTS: ${JSON.stringify(
          parsed.error.issues,
          null,
          2,
        )}`,
      );
    }
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown field rather than dropping it", () => {
    const withExtra = {
      ...CALCULATOR_DEFAULTS,
      general: { ...CALCULATOR_DEFAULTS.general, madeUpField: 1 },
    };
    expect(exchangeInputsSchema.safeParse(withExtra).success).toBe(false);
  });

  it("rejects a missing field rather than defaulting it", () => {
    const partial = structuredClone(CALCULATOR_DEFAULTS) as Record<
      string,
      Record<string, unknown>
    >;
    delete partial.general!.discountRatePct;
    expect(exchangeInputsSchema.safeParse(partial).success).toBe(false);
  });
});

describe("provenance", () => {
  it("records which cost of capital governed, and on what basis", () => {
    const curated = buildExchangeFile(editedValues(), null, {
      iso2: "ID",
      curated: true,
      wacc_curated: 0.0673,
      wacc_suggestion: 0.1,
      grid_ef_tco2_mwh: 0.68,
      profile_version: "2026-08-15",
    } as never, AT);
    expect(curated.provenance.countryDefaults).toMatchObject({
      iso2: "ID",
      waccUsed: 0.0673,
      waccBasis: "curated-real",
    });

    const heuristic = buildExchangeFile(editedValues(), null, {
      iso2: "CL",
      curated: false,
      wacc_curated: null,
      wacc_suggestion: 0.08,
      grid_ef_tco2_mwh: 0.3,
      profile_version: null,
    } as never, AT);
    expect(heuristic.provenance.countryDefaults).toMatchObject({
      waccUsed: 0.08,
      waccBasis: "income-group-heuristic",
    });
  });

  it("exports a scenario that has not been run", () => {
    // Inputs-only is a legitimate file — a scenario to share or edit — and
    // it must import cleanly rather than being treated as corrupt.
    const file = buildExchangeFile(editedValues(), null, null, AT);
    expect(file.results).toBeUndefined();
    expect(parseExchangeFile(JSON.stringify(file)).ok).toBe(true);
  });
});

describe("import rejects what it cannot honour", () => {
  it("names the old results-only format specifically", () => {
    // The previous export. Telling the user "invalid JSON" would send them
    // hunting for a syntax error that is not there.
    const legacy = JSON.stringify({
      results: { lcohUsdPerKg: 9.12 },
      profiles: { pv: { hash: "abc" } },
    });
    const r = parseExchangeFile(legacy);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("legacyResultsOnly");
  });

  it("refuses a file from a newer exchange version", () => {
    const file = buildExchangeFile(editedValues(), null, null, AT);
    const newer = JSON.stringify({ ...file, version: EXCHANGE_VERSION + 1 });
    const r = parseExchangeFile(newer);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("newerVersion");
  });

  it("refuses malformed JSON", () => {
    const r = parseExchangeFile("{not json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("notJson");
  });

  it("refuses a file whose inputs are the wrong type", () => {
    const file = buildExchangeFile(editedValues(), null, null, AT) as unknown as {
      inputs: { general: { discountRatePct: unknown } };
    };
    file.inputs.general.discountRatePct = "six point seven";
    const r = parseExchangeFile(JSON.stringify(file));
    expect(r.ok).toBe(false);
  });
});
