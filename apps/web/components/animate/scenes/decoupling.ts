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
 *  the one green, existing in exactly one place at any moment. */
type Ink = "ink" | "inkSoft" | "land" | "ship" | "label" | "attr";

/**
 * Decoupling — book and claim, on a map.
 *
 * Iron ore sails Port Hedland → Gwangyang on a bulk carrier that PHYSICALLY
 * burns green fuel. At discharge the fuel's environmental attribute detaches
 * as a certificate (an EAC), passes through a registry, and lands with the
 * CARGO OWNER — the key actor: it is the owner of the goods, not the vessel
 * or the plant, who receives the certificate. The owner then applies the
 * claim to its own shipment: a RoRo car carrier that never touched the fuel
 * sails green to Australia, and at delivery the EAC is RETIRED — visibly
 * consumed against the voyage, not merely gone. The ship returns neutral.
 *
 * THE INVARIANT. The green exists in exactly one place at every moment:
 * ore vessel → token → cargo owner → RoRo → retired. One total function,
 * `attributeHolderAt`, partitions the cycle; the draw code is forbidden from
 * having green booleans of its own. A browserless test samples the cycle
 * densely and pins the sequence and every handoff time. Green enters the
 * frame once per cycle (bunkering) and is retired once (delivery): the books
 * balance on screen.
 *
 * SCALE. The ore carrier is the yardstick: 26 units LOA ≈ a 260 m Capesize,
 * so 1 u ≈ 10 m. Shore furniture at a uniform ~3× exaggeration. Sea distance
 * is symbolic — the bar reads 3300 NM, the real Port Hedland–Gwangyang run.
 */

const SPACE: DesignSpace = { width: 900, height: 1000, fit: "slice" };
const GRID_STEP = 50;

// ===== Coastlines ===========================================================
/** Pilbara coast, stepping up toward the ENE. The notch at x 290–330 is the
 *  Port Hedland harbour inlet; the car-import terminal sits on the eastern
 *  landmass (schematically [ FREMANTLE · AU ]). */
export const AUSTRALIA: readonly Point[] = [
  [0, 870], [120, 870], [120, 845], [230, 845],
  [230, 820], [290, 820], [290, 835], [330, 835],
  [330, 820], [420, 820], [420, 795], [560, 795],
  [560, 770], [720, 770], [720, 745], [900, 745],
  [900, 1000], [0, 1000],
];

/** Korean peninsula; the south quay (y=285, x 410–540) is the Gwangyang
 *  waterfront, widened so both berths and the owner's office fit ashore. */
export const KOREA: readonly Point[] = [
  [290, 0], [290, 70], [310, 70], [310, 140],
  [335, 140], [335, 210], [365, 210], [365, 265],
  [410, 265], [410, 285], [540, 285],
  [540, 235], [575, 235], [575, 170], [590, 170],
  [590, 90], [600, 90], [600, 0],
];

/** Japan fragment, top-right — recognisability, and it makes the RoRo's
 *  outbound lane read as the Korea Strait. */
export const JAPAN: readonly Point[] = [
  [700, 0], [700, 60], [740, 60], [740, 120],
  [790, 120], [790, 180], [845, 180], [845, 240],
  [900, 240], [900, 0],
];

// ===== Berths and tracks ====================================================
export const BERTH_LOAD = { x: 370, y: 806 } as const; // Port Hedland, quay y=820
export const BERTH_ORE = { x: 438, y: 299 } as const; // Gwangyang discharge, quay y=285
export const BERTH_RORO = { x: 512, y: 299 } as const; // Gwangyang car terminal
export const BERTH_AU = { x: 790, y: 731 } as const; // Fremantle car import, quay y=745

/** Laden ore: west past the harbour mouth, north on the x=250 lane, shaping
 *  in to arrive parallel to the quay. */
