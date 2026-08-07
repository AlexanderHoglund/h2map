import {
  box,
  caption as libCaption,
  chevron,
  crosshair,
  dashed,
  gridLines,
  labelPlate,
  monoLabel,
  polyline,
  shape,
} from "@/lib/animation/draw";
import { berthEase, smoothstep } from "@/lib/animation/ease";
import { measure, poseAt, type MeasuredPath } from "@/lib/animation/polyline";
import type { DesignSpace, Frame, Point, Scene } from "@/lib/animation/types";

/** The colours this scene draws with. `attr` is the environmental attribute —
 *  the one green; its TOTAL is conserved across the whole diagram. */
type Ink = "ink" | "inkSoft" | "land" | "ship" | "label" | "attr";

/**
 * Decoupling — book & claim with AGGREGATION, after the MMMCZCS model.
 *
 * One green corridor: iron ore sails Port Hedland → Gwangyang on a bulk
 * carrier that physically burns green fuel. The voyage's verified emission
 * reductions are registered and MINTED into standardized units at the
 * registry — and here the story widens: the units are sold to MANY
 * geographically dispersed cargo owners (Korea, Japan, Australia) with
 * Scope 3 commitments, none of whom need cargo on board. A DEMAND
 * AGGREGATOR pools their scattered purchase commitments and channels the
 * combined offtake toward the corridor — the counter-flow that makes the
 * corridor financeable. Each owner retires its unit at its own office: three
 * separate Scope 3 claims, no buyer vessel anywhere.
 *
 * THE INVARIANT. Not "one holder" but a LEDGER: the voyage carries three
 * units of environmental value, and at every instant
 * aboard + verifying + in-transit + held + retired === 3. Green enters the
 * frame once per cycle (bunkering) and leaves only by retirement. The draw
 * code may not have green booleans of its own — every green reads
 * `unitStateAt`/`ledgerAt`, and a browserless test pins the ledger at 4801
 * points plus every unit's transition times.
 *
 * SCALE. The ore carrier is the yardstick: 26 units LOA ≈ a 260 m Capesize,
 * so 1 u ≈ 10 m; shore furniture at ~3× exaggeration; sea distance symbolic
 * (the bar reads 3300 NM, the real Port Hedland–Gwangyang run).
 */

const SPACE: DesignSpace = { width: 900, height: 1000, fit: "slice" };
const GRID_STEP = 50;

// ===== Coastlines ===========================================================
export const AUSTRALIA: readonly Point[] = [
  [0, 870], [120, 870], [120, 845], [230, 845],
  [230, 820], [290, 820], [290, 835], [330, 835],
  [330, 820], [420, 820], [420, 795], [560, 795],
  [560, 770], [720, 770], [720, 745], [900, 745],
  [900, 1000], [0, 1000],
];

export const KOREA: readonly Point[] = [
  [290, 0], [290, 70], [310, 70], [310, 140],
  [335, 140], [335, 210], [365, 210], [365, 265],
  [410, 265], [410, 285], [540, 285],
  [540, 235], [575, 235], [575, 170], [590, 170],
  [590, 90], [600, 90], [600, 0],
];

/** Japan carries one of the three cargo owners — dispersion made visible. */
export const JAPAN: readonly Point[] = [
  [700, 0], [700, 60], [740, 60], [740, 120],
  [790, 120], [790, 180], [845, 180], [845, 240],
  [900, 240], [900, 0],
];

// ===== Berths and the physical corridor =====================================
export const BERTH_LOAD = { x: 370, y: 806 } as const; // Port Hedland, quay y=820
export const BERTH_ORE = { x: 438, y: 299 } as const; // Gwangyang discharge, quay y=285

export const ORE_ROUTE: readonly Point[] = [
  [370, 806], [300, 806], [250, 740], [250, 450],
  [300, 360], [320, 320], [340, 299], [438, 299],
];
export const ORE_ROUTE_BACK: readonly Point[] = [
  [438, 299], [380, 299], [330, 340], [310, 420],
  [310, 740], [310, 806], [370, 806],
];

