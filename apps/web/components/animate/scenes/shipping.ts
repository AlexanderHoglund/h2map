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

// ===== Production shore: PV → NH3 → PORT A ==================================
/** Legs on land, jib over the quay, hook above the berth — the hook line
 *  drops toward the route start at (360, 860). */
function drawCraneA(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(285, 850); ctx.lineTo(285, 795);
  ctx.moveTo(315, 850); ctx.lineTo(315, 795);
  ctx.moveTo(275, 795); ctx.lineTo(385, 795);
  ctx.moveTo(360, 795); ctx.lineTo(360, 822);
  ctx.moveTo(260, 850); ctx.lineTo(340, 850); // ground line, meeting the quay
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(315, 795); ctx.lineTo(350, 778); ctx.lineTo(385, 795);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  box(ctx, 354, 822, 12, 9);
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
/** Mirrors crane A: jib west over the quay, hook dropping to (715, 340). */
function drawCraneB(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(785, 300); ctx.lineTo(785, 245);
  ctx.moveTo(815, 300); ctx.lineTo(815, 245);
  ctx.moveTo(700, 245); ctx.lineTo(825, 245);
  ctx.moveTo(715, 245); ctx.lineTo(715, 272);
  ctx.moveTo(740, 300); ctx.lineTo(840, 300);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(785, 245); ctx.lineTo(750, 228); ctx.lineTo(715, 245);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  box(ctx, 709, 272, 12, 9);
}

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

/** The fleet: staggered along the corridor, one loop every 36 s. */
function drawFleet(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  if (!routePath) return;
  ctx.fillStyle = frame.palette.ship;
  for (const offset of SHIP_OFFSETS) {
    const t = ((frame.time + offset) % VOYAGE_S) / VOYAGE_S;
    const { x, y } = poseAt(routePath, t);
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // `poseAt` also returns the heading. It is unused while the ships are
  // circles, but the SVG carries `offset-rotate: auto`, so the moment a hull
  // shape replaces the dot the rotation is already available.
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

    ctx.fillStyle = frame.palette.label;
    monoLabel(ctx, "[ PECEM · BR ]", 50, 776, frame.font);

    drawCraneA(ctx, frame);
    drawContainersA(ctx, frame);
    drawPvArray(ctx, frame);
    ctx.fillStyle = frame.palette.label;
    monoLabel(ctx, "[ PV ARRAY ]", 50, 978, frame.font);

    drawNh3(ctx, frame);
    ctx.fillStyle = frame.palette.label;
    monoLabel(ctx, "[ NH3 SYNTHESIS ]", 208, 978, frame.font);

    drawPipes(ctx, frame);

    drawCraneB(ctx, frame);
    drawContainersB(ctx, frame);
    ctx.fillStyle = frame.palette.label;
    monoLabel(ctx, "[ ROTTERDAM · NL ]", 862, 390, frame.font, { anchor: "end" });

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
