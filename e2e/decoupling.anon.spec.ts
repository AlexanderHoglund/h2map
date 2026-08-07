/**
 * The decoupling scene: book & claim as a diagram. Most tests are pure
 * timing/geometry — no browser — because what can silently break (the ledger
 * losing a unit, a shipment desynchronizing from its claim) is exactly what
 * no one notices by watching.
 */

import { expect, test, type Page } from "@playwright/test";
import {
  carrierWindow,
  CORRIDOR_STRIP,
  CYCLE_S,
  HUB_CARD,
  LANE_STRIPS,
  ledgerAt,
  OWNER_CARDS,
  PHASES,
  phaseAt,
  POSTER_OFFSET_S,
  REGISTRY_CARD,
  UNITS,
  unitStateAt,
  type Rect,
  type UnitState,
} from "../apps/web/components/animate/scenes/decoupling";

test("the stage is sane: strips disjoint, everything in frame", () => {
  const inFrame = (r: Rect) =>
    r.x >= 0 && r.y >= 0 && r.x + r.w <= 900 && r.y + r.h <= 1000;
  const overlaps = (a: Rect, b: Rect) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  const rects: Rect[] = [
    CORRIDOR_STRIP,
    ...LANE_STRIPS,
    REGISTRY_CARD,
    HUB_CARD,
    ...OWNER_CARDS,
  ];
  for (const r of rects) expect(inFrame(r), `rect off-frame: ${JSON.stringify(r)}`).toBe(true);

  // The three car lanes must not touch each other or the corridor.
  const strips = [CORRIDOR_STRIP, ...LANE_STRIPS];
  for (let i = 0; i < strips.length; i += 1) {
    for (let j = i + 1; j < strips.length; j += 1) {
      expect(overlaps(strips[i]!, strips[j]!), `strips ${i} and ${j} overlap`).toBe(false);
    }
  }
});

test("each shipment is synchronized with its claim", () => {
  // The docking/retirement of unit i and the sailing of carrier i derive
  // from the same constants — assert the relationship, so a retimed lane
  // cannot silently ship before its claim docks or arrive after it retires.
  for (const lane of [0, 1, 2] as const) {
    const { depart, arrive } = carrierWindow(lane);
    expect(depart, `lane ${lane} departs before its unit docks`).toBeGreaterThan(
      PHASES.dock[lane],
    );
    expect(arrive, `lane ${lane} arrival is not its retirement`).toBe(PHASES.retire[lane]);
    expect(depart).toBeLessThan(arrive);
  }
});

test("the ledger conserves all three units at every moment", () => {
  const SAMPLES = 4801;
  const ORDER: readonly UnitState[] = [
    "aboard",
    "verifying",
    "in-transit",
    "applied",
    "retired",
  ];

  for (let i = 0; i <= SAMPLES; i += 1) {
    const t = (i / SAMPLES) * CYCLE_S;
    const ledger = ledgerAt(t);
    const sum =
      ledger.aboard + ledger.verifying + ledger["in-transit"] + ledger.applied + ledger.retired;
    expect(sum, `ledger does not sum to ${UNITS} at t=${t.toFixed(3)}`).toBe(UNITS);
  }

  const step = CYCLE_S / SAMPLES;
  const boundary = (phase: number) =>
    (((phase * CYCLE_S - POSTER_OFFSET_S) % CYCLE_S) + CYCLE_S) % CYCLE_S;

  for (const unit of [0, 1, 2] as const) {
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
      "in-transit->applied",
      "applied->retired",
      "retired->aboard",
    ]);

    const expected = [
      boundary(PHASES.detach),
      boundary(PHASES.mint),
      boundary(PHASES.dock[unit]),
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

  // All three retired together before the wrap — the books close.
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