/** Verification path: berth → registry (in the side accounting column). The
 *  voyage's whole value travels this as one LARGE EAC-tagged token. */
export const TOKEN_PATH: readonly Point[] = [
  [430, 292], [500, 318], [576, 330], [630, 346],
];

// ===== The accounting network ==============================================
/** The accounting column, set aside on open sea: registry above, aggregator
 *  below — market infrastructure, not places, so they live off the map. */
const REGISTRY_BOX = { x: 630, y: 330, w: 64, h: 32 } as const;
const HUB = { x: 618, y: 430, w: 88, h: 48 } as const;

/** Owner offices — three cargo owners, three regions. */
const OFFICES = [
  { x: 484, y: 192, w: 40, h: 40, diamond: [532, 198] }, // KR
  { x: 812, y: 120, w: 32, h: 32, diamond: [852, 136] }, // JP
  { x: 800, y: 770, w: 32, h: 32, diamond: [792, 786] }, // AU
] as const;

/** Attribute rails: registry → hub, then hub → each owner. The units travel
 *  these; the commitments march them the other way. */
const REG_HUB: readonly Point[] = [
  [662, 362], [662, 430],
];
const HUB_OWNER: readonly (readonly Point[])[] = [
  [[618, 446], [540, 330], [508, 236]], // → KR
  [[690, 430], [770, 300], [828, 156]], // → JP
  [[662, 478], [700, 600], [780, 720], [816, 770]], // → AU
];
/** The pooled offtake, hub → corridor (the Gwangyang berth). */
const HUB_CORRIDOR: readonly Point[] = [
  [618, 470], [500, 430], [452, 330], [446, 308],
];

// ===== Physical cargo to the owners' countries ==============================
/**
 * The owners are shippers: their cargo moves on CONVENTIONAL vessels into
 * each country — never green-marked. That contrast is the model: physical
 * trade is everywhere on ordinary ships; only the environmental value routes
 * through the registry.
 */
export const JP_CARGO_IN: readonly Point[] = [[940, 254], [870, 254]];
export const JP_CARGO_OUT: readonly Point[] = [[870, 266], [940, 266]];
export const AU_CARGO_IN: readonly Point[] = [[940, 731], [790, 731]];
export const AU_CARGO_OUT: readonly Point[] = [[790, 717], [940, 717]];
const JP_BERTH = { x: 870, y: 254 } as const; // Japan south quay y=240
const AU_BERTH = { x: 790, y: 731 } as const; // eastern AU quay y=745

// ===== The cycle and the ledger =============================================
export type UnitState = "aboard" | "verifying" | "in-transit" | "held" | "retired";
export type UnitIndex = 0 | 1 | 2;

export const UNITS = 3;
export const CYCLE_S = 24;
/** t=0 — the reduced-motion poster — lands mid-outbound: all three units of
 *  value aboard the green ship, offices neutral, rails idle. */
export const POSTER_OFFSET_S = 0.1 * CYCLE_S;

export const PHASES = {
  /** Counter-flow window: pooled commitments march owners → hub → corridor. */
  commit: [0.05, 0.2],
  /** The voyage attribute lifts off at discharge. */
  detach: 0.3,
  /** Registered and SPLIT into three standardized units at the registry. */
  mint: 0.38,
  /** Unit i reaches owner i (staggered). */
  arrive: [0.5, 0.53, 0.56],
  /** Unit i retired at owner i (staggered Scope 3 claims). */
  retire: [0.7, 0.74, 0.78],
  /** Next voyage's value bunkered — the ledger wraps to aboard. */
  bunker: 0.9,
} as const;

export function phaseAt(time: number): number {
  const s = (time + POSTER_OFFSET_S) % CYCLE_S;
  return (s < 0 ? s + CYCLE_S : s) / CYCLE_S;
}