export const ORE_ROUTE: readonly Point[] = [
  [370, 806], [300, 806], [250, 740], [250, 450],
  [300, 360], [320, 320], [340, 299], [438, 299],
];
/** Ballast return on the x=310 lane. */
export const ORE_ROUTE_BACK: readonly Point[] = [
  [438, 299], [380, 299], [330, 340], [310, 420],
  [310, 740], [310, 806], [370, 806],
];
/** The claimed voyage: Gwangyang → Fremantle, cars aboard, green flying. */
export const RORO_ROUTE: readonly Point[] = [
  [512, 299], [576, 299], [640, 340], [664, 420], [664, 600],
  [688, 680], [688, 731], [790, 731],
];
/** Home in ballast, neutral — the claim was retired at delivery. The x=848
 *  lane turns at y=400, well clear of Japan's y<240 band. */
export const RORO_ROUTE_BACK: readonly Point[] = [
  [790, 731], [848, 731], [848, 400], [800, 330], [640, 318],
  [576, 299], [512, 299],
];

/**
 * The certificate's rail: ore berth → REGISTRY → CARGO OWNER. Overland ON
 * PURPOSE — it is a certificate, not a ship; the landfall test exempts it.
 * Vertex 3 (444,200) is the registry, where the token dwells.
 */
export const TOKEN_PATH: readonly Point[] = [
  [430, 292], [430, 246], [433, 218], [444, 200],
  [466, 200], [490, 204],
];

/** The claim-link: owner's office → the RoRo berth. Always visible (the
 *  accounting rail), marching green while the claim transfers. */
const CLAIM_LINK: readonly Point[] = [
  [524, 204], [532, 204], [532, 285],
];

// ===== The cycle and the invariant ==========================================
export type AttributeHolder =
  | "ore-vessel"
  | "token"
  | "cargo-owner"
  | "roro"
  | "retired";

export const CYCLE_S = 60;
/** t=0 — the reduced-motion poster — lands mid-outbound: attribute aboard the
 *  ore carrier, token undetached, RoRo waiting at its berth. */
export const POSTER_OFFSET_S = 0.1 * CYCLE_S;
/**
 * Handoff boundaries, fractions of the cycle. The half-open intervals in
 * `attributeHolderAt` PARTITION [0,1): two simultaneous holders is
 * unrepresentable by construction.
 */
export const PHASES = {
  detach: 0.3, // ore vessel → token (discharge complete)
  own: 0.4, // token → CARGO OWNER (via the registry)
  claim: 0.47, // owner → roro (claim applied to the owner's shipment)
  retire: 0.72, // roro → retired (cars delivered; the EAC is consumed)
  bunker: 0.9, // retired → ore vessel (green fuel bunkered again)
} as const;

export function phaseAt(time: number): number {
  const s = (time + POSTER_OFFSET_S) % CYCLE_S;
  return (s < 0 ? s + CYCLE_S : s) / CYCLE_S;
}

export function attributeHolderAt(time: number): AttributeHolder {
  const p = phaseAt(time);
  if (p < PHASES.detach) return "ore-vessel";
  if (p < PHASES.own) return "token";
  if (p < PHASES.claim) return "cargo-owner";
  if (p < PHASES.retire) return "roro";
  if (p < PHASES.bunker) return "retired";
  return "ore-vessel"; // bunkered for the next voyage
}

// --- vessel sub-timings (fractions of the cycle) ----------------------------
const ORE = {
  sailOut: [0.0, 0.22],
  dischargeFlip: 0.25, // hull laden → ballast while alongside
  depart: 0.32,
  arriveHome: 0.6,
  loadFlip: 0.85, // next cargo aboard
} as const;
const RORO = {
  ladenFlip: 0.53, // cars aboard, hull fills
  rampUp: 0.56,
  sailOut: [0.57, 0.71],
  auDepart: 0.78, // alongside Fremantle 0.71–0.78 (retirement at 0.72)
  sailBack: [0.78, 0.93],
} as const;

/** Token easing: eased to the registry, a dwell (the transaction), eased on. */
const REGISTRY_DWELL = [0.45, 0.6] as const; // of the token's own sub-phase
function tokenFracAt(u: number, registryFrac: number): number {
  if (u < REGISTRY_DWELL[0]) return smoothstep(u / REGISTRY_DWELL[0]) * registryFrac;
  if (u < REGISTRY_DWELL[1]) return registryFrac;
  return (
    registryFrac +
    smoothstep((u - REGISTRY_DWELL[1]) / (1 - REGISTRY_DWELL[1])) * (1 - registryFrac)
  );
}

