import { box, caption as libCaption, chevron, crosshair, dashed, gridLines as libGridLines, labelPlate as libLabelPlate, monoLabel, polyline, shape, ticks } from "@/lib/animation/draw";
import { berthEase } from "@/lib/animation/ease";
import { measure, poseAt, type MeasuredPath } from "@/lib/animation/polyline";
import type { DesignSpace, Frame, Point, Scene } from "@/lib/animation/types";

/** The colours this scene draws with. Naming them makes `frame.palette.ink` a
 *  plain string and a typo a compile error. */
type Ink = "ink" | "inkSoft" | "land" | "ship" | "label" | "grid";

/**
 * The corridor as a stacked system — three framed blocks, not a map.
 *
 * Top: PORTS · CARGO FLOW. Two generic quays face each other across a strip
 * of sea; the fleet runs a closed circuit between them, laden east, ballast
 * west, and a gantry works each berth.
 *
 * Middle: FUEL PRODUCTION. Water treatment → electrolysis → NH3 synthesis →
 * storage, on one shared ground line.
 *
 * Bottom: ENERGY PRODUCTION. Wind and PV collect onto a busbar and a
 * substation.
 *
 * The blocks connect only by risers: power marches up from the substation
 * into the electrolyser, fuel marches up from storage to a loading arm at
 * BOTH quays. That symmetry is the point — the production stack is sited
 * nowhere in particular ("SITE · ANYWHERE" on its title bar), it simply
 * feeds the corridor, whichever two ports the corridor happens to join.
 * Hence no coastlines, no place names, no compass: this is a process
 * schematic, where `shipping` is a chart.
 *
 * Same drawing language as the other scenes: monochrome linework, right
 * angles, everything on the shared 50-unit grid, dashes marching in the
 * direction of flow. Glyphs are redrawn (not imported from `shipping`) so
 * each scene stays a self-contained file, per the gallery convention.
 */

const SPACE: DesignSpace = { width: 900, height: 1000, fit: "meet" };

// --- the three blocks -------------------------------------------------------
const GRID_STEP = 50;