/** Total function per unit: half-open intervals partition the cycle. */
export function unitStateAt(unit: UnitIndex, time: number): UnitState {
  const p = phaseAt(time);
  if (p < PHASES.detach) return "aboard";
  if (p < PHASES.mint) return "verifying";
  if (p < PHASES.arrive[unit]) return "in-transit";
  if (p < PHASES.retire[unit]) return "held";
  if (p < PHASES.bunker) return "retired";
  return "aboard"; // bunkered for the next voyage
}

/** The ledger, derived by summing — total is UNITS by construction, and the
 *  test pins it anyway. */
export function ledgerAt(time: number): Record<UnitState, number> {
  const out: Record<UnitState, number> = {
    aboard: 0,
    verifying: 0,
    "in-transit": 0,
    held: 0,
    retired: 0,
  };
  for (const unit of [0, 1, 2] as const) out[unitStateAt(unit, time)] += 1;
  return out;
}

// --- vessel sub-timings -----------------------------------------------------
const ORE = {
  sailOut: [0.0, 0.22],
  dischargeFlip: 0.25,
  depart: 0.32,
  arriveHome: 0.6,
  loadFlip: 0.85,
} as const;

// --- marching-dash idiom ----------------------------------------------------
const DASH: readonly number[] = [7, 5];
const DASH_PERIOD = 12;
const DASH_CYCLE_S = 1.6;

/** Precomputed in setup(). */
let orePath: MeasuredPath | null = null;
let oreBackPath: MeasuredPath | null = null;
let tokenPath: MeasuredPath | null = null;
/** Per-unit distribution path: registry → hub → owner i, measured once. */
let unitPaths: readonly MeasuredPath[] = [];

// ===== Water and land =======================================================
function drawSeaGrid(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 0.35;
  ctx.globalAlpha = 0.45;
  gridLines(ctx, 900, 1000, GRID_STEP, true, frame.time);
  ctx.globalAlpha = 1;
}

function drawShores(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  shape(ctx, AUSTRALIA, frame.palette.land, frame.palette.ink, 1.5);
  shape(ctx, KOREA, frame.palette.land, frame.palette.ink, 1.5);
  shape(ctx, JAPAN, frame.palette.land, frame.palette.ink, 1.5);
}

function drawLandGrid(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.save();
  ctx.beginPath();
  for (const shore of [AUSTRALIA, KOREA, JAPAN]) {
    let first = true;
    for (const [x, y] of shore) {
      if (first) {
        ctx.moveTo(x, y);
        first = false;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
  }
  ctx.clip();
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 0.35;
  ctx.globalAlpha = 0.32;
  gridLines(ctx, 900, 1000, GRID_STEP, false, frame.time);
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawQuayTicks(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const x of [340, 365, 390, 415]) {
    ctx.moveTo(x, 820);
    ctx.lineTo(x, 828);
  }
  for (const x of [420, 445, 460]) {
    ctx.moveTo(x, 285);
    ctx.lineTo(x, 277);
  }
  // The owners' own import berths: Japan's south quay, eastern Australia's.
  for (const x of [852, 872, 892]) {
    ctx.moveTo(x, 240);
    ctx.lineTo(x, 248);
  }
  for (const x of [764, 788, 812]) {
    ctx.moveTo(x, 745);
    ctx.lineTo(x, 753);
  }
  ctx.stroke();
}

// ===== Australia furniture ==================================================
function drawHeap(
  ctx: CanvasRenderingContext2D,
  frame: Frame<Ink>,
  x: number,
  groundY: number,
  w: number,
  h: number,
): void {
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, groundY);
  ctx.lineTo(x + w / 2, groundY - h);
  ctx.lineTo(x + w, groundY);
  ctx.closePath();
  ctx.fillStyle = frame.palette.land;
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let i = 1; i < 4; i += 1) {
    const t = i / 4;
    ctx.moveTo(x + (w / 2) * t, groundY - h * t);
    ctx.lineTo(x + w - (w / 2) * t, groundY - h * t);
  }
  ctx.stroke();
}

