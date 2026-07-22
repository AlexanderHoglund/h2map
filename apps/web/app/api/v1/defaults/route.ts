import type { NextRequest } from "next/server";
import { jsonError, rateLimited, validationError } from "@/lib/api/responses";
import { defaultsQuerySchema } from "@/lib/api/schemas";
import {
  checkRateLimit,
  clientIp,
  GENERAL_POLICY,
} from "@/lib/server/rateLimit";
import { getServerSupabase } from "@/lib/server/supabase";

/**
 * GET /api/v1/defaults[?country=CL]
 *
 * Country default parameter packs (grid emission factor, WACC suggestion,
 * CAPEX pack). Without ?country returns all rows.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const rl = checkRateLimit(`defaults:${clientIp(request)}`, GENERAL_POLICY);
  if (!rl.allowed) return rateLimited(rl.retryAfterSeconds);

  const parsed = defaultsQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) return validationError(parsed.error);

  try {
    const db = getServerSupabase();
    if (parsed.data.country) {
      const { data, error } = await db
        .from("country_defaults")
        .select()
        .eq("iso2", parsed.data.country)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) {
        return jsonError(
          404,
          "not_found",
          `No defaults for country ${parsed.data.country}`,
        );
      }
      return Response.json(data);
    }
    const { data, error } = await db
      .from("country_defaults")
      .select()
      .order("iso2");
    if (error) throw new Error(error.message);
    return Response.json(data);
  } catch (err) {
    console.error("[api/defaults]", err);
    return jsonError(500, "internal_error", "Unexpected error");
  }
}
