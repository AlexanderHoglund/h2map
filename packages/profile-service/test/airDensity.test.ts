import { describe, expect, it } from "vitest";
import {
  airDensity,
  equivalentWindSpeed,
  isaPressurePa,
  isaTempK,
} from "../src/airDensity";

describe("ISA atmosphere", () => {
  it("matches standard temperature and pressure at reference elevations", () => {
    expect(isaTempK(0)).toBeCloseTo(288.15, 6);
    expect(isaPressurePa(0)).toBeCloseTo(101325, 3);
    // ~795 hPa at 2000 m, ~616 hPa at 4000 m (standard atmosphere).
    expect(isaPressurePa(2000) / 100).toBeCloseTo(795, 0);
    expect(isaPressurePa(4000) / 100).toBeCloseTo(616, 0);
  });
});

describe("air density", () => {
  it("is ~1.225 at sea level and falls with elevation (ISA temperature)", () => {
    expect(airDensity(0, null).rho).toBeCloseTo(1.225, 2);
    // Standard-atmosphere density: ~0.957 at 2500 m, ~0.819 at 4000 m.
    expect(airDensity(2500, null).rho).toBeCloseTo(0.957, 2);
    expect(airDensity(4000, null).rho).toBeCloseTo(0.819, 2);
  });

  it("uses actual hourly temperature when supplied (colder = denser)", () => {
    const isa = airDensity(1000, null).rho;
    const cold = airDensity(1000, -20).rho;
    const hot = airDensity(1000, 35).rho;
    expect(cold).toBeGreaterThan(isa);
    expect(hot).toBeLessThan(isa);
  });

  it("clamps physically impossible densities", () => {
    const r = airDensity(0, -273); // ~0 K → absurd density
    expect(r.clamped).toBe(true);
    expect(r.rho).toBeGreaterThanOrEqual(0.6);
    expect(r.rho).toBeLessThanOrEqual(1.4);
  });
});

describe("equivalent wind speed", () => {
  it("is unchanged at reference density and reduced when thinner", () => {
    expect(equivalentWindSpeed(10, 1.225)).toBeCloseTo(10, 9);
    // At 4000 m (~0.82 kg/m³): 10 × (0.82/1.225)^(1/3) ≈ 8.74 m/s.
    expect(equivalentWindSpeed(10, 0.819)).toBeCloseTo(8.74, 2);
  });
});
