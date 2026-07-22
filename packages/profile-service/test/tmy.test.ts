import { describe, expect, it } from "vitest";
import { buildTmy } from "../src/tmy";
import { HOURS_PER_YEAR, MONTH_START_HOUR } from "../src/time";

function constantYear(year: number, value: number): { year: number; cf: number[] } {
  return { year, cf: new Array<number>(HOURS_PER_YEAR).fill(value) };
}

describe("buildTmy", () => {
  it("passes a single year through as-is", () => {
    const y = constantYear(2020, 0.42);
    const tmy = buildTmy([y]);
    expect(tmy.cf).toEqual(y.cf);
    expect(tmy.selectedYearByMonth).toEqual(new Array(12).fill(2020));
  });

  it("selects the median-like year among constant years", () => {
    // 0.5 is the middle of {0.1, 0.5, 0.9}: its CDF is closest to the pooled CDF.
    const tmy = buildTmy([
      constantYear(2019, 0.1),
      constantYear(2020, 0.5),
      constantYear(2021, 0.9),
    ]);
    expect(tmy.selectedYearByMonth).toEqual(new Array(12).fill(2020));
    expect(tmy.cf.every((v) => v === 0.5)).toBe(true);
  });

  it("selects per month independently and stitches", () => {
    // Year A is typical in January, extreme in February; year B vice versa.
    // A third year pins the long-term CDF between them.
    const a = constantYear(2019, 0.5);
    const b = constantYear(2020, 0.5);
    const c = constantYear(2021, 0.5);
    const janEnd = MONTH_START_HOUR[1]!;
    const febEnd = MONTH_START_HOUR[2]!;
    // January: a=0.5, b=0.9, c=0.55 → pool median near 0.55.
    for (let h = 0; h < janEnd; h++) {
      b.cf[h] = 0.9;
      c.cf[h] = 0.55;
    }
    // February: a=0.9, b=0.5, c=0.55.
    for (let h = janEnd; h < febEnd; h++) {
      a.cf[h] = 0.9;
      c.cf[h] = 0.55;
    }
    const tmy = buildTmy([a, b, c]);
    expect(tmy.selectedYearByMonth[0]).toBe(2021);
    expect(tmy.selectedYearByMonth[1]).toBe(2021);
    expect(tmy.cf[0]).toBe(0.55);
    expect(tmy.cf[janEnd]).toBe(0.55);
    // March onward all years agree.
    expect(tmy.cf[febEnd]).toBe(0.5);
    expect(tmy.cf).toHaveLength(HOURS_PER_YEAR);
  });

  it("breaks ties toward the earliest year, deterministically", () => {
    const tmy = buildTmy([constantYear(2018, 0.3), constantYear(2017, 0.3)]);
    expect(tmy.selectedYearByMonth).toEqual(new Array(12).fill(2017));
  });

  it("rejects wrong-length years and empty input", () => {
    expect(() => buildTmy([])).toThrow(/no input years/);
    expect(() => buildTmy([{ year: 2020, cf: [0.1] }])).toThrow(/8760/);
  });
});
