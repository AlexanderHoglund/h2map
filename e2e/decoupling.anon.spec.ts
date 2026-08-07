/**
 * The decoupling scene: book & claim with aggregation. Most tests are pure
 * geometry and timing — no browser — because what can silently break (a
 * route over land, the ledger losing a unit) is exactly what no one notices
 * by watching.
 */

import { expect, test, type Page } from "@playwright/test";
import { landfallCount } from "../apps/web/lib/animation/geometry";
import {
  AUSTRALIA,
  BERTH_LOAD,
  BERTH_ORE,
  CYCLE_S,
  JAPAN,
  KOREA,
  ledgerAt,
  ORE_ROUTE,
  ORE_ROUTE_BACK,
  PHASES,
  phaseAt,
  POSTER_OFFSET_S,
  UNITS,
  unitStateAt,
  type UnitState,
} from "../apps/web/components/animate/scenes/decoupling";

const LAND = [AUSTRALIA, KOREA, JAPAN];

test("the ore routes stay in water, hull included", () => {
  // TOKEN_PATH and the attribute/commitment rails are exempt by design: they
  // carry certificates and commitments, not ships.
  expect(landfallCount(ORE_ROUTE, LAND, 4), "laden ore route crosses land").toBe(0);
  expect(landfallCount(ORE_ROUTE_BACK, LAND, 4), "ballast return crosses land").toBe(0);
});

test("the ore circuit closes and every approach is alongside", () => {
  const first = <T,>(a: readonly T[]) => a[0]!;
  const last = <T,>(a: readonly T[]) => a[a.length - 1]!;
  const heading = (track: readonly (readonly [number, number])[]) => {
    const a = track[track.length - 2]!;
    const b = last(track);
    return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  };
  const horizontal = (deg: number) => Math.abs(Math.abs(deg) - 180) < 1 || Math.abs(deg) < 1;

  expect(last(ORE_ROUTE), "laden ends where ballast begins").toEqual(first(ORE_ROUTE_BACK));
  expect(last(ORE_ROUTE_BACK), "ballast ends where laden begins").toEqual(first(ORE_ROUTE));
  expect(first(ORE_ROUTE)).toEqual([BERTH_LOAD.x, BERTH_LOAD.y]);
  expect(last(ORE_ROUTE)).toEqual([BERTH_ORE.x, BERTH_ORE.y]);
  expect(horizontal(heading(ORE_ROUTE)), "ore arrival not alongside").toBe(true);
  expect(horizontal(heading(ORE_ROUTE_BACK)), "return arrival not alongside").toBe(true);
});

test("the ledger conserves all three units at every moment", () => {
  // The v3 invariant: not "one holder" but a conserved TOTAL. The voyage
  // carries three units of environmental value; at every instant the ledger
  // must sum to three, each unit must move through the five states in story
  // order, and every handoff must land at its documented (staggered) time.
  const SAMPLES = 4801;
  const ORDER: readonly UnitState[] = [
    "aboard",
    "verifying",
    "in-transit",
    "held",
    "retired",
  ];

  for (let i = 0; i <= SAMPLES; i += 1) {
    const t = (i / SAMPLES) * CYCLE_S;
    const ledger = ledgerAt(t);
    const sum =
      ledger.aboard + ledger.verifying + ledger["in-transit"] + ledger.held + ledger.retired;
    expect(sum, `ledger does not sum to ${UNITS} at t=${t.toFixed(3)}`).toBe(UNITS);
  }

  const step = CYCLE_S / SAMPLES;
  const boundary = (phase: number) =>
    (((phase * CYCLE_S - POSTER_OFFSET_S) % CYCLE_S) + CYCLE_S) % CYCLE_S;

  for (const unit of [0, 1, 2] as const) {
    // Per-unit sequence and timings.
    const transitions: { at: number; from: UnitState; to: UnitState }[] = [];
    let prev: UnitState | null = null;
    for (let i = 0; i <= SAMPLES; i += 1) {
      const t = (i / SAMPLES) * CYCLE_S;
      const s = unitStateAt(unit, t);
      expect(ORDER).toContain(s);
      if (prev !== null && s !== prev) transitions.push({ at: t, from: prev, to: s });
      prev = s;
    }
    expect(
      transitions.map((tr) => `${tr.from}->${tr.to}`),
      `unit ${unit} does not follow the story order`,
    ).toEqual([
      "aboard->verifying",
      "verifying->in-transit",
      "in-transit->held",
      "held->retired",
      "retired->aboard",
    ]);

    const expected = [
      boundary(PHASES.detach),
      boundary(PHASES.mint),
      boundary(PHASES.arrive[unit]),
      boundary(PHASES.retire[unit]),
      boundary(PHASES.bunker),
    ].sort((a, b) => a - b);
    const actual = transitions.map((tr) => tr.at).sort((a, b) => a - b);
    for (let i = 0; i < 5; i += 1) {
      expect(
        Math.abs(actual[i]! - expected[i]!),
        `unit ${unit} handoff ${i} off its documented time`,
      ).toBeLessThanOrEqual(step * 1.5);
    }
  }

  // All three retired together before the bunker wrap — the books close.
  const allRetiredAt = (PHASES.retire[2] + 0.02) * CYCLE_S - POSTER_OFFSET_S;
  expect(ledgerAt(allRetiredAt).retired).toBe(UNITS);
});

test("the reduced-motion poster shows all value aboard", () => {
  expect(ledgerAt(0).aboard).toBe(UNITS);
  expect(phaseAt(0)).toBeLessThan(PHASES.detach);
  expect(phaseAt(0)).toBeGreaterThan(0);
});

/** Strided paint digest, as in animate.anon.spec.ts. */
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

test("the gallery lists both animations and the second one plays", async ({ page }) => {
  await page.goto("/animate");
  await expect(page.getByRole("button", { name: /Green corridor/ })).toBeVisible();
  const entry = page.getByRole("button", { name: /Decoupling/ });
  await expect(entry).toBeVisible();
  await entry.click();

  await expect(page.locator("canvas")).toBeVisible();
  const painted = await page.locator("canvas").evaluate((el) => {
    const canvas = el as HTMLCanvasElement;
    const ctx = canvas.getContext("2d");
    if (!ctx) return 0;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let n = 0;
    for (let i = 3; i < data.length; i += 4 * 97) if ((data[i] ?? 0) > 0) n += 1;
    return n;
  });
  expect(painted).toBeGreaterThan(0);
  const a = await sample(page);
  await page.waitForTimeout(700);
  expect(await sample(page)).not.toBe(a);
});
