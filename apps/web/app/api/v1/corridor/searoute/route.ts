import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, rateLimited } from "@/lib/api/responses";
import { checkRateLimit, clientIp, GENERAL_POLICY } from "@/lib/server/rateLimit";
import { routeSea } from "@/lib/server/seaRouteServer";

/**
 * Port-to-port sea routing over the bundled marnet graph. GET so responses
 * are cacheable; the underlying computation is deterministic and cached
 * module-scope by coordinate pair. Failures are typed and non-blocking —
 * the client degrades to the schematic drawing and the typed distance,
 * never an error state.
 */

const coordSchema = z
  .string()
  .transform((s) => s.split(",").map(Number))
  .pipe(z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]));

export async function GET(request: NextRequest): Promise<Response> {
  const limit = checkRateLimit(`corridor-searoute:${clientIp(request)}`, GENERAL_POLICY);
  if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);

  const params = request.nextUrl.searchParams;
  const parsedFrom = coordSchema.safeParse(params.get("from") ?? "");
  const parsedTo = coordSchema.safeParse(params.get("to") ?? "");
  if (!parsedFrom.success || !parsedTo.success) {
    return jsonError(400, "invalid_coords", 'Expect from=lat,lon&to=lat,lon');
  }
  const [fromLat, fromLon] = parsedFrom.data;
  const [toLat, toLon] = parsedTo.data;

  const outcome = await routeSea(
    { lat: fromLat, lon: fromLon },
    { lat: toLat, lon: toLon },
  );
  if (!outcome.ok) {
    // 200 with a typed error: a failed route is an EXPECTED state the
    // client renders (degraded schematic), not a transport failure.
    return Response.json({ ok: false, error: outcome.error });
  }
  return Response.json({ ok: true, route: outcome.route });
}
