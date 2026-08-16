/**
 * Retired vessel classes: kept resolvable, kept out of the way.
 *
 * The v1 catalogue's seven rows are retained verbatim in every later bundle
 * so a scenario saved against them reproduces its original numbers. That is
 * deliberate and must not be "cleaned up" — deleting them makes
 * `getVesselType` throw (it has no fallback, unlike `getCountry`) and breaks
 * every stored project pinning one.
 *
 * But retained is not the same as offered. Several retired rows are
 * superseded by a researched row for the SAME ship: `handymax-bulk-58k`
 * reads 3.200 GJ/nm where `bulk-handymax-58k` reads 2.334, a 27% difference
 * in derived burn. Whoever picks the wrong one gets a quietly wrong answer,
 * so new work must not be able to reach them.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRefBundle, resolveScenario } from "@h2map/corridor-schema";
import { defaultScenario, emptyScenario, clearOverrides } from "../../../apps/web/lib/corridor/scenarioDefaults";

const bundle = parseRefBundle(
  JSON.parse(
    readFileSync(
      new URL("../../../data/corridor-ref/2026-08-17-vessel-v3.json", import.meta.url),
      "utf8",
    ),
  ),
);

const retired = () => bundle.vesselTypes.filter((v) => v.deprecated);

describe("retired vessel classes", () => {
  it("are still present, so saved scenarios keep resolving", () => {
    // The seven v1 ids. If a future bundle drops one, a stored project
    // pinning it stops loading entirely.
    for (const id of [
      "tanker-35k",
      "tanker-80k",
      "bulk-60k",
      "container-5k",
      "container-15k",
      "roro-ferry",
      "handymax-bulk-58k",
    ]) {
      expect(bundle.vesselTypes.find((v) => v.id === id), id).toBeDefined();
    }
  });

  it("still resolve without throwing", () => {
    for (const v of retired()) {
      const s = defaultScenario();
      s.vessel.typeId = v.id;
      expect(() => resolveScenario(s, bundle), v.id).not.toThrow();
    }
  });

  it("are all marked deprecated, which is what hides them from the picker", () => {
    // The UI filters on this flag alone. An unflagged retired row would be
    // silently offered for new work.
    expect(retired()).toHaveLength(7);
  });

  it("no shipped default points at one", () => {
    // The regression this file exists for: the app default USED to pin the
    // retired Handymax, so every new project started on superseded energy.
    for (const [name, s] of [
      ["default", defaultScenario()],
      ["empty", emptyScenario()],
      ["sweep baseline", clearOverrides(defaultScenario())],
    ] as const) {
      const row = bundle.vesselTypes.find((v) => v.id === s.vessel.typeId);
      expect(row, `${name}: ${s.vessel.typeId} missing`).toBeDefined();
      expect(row!.deprecated ?? false, `${name} pins retired ${row!.id}`).toBe(false);
    }
  });

  it("the superseding row is a materially different ship, not a rename", () => {
    // Why an alias was rejected. Same class, same dwt, 27% less energy —
    // aliasing the id would have silently re-priced saved scenarios.
    const old = bundle.vesselTypes.find((v) => v.id === "handymax-bulk-58k")!;
    const now = bundle.vesselTypes.find((v) => v.id === "bulk-handymax-58k")!;
    expect(now.gjPerNm / old.gjPerNm - 1).toBeLessThan(-0.25);
  });
});