// --- marching-dash idiom ----------------------------------------------------
const DASH: readonly number[] = [7, 5];
const DASH_PERIOD = 12;
const DASH_CYCLE_S = 1.6;

/** Precomputed in setup(). */
let orePath: MeasuredPath | null = null;
let oreBackPath: MeasuredPath | null = null;
let roroPath: MeasuredPath | null = null;
let roroBackPath: MeasuredPath | null = null;
let tokenPath: MeasuredPath | null = null;
/** Fraction of the token rail's arc length at the registry (vertex 3). */
let registryFrac = 0.55;

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
  // All quays run east-west, so berth ticks are short vertical strokes.
  for (const x of [340, 365, 390, 415]) {
    ctx.moveTo(x, 820);
    ctx.lineTo(x, 828);
  }
  for (const x of [420, 445, 460]) {
    ctx.moveTo(x, 285);
    ctx.lineTo(x, 277);
  }
  for (const x of [492, 512, 532]) {
    ctx.moveTo(x, 285);
    ctx.lineTo(x, 277);
  }
  for (const x of [756, 780, 804, 828]) {
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

/** The Fremantle car terminal: the receiving yard fills at discharge, and
 *  the cars head inland late in the cycle. */
function drawFremantle(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const p = phaseAt(frame.time);
  const TOTAL = 12;
  let visible = 0;
  if (p >= PHASES.retire && p < RORO.auDepart) {
    visible = Math.floor(((p - PHASES.retire) / (RORO.auDepart - PHASES.retire)) * TOTAL);
  } else if (p >= RORO.auDepart && p < 0.95) {
    visible = TOTAL;
  }
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = frame.palette.ink;
  let drawn = 0;
  for (let row = 0; row < 2 && drawn < visible; row += 1) {
    for (let col = 0; col < 6 && drawn < visible; col += 1) {
      box(ctx, 770 + col * 7.4, 756 + row * 8, 5, 3, frame.palette.land);
      drawn += 1;
    }
  }
}

// ===== Korea furniture ======================================================
function drawGwangyang(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const p = phaseAt(frame.time);
  const holder = attributeHolderAt(frame.time);

  // The registry: a double-outlined ledger box, the transaction venue.
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.3;
  box(ctx, 436, 192, 32, 16, frame.palette.land);
  ctx.lineWidth = 0.8;
  box(ctx, 439, 195, 26, 10, null);

  // The CARGO OWNER's office — the key actor. It is the owner of the goods
  // who receives the certificate; the office holds the green while it does.
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.4;
  box(ctx, 484, 192, 40, 40, frame.palette.land);
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let i = 1; i < 4; i += 1) {
    ctx.moveTo(484, 192 + i * 10);
    ctx.lineTo(524, 192 + i * 10);
    ctx.moveTo(484 + i * 10, 192);
    ctx.lineTo(484 + i * 10, 232);
  }
  ctx.stroke();
  if (holder === "cargo-owner") {
    ctx.strokeStyle = frame.palette.attr;
    ctx.lineWidth = 1.6;
    box(ctx, 482, 190, 44, 44, null);
    // The certificate sits at the head of the claim-link, about to flow to
    // the owner's shipment.
    diamond(ctx, 532, 198, 3.2, frame.palette.attr, frame.palette.attr);
  }

  // Car yard: the owner's goods awaiting shipment. Depletes as they load.
  const TOTAL = 21;
  let visible = TOTAL;
  if (p >= PHASES.claim && p < 0.55) {
    visible = TOTAL - Math.floor(((p - PHASES.claim) / (0.55 - PHASES.claim)) * TOTAL);
  } else if (p >= 0.55 && p < 0.93) {
    visible = 0; // at sea (and then delivered)
  }
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 0.8;
  let drawn = 0;
  for (let row = 0; row < 3 && drawn < visible; row += 1) {
    for (let col = 0; col < 7 && drawn < visible; col += 1) {
      box(ctx, 476 + col * 6.4, 262 + row * 5.4, 4, 2.5, frame.palette.land);
      drawn += 1;
    }
  }

  // Ore discharge conveyor: berth up to the owner's works, marching while
  // the carrier discharges.
  const discharging = p >= ORE.sailOut[1] && p < PHASES.detach;
  const phase = (frame.time % DASH_CYCLE_S) / DASH_CYCLE_S;
  ctx.strokeStyle = frame.palette.inkSoft;
  ctx.lineWidth = 1;
  dashed(
    ctx,
    () => {
      ctx.beginPath();
      ctx.moveTo(444, 285);
      ctx.lineTo(444, 226);
      ctx.lineTo(484, 226);
      ctx.stroke();
    },
    [3, 3],
    discharging ? -phase * 6 : 0,
  );
}

