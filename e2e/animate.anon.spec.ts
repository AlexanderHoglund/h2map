/**
 * The canvas animation gallery. Public, so — unlike the gated pages — it is
 * fully testable in CI under dummy Supabase credentials.
 *
 * A canvas is opaque to axe and to the DOM, so the assertions here are about
 * the failure modes that are otherwise invisible: a blank canvas (bad palette,
 * off-screen transform, an exception in draw()), a collapsed container, a loop
 * that never runs, and a reduced-motion preference that gets ignored.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { landfallCount } from "../apps/web/lib/animation/geometry";
import { ANIMATIONS } from "../apps/web/components/animate/registry";
import {
  CROSS_PHASE,
  CROSS_SLABS,
  crossedAt,
  ETS_EUA_EUR,
  ETS_FROM,
  FOSSIL_BASE_H,
  FUELEU_FROM,
  FUELEU_PENALTY_EUR,
  GREEN_BASE_H,
  IMO_FROM,
  IMO_TIER1_USD,
  IMO_TIER2_USD,
  LEAD,
  RESET as REG_RESET,
  SLAB_H,
  slabsAt,
  STACK as REG_STACK,
  TALLY as REG_TALLY,
  TOTAL_SLABS,
} from "../apps/web/components/animate/scenes/regulations";
import {
  BERTH_A,
  BERTH_A_CRUISE,
  BERTH_B_CRUISE,
  BERTH_BULK,
  BERTH_CONTAINER,
  CRANE_S,
  CRANE_TOUCH,
  CRUISE_ROUTE,
  CRUISE_ROUTE_BACK,
  EXPORT_CRANE_STAGGER,
  loadsSince,
  ROUTE,
  ROUTE_BACK,
  SHORE_A,
  SHORE_B,
} from "../apps/web/components/animate/scenes/shipping";
import {
  BERTH_A as STACK_BERTH_A,
  BERTH_B as STACK_BERTH_B,
  ROUTE as STACK_ROUTE,
  ROUTE_BACK as STACK_ROUTE_BACK,
  SEA as STACK_SEA,
} from "../apps/web/components/animate/scenes/stack";

/**
 * A cheap digest of what is currently painted. Strided so we ship a number
 * across the bridge rather than four megabytes, and the stride is prime to
 * avoid aliasing with the scene's own grid spacing.
 */
async function sample(page: Page): Promise<number> {
  return page.locator("canvas").evaluate((el) => {
    const canvas = el as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) return -1;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let hash = 0;
    for (let i = 0; i < data.length; i += 4 * 97) {
      hash = (hash * 31 + (data[i] ?? 0) + (data[i + 3] ?? 0)) | 0;
    }
    return hash;
  });
}

/** Count of sampled pixels with any alpha — zero means nothing was drawn. */
async function paintedPixels(page: Page): Promise<number> {
  return page.locator("canvas").evaluate((el) => {
    const canvas = el as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) return 0;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let painted = 0;
    for (let i = 3; i < data.length; i += 4 * 97) {
      if ((data[i] ?? 0) > 0) painted += 1;
    }
    return painted;
  });
}

test("the gallery is public and renders", async ({ page }) => {
  await page.goto("/animate");
  await expect(page).not.toHaveURL(/\/\?next=/);
  await expect(page.getByRole("heading", { level: 1, name: "Animations" })).toBeVisible();
});

test("the canvas is sized, DPR-scaled and actually painted", async ({ page }) => {
  await page.goto("/animate");
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();

  // A canvas with no intrinsic size collapses to 0 inside a flex/grid parent
  // and renders blank with no error — the classic failure this catches.
  const box = await canvas.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(100);
  expect(box?.height ?? 0).toBeGreaterThan(100);

  // Backing store larger than the CSS box proves the DPR transform is applied.
  const backing = await canvas.evaluate((el) => (el as HTMLCanvasElement).width);
  expect(backing).toBeGreaterThanOrEqual(Math.round(box?.width ?? 0));

  expect(await paintedPixels(page)).toBeGreaterThan(0);
});

test("the animation actually animates", async ({ page }) => {
  await page.goto("/animate");
  await expect(page.locator("canvas")).toBeVisible();
  const first = await sample(page);
  await page.waitForTimeout(700);
  const second = await sample(page);
  // Would have caught the thing that started all this: an "animation" that
  // never moves.
  expect(second).not.toBe(first);
});

// `page.emulateMedia()` rather than `test.use({ reducedMotion })`: the fixture
// form did not reach the page in this setup, which made the test look like an
// engine bug. Emulate explicitly, before navigating, so the very first frame
// already sees the preference.
test("reduced motion holds a single still frame", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/animate");
  await expect(page.locator("canvas")).toBeVisible();
  expect(
    await page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches),
    "reduced-motion emulation did not reach the page — the assertions below would be vacuous",
  ).toBe(true);

  // Still drawn: reduced motion means no movement, not a blank canvas.
  expect(await paintedPixels(page)).toBeGreaterThan(0);

  const first = await sample(page);
  await page.waitForTimeout(700);
  expect(await sample(page)).toBe(first);
});

