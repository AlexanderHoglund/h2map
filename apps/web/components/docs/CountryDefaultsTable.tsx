"use client";

import { useMemo, useState } from "react";

/**
 * The actual per-country values the model uses — not a description of the
 * method, the numbers themselves. Rendered from a committed snapshot
 * (`data/country-defaults/snapshot.json`, written by
 * `npm run defaults:snapshot`) rather than queried live, so the
 * documentation stays a static page and the values have a git history.
 *
 * 172 countries is too many to read as a wall, so: enriched profiles sort
 * first and are searchable by name or ISO2. An enriched row shows its
 * researched cost of capital with the heuristic it replaced beside it, so
 * the reader can see what curation actually changed.
 */

interface CountryRow {
  iso2: string;
  name: string;
  curated: boolean;
  gridEfTco2PerMwh: number | null;
  waccHeuristic: number | null;
  waccCurated: number | null;
  countryRiskPremium: number | null;
  electricityPriceUsdMwh: number | null;
  waterPriceUsdM3: number | null;
  landCostUsdHa: number | null;
  labourIndex: number | null;
  capexPack: unknown;
  profileVersion: string | null;
  citations: Record<string, string> | null;
}

interface Props {
  snapshot: {
    snapshotAt: string;
    counts: { total: number; curated: number; heuristic: number };
    rows: CountryRow[];
  };
}

const pct = (v: number | null): string =>
  v === null ? "—" : `${(v * 100).toFixed(1)}%`;
const num = (v: number | null, d = 2): string =>
  v === null ? "—" : v.toFixed(d);

export default function CountryDefaultsTable({ snapshot }: Props) {
  const [query, setQuery] = useState("");
  const [enrichedOnly, setEnrichedOnly] = useState(false);

  // Filter only — never re-sort. The snapshot is written already ordered
  // (enriched first, then by name), because `localeCompare` resolves
  // against host collation data and Node and the browser disagree on
  // accented names: sorting here produced a different row order on the
  // server than in the client and React reported a hydration mismatch.
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return snapshot.rows
      .filter((r) => (enrichedOnly ? r.curated : true))
      .filter(
        (r) =>
          q === "" ||
          r.name.toLowerCase().includes(q) ||
          r.iso2.toLowerCase().includes(q),
      );
  }, [snapshot.rows, query, enrichedOnly]);

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs">
          <span className="text-neutral-600">Find a country</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Indonesia, ID…"
            className="rounded-md border border-neutral-300 px-2 py-1 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-neutral-600">
          <input
            type="checkbox"
            checked={enrichedOnly}
            onChange={(e) => setEnrichedOnly(e.target.checked)}
          />
          Enriched profiles only
        </label>
        <span className="text-xs text-neutral-500">
          {rows.length} of {snapshot.counts.total} shown ·{" "}
          {snapshot.counts.curated} enriched · snapshot {snapshot.snapshotAt}
        </span>
      </div>

      <div className="my-3 max-h-[28rem] overflow-auto border border-neutral-300">
        <table className="w-full border-collapse text-[13px] tabular-nums">
          <thead className="sticky top-0 bg-neutral-50">
            <tr className="border-b border-neutral-300 text-left text-[11px] uppercase tracking-wider text-neutral-500">
              <th className="px-3 py-2 font-medium">Country</th>
              <th className="px-3 py-2 text-right font-medium">Grid EF</th>
              <th className="px-3 py-2 text-right font-medium">WACC</th>
              <th className="px-3 py-2 text-right font-medium">Electricity</th>
              <th className="px-3 py-2 text-right font-medium">Water</th>
              <th className="px-3 py-2 font-medium">Basis</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const wacc = r.waccCurated ?? r.waccHeuristic;
              return (
                <tr
                  key={r.iso2}
                  className="border-b border-neutral-200 last:border-0"
                >
                  <td className="px-3 py-1.5">
                    {r.name}{" "}
                    <span className="text-neutral-400">{r.iso2}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {num(r.gridEfTco2PerMwh, 3)}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {pct(wacc)}
                    {r.waccCurated !== null && r.waccHeuristic !== null && (
                      <span
                        className="ml-1 text-[11px] text-neutral-400"
                        title="The income-group heuristic this replaced"
                      >
                        (was {pct(r.waccHeuristic)})
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {num(r.electricityPriceUsdMwh, 1)}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {num(r.waterPriceUsdM3)}
                  </td>
                  <td className="px-3 py-1.5">
                    {r.curated ? (
                      <span
                        className="rounded bg-brand-tint px-1.5 py-0.5 text-[11px] font-medium text-brand-deep"
                        title={
                          r.citations
                            ? Object.entries(r.citations)
                                .map(([f, c]) => `${f}: ${c}`)
                                .join("\n")
                            : undefined
                        }
                      >
                        Enriched
                        {r.profileVersion ? ` · ${r.profileVersion}` : ""}
                      </span>
                    ) : (
                      <span className="text-[11px] text-neutral-500">
                        Regional heuristic
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td className="px-3 py-3 text-neutral-500" colSpan={6}>
                  No country matches that search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-500">
        Grid EF in tCO₂/MWh · electricity in USD/MWh · water in USD/m³. A dash
        means no curated value: the model uses its own default for that field.
        Hover an <em>Enriched</em>{" "}badge for the per-field citations.
      </p>
    </div>
  );
}
