/**
 * Model timeline (Calculation!D..AQ, transcription §2): year index 1..N,
 * calendar year = startYear + idx − 1. Only horizon-length arrays are
 * modeled — the workbook's guard `IF(idx <= horizon, …, 0)` becomes
 * "years beyond the horizon do not exist".
 */

import { calendarYear, yearIndex, type CalendarYear } from "@h2map/units";
import type { Timeline } from "@h2map/corridor-schema";

export function buildTimeline(startYear: CalendarYear, horizonYears: number): Timeline {
  return {
    startYear,
    horizonYears,
    years: Array.from({ length: horizonYears }, (_, i) => ({
      idx: yearIndex(i + 1),
      calendarYear: calendarYear(startYear + i),
    })),
  };
}