/** The certificate's rail and the claim-link — the accounting layer, always
 *  visible even when nothing is travelling on it. */
function drawAccountingRails(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const p = phaseAt(frame.time);
  ctx.strokeStyle = frame.palette.inkSoft;
  ctx.lineWidth = 0.9;
  dashed(ctx, () => polyline(ctx, TOKEN_PATH), [3, 3]);

  // Claim-link: marches green while the claim transfers to the shipment.
  const claiming = p >= 0.44 && p < 0.49;
  const phase = (frame.time % DASH_CYCLE_S) / DASH_CYCLE_S;
  ctx.strokeStyle = claiming ? frame.palette.attr : frame.palette.inkSoft;
  ctx.lineWidth = claiming ? 1.3 : 0.9;
  dashed(ctx, () => polyline(ctx, CLAIM_LINK), [3, 3], claiming ? -phase * 6 : 0);
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

  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.3;
  dashed(ctx, () => polyline(ctx, RORO_ROUTE), DASH, offset);

  ctx.strokeStyle = frame.palette.inkSoft;
  ctx.lineWidth = 1.1;
  dashed(ctx, () => polyline(ctx, RORO_ROUTE_BACK), [3, 5]);

  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.5;
  crosshair(ctx, 250, 740, 4);
  crosshair(ctx, 250, 450, 4);
  crosshair(ctx, 664, 600, 4);
  ctx.strokeStyle = frame.palette.inkSoft;
  ctx.lineWidth = 1.2;
  chevron(ctx, 640, 236);
  chevron(ctx, 600, 500);
}

// ===== Vessels ==============================================================
interface VesselOpts {
  readonly kind: "bulk" | "roro";
  readonly laden: boolean;
  /** Whether this hull currently holds the attribute — derived from
   *  attributeHolderAt by the caller, never from local state. */
  readonly marked: boolean;
  readonly alpha: number;
  /** Quay y to drop a stern ramp line to (RoRo alongside), or null. */
  readonly rampToY: number | null;
}

