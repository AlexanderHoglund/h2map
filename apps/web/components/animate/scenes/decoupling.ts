import {
  box,
  dashed,
  gridLines,
  labelPlate,
  monoLabel,
  polyline,
} from "@/lib/animation/draw";
import { berthEase, smoothstep } from "@/lib/animation/ease";
import { measure, poseAt, type MeasuredPath } from "@/lib/animation/polyline";
import type { DesignSpace, Frame, Point, Scene } from "@/lib/animation/types";

/** The colours this scene draws with. `attr` is the environmental attribute —
 *  the one green; its TOTAL is conserved across the whole diagram. */
type Ink = "ink" | "inkSoft" | "land" | "ship" | "label" | "attr";

/**
 * Decoupling — book & claim as a DIAGRAM, after the MMMCZCS model.
 *
 * Geography is gone: countries made the mechanism hard to see, so the stage
 * is now a drafting sheet read left → right. LEFT: the green corridor — an
 * ore carrier shuttling a vertical water strip on green fuel, its whole
 * environmental value aboard as one LARGE diamond. CENTRE: the ledger — the
 * value is verified at the REGISTRY and SPLIT into three standardized units,
 * pooled and routed by the DEMAND AGGREGATOR, whose counter-flow of pooled
 * purchase commitments marches back to finance the corridor's fuel. RIGHT:
 * three car-shipment lanes, one per cargo owner. Each unit docks onto a
 * specific shipment of cars — the cargo sails visibly decarbonized, green
 * with its diamond riding the hull — and is RETIRED at delivery.
 *
 * THE INVARIANT. A LEDGER, not a single holder: at every instant
 * aboard + verifying + in-transit + applied + retired === 3. Green enters
 * once per cycle (bunkering) and leaves only by retirement. Draw code may
 * not have green booleans of its own — every green reads `unitStateAt` /
 * `ledgerAt`, and a browserless test pins the ledger at 4801 samples plus
 * every unit's transition times. Each unit's retirement boundary IS its
 * carrier's arrival — one constant serves both, so they cannot drift apart.
 */

const SPACE: DesignSpace = { width: 900, height: 1000, fit: "slice" };
const GRID_STEP = 50;

// ===== The stage ============================================================
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The corridor's vertical water strip (left column). */
export const CORRIDOR_STRIP: Rect = { x: 100, y: 120, w: 120, h: 760 };
/** Three car-shipment lanes (right column), top to bottom. */
export const LANE_STRIPS: readonly Rect[] = [
  { x: 580, y: 195, w: 300, h: 70 },
  { x: 580, y: 475, w: 300, h: 70 },
  { x: 580, y: 755, w: 300, h: 70 },
];

/** The ledger cards (centre column) and the owner cards (one per lane). */
export const REGISTRY_CARD: Rect = { x: 380, y: 240, w: 140, h: 60 };
export const HUB_CARD: Rect = { x: 380, y: 460, w: 160, h: 80 };
export const OWNER_CARDS: readonly Rect[] = [
  { x: 596, y: 132, w: 96, h: 40 },
  { x: 596, y: 412, w: 96, h: 40 },
  { x: 596, y: 692, w: 96, h: 40 },
];

// --- corridor geometry ------------------------------------------------------
const ORE_LANE_X = 160;
const DISCHARGE_Y = 185; // berth at the top of the corridor strip
const LOAD_Y = 830; // berth at the bottom, beside the bunker
const ORE_SHUTTLE: readonly Point[] = [
  [ORE_LANE_X, LOAD_Y],
  [ORE_LANE_X, DISCHARGE_Y],
];

/** Verification leg: discharge quay → registry. One big token, all 3 units. */
const TOKEN_PATH: readonly Point[] = [
  [205, 185], [300, 228], [380, 264],
];
/** Registry → aggregator. */
const REG_HUB: readonly Point[] = [
  [450, 300], [450, 460],
];
/** Aggregator → each owner card, then down to the berth where the unit
 *  docks onto the shipment. */
