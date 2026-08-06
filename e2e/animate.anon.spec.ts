/**
 * The canvas animation gallery. Public, so — unlike the gated pages — it is
 * fully testable in CI under dummy Supabase credentials.
 *
 * A canvas is opaque to axe and to the DOM, so the assertions here are about
 * the failure modes that are otherwise invisible: a blank canvas (bad palette,
 * off-screen transform, an exception in draw()), a collapsed container, a loop
 * that never runs, and a reduced-motion preference that gets ignored.
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { landfallCount } from "../apps/web/lib/animation/geometry";
import {
  ROUTE,
  ROUTE_BACK,
  SHORE_A,
  SHORE_B,
} from "../apps/web/components/animate/scenes/shipping";

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
