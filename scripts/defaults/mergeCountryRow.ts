/**
 * The curation rule for `country_defaults`, as a pure function so it can be
 * tested without a database.
 *
 * Two writers share this table and must not fight:
 *
 * - the scheduled ingest (every 3 h), which knows the OWID grid emission
 *   factor and a WACC guessed from the World Bank income group;
 * - a researched country profile, which knows real cost-of-capital,
 *   electricity, water and CAPEX figures with citations.
 *
 * The rule is simply **curated wins**: on a curated row the ingest writes
 * only fields the profile leaves null, and never touches the provenance.
 * Field-level, not row-level — a profile may carry a researched WACC and
 * still want OWID's grid factor, which updates as the grid decarbonises.
 *
 * The behaviour this replaces was subtly wrong: the old ingest read every
 * existing WACC back and re-wrote it, which looked like preservation but
 * meant the heuristic froze at whatever the first run happened to produce
 * and could never re-apply. Un-curated rows now genuinely track the
 * heuristic again.
 */

/** What the ingest can compute for any country, from public datasets. */
export interface IngestedCountryRow {
  iso2: string;
  grid_ef_tco2_mwh: number;
  wacc_suggestion: number;
  source: string;
  updated_at: string;
}

/** The curated state of an existing row (only what the merge needs). */
export interface ExistingCountryRow {
  iso2: string;
  curated?: boolean | null;
  /** Curated fields present on the row; null/absent = not curated. */
  wacc_curated?: number | null;
  grid_ef_tco2_mwh?: number | null;
  /** Carried through unchanged on curated rows — see mergeCountryRow. */
  source?: string | null;
}

/**
 * A row ready to upsert. NOTE the upsert semantics this type serves: an
 * upsert is an INSERT with conflict resolution, so any column absent from
 * the payload is written as NULL rather than left alone. A field that must
 * survive has to be echoed explicitly — hence `source` being nullable here.
 */
export type MergedCountryRow = Partial<Omit<IngestedCountryRow, "source">> & {
  iso2: string;
  source?: string | null;
};

/**
 * Merge one ingested row against whatever is already stored.
 *
 * Returns the columns the ingest may write. On a curated row `source` is
 * omitted entirely (PostgREST leaves unsupplied columns alone), which is
 * what stops the automated string from erasing a research citation.
 */
export function mergeCountryRow(
  ingested: IngestedCountryRow,
  existing: ExistingCountryRow | undefined,
): MergedCountryRow {
  if (!existing?.curated) {
    // Heuristic row: the ingest owns every field it computes, including the
    // WACC (which the old code accidentally froze).
    return { ...ingested };
  }

  const merged: MergedCountryRow = {
    iso2: ingested.iso2,
    updated_at: ingested.updated_at,
  };

  // A curated WACC governs; `wacc_suggestion` still refreshes underneath it
  // so the heuristic stays visible for comparison and survives un-curating.
  merged.wacc_suggestion = ingested.wacc_suggestion;

  // The grid emission factor is a genuinely-updating measurement. A profile
  // may pin it (a national inventory figure the researcher prefers); if it
  // does not, OWID keeps it current.
  if (existing.grid_ef_tco2_mwh === null || existing.grid_ef_tco2_mwh === undefined) {
    merged.grid_ef_tco2_mwh = ingested.grid_ef_tco2_mwh;
  }

  // `source` describes the automated values, so a curated row keeps
  // whatever it already had rather than taking the fresh string. It must be
  // ECHOED, not omitted: an upsert is an INSERT with conflict resolution,
  // so a column missing from the payload is written as NULL, not left
  // alone. (Measured against the live table — omitting it blanked the
  // column.) The curated citations live in `profile_source`, which the
  // ingest never writes at all.
  if (existing.source !== undefined) merged.source = existing.source;
  return merged;
}

/** Split rows into curated and heuristic, for the run's census line. */
export function censusOf(
  rows: MergedCountryRow[],
  existingByIso: Map<string, ExistingCountryRow>,
): { curated: number; heuristic: number } {
  let curated = 0;
  for (const r of rows) if (existingByIso.get(r.iso2)?.curated) curated += 1;
  return { curated, heuristic: rows.length - curated };
}
