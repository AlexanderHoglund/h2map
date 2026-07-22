import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import {
  EngineInputError,
  simulateLCOH,
  type LCOHInputs,
  type ResourceProfiles,
} from "@h2map/lcoh-engine";
import { ProfileServiceError } from "@h2map/profile-service";
import { jsonError, rateLimited, validationError } from "@/lib/api/responses";
import { simulateBodySchema, type ProfileRef } from "@/lib/api/schemas";
import { resolveResourceProfile } from "@/lib/server/profiles";
import {
  checkRateLimit,
  clientIp,
  GENERAL_POLICY,
} from "@/lib/server/rateLimit";

interface ResolvedProfile {
  cf: readonly number[];
  hash: string;
  source:
    | { type: "inline" }
    | {
        type: "resolved";
        latR: number;
        lonR: number;
        kind: string;
        provider: string;
        datasetVersion: string;
        attribution: string;
        cacheHit: boolean;
      };
}

async function resolveRef(ref: ProfileRef): Promise<ResolvedProfile> {
  if (Array.isArray(ref)) {
    return { cf: ref, hash: profileHash(ref), source: { type: "inline" } };
  }
  const p = await resolveResourceProfile(ref.lat, ref.lon, ref.kind);
  return {
    cf: p.cf,
    hash: profileHash(p.cf),
    source: {
      type: "resolved",
      latR: p.latR,
      lonR: p.lonR,
      kind: p.kind,
      provider: p.provider,
      datasetVersion: p.datasetVersion,
      attribution: p.attribution,
      cacheHit: p.cacheHit,
    },
  };
}

/** Stable content hash for scenario reproducibility (`scenarios.profile_hashes`). */
function profileHash(cf: readonly number[]): string {
  return createHash("sha256").update(cf.join(",")).digest("hex");
}

/**
 * POST /api/v1/simulate
 *
 * Body: { inputs: LCOHInputs, profiles: { pv?, wind? } } where each profile
 * is either an inline 8760 CF array or { lat, lon, kind } resolved through
 * the profile service. Returns engine results plus profile provenance.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const rl = checkRateLimit(`simulate:${clientIp(request)}`, GENERAL_POLICY);
  if (!rl.allowed) return rateLimited(rl.retryAfterSeconds);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_json", "Request body is not valid JSON");
  }
  const parsed = simulateBodySchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const [pv, wind] = await Promise.all([
      parsed.data.profiles.pv ? resolveRef(parsed.data.profiles.pv) : null,
      parsed.data.profiles.wind ? resolveRef(parsed.data.profiles.wind) : null,
    ]);

    const profiles: ResourceProfiles = {
      ...(pv ? { pv: pv.cf } : {}),
      ...(wind ? { wind: wind.cf } : {}),
    };
    const results = simulateLCOH(parsed.data.inputs as LCOHInputs, profiles);

    return Response.json({
      results,
      profiles: {
        ...(pv ? { pv: { hash: pv.hash, source: pv.source } } : {}),
        ...(wind ? { wind: { hash: wind.hash, source: wind.source } } : {}),
      },
    });
  } catch (err) {
    if (err instanceof EngineInputError) {
      return jsonError(400, "engine_input_error", err.message, {
        path: err.path,
      });
    }
    if (err instanceof ProfileServiceError) {
      return jsonError(502, "providers_unavailable", err.message, err.causes);
    }
    console.error("[api/simulate]", err);
    return jsonError(500, "internal_error", "Unexpected error");
  }
}
