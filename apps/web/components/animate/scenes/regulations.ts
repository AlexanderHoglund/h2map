import { box, dashed, gridLines as libGridLines, labelPlate as libLabelPlate, monoLabel, polyline } from "@/lib/animation/draw";
import { smoothstep } from "@/lib/animation/ease";
import type { DesignSpace, Frame, Point, Scene } from "@/lib/animation/types";

/** The colours this scene draws with. Naming them makes `frame.palette.ink` a
 *  plain string and a typo a compile error. `charge` is the app's regulatory
 *  amber — a cost, not a verdict. */
type Ink = "ink" | "inkSoft" | "land" | "green" | "label" | "charge";

/**
 * Regulations — the one mechanism they all share.
 *
 * Every maritime climate rule in the model works the same way: it makes the
 * fossil voyage dearer until the green voyage wins. So this scene draws
 * exactly that and nothing else. Two cost columns stand on one ground line:
 * FOSSIL starts cheap, GREEN starts dear and holds still. Three regulation
 * cards — EU ETS, FuelEU Maritime, the IMO Net-Zero Framework, each quoting
 * its real price from the reference bundle — take turns dropping charge
 * slabs onto the fossil column. Slab by slab it climbs past the dashed
 * GREEN TOTAL line, and the moment the stacks cross, the cargo changes
 * ships on the sea strip below: the fleet follows the cheaper fuel.
 *
 * The crossing is arithmetic, not theatre: FOSSIL_BASE_H + CROSS_SLABS ×
 * SLAB_H is the first total that exceeds GREEN_BASE_H, and the e2e test
 * proves it. The card prices and start years are cross-checked against
 * data/corridor-ref/2026-08-21-cruise-v6.json, so a bundle revision breaks
 * the build rather than letting the gallery quietly disagree with the model.
 */

const SPACE: DesignSpace = { width: 900, height: 1000, fit: "meet" };
const GRID_STEP = 50;

// ===== The three rules, priced from the reference bundle ====================
/** regulationDefaults.ets.euaEurPerTonne */
export const ETS_EUA_EUR = 80;
/** regulationDefaults.fuelEu.penaltyEurPerTonne */
export const FUELEU_PENALTY_EUR = 2400;
/** regulationDefaults.imoNetZero.tier1/tier2UsdPerTonneCo2e */
export const IMO_TIER1_USD = 100;
export const IMO_TIER2_USD = 380;
/** First step years: schedules.etsPhaseIn / schedules.fuelEuTargets /
 *  regulationDefaults.imoNetZero.effectiveFromCalendarYear. */
export const ETS_FROM = 2024;
export const FUELEU_FROM = 2025;
export const IMO_FROM = 2028;

