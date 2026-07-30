import { describe, expect, it } from "vitest";
import { calendarYear, fraction } from "@h2map/units";
import type { ScheduleStep } from "@h2map/corridor-schema";
import { stepValue } from "../src/schedule";

const step = (y: number, v: number): ScheduleStep => ({
  fromCalendarYear: calendarYear(y),
  value: fraction(v),
});

const ETS = [step(2024, 0.4), step(2025, 0.7), step(2026, 1)];
const FUEL_EU = [
  step(2025, 0.02), step(2030, 0.06), step(2035, 0.145),
  step(2040, 0.31), step(2045, 0.62), step(2050, 0.8),
];

describe("stepValue — Excel IF-ladder boundary semantics", () => {
  it("ETS phase-in: 0 before 2024, 0.4/0.7 steps, 1.0 from 2026", () => {
    expect(stepValue(ETS, calendarYear(2023))).toBe(0);
    expect(stepValue(ETS, calendarYear(2024))).toBe(0.4);
    expect(stepValue(ETS, calendarYear(2025))).toBe(0.7);
    expect(stepValue(ETS, calendarYear(2026))).toBe(1);
    expect(stepValue(ETS, calendarYear(2050))).toBe(1);
  });

  it("FuelEU targets step exactly on the boundary years", () => {
    expect(stepValue(FUEL_EU, calendarYear(2024))).toBe(0);
    expect(stepValue(FUEL_EU, calendarYear(2025))).toBe(0.02);
    expect(stepValue(FUEL_EU, calendarYear(2029))).toBe(0.02);
    expect(stepValue(FUEL_EU, calendarYear(2030))).toBe(0.06);
    expect(stepValue(FUEL_EU, calendarYear(2034))).toBe(0.06);
    expect(stepValue(FUEL_EU, calendarYear(2035))).toBe(0.145);
    expect(stepValue(FUEL_EU, calendarYear(2040))).toBe(0.31);
    expect(stepValue(FUEL_EU, calendarYear(2045))).toBe(0.62);
    expect(stepValue(FUEL_EU, calendarYear(2049))).toBe(0.62);
    expect(stepValue(FUEL_EU, calendarYear(2050))).toBe(0.8);
    expect(stepValue(FUEL_EU, calendarYear(2060))).toBe(0.8);
  });
});
