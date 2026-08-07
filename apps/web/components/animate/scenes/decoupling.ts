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
 * burns green fuel. At discharge, the fuel's environmental attribute detaches
 * from the vessel as a certificate, passes through a registry, and is claimed
 * by a car manufacturer — whose RoRo carrier, which never touched the fuel,
 * departs east wearing the green mark.
 *
 * THE INVARIANT. The green exists in exactly one place at every moment: on
 * the ore vessel, in the travelling token, or on the RoRo. That conservation
 * IS the accounting concept, so it is not left to choreography — one total
 * function, `attributeHolderAt`, partitions the cycle, and the draw code is
 * forbidden from having green booleans of its own. A browserless test samples
 * the cycle densely and pins the sequence and the handoff times.
 *
 * SCALE. The ore carrier is the yardstick: 26 units LOA ≈ a 260 m Capesize,
 * so 1 u ≈ 10 m. Shore furniture at a uniform ~3× exaggeration, as in the
 * corridor scene. Sea distance is symbolic — the bar reads 3300 NM, the real
 * Port Hedland–Gwangyang passage.
 */

const SPACE: DesignSpace = { width: 900, height: 1000, fit: "slice" };
const GRID_STEP = 50;

// ===== Coastlines ===========================================================
/** Pilbara coast: steps up-toward-the-ENE as the real coast trends. The notch
 *  at x 290–330 is the Port Hedland harbour inlet (decorative — the working
 *  berth is on the open coast east of it). */
export const AUSTRALIA: readonly Point[] = [
  [0, 870], [120, 870], [120, 845], [230, 845],
  [230, 820], [290, 820], [290, 835], [330, 835],
  [330, 820], [420, 820], [420, 795], [560, 795],
  [560, 770], [720, 770], [720, 745], [900, 745],
  [900, 1000], [0, 1000],
];

/** Korean peninsula: steppy, indented west coast, straighter east coast; the
 *  horizontal south quay at y=285 (x 410–520) is the Gwangyang waterfront. */
export const KOREA: readonly Point[] = [
  [290, 0], [290, 70], [310, 70], [310, 140],
  [335, 140], [335, 210], [365, 210], [365, 265],
  [410, 265], [410, 285], [520, 285],
  [520, 235], [555, 235], [555, 170], [580, 170],
  [580, 90], [600, 90], [600, 0],
];

/** Japan fragment, top-right — there for recognisability, and because it
 *  makes the RoRo's exit lane read as the Korea Strait. */
export const JAPAN: readonly Point[] = [
  [700, 0], [700, 60], [740, 60], [740, 120],
  [790, 120], [790, 180], [845, 180], [845, 240],
  [900, 240], [900, 0],
];

// ===== Berths and tracks ====================================================
export const BERTH_LOAD = { x: 370, y: 806 } as const; // Port Hedland, quay y=820
export const BERTH_ORE = { x: 438, y: 299 } as const; // Gwangyang discharge, quay y=285
export const BERTH_RORO = { x: 496, y: 299 } as const; // Gwangyang car terminal, same quay

/** Laden: departs west past the harbour mouth, runs the x=250 lane north,
 *  shapes in through the strait approaches, arrives parallel to the quay. */
export const ORE_ROUTE: readonly Point[] = [
  [370, 806], [300, 806], [250, 740], [250, 450],
  [300, 360], [320, 320], [340, 299], [438, 299],
];
/** Ballast return on the x=310 lane, so the two lanes read separately. */
export const ORE_ROUTE_BACK: readonly Point[] = [
  [438, 299], [380, 299], [330, 340], [310, 420],
  [310, 740], [310, 806], [370, 806],
];
/** RoRo export: east along the quay, through the strait, off the east edge.
 *  Ends 40 u off-frame so the fade has room; slice shows nothing past 900. */
export const RORO_ROUTE: readonly Point[] = [
  [496, 299], [560, 299], [640, 330], [780, 330], [940, 330],
];

/**
 * The certificate's rail: ore berth → REGISTRY → CAR PLANT. Overland ON
 * PURPOSE — it is a certificate, not a ship, and the landfall test exempts it.
 */
