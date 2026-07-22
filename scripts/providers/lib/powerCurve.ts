import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export interface TurbineCurve {
  id: string;
  ratedKw: number;
  cutInMs: number;
  cutOutMs: number;
  speedsMs: number[];
  powerKw: number[];
}

const CURVE_PATH = fileURLToPath(
  new URL("../../../data/turbines/generic-5.6MW.json", import.meta.url),
);

export async function loadTurbineCurve(): Promise<TurbineCurve> {
  return JSON.parse(await readFile(CURVE_PATH, "utf8")) as TurbineCurve;
}

/** Turbine output in kW at wind speed v (m/s), linear interpolation on the curve. */
export function turbinePowerKw(curve: TurbineCurve, v: number): number {
  if (!Number.isFinite(v) || v < curve.cutInMs || v >= curve.cutOutMs) return 0;
  const { speedsMs, powerKw } = curve;
  if (v >= speedsMs[speedsMs.length - 1]!) return powerKw[powerKw.length - 1]!;
  let i = 0;
  while (speedsMs[i + 1]! < v) i++;
  const v0 = speedsMs[i]!;
  const v1 = speedsMs[i + 1]!;
  const p0 = powerKw[i]!;
  const p1 = powerKw[i + 1]!;
  return p0 + ((v - v0) / (v1 - v0)) * (p1 - p0);
}

/** Capacity factor for one hour at hub-height speed v. */
export function windCf(curve: TurbineCurve, v: number | null): number | null {
  if (v === null) return null;
  return turbinePowerKw(curve, v) / curve.ratedKw;
}
