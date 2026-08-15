import { z } from "zod";
import { CALCULATOR_DEFAULTS, type CalculatorValues } from "./schema";
import type { CountryDefaults, SimulateResponse } from "./types";

/**
 * The calculator's JSON exchange format: what leaves the app and what can
 * come back in.
 *
 * The previous export wrote `JSON.stringify(response)` — the API response
 * alone. That is results without inputs: it records an LCOH of 9.12 USD/kg
 * but not the capacities, costs, discount rate or water price that produced
 * it, so the file cannot be re-run, re-imported, or checked by a reader.
 * It also could not be told apart from a file produced by a different
 * engine version with different cost assumptions.
 *
 * So the envelope carries three things:
 *
 * - `inputs` — the complete form state, every field, in UI units. This is
 *   what makes the file reproducible and importable.
 * - `results` — the run's outputs, unchanged from the API response.
 * - `provenance` — engine version, schema version, export timestamp, the
 *   resolved resource profiles (provider, dataset version, cache hit) and
 *   the country defaults in force. Two files with identical inputs and
 *   different results are explained by this block.
 *
 * IMPORT ACCEPTS RESULTS-FREE FILES. A user editing a scenario by hand
 * should not have to fabricate an outputs section, so `results` and
 * `provenance` are optional on the way in. Inputs are not.
 */

/** Bump when the envelope's SHAPE changes incompatibly. */
export const EXCHANGE_VERSION = 1;

/**
 * Schema for the inputs block, derived from the form's own shape rather
 * than hand-written, so a new form field cannot be silently dropped from
 * the exchange format: `strict()` makes an unknown key an error, and a
 * missing key is an error too, so both directions of drift fail loudly.
 */
const pricingShape = {
  pricingMode: z.enum(["lcoe", "capex"]),
  lcoeUsdPerMwh: z.number(),
  capexUsdPerKw: z.number(),
  opexPctPerYear: z.number(),
};

export const exchangeInputsSchema = z
  .object({
    location: z
      .object({
        lat: z.number(),
        lon: z.number(),
        country: z.string().nullable(),
      })
      .strict(),
    general: z
      .object({
        lifetimeYears: z.number(),
        discountRatePct: z.number(),
        waterPriceUsdPerM3: z.number(),
        waterTransportUsdPerM3Per100Km: z.number(),
        waterTransportDistanceKm: z.number(),
        waterDesalinated: z.boolean(),
        waterPumpingHeadM: z.number(),
      })
      .strict(),
    electrolyzer: z
      .object({
        capacityMw: z.number(),
        efficiencyPct: z.number(),
        capexUsdPerKw: z.number(),
        opexPctPerYear: z.number(),
        stackLifetimeHours: z.number(),
        stackReplacementPct: z.number(),
        degradationPctPerYear: z.number(),
      })
      .strict(),
    pv: z
      .object({
        enabled: z.boolean(),
        capacityMw: z.number(),
        coupled: z.boolean(),
        kind: z.enum(["pv_fixed", "pv_1axis", "pv_2axis"]),
        ...pricingShape,
      })
      .strict(),
    wind: z
      .object({
        enabled: z.boolean(),
        capacityMw: z.number(),
        coupled: z.boolean(),
        kind: z.enum(["wind_120", "wind_160"]),
        ...pricingShape,
      })
      .strict(),
    grid: z
      .object({
        enabled: z.boolean(),
        priceUsdPerMwh: z.number(),
        maxImportMw: z.number(),
        coupled: z.boolean(),
        emissionFactorTco2PerMwh: z.number(),
      })
      .strict(),
  })
  .strict();

/**
 * The envelope. `results` and `provenance` are passthrough on import — we
 * do not re-validate the engine's own output shape, because a file carrying
 * results from a newer engine should still be importable for its inputs.
 */
export const exchangeSchema = z.object({
  kind: z.literal("h2map.calculator"),
  version: z.number(),
  inputs: exchangeInputsSchema,
  results: z.unknown().optional(),
  provenance: z.unknown().optional(),
});

export type ExchangeFile = z.infer<typeof exchangeSchema>;

export interface ExchangeProvenance {
  exportedAt: string;
  engineVersion: string | null;
  referenceMode: boolean | null;
  /** Resource profiles actually used, with provider and dataset version. */
  profiles: SimulateResponse["profiles"] | null;
  /** The country row in force when the run was made, if one was applied. */
  countryDefaults: {
    iso2: string;
    curated: boolean | null;
    waccUsed: number | null;
    waccBasis: "curated-real" | "income-group-heuristic" | null;
    gridEfTco2PerMwh: number | null;
    profileVersion: string | null;
  } | null;
}

/**
 * Build the export payload. `response` may be absent — exporting a
 * not-yet-run scenario is legitimate, and produces an inputs-only file that
 * imports cleanly.
 */
export function buildExchangeFile(
  values: CalculatorValues,
  response: SimulateResponse | null,
  countryRow: CountryDefaults | null,
  now: Date,
): ExchangeFile & { provenance: ExchangeProvenance } {
  const curatedWacc = countryRow?.wacc_curated ?? null;
  return {
    kind: "h2map.calculator",
    version: EXCHANGE_VERSION,
    inputs: values,
    ...(response ? { results: response.results } : {}),
    provenance: {
      exportedAt: now.toISOString(),
      engineVersion: response?.results.meta.engineVersion ?? null,
      referenceMode: response?.results.meta.referenceMode ?? null,
      profiles: response?.profiles ?? null,
      countryDefaults: countryRow
        ? {
            iso2: countryRow.iso2,
            curated: countryRow.curated,
            // Which cost of capital actually governed, and on what basis —
            // a researched real rate and an income-group bracket are not
            // the same claim, and the file should not blur them.
            waccUsed: curatedWacc ?? countryRow.wacc_suggestion,
            waccBasis:
              curatedWacc !== null
                ? "curated-real"
                : countryRow.wacc_suggestion !== null
                  ? "income-group-heuristic"
                  : null,
            gridEfTco2PerMwh: countryRow.grid_ef_tco2_mwh,
            profileVersion: countryRow.profile_version,
          }
        : null,
    },
  };
}

export type ImportResult =
  | { ok: true; values: CalculatorValues; version: number }
  | { ok: false; error: string };

/**
 * Parse a file the user hands back. Deliberately strict about inputs and
 * permissive about everything else: a wrong number in `inputs` would run a
 * different scenario than the file describes, while an unrecognised
 * `provenance` field is only metadata.
 */
export function parseExchangeFile(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "notJson" };
  }

  // A results-only file from the previous export format has no `kind`. Name
  // that case specifically — "invalid JSON" would send the user looking for
  // a syntax error that is not there.
  if (
    raw !== null &&
    typeof raw === "object" &&
    !("kind" in raw) &&
    ("results" in raw || "profiles" in raw)
  ) {
    return { ok: false, error: "legacyResultsOnly" };
  }

  const parsed = exchangeSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: first ? `${first.path.join(".")}: ${first.message}` : "invalid",
    };
  }
  if (parsed.data.version > EXCHANGE_VERSION) {
    return { ok: false, error: "newerVersion" };
  }
  return {
    ok: true,
    values: parsed.data.inputs as CalculatorValues,
    version: parsed.data.version,
  };
}

/** Every top-level section of the form, for the round-trip guard. */
export const EXCHANGE_SECTIONS = Object.keys(
  CALCULATOR_DEFAULTS,
) as (keyof CalculatorValues)[];
