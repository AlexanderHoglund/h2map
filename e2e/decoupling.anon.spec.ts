/**
 * The decoupling scene: book-and-claim on a map. Most of these tests are pure
 * geometry and timing — no browser — because the things that can silently
 * break (a route over land, two holders of the attribute at once) are exactly
 * the things no one notices by watching.
 */

import { expect, test, type Page } from "@playwright/test";
import { landfallCount } from "../apps/web/lib/animation/geometry";
import {
  attributeHolderAt,
  AUSTRALIA,
  BERTH_LOAD,
  BERTH_ORE,
  BERTH_RORO,
  CYCLE_S,
  JAPAN,
  KOREA,
  ORE_ROUTE,
  ORE_ROUTE_BACK,
  PHASES,
  phaseAt,
  POSTER_OFFSET_S,
  RORO_ROUTE,
  RORO_ROUTE_BACK,
  BERTH_AU,
  type AttributeHolder,
} from "../apps/web/components/animate/scenes/decoupling";

const LAND = [AUSTRALIA, KOREA, JAPAN];

test("all three sea routes stay in water, hull included", () => {
  // TOKEN_PATH is exempt by design: it is a certificate, not a ship, and its
  // rail runs overland from the berth to the registry to the plant.
  expect(landfallCount(ORE_ROUTE, LAND, 4), "laden ore route crosses land").toBe(0);
  expect(landfallCount(ORE_ROUTE_BACK, LAND, 4), "ballast return crosses land").toBe(0);
  expect(landfallCount(RORO_ROUTE, LAND, 4), "RoRo outbound route crosses land").toBe(0);
  expect(landfallCount(RORO_ROUTE_BACK, LAND, 4), "RoRo return route crosses land").toBe(0);
});

test("the ore circuit closes and every approach is alongside", () => {
  const first = <T,>(a: readonly T[]) => a[0]!;
  const last = <T,>(a: readonly T[]) => a[a.length - 1]!;
  const heading = (track: readonly (readonly [number, number])[], seg: "first" | "last") => {
    const [a, b] =
      seg === "last"
        ? [track[track.length - 2]!, last(track)]
        : [first(track), track[1]!];
    return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  };
  const horizontal = (deg: number) => Math.abs(Math.abs(deg) - 180) < 1 || Math.abs(deg) < 1;

  expect(last(ORE_ROUTE), "laden ends where ballast begins").toEqual(first(ORE_ROUTE_BACK));
  expect(last(ORE_ROUTE_BACK), "ballast ends where laden begins").toEqual(first(ORE_ROUTE));
  expect(first(ORE_ROUTE), "the circuit starts at the loading berth").toEqual([
    BERTH_LOAD.x,
    BERTH_LOAD.y,
  ]);
  expect(last(ORE_ROUTE), "the laden leg ends at the discharge berth").toEqual([
    BERTH_ORE.x,
    BERTH_ORE.y,
  ]);

  // The RoRo runs a closed loop too: Gwangyang → Fremantle → Gwangyang.
  expect(last(RORO_ROUTE), "RoRo outbound ends where the return begins").toEqual(
    first(RORO_ROUTE_BACK),
  );
  expect(last(RORO_ROUTE_BACK), "RoRo return ends where the outbound begins").toEqual(
    first(RORO_ROUTE),
  );
  expect(first(RORO_ROUTE), "the RoRo loop starts at its Gwangyang berth").toEqual([
    BERTH_RORO.x,
    BERTH_RORO.y,
  ]);
  expect(last(RORO_ROUTE), "the outbound leg ends at the Fremantle berth").toEqual([
    BERTH_AU.x,
    BERTH_AU.y,
  ]);

  // All quays run east-west, so every arrival/departure must be horizontal.
  expect(horizontal(heading(ORE_ROUTE, "last")), "ore arrival not alongside").toBe(true);
  expect(horizontal(heading(ORE_ROUTE_BACK, "last")), "return arrival not alongside").toBe(true);
  expect(horizontal(heading(RORO_ROUTE, "first")), "RoRo departure not alongside").toBe(true);
  expect(horizontal(heading(RORO_ROUTE, "last")), "RoRo AU arrival not alongside").toBe(true);
  expect(horizontal(heading(RORO_ROUTE_BACK, "last")), "RoRo home arrival not alongside").toBe(true);

  // Two trades, two berths: distinct points on the same quay line.
  expect(BERTH_ORE.x).not.toBe(BERTH_RORO.x);
  expect(BERTH_ORE.y).toBe(BERTH_RORO.y);
});

test("the attribute exists in exactly one place at every moment", () => {
  // Dense sampling across one full cycle. `attributeHolderAt` is total, so
  // "exactly one holder" holds by construction — what this pins is the
  // SEQUENCE and the handoff times, so a future edit to the phase table that
  // breaks the partition (or reorders the story) fails here, not on screen.
  const SAMPLES = 4801;
  const seen: AttributeHolder[] = [];
  const transitions: { at: number; from: AttributeHolder; to: AttributeHolder }[] = [];
  let prev: AttributeHolder | null = null;
  for (let i = 0; i <= SAMPLES; i += 1) {
    const t = (i / SAMPLES) * CYCLE_S;
    const h = attributeHolderAt(t);
    expect(["ore-vessel", "token", "cargo-owner", "roro", "retired"]).toContain(h);
    if (prev !== null && h !== prev) transitions.push({ at: t, from: prev, to: h });
    seen.push(h);
    prev = h;
  }

  // Every state occurs, with positive duration.
  for (const state of ["ore-vessel", "token", "cargo-owner", "roro", "retired"] as const) {
    expect(seen.filter((s) => s === state).length, `${state} never occurs`).toBeGreaterThan(5);
  }

  // Exactly five handoffs per cycle, in the story's order: the certificate
  // reaches the CARGO OWNER before any ship can claim it, and ends retired.
  expect(transitions.map((t) => `${t.from}->${t.to}`)).toEqual([
    "ore-vessel->token",
    "token->cargo-owner",
    "cargo-owner->roro",
    "roro->retired",
    "retired->ore-vessel",
  ]);

  // Each handoff lands at its documented boundary (mod the poster offset).
  const step = CYCLE_S / SAMPLES;
  const boundary = (phase: number) =>
    (((phase * CYCLE_S - POSTER_OFFSET_S) % CYCLE_S) + CYCLE_S) % CYCLE_S;
  const expected = [
    boundary(PHASES.detach),
    boundary(PHASES.own),
    boundary(PHASES.claim),
    boundary(PHASES.retire),
    boundary(PHASES.bunker),
  ].sort((a, b) => a - b);
  const actual = transitions.map((t) => t.at).sort((a, b) => a - b);
  for (let i = 0; i < 5; i += 1) {
    expect(Math.abs(actual[i]! - expected[i]!)).toBeLessThanOrEqual(step * 1.5);
  }
});

test("the reduced-motion poster shows the attribute still aboard", () => {
  // t=0 is the still frame. It must land mid-outbound: mark on the ore
  // vessel, token undetached, RoRo waiting — a one-glance statement of the
  // whole diagram before anything moves.
  expect(attributeHolderAt(0)).toBe("ore-vessel");
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
  // Painted…
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
  // …and animating.
  const a = await sample(page);
  await page.waitForTimeout(700);
  expect(await sample(page)).not.toBe(a);
});
