/**
 * Shared wiring for scripts that drive the profile service against the cloud
 * Supabase project (parity run, hex seeder): env loading from
 * apps/web/.env.local, polite retrying fetch, the resource_profiles cache
 * adapter, and the turbine-curve loader.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  BuiltProfile,
  CachedProfile,
  ProfileCache,
  ProfileKind,
  ProfileMode,
  TurbineCurve,
} from "@h2map/profile-service";

export const ROOT = fileURLToPath(new URL("../..", import.meta.url));

export function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  // Local dev reads apps/web/.env.local; CI (GitHub Actions) has no file and
  // provides the values as real environment variables instead.
  try {
    const raw = readFileSync(`${ROOT}apps/web/.env.local`, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/.exec(line);
      if (m && !line.trim().startsWith("#")) env[m[1]!] = m[2]!;
    }
  } catch {
    // no .env.local — fall through to process.env
  }
  for (const key of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SECRET_KEY",
  ]) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  return env;
}

export function makeSupabase(): SupabaseClient {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("apps/web/.env.local is missing Supabase URL/key");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Deterministic upstream rejection (4xx other than 429) — never retried. */
class FatalHttpError extends Error {}

export async function fetchJson(url: string, attempts = 4): Promise<unknown> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        // Long cooldown on rate limits — bulk seeding must yield, not hammer.
        if (res.status === 429) {
          lastError = new Error(`HTTP 429 for ${url}`);
          console.warn(`  rate limited, cooling down 60 s (${i + 1}/${attempts})`);
          await delay(60_000);
          continue;
        }
        // Other 4xx are deterministic (e.g. PVGIS rejecting open water) —
        // retrying wastes half a minute per sea cell. Fail fast to the
        // provider fallback chain instead.
        if (res.status < 500) {
          throw new FatalHttpError(`HTTP ${res.status} for ${url}`);
        }
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      const json = await res.json();
      await delay(800); // politeness toward free provider tiers
      return json;
    } catch (err) {
      if (err instanceof FatalHttpError) throw err;
      lastError = err;
      console.warn(`  retry ${i + 1}/${attempts}: ${String(err)}`);
      await delay(5000 * (i + 1));
    }
  }
  throw lastError;
}

/**
 * How many generations deep a cache read scans for a CURRENT one. Rows are
 * keyed on dataset_version, so a coordinate accumulates one row per model
 * generation; 4 covers every generation this project has shipped with room
 * to spare, while keeping the read a single bounded query.
 */
const GENERATION_SCAN_LIMIT = 4;

export function makeCache(db: SupabaseClient): ProfileCache {
  return {
    async get(
      latR: number,
      lonR: number,
      kind: ProfileKind,
      mode?: ProfileMode,
      accept?: (datasetVersion: string, provider: string) => boolean,
    ) {
      let q = db
        .from("resource_profiles")
        .select("lat_r, lon_r, kind, provider, dataset_version, cf")
        .eq("lat_r", latR)
        .eq("lon_r", lonR)
        .eq("kind", kind);
      if (mode) q = q.eq("mode", mode);
      // Rows are keyed on dataset_version, so one coordinate can hold several
      // generations. Take the newest few and let the caller's predicate pick
      // the first CURRENT one — without this the newest row wins even when it
      // encodes a superseded model, and the map silently mixes generations.
      const { data, error } = await q
        .order("created_at", { ascending: false })
        .limit(GENERATION_SCAN_LIMIT);
      if (error) throw new Error(error.message);
      const row = (data ?? []).find(
        (r) =>
          !accept ||
          accept(r.dataset_version as string, r.provider as string),
      );
      if (!row) return null;
      return {
        latR: Number(row.lat_r),
        lonR: Number(row.lon_r),
        kind: row.kind as ProfileKind,
        provider: row.provider as string,
        datasetVersion: row.dataset_version as string,
        cf: row.cf as number[],
      } satisfies CachedProfile;
    },
    async put(profile: BuiltProfile) {
      const { error } = await db.from("resource_profiles").upsert(
        {
          lat_r: profile.latR,
          lon_r: profile.lonR,
          kind: profile.kind,
          mode: profile.mode,
          provider: profile.provider,
          dataset_version: profile.datasetVersion,
          years: `[${profile.yearsUsed[0]},${profile.yearsUsed[1]}]`,
          cf: profile.cf,
        },
        { onConflict: "lat_r,lon_r,kind,mode,dataset_version" },
      );
      if (error) throw new Error(error.message);
    },
  };
}

export function makeTurbineLoader(db: SupabaseClient): () => Promise<TurbineCurve> {
  return async () => {
    const { data, error } = await db
      .from("turbine_curves")
      .select("id, rated_kw, speeds, power_kw")
      .eq("id", "generic-5.6MW")
      .single();
    if (error) throw new Error(error.message);
    return {
      id: data.id as string,
      ratedKw: data.rated_kw as number,
      speedsMs: data.speeds as number[],
      powerKw: data.power_kw as number[],
    };
  };
}
