/**
 * Input-uncertainty reference data — the EXPOSURE half of impact.
 *
 * The model computes how hard each input pushes the result (leverage, an
 * elasticity — measured, committed, in data/corridor-sensitivity). It cannot
 * compute how uncertain an input actually IS: that is a fact about the world,
 * researched and declared. Impact is the product of the two, and this file
 * parses the declared half.
 *
 * THE GOVERNING RULE, enforced here rather than promised: a row without a
 * defensible basis does not exist. `uncertaintyBasis`, `source` and `verified`
 * are all required and non-empty, so an undefended range cannot be added
 * quietly — a field with nothing to say about it is left out of the dataset
 * and is excluded from impact ranking by its absence, not by a null.
 *
 * Immutable and versioned like every sibling dataset
 * (`data/input-uncertainty-ref/<datasetVersion>.json`, stem equal to the
 * version): a change publishes a NEW file. No I/O here — the consumer loads
 * and this parses an already-read `unknown`.
 */

import { z } from "zod";

/** A cited figure, in the same shape the corridor bundle already uses. */
const sourceRefSchema = z.object({
  title: z.string().min(1),
  publisher: z.string().min(1),
  year: z.number().int(),
  locator: z.string().min(1),
  url: z.string().min(1),
  /** The number AS PRINTED in the source, before any conversion of ours. */
  figureUsed: z.string().min(1),
  /** Our conversion, caveats, and why this figure and not another. */
  note: z.string().min(1),
});

/**
 * The shape of the declared uncertainty.
 *
 * `uniform` is the conservative default when only a range is defensible;
 * `lognormal` suits a strictly-positive price with a documented long upper
 * tail; `triangular` requires a citable `mode`; `normal` only for a
 * symmetric, well-sampled quantity.
 */
export const uncertaintyDistributions = [
  "normal",
  "lognormal",
  "triangular",
  "uniform",
] as const;

/** How the range was established — recorded so a reader can weigh it. */
export const uncertaintyBasisTypes = [
  "market-range",
  "quote-spread",
  "regulatory-scenario",
  "measurement",
  "expert-judgement",
] as const;

const rowSchema = z
  .object({
    /**
     * Joins to a sweep parameter id or a coupling group id. Validated against
     * the live vocabulary by the CONSUMER (see `assertUncertaintyJoins`) —
     * this package cannot import the script that owns those lists, and a
     * duplicated copy here would be the thing that drifts.
     */
    id: z.string().min(1),
    appliesTo: z.enum(["field", "group"]),
    /** The unit `low`/`mode`/`high` are expressed in. */
    unit: z.string().min(1),
    distribution: z.enum(uncertaintyDistributions),
    /** P10 and P90 in `unit` — NOT absolute extremes. */
    low: z.number(),
    mode: z.number().optional(),
    high: z.number(),
    basisType: z.enum(uncertaintyBasisTypes),
    /** One cited sentence. Mandatory: this is the rule the dataset exists for. */
    uncertaintyBasis: z.string().min(1),
    verified: z.boolean(),
    /** Archetype keys this range applies to. Absent = applies everywhere. */
    scenarioScope: z.array(z.string().min(1)).nonempty().optional(),
    /** What changed on import, when the researched row was remapped. */
    importNote: z.string().min(1).optional(),
    sources: z.array(sourceRefSchema).nonempty(),
  })
  .refine((r) => r.low <= r.high, {
    message:
      "low must be <= high. Unlike the corridor bundle's scaleExponent — whose " +
      "band descends deliberately and is documented as such — every band here " +
      "ascends, so ordering is enforced rather than tolerated.",
    path: ["low"],
  })
  .refine((r) => r.mode === undefined || (r.mode >= r.low && r.mode <= r.high), {
    message: "mode must lie within [low, high]",
    path: ["mode"],
  })
  .refine((r) => r.distribution !== "triangular" || r.mode !== undefined, {
    message: "a triangular distribution requires a citable mode",
    path: ["mode"],
  })
  .refine((r) => !r.verified || r.sources.some((s) => s.url.length > 0), {
    message: "verified:true requires at least one source carrying a URL",
    path: ["verified"],
  });

export const uncertaintyDatasetSchema = z.object({
  datasetVersion: z.string().min(1),
  retrievedDate: z.string().min(1),
  /** The review contract, carried verbatim into the UI's badge copy. */
  status: z.string().min(1),
  rows: z.array(rowSchema),
  /**
   * Items considered and deliberately NOT quantified, with a reason. An empty
   * array is meaningful — it says every considered item was quantified, which
   * is different from the field being absent.
   */
  unquantified: z.array(
    z.object({ id: z.string().min(1), reason: z.string().min(1) }),
  ),
});

export type UncertaintyRow = z.infer<typeof rowSchema>;
export type UncertaintyDataset = z.infer<typeof uncertaintyDatasetSchema>;

export function parseUncertaintyDataset(data: unknown): UncertaintyDataset {
  return uncertaintyDatasetSchema.parse(data);
}

/**
 * The rows applying to one archetype, or to every archetype.
 *
 * A row with no `scenarioScope` applies everywhere; one with a scope applies
 * only where listed. Scope is load-bearing rather than decorative: the
 * researched green-fuel price is an e-METHANOL range, and two of the three
 * archetypes run e-ammonia against a band that is already verified in the
 * corridor bundle. Applying the methanol range there would replace better
 * data with worse, silently.
 */
export function uncertaintyFor(
  ds: UncertaintyDataset,
  archetypeKey: string,
): UncertaintyRow[] {
  return ds.rows.filter(
    (r) => r.scenarioScope === undefined || r.scenarioScope.includes(archetypeKey),
  );
}

/**
 * Every row id must resolve to something the model actually has.
 *
 * The ids ARE the join. A typo produces a row that parses perfectly, joins to
 * nothing, and is silently excluded from every impact figure — the exact
 * failure mode that is invisible in a build, a typecheck and a lint. The
 * caller passes the live vocabulary so this package never duplicates it.
 *
 * Returns the unresolved ids; empty means the dataset joins cleanly.
 */
export function unresolvedUncertaintyIds(
  ds: UncertaintyDataset,
  knownIds: Iterable<string>,
): string[] {
  const known = new Set(knownIds);
  return [...new Set(ds.rows.map((r) => r.id))].filter((id) => !known.has(id));
}
