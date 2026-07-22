import { HOURS_PER_YEAR } from "./constants.js";
import type { LCOHInputs, ResourceProfiles } from "./types.js";

export class EngineInputError extends Error {
  constructor(
    public readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
    this.name = "EngineInputError";
  }
}

function requireFinite(path: string, v: number): void {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new EngineInputError(path, `must be a finite number, got ${v}`);
  }
}

function requireMin(path: string, v: number, min: number): void {
  requireFinite(path, v);
  if (v < min) throw new EngineInputError(path, `must be >= ${min}, got ${v}`);
}

function requirePositive(path: string, v: number): void {
  requireFinite(path, v);
  if (v <= 0) throw new EngineInputError(path, `must be > 0, got ${v}`);
}

function requireFraction(path: string, v: number, maxInclusive = true): void {
  requireFinite(path, v);
  const okUpper = maxInclusive ? v <= 1 : v < 1;
  if (v < 0 || !okUpper) {
    throw new EngineInputError(
      path,
      `must be in [0, 1${maxInclusive ? "]" : ")"}, got ${v}`,
    );
  }
}

function validateProfile(path: string, profile: readonly number[]): void {
  if (profile.length !== HOURS_PER_YEAR) {
    throw new EngineInputError(
      path,
      `must have exactly ${HOURS_PER_YEAR} hourly values, got ${profile.length}`,
    );
  }
  for (let h = 0; h < profile.length; h++) {
    const cf = profile[h];
    if (
      typeof cf !== "number" ||
      !Number.isFinite(cf) ||
      cf < 0 ||
      cf > 1
    ) {
      throw new EngineInputError(
        `${path}[${h}]`,
        `capacity factor must be a finite number in [0, 1], got ${cf}`,
      );
    }
  }
}

export function validateInputs(
  inputs: LCOHInputs,
  profiles: ResourceProfiles,
): void {
  const { finance, electrolyzer, pv, wind, grid, water } = inputs;

  requirePositive("finance.lifetimeYears", finance.lifetimeYears);
  if (!Number.isInteger(finance.lifetimeYears)) {
    throw new EngineInputError(
      "finance.lifetimeYears",
      `must be an integer, got ${finance.lifetimeYears}`,
    );
  }
  requireMin("finance.discountRate", finance.discountRate, 0);

  requirePositive("electrolyzer.capacityMw", electrolyzer.capacityMw);
  requireMin("electrolyzer.capexUsdPerKw", electrolyzer.capexUsdPerKw, 0);
  requireMin(
    "electrolyzer.opexFractionPerYear",
    electrolyzer.opexFractionPerYear,
    0,
  );
  requireFraction("electrolyzer.efficiencyLhv", electrolyzer.efficiencyLhv);
  if (electrolyzer.efficiencyLhv === 0) {
    throw new EngineInputError("electrolyzer.efficiencyLhv", "must be > 0");
  }
  requireFraction(
    "electrolyzer.degradationPerYear",
    electrolyzer.degradationPerYear,
    false,
  );
  requirePositive(
    "electrolyzer.stackLifetimeHours",
    electrolyzer.stackLifetimeHours,
  );
  requireMin(
    "electrolyzer.stackReplacementCostFraction",
    electrolyzer.stackReplacementCostFraction,
    0,
  );

  if (!pv && !wind && !grid) {
    throw new EngineInputError(
      "inputs",
      "at least one supply source (pv, wind, grid) must be configured",
    );
  }

  for (const [name, source] of [
    ["pv", pv],
    ["wind", wind],
  ] as const) {
    if (!source) continue;
    requirePositive(`${name}.capacityMw`, source.capacityMw);
    if (source.pricing.mode === "lcoe") {
      requireMin(`${name}.pricing.usdPerMwh`, source.pricing.usdPerMwh, 0);
    } else {
      requireMin(
        `${name}.pricing.capexUsdPerKw`,
        source.pricing.capexUsdPerKw,
        0,
      );
      requireMin(
        `${name}.pricing.opexFractionPerYear`,
        source.pricing.opexFractionPerYear,
        0,
      );
    }
    const profile = profiles[name];
    if (!profile) {
      throw new EngineInputError(
        `profiles.${name}`,
        `required because inputs.${name} is configured`,
      );
    }
    validateProfile(`profiles.${name}`, profile);
  }

  if (grid) {
    requireMin("grid.maxImportMw", grid.maxImportMw, 0);
    requireMin("grid.priceUsdPerMwh", grid.priceUsdPerMwh, 0);
    requireMin(
      "grid.emissionFactorTco2PerMwh",
      grid.emissionFactorTco2PerMwh,
      0,
    );
  }

  requireMin("water.priceUsdPerM3", water.priceUsdPerM3, 0);
  requireMin(
    "water.transportUsdPerM3Per100Km",
    water.transportUsdPerM3Per100Km,
    0,
  );
  requireMin("water.transportDistanceKm", water.transportDistanceKm, 0);
  requireMin("water.pumpingHeadM", water.pumpingHeadM, 0);
}
