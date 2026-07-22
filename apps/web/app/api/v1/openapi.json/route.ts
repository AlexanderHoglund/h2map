import { z } from "zod";
import {
  lcohInputsSchema,
  profileKindSchema,
  simulateBodySchema,
} from "@/lib/api/schemas";

/**
 * GET /api/v1/openapi.json — OpenAPI 3.1 description of the v1 API, with
 * request schemas derived from the zod boundary schemas so the two cannot
 * drift apart.
 */
export function GET(): Response {
  return Response.json(buildDocument());
}

function toSchema(schema: z.ZodType): unknown {
  return z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
}

function buildDocument(): unknown {
  const errorSchema = {
    type: "object",
    properties: {
      error: {
        type: "object",
        properties: {
          code: { type: "string" },
          message: { type: "string" },
          details: {},
        },
        required: ["code", "message"],
      },
    },
    required: ["error"],
  };

  return {
    openapi: "3.1.0",
    info: {
      title: "H2MAP LCOH API",
      version: "1.0.0",
      description:
        "Global LCOH Explorer API: TMY resource profiles (Open-Meteo / PVGIS / NASA POWER with fallback), the reference-mode LCOH engine, and country default packs. Non-commercial use; provider attributions are included in profile responses.",
    },
    paths: {
      "/api/v1/resource-profiles": {
        get: {
          summary: "Get a TMY capacity-factor profile for a location",
          parameters: [
            {
              name: "lat",
              in: "query",
              required: true,
              schema: { type: "number", minimum: -90, maximum: 90 },
            },
            {
              name: "lon",
              in: "query",
              required: true,
              schema: { type: "number", minimum: -180, maximum: 180 },
            },
            {
              name: "kind",
              in: "query",
              required: true,
              schema: toSchema(profileKindSchema),
            },
          ],
          responses: {
            "200": {
              description:
                "8760-hour capacity-factor profile (quantized coordinate, dataset version, provider attribution)",
            },
            "400": { description: "Validation error", content: { "application/json": { schema: errorSchema } } },
            "429": { description: "Rate limited" },
            "502": { description: "All providers failed", content: { "application/json": { schema: errorSchema } } },
          },
        },
      },
      "/api/v1/simulate": {
        post: {
          summary: "Run an LCOH simulation",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: toSchema(simulateBodySchema) },
            },
          },
          responses: {
            "200": {
              description:
                "Engine results (LCOH, exact decomposition, annual table, totals, performance) plus profile provenance and hashes",
            },
            "400": { description: "Validation or engine input error", content: { "application/json": { schema: errorSchema } } },
            "429": { description: "Rate limited" },
            "502": { description: "Profile providers failed", content: { "application/json": { schema: errorSchema } } },
          },
        },
      },
      "/api/v1/defaults": {
        get: {
          summary: "Country default parameter packs",
          parameters: [
            {
              name: "country",
              in: "query",
              required: false,
              schema: { type: "string", minLength: 2, maxLength: 2 },
            },
          ],
          responses: {
            "200": { description: "One pack (?country=) or all packs" },
            "404": { description: "Unknown country", content: { "application/json": { schema: errorSchema } } },
          },
        },
      },
    },
    components: {
      schemas: {
        LCOHInputs: toSchema(lcohInputsSchema),
        Error: errorSchema,
      },
    },
  };
}
