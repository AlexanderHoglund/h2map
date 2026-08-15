import { describe, expect, it } from "vitest";
import {
  isNonViable,
  isReducedFidelity,
  NON_VIABLE_ABOVE,
  lcohColor,
} from "../../apps/web/components/hexplorer/scale";

/**
 * The map's standing rule is that a seam is DISCLOSED, not smoothed over.
 * Two mechanisms implement it — PV renders no-data where PVGIS cannot serve
 * a cell, wind flags reduced-fidelity cells rather than masking them — and
 * these tests assert a reduced-fidelity value can never render
 * indistinguishably from a full-fidelity one.
 *
 * The scale module is pure (its only import is a type), so it tests here
 * even though apps/web has no runner of its own.
 */

describe("wind fallback is never indistinguishable from improved", () => {
  it("flags a fallback cell on the wind layer", () => {
    expect(isReducedFidelity("wind", "fallback")).toBe(true);
    expect(isReducedFidelity("wind", "improved")).toBe(false);
  });

  it("flags the best layer only when wind actually won the mix", () => {
    // A solar-only best is unaffected by the wind model's fidelity, so
    // flagging it would be a false warning.
    expect(isReducedFidelity("best", "fallback", 50)).toBe(true);
    expect(isReducedFidelity("best", "fallback", 0)).toBe(false);
    expect(isReducedFidelity("best", "fallback", null)).toBe(false);
  });

  it("never flags the solar layer, whatever the wind fidelity", () => {
    for (const f of ["fallback", "improved", null] as const) {
      expect(isReducedFidelity("solar", f)).toBe(false);
    }
  });

  it("treats unrecorded provenance as NOT improved-verified", () => {
    // Cells seeded before the provenance columns existed carry null. They
    // must not be asserted as improved — the honest position is that their
    // provenance is unknown, and the drawer says so. This test pins that a
    // null is not silently treated as "improved" anywhere in the predicate.
    expect(isReducedFidelity("wind", null)).toBe(false);
    // ...and that it is also not treated as "fallback", which would be an
    // equally false claim in the other direction.
    expect(isReducedFidelity("wind", null)).not.toBe(
      isReducedFidelity("wind", "fallback"),
    );
  });
});

describe("non-viable cells route to the mask, not the top colour", () => {
  it("masks above the documented ceiling", () => {
    expect(isNonViable(NON_VIABLE_ABOVE + 0.01)).toBe(true);
    expect(isNonViable(NON_VIABLE_ABOVE - 0.01)).toBe(false);
  });

  it("keeps an Atacama-style wind value out of the ramp entirely", () => {
    // Wind LCOH of 770-1,003 USD/kg at CF ~0.02 used to render identically
    // to 10.2 — a real number made to look like a plausible one.
    expect(isNonViable(770)).toBe(true);
    expect(isNonViable(1003)).toBe(true);
  });

  it("spans distinguishable colours across the real value range", () => {
    // The failure this guards: a domain that ends too low collapses every
    // expensive cell into one colour. Sample the observed 3.5-15.5 range
    // and require a good number of distinct colours.
    const seen = new Set<string>();
    for (let v = 3.5; v <= 15.5; v += 0.25) {
      if (isNonViable(v)) continue;
      seen.add(lcohColor(v, "solar").join(","));
    }
    expect(seen.size).toBeGreaterThanOrEqual(20);
  });
});
