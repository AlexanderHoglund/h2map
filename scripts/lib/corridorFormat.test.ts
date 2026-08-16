import { describe, expect, it } from "vitest";
import {
  idLabel,
  int,
  round2,
  usd,
  usdM,
  usdMShort,
  usdMSigned,
} from "../../apps/web/lib/corridor/format";

/**
 * The corridor's number formatting, pinned.
 *
 * These conventions lived as private copies in three components and drifted
 * apart, visibly: the same gap rendered `$1,690.00m` in the KPI strip and
 * `$1,690m` in the chart directly beneath it, and abatement rendered
 * `$1,215/t` on its card against `$1,215.239/t` in its own tooltip.
 *
 * Nothing catches that class of bug except a test that states the intended
 * output, so this file states it.
 */

describe("$m has exactly two conventions, split by context", () => {
  it("usdM is always 2dp — tables, KPIs, tooltips", () => {
    // Always two decimals so a column of figures aligns and nothing looks
    // rounded away where a reader may compare or copy digits.
    expect(usdM(1690)).toBe("$1,690.00m");
    expect(usdM(2012.44)).toBe("$2,012.44m");
    expect(usdM(0.5)).toBe("$0.50m");
    expect(usdM(-195.92)).toBe("-$195.92m");
  });

  it("usdMShort drops cents only at $100m and above — chart labels", () => {
    // Trailing zeros on a $1,690m bar label are noise; on a $60.75m one the
    // cents still carry information.
    expect(usdMShort(1690)).toBe("$1,690m");
    expect(usdMShort(2012.44)).toBe("$2,012m");
    expect(usdMShort(60.75)).toBe("$60.75m");
  });

  it("usdMShort keeps BOTH decimals below the threshold", () => {
    // The bug this module fixed: the short form set only a maximum, so it
    // rendered "$12.5m" and "$0.5m" beside "$60.75m" — the exact
    // inconsistency it was meant to avoid.
    expect(usdMShort(12.5)).toBe("$12.50m");
    expect(usdMShort(0.5)).toBe("$0.50m");
  });

  it("the two agree wherever they overlap in intent", () => {
    // Below $100m both show cents, so a figure cannot read differently in a
    // table and on a chart. Above it, the difference is deliberate.
    for (const n of [0.5, 12.5, 60.75, 99.99]) {
      expect(usdMShort(n), String(n)).toBe(usdM(n));
    }
  });
});

describe("$/tonne is always whole dollars", () => {
  it("never renders sub-dollar precision", () => {
    // Sub-dollar precision on an abatement cost is false precision, and it
    // is what made the card and its tooltip disagree.
    expect(usd(1215.239283)).toBe("$1,215");
    expect(usd(81.31)).toBe("$81");
    expect(usd(0.4)).toBe("$0");
  });
});

describe("the remaining helpers", () => {
  it("usdMSigned marks only the positive direction", () => {
    // A negative already carries its own sign; "+" is what needs stating.
    expect(usdMSigned(193)).toBe("+$193.00m");
    expect(usdMSigned(-193)).toBe("-$193.00m");
    expect(usdMSigned(0)).toBe("$0.00m");
  });

  it("int rounds and separates", () => {
    expect(int(1450094.8824)).toBe("1,450,095");
  });

  it("idLabel makes a benchmark id readable without mangling the rest", () => {
    expect(idLabel("e-ammonia")).toBe("E-ammonia");
    expect(idLabel("build-here")).toBe("Build-here");
  });

  it("round2 is for chart DATA, not display", () => {
    // Returns a number, not a string — it exists to stop recharts carrying
    // float noise into tooltips, and must not be mistaken for a formatter.
    expect(round2(1.005)).toBeTypeOf("number");
    expect(round2(1234.5678)).toBe(1234.57);
  });
});