function drawVessel(
  ctx: CanvasRenderingContext2D,
  frame: Frame<Ink>,
  x: number,
  y: number,
  angle: number,
  { kind, laden, marked, alpha, rampToY }: VesselOpts,
): void {
  if (alpha <= 0.02) return;
  const L = kind === "bulk" ? 26 : 24;
  const B = kind === "bulk" ? 8 : 9;
  const half = B / 2;
  const bow = L * 0.5;
  const stern = -L * 0.5;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(angle);

  const hull = () => {
    ctx.beginPath();
    if (kind === "bulk") {
      ctx.moveTo(stern, -half);
      ctx.lineTo(bow - 6, -half);
      ctx.lineTo(bow, 0);
      ctx.lineTo(bow - 6, half);
      ctx.lineTo(stern, half);
    } else {
      ctx.moveTo(stern + 3, -half);
      ctx.lineTo(bow - 4, -half);
      ctx.lineTo(bow, 0);
      ctx.lineTo(bow - 4, half);
      ctx.lineTo(stern + 3, half);
      ctx.lineTo(stern, half - 1.6);
      ctx.lineTo(stern, -half + 1.6);
    }
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
  if (kind === "bulk") {
    for (let i = 0; i < 4; i += 1) {
      const hx = stern + 5 + i * 4.6;
      ctx.rect(hx, -half + 1.2, 3.2, B - 2.4);
    }
    ctx.rect(stern + 1, -half + 1.4, 3, B - 2.8);
  } else {
    ctx.moveTo(stern + 4, 0);
    ctx.lineTo(bow - 6, 0);
    ctx.rect(bow - 8, -half + 1.4, 3.4, B - 2.8); // bridge forward on a RoRo
  }
  ctx.stroke();

  // The green mark: hull restroked in the attribute colour, and the
  // certificate diamond flying off the hull like a flag — amidships it
  // drowns in the red fill at gallery scale.
  if (marked) {
    hull();
    ctx.strokeStyle = frame.palette.attr;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    diamond(ctx, 0, -half - 5, 3.2, frame.palette.attr, frame.palette.attr);
  }

  ctx.restore();

  if (rampToY !== null && alpha > 0.5) {
    ctx.strokeStyle = frame.palette.ink;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x + stern + 4, y - half + 1);
    ctx.lineTo(x + stern - 2, rampToY);
    ctx.stroke();
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

// --- the ore carrier's day --------------------------------------------------
function drawOreCarrier(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  if (!orePath || !oreBackPath) return;
  const p = phaseAt(frame.time);
  const holder = attributeHolderAt(frame.time);

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
  drawVessel(ctx, frame, x, y, angle, {
    kind: "bulk",
    laden,
    marked: holder === "ore-vessel",
    alpha: 1,
    rampToY: null,
  });
}

// --- the RoRo's round trip --------------------------------------------------
function drawRoRo(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  if (!roroPath || !roroBackPath) return;
  const p = phaseAt(frame.time);
  const holder = attributeHolderAt(frame.time);

  let x: number = BERTH_RORO.x;
  let y: number = BERTH_RORO.y;
  let angle = 0;
  let rampToY: number | null = null;

  if (p >= RORO.sailOut[0] && p < RORO.sailOut[1]) {
    const u = berthEase((p - RORO.sailOut[0]) / (RORO.sailOut[1] - RORO.sailOut[0]));
    ({ x, y, angle } = poseAt(roroPath, u));
  } else if (p >= RORO.sailOut[1] && p < RORO.auDepart) {
    // Alongside Fremantle: cars off, the EAC retired against the voyage.
    ({ x, y } = BERTH_AU);
    angle = 0;
    rampToY = 745;
  } else if (p >= RORO.auDepart && p < RORO.sailBack[1]) {
    const u = berthEase((p - RORO.sailBack[0]) / (RORO.sailBack[1] - RORO.sailBack[0]));
    ({ x, y, angle } = poseAt(roroBackPath, u));
  } else {
    // Alongside Gwangyang. Ramp down while the owner's cars come aboard.
    if (p >= PHASES.claim && p < RORO.rampUp) rampToY = 285;
  }

  const laden = p >= RORO.ladenFlip && p < PHASES.retire;
  drawVessel(ctx, frame, x, y, angle, {
    kind: "roro",
    laden,
    marked: holder === "roro",
    alpha: 1,
    rampToY,
  });
}

// --- the certificate --------------------------------------------------------
function drawToken(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  if (!tokenPath) return;
  if (attributeHolderAt(frame.time) !== "token") return;
  const p = phaseAt(frame.time);
  const u = (p - PHASES.detach) / (PHASES.own - PHASES.detach);
  const frac = tokenFracAt(u, registryFrac);
  const { x, y } = poseAt(tokenPath, frac);

  // A short attr-coloured trail behind it — the travelling cue.
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = frame.palette.attr;
  ctx.lineWidth = 1.2;
  const TRAIL = 0.12;
  ctx.beginPath();
  let first = true;
  for (let i = 0; i <= 8; i += 1) {
    const pt = poseAt(tokenPath, Math.max(0, frac - TRAIL + (TRAIL * i) / 8));
    if (first) {
      ctx.moveTo(pt.x, pt.y);
      first = false;
    } else {
      ctx.lineTo(pt.x, pt.y);
    }
  }
  ctx.stroke();
  ctx.restore();

  // The certificate: a tag, not a particle — and named.
  diamond(ctx, x, y, 7, frame.palette.attr, frame.palette.land);
  diamond(ctx, x, y, 3, frame.palette.attr, frame.palette.attr);
  eacTag(ctx, frame, x + 10, y + 3);

  // The registry acknowledges the transaction while the token dwells.
  if (u >= REGISTRY_DWELL[0] && u < REGISTRY_DWELL[1]) {
    const k = (u - REGISTRY_DWELL[0]) / (REGISTRY_DWELL[1] - REGISTRY_DWELL[0]);
    ctx.save();
    ctx.globalAlpha = Math.sin(k * Math.PI);
    ctx.strokeStyle = frame.palette.attr;
    ctx.lineWidth = 1.6;
    box(ctx, 434, 190, 36, 20, null);
    ctx.restore();
  }
}

/**
 * Retirement: at delivery the EAC is consumed, not lost. For the first
 * moments of the "retired" interval a ghost of the certificate expands and
 * fades over the Fremantle berth — a ceremony, not a holder; the invariant
 * function has already moved on.
 */
function drawRetirement(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  if (attributeHolderAt(frame.time) !== "retired") return;
  const p = phaseAt(frame.time);
  const k = (p - PHASES.retire) / 0.03;
  if (k >= 1) return;
  const alpha = 1 - smoothstep(k);
  ctx.save();
  ctx.globalAlpha = alpha;
  diamond(ctx, BERTH_AU.x, BERTH_AU.y - 12, 3.2 + k * 9, frame.palette.attr, null);
  ctx.restore();
  eacTag(ctx, frame, BERTH_AU.x + 12, BERTH_AU.y - 9, alpha);
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

  labelPlate(ctx, "[ PORT HEDLAND · AU ]", 120, 940, font, plate);
  ctx.fillStyle = frame.palette.label;
  monoLabel(ctx, "[ PORT HEDLAND · AU ]", 120, 940, font);

  labelPlate(ctx, "[ GWANGYANG · KR ]", 330, 60, font, plate);
  ctx.fillStyle = frame.palette.label;
  monoLabel(ctx, "[ GWANGYANG · KR ]", 330, 60, font);

  labelPlate(ctx, "[ JP ]", 800, 60, font, plate);
  ctx.fillStyle = frame.palette.label;
  monoLabel(ctx, "[ JP ]", 800, 60, font);

  labelPlate(ctx, "[ FREMANTLE · AU ]", 720, 790, font, plate);
  ctx.fillStyle = frame.palette.label;
  monoLabel(ctx, "[ FREMANTLE · AU ]", 720, 790, font);

  labelPlate(ctx, "3300 NM", 138, 560, font, plate);
  ctx.fillStyle = frame.palette.label;
  monoLabel(ctx, "3300 NM", 138, 560, font);

  // The actors. Anchors are load-bearing: the registry label clears the
  // x=335 coast by 1 unit, the owner label clears the x=575 coast by 1.
  labelPlate(ctx, "[ REGISTRY ]", 432, 204, font, plate, "end");
  ctx.fillStyle = frame.palette.label;
  monoLabel(ctx, "[ REGISTRY ]", 432, 204, font, { anchor: "end" });

  labelPlate(ctx, "[ CARGO OWNER ]", 571, 187, font, plate, "end");
  ctx.fillStyle = frame.palette.label;
  monoLabel(ctx, "[ CARGO OWNER ]", 571, 187, font, { anchor: "end" });

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
    roroPath = measure(RORO_ROUTE);
    roroBackPath = measure(RORO_ROUTE_BACK);
    tokenPath = measure(TOKEN_PATH);
    registryFrac =
      tokenPath.length > 0 ? (tokenPath.cumulative[3] ?? 0) / tokenPath.length : 0.55;
  },

  draw(ctx, frame) {
    drawSeaGrid(ctx, frame);
    drawShores(ctx, frame);
    drawLandGrid(ctx, frame);
    drawQuayTicks(ctx, frame);

    drawPortHedland(ctx, frame);
    drawBunkerLine(ctx, frame);
    drawFremantle(ctx, frame);
    drawGwangyang(ctx, frame);
    drawAccountingRails(ctx, frame);

    drawRoutes(ctx, frame);
    drawOreCarrier(ctx, frame);
    drawRoRo(ctx, frame);
    drawToken(ctx, frame);
    drawRetirement(ctx, frame);

    drawLabels(ctx, frame);
    drawCompass(ctx, frame);
  },
};
