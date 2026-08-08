/**
 * The decoupling chart: one voyage, many buyers, on the actual world map.
 * The pure tests pin the chart's factual skeleton — routes connect the ports
 * they claim to, the registry sells only to ports that host a cargo owner,
 * schedules are sane — and the browser test proves it paints and animates.
 */

import { expect, test, type Page } from "@playwright/test";
import {
  AGGREGATOR_BOX,
  ATTR_WINDOW,
  CYCLE_S,
  FILL_WINDOW,
  HANDOFF_WINDOW,
  ORE_ROUTE,
  ORE_SCHEDULE,
  phaseAt,
  POOL_SLOTS,
  PORTS,
  REGISTRY_BOX,
  SELL_WINDOW,
  SOLD_TO,
  TRADE_ROUTES,
} from "../apps/web/components/animate/scenes/decoupling";

const near = (a: readonly [number, number], x: number, y: number, tol = 12) =>
  Math.hypot(a[0] - x, a[1] - y) <= tol;

const port = (label: string) => {
  const p = PORTS.find((q) => q.label.startsWith(label));
  expect(p, `port ${label} missing`).toBeTruthy();
  return p!;
};
const first = <T,>(a: readonly T[]) => a[0]!;
const last = <T,>(a: readonly T[]) => a[a.length - 1]!;

test("every port, route point and the registry sit inside the chart frame", () => {
  for (const p of PORTS) {
    expect(p.x, `${p.label} x`).toBeGreaterThanOrEqual(0);
    expect(p.x, `${p.label} x`).toBeLessThanOrEqual(900);
    expect(p.y, `${p.label} y`).toBeGreaterThanOrEqual(0);
    expect(p.y, `${p.label} y`).toBeLessThanOrEqual(520);
  }
  for (const route of [ORE_ROUTE, ...TRADE_ROUTES.map((r) => r.points)]) {
    for (const [x, y] of route) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(900);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(520);
    }
  }
  for (const box of [REGISTRY_BOX, AGGREGATOR_BOX]) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.w).toBeLessThanOrEqual(900);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.h).toBeLessThanOrEqual(520);
  }
  // The two institutions sit beside each other, never on top of each other.
  const overlap =
    AGGREGATOR_BOX.x < REGISTRY_BOX.x + REGISTRY_BOX.w &&
    REGISTRY_BOX.x < AGGREGATOR_BOX.x + AGGREGATOR_BOX.w &&
    AGGREGATOR_BOX.y < REGISTRY_BOX.y + REGISTRY_BOX.h &&
    REGISTRY_BOX.y < AGGREGATOR_BOX.y + AGGREGATOR_BOX.h;
  expect(overlap).toBe(false);
});

test("routes connect the ports they claim to", () => {
  const pilbara = port("Pilbara Ports");
  const ulsan = port("Ulsan");
  expect(near(first(ORE_ROUTE), pilbara.x, pilbara.y), "ore route starts at Pilbara").toBe(true);
  expect(near(last(ORE_ROUTE), ulsan.x, ulsan.y), "ore route ends at Ulsan").toBe(true);

  for (const route of TRADE_ROUTES) {
    const from = port(route.from);
    const to = port(route.to);
    expect(near(first(route.points), from.x, from.y), `${route.from}→${route.to} start`).toBe(true);
    expect(near(last(route.points), to.x, to.y), `${route.from}→${route.to} end`).toBe(true);
  }
});

test("every cargo owner on the chart receives an attribute", () => {
  for (const name of SOLD_TO) {
    const p = port(name);
    expect(p.owner, `${name} needs an owner glyph to receive an attribute`).toBeTruthy();
  }
  // All owners buy — SOLD_TO covers exactly the owner-bearing ports.
  expect(SOLD_TO.length).toBe(PORTS.filter((q) => q.owner).length);
  // And the producing port has no owner glyph, so it never sells to itself.
  expect(SOLD_TO).not.toContain("Pilbara Ports");
});

test("the schedules are sane", () => {
  // Ore shuttle covers the whole cycle without gaps.
  expect(ORE_SCHEDULE.sailOut[0]).toBe(0);
  expect(ORE_SCHEDULE.sailOut[1]).toBe(ORE_SCHEDULE.alongside[0]);
  expect(ORE_SCHEDULE.alongside[1]).toBe(ORE_SCHEDULE.sailHome[0]);
  expect(ORE_SCHEDULE.sailHome[1]).toBe(ORE_SCHEDULE.loading[0]);
  expect(ORE_SCHEDULE.loading[1]).toBe(1);

  // Book, hand off, pool, then claim: the attribute reaches the registry
  // while the vessel is alongside, moves to the aggregator only once booked,
  // fills the pool only after the hand-off, and sells only from a full pool.
  expect(ATTR_WINDOW[0]).toBeGreaterThanOrEqual(ORE_SCHEDULE.alongside[0]);
  expect(ATTR_WINDOW[1]).toBeLessThanOrEqual(ORE_SCHEDULE.alongside[1]);
  expect(HANDOFF_WINDOW[0]).toBeGreaterThanOrEqual(ATTR_WINDOW[1]);
  expect(FILL_WINDOW[0]).toBeGreaterThanOrEqual(HANDOFF_WINDOW[1]);
  expect(SELL_WINDOW[0]).toBeGreaterThanOrEqual(FILL_WINDOW[1]);
  expect(SELL_WINDOW[1]).toBeLessThanOrEqual(1);
  expect(POOL_SLOTS).toBeGreaterThan(0);

  // Every trade window is a valid sub-interval of the cycle.
  for (const route of TRADE_ROUTES) {
    expect(route.window[0]).toBeGreaterThanOrEqual(0);
    expect(route.window[1]).toBeLessThanOrEqual(1);
    expect(route.window[0]).toBeLessThan(route.window[1]);
  }
});

test("the reduced-motion poster shows the voyage under way", () => {
  const p = phaseAt(0);
  expect(p).toBeGreaterThan(ORE_SCHEDULE.sailOut[0]);
  expect(p).toBeLessThan(ORE_SCHEDULE.sailOut[1]);
  expect(CYCLE_S).toBeGreaterThan(0);
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
  const entry = page.getByRole("button", { name: /voyage|Decoupling/i });
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