export const TOKEN_PATH: readonly Point[] = [
  [430, 292], [430, 262], [440, 232], [446, 214],
  [462, 226], [484, 238],
];

// ===== The cycle and the invariant ==========================================
export type AttributeHolder = "ore-vessel" | "token" | "roro" | "none-in-frame";

export const CYCLE_S = 48;
/** Shifts the timeline so t=0 — the reduced-motion poster — lands
 *  mid-outbound: attribute aboard, token undetached, RoRo waiting. */
export const POSTER_OFFSET_S = 0.12 * CYCLE_S;
/**
 * Handoff boundaries, as fractions of the cycle. The half-open intervals in
 * `attributeHolderAt` PARTITION [0,1): two simultaneous holders is
 * unrepresentable by construction.
 */
export const PHASES = { detach: 0.33, attach: 0.45, exit: 0.8, bunker: 0.9 } as const;

export function phaseAt(time: number): number {
  const s = (time + POSTER_OFFSET_S) % CYCLE_S;
  return (s < 0 ? s + CYCLE_S : s) / CYCLE_S;
}

export function attributeHolderAt(time: number): AttributeHolder {
  const p = phaseAt(time);
  if (p < PHASES.detach) return "ore-vessel";
  if (p < PHASES.attach) return "token";
  if (p < PHASES.exit) return "roro";
  if (p < PHASES.bunker) return "none-in-frame";
  return "ore-vessel"; // bunkered for the next voyage
}

// --- vessel sub-timings (fractions of the cycle) ----------------------------
const ORE = {
  sailOut: [0.0, 0.25], // Port Hedland → Gwangyang
  dischargeFlip: 0.29, // hull laden → ballast while alongside
  depart: 0.38, // leaves Gwangyang in ballast
  arriveHome: 0.7, // back alongside Port Hedland
  loadFlip: 0.85, // ballast → laden (next cargo aboard)
} as const;
const RORO = {
  markOn: PHASES.attach, // token absorbed → claim held
  ladenFlip: 0.52, // cars aboard, hull fills
  rampUp: 0.58,
  sail: [0.6, PHASES.exit], // east through the strait
  reappear: [0.85, 0.9], // fades back in at the berth, neutral
} as const;

/** Token easing along its rail: eased to the registry, a dwell there (the
 *  transaction), eased on to the plant. */
const REGISTRY_DWELL = [0.45, 0.6] as const; // of the token's own sub-phase
function tokenFracAt(u: number, registryFrac: number): number {
  if (u < REGISTRY_DWELL[0]) return smoothstep(u / REGISTRY_DWELL[0]) * registryFrac;
  if (u < REGISTRY_DWELL[1]) return registryFrac;
  return (
    registryFrac +
    smoothstep((u - REGISTRY_DWELL[1]) / (1 - REGISTRY_DWELL[1])) * (1 - registryFrac)
  );
}

// --- marching-dash idiom, as in the corridor scene --------------------------
const DASH: readonly number[] = [7, 5];
const DASH_PERIOD = 12;
const DASH_CYCLE_S = 1.6;

/** Precomputed in setup(). */
let orePath: MeasuredPath | null = null;
let oreBackPath: MeasuredPath | null = null;
let roroPath: MeasuredPath | null = null;
let tokenPath: MeasuredPath | null = null;
/** Fraction of the token rail's arc length at the registry vertex (index 3). */
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
  // Port Hedland quay (y=820) and the two Gwangyang berths (y=285): the
  // quays run east-west, so the berth ticks are short vertical strokes.
  for (const x of [340, 365, 390, 415]) {
    ctx.moveTo(x, 820);
    ctx.lineTo(x, 828);
  }
  for (const x of [420, 445, 460]) {
    ctx.moveTo(x, 285);
    ctx.lineTo(x, 277);
  }
  for (const x of [480, 500, 515]) {
    ctx.moveTo(x, 285);
    ctx.lineTo(x, 277);
  }
  ctx.stroke();
}