interface Block {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
const PORTS_BLOCK: Block = { x: 60, y: 60, w: 780, h: 360 };
const FUEL_BLOCK: Block = { x: 60, y: 480, w: 780, h: 220 };
const ENERGY_BLOCK: Block = { x: 60, y: 760, w: 780, h: 180 };

// --- block 1 geometry: two quays and the sea between them -------------------
const QUAY_A_X = 190;
const QUAY_B_X = 710;
const LAND_A: readonly Point[] = [[60, 60], [QUAY_A_X, 60], [QUAY_A_X, 420], [60, 420]];
const LAND_B: readonly Point[] = [[QUAY_B_X, 60], [840, 60], [840, 420], [QUAY_B_X, 420]];
/** The water of block 1 — exported so a test can assert the fleet stays in it. */
export const SEA = { x0: QUAY_A_X, y0: 60, x1: QUAY_B_X, y1: 420 } as const;

export const BERTH_A = { x: 202, y: 270 } as const;
export const BERTH_B = { x: 698, y: 270 } as const;

/**
 * Laden lane, A → B. Both ends are vertical legs alongside the quay, so a
 * vessel arrives parallel to the wall and swings there — the same berthing
 * convention the shipping scene's tests enforce.
 */
export const ROUTE: readonly Point[] = [
  [202, 270], [202, 200], [250, 160], [650, 160], [698, 200], [698, 270],
];
/** Ballast lane back, offset south so the two directions never overrun. */
export const ROUTE_BACK: readonly Point[] = [
  [698, 270], [698, 330], [650, 368], [250, 368], [202, 330], [202, 270],
];
const WAYPOINTS: readonly Point[] = [[250, 160], [650, 160], [250, 368], [650, 368]];
const SEA_MARKS: readonly Point[] = [[410, 248], [455, 302]];

// --- motion -----------------------------------------------------------------
const DASH: readonly number[] = [7, 5];
const DASH_PERIOD = 12;
const DASH_CYCLE_S = 1.6;

/** One full circuit: out laden, back in ballast — same tempo as `shipping`. */
export const VOYAGE_S = 36;
const SAIL = 0.33; // of the cycle, each way
const DWELL = 0.17; // alongside, each end
/** Three vessels a third of a cycle apart: the berths never double-book
 *  (DWELL 0.17 < spacing 0.33) but the sea is never empty either. */
const FLEET: readonly number[] = [0, 12, 24];

const CRANE_S = 9;
/** Phase at which the spreader is at the bottom of its arc — the moment of
 *  pick-up or set-down. The hull colour flips on exactly this frame. */
const CRANE_TOUCH = 0.375;
const CRANE_TOUCH_LAND = 0.825;
const CRANE_A_STAGGER = 0;
const CRANE_B_STAGGER = 2.3;

/** t=0 — the reduced-motion poster — lands one ship mid-sea laden, one being
 *  worked at quay B, one homeward in ballast. */
export const POSTER_OFFSET_S = 0.15 * VOYAGE_S;

/** Precomputed once in setup(); the fleet needs arc length, not vertices. */
let routePath: MeasuredPath | null = null;
let returnPath: MeasuredPath | null = null;

function cranePhaseAt(time: number, stagger: number): number {
  return ((time + stagger) % CRANE_S) / CRANE_S;
}

/** How many loads a crane has landed since a vessel came alongside. */
function loadsSince(time: number, since: number, stagger: number): number {
  if (time <= since) return 0;
  const firstTouch = Math.ceil((since + stagger) / CRANE_S - CRANE_TOUCH);
  const lastTouch = Math.floor((time + stagger) / CRANE_S - CRANE_TOUCH);
  return Math.max(0, lastTouch - firstTouch + 1);
}

/** Is a vessel alongside the given quay right now? The cranes ask before
 *  reaching out, so they only ever work a ship that is actually there. */
function berthOccupied(time: number, quay: "a" | "b"): boolean {
  for (const offset of FLEET) {
    const cycle = ((time + offset) % VOYAGE_S) / VOYAGE_S;
    const alongside =
      quay === "a" ? cycle >= SAIL * 2 + DWELL : cycle >= SAIL && cycle < SAIL + DWELL;
    if (alongside) return true;
  }
  return false;
}

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

function caption(
  ctx: CanvasRenderingContext2D,
  frame: Frame<Ink>,
  text: string,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  anchor: "start" | "end" = "start",
): void {
  libCaption(ctx, text, fromX, fromY, toX, toY, frame.font, {
    leader: frame.palette.inkSoft,
    plate: frame.palette.land,
    text: frame.palette.label,
  }, anchor);
}

/** The block mesh, clipped to a rectangle so the shared 50-unit grid lines up
 *  across all three frames but exists only inside them. */
function clippedGrid(
  ctx: CanvasRenderingContext2D,
  frame: Frame<Ink>,
  rect: Block,
  wavy: boolean,
  alpha: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 0.35;
  ctx.globalAlpha = alpha;
  libGridLines(ctx, SPACE.width, SPACE.height, GRID_STEP, wavy, frame.time);
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawFrames(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.5;
  for (const b of [PORTS_BLOCK, FUEL_BLOCK, ENERGY_BLOCK]) {
    box(ctx, b.x, b.y, b.w, b.h);
  }
}

function drawTitles(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  plated(ctx, frame, "[ PORTS · CARGO FLOW ]", 74, 88);
  plated(ctx, frame, "[ ANY TWO PORTS ]", 826, 88, "end");
  plated(ctx, frame, "[ FUEL PRODUCTION ]", 74, 508);
  plated(ctx, frame, "[ SITE · ANYWHERE ]", 826, 508, "end");
  plated(ctx, frame, "[ ENERGY PRODUCTION ]", 74, 788);
  plated(ctx, frame, "[ SITE · ANYWHERE ]", 826, 788, "end");
}

// ===== Block 1: ports and the cargo flow ====================================
function drawSeaAndLand(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  clippedGrid(ctx, frame, { x: SEA.x0, y: SEA.y0, w: SEA.x1 - SEA.x0, h: SEA.y1 - SEA.y0 }, true, 0.45);
  shape(ctx, LAND_A, frame.palette.land, frame.palette.ink, 1.5);
  shape(ctx, LAND_B, frame.palette.land, frame.palette.ink, 1.5);
  clippedGrid(ctx, frame, { x: 60, y: 60, w: QUAY_A_X - 60, h: 360 }, false, 0.32);
  clippedGrid(ctx, frame, { x: QUAY_B_X, y: 60, w: 840 - QUAY_B_X, h: 360 }, false, 0.32);
}

function drawQuays(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.5;
  ticks(ctx, QUAY_A_X, [230, 260, 290, 320], 8);
  ticks(ctx, QUAY_B_X - 8, [230, 260, 290, 320], 8);
}

/** A row of container stacks standing on a ground line, growing upward. */
const BOX_W = 5.4;
const BOX_H = 2.4;
function containerStacks(
  ctx: CanvasRenderingContext2D,
  frame: Frame<Ink>,
  x: number,
  groundY: number,
  columns: number,
): void {
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 0.9;
  for (let col = 0; col < columns; col += 1) {
    const stack = (col % 3) + 1;
    for (let r = 0; r < stack; r += 1) {
      box(ctx, x + col * (BOX_W + 1), groundY - (r + 1) * BOX_H, BOX_W, BOX_H, frame.palette.land);
    }
  }
}

function drawYards(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  // The ready pile each crane works from, under its landside trolley position.
  containerStacks(ctx, frame, 138, 244, 4);
  containerStacks(ctx, frame, 734, 244, 4);
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(134, 244); ctx.lineTo(166, 244);
  ctx.moveTo(730, 244); ctx.lineTo(762, 244);
  ctx.stroke();
}

/**
 * Ship-to-shore gantry on a north-south quay, the `shipping` silhouette:
 * A-framed legs, one long cantilevered boom, nothing above it. `dir` is +1
 * reaching east over the water (quay A), -1 reaching west (quay B).
 */
function drawGantry(
  ctx: CanvasRenderingContext2D,
  frame: Frame<Ink>,
  quayX: number,
  groundY: number,
  dir: 1 | -1,
  stagger: number,
  berth: { readonly x: number; readonly y: number },
  quay: "a" | "b",
): void {
  const legFore = quayX - dir * 10;
  const legBack = quayX - dir * 33;
  const apexFore = quayX - dir * 16;
  const apexBack = quayX - dir * 27;
  const beam = groundY - 44;
  const boomTip = quayX + dir * 40;
  const backTip = quayX - dir * 54;

  // The working cycle: traverse out empty, dip into the hold, carry back,
  // land on the apron. Parked over the apron when no ship is alongside.
  const working = berthOccupied(frame.time, quay);
  const phase = working ? cranePhaseAt(frame.time, stagger) : 0.95;
  const overShip = berth.x;
  const overApron = quayX - dir * 38;
  let travel: number;
  let drop: number;
  let holding: boolean;
  if (phase < 0.3) {
    travel = phase / 0.3;
    drop = 0;
    holding = false;
  } else if (phase < 0.45) {
    travel = 1;
    drop = Math.sin(((phase - 0.3) / 0.15) * Math.PI);
    holding = phase > CRANE_TOUCH;
  } else if (phase < 0.75) {
    travel = 1 - (phase - 0.45) / 0.3;
    drop = 0;
    holding = true;
  } else if (phase < 0.9) {
    travel = 0;
    drop = Math.sin(((phase - 0.75) / 0.15) * Math.PI);
    holding = phase < CRANE_TOUCH_LAND;
  } else {
    travel = 0;
    drop = 0;
    holding = false;
  }
  const trolley = overApron + (overShip - overApron) * travel;
  const restY = beam + 8;
  const seaDeckY = berth.y - 3; // the deck sits just above the waterline
  const landStackY = groundY - 12;
  const targetY = travel > 0.5 ? seaDeckY : landStackY;
  const spreader = restY + drop * (targetY - restY);

  ctx.strokeStyle = frame.palette.ink;

  // Ground along the quay.
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(legBack - dir * 56, groundY); ctx.lineTo(quayX, groundY);
  ctx.stroke();

  // A-frame legs, joined only where they meet the boom.
  ctx.beginPath();
  ctx.moveTo(legBack, groundY); ctx.lineTo(apexBack, beam);
  ctx.moveTo(legFore, groundY); ctx.lineTo(apexFore, beam);
  ctx.stroke();

  // One diagonal brace inside the portal — bracing, not a lintel.
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(legBack - dir * 2, groundY - 7);
  ctx.lineTo(apexFore - dir * 2, beam + 11);
  ctx.stroke();

  // The boom: one long horizontal, nothing above it.
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(backTip, beam); ctx.lineTo(boomTip, beam);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(boomTip, beam); ctx.lineTo(boomTip - dir * 16, beam + 7);
  ctx.lineTo(apexFore, beam + 7);
  ctx.stroke();

  // Trolley, hoist ropes, spreader — and the box, when one is on the hook.
  ctx.beginPath();
  ctx.moveTo(trolley - 2.6, beam); ctx.lineTo(trolley - 2.6, spreader);
  ctx.moveTo(trolley + 2.6, beam); ctx.lineTo(trolley + 2.6, spreader);
  ctx.stroke();
  ctx.lineWidth = 1.2;
  box(ctx, trolley - 6, spreader, 12, 3.4, frame.palette.land);
  if (holding) {
    box(ctx, trolley - 7, spreader + 3.4, 14, 5, frame.palette.land);
  }
}

/** A container vessel in plan, bow along +x before rotation. */
function drawVessel(
  ctx: CanvasRenderingContext2D,
  frame: Frame<Ink>,
  x: number,
  y: number,
  angle: number,
  laden: boolean,
): void {
  const L = 22;
  const B = 7;
  const half = B / 2;
  const bow = L * 0.5;
  const stern = -L * 0.5;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Hull: straight sides, raked stem, square transom.
  ctx.beginPath();
  ctx.moveTo(stern, -half);
  ctx.lineTo(bow - 6, -half);
  ctx.lineTo(bow, 0);
  ctx.lineTo(bow - 6, half);
  ctx.lineTo(stern, half);
  ctx.closePath();
  if (laden) {
    ctx.fillStyle = frame.palette.ship;
    ctx.fill();
  } else {
    // Ballast: outline only, the empty-symbol convention.
    ctx.fillStyle = frame.palette.land;
    ctx.fill();
    ctx.strokeStyle = frame.palette.ship;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  ctx.strokeStyle = laden ? frame.palette.ink : frame.palette.ship;
  ctx.lineWidth = 0.9;
  if (laden) {
    // Rows of boxes on deck.
    ctx.beginPath();
    for (let i = 0; i < 5; i += 1) {
      const cx = stern + 5 + i * 2.8;
      ctx.rect(cx, -half + 1, 2.2, B - 2);
    }
    ctx.stroke();
  }

  // Deckhouse aft + mast.
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(stern + 1.5, -half + 1.2, 3.5, B - 2.4);
  ctx.moveTo(stern + 7, 0);
  ctx.lineTo(stern + 9, 0);
  ctx.stroke();

  ctx.restore();
}

/**
 * The fleet: [sail out laden | worked at B | sail home in ballast | loaded at
 * A]. The hull flips colour on the exact frame the crane's spreader touches
 * the deck, per the shipping scene's contract.
 */
function drawFleet(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  if (!routePath || !returnPath) return;

  for (const offset of FLEET) {
    const cycle = ((frame.time + offset) % VOYAGE_S) / VOYAGE_S;
    let path = routePath;
    let u: number;
    let laden: boolean;

    if (cycle < SAIL) {
      path = routePath;
      u = berthEase(cycle / SAIL);
      laden = true;
    } else if (cycle < SAIL + DWELL) {
      // Alongside at B, discharging: laden until the first lift comes clear.
      path = routePath;
      u = 1;
      const arrived = frame.time - (cycle - SAIL) * VOYAGE_S;
      laden = loadsSince(frame.time, arrived, CRANE_B_STAGGER) === 0;
    } else if (cycle < SAIL * 2 + DWELL) {
      path = returnPath;
      u = berthEase((cycle - SAIL - DWELL) / SAIL);
      laden = false;
    } else {
      // Alongside at A, loading: empty until the first box is set down.
      path = returnPath;
      u = 1;
      const arrived = frame.time - (cycle - (SAIL * 2 + DWELL)) * VOYAGE_S;
      laden = loadsSince(frame.time, arrived, CRANE_A_STAGGER) > 0;
    }

    const { x, y, angle } = poseAt(path, u);
    drawVessel(ctx, frame, x, y, angle, laden);
  }
}

function drawLanes(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const phase = (frame.time % DASH_CYCLE_S) / DASH_CYCLE_S;
  // Ballast lane first, lighter — present, but not the headline.
  ctx.strokeStyle = frame.palette.inkSoft;
  ctx.lineWidth = 1.2;
  dashed(ctx, () => polyline(ctx, ROUTE_BACK), [3, 5]);
  // Laden lane, marching A → B.
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.8;
  dashed(ctx, () => polyline(ctx, ROUTE), DASH, -phase * DASH_PERIOD);

  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.5;
  for (const [x, y] of WAYPOINTS) crosshair(ctx, x, y, 4);
  ctx.strokeStyle = frame.palette.inkSoft;
  ctx.lineWidth = 1.2;
  for (const [x, y] of SEA_MARKS) chevron(ctx, x, y);
}

// ===== Block 2: fuel production =============================================
const FUEL_GROUND = 650;

function drawWaterPlant(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.strokeStyle = frame.palette.ink;
  // Two racks of treatment vessels: long tubes, stacked.
  for (const ry of [620, 636] as const) {
    ctx.lineWidth = 1.2;
    box(ctx, 100, ry, 52, 10, frame.palette.land);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (let i = 1; i < 4; i += 1) {
      ctx.moveTo(100, ry + i * 2.5);
      ctx.lineTo(152, ry + i * 2.5);
    }
    ctx.stroke();
  }
  // Clearwater tank beside the racks.
  ctx.lineWidth = 1.3;
  box(ctx, 162, 628, 16, 22, frame.palette.land);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(162, 634); ctx.lineTo(178, 634);
  ctx.stroke();
}

function drawElectrolyser(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.4;
  box(ctx, 290, 620, 100, 30, frame.palette.land);
  // Stack modules — the repeated cell that says "electrolyser".
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  for (let i = 1; i < 6; i += 1) {
    ctx.moveTo(290 + (i * 100) / 6, 622);
    ctx.lineTo(290 + (i * 100) / 6, 648);
  }
  ctx.stroke();
  // A second hall behind, so it reads as a plant rather than one shed.
  ctx.lineWidth = 1.2;
  box(ctx, 300, 592, 80, 16, frame.palette.land);
}

/** Sphere on its skirt: the pressurised-storage glyph shared with `shipping`. */
function drawSphere(
  ctx: CanvasRenderingContext2D,
  frame: Frame<Ink>,
  cx: number,
  baseY: number,
  r: number,
): void {
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(cx, baseY - r - 2, r, 0, Math.PI * 2);
  ctx.fillStyle = frame.palette.land;
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx - r, baseY - r - 2); ctx.lineTo(cx + r, baseY - r - 2);
  ctx.moveTo(cx - r * 0.7, baseY - 2); ctx.lineTo(cx - r * 0.7, baseY);
  ctx.moveTo(cx + r * 0.7, baseY - 2); ctx.lineTo(cx + r * 0.7, baseY);
  ctx.stroke();
}

function drawSynthesis(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.strokeStyle = frame.palette.ink;
  // Two reactor columns with X-lacing.
  ctx.lineWidth = 1.3;
  box(ctx, 455, 632, 6, 18, frame.palette.land);
  box(ctx, 465, 632, 6, 18, frame.palette.land);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(455, 632); ctx.lineTo(461, FUEL_GROUND);
  ctx.moveTo(461, 632); ctx.lineTo(455, FUEL_GROUND);
  ctx.moveTo(465, 632); ctx.lineTo(471, FUEL_GROUND);
  ctx.moveTo(471, 632); ctx.lineTo(465, FUEL_GROUND);
  ctx.stroke();
  // Process spheres.
  drawSphere(ctx, frame, 488, FUEL_GROUND, 11);
  drawSphere(ctx, frame, 512, FUEL_GROUND, 11);
  // Flare stack — the tallest thing in the works.
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(545, FUEL_GROUND); ctx.lineTo(545, 622); ctx.lineTo(520, 622);
  ctx.stroke();
}

function drawStorage(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  for (const cx of [620, 655, 690] as const) {
    drawSphere(ctx, frame, cx, FUEL_GROUND, 14);
  }
}

function drawFuelGround(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(90, FUEL_GROUND); ctx.lineTo(745, FUEL_GROUND);
  ctx.stroke();
}

/**
 * Every process flow in the middle block, plus the two fuel risers up to the
 * quays. The risers deliberately cross the block borders — the connection IS
 * the story — and the header tees symmetrically, one branch per port.
 */
function drawFuelFlows(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const phase = (frame.time % DASH_CYCLE_S) / DASH_CYCLE_S;
  const offset = -phase * DASH_PERIOD;
  ctx.strokeStyle = frame.palette.inkSoft;
  ctx.lineWidth = 1.1;
  dashed(
    ctx,
    () => {
      ctx.beginPath();
      // Raw water in from outside the frame — the source is off-sheet.
      ctx.moveTo(48, 641); ctx.lineTo(100, 641);
      // Treated water → electrolyser.
      ctx.moveTo(178, 638); ctx.lineTo(290, 638);
      // Electrolyser → synthesis (hydrogen).
      ctx.moveTo(390, 632); ctx.lineTo(455, 632);
      // Synthesis → storage.
      ctx.moveTo(525, 640); ctx.lineTo(604, 640);
      // Storage → header → riser → loading arm at quay A...
      ctx.moveTo(655, FUEL_GROUND); ctx.lineTo(655, 678);
      ctx.lineTo(85, 678); ctx.lineTo(85, 270); ctx.lineTo(180, 270);
      // ...and the mirror branch to quay B.
      ctx.moveTo(655, 678); ctx.lineTo(800, 678);
      ctx.lineTo(800, 270); ctx.lineTo(720, 270);
      ctx.stroke();
    },
    DASH,
    offset,
  );

  // Loading arms at each quay: the last few metres of the chain.
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(180, 262); ctx.lineTo(180, 268); ctx.lineTo(189, 268);
  ctx.moveTo(720, 262); ctx.lineTo(720, 268); ctx.lineTo(711, 268);
  ctx.stroke();
}

// ===== Block 3: energy production ===========================================
const ENERGY_GROUND = 900;
const BUSBAR_Y = 920;
const RISER_X = 340; // dead under the electrolyser hall, one straight run

function drawTurbine(
  ctx: CanvasRenderingContext2D,
  frame: Frame<Ink>,
  x: number,
  h: number,
  phase: number,
  spin: number,
): void {
  const hubY = ENERGY_GROUND - h;
  const blade = h * 0.62;

  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x, ENERGY_GROUND);
  ctx.lineTo(x, hubY);
  ctx.stroke();

  ctx.save();
  ctx.translate(x, hubY);
  ctx.rotate(frame.time * spin * Math.PI * 2 + phase);
  ctx.beginPath();
  for (let i = 0; i < 3; i += 1) {
    const a = (i * Math.PI * 2) / 3;
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * blade, Math.sin(a) * blade);
  }
  ctx.stroke();
  ctx.restore();

