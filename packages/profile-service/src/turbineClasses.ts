import type { TurbineCurve } from "./types";

/**
 * IEC 61400-1 wind-class turbine curves for improved-mode class selection.
 *
 * A single mid-market machine applied everywhere penalises low-wind sites: real
 * developers there deploy a lower wind class — same generator, larger rotor, so
 * a lower *specific power* (rated kW per m² of swept area). Specific power is
 * the dominant driver of capacity factor at low wind speeds, because a bigger
 * rotor reaches rated power at a lower wind speed and harvests far more energy
 * in light winds. Ignoring it is a systematic penalty on a whole band of sites.
 *
 * We model the three classes from the one digitised curve we have — the DB
 * `generic-5.6MW` (a V162-5.6 shape, ~162 m rotor, ~272 W/m², rated at 12.0 m/s;
 * mirror of data/turbines/generic-5.6MW.json) — by repositioning its rated wind
 * speed to the spec's class targets while holding cut-in (3.0 m/s) and cut-out
 * (25.0 m/s) fixed and preserving the digitised S-shape between. Rated power is
 * only the CF normaliser (shape scales linearly to installed capacity), so the
 * classes share it and differ purely in the speed at which rated is reached.
 * Representative rotor diameters are quoted for context, not digitised per unit.
 *
 * Sources: IEC 61400-1 Ed.3 wind classes; rated-speed / specific-power framing
 * per Wiser et al., "Land-based wind market report" (LBNL) and the base V162
 * datasheet shape. These are documented approximations, not per-model
 * datasheet digitisations.
 */

/** Base digitised curve (mirror of DB `generic-5.6MW`), rated at 12.0 m/s. */
const BASE_SPEEDS = [
  3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0, 9.5, 10.0,
  10.5, 11.0, 11.5, 12.0,
] as const;
const BASE_POWER = [
  50, 120, 240, 400, 610, 870, 1180, 1540, 1960, 2440, 2970, 3540, 4110, 4640,
  5070, 5370, 5530, 5590, 5600,
] as const;
const BASE_RATED_MS = 12.0;
const CUT_IN_MS = 3.0;
const CUT_OUT_MS = 25.0;
const RATED_KW = 5600;

export type IecClass = "I" | "II" | "III";

/** Rated wind speed (m/s) and representative rotor per IEC wind class. */
const CLASS_SPEC: Record<IecClass, { ratedMs: number; rotorM: number; wpm2: number }> = {
  I: { ratedMs: 12.5, rotorM: 150, wpm2: 317 },
  II: { ratedMs: 11.5, rotorM: 162, wpm2: 272 },
  III: { ratedMs: 10.5, rotorM: 172, wpm2: 241 },
};

/**
 * Reposition the base curve so it reaches rated power at `ratedMs`: the
 * cut-in→rated segment is linearly mapped onto [cut-in, ratedMs], then held
 * flat to cut-out. Lower ratedMs ⇒ rated reached sooner ⇒ higher low-wind CF.
 */
function classCurve(id: IecClass): TurbineCurve {
  const { ratedMs } = CLASS_SPEC[id];
  const scale = (ratedMs - CUT_IN_MS) / (BASE_RATED_MS - CUT_IN_MS);
  const speedsMs: number[] = BASE_SPEEDS.map(
    (v) => CUT_IN_MS + (v - CUT_IN_MS) * scale,
  );
  const powerKw: number[] = [...BASE_POWER];
  // Flat from rated to cut-out (constant power; cut-out is the last sample).
  speedsMs.push(CUT_OUT_MS);
  powerKw.push(RATED_KW);
  return { id: `iec-class-${id}-5.6MW`, ratedKw: RATED_KW, speedsMs, powerKw };
}

export const TURBINE_CLASS_CURVES: Record<IecClass, TurbineCurve> = {
  I: classCurve("I"),
  II: classCurve("II"),
  III: classCurve("III"),
};

/**
 * Select a wind class from the annual-mean hub-height wind speed. IEC classes
 * are defined on reference wind speed, so selection uses the *uncorrected*
 * mean (independent of the air-density correction). Bands per the rank-fidelity
 * spec: ≥9.5 → I, 7.5–9.5 → II, <7.5 → III.
 */
export function selectTurbineClass(meanVHubMs: number): IecClass {
  if (meanVHubMs >= 9.5) return "I";
  if (meanVHubMs >= 7.5) return "II";
  return "III";
}