test("the page is axe-clean", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/animate");
  await expect(page.locator("canvas")).toBeVisible();
  // Freeze CSS transitions too: axe sampling a mid-transition colour reads as
  // a contrast failure (same guard as e2e/corridor.spec.ts). Note this does
  // NOT stop rAF — hence the reduced-motion emulation above.
  await page.addStyleTag({
    content: "*, *::before, *::after { transition: none !important; animation: none !important; }",
  });
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious, serious.map((v) => `${v.id} (${v.impact})`).join(", ")).toEqual([]);
});

// Pure geometry, so no browser needed. The tracks once ran straight through
// the import terminal and the fleet sailed over the land; this makes that a
// build failure rather than something you have to notice by eye.
test("both shipping legs stay in water, hull included", () => {
  const land = [SHORE_A, SHORE_B];
  expect(landfallCount(ROUTE, land), "laden track crosses land").toBe(0);
  expect(landfallCount(ROUTE_BACK, land), "ballast track crosses land").toBe(0);
});

// The passenger circuit obeys the same law as the freight one: afloat the
// whole way, a closed loop, and final approaches parallel to the quay walls
// (both cruise quays run north-south, so "alongside" is ±90).
test("the cruise circuit stays afloat, closes, and berths alongside", () => {
  const land = [SHORE_A, SHORE_B];
  expect(landfallCount(CRUISE_ROUTE, land), "outbound cruise track crosses land").toBe(0);
  expect(landfallCount(CRUISE_ROUTE_BACK, land), "return cruise track crosses land").toBe(0);

  const first = <T,>(a: readonly T[]) => a[0]!;
  const last = <T,>(a: readonly T[]) => a[a.length - 1]!;
  expect(last(CRUISE_ROUTE), "outbound must end where the return begins").toEqual(
    first(CRUISE_ROUTE_BACK),
  );
  expect(last(CRUISE_ROUTE_BACK), "return must end where the outbound begins").toEqual(
    first(CRUISE_ROUTE),
  );
  expect(first(CRUISE_ROUTE), "the circuit departs the Port A cruise berth").toEqual([
    BERTH_A_CRUISE.x,
    BERTH_A_CRUISE.y,
  ]);
  expect(last(CRUISE_ROUTE), "the circuit calls at the Rotterdam cruise berth").toEqual([
    BERTH_B_CRUISE.x,
    BERTH_B_CRUISE.y,
  ]);

  const heading = (track: readonly (readonly [number, number])[]) => {
    const a = track[track.length - 2]!;
    const b = last(track);
    return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  };
  const isVertical = (deg: number) => Math.abs(Math.abs(deg) - 90) < 1;
  expect(isVertical(heading(CRUISE_ROUTE)), "must arrive parallel to the B quay").toBe(true);
  expect(isVertical(heading(CRUISE_ROUTE_BACK)), "must arrive parallel to the A quay").toBe(true);
});

// The two ways a "loop" silently isn't one. Both were real: the legs used to
// meet at the import quay but leave a 60-unit gap at the export quay, so a
// vessel teleported along the dock; and both final approaches ran
// perpendicular to the quay, so ships drove bow-first into the land.
test("the circuit closes and ships berth alongside", () => {
  const first = <T,>(a: readonly T[]) => a[0]!;
  const last = <T,>(a: readonly T[]) => a[a.length - 1]!;

  expect(last(ROUTE), "laden must end where ballast begins").toEqual(first(ROUTE_BACK));
  expect(last(ROUTE_BACK), "ballast must end where laden begins").toEqual(first(ROUTE));

  // Final approach heading vs the quay it lands on. Quay B runs east-west,
  // quay A runs north-south, so "alongside" is 0/180 and ±90 respectively.
  const heading = (track: readonly (readonly [number, number])[]) => {
    const a = track[track.length - 2]!;
    const b = last(track);
    return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  };
  const isHorizontal = (deg: number) => Math.abs(Math.abs(deg) - 180) < 1 || Math.abs(deg) < 1;
  const isVertical = (deg: number) => Math.abs(Math.abs(deg) - 90) < 1;

  expect(isHorizontal(heading(ROUTE)), "laden must arrive parallel to quay B").toBe(true);
  expect(isVertical(heading(ROUTE_BACK)), "ballast must arrive parallel to quay A").toBe(true);
});

