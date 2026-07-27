import type { NextRequest } from "next/server";
import { jsonError } from "@/lib/api/responses";
import { countryAt } from "@/lib/server/countryAt";

/**
 * GET /api/v1/country?lat=&lon= — reverse-geocode a coordinate to an ISO2
 * country code (Natural Earth 110m point-in-polygon). Returns { iso2: string |
 * null }; null for ocean or when boundaries aren't available. Used to auto-apply
 * a location's country defaults when a map cell is evaluated.
 */
export function GET(request: NextRequest): Response {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  ) {
    return jsonError(400, "invalid_coords", "lat/lon must be finite and in range");
  }
  try {
    return Response.json({ iso2: countryAt(lat, lon) });
  } catch (err) {
    console.error("[api/country]", err);
    return jsonError(500, "internal_error", "Unexpected error");
  }
}