const HUB_OWNER: readonly (readonly Point[])[] = [
  [[540, 480], [572, 300], [644, 172], [644, 230]],
  [[540, 500], [572, 448], [644, 452], [644, 510]],
  [[540, 520], [572, 660], [644, 732], [644, 790]],
];
/** The commitments' last leg: aggregator → the corridor's bunker. */
const HUB_BUNKER: readonly Point[] = [
  [380, 510], [290, 660], [215, 820],
];

// --- lane geometry ----------------------------------------------------------
const BERTH_X = 644; // where a carrier waits and its unit docks
const DELIVER_X = 856; // arrival: retirement fires here
const laneCenter = (lane: number): number => {
  const strip = LANE_STRIPS[lane];
  return strip ? strip.y + strip.h / 2 : 0;
};

// ===== The cycle and the ledger =============================================
export type UnitState = "aboard" | "verifying" | "in-transit" | "applied" | "retired";
export type UnitIndex = 0 | 1 | 2;

export const UNITS = 3;
export const CYCLE_S = 24;
/** t=0 — the reduced-motion poster — lands mid-voyage: the whole value
 *  aboard the green ship, the three shipments waiting at their quays. */
export const POSTER_OFFSET_S = 0.1 * CYCLE_S;

export const PHASES = {
  /** Counter-flow: pooled commitments march owners → aggregator → bunker. */
  commit: [0.04, 0.16],
  /** The big token lifts off at the discharge quay. */
  detach: 0.24,
  /** Verified and SPLIT into three standardized units at the registry. */
  mint: 0.32,
  /** Unit i docks onto shipment i — the cargo is now decarbonized. */
  dock: [0.42, 0.45, 0.48],
  /** Shipment i delivers; unit i retired against that voyage. */
  retire: [0.68, 0.72, 0.76],
  /** Next voyage's fuel bunkered — the ledger wraps to aboard. */
  bunker: 0.88,
} as const;

/** A carrier departs this long after its unit docks. */
export const CARRIER_DEPART_OFFSET = 0.04;

/** Carrier i's sailing window — arrival IS the unit's retirement boundary. */
export function carrierWindow(lane: UnitIndex): { depart: number; arrive: number } {
  return { depart: PHASES.dock[lane] + CARRIER_DEPART_OFFSET, arrive: PHASES.retire[lane] };
}

export function phaseAt(time: number): number {
  const s = (time + POSTER_OFFSET_S) % CYCLE_S;
  return (s < 0 ? s + CYCLE_S : s) / CYCLE_S;
}

/** Total function per unit: half-open intervals partition the cycle. */
export function unitStateAt(unit: UnitIndex, time: number): UnitState {
  const p = phaseAt(time);
  if (p < PHASES.detach) return "aboard";
  if (p < PHASES.mint) return "verifying";
  if (p < PHASES.dock[unit]) return "in-transit";
  if (p < PHASES.retire[unit]) return "applied";
  if (p < PHASES.bunker) return "retired";
  return "aboard";
}

export function ledgerAt(time: number): Record<UnitState, number> {
  const out: Record<UnitState, number> = {
    aboard: 0,
    verifying: 0,
    "in-transit": 0,
    applied: 0,
    retired: 0,
  };
  for (const unit of [0, 1, 2] as const) out[unitStateAt(unit, time)] += 1;
  return out;
}

// --- ore ship sub-timings ---------------------------------------------------
const ORE = {
  sailOut: [0.0, 0.2], // up the corridor, laden + the big green
  depart: 0.3, // leaves the discharge quay in ballast
  arriveHome: 0.55,
  loadFlip: 0.8,
} as const;

// --- marching-dash idiom ----------------------------------------------------
const DASH_CYCLE_S = 1.6;

/** Precomputed in setup(). */
let orePath: MeasuredPath | null = null;
let tokenPath: MeasuredPath | null = null;
let unitPaths: readonly MeasuredPath[] = [];