interface Block {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface Card {
  readonly box: Block;
  readonly title: string;
  readonly price: string;
  readonly from: string;
}

export const CARDS: readonly Card[] = [
  {
    box: { x: 90, y: 80, w: 200, h: 90 },
    title: "EU ETS",
    price: `€${String(ETS_EUA_EUR)} / T CO2e`,
    from: `FROM ${String(ETS_FROM)}`,
  },
  {
    box: { x: 350, y: 80, w: 200, h: 90 },
    title: "FUELEU",
    price: `€2,400 / T VLSFO-EQ`,
    from: `FROM ${String(FUELEU_FROM)}`,
  },
  {
    box: { x: 610, y: 80, w: 200, h: 90 },
    title: "IMO NZF",
    price: `$${String(IMO_TIER1_USD)}-${String(IMO_TIER2_USD)} / T CO2e`,
    from: `FROM ${String(IMO_FROM)}`,
  },
];

// ===== The two columns ======================================================
const GROUND_Y = 760;
export const FOSSIL_COL = { x: 255, w: 90 } as const;
export const GREEN_COL = { x: 555, w: 90 } as const;
/** Base fuel costs, in gauge units. Cheap versus dear — that is the whole
 *  starting position. */
export const FOSSIL_BASE_H = 120;
export const GREEN_BASE_H = 340;
/** One landed charge. */
export const SLAB_H = 10;
export const TOTAL_SLABS = 26;
/** The first slab count whose total beats the green column:
 *  120 + 23×10 = 350 > 340, while 22 slabs (340) still tie and lose. */
export const CROSS_SLABS = 23;

// ===== The cycle ============================================================
const DASH_CYCLE_S = 1.6;

export const CYCLE_S = 28;
/** A breath before the first charge lands… */
export const LEAD = [0.0, 0.04] as const;
/** …the three rules stack their slabs and the columns cross… */
export const STACK = [0.04, 0.62] as const;
/** …the crossed state holds while the green vessel carries the cargo… */
export const TALLY = [0.62, 0.9] as const;
export const RESET = [0.9, 1.0] as const;

const SLAB_INTERVAL = (STACK[1] - STACK[0]) / TOTAL_SLABS;
/** The phase at which slab number CROSS_SLABS has landed — the flip. */
export const CROSS_PHASE = STACK[0] + CROSS_SLABS * SLAB_INTERVAL;

/** t=0 — the reduced-motion poster — lands just after the flip: the stack
 *  above the line, the flip plate up, the cargo already on the green ship. */
export const POSTER_OFFSET_S = 0.58 * CYCLE_S;

export function phaseAt(time: number): number {
  const s = (time + POSTER_OFFSET_S) % CYCLE_S;
  return (s < 0 ? s + CYCLE_S : s) / CYCLE_S;
}

/** Slabs landed by phase `p` — derived, never accumulated, so the poster
 *  gets the correct mid-story stack for free. */
export function slabsAt(p: number): number {
  if (p < STACK[0]) return 0;
  return Math.min(TOTAL_SLABS, Math.floor((p - STACK[0]) / SLAB_INTERVAL));
}

export function crossedAt(p: number): boolean {
  return slabsAt(p) >= CROSS_SLABS;
}

const GREEN_TOP_Y = GROUND_Y - GREEN_BASE_H;

// ===== Shared chrome ========================================================
function plated(
  ctx: CanvasRenderingContext2D,
  frame: Frame<Ink>,
  text: string,
  x: number,
  y: number,
  anchor: "start" | "middle" | "end" = "start",
): void {
  libLabelPlate(ctx, text, x, y, frame.font, frame.palette.land, anchor);
  ctx.fillStyle = frame.palette.label;
  monoLabel(ctx, text, x, y, frame.font, { anchor });
}

function ride(path: readonly Point[], u: number): Point {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1];
    const b = path[i];
    if (a && b) total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  let remaining = Math.min(Math.max(u, 0), 1) * total;
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1];
    const b = path[i];
    if (!a || !b) continue;
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (remaining <= seg) {
      const t = seg > 0 ? remaining / seg : 0;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    remaining -= seg;
  }
  return path[path.length - 1] ?? [0, 0];
}

// ===== The cards ============================================================
function drawCards(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  for (const card of CARDS) {
    const b = card.box;
    ctx.fillStyle = frame.palette.land;
    ctx.strokeStyle = frame.palette.ink;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.rect(b.x, b.y, b.w, b.h);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.rect(b.x + 3, b.y + 3, b.w - 6, b.h - 6);
    ctx.stroke();

    const cx = b.x + b.w / 2;
    ctx.fillStyle = frame.palette.label;
    monoLabel(ctx, card.title, cx, b.y + 24, frame.font, { size: 10, spacing: 2, anchor: "middle" });
    ctx.fillStyle = frame.palette.inkSoft;
    monoLabel(ctx, card.price, cx, b.y + 44, frame.font, { size: 8, spacing: 1, anchor: "middle" });
    monoLabel(ctx, card.from, cx, b.y + 60, frame.font, { size: 8, spacing: 1, anchor: "middle" });
  }
}

