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
 * SCALE. The ship is the yardstick: 22 units LOA = a ~180 m carrier, so one
 * unit is ~8 m. Shore plant is drawn at 3x that, uniformly — true scale would
 * put a PV panel at half a unit, invisible. The exaggeration is uniform, so
 * relative sizes stay honest: a 120 m turbine is ~2/3 a 180 m ship in reality
 * and ~2x here, consistently with everything else on the shore. Sea distance
 * is a third scale entirely (the bar reads 1000 NM) — unavoidable when a
 * 4600 NM crossing shares a frame with a 45 m tank.
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

/**
 * Production shore: enlarged to carry the whole chain — wind and solar
 * generation inland, electrolysis and synthesis mid-shore, then the export
 * quay. The sea is now just the corridor between the two coasts, because the
 * story is the process, not the ocean.
 */
export const SHORE_A: readonly Point[] = [
  [40, 300], [200, 300], [200, 360], [400, 360],
  [400, 470], [600, 470], [600, 640], [700, 640],
  [700, 1000], [40, 1000],
];
/** Destination shore: the import terminal, top-right. */
export const SHORE_B: readonly Point[] = [
  [900, 0], [900, 330], [790, 330], [790, 210],
  [690, 210], [690, 100], [540, 100], [540, 0],
];

/**
 * Laden: berth A (706,840) → the corridor → berth B (806,344).
 *
 * Every vertex is verified to lie in water — the previous track ran straight
 * through Shore B, so the fleet sailed over the import terminal. Both ends sit
 * just off the quay line (A's coast is x=700, B's is y=330), so a vessel
 * arrives alongside and swings there rather than driving into the land.
 */
export const ROUTE: readonly Point[] = [
  [706, 840], [756, 840], [756, 600], [830, 600], [830, 360], [806, 344],
];
/**
 * Ballast, the return leg. Offset from the laden track so the two are legible
 * as separate lanes — the convention on a real routeing chart, and it stops
 * the outbound and inbound vessels from overrunning each other.
 */
export const ROUTE_BACK: readonly Point[] = [
  [806, 344], [880, 380], [880, 640], [792, 640], [792, 900], [706, 900],
];
const WAYPOINTS: readonly Point[] = [[756, 840], [756, 600], [830, 600], [830, 360]];
const SEA_MARKS: readonly Point[] = [[726, 250], [860, 760]];

// --- motion, matching globals.css:56-76 exactly -----------------------------
const DASH: readonly number[] = [7, 5];
/** 7 + 5: the CSS animates dashoffset to -24, i.e. two whole periods. */
const DASH_PERIOD = 12;
const DASH_CYCLE_S = 1.6;
/** One full circuit: out laden, back in ballast. */
const VOYAGE_S = 36;
/** Four vessels evenly spaced around the circuit, so the corridor is never empty. */
const SHIP_OFFSETS = [0, 9, 18, 27] as const;

/** Precomputed once in setup(); the fleet needs arc length, not vertices. */
let routePath: MeasuredPath | null = null;
let returnPath: MeasuredPath | null = null;

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
  ticks(ctx, 700, [800, 830, 860, 890], 8);
  ticks(ctx, 782, [240, 270, 300], 8);
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
  // Sized from a real ship-to-shore crane at the shore scale (1 u ≈ 8 m, x3):
  // 30 m rail gauge, 60 m to the boom, 55 m seaward reach, 30 m backreach.
  const legFore = quayX - dir * 8;
  const legBack = quayX - dir * 26;
  const apexFore = quayX - dir * 13;
  const apexBack = quayX - dir * 21;
  const beam = groundY - 35;
  const boomTip = quayX + dir * 32;
  const backTip = quayX - dir * 43;
  const trolley = quayX + dir * 17;
  const spreader = groundY - 14;

  ctx.strokeStyle = frame.palette.ink;

  // Ground.
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(legBack - dir * 46, groundY); ctx.lineTo(quayX, groundY);
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
  ctx.moveTo(legBack - dir * 2, groundY - 7);
  ctx.lineTo(apexFore - dir * 2, beam + 11);
  ctx.stroke();

  // The boom: the whole point. One long horizontal, nothing above it.
  ctx.lineWidth = 1.5;
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
  ctx.moveTo(trolley - 2.6, beam); ctx.lineTo(trolley - 2.6, spreader);
  ctx.moveTo(trolley + 2.6, beam); ctx.lineTo(trolley + 2.6, spreader);
  ctx.stroke();
  ctx.lineWidth = 1.2;
  box(ctx, trolley - 5, spreader, 10, 4);
}

