import { box, chevron, crosshair, dashed, monoLabel, polyline, shape, ticks } from "@/lib/animation/draw";
import { measure, poseAt, type MeasuredPath } from "@/lib/animation/polyline";
import type { DesignSpace, Frame, Point, Scene } from "@/lib/animation/types";

/** The colours this scene draws with. Naming them makes `frame.palette.ink` a
 *  plain string and a typo a compile error. */
type Ink = "ink" | "inkSoft" | "land" | "ship" | "label" | "grid";

/**
 * Canvas port of the entry-panel artwork (`components/corridor/ShippingCanvas.tsx`,
 * which despite its name is SVG). Same 900×1000 design space, same coordinates,
 * same paint order — canvas is painter's algorithm, so source order IS z-order
 * and the two files can be diffed section by section.
 *
 * A two-port green-corridor schematic in old-school technical-drawing style:
 * monochrome, straight lines and right angles only, every element on a shared
 * grid so the geometry actually connects. PV array → NH3 synthesis → Port A
 * crane → quay → angular dashed route (ships under way) → Port B quay → crane.
 *
 * Grid discipline: land edges on multiples of 20; the route leaves Port A
 * exactly under crane A's hook (x=360, y=860) and ends exactly under crane B's
 * hook (x=715, y=340); process pipes butt onto the structures they connect.
 *
 * Nothing on the landing page changes — this is a parallel implementation kept
 * deliberately comparable so the engine can be judged against a known result.
 */

const SPACE: DesignSpace = { width: 900, height: 1000, fit: "slice" };

// --- geometry ---------------------------------------------------------------
const LAT = [125, 375, 625, 875] as const;
const LON = [150, 450, 750] as const;

const SHORE_A: readonly Point[] = [
  [0, 620], [160, 620], [160, 680], [240, 680],
  [240, 740], [340, 740], [340, 1000], [0, 1000],
];
const SHORE_B: readonly Point[] = [
  [900, 0], [900, 360], [740, 360], [740, 280],
  [640, 280], [640, 200], [540, 200], [540, 0],
];

/** Quay to quay: Port A (340,860) → right angles → Port B (740,340). */
const ROUTE: readonly Point[] = [
  [340, 860], [520, 860], [520, 620], [680, 620], [680, 340], [740, 340],
];
const WAYPOINTS: readonly Point[] = [[520, 860], [520, 620], [680, 620], [680, 340]];
const SEA_MARKS: readonly Point[] = [
  [380, 300], [780, 620], [420, 950], [240, 180], [600, 90],
];

// --- motion, matching globals.css:56-76 exactly -----------------------------
const DASH: readonly number[] = [7, 5];
/** 7 + 5: the CSS animates dashoffset to -24, i.e. two whole periods. */
const DASH_PERIOD = 12;
const DASH_CYCLE_S = 1.6;
const VOYAGE_S = 36;
/** The CSS `animation-delay: 0s, -12s, -24s` — a negative delay starts mid-loop. */
const SHIP_OFFSETS = [0, 12, 24] as const;

/** Precomputed once in setup(); the fleet needs arc length, not vertices. */
let routePath: MeasuredPath | null = null;

// ===== Graticule ============================================================
function drawGraticule(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.strokeStyle = frame.palette.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const y of LAT) {
    ctx.moveTo(0, y);
    ctx.lineTo(900, y);
  }
  for (const x of LON) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 1000);
  }
  ctx.stroke();
}

// ===== Land =================================================================
function drawShores(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  shape(ctx, SHORE_A, frame.palette.land, frame.palette.ink, 1.5);
  shape(ctx, SHORE_B, frame.palette.land, frame.palette.ink, 1.5);
}

function drawQuayTicks(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.5;
  ticks(ctx, 340, [800, 830, 860, 890], 8);
  ticks(ctx, 732, [300, 320, 340], 8);
}