// ===== Australia furniture ==================================================
/** Conical stockpile with angle-of-repose hatching (the corridor idiom). */
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
  // Ore stockyard behind the quay.
  drawHeap(ctx, frame, 388, 856, 26, 11);
  drawHeap(ctx, frame, 422, 856, 20, 9);
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(382, 856);
  ctx.lineTo(450, 856);
  ctx.stroke();

  // Ship loader: an inverted-L boom from the quay out over the berth.
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(392, 846);
  ctx.lineTo(392, 814);
  ctx.lineTo(376, 814);
  ctx.moveTo(376, 814);
  ctx.lineTo(376, 809);
  ctx.stroke();

  // Green-fuel bunker tank, the attribute's point of entry.
  ctx.lineWidth = 1.3;
  box(ctx, 340, 826, 20, 16, frame.palette.land);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(340, 831);
  ctx.lineTo(360, 831);
  ctx.stroke();
}

/** The bunkering line: green visibly ENTERS the system here, once per cycle
 *  (and exits with the RoRo at the east edge — the books balance). */
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

// ===== Korea furniture ======================================================
function drawGwangyang(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const p = phaseAt(frame.time);

  // The registry: a double-outlined ledger box. The transaction venue.
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.3;
  box(ctx, 430, 198, 32, 16, frame.palette.land);
  ctx.lineWidth = 0.8;
  box(ctx, 433, 201, 26, 10, null);

  // Steel works and the car plant it feeds.
  ctx.lineWidth = 1.3;
  box(ctx, 424, 238, 32, 20, frame.palette.land);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(424, 238);
  ctx.lineTo(456, 258);
  ctx.moveTo(456, 238);
  ctx.lineTo(424, 258);
  ctx.stroke();
  ctx.lineWidth = 1.3;
  box(ctx, 466, 238, 36, 20, frame.palette.land);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(456, 248);
  ctx.lineTo(466, 248);
  ctx.stroke();

  // Car yard: rows of finished cars awaiting the RoRo. Depletes as they load.
  const TOTAL = 21;
  let visible = TOTAL;
  if (p >= PHASES.attach && p < RORO.sail[0]) {
    visible = TOTAL - Math.floor(((p - PHASES.attach) / (RORO.sail[0] - PHASES.attach)) * TOTAL);
  } else if (p >= RORO.sail[0] && p < RORO.reappear[0]) {
    visible = 0; // at sea, sold green
  }
  ctx.lineWidth = 0.8;
  let drawn = 0;
  for (let row = 0; row < 3 && drawn < visible; row += 1) {
    for (let col = 0; col < 7 && drawn < visible; col += 1) {
      box(ctx, 470 + col * 6.4, 264 + row * 5.4, 4, 2.5, frame.palette.land);
      drawn += 1;
    }
  }

  // Ore discharge conveyor: berth up to the steel works, marching while the
  // carrier discharges.
  const discharging = p >= ORE.sailOut[1] && p < PHASES.detach;
  const phase = (frame.time % DASH_CYCLE_S) / DASH_CYCLE_S;
  ctx.strokeStyle = frame.palette.inkSoft;
  ctx.lineWidth = 1;
  dashed(
    ctx,
    () => {
      ctx.beginPath();
      ctx.moveTo(444, 285);
      ctx.lineTo(444, 258);
      ctx.stroke();
    },
    [3, 3],
    discharging ? -phase * 6 : 0,
  );
}

/** The certificate's rail, always visible: the accounting layer exists even
 *  when nothing is travelling on it. */
function drawTokenRail(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.strokeStyle = frame.palette.inkSoft;
  ctx.lineWidth = 0.9;
  dashed(ctx, () => polyline(ctx, TOKEN_PATH), [3, 3]);
}