  // Nacelle last, so it caps the blade roots.
  ctx.fillStyle = frame.palette.land;
  ctx.beginPath();
  ctx.arc(x, hubY, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawWindFarm(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const rows: readonly [x: number, h: number, phase: number, spin: number][] = [
    [110, 38, 0.0, 0.22],
    [172, 34, 1.7, 0.19],
    [234, 40, 3.1, 0.25],
    [296, 36, 5.0, 0.2],
  ];
  for (const [x, h, phase, spin] of rows) drawTurbine(ctx, frame, x, h, phase, spin);
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(90, ENERGY_GROUND); ctx.lineTo(320, ENERGY_GROUND);
  ctx.stroke();
}

function drawPvArray(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.strokeStyle = frame.palette.ink;
  const blocks: readonly [x: number, y: number, w: number, rows: number][] = [
    [500, 858, 120, 5],
    [655, 858, 120, 5],
  ];
  for (const [bx, by, bw, rows] of blocks) {
    // Parcel first — an opaque plate that masks the mesh under the rows.
    ctx.lineWidth = 1.2;
    box(ctx, bx - 6, by - 5, bw + 12, rows * 6.6 + 4, frame.palette.land);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (let r = 0; r < rows; r += 1) {
      const y = by + r * 6.6;
      ctx.moveTo(bx, y + 1.5);
      ctx.lineTo(bx + bw, y + 1.5);
    }
    ctx.stroke();
  }
}

function drawSubstation(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.3;
  box(ctx, 322, 898, 36, 22, frame.palette.land);
  // Transformer hatch.
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(326, 916); ctx.lineTo(354, 902);
  ctx.moveTo(326, 902); ctx.lineTo(354, 916);
  ctx.stroke();
}

/** Collectors onto the busbar, then the one riser up into the electrolyser.
 *  Every subpath is drawn source-first so the dashes march with the power. */
function drawPowerFlows(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const phase = (frame.time % DASH_CYCLE_S) / DASH_CYCLE_S;
  const offset = -phase * DASH_PERIOD;
  ctx.strokeStyle = frame.palette.inkSoft;
  ctx.lineWidth = 1.1;
  dashed(
    ctx,
    () => {
      ctx.beginPath();
      // Taps down onto the busbar.
      ctx.moveTo(200, ENERGY_GROUND); ctx.lineTo(200, BUSBAR_Y);
      ctx.moveTo(560, 892); ctx.lineTo(560, BUSBAR_Y);
      ctx.moveTo(715, 892); ctx.lineTo(715, BUSBAR_Y);
      // Both busbar runs converge on the substation.
      ctx.moveTo(140, BUSBAR_Y); ctx.lineTo(322, BUSBAR_Y);
      ctx.moveTo(760, BUSBAR_Y); ctx.lineTo(358, BUSBAR_Y);
      // The riser: substation → electrolyser, straight through both borders.
      ctx.moveTo(RISER_X, 898); ctx.lineTo(RISER_X, FUEL_GROUND);
      ctx.stroke();
    },
    DASH,
    offset,
  );
}

// ===== The scene ============================================================
export const stackScene: Scene<Ink> = {
  id: "stack",
  space: SPACE,
  palette: [
    { key: "ink", prop: "--anim-ink", fallback: "#3f3e3a" },
    { key: "inkSoft", prop: "--anim-ink-soft", fallback: "#9b9a90" },
    { key: "land", prop: "--anim-land", fallback: "#f2f2ed" },
    { key: "ship", prop: "--anim-ship", fallback: "#4ea72e" },
    { key: "label", prop: "--viz-ink-secondary", fallback: "#52514e" },
    { key: "grid", prop: "--viz-grid", fallback: "#e1e0d9" },
  ],

  setup() {
    routePath = measure(ROUTE);
    returnPath = measure(ROUTE_BACK);
  },

  draw(ctx, frame) {
    // Shift the clock so the t=0 poster catches the system mid-story.
    const f: Frame<Ink> = { ...frame, time: frame.time + POSTER_OFFSET_S };

    // --- the frames and their meshes ---------------------------------------
    drawSeaAndLand(ctx, f);
    clippedGrid(ctx, f, FUEL_BLOCK, false, 0.32);
    clippedGrid(ctx, f, ENERGY_BLOCK, false, 0.32);
    drawFrames(ctx, f);

    // --- energy production, then its riser ---------------------------------
    drawWindFarm(ctx, f);
    drawPvArray(ctx, f);
    drawPowerFlows(ctx, f);
    drawSubstation(ctx, f);
    caption(ctx, f, "[ WIND ]", 120, 902, 95, 934);
    caption(ctx, f, "[ PV ARRAY ]", 770, 896, 800, 934, "end");

    // --- fuel production, then its risers to both quays ---------------------
    drawFuelGround(ctx, f);
    drawFuelFlows(ctx, f);
    drawWaterPlant(ctx, f);
    drawElectrolyser(ctx, f);
    drawSynthesis(ctx, f);
    drawStorage(ctx, f);
    caption(ctx, f, "[ WATER ]", 126, 616, 116, 560);
    caption(ctx, f, "[ ELECTROLYSIS ]", 340, 588, 310, 560);
    caption(ctx, f, "[ NH3 SYNTHESIS ]", 500, 618, 471, 560);
    caption(ctx, f, "[ STORAGE ]", 655, 616, 650, 560);

    // --- ports and the cargo flow -------------------------------------------
    drawQuays(ctx, f);
    drawYards(ctx, f);
    drawLanes(ctx, f);
    drawGantry(ctx, f, QUAY_A_X, BERTH_A.y - 26, 1, CRANE_A_STAGGER, BERTH_A, "a");
    drawGantry(ctx, f, QUAY_B_X, BERTH_B.y - 26, -1, CRANE_B_STAGGER, BERTH_B, "b");
    drawFleet(ctx, f);
    plated(ctx, f, "[ PORT A ]", 74, 130);
    plated(ctx, f, "[ PORT B ]", 826, 130, "end");
    plated(ctx, f, "[ LADEN ]", 450, 145, "middle");
    plated(ctx, f, "[ BALLAST ]", 450, 392, "middle");

    // --- what crosses the gaps ----------------------------------------------
    plated(ctx, f, "[ FUEL ]", 93, 454);
    plated(ctx, f, "[ FUEL ]", 792, 454, "end");
    plated(ctx, f, "[ POWER ]", 348, 734);

    drawTitles(ctx, f);
  },
};