// ===== Cranes ===============================================================
/**
 * Ship-to-shore gantry, drawn from the quay edge outward.
 *
 * `dir` is +1 when the jib reaches right over the water, -1 when it reaches
 * left, so Port B is a true mirror rather than a second set of literals.
 *
 * The silhouette is the real machine: two A-framed legs on a sill beam, a
 * horizontal boom cantilevered over the berth with a short backreach behind,
 * a diagonal tie from the apex out to the boom tip, and a trolley whose hoist
 * ropes drop to the spreader above the hold. The previous version peaked the
 * boom into a gable, which read as a house rather than a crane.
 */
function drawGantry(
  ctx: CanvasRenderingContext2D,
  frame: Frame<Ink>,
  quayX: number,
  groundY: number,
  dir: 1 | -1,
): void {
  // Lessons from three attempts, all of which read as buildings:
  //  - anything drawn ABOVE the boom (pylon, stays) makes a roofline;
  //  - a horizontal tie between the legs closes a box and makes a shed.
  // So: no superstructure and no closed rectangle. A ship-to-shore crane in
  // elevation is essentially an inverted L — tall A-frame legs carrying one
  // long boom that cantilevers out over the water, with the hoist hanging
  // from it. The cantilever IS the silhouette; keep it unobstructed.
  const legFore = quayX - dir * 26;
  const legBack = quayX - dir * 86;
  const apexFore = quayX - dir * 40; // legs lean together toward the top…
  const apexBack = quayX - dir * 72; // …but stop well short of meeting
  const beam = groundY - 74;
  const boomTip = quayX + dir * 66;
  const backTip = quayX - dir * 108;
  const trolley = quayX + dir * 34;
  const spreader = groundY - 30;

  ctx.strokeStyle = frame.palette.ink;

  // Ground.
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(legBack - dir * 26, groundY); ctx.lineTo(quayX, groundY);
  ctx.stroke();

  // The A-frame: two legs leaning in, joined only where they meet the boom.
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(legBack, groundY); ctx.lineTo(apexBack, beam);
  ctx.moveTo(legFore, groundY); ctx.lineTo(apexFore, beam);
  ctx.stroke();

  // One diagonal brace INSIDE the portal — bracing, not a lintel. Kept off
  // the legs' own lines so it doesn't read as a second structure.
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(legBack - dir * 4, groundY - 14);
  ctx.lineTo(apexFore - dir * 4, beam + 20);
  ctx.stroke();

  // The boom: the whole point. One long horizontal, nothing above it.
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(backTip, beam); ctx.lineTo(boomTip, beam);
  ctx.stroke();
  // Tip taper, so the cantilever ends in a point rather than a blunt stop.
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(boomTip, beam); ctx.lineTo(boomTip - dir * 16, beam + 7);
  ctx.lineTo(apexFore, beam + 7);
  ctx.stroke();

  // Trolley + hoist hanging over the berth.
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(trolley - 4, beam); ctx.lineTo(trolley - 4, spreader);
  ctx.moveTo(trolley + 4, beam); ctx.lineTo(trolley + 4, spreader);
  ctx.stroke();
  ctx.lineWidth = 1.2;
  box(ctx, trolley - 7, spreader, 14, 5);
}

function drawContainersA(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.2;
  box(ctx, 196, 840, 28, 10);
  box(ctx, 196, 830, 28, 10);
  box(ctx, 228, 840, 28, 10);
  ctx.beginPath();
  ctx.moveTo(196, 850); ctx.lineTo(256, 850);
  ctx.stroke();
}

/** 4×2 cells, one diagonal per cell, legs to a ground line. */
function drawPvArray(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.2;
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 2; r += 1) {
      const x = 50 + c * 30;
      const y = 900 + r * 20;
      box(ctx, x, y, 26, 16);
      ctx.beginPath();
      ctx.moveTo(x, y + 16);
      ctx.lineTo(x + 26, y);
      ctx.stroke();
    }
  }
  ctx.beginPath();
  ctx.moveTo(62, 940); ctx.lineTo(62, 952);
  ctx.moveTo(154, 940); ctx.lineTo(154, 952);
  ctx.moveTo(50, 952); ctx.lineTo(166, 952);
  ctx.stroke();
}

