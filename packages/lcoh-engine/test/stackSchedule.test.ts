import { describe, expect, it } from "vitest";
import { stackReplacementYears } from "../src/stackSchedule.js";

describe("stackReplacementYears", () => {
  it("schedules replacements when cumulative hours cross 40 000 h multiples", () => {
    // 8760 h/yr: crossings at 43 800 (yr 5), 87 600 (yr 10), 122 640 (yr 14), 166 440 (yr 19)
    expect(stackReplacementYears(8760, 40_000, 20)).toEqual([5, 10, 14, 19]);
  });

  it("skips a replacement that falls in the final operating year", () => {
    expect(stackReplacementYears(8760, 40_000, 5)).toEqual([]);
  });

  it("returns nothing when the plant never operates", () => {
    expect(stackReplacementYears(0, 40_000, 20)).toEqual([]);
  });

  it("handles a stack life shorter than one year with multiple events", () => {
    // 8760 h/yr, 4000 h stacks: crossings at 4k/8k (yr 1) and 12k/16k (yr 2);
    // the year-3 crossings are skipped as final-year events
    const years = stackReplacementYears(8760, 4000, 3);
    expect(years).toEqual([1, 1, 2, 2]);
  });
});
