import { describe, expect, it } from "vitest";
import { windCf } from "../src/powerCurve";
import {
  selectTurbineClass,
  TURBINE_CLASS_CURVES,
} from "../src/turbineClasses";

describe("selectTurbineClass", () => {
  it("maps mean hub-height speed to IEC bands", () => {
    expect(selectTurbineClass(11)).toBe("I");
    expect(selectTurbineClass(9.5)).toBe("I"); // boundary inclusive
    expect(selectTurbineClass(8)).toBe("II");
    expect(selectTurbineClass(7.5)).toBe("II"); // boundary inclusive
    expect(selectTurbineClass(6)).toBe("III");
    expect(selectTurbineClass(0)).toBe("III");
  });
});

describe("TURBINE_CLASS_CURVES", () => {
  const classes = ["I", "II", "III"] as const;

  it("are well-formed: cut-in 3, cut-out 25, ascending speeds, monotone power", () => {
    for (const c of classes) {
      const { speedsMs, powerKw, ratedKw } = TURBINE_CLASS_CURVES[c];
      expect(speedsMs[0]).toBe(3);
      expect(speedsMs[speedsMs.length - 1]).toBe(25);
      expect(powerKw[powerKw.length - 1]).toBe(ratedKw);
      for (let i = 1; i < speedsMs.length; i++) {
        expect(speedsMs[i]!).toBeGreaterThan(speedsMs[i - 1]!);
        expect(powerKw[i]!).toBeGreaterThanOrEqual(powerKw[i - 1]!);
      }
    }
  });

  it("reach rated at their class rated speed (I latest, III earliest)", () => {
    // Full power at 12.5 / 11.5 / 10.5 respectively.
    expect(windCf(TURBINE_CLASS_CURVES.I, 12.5)).toBeCloseTo(1, 6);
    expect(windCf(TURBINE_CLASS_CURVES.II, 11.5)).toBeCloseTo(1, 6);
    expect(windCf(TURBINE_CLASS_CURVES.III, 10.5)).toBeCloseTo(1, 6);
  });

  it("lower class delivers higher CF in light winds (the whole point)", () => {
    for (const v of [5, 6, 7, 8]) {
      const cfI = windCf(TURBINE_CLASS_CURVES.I, v)!;
      const cfII = windCf(TURBINE_CLASS_CURVES.II, v)!;
      const cfIII = windCf(TURBINE_CLASS_CURVES.III, v)!;
      expect(cfIII).toBeGreaterThan(cfII);
      expect(cfII).toBeGreaterThan(cfI);
    }
  });

  it("cut out above 25 m/s and produce nothing below cut-in", () => {
    for (const c of classes) {
      expect(windCf(TURBINE_CLASS_CURVES[c], 26)).toBe(0);
      expect(windCf(TURBINE_CLASS_CURVES[c], 2)).toBe(0);
    }
  });
});
