/**
 * EU ETS cost, $m (Calculation r28/r54, transcription §7):
 *   vessels × fuelTonnes × combustionEF × phaseIn(cal) × scope × EUA€ × EURUSD / 1e6
 * Phase-in by calendar year: 0 before 2024, 0.4 in 2024, 0.7 in 2025, 1.0
 * from 2026 (schedule data from the reference bundle).
 */

import type { CalendarYear } from "@h2map/units";
import type { EtsParams, FuelParams } from "@h2map/corridor-schema";
import { stepValue } from "../schedule";

export function etsCostUsdM(
  params: EtsParams,
  fuel: FuelParams,
  vessels: number,
  cal: CalendarYear,
): number {
  return (
    (vessels *
      fuel.tonnesPerVesselYear *
      fuel.combustionEf *
      stepValue(params.phaseIn, cal) *
      params.scope *
      params.euaEurPerTonne *
      params.eurUsd) /
    1e6
  );
}