/** Two braced tanks on a shared ground line, plus a stack. */
function drawNh3(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.5;
  box(ctx, 210, 908, 34, 44);
  box(ctx, 252, 908, 34, 44);
  ctx.beginPath();
  ctx.moveTo(202, 952); ctx.lineTo(298, 952);
  ctx.moveTo(292, 908); ctx.lineTo(292, 886); ctx.lineTo(302, 886);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(210, 908); ctx.lineTo(244, 952);
  ctx.moveTo(244, 908); ctx.lineTo(210, 952);
  ctx.moveTo(252, 908); ctx.lineTo(286, 952);
  ctx.moveTo(286, 908); ctx.lineTo(252, 952);
  ctx.stroke();
}

/** Right angles, butted onto the structures they connect. */
function drawPipes(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.strokeStyle = frame.palette.inkSoft;
  ctx.lineWidth = 1.2;
  dashed(
    ctx,
    () => {
      ctx.beginPath();
      ctx.moveTo(166, 928); ctx.lineTo(210, 928);
      ctx.moveTo(286, 930); ctx.lineTo(320, 930); ctx.lineTo(320, 850);
      ctx.stroke();
    },
    [3, 3],
  );
}

// ===== Destination shore: PORT B ============================================

function drawContainersB(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.2;
  box(ctx, 848, 290, 28, 10);
  box(ctx, 848, 280, 28, 10);
  ctx.beginPath();
  ctx.moveTo(848, 300); ctx.lineTo(890, 300);
  ctx.stroke();
}

// ===== The corridor =========================================================
function drawRoute(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  // CSS marches dashoffset 0 → -24 over 1.6s (24 = two dash periods, so the
  // pattern lands back on itself). Canvas's lineDashOffset runs the opposite
  // way to SVG's, hence the negation.
  const phase = (frame.time % DASH_CYCLE_S) / DASH_CYCLE_S;
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.8;
  dashed(ctx, () => polyline(ctx, ROUTE), DASH, -phase * DASH_PERIOD);
}

function drawWaypoints(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.5;
  for (const [x, y] of WAYPOINTS) crosshair(ctx, x, y, 4);
}

/**
 * A vessel in plan view, bow pointing along +x before rotation: a hull with a
 * raked bow and a square transom, deckhouse aft, and a short mast.
 *
 * Drawn in the ship's own frame so the heading from `poseAt` simply rotates
 * it. That heading is what CSS `offset-rotate: auto` was already asking for —
 * it was invisible while the fleet were dots.
 */
function drawVessel(
  ctx: CanvasRenderingContext2D,
  frame: Frame<Ink>,
  x: number,
  y: number,
  angle: number,
): void {
  const L = 22; // length overall
  const B = 7; // beam
  const half = B / 2;
  const bow = L * 0.5;
  const stern = -L * 0.5;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Hull: straight sides, raked stem, square transom.
  ctx.beginPath();
  ctx.moveTo(stern, -half);
  ctx.lineTo(bow - 7, -half);
  ctx.lineTo(bow, 0);
  ctx.lineTo(bow - 7, half);
  ctx.lineTo(stern, half);
  ctx.closePath();
  ctx.fillStyle = frame.palette.ship;
  ctx.fill();

  // Deckhouse aft + mast, in the ink so they read against the hull colour.
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(stern + 3, -half + 1.2, 5, B - 2.4);
  ctx.moveTo(stern + 10, 0);
  ctx.lineTo(stern + 13, 0);
  ctx.stroke();

  ctx.restore();
}

/** The fleet: staggered along the corridor, one loop every 36 s. */
function drawFleet(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  if (!routePath) return;
  for (const offset of SHIP_OFFSETS) {
    const t = ((frame.time + offset) % VOYAGE_S) / VOYAGE_S;
    const { x, y, angle } = poseAt(routePath, t);
    drawVessel(ctx, frame, x, y, angle);
  }
}

function drawSeaMarks(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.strokeStyle = frame.palette.inkSoft;
  ctx.lineWidth = 1.2;
  for (const [x, y] of SEA_MARKS) chevron(ctx, x, y);
}