// The cranes derive their seaward reach from the berth, so a container is
// released onto a deck rather than into open water. Before this, the spreader
// came down 25 units east of the hull -- a crane loading the sea.
test("the berth is where the ships actually stop", () => {
  const last = <T,>(a: readonly T[]) => a[a.length - 1]!;
  // Laden departs from the berth; ballast arrives back at it.
  expect(ROUTE[0], "laden must depart the export berth").toEqual([BERTH_A.x, BERTH_A.y]);
  expect(last(ROUTE_BACK), "ballast must arrive at the export berth").toEqual([
    BERTH_A.x,
    BERTH_A.y,
  ]);
});

// The hull must change colour on the exact frame the spreader reaches the
// deck. The two used to run on unrelated clocks — the crane released at 0.375
// of a 9 s cycle, the ship flipped at the midpoint of a 36 s dwell — so the
// cargo and the colour had nothing to do with each other.
test("a vessel turns laden exactly when the cargo lands", () => {
  const arrived = 29.9; // just after this vessel comes alongside
  const touch =
    (Math.floor((arrived + EXPORT_CRANE_STAGGER) / CRANE_S - CRANE_TOUCH) + 1 + CRANE_TOUCH) *
      CRANE_S -
    EXPORT_CRANE_STAGGER;

  const EPS = 1e-6;
  expect(
    loadsSince(touch - EPS, arrived, EXPORT_CRANE_STAGGER),
    "empty right up to the moment of contact",
  ).toBe(0);
  expect(
    loadsSince(touch + EPS, arrived, EXPORT_CRANE_STAGGER),
    "laden from the frame the box touches down",
  ).toBe(1);
});

// Each trade has its own berth and its own machine: a spreader cannot lift
// loose cargo and a grab cannot lift a box. The two berths must therefore be
// distinct points, or the ships would stack on one spot.
test("bulk and container ships use separate berths", () => {
  expect(BERTH_BULK.y).not.toBe(BERTH_CONTAINER.y);
  // Both lie on the same quay line, just at different points along it.
  expect(BERTH_BULK.x).toBe(BERTH_CONTAINER.x);
});

// ===== The stack scene's block-1 circuit ====================================
// Same conventions as the shipping fleet: the loop must actually close, the
// lanes must stay inside the sea panel of the top block, and both final
// approaches must run parallel to their (north-south) quay walls.

test("the stack circuit closes on the two berths", () => {
  const first = <T,>(a: readonly T[]) => a[0]!;
  const last = <T,>(a: readonly T[]) => a[a.length - 1]!;

  expect(last(STACK_ROUTE), "laden must end where ballast begins").toEqual(
    first(STACK_ROUTE_BACK),
  );
  expect(last(STACK_ROUTE_BACK), "ballast must end where laden begins").toEqual(
    first(STACK_ROUTE),
  );
  expect(first(STACK_ROUTE), "laden departs berth A").toEqual([STACK_BERTH_A.x, STACK_BERTH_A.y]);
  expect(last(STACK_ROUTE), "laden arrives at berth B").toEqual([
    STACK_BERTH_B.x,
    STACK_BERTH_B.y,
  ]);
});

test("stack ships berth alongside and never leave the water", () => {
  const heading = (track: readonly (readonly [number, number])[]) => {
    const a = track[track.length - 2]!;
    const b = track[track.length - 1]!;
    return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  };
  const isVertical = (deg: number) => Math.abs(Math.abs(deg) - 90) < 1;
  // Both quays run north-south, so both final approaches must be vertical.
  expect(isVertical(heading(STACK_ROUTE)), "laden must arrive parallel to quay B").toBe(true);
  expect(isVertical(heading(STACK_ROUTE_BACK)), "ballast must arrive parallel to quay A").toBe(
    true,
  );

  // Every vertex sits inside the sea panel with half a beam to spare, so the
  // hull never overlaps a quay wall or the block frame. The lanes are convex
  // combinations of their vertices, so checking vertices covers the segments.
  const HALF_BEAM = 3.5;
  for (const [x, y] of [...STACK_ROUTE, ...STACK_ROUTE_BACK]) {
    expect(x, "vertex clears the quay walls").toBeGreaterThanOrEqual(STACK_SEA.x0 + HALF_BEAM);
    expect(x, "vertex clears the quay walls").toBeLessThanOrEqual(STACK_SEA.x1 - HALF_BEAM);
    expect(y, "vertex stays inside the block").toBeGreaterThanOrEqual(STACK_SEA.y0 + HALF_BEAM);
    expect(y, "vertex stays inside the block").toBeLessThanOrEqual(STACK_SEA.y1 - HALF_BEAM);
  }
});

// ===== The regulations scene ================================================
// The scene hardcodes its prices and start years (a scene file must stay
// self-contained — it cannot import the engine or the bundle). These tests
// keep that duplication honest: every number is compared to the v6 reference
// bundle itself, so a bundle revision breaks the build instead of letting the
// gallery quietly disagree with the model.

