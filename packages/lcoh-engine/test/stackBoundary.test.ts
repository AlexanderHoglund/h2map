import { describe, expect, it } from "vitest";
import { stackReplacementYears } from "../src/stackSchedule";

/**
 * The stack-replacement schedule is DISCRETE, and that discreteness is the
 * documented cause of rank churn concentrating in one cost year (§33). These
 * tests pin the behaviour so it stays understood rather than being
 * rediscovered as a bug, and so a change to the schedule that removes the
 * steps has to be a deliberate decision.
 */

describe("stack replacement boundaries", () => {
  it("replaces in years 8 and 15 at the reference duty cycle", () => {
    // 6,719 operating hours a year against a 50,000 h stack — the figure a
    // live West Timor run reproduces. A 40,000 h stack would give 6/12/18,
    // which is what an older methodology table wrongly claimed.
    expect(stackReplacementYears(6719, 50_000, 20)).toEqual([8, 15]);
    expect(stackReplacementYears(6719, 40_000, 20)).toEqual([6, 12, 18]);
  });

  it("puts the second-replacement boundary at a different duty cycle per stack life", () => {
    // This is the mechanism: the same cell can sit on opposite sides of a
    // boundary in two cost years, because each cost year has its own stack
    // life. A 50k stack takes a second replacement well before a 75k one.
    const secondReplacementAt = (life: number): number => {
      for (let oph = 2000; oph <= 8760; oph += 10) {
        if (stackReplacementYears(oph, life, 20).length >= 2) return oph;
      }
      return Number.POSITIVE_INFINITY;
    };
    const at50k = secondReplacementAt(50_000);
    const at75k = secondReplacementAt(75_000);
    expect(at50k).toBeLessThan(at75k);
    // Roughly 5,500 vs 8,000 operating hours; assert the gap is material
    // rather than pinning exact thresholds the schedule may legitimately
    // shift by a few hours.
    expect(at75k - at50k).toBeGreaterThan(1500);
  });

  it("never lets the replacement count fall as duty cycle rises", () => {
    // Monotonicity: more running hours can never mean fewer replacements.
    // A violation would mean the schedule has an arithmetic fault.
    let prev = 0;
    for (let oph = 1000; oph <= 8760; oph += 100) {
      const n = stackReplacementYears(oph, 50_000, 20).length;
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
  });

  it("never schedules a replacement in the final year", () => {
    // Replacing the stack in the last year of the project would be capital
    // spent with no production left to earn it back.
    for (let oph = 1000; oph <= 8760; oph += 100) {
      for (const life of [50_000, 75_000, 100_000, 125_000]) {
        expect(stackReplacementYears(oph, life, 20)).not.toContain(20);
      }
    }
  });
});
