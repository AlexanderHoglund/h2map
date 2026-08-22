import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRefBundle } from "../src/ref/bundle";
import { resolveScenario } from "../src/resolve";
import { migrateScenarioInput } from "../src/migrate";
import type { ScenarioInput } from "../src/scenario";

/**
 * What the fossil counterfactual IS.
 *
 * The workbook benchmarks fossil vessel CAPEX to zero — the ships are
 * already afloat, so the comparison charges the green corridor for newbuilds
 * and the fossil one for nothing. Right for "what does switching cost?",
 * wrong for "what does this trade lane cost, either way?", and both
 * published studies reconstructed against this model are the second kind.
 */

const bundle = parseRefBundle(
  JSON.parse(
    readFileSync(
      new URL("../../../data/corridor-ref/2026-08-21-cruise-v6.json", import.meta.url),
      "utf8",
    ),
  ),
);

const scenario = (edit?: (s: ScenarioInput) => void): ScenarioInput => {
  const s = migrateScenarioInput(
    JSON.parse(
      readFileSync(
        new URL("../../../fixtures/golden/corridor/excel-baseline.input.json", import.meta.url),
        "utf8",
      ),
    ) as unknown,
  ).input;
  s.refBundleId = bundle.bundleId;
  s.vessel.typeId = "vlac-93k";
  s.vessel.fossil.capexUsdMPerShip = null; // on the benchmark, not overridden
  edit?.(s);
  return s;
};

const fossilVesselCapex = (edit?: (s: ScenarioInput) => void): number =>
  resolveScenario(scenario(edit), bundle).fossil.vesselCapexUsdMPerShip
    .value as number;

describe("fossilFleetBasis", () => {
  it("defaults to the existing-fleet zero, so the Excel behaviour is untouched", () => {
    // Absent flag must be the workbook rule — this is what keeps the golden
    // fixture passing without the fixture knowing the flag exists.
    expect(fossilVesselCapex()).toBe(0);
    expect(fossilVesselCapex((s) => (s.flags = { ...s.flags, fossilFleetBasis: "existing" }))).toBe(0);
  });

  it("costs newbuild conventional tonnage when asked", () => {
    const capex = fossilVesselCapex(
      (s) => (s.flags = { ...s.flags, fossilFleetBasis: "newbuild" }),
    );
    const row = bundle.vesselTypes.find((v) => v.id === "vlac-93k")!;
    expect(capex).toBe(row.capexUsdM);
    expect(capex).toBeGreaterThan(0);
  });

  it("charges NO green-fuel premium on the fossil side", () => {
    // A conventional ship does not pay an ammonia-readiness premium. If this
    // ever inverts, the fossil counterfactual has been costed as a green
    // ship, which would understate the gap.
    const fossil = fossilVesselCapex(
      (s) => (s.flags = { ...s.flags, fossilFleetBasis: "newbuild" }),
    );
    const green = resolveScenario(
      scenario((s) => (s.flags = { ...s.flags, fossilFleetBasis: "newbuild" })),
      bundle,
    ).green.vesselCapexUsdMPerShip.value as number;
    expect(green).toBeGreaterThan(fossil);
  });

  it("leaves the port and logistics rules on the existing-infrastructure basis", () => {
    // Deliberate: a greenfield fossil corridor still loads at existing oil
    // terminals. Needing new SHIPS is a different claim from needing new
    // TERMINALS, and folding them together would overstate the fossil side.
    const existing = resolveScenario(scenario(), bundle).fossil;
    const newbuild = resolveScenario(
      scenario((s) => (s.flags = { ...s.flags, fossilFleetBasis: "newbuild" })),
      bundle,
    ).fossil;
    expect(newbuild.portStorageCapexUsdM.value).toBe(
      existing.portStorageCapexUsdM.value,
    );
    expect(newbuild.bargeCapexUsdM.value).toBe(existing.bargeCapexUsdM.value);
  });

  it("still yields to an explicit override", () => {
    const capex = fossilVesselCapex((s) => {
      s.flags = { ...s.flags, fossilFleetBasis: "newbuild" };
      s.vessel.fossil.capexUsdMPerShip = 42;
    });
    expect(capex).toBe(42);
  });
});