/** One horizontal bus collects all three cards, one drop delivers to the
 *  stack — the busbar idiom from the stack scene's power collectors. The
 *  earlier version gave each card its own elbow at its own height, and three
 *  parallel dashed runs read as clutter; a single bus is one line. */
const BUS_Y = 240;
const DROP_X = FOSSIL_COL.x + FOSSIL_COL.w / 2;
const DROP_END_Y = 352;

function drawRails(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const phase = (frame.time % DASH_CYCLE_S) / DASH_CYCLE_S;
  const offset = -phase * 8;
  ctx.strokeStyle = frame.palette.inkSoft;
  ctx.lineWidth = 1;
  dashed(ctx, () => {
    ctx.beginPath();
    // Taps down onto the bus, one per card.
    for (const card of CARDS) {
      const cx = card.box.x + card.box.w / 2;
      ctx.moveTo(cx, card.box.y + card.box.h);
      ctx.lineTo(cx, BUS_Y);
    }
    // Both bus runs converge on the drop, source-first so the dashes march
    // toward where the money lands.
    const first = CARDS[0];
    const last = CARDS[CARDS.length - 1];
    ctx.moveTo(first ? first.box.x + first.box.w / 2 : 190, BUS_Y);
    ctx.lineTo(DROP_X, BUS_Y);
    ctx.moveTo(last ? last.box.x + last.box.w / 2 : 710, BUS_Y);
    ctx.lineTo(DROP_X, BUS_Y);
    // The drop.
    ctx.moveTo(DROP_X, BUS_Y);
    ctx.lineTo(DROP_X, DROP_END_Y);
    ctx.stroke();
  }, [3, 5], offset);

  ctx.beginPath();
  ctx.moveTo(DROP_X - 4, DROP_END_Y - 6);
  ctx.lineTo(DROP_X, DROP_END_Y + 2);
  ctx.lineTo(DROP_X + 4, DROP_END_Y - 6);
  ctx.stroke();
}

// ===== The columns ==========================================================
function drawAxis(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(130, GROUND_Y);
  ctx.lineTo(130, 430);
  ctx.moveTo(126, 438);
  ctx.lineTo(130, 428);
  ctx.lineTo(134, 438);
  ctx.stroke();
  plated(ctx, frame, "[ COST ]", 104, 416);

  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(80, GROUND_Y);
  ctx.lineTo(820, GROUND_Y);
  ctx.stroke();
}

