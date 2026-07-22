import { describe, expect, it } from "vitest";
import { REFERENCE_DEFAULTS, simulateLCOH } from "../src/index";
import { constantProfile, tiledProfile } from "./helpers";

describe("performance", () => {
  it("runs a 20-year simulation in under 50 ms", () => {
    const profiles = {
      pv: tiledProfile(
        Array.from({ length: 24 }, (_, h) =>
          h >= 6 && h <= 18 ? Math.sin(((h - 6) / 12) * Math.PI) : 0,
        ),
      ),
      wind: constantProfile(0.45),
    };
    // Warm-up (JIT), then measure.
    simulateLCOH(REFERENCE_DEFAULTS, profiles);
    const start = performance.now();
    simulateLCOH(REFERENCE_DEFAULTS, profiles);
    const elapsedMs = performance.now() - start;
    expect(elapsedMs).toBeLessThan(50);
  });
});