// ===== Sea routes ===========================================================
function drawRoutes(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const phase = (frame.time % DASH_CYCLE_S) / DASH_CYCLE_S;
  const offset = -phase * DASH_PERIOD;

  // Laden ore lane: the headline track, dashes marching toward Korea.
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.6;
  dashed(ctx, () => polyline(ctx, ORE_ROUTE), DASH, offset);

  // Ballast return, lighter and static.
  ctx.strokeStyle = frame.palette.inkSoft;
  ctx.lineWidth = 1.1;
  dashed(ctx, () => polyline(ctx, ORE_ROUTE_BACK), [3, 5]);

  // RoRo export lane, marching toward the exit.
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.3;
  dashed(ctx, () => polyline(ctx, RORO_ROUTE), DASH, offset);

  // Waypoints on the ore lane; a chevron mid-strait; the exit chevron.
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.5;
  crosshair(ctx, 250, 740, 4);
  crosshair(ctx, 250, 450, 4);
  ctx.strokeStyle = frame.palette.inkSoft;
  ctx.lineWidth = 1.2;
  chevron(ctx, 640, 236);
  chevron(ctx, 856, 296);
}

// ===== Vessels ==============================================================
interface VesselOpts {
  readonly kind: "bulk" | "roro";
  readonly laden: boolean;
  /** Whether this hull currently holds the environmental attribute. Callers
   *  derive it from attributeHolderAt — never from local state. */
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