function drawPortHedland(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  drawHeap(ctx, frame, 388, 856, 26, 11);
  drawHeap(ctx, frame, 422, 856, 20, 9);
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(382, 856);
  ctx.lineTo(450, 856);
  ctx.stroke();

  // Ship loader over the berth.
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(392, 846);
  ctx.lineTo(392, 814);
  ctx.lineTo(376, 814);
  ctx.moveTo(376, 814);
  ctx.lineTo(376, 809);
  ctx.stroke();

  // Green-fuel bunker tank: the attribute's point of entry.
  ctx.lineWidth = 1.3;
  box(ctx, 340, 826, 20, 16, frame.palette.land);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(340, 831);
  ctx.lineTo(360, 831);
  ctx.stroke();
}

/** Bunkering line: green ENTERS the system here, once per cycle. */
function drawBunkerLine(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const p = phaseAt(frame.time);
  const active = p >= 0.88 && p < 0.98;
  const phase = (frame.time % DASH_CYCLE_S) / DASH_CYCLE_S;
  ctx.strokeStyle = active ? frame.palette.attr : frame.palette.inkSoft;
  ctx.lineWidth = active ? 1.4 : 1;
  dashed(
    ctx,
    () => {
      ctx.beginPath();
      ctx.moveTo(352, 826);
      ctx.lineTo(352, 810);
      ctx.lineTo(362, 810);
      ctx.stroke();
    },
    [3, 3],
    active ? -phase * 6 : 0,
  );
}

// ===== The accounting layer =================================================
/** A window-grid office block: a cargo owner. Highlighted while it holds. */
function drawOffice(
  ctx: CanvasRenderingContext2D,
  frame: Frame<Ink>,
  x: number,
  y: number,
  w: number,
  h: number,
  holding: boolean,
): void {
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.4;
  box(ctx, x, y, w, h, frame.palette.land);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  const cols = Math.max(2, Math.round(w / 10));
  const rows = Math.max(2, Math.round(h / 10));
  for (let i = 1; i < rows; i += 1) {
    ctx.moveTo(x, y + (i * h) / rows);
    ctx.lineTo(x + w, y + (i * h) / rows);
  }
  for (let i = 1; i < cols; i += 1) {
    ctx.moveTo(x + (i * w) / cols, y);
    ctx.lineTo(x + (i * w) / cols, y + h);
  }
  ctx.stroke();
  if (holding) {
    ctx.strokeStyle = frame.palette.attr;
    ctx.lineWidth = 1.6;
    box(ctx, x - 2, y - 2, w + 4, h + 4, null);
  }
}

function drawRegistry(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const p = phaseAt(frame.time);
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.3;
  box(ctx, REGISTRY_BOX.x, REGISTRY_BOX.y, REGISTRY_BOX.w, REGISTRY_BOX.h, frame.palette.land);
  ctx.lineWidth = 0.8;
  box(ctx, REGISTRY_BOX.x + 3, REGISTRY_BOX.y + 3, REGISTRY_BOX.w - 6, REGISTRY_BOX.h - 6, null);

  // The mint: the registry acknowledges as the attribute splits into units.
  if (p >= PHASES.mint - 0.01 && p < PHASES.mint + 0.03) {
    const k = (p - (PHASES.mint - 0.01)) / 0.04;
    ctx.save();
    ctx.globalAlpha = Math.sin(Math.min(Math.max(k, 0), 1) * Math.PI);
    ctx.strokeStyle = frame.palette.attr;
    ctx.lineWidth = 1.6;
    box(ctx, REGISTRY_BOX.x - 2, REGISTRY_BOX.y - 2, REGISTRY_BOX.w + 4, REGISTRY_BOX.h + 4, null);
    ctx.restore();
  }
}

/** The demand aggregator: a floating institution card — double-outlined like
 *  the registry, because both are market infrastructure, not places. */