/**
 * Export terminal: the tank farm the pipeline fills, and the loading arms that
 * put it aboard. Containers were the wrong furniture — this corridor moves
 * ammonia in bulk, not boxes — and at yard scale they read as a grey smudge.
 */
function drawExportTerminal(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const base = 786;
  ctx.strokeStyle = frame.palette.ink;

  // Two storage spheres on the waterfront, matching the synthesis tankage.
  for (const cx of [630, 664] as const) {
    const r = 9;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(cx, base - r - 3, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx - r, base - r - 3); ctx.lineTo(cx + r, base - r - 3);
    ctx.moveTo(cx - r * 0.7, base - 3); ctx.lineTo(cx - r * 0.7, base);
    ctx.moveTo(cx + r * 0.7, base - 3); ctx.lineTo(cx + r * 0.7, base);
    ctx.stroke();
  }
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(616, base); ctx.lineTo(680, base);
  ctx.stroke();

  // Loading arms at each berth: the last few metres of the chain.
  ctx.lineWidth = 1.2;
  for (const y of [830, 916] as const) {
    ctx.beginPath();
    ctx.moveTo(688, y - 10); ctx.lineTo(688, y - 2);
    ctx.lineTo(697, y - 2);
    ctx.stroke();
  }
}

function drawTurbine(
  ctx: CanvasRenderingContext2D,
  frame: Frame<Ink>,
  x: number,
  groundY: number,
  h: number,
  phase: number,
  spin: number,
): void {
  const hubY = groundY - h;
  const blade = h * 0.62; // rotor ~150 m against a 120 m hub

  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  // Tower, tapering very slightly by being drawn as one line at this scale.
  ctx.moveTo(x, groundY);
  ctx.lineTo(x, hubY);
  ctx.stroke();

  ctx.save();
  ctx.translate(x, hubY);
  ctx.rotate(frame.time * spin * Math.PI * 2 + phase);
  ctx.lineWidth = 1.2;
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
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, hubY, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

/** The wind farm: a row along the high ground, staggered so it reads as depth. */
function drawWindFarm(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const rows: readonly [x: number, y: number, h: number, phase: number, spin: number][] = [
    [70, 500, 44, 0.0, 0.22],
    [128, 500, 41, 1.7, 0.19],
    [186, 500, 46, 3.1, 0.25],
    [244, 500, 42, 5.0, 0.20],
    [99, 566, 38, 2.3, 0.17],
    [157, 566, 40, 0.8, 0.21],
    [215, 566, 36, 4.4, 0.24],
    [273, 566, 39, 2.9, 0.18],
  ];
  for (const [x, y, h, phase, spin] of rows) drawTurbine(ctx, frame, x, y, h, phase, spin);
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(50, 500); ctx.lineTo(300, 500);
  ctx.moveTo(79, 566); ctx.lineTo(329, 566);
  ctx.stroke();
}

/**
 * PV field. At this scale a single 4 m module is half a unit, so the array is
 * drawn as what you would actually see from the corridor: blocks of parallel
 * rows, with the row pitch (~9 m) as the readable unit rather than the panel.
 */
function drawPvArray(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.strokeStyle = frame.palette.ink;
  const blocks: readonly [x: number, y: number, w: number, rows: number][] = [
    [64, 656, 112, 7],
    [192, 656, 112, 7],
    [64, 742, 112, 6],
    [192, 742, 112, 6],
  ];
  for (const [bx, by, bw, rows] of blocks) {
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (let r = 0; r < rows; r += 1) {
      const y = by + r * 3.3 * 2;
      ctx.moveTo(bx, y + 1.5);
      ctx.lineTo(bx + bw, y + 1.5); // a row of panels, seen near-edge on
    }
    ctx.stroke();
    // Block outline, so the field reads as a fenced parcel.
    ctx.lineWidth = 1.2;
    box(ctx, bx - 6, by - 5, bw + 12, rows * 6.6 + 4);
  }
}

/** Electrolyser hall: a stack module block, the heart of the chain. */
function drawElectrolyser(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const x = 344;
  const y = 686;
  const w = 40; // ~110 m hall
  const d = 17; // ~45 m deep
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.4;
  box(ctx, x, y, w, d);
  // Stack modules inside — the repeated cell that says "electrolyser".
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  for (let i = 1; i < 5; i += 1) {
    ctx.moveTo(x + (i * w) / 5, y + 2);
    ctx.lineTo(x + (i * w) / 5, y + d - 2);
  }
  ctx.stroke();
  // A second hall behind, so it reads as a plant rather than one shed.
  ctx.lineWidth = 1.2;
  box(ctx, x + 4, y - 22, w - 8, 15);
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(x - 8, y + d); ctx.lineTo(x + w + 8, y + d);
  ctx.stroke();
}

/** Ammonia synthesis + storage: reactor columns, a flare, and spheres. */
function drawSynthesis(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const base = 703; // shared ground line with the electrolyser
  ctx.strokeStyle = frame.palette.ink;

  // Two reactor columns, ~40 m tall.
  ctx.lineWidth = 1.3;
  box(ctx, 424, base - 15, 5, 15);
  box(ctx, 433, base - 15, 5, 15);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(424, base - 15); ctx.lineTo(429, base);
  ctx.moveTo(429, base - 15); ctx.lineTo(424, base);
  ctx.moveTo(433, base - 15); ctx.lineTo(438, base);
  ctx.moveTo(438, base - 15); ctx.lineTo(433, base);
  ctx.stroke();

  // Flare stack, ~60 m — the tallest thing in the works after the turbines.
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(446, base); ctx.lineTo(446, base - 22); ctx.lineTo(451, base - 22);
  ctx.stroke();

  // Storage spheres, ~45 m across, on their skirts.
  for (const [cx, r] of [[500, 8.5], [522, 8.5]] as const) {
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(cx, base - r - 2, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx - r, base - r - 2); ctx.lineTo(cx + r, base - r - 2);
    ctx.moveTo(cx - r * 0.7, base - 2); ctx.lineTo(cx - r * 0.7, base);
    ctx.moveTo(cx + r * 0.7, base - 2); ctx.lineTo(cx + r * 0.7, base);
    ctx.stroke();
  }

  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(416, base); ctx.lineTo(504, base);
  ctx.stroke();
}

/**
 * The pipelines that make it one process rather than five drawings: power in
 * from wind and solar, hydrogen on to synthesis, ammonia out to the quay.
 * Dashes march along the flow so the direction is readable at a glance.
 */
function drawFlow(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const phase = (frame.time % DASH_CYCLE_S) / DASH_CYCLE_S;
  const offset = -phase * DASH_PERIOD;
  ctx.strokeStyle = frame.palette.inkSoft;
  ctx.lineWidth = 1.1;
  dashed(
    ctx,
    () => {
      ctx.beginPath();
      // Wind farm → substation busbar → electrolyser.
      ctx.moveTo(296, 562); ctx.lineTo(320, 562); ctx.lineTo(320, 656);
      // PV fields → the same busbar.
      ctx.moveTo(304, 686); ctx.lineTo(320, 686);
      ctx.moveTo(304, 772); ctx.lineTo(320, 772); ctx.lineTo(320, 656);
      // Busbar → electrolyser hall.
      ctx.moveTo(320, 656); ctx.lineTo(344, 656); ctx.lineTo(344, 686);
      // Electrolyser → synthesis (hydrogen).
      ctx.moveTo(384, 696); ctx.lineTo(416, 696);
      // Synthesis → the export tank farm → the loading arms ON the quay.
      // This used to stop at x=614, dying in open land 86 units short of the
      // waterfront, so the chain never actually reached the ship.
      ctx.moveTo(504, 696); ctx.lineTo(524, 696); ctx.lineTo(524, 760);
      ctx.lineTo(616, 760);
      ctx.moveTo(660, 760); ctx.lineTo(688, 760); ctx.lineTo(688, 830);
      ctx.moveTo(688, 760); ctx.lineTo(688, 916);
      ctx.stroke();
    },
    DASH,
    offset,
  );
}

/** Import terminal storage: spheres, mirroring the export side's tankage. */
function drawContainersB(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.4;
  const base = 316;
  for (const cx of [828, 850, 872] as const) {
    const r = 8.5; // ~45 m sphere, same as the export side
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(cx, base - r - 2, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx - r, base - r - 2); ctx.lineTo(cx + r, base - r - 2);
    ctx.moveTo(cx - r * 0.7, base - 2); ctx.lineTo(cx - r * 0.7, base);
    ctx.moveTo(cx + r * 0.7, base - 2); ctx.lineTo(cx + r * 0.7, base);
    ctx.stroke();
  }
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(812, base); ctx.lineTo(888, base);
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

/** The ballast lane back, drawn lighter — present, but not the headline. */
function drawReturnLane(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.strokeStyle = frame.palette.inkSoft;
  ctx.lineWidth = 1.2;
  dashed(ctx, () => polyline(ctx, ROUTE_BACK), [3, 5]);
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
  laden: boolean,
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
  ctx.lineTo(bow - 6, -half);
  ctx.lineTo(bow, 0);
  ctx.lineTo(bow - 6, half);
  ctx.lineTo(stern, half);
  ctx.closePath();
  if (laden) {
    // Outbound with cargo: solid, so the export direction carries the weight.
    ctx.fillStyle = frame.palette.ship;
    ctx.fill();
  } else {
    // Ballast return: outline only. Same convention as an empty symbol on a
    // flow diagram — the return leg is real but carries nothing.
    ctx.fillStyle = frame.palette.land;
    ctx.fill();
    ctx.strokeStyle = frame.palette.ship;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  // Deckhouse aft + mast.
  ctx.strokeStyle = laden ? frame.palette.ink : frame.palette.ship;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(stern + 3, -half + 1.2, 5, B - 2.4);
  ctx.moveTo(stern + 10, 0);
  ctx.lineTo(stern + 13, 0);
  ctx.stroke();

  ctx.restore();
}

/**
 * Ease in and out of a berth: a vessel decelerates as it comes alongside,
 * holds while it works cargo, then accelerates away. `smoothstep` on the
 * outer thirds of each leg, linear in the middle.
 */
function berthEase(u: number): number {
  const ramp = 0.18; // fraction of the leg spent slowing / speeding up
  if (u < ramp) {
    const k = u / ramp;
    return ramp * k * k * (3 - 2 * k);
  }
  if (u > 1 - ramp) {
    const k = (1 - u) / ramp;
    return 1 - ramp * k * k * (3 - 2 * k);
  }
  return u;
}

/**
 * The fleet, on a continuous circuit: laden along the corridor, then back in
 * ballast down the return lane.
 *
 * Each cycle is [sail out | alongside at B | sail back | alongside at A], so a
 * vessel actually arrives, stops at the quay and turns, rather than sliding
 * through the berth and reappearing. The dwell is what makes it read as a
 * port call.
 */
function drawFleet(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  if (!routePath || !returnPath) return;
  const SAIL = 0.42; // of the cycle, each way
  const DWELL = 0.08; // alongside, each end

  for (const offset of SHIP_OFFSETS) {
    const cycle = ((frame.time + offset) % VOYAGE_S) / VOYAGE_S;
    let path = routePath;
    let u: number;
    let laden: boolean;

    if (cycle < SAIL) {
      // Outbound, loaded.
      path = routePath;
      u = berthEase(cycle / SAIL);
      laden = true;
    } else if (cycle < SAIL + DWELL) {
      // Alongside at the import terminal, discharging.
      path = routePath;
      u = 1;
      laden = cycle < SAIL + DWELL * 0.5; // cargo comes off part-way through
    } else if (cycle < SAIL * 2 + DWELL) {
      // Home in ballast.
      path = returnPath;
      u = berthEase((cycle - SAIL - DWELL) / SAIL);
      laden = false;
    } else {
      // Alongside at the export quay, loading.
      path = returnPath;
      u = 1;
      laden = cycle > SAIL * 2 + DWELL + DWELL * 0.5;
    }

    const { x, y, angle } = poseAt(path, u);
    drawVessel(ctx, frame, x, y, angle, laden);
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
  ctx.translate(726, 560);
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
  ctx.translate(60, 170);
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
  // Leader geometry, and why it is written this way: the label sits BELOW its
  // subject and the leader drops to a point just above the text's cap height,
  // never alongside or through it. The earlier elbow ran horizontally at the
  // baseline from the subject's x back to the label's x — which, whenever the
  // label sat under the subject, traversed the whole string and rendered as a
  // strikethrough. A vertical drop cannot cross its own label.
  const capTop = toY - 11; // clear of the 12px glyphs' cap height
  const textX = anchor === "start" ? toX : toX;

  ctx.strokeStyle = frame.palette.inkSoft;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(fromX, capTop - 4);
  // A short foot toward the label, stopping short of the first glyph.
  ctx.lineTo(anchor === "start" ? textX + 3 : textX - 3, capTop - 4);
  ctx.stroke();
  // Tick at the subject end, so the leader clearly originates somewhere.
  ctx.beginPath();
  ctx.moveTo(fromX - 3, fromY); ctx.lineTo(fromX + 3, fromY);
  ctx.stroke();

  ctx.fillStyle = frame.palette.label;
  monoLabel(ctx, text, textX, toY, frame.font, { anchor });
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
    returnPath = measure(ROUTE_BACK);
  },

  draw(ctx, frame) {
    drawGraticule(ctx, frame);
    drawShores(ctx, frame);
    drawQuayTicks(ctx, frame);

    // --- Production shore, in process order: generation → conversion → export
    drawWindFarm(ctx, frame);
    drawPvArray(ctx, frame);
    drawFlow(ctx, frame);
    drawElectrolyser(ctx, frame);
    drawSynthesis(ctx, frame);
    drawExportTerminal(ctx, frame);
    drawGantry(ctx, frame, 700, 830, 1);
    drawGantry(ctx, frame, 700, 916, 1);

    caption(ctx, frame, "[ WIND ]", 70, 570, 62, 600);
    caption(ctx, frame, "[ PV ARRAY ]", 70, 794, 62, 826);
    caption(ctx, frame, "[ ELECTROLYSIS ]", 350, 706, 342, 748);
    caption(ctx, frame, "[ NH3 SYNTHESIS ]", 452, 706, 444, 786);
    ctx.fillStyle = frame.palette.label;
    monoLabel(ctx, "[ PECEM · BR ]", 62, 340, frame.font);

    // --- Destination shore --------------------------------------------------
    drawContainersB(ctx, frame);
    drawGantry(ctx, frame, 790, 330, -1);
    drawGantry(ctx, frame, 790, 246, -1);
    ctx.fillStyle = frame.palette.label;
    monoLabel(ctx, "[ ROTTERDAM · NL ]", 878, 66, frame.font, { anchor: "end" });

    // --- The corridor -------------------------------------------------------
    drawReturnLane(ctx, frame);
    drawRoute(ctx, frame);
    drawWaypoints(ctx, frame);
    ctx.fillStyle = frame.palette.label;
    monoLabel(ctx, "4600 NM", 700, 430, frame.font);

    drawFleet(ctx, frame);
    drawSeaMarks(ctx, frame);
    drawCompass(ctx, frame);
    drawScaleBar(ctx, frame);
  },
};
