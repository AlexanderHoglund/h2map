import type { TurbineCurve } from "./types";

/**
 * Turbine output in kW at wind speed v (m/s), linear interpolation on the
 * curve samples. Below the first sample (cut-in) and above the last sample
 * (cut-out) the turbine produces 0 — the DB curve's last sample IS cut-out.
 */
export function turbinePowerKw(curve: TurbineCurve, v: number): number {
  const { speedsMs, powerKw } = curve;
  if (!Number.isFinite(v) || v < speedsMs[0]! || v > speedsMs[speedsMs.length - 1]!) {
    return 0;
  }
  let i = 0;
  while (i + 2 < speedsMs.length && speedsMs[i + 1]! < v) i++;
  const v0 = speedsMs[i]!;
  const v1 = speedsMs[i + 1]!;
  const p0 = powerKw[i]!;
  const p1 = powerKw[i + 1]!;
  if (v1 === v0) return p0;
  return p0 + ((v - v0) / (v1 - v0)) * (p1 - p0);
}

/** Capacity factor for one hour at hub-height speed v; null passes through as a gap. */
export function windCf(curve: TurbineCurve, v: number | null): number | null {
  if (v === null || !Number.isFinite(v)) return null;
  return Math.min(1, Math.max(0, turbinePowerKw(curve, v) / curve.ratedKw));
}