  // Hull path — traced once, used for fill, outline, and the green restroke.
  const hull = () => {
    ctx.beginPath();
    if (kind === "bulk") {
      // Raked stem, square transom.
      ctx.moveTo(stern, -half);
      ctx.lineTo(bow - 6, -half);
      ctx.lineTo(bow, 0);
      ctx.lineTo(bow - 6, half);
      ctx.lineTo(stern, half);
    } else {
      // RoRo: slab-sided, short bow chamfer, ramp notch at the stern quarter.
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

  // Deck detail.
  ctx.strokeStyle = laden ? frame.palette.ink : frame.palette.ship;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  if (kind === "bulk") {
    for (let i = 0; i < 4; i += 1) {
      const hx = stern + 5 + i * 4.6;
      ctx.rect(hx, -half + 1.2, 3.2, B - 2.4);
    }
    ctx.rect(stern + 1, -half + 1.4, 3, B - 2.8); // deckhouse aft
  } else {
    ctx.moveTo(stern + 4, 0);
    ctx.lineTo(bow - 6, 0); // faint centreline, no other deck furniture
    ctx.rect(bow - 8, -half + 1.4, 3.4, B - 2.8); // bridge FORWARD on a RoRo
  }
  ctx.stroke();

  // The green mark: the hull restroked in the attribute colour, plus the
  // certificate diamond amidships — the same glyph the token uses, so the
  // lift-off reads as one object moving.
  if (marked) {
    hull();
    ctx.strokeStyle = frame.palette.attr;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // The certificate flies OFF the hull, like a flag: amidships it drowns in
    // the red laden fill at gallery scale, and the claim-in-use is the one
    // moment the green must be unmissable.
    diamond(ctx, 0, -half - 5, 3.2, frame.palette.attr, frame.palette.attr);
  }

  ctx.restore();

  // Stern ramp down to the quay, in world space (the hull sits below an
  // east-west quay, so the ramp reaches up-left from the stern quarter).
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
    angle = 0; // alongside, bow east — the arrival heading
  } else if (p < ORE.arriveHome) {
    ({ x, y, angle } = poseAt(
      oreBackPath,
      berthEase((p - ORE.depart) / (ORE.arriveHome - ORE.depart)),
    ));
  } else {
    ({ x, y } = BERTH_LOAD);
    angle = Math.PI; // alongside home, bow west — the departure heading
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

// --- the RoRo's day ---------------------------------------------------------
function drawRoRo(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  if (!roroPath) return;
  const p = phaseAt(frame.time);
  const holder = attributeHolderAt(frame.time);

  let x: number = BERTH_RORO.x;
  let y: number = BERTH_RORO.y;
  let angle = 0;
  let alpha = 1;
  let berthed = true;

  if (p >= RORO.sail[0] && p < RORO.sail[1]) {
    berthed = false;
    const u = berthEase((p - RORO.sail[0]) / (RORO.sail[1] - RORO.sail[0]));
    ({ x, y, angle } = poseAt(roroPath, u));
    // Dissolve toward the frame edge — leaving for the export market.
    alpha = Math.min(1, Math.max(0, (900 - x) / 80));
  } else if (p >= RORO.sail[1] && p < RORO.reappear[0]) {
    return; // at sea, off-frame
  } else if (p >= RORO.reappear[0] && p < RORO.reappear[1]) {
    alpha = smoothstep((p - RORO.reappear[0]) / (RORO.reappear[1] - RORO.reappear[0]));
  }

  const laden = p >= RORO.ladenFlip && p < RORO.sail[1];
  const rampDown = berthed && p >= PHASES.attach && p < RORO.rampUp;
  drawVessel(ctx, frame, x, y, angle, {
    kind: "roro",
    laden,
    marked: holder === "roro",
    alpha,
    rampToY: rampDown ? 285 : null,
  });
}

// --- the certificate --------------------------------------------------------
function drawToken(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  if (!tokenPath) return;
  if (attributeHolderAt(frame.time) !== "token") return;
  const p = phaseAt(frame.time);
  const u = (p - PHASES.detach) / (PHASES.attach - PHASES.detach);
  const frac = tokenFracAt(u, registryFrac);
  const { x, y } = poseAt(tokenPath, frac);

  // A short trail of the rail restroked in the attribute colour behind it.
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

  // The certificate: a tag, not a particle — land-filled diamond with a
  // solid core in the attribute colour.
  diamond(ctx, x, y, 7, frame.palette.attr, frame.palette.land);
  diamond(ctx, x, y, 3, frame.palette.attr, frame.palette.attr);

  // The registry acknowledges the transaction while the token dwells.
  if (u >= REGISTRY_DWELL[0] && u < REGISTRY_DWELL[1]) {
    const k = (u - REGISTRY_DWELL[0]) / (REGISTRY_DWELL[1] - REGISTRY_DWELL[0]);
    ctx.save();
    ctx.globalAlpha = Math.sin(k * Math.PI);
    ctx.strokeStyle = frame.palette.attr;
    ctx.lineWidth = 1.6;
    box(ctx, 428, 196, 36, 20, null);
    ctx.restore();
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

  labelPlate(ctx, "[ PORT HEDLAND · AU ]", 120, 940, font, plate);
  ctx.fillStyle = frame.palette.label;
  monoLabel(ctx, "[ PORT HEDLAND · AU ]", 120, 940, font);

  labelPlate(ctx, "[ GWANGYANG · KR ]", 330, 60, font, plate);
  ctx.fillStyle = frame.palette.label;
  monoLabel(ctx, "[ GWANGYANG · KR ]", 330, 60, font);

  labelPlate(ctx, "[ JP ]", 800, 60, font, plate);
  ctx.fillStyle = frame.palette.label;
  monoLabel(ctx, "[ JP ]", 800, 60, font);

  labelPlate(ctx, "[ EXPORT · US ]", 884, 368, font, plate, "end");
  ctx.fillStyle = frame.palette.label;
  monoLabel(ctx, "[ EXPORT · US ]", 884, 368, font, { anchor: "end" });

  labelPlate(ctx, "3300 NM", 138, 560, font, plate);
  ctx.fillStyle = frame.palette.label;
  monoLabel(ctx, "3300 NM", 138, 560, font);

  // Furniture captions — plates only where a leader would cross something.
  labelPlate(ctx, "[ REGISTRY ]", 430, 193, font, plate);
  ctx.fillStyle = frame.palette.label;
  monoLabel(ctx, "[ REGISTRY ]", 430, 193, font);

  labelPlate(ctx, "[ CAR PLANT ]", 424, 231, font, plate);
  ctx.fillStyle = frame.palette.label;
  monoLabel(ctx, "[ CAR PLANT ]", 424, 231, font);

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
    tokenPath = measure(TOKEN_PATH);
    // The registry sits at vertex 3 of the token rail; the dwell holds there.
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
    drawGwangyang(ctx, frame);
    drawTokenRail(ctx, frame);

    drawRoutes(ctx, frame);
    drawOreCarrier(ctx, frame);
    drawRoRo(ctx, frame);
    drawToken(ctx, frame);

    drawLabels(ctx, frame);
    drawCompass(ctx, frame);
  },
};