function drawColumns(ctx: CanvasRenderingContext2D, frame: Frame<Ink>, p: number, fade: number): void {
  // Fossil base: the cheap fuel.
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.3;
  box(ctx, FOSSIL_COL.x, GROUND_Y - FOSSIL_BASE_H, FOSSIL_COL.w, FOSSIL_BASE_H, frame.palette.land);
  ctx.fillStyle = frame.palette.label;
  monoLabel(ctx, "FUEL", FOSSIL_COL.x + FOSSIL_COL.w / 2, GROUND_Y - FOSSIL_BASE_H / 2 + 3, frame.font, {
    size: 9,
    spacing: 2,
    anchor: "middle",
  });

  // Green base: the dear fuel, holding still.
  ctx.strokeStyle = frame.palette.green;
  ctx.lineWidth = 1.5;
  box(ctx, GREEN_COL.x, GROUND_Y - GREEN_BASE_H, GREEN_COL.w, GREEN_BASE_H, frame.palette.land);
  ctx.save();
  ctx.beginPath();
  ctx.rect(GREEN_COL.x, GROUND_Y - GREEN_BASE_H, GREEN_COL.w, GREEN_BASE_H);
  ctx.clip();
  ctx.strokeStyle = frame.palette.green;
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = 1;
  dashed(ctx, () => {
    ctx.beginPath();
    for (let c = GREEN_COL.x - GREEN_BASE_H; c < GREEN_COL.x + GREEN_COL.w; c += 9) {
      ctx.moveTo(c, GROUND_Y);
      ctx.lineTo(c + GREEN_BASE_H, GROUND_Y - GREEN_BASE_H);
    }
    ctx.stroke();
  }, [1, 5]);
  ctx.restore();
  ctx.fillStyle = frame.palette.label;
  monoLabel(ctx, "FUEL", GREEN_COL.x + GREEN_COL.w / 2, GROUND_Y - GREEN_BASE_H / 2 + 3, frame.font, {
    size: 9,
    spacing: 2,
    anchor: "middle",
  });

  // The charges: one amber slab per landed charge, a hairline of daylight
  // between them so they read as a count, not a pour.
  const slabs = Math.floor(slabsAt(p) * fade);
  ctx.fillStyle = frame.palette.charge;
  for (let i = 0; i < slabs; i += 1) {
    const y = GROUND_Y - FOSSIL_BASE_H - (i + 1) * SLAB_H;
    ctx.fillRect(FOSSIL_COL.x, y + 1, FOSSIL_COL.w, SLAB_H - 1);
  }

  // The line to beat.
  ctx.strokeStyle = frame.palette.inkSoft;
  ctx.lineWidth = 1;
  dashed(ctx, () => polyline(ctx, [[210, GREEN_TOP_Y], [820, GREEN_TOP_Y]]), [3, 4]);
  plated(ctx, frame, "[ GREEN TOTAL ]", 836, GREEN_TOP_Y - 8, "end");

  // The flip, the instant the arithmetic says so.
  if (crossedAt(p) && fade > 0.5) {
    plated(ctx, frame, "[ FOSSIL NOW DEARER ]", 450, 400, "middle");
  }

  plated(ctx, frame, "[ FOSSIL ]", FOSSIL_COL.x + FOSSIL_COL.w / 2, GROUND_Y + 28, "middle");
  plated(ctx, frame, "[ GREEN ]", GREEN_COL.x + GREEN_COL.w / 2, GROUND_Y + 28, "middle");
}

/** The charge in flight: each slab falls from the card that levied it —
 *  round-robin, the three rules taking turns — and rides the rails: down the
 *  card's tap, along the bus, down the drop onto the top of the stack. */
function drawFallingCharges(ctx: CanvasRenderingContext2D, frame: Frame<Ink>, p: number): void {
  const FALL = 0.028;
  for (let i = 0; i < TOTAL_SLABS; i += 1) {
    const landAt = STACK[0] + (i + 1) * SLAB_INTERVAL;
    if (p < landAt - FALL || p >= landAt) continue;
    const card = CARDS[i % CARDS.length];
    if (!card) continue;
    const cx = card.box.x + card.box.w / 2;
    const u = (p - (landAt - FALL)) / FALL;
    const stackTop = GROUND_Y - FOSSIL_BASE_H - i * SLAB_H - 5;
    const path: readonly Point[] = [
      [cx, card.box.y + card.box.h],
      [cx, BUS_Y],
      [DROP_X, BUS_Y],
      [DROP_X, stackTop],
    ];
    const [x, y] = ride(path, smoothstep(u));
    ctx.beginPath();
    ctx.rect(x - 3.5, y - 3.5, 7, 7);
    ctx.fillStyle = frame.palette.charge;
    ctx.fill();
  }
}

// ===== The sea strip ========================================================
const SEA_TOP = 830;
const SEA_BOTTOM = 930;
const LANE_FOSSIL_Y = 862;
const LANE_GREEN_Y = 902;

