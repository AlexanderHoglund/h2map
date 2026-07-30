import type { NextRequest } from "next/server";
import { cellToLatLng, isValidCell } from "h3-js";
import { z } from "zod";
import {
  EngineInputError,
  simulateLCOH,
  type LCOHInputs,
  type ResourceProfiles,
} from "@h2map/lcoh-engine";
import {
  getResourceProfile,
  ProfileServiceError,
  type ProfileKind,
  type ResourceProfileResult,
} from "@h2map/profile-service";
import { jsonError, rateLimited, validationError } from "@/lib/api/responses";
import { lcohInputsSchema } from "@/lib/api/schemas";
import { fetchJsonWithRetry } from "@/lib/server/fetchJson";
import { SupabaseProfileCache } from "@/lib/server/profileCache";
import { getServerSupabase } from "@/lib/server/supabase";
import { getGenericTurbineCurve } from "@/lib/server/turbine";
import { checkRateLimit, clientIp, PROFILE_POLICY } from "@/lib/server/rateLimit";

/**
 * Corridor "build here" LCOH evaluation (build-plan Phase 2.3):
 *
 *   POST /api/v1/corridor/lcoh-evaluate { site, lcohConfig }
 *     → { lcoh, decomposition, provenance, gates }
 *
 * Profiles are resolved in the MAP's improved mode with the T1.1 validation
 * gate ENFORCED — a profile that fails the gate (or can't be served) yields a
 * typed `site_unservable` error, **never a number**. The corridor flow renders
 * "site cannot be evaluated" instead of pricing a broken profile.
 */

const siteSchema = z.union([
  z.object({ h3: z.string().min(1) }),
  z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
  }),
]);

const bodySchema = z.object({
  site: siteSchema,
  lcohConfig: lcohInputsSchema,
});

/** The seeder's exact improved-mode + gated dependency wiring. */
function mapModeDeps() {
  return {
    fetchJson: fetchJsonWithRetry,
    cache: new SupabaseProfileCache(getServerSupabase()),
    getTurbineCurve: getGenericTurbineCurve,
    log: (message: string) => console.warn(`[corridor-lcoh] ${message}`),
    windAirDensityCorrection: true,
    windTurbineClassSelection: true,
    pvMaskUnservable: true,
    validateProfiles: true,
  };
}

function provenanceOf(p: ResourceProfileResult) {
  return {
    kind: p.kind,
    provider: p.provider,
    datasetVersion: p.datasetVersion,
    latR: p.latR,
    lonR: p.lonR,
    cacheHit: p.cacheHit,
    attribution: p.attribution,
  };
}

export async function POST(request: NextRequest): Promise<Response> {
  const limit = checkRateLimit(`corridor-lcoh:${clientIp(request)}`, PROFILE_POLICY);
  if (!limit.allowed) return rateLimited(limit.retryAfterSeconds);

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) return validationError(err);
    return jsonError(400, "invalid_json", "Body must be JSON { site, lcohConfig }");
  }

  let lat: number;
  let lon: number;
  if ("h3" in parsed.site) {
    if (!isValidCell(parsed.site.h3)) {
      return jsonError(400, "invalid_h3", "site.h3 is not a valid H3 cell");
    }
    [lat, lon] = cellToLatLng(parsed.site.h3);
  } else {
    ({ lat, lon } = parsed.site);
  }

  const inputs = parsed.lcohConfig as LCOHInputs;
  const deps = mapModeDeps();

  // Resolve only the profile kinds the config actually uses.
  const wanted: { key: "pv" | "wind"; kind: ProfileKind }[] = [];
  if (inputs.pv) wanted.push({ key: "pv", kind: "pv_fixed" });
  if (inputs.wind) wanted.push({ key: "wind", kind: "wind_120" });
  if (wanted.length === 0) {
    return jsonError(400, "no_sources", "lcohConfig must enable pv and/or wind");
  }

  const profiles: ResourceProfiles = {};
  const provenance: Record<string, unknown> = {};
  const gates: Record<string, unknown> = {};
  for (const { key, kind } of wanted) {
    try {
      const p = await getResourceProfile({ lat, lon, kind }, deps);
      profiles[key] = p.cf;
      provenance[key] = provenanceOf(p);
      gates[key] = p.validation;
    } catch (err) {
      // Gate rejection or provider failure: a typed error, NEVER a number.
      const causes =
        err instanceof ProfileServiceError
          ? err.causes
          : [{ provider: "unknown", error: String(err) }];
      return jsonError(422, "site_unservable", "This site cannot be evaluated", {
        source: key,
        lat,
        lon,
        causes,
      });
    }
  }

  try {
    const results = simulateLCOH(inputs, profiles);
    return Response.json({
      lcoh: results.lcohUsdPerKg,
      decomposition: results.decomposition,
      lcoe: results.lcoe,
      performance: results.performance,
      provenance,
      gates,
    });
  } catch (err) {
    if (err instanceof EngineInputError) {
      return jsonError(422, "engine_input_error", err.message);
    }
    console.error("[api/corridor/lcoh-evaluate]", err);
    return jsonError(500, "internal_error", "Unexpected error");
  }
}
