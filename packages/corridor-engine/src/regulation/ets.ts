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
  idx = 1,
): number {
  // Fix #3 — optional annual EUA escalation. Default 0 keeps the flat
  // nominal price (Excel; a falling real price under inflation).
  const effectiveEua =
    params.euaEurPerTonne * Math.pow(1 + (params.euaEscalation ?? 0), idx - 1);
  // D3 — maritime ETS covers CH4 + N2O (as CO2e via GWP100) from 2026 when
  // gas coverage is enabled; the workbook counts CO2 only (gases absent).
  const gases = params.gases;
  const co2ePerTonneFuel =
    fuel.combustionEf +
    (gases && cal >= gases.fromCalendarYear
      ? gases.ch4TPerTonne * gases.gwpCh4 + gases.n2oTPerTonne * gases.gwpN2o
      : 0);
  return (
    (vessels *
      fuel.tonnesPerVesselYear *
      co2ePerTonneFuel *
      stepValue(params.phaseIn, cal) *
      params.scope *
      effectiveEua *
      params.eurUsd) /
    1e6
  );
}
