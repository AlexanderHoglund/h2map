import type { NextRequest } from "next/server";
import { ProfileServiceError } from "@h2map/profile-service";
import { jsonError, rateLimited, validationError } from "@/lib/api/responses";
import { resourceProfileQuerySchema } from "@/lib/api/schemas";
import { resolveResourceProfile } from "@/lib/server/profiles";
import {
  checkRateLimit,
  clientIp,
  PROFILE_POLICY,
} from "@/lib/server/rateLimit";

/**
 * GET /api/v1/resource-profiles?lat=&lon=&kind=
 *
 * Returns the cached-or-built 8760-hour TMY capacity-factor profile for the
 * quantized coordinate. Cache misses fan out to the providers and can take
 * tens of seconds — hence the strict rate-limit policy.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const rl = checkRateLimit(`profiles:${clientIp(request)}`, PROFILE_POLICY);
  if (!rl.allowed) return rateLimited(rl.retryAfterSeconds);

  const parsed = resourceProfileQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) return validationError(parsed.error);

  const { lat, lon, kind } = parsed.data;
  try {
    const profile = await resolveResourceProfile(lat, lon, kind);
    return Response.json(profile);
  } catch (err) {
    if (err instanceof ProfileServiceError) {
      return jsonError(502, "providers_unavailable", err.message, err.causes);
    }
    console.error("[api/resource-profiles]", err);
    return jsonError(500, "internal_error", "Unexpected error");
  }
}
