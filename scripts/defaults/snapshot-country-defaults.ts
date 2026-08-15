/**
 * Snapshot `country_defaults` to committed JSON so the documentation can
 * show the ACTUAL per-country values, not just describe the method.
 *
 * The same pattern the corridor's field reference uses (see
 * `scripts/corridor/gen-docs.ts`): a script writes a data file, the docs
 * page imports it and renders a table. The alternative — querying the DB
 * at render time — would make a public documentation page depend on a
 * live service and lose the git-visible history of what the numbers were.
 *
 *   npm run defaults:snapshot
 *
 * Re-run after `defaults:ingest` or after curating a country profile.
 */
import { writeFileSync } from "node:fs";
import { makeSupabase, ROOT } from "../lib/serviceDeps";

interface ProfileSourceEntry {
  value?: number;
  source?: string;
  retrievedAt?: string;
  verified?: boolean;
  note?: string;
}

async function main(): Promise<void> {
  const db = makeSupabase();
  // Unprojected: the row IS the profile, and a projection string long
  // enough to list every column defeats the generated-type inference.
  const { data, error } = await db
    .from("country_defaults")
    .select()
    .order("iso2");
  if (error) throw new Error(error.message);
  const rows = data ?? [];

  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const out = rows.map((r) => {
    const iso2 = r.iso2 as string;
    let name = iso2;
    try {
      name = names.of(iso2) ?? iso2;
    } catch {
      /* non-region code — keep the ISO2 */
    }
    const ps = (r.profile_source ?? null) as Record<
      string,
      ProfileSourceEntry
    > | null;
    return {
      iso2,
      name,
      curated: Boolean(r.curated),
      gridEfTco2PerMwh: r.grid_ef_tco2_mwh,
      waccHeuristic: r.wacc_suggestion,
      waccCurated: r.wacc_curated,
      countryRiskPremium: r.country_risk_premium,
      electricityPriceUsdMwh: r.electricity_price_usd_mwh,
      waterPriceUsdM3: r.water_price_usd_m3,
      landCostUsdHa: r.land_cost_usd_ha,
      labourIndex: r.labour_index,
      capexPack: r.capex_pack ?? null,
      profileVersion: r.profile_version,
      // Per-field citations, flattened for display: field → source string.
      citations: ps
        ? Object.fromEntries(
            Object.entries(ps).map(([field, e]) => [
              field,
              [e.source, e.retrievedAt ? `retrieved ${e.retrievedAt}` : null]
                .filter(Boolean)
                .join(", ") + (e.verified === false ? " (unverified)" : ""),
            ]),
          )
        : null,
    };
  });

  // Sort HERE, not at render time. `localeCompare` resolves against the
  // host's collation data, and Node and the browser disagree on accented
  // names (“Côte d’Ivoire” vs “Croatia” order flips), which surfaced as a
  // React hydration mismatch. Freezing the order into the artifact makes
  // the table's markup identical on both sides by construction.
  out.sort((a, b) =>
    a.curated === b.curated
      ? new Intl.Collator("en").compare(a.name, b.name)
      : a.curated
        ? -1
        : 1,
  );

  const curated = out.filter((r) => r.curated).length;
  const payload = {
    generatedBy: "scripts/defaults/snapshot-country-defaults.ts",
    snapshotAt: new Date().toISOString().slice(0, 10),
    counts: { total: out.length, curated, heuristic: out.length - curated },
    /** The heuristic the un-curated rows use, so the docs can state it. */
    waccHeuristic: {
      "1. High income: OECD": 0.06,
      "2. High income: nonOECD": 0.07,
      "3. Upper middle income": 0.08,
      "4. Lower middle income": 0.1,
      "5. Low income": 0.12,
      fallback: 0.09,
    },
    rows: out,
  };

  const path = `${ROOT}data/country-defaults/snapshot.json`;
  writeFileSync(path, JSON.stringify(payload, null, 1) + "\n", "utf8");
  console.log(
    `wrote ${path}: ${out.length} countries (${curated} curated, ${out.length - curated} heuristic)`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