function drawHub(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.4;
  box(ctx, HUB.x, HUB.y, HUB.w, HUB.h, frame.palette.land);
  ctx.lineWidth = 0.8;
  box(ctx, HUB.x + 4, HUB.y + 4, HUB.w - 8, HUB.h - 8, null);
  // Pool glyph: three small squares converging — many buyers, one offtake.
  ctx.lineWidth = 0.9;
  box(ctx, HUB.x + 10, HUB.y + 12, 8, 8, frame.palette.land);
  box(ctx, HUB.x + 24, HUB.y + 16, 8, 8, frame.palette.land);
  box(ctx, HUB.x + 38, HUB.y + 12, 8, 8, frame.palette.land);
  ctx.beginPath();
  ctx.moveTo(HUB.x + 52, HUB.y + 16);
  ctx.lineTo(HUB.x + 60, HUB.y + 16);
  ctx.moveTo(HUB.x + 56, HUB.y + 12);
  ctx.lineTo(HUB.x + 56, HUB.y + 20);
  ctx.stroke();
}

/**
 * The rail network, always visible — the accounting layer exists even when
 * nothing travels on it. During the commit window the same rails march ink
 * INWARD (owners → hub → corridor): the pooled offtake that finances the
 * voyage. The attribute units later flow OUTWARD in green.
 */
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
    // Positive offset marches the dashes BACKWARD along the path — i.e. from
    // the owner toward the hub, the commitment's direction.
    dashed(ctx, () => polyline(ctx, rail), [3, 3], committing ? phase * 6 : 0);
  }

  ctx.strokeStyle = committing ? frame.palette.ink : frame.palette.inkSoft;
  ctx.lineWidth = committing ? 1.2 : 0.9;
  dashed(ctx, () => polyline(ctx, HUB_CORRIDOR), [3, 3], committing ? -phase * 6 : 0);
}

// ===== Sea routes ===========================================================
function drawRoutes(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const phase = (frame.time % DASH_CYCLE_S) / DASH_CYCLE_S;
  const offset = -phase * DASH_PERIOD;

  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.6;
  dashed(ctx, () => polyline(ctx, ORE_ROUTE), DASH, offset);

  ctx.strokeStyle = frame.palette.inkSoft;
  ctx.lineWidth = 1.1;
  dashed(ctx, () => polyline(ctx, ORE_ROUTE_BACK), [3, 5]);
  dashed(ctx, () => polyline(ctx, JP_CARGO_IN), [3, 5]);
  dashed(ctx, () => polyline(ctx, AU_CARGO_IN), [3, 5]);

  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.5;
  crosshair(ctx, 250, 740, 4);
  crosshair(ctx, 250, 450, 4);
  ctx.strokeStyle = frame.palette.inkSoft;
  ctx.lineWidth = 1.2;
  chevron(ctx, 620, 640);
  chevron(ctx, 180, 300);
}

