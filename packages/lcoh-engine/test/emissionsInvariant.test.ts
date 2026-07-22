/**
 * Source-methodology invariant: desalination and pumping electricity are
 * counted ONLY in the emissions ledger. Toggling them must change emissions
 * (when a grid emission factor applies) and must never change cost.
 */
import { describe, expect, it } from "vitest";
import { simulateLCOH } from "../src/index";
import { constantProfile, pvOnlyInputs } from "./helpers";

describe("water electricity never enters the cost side", () => {
  const profiles = { pv: constantProfile(0.5) };

  function withWaterElectricity(on: boolean) {
    const inputs = pvOnlyInputs();
    inputs.grid = {
      maxImportMw: 100,
      priceUsdPerMwh: 30,
      emissionFactorTco2PerMwh: 0.4,
    };
    inputs.water.desalinated = on;
    inputs.water.pumpingHeadM = on ? 200 : 0;
    return simulateLCOH(inputs, profiles);
  }

  it("LCOH and every cost component are identical with and without desalination/pumping", () => {
    const off = withWaterElectricity(false);
    const on = withWaterElectricity(true);
    expect(on.lcohUsdPerKg).toBe(off.lcohUsdPerKg);
    expect(on.decomposition).toEqual(off.decomposition);
    expect(on.totals.electrolyzerOpexUsd).toBe(off.totals.electrolyzerOpexUsd);
  });

  it("emissions increase when desalination/pumping electricity applies", () => {
    const off = withWaterElectricity(false);
    const on = withWaterElectricity(true);
    expect(on.totals.emissionsTco2e).toBeGreaterThan(off.totals.emissionsTco2e);
    // Δ = water m³ × (3.75 + 0.4·200/100) kWh/m³ × 0.4 t/MWh over all years
    const expectedDelta =
      (on.totals.waterM3 * (3.75 + 0.8) * 0.4) / 1000;
    expect(
      Math.abs(
        on.totals.emissionsTco2e - off.totals.emissionsTco2e - expectedDelta,
      ) / expectedDelta,
    ).toBeLessThan(1e-9);
  });
});
