/**
 * Air-density normalisation of wind speed for the power-curve lookup
 * (IEC 61400-12-1). A turbine's power curve is defined at standard sea-level
 * density ρ₀ = 1.225 kg/m³; at a site with density ρ the power at a given wind
 * speed matches the sea-level curve at the equivalent speed
 *   v_eq = v_hub · (ρ / ρ₀)^(1/3).
 * Elevated sites are markedly less dense (~0.96 kg/m³ at 2500 m, ~0.82 at
 * 4000 m — a 22–33 % power reduction at a given speed), so ignoring density
 * overstates wind at exactly the high-elevation high-resource sites the map
 * exists to surface. Above rated speed the curve is flat, so the correction is
 * self-limiting there.
 *
 * All physical constants for the ISA model live here (single source).
 */

/** International Standard Atmosphere and gas constants. */
export const ISA = {
  seaLevelDensityKgM3: 1.225,
  seaLevelTempK: 288.15,
  seaLevelPressurePa: 101325,
  lapseRateKPerM: 0.0065,
  /** g·M/(R·L) exponent in the barometric formula. */
  pressureExponent: 5.25588,
  /** Specific gas constant for dry air, J/(kg·K). */
  gasConstantDryAir: 287.05,
  kelvinOffset: 273.15,
} as const;

/** Density outside this band is a data error (bad temperature/elevation). */
export const DENSITY_CLAMP: readonly [number, number] = [0.6, 1.4];

/** ISA temperature at elevation z (m), in kelvin. */
export function isaTempK(elevationM: number): number {
  return ISA.seaLevelTempK - ISA.lapseRateKPerM * elevationM;
}

/** ISA pressure at elevation z (m), in pascals. */
export function isaPressurePa(elevationM: number): number {
  const ratio = 1 - (ISA.lapseRateKPerM * elevationM) / ISA.seaLevelTempK;
  return ISA.seaLevelPressurePa * Math.pow(ratio, ISA.pressureExponent);
}

/**
 * Air density (kg/m³) from elevation and hourly air temperature.
 * `tempC` is °C; pass null to fall back to the ISA temperature at elevation.
 * Pressure follows the ISA barometric formula (elevation only); temperature is
 * the actual hourly value where available. Result is clamped to DENSITY_CLAMP.
 */
export function airDensity(elevationM: number, tempC: number | null): {
  rho: number;
  clamped: boolean;
} {
  const tempK =
    tempC != null && Number.isFinite(tempC)
      ? tempC + ISA.kelvinOffset
      : isaTempK(elevationM);
  const raw = isaPressurePa(elevationM) / (ISA.gasConstantDryAir * tempK);
  const [lo, hi] = DENSITY_CLAMP;
  const rho = Math.min(hi, Math.max(lo, raw));
  return { rho, clamped: rho !== raw };
}

/** Density-equivalent wind speed for the power-curve lookup. */
export function equivalentWindSpeed(vHub: number, rho: number): number {
  return vHub * Math.cbrt(rho / ISA.seaLevelDensityKgM3);
}