// ===== Vessels ==============================================================
function drawVessel(
  ctx: CanvasRenderingContext2D,
  frame: Frame<Ink>,
  x: number,
  y: number,
  angle: number,
  laden: boolean,
  marked: boolean,
  alpha = 1,
): void {
  if (alpha <= 0.02) return;
  const L = 26;
  const B = 8;
  const half = B / 2;
  const bow = L * 0.5;
  const stern = -L * 0.5;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(angle);

  const hull = () => {
    ctx.beginPath();
    ctx.moveTo(stern, -half);
    ctx.lineTo(bow - 6, -half);
    ctx.lineTo(bow, 0);
    ctx.lineTo(bow - 6, half);
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
    const hx = stern + 5 + i * 4.6;
    ctx.rect(hx, -half + 1.2, 3.2, B - 2.4);
  }
  ctx.rect(stern + 1, -half + 1.4, 3, B - 2.8);
  ctx.stroke();

  // The green mark: hull restroked in the attribute colour, certificate
  // diamond flying off the hull like a flag.
  if (marked) {
    hull();
    ctx.strokeStyle = frame.palette.attr;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // LARGE: the ship carries the voyage's entire environmental value — the
    // thing that later splits into three at the registry.
    diamond(ctx, 0, -half - 7, 5.4, frame.palette.attr, frame.palette.attr);
  }

  ctx.restore();
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

/**
 * The owners' physical cargo, arriving on CONVENTIONAL ships — never green.
 * Each runs in from the east frame edge, works its berth, and leaves; the
 * frame-edge fade reads as trade continuing beyond the map.
 */
const CARGO_SHIPS = [
  {
    inRoute: JP_CARGO_IN,
    outRoute: JP_CARGO_OUT,
    berth: JP_BERTH,
    sailIn: [0.02, 0.18],
    dwell: [0.18, 0.42],
    flip: 0.3, // laden → discharged
    sailOut: [0.42, 0.58],
  },
  {
    inRoute: AU_CARGO_IN,
    outRoute: AU_CARGO_OUT,
    berth: AU_BERTH,
    sailIn: [0.4, 0.56],
    dwell: [0.56, 0.8],
    flip: 0.68,
    sailOut: [0.8, 0.96],
  },
] as const;

/** Alpha from x: dissolves over the last stretch before the east frame edge. */
function edgeFade(x: number): number {
  return Math.min(1, Math.max(0, (915 - x) / 45));
}

let cargoInPaths: readonly MeasuredPath[] = [];
let cargoOutPaths: readonly MeasuredPath[] = [];

function drawCargoShips(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const p = phaseAt(frame.time);
  for (let i = 0; i < CARGO_SHIPS.length; i += 1) {
    const ship = CARGO_SHIPS[i];
    if (!ship) continue;
    const inPath = cargoInPaths[i];
    const outPath = cargoOutPaths[i];
    if (!inPath || !outPath) continue;

    let x: number;
    let y: number;
    let angle: number;
    let laden: boolean;
    if (p >= ship.sailIn[0] && p < ship.sailIn[1]) {
      const u = berthEase((p - ship.sailIn[0]) / (ship.sailIn[1] - ship.sailIn[0]));
      ({ x, y, angle } = poseAt(inPath, u));
      laden = true;
    } else if (p >= ship.dwell[0] && p < ship.dwell[1]) {
      ({ x, y } = ship.berth);
      angle = Math.PI; // arrived heading west, lies alongside
      laden = p < ship.flip;
    } else if (p >= ship.sailOut[0] && p < ship.sailOut[1]) {
      const u = berthEase((p - ship.sailOut[0]) / (ship.sailOut[1] - ship.sailOut[0]));
      ({ x, y, angle } = poseAt(outPath, u));
      laden = false;
    } else {
      continue; // beyond the frame, somewhere in the world's trade
    }
    drawVessel(ctx, frame, x, y, angle, laden, false, edgeFade(x));
  }
}

// --- the ore carrier's day --------------------------------------------------
function drawOreCarrier(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  if (!orePath || !oreBackPath) return;
  const p = phaseAt(frame.time);
  const ledger = ledgerAt(frame.time);

  let x: number;
  let y: number;
  let angle: number;
  if (p < ORE.sailOut[1]) {
    ({ x, y, angle } = poseAt(orePath, berthEase(p / ORE.sailOut[1])));
  } else if (p < ORE.depart) {
    ({ x, y } = BERTH_ORE);
    angle = 0;
  } else if (p < ORE.arriveHome) {
    ({ x, y, angle } = poseAt(
      oreBackPath,
      berthEase((p - ORE.depart) / (ORE.arriveHome - ORE.depart)),
    ));
  } else {
    ({ x, y } = BERTH_LOAD);
    angle = Math.PI;
  }

  const laden = p < ORE.dischargeFlip || p >= ORE.loadFlip;
  drawVessel(ctx, frame, x, y, angle, laden, ledger.aboard === UNITS);
}

// --- the certificate lifecycle ----------------------------------------------
/** The verification leg: one EAC-tagged token carrying all three units of
 *  value from the berth to the registry. */
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

/** The distribution: three standardized units, registry → hub → owners,
 *  each on its own composite rail, arrivals staggered. */
function drawUnits(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  for (const unit of [0, 1, 2] as const) {
    const state = unitStateAt(unit, frame.time);
    const anchor = OFFICES[unit].diamond;

    if (state === "in-transit") {
      const path = unitPaths[unit];
      if (!path) continue;
      const p = phaseAt(frame.time);
      const u = smoothstep((p - PHASES.mint) / (PHASES.arrive[unit] - PHASES.mint));
      const { x, y } = poseAt(path, u);
      diamond(ctx, x, y, 5, frame.palette.attr, frame.palette.land);
      diamond(ctx, x, y, 2.2, frame.palette.attr, frame.palette.attr);
    } else if (state === "held") {
      diamond(ctx, anchor[0], anchor[1], 4, frame.palette.attr, frame.palette.attr);
    } else if (state === "retired") {
      // Retirement ceremony: the unit expands and fades at its owner — a
      // Scope 3 claim consumed, not lost.
      const p = phaseAt(frame.time);
      const k = (p - PHASES.retire[unit]) / 0.03;
      if (k < 1) {
        const alpha = 1 - smoothstep(k);
        ctx.save();
        ctx.globalAlpha = alpha;
        diamond(ctx, anchor[0], anchor[1], 4 + k * 8, frame.palette.attr, null);
        ctx.restore();
        eacTag(ctx, frame, anchor[0] + 10, anchor[1] + 3, alpha);
      }
    }
  }
}

// ===== Labels ===============================================================
function drawLabels(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const font = frame.font;
  const plate = frame.palette.land;
  const colors = {
    leader: frame.palette.inkSoft,
    plate,
    text: frame.palette.label,
  };
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

  put("[ PORT HEDLAND · AU ]", 120, 940);
  put("[ GWANGYANG · KR ]", 330, 60);
  put("[ JP ]", 800, 60);
  put("3300 NM", 138, 560);

  put("[ REGISTRY ]", 630, 324);
  put("[ DEMAND AGGREGATOR ]", 618, 422);
  put("[ OWNER · KR ]", 571, 187, "end");
  put("[ OWNER · JP ]", 886, 113, "end");
  put("[ OWNER · AU ]", 886, 820, "end");

  libCaption(ctx, "[ ORE ]", 410, 858, 402, 890, font, colors);
  libCaption(ctx, "[ BUNKER ]", 350, 844, 288, 890, font, colors);
}

function drawCompass(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.save();
  ctx.translate(64, 76);
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-20, 0);
  ctx.lineTo(20, 0);
  ctx.moveTo(0, -20);
  ctx.lineTo(0, 20);
  ctx.stroke();
  box(ctx, -6, -6, 12, 12, frame.palette.land);
  ctx.fillStyle = frame.palette.label;
  monoLabel(ctx, "N", 0, -30, frame.font, { size: 13, spacing: 0, anchor: "middle" });
  ctx.restore();
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
    orePath = measure(ORE_ROUTE);
    oreBackPath = measure(ORE_ROUTE_BACK);
    tokenPath = measure(TOKEN_PATH);
    // Each unit's distribution rail is registry → hub → its owner, measured
    // as one composite path so the travel fraction is smooth end to end.
    unitPaths = HUB_OWNER.map((toOwner) => measure([...REG_HUB, ...toOwner]));
    cargoInPaths = CARGO_SHIPS.map((c) => measure(c.inRoute));
    cargoOutPaths = CARGO_SHIPS.map((c) => measure(c.outRoute));
  },

  draw(ctx, frame) {
    drawSeaGrid(ctx, frame);
    drawShores(ctx, frame);
    drawLandGrid(ctx, frame);
    drawQuayTicks(ctx, frame);

    drawPortHedland(ctx, frame);
    drawBunkerLine(ctx, frame);

    drawRails(ctx, frame);
    drawRoutes(ctx, frame);

    drawRegistry(ctx, frame);
    drawHub(ctx, frame);
    for (const unit of [0, 1, 2] as const) {
      const o = OFFICES[unit];
      drawOffice(ctx, frame, o.x, o.y, o.w, o.h, unitStateAt(unit, frame.time) === "held");
    }

    drawOreCarrier(ctx, frame);
    drawCargoShips(ctx, frame);
    drawVerifyingToken(ctx, frame);
    drawUnits(ctx, frame);

    drawLabels(ctx, frame);
    drawCompass(ctx, frame);
  },
};