// ===== The sheet ============================================================
/** Paper with a straight grid; the water strips are cut out of it and carry
 *  the wavy grid — lanes read as water without any geography. */
function drawSheet(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.fillStyle = frame.palette.land;
  ctx.fillRect(0, 0, 900, 1000);
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 0.35;
  ctx.globalAlpha = 0.3;
  gridLines(ctx, 900, 1000, GRID_STEP, false, frame.time);
  ctx.globalAlpha = 1;

  for (const strip of [CORRIDOR_STRIP, ...LANE_STRIPS]) {
    ctx.clearRect(strip.x, strip.y, strip.w, strip.h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(strip.x, strip.y, strip.w, strip.h);
    ctx.clip();
    ctx.strokeStyle = frame.palette.ink;
    ctx.lineWidth = 0.35;
    ctx.globalAlpha = 0.4;
    gridLines(ctx, 900, 1000, GRID_STEP, true, frame.time);
    ctx.restore();
    ctx.strokeStyle = frame.palette.ink;
    ctx.lineWidth = 1.2;
    box(ctx, strip.x, strip.y, strip.w, strip.h, null);
  }
}

// ===== Corridor furniture ===================================================
function drawCorridorPorts(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  // Berth ticks: discharge quay at the top, loading quay at the bottom.
  for (const y of [150, 168, 186, 204]) {
    ctx.moveTo(220, y);
    ctx.lineTo(228, y);
  }
  for (const y of [800, 818, 836, 854]) {
    ctx.moveTo(220, y);
    ctx.lineTo(228, y);
  }
  ctx.stroke();

  // The ore stock and the green-fuel bunker at the loading port.
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(240, 850);
  ctx.lineTo(252, 838);
  ctx.lineTo(264, 850);
  ctx.closePath();
  ctx.fillStyle = frame.palette.land;
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 1.3;
  box(ctx, 234, 806, 20, 16, frame.palette.land);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(234, 811);
  ctx.lineTo(254, 811);
  ctx.stroke();
}

/** Bunkering line: green ENTERS the diagram here, once per cycle. */
function drawBunkerLine(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const p = phaseAt(frame.time);
  const active = p >= 0.86 && p < 0.96;
  const phase = (frame.time % DASH_CYCLE_S) / DASH_CYCLE_S;
  ctx.strokeStyle = active ? frame.palette.attr : frame.palette.inkSoft;
  ctx.lineWidth = active ? 1.4 : 1;
  dashed(
    ctx,
    () => {
      ctx.beginPath();
      ctx.moveTo(234, 814);
      ctx.lineTo(200, 826);
      ctx.lineTo(172, 830);
      ctx.stroke();
    },
    [3, 3],
    active ? -phase * 6 : 0,
  );
}

// ===== The ledger cards =====================================================
function drawRegistry(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const p = phaseAt(frame.time);
  const c = REGISTRY_CARD;
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.4;
  box(ctx, c.x, c.y, c.w, c.h, frame.palette.land);
  ctx.lineWidth = 0.8;
  box(ctx, c.x + 4, c.y + 4, c.w - 8, c.h - 8, null);
  // Ledger lines inside.
  ctx.beginPath();
  for (let i = 1; i < 4; i += 1) {
    ctx.moveTo(c.x + 12, c.y + 8 + i * 11);
    ctx.lineTo(c.x + c.w - 12, c.y + 8 + i * 11);
  }
  ctx.stroke();

  // The mint: the card acknowledges as the value splits into units.
  if (p >= PHASES.mint - 0.01 && p < PHASES.mint + 0.04) {
    const k = (p - (PHASES.mint - 0.01)) / 0.05;
    ctx.save();
    ctx.globalAlpha = Math.sin(Math.min(Math.max(k, 0), 1) * Math.PI);
    ctx.strokeStyle = frame.palette.attr;
    ctx.lineWidth = 1.6;
    box(ctx, c.x - 3, c.y - 3, c.w + 6, c.h + 6, null);
    ctx.restore();
  }
}

function drawHub(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const c = HUB_CARD;
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.4;
  box(ctx, c.x, c.y, c.w, c.h, frame.palette.land);
  ctx.lineWidth = 0.8;
  box(ctx, c.x + 4, c.y + 4, c.w - 8, c.h - 8, null);
  // Pool glyph: three small squares funnelling into one — many buyers, one
  // structured offtake.
  ctx.lineWidth = 0.9;
  box(ctx, c.x + 16, c.y + 14, 10, 10, frame.palette.land);
  box(ctx, c.x + 16, c.y + 34, 10, 10, frame.palette.land);
  box(ctx, c.x + 16, c.y + 54, 10, 10, frame.palette.land);
  ctx.beginPath();
  ctx.moveTo(c.x + 26, c.y + 19);
  ctx.lineTo(c.x + 96, c.y + 36);
  ctx.moveTo(c.x + 26, c.y + 39);
  ctx.lineTo(c.x + 96, c.y + 40);
  ctx.moveTo(c.x + 26, c.y + 59);
  ctx.lineTo(c.x + 96, c.y + 44);
  ctx.stroke();
  ctx.lineWidth = 1.1;
  box(ctx, c.x + 96, c.y + 32, 16, 16, frame.palette.land);
}

function drawOwnerCards(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  for (const lane of [0, 1, 2] as const) {
    const c = OWNER_CARDS[lane];
    if (!c) continue;
    const applied = unitStateAt(lane, frame.time) === "applied";
    ctx.strokeStyle = frame.palette.ink;
    ctx.lineWidth = 1.3;
    box(ctx, c.x, c.y, c.w, c.h, frame.palette.land);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (let i = 1; i < 4; i += 1) {
      ctx.moveTo(c.x + (i * c.w) / 4, c.y);
      ctx.lineTo(c.x + (i * c.w) / 4, c.y + c.h);
    }
    ctx.moveTo(c.x, c.y + c.h / 2);
    ctx.lineTo(c.x + c.w, c.y + c.h / 2);
    ctx.stroke();
    // While its shipment sails decarbonized, the owner's card carries the
    // green edge — the claim is theirs, even though the diamond rides the ship.
    if (applied) {
      ctx.strokeStyle = frame.palette.attr;
      ctx.lineWidth = 1.4;
      box(ctx, c.x - 2, c.y - 2, c.w + 4, c.h + 4, null);
    }
  }
}

// ===== Rails ================================================================
function drawRails(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const p = phaseAt(frame.time);
  const phase = (frame.time % DASH_CYCLE_S) / DASH_CYCLE_S;
  const committing = p >= PHASES.commit[0] && p < PHASES.commit[1];

  ctx.strokeStyle = frame.palette.inkSoft;
  ctx.lineWidth = 0.9;
  dashed(ctx, () => polyline(ctx, TOKEN_PATH), [3, 3]);
  dashed(ctx, () => polyline(ctx, REG_HUB), [3, 3]);

  for (const rail of HUB_OWNER) {
    ctx.strokeStyle = committing ? frame.palette.ink : frame.palette.inkSoft;
    ctx.lineWidth = committing ? 1.2 : 0.9;
    // Positive offset marches the dashes backward along the path — from the
    // owners toward the aggregator: the commitments' direction.
    dashed(ctx, () => polyline(ctx, rail), [3, 3], committing ? phase * 6 : 0);
  }

  ctx.strokeStyle = committing ? frame.palette.ink : frame.palette.inkSoft;
  ctx.lineWidth = committing ? 1.2 : 0.9;
  dashed(ctx, () => polyline(ctx, HUB_BUNKER), [3, 3], committing ? -phase * 6 : 0);
}

// ===== Vessels ==============================================================
/** The ore bulker, drawn heading along +x before rotation. */
function drawBulker(
  ctx: CanvasRenderingContext2D,
  frame: Frame<Ink>,
  x: number,
  y: number,
  angle: number,
  laden: boolean,
  marked: boolean,
): void {
  const L = 30;
  const B = 9;
  const half = B / 2;
  const bow = L * 0.5;
  const stern = -L * 0.5;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  const hull = () => {
    ctx.beginPath();
    ctx.moveTo(stern, -half);
    ctx.lineTo(bow - 7, -half);
    ctx.lineTo(bow, 0);
    ctx.lineTo(bow - 7, half);
    ctx.lineTo(stern, half);
    ctx.closePath();
  };

  hull();
  if (laden) {
    ctx.fillStyle = frame.palette.ship;
    ctx.fill();
  } else {
    ctx.fillStyle = frame.palette.land;
    ctx.fill();
    ctx.strokeStyle = frame.palette.ship;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  ctx.strokeStyle = laden ? frame.palette.ink : frame.palette.ship;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  for (let i = 0; i < 4; i += 1) {
    ctx.rect(stern + 6 + i * 5.4, -half + 1.4, 3.8, B - 2.8);
  }
  ctx.rect(stern + 1, -half + 1.6, 3.4, B - 3.2);
  ctx.stroke();

  if (marked) {
    hull();
    ctx.strokeStyle = frame.palette.attr;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
  ctx.restore();

  // The voyage's ENTIRE value rides as one large diamond beside the hull —
  // drawn in world space so it does not rotate with the ship.
  if (marked) {
    diamond(ctx, x + 18, y, 6.5, frame.palette.attr, frame.palette.attr);
    eacTag(ctx, frame, x + 28, y + 3);
  }
}

/** A car carrier: slab hull with car glyphs on deck, sailing +x only. */
function drawCarCarrier(
  ctx: CanvasRenderingContext2D,
  frame: Frame<Ink>,
  x: number,
  y: number,
  laden: boolean,
  marked: boolean,
  alpha: number,
): void {
  if (alpha <= 0.02) return;
  const L = 24;
  const B = 9;
  const half = B / 2;
  const bow = L * 0.5;
  const stern = -L * 0.5;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);

  const hull = () => {
    ctx.beginPath();
    ctx.moveTo(stern + 2, -half);
    ctx.lineTo(bow - 4, -half);
    ctx.lineTo(bow, 0);
    ctx.lineTo(bow - 4, half);
    ctx.lineTo(stern + 2, half);
    ctx.lineTo(stern, half - 1.6);
    ctx.lineTo(stern, -half + 1.6);
    ctx.closePath();
  };

  hull();
  if (laden) {
    ctx.fillStyle = frame.palette.ship;
    ctx.fill();
  } else {
    ctx.fillStyle = frame.palette.land;
    ctx.fill();
    ctx.strokeStyle = frame.palette.ship;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  // Cars on deck: the cargo itself, visible.
  ctx.strokeStyle = laden ? frame.palette.ink : frame.palette.ship;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  if (laden) {
    for (let i = 0; i < 3; i += 1) {
      ctx.rect(stern + 4 + i * 6, -1.6, 4.4, 3.2);
    }
  }
  ctx.rect(bow - 7, -half + 1.4, 3, B - 2.8);
  ctx.stroke();

  if (marked) {
    hull();
    ctx.strokeStyle = frame.palette.attr;
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
  ctx.restore();

  // The docked unit rides above the hull: this shipment carries the claim.
  if (marked) {
    ctx.save();
    ctx.globalAlpha = alpha;
    diamond(ctx, x, y - half - 6, 4, frame.palette.attr, frame.palette.attr);
    ctx.restore();
  }
}

function diamond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  stroke: string,
  fill: string | null,
): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.6;
  ctx.stroke();
}

/** Tiny "EAC" tag beside a diamond — the certificate named on the object. */
function eacTag(
  ctx: CanvasRenderingContext2D,
  frame: Frame<Ink>,
  x: number,
  y: number,
  alpha = 1,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `8px ${frame.font}`;
  ctx.letterSpacing = "1px";
  const w = ctx.measureText("EAC").width;
  ctx.letterSpacing = "0px";
  ctx.fillStyle = frame.palette.land;
  ctx.fillRect(x - 2, y - 8, w + 4, 10);
  ctx.fillStyle = frame.palette.attr;
  monoLabel(ctx, "EAC", x, y, frame.font, { size: 8, spacing: 1 });
  ctx.restore();
}

// ===== Motion ===============================================================
function drawOreShip(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  if (!orePath) return;
  const p = phaseAt(frame.time);
  const marked = ledgerAt(frame.time).aboard === UNITS;

  let x: number;
  let y: number;
  let angle: number;
  let laden: boolean;
  if (p < ORE.sailOut[1]) {
    ({ x, y, angle } = poseAt(orePath, berthEase(p / ORE.sailOut[1])));
    laden = true;
  } else if (p < ORE.depart) {
    x = ORE_LANE_X;
    y = DISCHARGE_Y;
    angle = -Math.PI / 2;
    laden = p < PHASES.detach; // discharged as the value detaches
  } else if (p < ORE.arriveHome) {
    const u = berthEase((p - ORE.depart) / (ORE.arriveHome - ORE.depart));
    const pose = poseAt(orePath, 1 - u);
    x = pose.x;
    y = pose.y;
    angle = Math.PI / 2; // heading back down
    laden = false;
  } else {
    x = ORE_LANE_X;
    y = LOAD_Y;
    angle = -Math.PI / 2;
    laden = p >= ORE.loadFlip;
  }
  drawBulker(ctx, frame, x, y, angle, laden, marked);
}

function drawCarLanes(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const p = phaseAt(frame.time);
  for (const lane of [0, 1, 2] as const) {
    const cy = laneCenter(lane);
    const { depart, arrive } = carrierWindow(lane);
    const state = unitStateAt(lane, frame.time);

    // Car stack at the quay: the owner's cargo waiting to ship. Gone while
    // the carrier is away; back late-cycle for the next voyage.
    const stackVisible = p < depart || p >= PHASES.bunker;
    if (stackVisible) {
      ctx.strokeStyle = frame.palette.ink;
      ctx.lineWidth = 0.8;
      for (let i = 0; i < 4; i += 1) {
        box(ctx, 600 + i * 7, cy + 20, 5, 3, frame.palette.land);
      }
    }

    // The carrier.
    if (p < depart) {
      drawCarCarrier(ctx, frame, BERTH_X, cy, false, state === "applied", 1);
    } else if (p < arrive) {
      const u = berthEase((p - depart) / (arrive - depart));
      const x = BERTH_X + (DELIVER_X - BERTH_X) * u;
      drawCarCarrier(ctx, frame, x, cy, true, state === "applied", 1);
    } else if (p < PHASES.bunker) {
      // Delivered: the carrier dissolves past the lane's end.
      const k = Math.min(1, (p - arrive) / 0.05);
      drawCarCarrier(ctx, frame, DELIVER_X + k * 18, cy, false, false, 1 - k);
    } else {
      // A fresh carrier fades in for the next cycle.
      drawCarCarrier(
        ctx,
        frame,
        BERTH_X,
        cy,
        false,
        false,
        smoothstep((p - PHASES.bunker) / (1 - PHASES.bunker)),
      );
    }

    // Retirement ceremony at delivery.
    if (state === "retired") {
      const k = (p - PHASES.retire[lane]) / 0.03;
      if (k < 1) {
        const alpha = 1 - smoothstep(k);
        ctx.save();
        ctx.globalAlpha = alpha;
        diamond(ctx, DELIVER_X, cy - 16, 4 + k * 8, frame.palette.attr, null);
        ctx.restore();
        eacTag(ctx, frame, DELIVER_X + 10, cy - 13, alpha);
      }
    }

    // Delivery mark at the lane's end.
    ctx.strokeStyle = frame.palette.ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(DELIVER_X + 16, cy - 10);
    ctx.lineTo(DELIVER_X + 16, cy + 10);
    ctx.stroke();
  }
}

/** The big token: all three units, discharge quay → registry. */
function drawVerifyingToken(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  if (!tokenPath) return;
  if (ledgerAt(frame.time).verifying !== UNITS) return;
  const p = phaseAt(frame.time);
  const u = smoothstep((p - PHASES.detach) / (PHASES.mint - PHASES.detach));
  const { x, y } = poseAt(tokenPath, u);
  diamond(ctx, x, y, 9, frame.palette.attr, frame.palette.land);
  diamond(ctx, x, y, 4, frame.palette.attr, frame.palette.attr);
  eacTag(ctx, frame, x + 12, y + 3);
}

/** The three units: registry → aggregator → owner card → the berth. */
function drawUnits(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  for (const unit of [0, 1, 2] as const) {
    if (unitStateAt(unit, frame.time) !== "in-transit") continue;
    const path = unitPaths[unit];
    if (!path) continue;
    const p = phaseAt(frame.time);
    const u = smoothstep((p - PHASES.mint) / (PHASES.dock[unit] - PHASES.mint));
    const { x, y } = poseAt(path, u);
    diamond(ctx, x, y, 5, frame.palette.attr, frame.palette.land);
    diamond(ctx, x, y, 2.2, frame.palette.attr, frame.palette.attr);
  }
}

// ===== Labels ===============================================================
function drawLabels(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const font = frame.font;
  const plate = frame.palette.land;
  const put = (
    text: string,
    x: number,
    y: number,
    anchor: "start" | "middle" | "end" = "start",
  ) => {
    labelPlate(ctx, text, x, y, font, plate, anchor);
    ctx.fillStyle = frame.palette.label;
    monoLabel(ctx, text, x, y, font, { anchor });
  };

  put("[ GREEN CORRIDOR ]", 40, 106);
  put("[ DISCHARGE ]", 240, 168);
  put("[ ORE · BUNKER ]", 240, 880);
  put("[ REGISTRY ]", 380, 232);
  put("[ DEMAND AGGREGATOR ]", 380, 452);
  put("[ CARGO OWNER 1 ]", 596, 124);
  put("[ CARGO OWNER 2 ]", 596, 404);
  put("[ CARGO OWNER 3 ]", 596, 684);
  put("[ CARS ]", 600, 296);
  put("[ CARS ]", 600, 576);
  put("[ CARS ]", 600, 856);
}

// ===== The scene ============================================================
export const decouplingScene: Scene<Ink> = {
  id: "decoupling",
  space: SPACE,
  palette: [
    { key: "ink", prop: "--anim-ink", fallback: "#3f3e3a" },
    { key: "inkSoft", prop: "--anim-ink-soft", fallback: "#9b9a90" },
    { key: "land", prop: "--anim-land", fallback: "#f2f2ed" },
    { key: "ship", prop: "--anim-ship", fallback: "#b2182b" },
    { key: "label", prop: "--viz-ink-secondary", fallback: "#52514e" },
    { key: "attr", prop: "--viz-series-green", fallback: "#008300" },
  ],

  setup() {
    orePath = measure(ORE_SHUTTLE);
    tokenPath = measure(TOKEN_PATH);
    unitPaths = HUB_OWNER.map((rail) => measure([[450, 460], ...rail]));
  },

  draw(ctx, frame) {
    drawSheet(ctx, frame);
    drawCorridorPorts(ctx, frame);
    drawBunkerLine(ctx, frame);
    drawRails(ctx, frame);
    drawRegistry(ctx, frame);
    drawHub(ctx, frame);
    drawOwnerCards(ctx, frame);
    drawOreShip(ctx, frame);
    drawCarLanes(ctx, frame);
    drawVerifyingToken(ctx, frame);
    drawUnits(ctx, frame);
    drawLabels(ctx, frame);
  },
};
