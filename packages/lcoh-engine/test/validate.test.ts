import { describe, expect, it } from "vitest";
import { simulateLCOH } from "../src/index";
import { EngineInputError } from "../src/validate";
import { constantProfile, pvOnlyInputs } from "./helpers";

describe("input validation", () => {
  it("rejects a profile that is not 8760 hours long", () => {
    expect(() =>
      simulateLCOH(pvOnlyInputs(), { pv: [0.5, 0.5, 0.5] }),
    ).toThrow(EngineInputError);
  });

  it("rejects a missing profile for a configured source", () => {
    expect(() => simulateLCOH(pvOnlyInputs(), {})).toThrow(
      /profiles\.pv/,
    );
  });

  it("rejects capacity factors outside [0, 1]", () => {
    const profile = constantProfile(0.5);
    profile[100] = 1.2;
    expect(() => simulateLCOH(pvOnlyInputs(), { pv: profile })).toThrow(
      /profiles\.pv\[100\]/,
    );
  });

  it("rejects a configuration with no supply source at all", () => {
    const inputs = pvOnlyInputs();
    delete inputs.pv;
    expect(() => simulateLCOH(inputs, {})).toThrow(
      /at least one supply source/,
    );
  });

  it("rejects non-integer lifetimes and negative rates", () => {
    const a = pvOnlyInputs();
    a.finance.lifetimeYears = 20.5;
    expect(() => simulateLCOH(a, { pv: constantProfile(1) })).toThrow(
      /lifetimeYears/,
    );
    const b = pvOnlyInputs();
    b.finance.discountRate = -0.01;
    expect(() => simulateLCOH(b, { pv: constantProfile(1) })).toThrow(
      /discountRate/,
    );
  });

  it("rejects a configuration that can never produce hydrogen", () => {
    expect(() =>
      simulateLCOH(pvOnlyInputs(), { pv: constantProfile(0) }),
    ).toThrow(/no hydrogen/);
  });
});
