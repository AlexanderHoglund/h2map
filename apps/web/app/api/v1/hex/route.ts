import type { NextRequest } from "next/server";
import { jsonError, rateLimited, validationError } from "@/lib/api/responses";
import { hexRequestSchema } from "@/lib/api/schemas";
import {
  checkRateLimit,
  clientIp,
  GENERAL_POLICY,
} from "@/lib/server/rateLimit";
import { getServerSupabase } from "@/lib/server/supabase";

/**
 * POST /api/v1/hex — batch lookup of precomputed choropleth cells.
 *
 * Body: { ids: string[] } (H3 cell ids, ≤4096). Returns only rows that
 * exist; absent ids are ocean or not yet seeded — the client falls back to
 * the parent cell's value. status='computing' rows are placeholders the
 * seeder is working on (re-poll with backoff).
 */
export async function POST(request: NextRequest): Promise<Response> {
  const rl = checkRateLimit(`hex:${clientIp(request)}`, GENERAL_POLICY);
  if (!rl.allowed) return rateLimited(rl.retryAfterSeconds);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_json", "Request body is not valid JSON");
  }
  const parsed = hexRequestSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const { data, error } = await getServerSupabase().rpc("get_hex_cells", {
      p_ids: parsed.data.ids,
    });
    if (error) throw new Error(error.message);
    return Response.json({
      cells: (data ?? []).map((row) => ({
        h3: row.h3,
        status: row.status,
        lcohBest: row.lcoh_best,
        lcohSolar: row.lcoh_solar,
        lcohWind: row.lcoh_wind,
        bestPvMw: row.best_pv_mw,
        bestWindMw: row.best_wind_mw,
        solarCf: row.solar_cf,
        windCf: row.wind_cf,
        // Future cost years {"2030":{best,solar,wind},...}; 2024 is above.
        years: row.lcoh_years,
        // Optional bases (P1 #5 risk-adjusted WACC, P1 #6 best-achievable).
        wacc: row.lcoh_wacc,
        optimal: row.lcoh_optimal,
        // Per-cell data provenance (T1): 'satellite' | 'era5' for PV,
        // 'improved' | 'fallback' for wind. Null on cells no recompute pass
        // has visited yet.
        pvDbTier: row.pv_db_tier,
        windFidelity: row.wind_fidelity,
      })),
    });
  } catch (err) {
    console.error("[api/hex]", err);
    return jsonError(500, "internal_error", "Unexpected error");
  }
}
