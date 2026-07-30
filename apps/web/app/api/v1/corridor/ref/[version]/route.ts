import type { NextRequest } from "next/server";
import { jsonError, rateLimited } from "@/lib/api/responses";
import { checkRateLimit, clientIp, GENERAL_POLICY } from "@/lib/server/rateLimit";
import { loadRefBundle } from "@/lib/server/corridorRef";

/**
 * GET /api/v1/corridor/ref/:version — the full typed reference bundle
 * (build-plan Phase 2.4). Bundles are IMMUTABLE (a change is a new version),
 * so the response is cached immutably by clients and CDNs.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ version: string }> },
): Promise<Response> {
  const limit = checkRateLimit(`corridor-ref:${clientIp(request)}`, GENERAL_POLICY);
  if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);
  const { version } = await params;

  try {
    const bundle = loadRefBundle(version);
    return Response.json(bundle, {
      headers: {
        // Immutable by contract: the id pins the content forever.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    if (err instanceof Error && /invalid bundle id|not found/.test(err.message)) {
      return jsonError(404, "unknown_bundle", `No reference bundle "${version}"`);
    }
    console.error("[api/corridor/ref]", err);
    return jsonError(500, "internal_error", "Unexpected error");
  }
}