const bundle = JSON.parse(
  readFileSync(
    join(__dirname, "..", "data", "corridor-ref", "2026-08-21-cruise-v6.json"),
    "utf8",
  ),
) as {
  schedules: {
    etsPhaseIn: readonly { fromCalendarYear: number; value: number }[];
    fuelEuTargets: readonly { fromCalendarYear: number; value: number }[];
    imoBaseTargets: readonly { fromCalendarYear: number; value: number }[];
    imoDirectTargets: readonly { fromCalendarYear: number; value: number }[];
  };
  regulationDefaults: {
    ets: { euaEurPerTonne: number; gasCoverageFromCalendarYear: number };
    fuelEu: { penaltyEurPerTonne: number; vlsfoMjPerTonne: number; baselineGco2PerMj: number };
    imoNetZero: {
      effectiveFromCalendarYear: number;
      referenceIntensityGco2PerMj: number;
      tier1UsdPerTonneCo2e: number;
      tier2UsdPerTonneCo2e: number;
    };
  };
};

test("the three cards quote the bundle, not a memory of it", () => {
  expect(ETS_EUA_EUR).toBe(bundle.regulationDefaults.ets.euaEurPerTonne);
  expect(FUELEU_PENALTY_EUR).toBe(bundle.regulationDefaults.fuelEu.penaltyEurPerTonne);
  expect(IMO_TIER1_USD).toBe(bundle.regulationDefaults.imoNetZero.tier1UsdPerTonneCo2e);
  expect(IMO_TIER2_USD).toBe(bundle.regulationDefaults.imoNetZero.tier2UsdPerTonneCo2e);

  expect(ETS_FROM, "the ETS card's start year is the first phase-in step").toBe(
    bundle.schedules.etsPhaseIn[0]!.fromCalendarYear,
  );
  expect(FUELEU_FROM, "the FuelEU card's start year is the first target step").toBe(
    bundle.schedules.fuelEuTargets[0]!.fromCalendarYear,
  );
  expect(IMO_FROM).toBe(bundle.regulationDefaults.imoNetZero.effectiveFromCalendarYear);
});

// The scene's whole claim is that the flip happens BECAUSE the totals cross —
// so the crossing must be arithmetic, not choreography.
test("the flip is the crossing, to the slab", () => {
  const greenTotal = GREEN_BASE_H;
  expect(
    FOSSIL_BASE_H + CROSS_SLABS * SLAB_H,
    "at the crossing slab the fossil total beats the green total",
  ).toBeGreaterThan(greenTotal);
  expect(
    FOSSIL_BASE_H + (CROSS_SLABS - 1) * SLAB_H,
    "one slab earlier it still loses",
  ).toBeLessThanOrEqual(greenTotal);

  const EPS = 1e-6;
  expect(crossedAt(CROSS_PHASE - EPS), "not crossed the instant before").toBe(false);
  expect(crossedAt(CROSS_PHASE + EPS), "crossed the instant after").toBe(true);
  expect(CROSS_PHASE).toBeGreaterThan(REG_STACK[0]);
  expect(CROSS_PHASE).toBeLessThan(REG_STACK[1]);
});

test("charges only ever accumulate, and all of them land", () => {
  let previous = 0;
  for (let p = 0; p < 1; p += 1 / 512) {
    const n = slabsAt(p);
    expect(n, "a landed charge never un-lands").toBeGreaterThanOrEqual(previous);
    previous = n;
  }
  expect(slabsAt(0), "nothing has landed at the top of the loop").toBe(0);
  expect(slabsAt(REG_TALLY[0]), "every slab is down when the tally begins").toBe(TOTAL_SLABS);
});

test("the cycle is a partition", () => {
  const windows = [LEAD, REG_STACK, REG_TALLY, REG_RESET];
  expect(windows[0]![0]).toBe(0);
  expect(windows[windows.length - 1]![1]).toBe(1);
  for (let i = 1; i < windows.length; i += 1) {
    expect(windows[i]![0], "phase windows must chain without gap or overlap").toBe(
      windows[i - 1]![1],
    );
  }
});

// Until now only the default scene was ever painted in CI. One cheap browser
// pass: select every catalog entry and prove its draw() paints rather than
// throws — a scene that dies on frame one shows a blank stage and no error.
test("every scene in the catalog paints", async ({ page }) => {
  await page.goto("/animate");
  for (const entry of ANIMATIONS) {
    await page.getByRole("button", { name: entry.title }).click();
    await expect(page.locator("canvas")).toBeVisible();
    // Remount + first frames; sampling immediately can race the fresh canvas.
    await page.waitForTimeout(250);
    expect(await paintedPixels(page), `${entry.id} paints nothing`).toBeGreaterThan(0);
  }
});