// ===== Chrome ===============================================================
function drawCompass(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.save();
  ctx.translate(80, 84);
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-20, 0); ctx.lineTo(20, 0);
  ctx.moveTo(0, -20); ctx.lineTo(0, 20);
  ctx.stroke();
  box(ctx, -6, -6, 12, 12);
  ctx.fillStyle = frame.palette.label;
  monoLabel(ctx, "N", 0, -30, frame.font, { size: 13, spacing: 0, anchor: "middle" });
  ctx.restore();
}

function drawScaleBar(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.save();
  ctx.translate(620, 60);
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(180, 0);
  ctx.moveTo(0, -5); ctx.lineTo(0, 5);
  ctx.moveTo(90, -4); ctx.lineTo(90, 4);
  ctx.moveTo(180, -5); ctx.lineTo(180, 5);
  ctx.stroke();
  ctx.fillStyle = frame.palette.label;
  monoLabel(ctx, "1000 NM", 90, 22, frame.font, { anchor: "middle" });
  ctx.restore();
}


/**
 * A caption tied to what it names by an elbow leader — the draughtsman's
 * convention. Without it a bare label floats in empty land and the reader has
 * to guess which structure it belongs to.
 */
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
  ctx.strokeStyle = frame.palette.inkSoft;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(fromX, toY);
  ctx.lineTo(toX + (anchor === "start" ? -6 : 6), toY);
  ctx.stroke();
  // Tick at the subject end, so the leader clearly originates somewhere.
  ctx.beginPath();
  ctx.moveTo(fromX - 3, fromY); ctx.lineTo(fromX + 3, fromY);
  ctx.stroke();
  ctx.fillStyle = frame.palette.label;
  monoLabel(ctx, text, toX, toY + 4, frame.font, { anchor });
}

// ===== The scene ============================================================
export const shippingScene: Scene<Ink> = {
  id: "shipping",
  space: SPACE,
  palette: [
    { key: "ink", prop: "--anim-ink", fallback: "#3f3e3a" },
    { key: "inkSoft", prop: "--anim-ink-soft", fallback: "#9b9a90" },
    { key: "land", prop: "--anim-land", fallback: "#f2f2ed" },
    { key: "ship", prop: "--anim-ship", fallback: "#b2182b" },
    { key: "label", prop: "--viz-ink-secondary", fallback: "#52514e" },
    { key: "grid", prop: "--viz-grid", fallback: "#e1e0d9" },
  ],

  setup() {
    routePath = measure(ROUTE);
  },

  draw(ctx, frame) {
    drawGraticule(ctx, frame);
    drawShores(ctx, frame);
    drawQuayTicks(ctx, frame);

    // --- Production shore: the works, then the quay it feeds ---------------
    drawPvArray(ctx, frame);
    drawNh3(ctx, frame);
    drawPipes(ctx, frame);
    drawContainersA(ctx, frame);
    drawGantry(ctx, frame, 340, 850, 1);

    // Captions hang off their subject rather than floating in the land.
    caption(ctx, frame, "[ PV ARRAY ]", 108, 956, 50, 984);
    caption(ctx, frame, "[ NH3 SYNTHESIS ]", 250, 956, 208, 984);
    ctx.fillStyle = frame.palette.label;
    monoLabel(ctx, "[ PECEM · BR ]", 50, 706, frame.font);

    // --- Destination shore -------------------------------------------------
    drawContainersB(ctx, frame);
    drawGantry(ctx, frame, 740, 300, -1);
    ctx.fillStyle = frame.palette.label;
    monoLabel(ctx, "[ ROTTERDAM · NL ]", 872, 168, frame.font, { anchor: "end" });

    // --- The corridor ------------------------------------------------------
    drawRoute(ctx, frame);
    drawWaypoints(ctx, frame);
    ctx.fillStyle = frame.palette.label;
    monoLabel(ctx, "4600 NM", 534, 606, frame.font);

    drawFleet(ctx, frame);
    drawSeaMarks(ctx, frame);
    drawCompass(ctx, frame);
    drawScaleBar(ctx, frame);
  },
};
