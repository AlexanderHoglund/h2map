/**
 * Regulatory step functions (transcription §7): the Excel IF-ladders
 * (`IF(cal<2024, 0, IF(cal<2025, 0.4, …))`) as data. Value = the last step
 * with fromCalendarYear ≤ cal, else 0 — boundary semantics identical to the
 * ladders (2024→0.4, 2025→0.7, ≥2026→1.0; FuelEU 2025/2030/…/2050).
 * Steps are assumed sorted ascending (bundle order).
 */

import type { CalendarYear } from "@h2map/units";
import type { ScheduleStep } from "@h2map/corridor-schema";

export function stepValue(
  schedule: readonly ScheduleStep[],
  cal: CalendarYear,
): number {
  let value = 0;
  for (const step of schedule) {
    if (step.fromCalendarYear <= cal) value = step.value;
    else break;
  }
  return value;
}
