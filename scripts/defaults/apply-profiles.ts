/**
 * Write the researched country profiles into `country_defaults`.
 *
 * Idempotent and additive: it sets `curated = true`, the profile's fields,
 * the per-field citations in `profile_source`, and the profile's own
 * `source` string. It never touches a field the profile does not carry —
 * an absent field means "no defensible value was found", and the model's
 * own default is the honest answer for it.
 *
 * The scheduled ingest respects all of this (see mergeCountryRow.ts), so
 * the values and their citations survive the every-three-hours refresh.
 *
 *   npm run defaults:profiles
 *
 * Follow with `npm run defaults:snapshot` so the documentation table shows
 * the new values.
 */
import { makeSupabase } from "../lib/serviceDeps";
import { INDONESIA, type CountryProfile } from "./profiles/indonesia";

const PROFILES: CountryProfile[] = [INDONESIA];

async function main(): Promise<void> {
  const db = makeSupabase();
  for (const profile of PROFILES) {
    const patch: Record<string, unknown> = {
      curated: true,
      source: profile.source,
      profile_version: profile.profileVersion,
      profile_updated_at: new Date().toISOString(),
      profile_source: Object.fromEntries(
        Object.entries(profile.fields).map(([field, f]) => [
          field,
          {
            value: f.value,
            source: f.source,
            retrievedAt: f.retrievedAt,
            verified: f.verified,
            ...(f.note ? { note: f.note } : {}),
          },
        ]),
      ),
    };
    for (const [field, f] of Object.entries(profile.fields)) {
      patch[field] = f.value;
    }
    if (profile.capexPack !== undefined) patch.capex_pack = profile.capexPack;

    const { error } = await db
      .from("country_defaults")
      .update(patch)
      .eq("iso2", profile.iso2);
    if (error) throw new Error(`${profile.iso2}: ${error.message}`);

    const fields = Object.keys(profile.fields);
    const unverified = Object.entries(profile.fields)
      .filter(([, f]) => !f.verified)
      .map(([k]) => k);
    console.log(
      `${profile.iso2} (${profile.profileVersion}): ${fields.length} curated field(s) — ${fields.join(", ")}` +
        (unverified.length ? `; unverified: ${unverified.join(", ")}` : ""),
    );
  }
  console.log(`applied ${PROFILES.length} profile(s)`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
