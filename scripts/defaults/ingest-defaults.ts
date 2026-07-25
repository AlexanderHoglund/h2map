/**
 * Populate country_defaults for every country on the map.
 *
 * Grid emission factor: Our World in Data "Carbon intensity of electricity"
 * (built on Ember + the Energy Institute), latest year per country,
 * gCO2/kWh ÷ 1000 → tCO2/MWh — the same basis as the original hand-seeded
 * five rows. WACC suggestion: a transparent World Bank income-group heuristic
 * (the field is a *suggestion*, and precise per-country cost-of-capital data
 * is proprietary). Countries are matched to ISO2 via the committed Natural
 * Earth boundaries, so exactly the countries the seeder draws get defaults.
 *
 * Existing curated WACC values are preserved; grid EF is refreshed to the
 * latest year everywhere. Idempotent — re-run when the committed CSV updates.
 *
 * Usage: npm run defaults:ingest
 */
import { readFileSync } from "node:fs";
import { makeSupabase, ROOT } from "../lib/serviceDeps";

/** WACC suggestion by World Bank income group (documented heuristic). */
const WACC_BY_INCOME: Record<string, number> = {
  "1. High income: OECD": 0.06,
  "2. High income: nonOECD": 0.07,
  "3. Upper middle income": 0.08,
  "4. Lower middle income": 0.1,
  "5. Low income": 0.12,
};
const WACC_FALLBACK = 0.09;

interface CountryFeature {
  properties: {
    NAME: string;
    CONTINENT: string;
    ISO_A2: string;
    ISO_A2_EH: string;
    ISO_A3: string;
    ISO_A3_EH: string;
    INCOME_GRP: string;
  };
}

function pick(primary: string, fallback: string): string | null {
  if (primary && primary !== "-99") return primary;
  if (fallback && fallback !== "-99") return fallback;
  return null;
}

/** Latest-year carbon intensity (gCO2/kWh) per ISO3 from the OWID CSV. */
function loadCarbonIntensity(): Map<string, { year: number; ci: number }> {
  const lines = readFileSync(
    `${ROOT}data/geo/owid-carbon-intensity-electricity.csv`,
    "utf8",
  )
    .trim()
    .split("\n");
  const latest = new Map<string, { year: number; ci: number }>();
  for (let i = 1; i < lines.length; i++) {
    const [, code, year, ci] = lines[i]!.split(",");
    if (!code || !ci) continue;
    const y = Number(year);
    const prev = latest.get(code);
    if (!prev || y > prev.year) latest.set(code, { year: y, ci: Number(ci) });
  }
  return latest;
}

async function main(): Promise<void> {
  const ci = loadCarbonIntensity();
  const gj = JSON.parse(
    readFileSync(`${ROOT}data/geo/ne_110m_countries.geojson`, "utf8"),
  ) as { features: CountryFeature[] };

  const db = makeSupabase();
  const { data: existing, error: readErr } = await db
    .from("country_defaults")
    .select("iso2, wacc_suggestion");
  if (readErr) throw new Error(readErr.message);
  const curatedWacc = new Map<string, number>(
    (existing ?? []).map((r) => [r.iso2 as string, Number(r.wacc_suggestion)]),
  );

  const rows: {
    iso2: string;
    grid_ef_tco2_mwh: number;
    wacc_suggestion: number;
    source: string;
    updated_at: string;
  }[] = [];
  const skipped: string[] = [];
  const now = new Date().toISOString();

  for (const f of gj.features) {
    const p = f.properties;
    if (p.CONTINENT === "Antarctica") continue;
    const iso2 = pick(p.ISO_A2_EH, p.ISO_A2);
    const iso3 = pick(p.ISO_A3_EH, p.ISO_A3);
    const intensity = iso3 ? ci.get(iso3) : undefined;
    if (!iso2 || !intensity) {
      skipped.push(`${p.NAME}${iso2 ? "" : " (no ISO2)"}`);
      continue;
    }
    const wacc =
      curatedWacc.get(iso2) ??
      WACC_BY_INCOME[p.INCOME_GRP] ??
      WACC_FALLBACK;
    rows.push({
      iso2,
      grid_ef_tco2_mwh: Math.round((intensity.ci / 1000) * 1000) / 1000,
      wacc_suggestion: wacc,
      source: `Grid EF: OWID/Ember carbon intensity ${intensity.year}; WACC: World Bank income-group heuristic`,
      updated_at: now,
    });
  }

  const { error } = await db
    .from("country_defaults")
    .upsert(rows, { onConflict: "iso2" });
  if (error) throw new Error(error.message);

  console.log(`upserted ${rows.length} country_defaults rows`);
  console.log(`skipped ${skipped.length}: ${skipped.join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