function drawHull(
  ctx: CanvasRenderingContext2D,
  frame: Frame<Ink>,
  x: number,
  y: number,
  green: boolean,
  alpha: number,
): void {
  if (alpha <= 0.02) return;
  const L = 20;
  const B = 6.4;
  const half = B / 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(-L / 2, -half);
  ctx.lineTo(L / 2 - 5.5, -half);
  ctx.lineTo(L / 2, 0);
  ctx.lineTo(L / 2 - 5.5, half);
  ctx.lineTo(-L / 2, half);
  ctx.closePath();
  if (green) {
    ctx.fillStyle = frame.palette.green;
    ctx.fill();
  } else {
    ctx.fillStyle = frame.palette.land;
    ctx.fill();
    ctx.strokeStyle = frame.palette.ink;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.restore();
}

function drawSea(ctx: CanvasRenderingContext2D, frame: Frame<Ink>, p: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(60, SEA_TOP, 780, SEA_BOTTOM - SEA_TOP);
  ctx.clip();
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 0.35;
  ctx.globalAlpha = 0.45;
  libGridLines(ctx, SPACE.width, SPACE.height, GRID_STEP, true, frame.time);
  ctx.globalAlpha = 1;
  ctx.restore();
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(60, SEA_TOP);
  ctx.lineTo(840, SEA_TOP);
  ctx.stroke();

  // Two marked lanes with berth ticks at both ends, so the strip reads as a
  // trade even when a hull is mid-fade.
  const phase = (frame.time % DASH_CYCLE_S) / DASH_CYCLE_S;
  ctx.strokeStyle = frame.palette.inkSoft;
  ctx.lineWidth = 1;
  for (const laneY of [LANE_FOSSIL_Y, LANE_GREEN_Y]) {
    dashed(ctx, () => polyline(ctx, [[150, laneY], [770, laneY]]), [3, 5], -phase * 8);
    ctx.beginPath();
    ctx.moveTo(150, laneY - 6);
    ctx.lineTo(150, laneY + 6);
    ctx.moveTo(770, laneY - 6);
    ctx.lineTo(770, laneY + 6);
    ctx.stroke();
  }

  // Whoever is cheaper carries the cargo; the other waits at the berth.
  const crossed = crossedAt(p);
  const SAIL_S = 9;
  const u = ((frame.time + POSTER_OFFSET_S) / SAIL_S) % 1;
  const laneX = 180 + u * 560;
  const laneAlpha = Math.min(1, u * 14, (1 - u) * 14);

  if (crossed) {
    drawHull(ctx, frame, 116, LANE_FOSSIL_Y, false, 0.45);
    drawHull(ctx, frame, laneX, LANE_GREEN_Y, true, laneAlpha);
  } else {
    drawHull(ctx, frame, laneX, LANE_FOSSIL_Y, false, laneAlpha);
    drawHull(ctx, frame, 116, LANE_GREEN_Y, true, 0.45);
  }

  plated(ctx, frame, "[ CARGO FOLLOWS THE CHEAPER FUEL ]", 450, 956, "middle");
}

// ===== The scene ============================================================
export const regulationsScene: Scene<Ink> = {
  id: "regulations",
  space: SPACE,
  palette: [
    { key: "ink", prop: "--anim-ink", fallback: "#3f3e3a" },
    { key: "inkSoft", prop: "--anim-ink-soft", fallback: "#9b9a90" },
    { key: "land", prop: "--anim-land", fallback: "#f2f2ed" },
    { key: "green", prop: "--anim-ship", fallback: "#4ea72e" },
    { key: "label", prop: "--viz-ink-secondary", fallback: "#52514e" },
    { key: "charge", prop: "--viz-carbon", fallback: "#b45309" },
  ],

  draw(ctx, frame) {
    const p = phaseAt(frame.time);
    // The stack breathes out over the reset window instead of vanishing on
    // the loop seam.
    const fade = p >= RESET[0] ? 1 - smoothstep((p - RESET[0]) / (RESET[1] - RESET[0])) : 1;

    drawRails(ctx, frame);
    drawCards(ctx, frame);
    drawAxis(ctx, frame);
    drawColumns(ctx, frame, p, fade);
    drawFallingCharges(ctx, frame, p);
    drawSea(ctx, frame, p);

    plated(ctx, frame, "[ REGULATIONS · THE MECHANISM ]", 60, 46);
    plated(ctx, frame, "[ PRICE THE FOSSIL TONNE ]", 840, 46, "end");
  },
};
