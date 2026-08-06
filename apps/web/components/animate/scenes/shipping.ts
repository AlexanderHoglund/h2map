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
/** Ocean graticule: a fine mesh rather than a few widely-spaced rules. */
const GRID_STEP = 50;

/**
 * Production shore: enlarged to carry the whole chain — wind and solar
 * generation inland, electrolysis and synthesis mid-shore, then the export
 * quay. The sea is now just the corridor between the two coasts, because the
 * story is the process, not the ocean.
 */
export const SHORE_A: readonly Point[] = [
  [0, 300], [250, 300], [250, 360], [420, 360],
  [420, 470], [600, 470], [600, 640], [700, 640],
  [700, 1000], [0, 1000],
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
  [712, 900], [712, 820], [770, 760], [770, 560],
  [840, 500], [840, 392], [800, 342], [760, 342],
];
/**
 * Ballast, the return leg. Offset from the laden track so the two are legible
 * as separate lanes — the convention on a real routeing chart, and it stops
 * the outbound and inbound vessels from overrunning each other.
 */
export const ROUTE_BACK: readonly Point[] = [
  [760, 342], [716, 342], [716, 420], [740, 470],
  [740, 700], [730, 800], [730, 880], [712, 930], [712, 900],
];
const WAYPOINTS: readonly Point[] = [[770, 760], [770, 560], [840, 500], [840, 392]];
const SEA_MARKS: readonly Point[] = [[868, 640]];

// --- motion, matching globals.css:56-76 exactly -----------------------------
const DASH: readonly number[] = [7, 5];
/** 7 + 5: the CSS animates dashoffset to -24, i.e. two whole periods. */
const DASH_PERIOD = 12;
const DASH_CYCLE_S = 1.6;
/** Rotterdam's distribution road: import quay to the east frame edge. */
const ROAD_B_X = 856;
const ROAD_B_NORTH = 0; // the outer border — trucks fade out here
const ROAD_B_SOUTH = 274; // stops on the apron, short of the y=330 coast
/** One round trip on the northern road. */
const HAUL_B_S = 52;
const TRUCKS_B: readonly (readonly [offset: number, kind: CargoKind])[] = [
  [0, "container"],
  [13, "bulk"],
  [26, "container"],
  [39, "bulk"],
];

/** The inland road: west frame edge to the port apron, and back. */
const ROAD_Y = 936;
const ROAD_WEST = 0; // the outer border — trucks fade out here
const ROAD_EAST = 640; // the container apron behind the berths
/**
 * One round trip: out to the port loaded, back empty (or vice versa).
 *
 * Slow on purpose. The road is ~640 units end to end, so a shorter cycle has
 * trucks crossing the whole hinterland in a couple of seconds, which reads as
 * scurrying rather than hauling. At 60 s a truck moves about 21 units/second —
 * slower than the fleet, which is right: the ships cover an ocean in their
 * 36 s circuit, the trucks only cross a shore.
 */
const HAUL_S = 60;
/**
 * Six trucks, evenly spread so the road is busy but never a convoy, and
 * carrying both trades — the road feeds a container berth and a bulk berth,
 * so a yard of nothing but boxes would only tell half the story.
 */
const TRUCKS: readonly (readonly [offset: number, kind: CargoKind])[] = [
  [0, "container"],
  [10, "bulk"],
  [20, "container"],
  [30, "bulk"],
  [40, "container"],
  [50, "bulk"],
];

/**
 * One crane cycle: traverse out over the hold, lower, lift, traverse back,
 * land it on the apron. Slow enough to follow — a real move takes minutes.
 */
export const CRANE_S = 9;

/**
 * The phase of a crane cycle at which the spreader is at the bottom of its
 * arc — the instant the load is set down or picked up.
 *
 * Both the crane and the vessel read this, so the hull changes colour on the
 * exact frame the box touches the deck. Previously each ran on its own clock:
 * the crane released at 0.375 of a 9 s cycle while the ship flipped at the
 * midpoint of a 36 s dwell, so the cargo and the colour were unrelated.
 */
export const CRANE_TOUCH = 0.375;
/** Stagger of the crane that works the export berth (must match the draw call). */
export const EXPORT_CRANE_STAGGER = 0; // = BERTH_CARGO.container
/**
 * A terminal handles each trade at its own berth, because the machines are
 * not interchangeable: a container crane lifts a box with a spreader, a bulk
 * crane swings a grab. So the fleet splits — boxboats to the container berth,
 * bulk carriers to the bulk berth — and each crane only works when its own
 * kind of ship is alongside.
 */
const BERTH_CARGO: Readonly<Record<CargoKind, number>> = {
  container: 0,
  bulk: 4.1,
};
/** Stagger of the crane that works the import berth. */
const IMPORT_CRANE_STAGGER = 2.3;
/** Phase of the matching touch when landing on the apron. */
const CRANE_TOUCH_LAND = 0.825;

/** Cycle phase for a crane with the given stagger, at a given time. */
function cranePhaseAt(time: number, stagger: number): number {
  return ((time + stagger) % CRANE_S) / CRANE_S;
}

/**
 * How many loads a crane has landed on the ship since it berthed — used to
 * decide whether the vessel is carrying cargo yet.
 */
export function loadsSince(time: number, since: number, stagger: number): number {
  if (time <= since) return 0;
  const firstTouch = Math.ceil((since + stagger) / CRANE_S - CRANE_TOUCH);
  const lastTouch = Math.floor((time + stagger) / CRANE_S - CRANE_TOUCH);
  return Math.max(0, lastTouch - firstTouch + 1);
}

/**
 * Is a vessel alongside the export quay at this moment?
 *
 * The cranes ask this before reaching out, so they only work a ship that is
 * actually there. Mirrors the leg boundaries in drawFleet — with SAIL 0.33 and
 * DWELL 0.17 the second dwell runs from SAIL*2 + DWELL to the end of the cycle.
 */
function berthOccupied(time: number, kind?: CargoKind): boolean {
  const SAIL = 0.33;
  const DWELL = 0.17;
  for (const [offset, shipKind] of FLEET) {
    if (kind && shipKind !== kind) continue;
    const cycle = ((time + offset) % VOYAGE_S) / VOYAGE_S;
    if (cycle >= SAIL * 2 + DWELL) return true;
  }
  return false;
}

/**
 * Where a vessel lies at the export quay, and where its deck sits.
 *
 * The crane derives its seaward reach and hoist depth from THESE numbers, so
 * the spreader lands on the hatch instead of somewhere near it. Previously
 * the two were positioned independently and the spreader came down 25 units
 * east of the hull — a crane loading open water.
 */
export const BERTH_A = { x: 712, y: 900 } as const;
/** Container ships lie at the northern berth, bulk carriers at the southern. */
export const BERTH_CONTAINER = { x: 712, y: 878 } as const;
export const BERTH_BULK = { x: 712, y: 926 } as const;
/** Deck height above the waterline, in design units. */
const DECK_RISE = 3;

/**
 * What each vessel carries. The corridor exports ammonia in bulk, but a
 * working port is mixed traffic, so half the fleet are boxboats.
 */
type CargoKind = "bulk" | "container";
const FLEET: readonly (readonly [offset: number, kind: CargoKind])[] = [
  [0, "bulk"],
  [9, "container"],
  [18, "bulk"],
  [27, "container"],
];

/** One full circuit: out laden, back in ballast. */
export const VOYAGE_S = 36;

/** Precomputed once in setup(); the fleet needs arc length, not vertices. */
let routePath: MeasuredPath | null = null;
let returnPath: MeasuredPath | null = null;

// ===== Graticule ============================================================
function gridLines(
  ctx: CanvasRenderingContext2D,
  wavy: boolean,
  time: number,
): void {
  // One mesh, drawn two ways. On land the lines are straight — it is a survey
  // grid over solid ground. At sea they undulate, which is the chart-maker's
  // shorthand for water and costs nothing but a sine.
  // Small, tight ripples rather than long swells: the eye should still read a
  // straight grid, with the water texture legible only up close. A long
  // wavelength makes the mesh look bent, which loses the chart impression.
  const AMP = 0.9;
  const WAVELENGTH = 13;
  const DRIFT = 4; // units per second the pattern slides
  const STEP = 2; // short segments, so a tight curve stays smooth

  ctx.beginPath();
  for (let y = GRID_STEP; y < 1000; y += GRID_STEP) {
    if (!wavy) {
      ctx.moveTo(0, y);
      ctx.lineTo(900, y);
      continue;
    }
    for (let x = 0; x <= 900; x += STEP) {
      const wy = y + Math.sin((x + time * DRIFT) / WAVELENGTH) * AMP;
      if (x === 0) ctx.moveTo(x, wy);
      else ctx.lineTo(x, wy);
    }
  }
  for (let x = GRID_STEP; x < 900; x += GRID_STEP) {
    if (!wavy) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 1000);
      continue;
    }
    for (let y = 0; y <= 1000; y += STEP) {
      const wx = x + Math.sin((y + time * DRIFT) / WAVELENGTH) * AMP;
      if (y === 0) ctx.moveTo(wx, y);
      else ctx.lineTo(wx, y);
    }
  }
  ctx.stroke();
}

/** The sea mesh: wavy, and drawn under everything else. */
function drawSeaGrid(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 0.35;
  ctx.globalAlpha = 0.45;
  gridLines(ctx, true, frame.time);
  ctx.globalAlpha = 1;
}

/**
 * The land mesh: straight, and clipped to the shores so it stops exactly at
 * the coastline. Drawn after the landmasses, which would otherwise cover it.
 */
function drawLandGrid(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.save();
  ctx.beginPath();
  for (const shore of [SHORE_A, SHORE_B]) {
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
  ctx.globalAlpha = 0.32; // a touch fainter: the land carries more linework
  gridLines(ctx, false, frame.time);
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ===== Land =================================================================
function drawShores(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  shape(ctx, SHORE_A, frame.palette.land, frame.palette.ink, 1.5);
  shape(ctx, SHORE_B, frame.palette.land, frame.palette.ink, 1.5);
}

function drawQuayTicks(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.5;
  ticks(ctx, 700, [790, 820, 850, 880, 910], 8);
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
  cranePhase = 0,
  /** The vessel this crane works. Omitted = a crane with no ship alongside. */
  berth?: { readonly x: number; readonly y: number },
  /** Which trade this machine handles; it idles when the other kind is in. */
  handles?: CargoKind,
): void {
  // A crane on an east-west quay is the same machine rotated a quarter turn.
  // Draw it in the canonical orientation and let the transform place it,
  // rather than maintaining two sets of coordinates that can drift apart.

  // Lessons from three attempts, all of which read as buildings:
  //  - anything drawn ABOVE the boom (pylon, stays) makes a roofline;
  //  - a horizontal tie between the legs closes a box and makes a shed.
  // So: no superstructure and no closed rectangle. A ship-to-shore crane in
  // elevation is essentially an inverted L — tall A-frame legs carrying one
  // long boom that cantilevers out over the water, with the hoist hanging
  // from it. The cantilever IS the silhouette; keep it unobstructed.
  // Sized from a real ship-to-shore crane at the shore scale (1 u ≈ 8 m, x3):
  // 30 m rail gauge, 60 m to the boom, 55 m seaward reach, 30 m backreach.
  const legFore = quayX - dir * 10;
  const legBack = quayX - dir * 33;
  const apexFore = quayX - dir * 16;
  const apexBack = quayX - dir * 27;
  const beam = groundY - 44;
  const boomTip = quayX + dir * 40;
  const backTip = quayX - dir * 54;
  // The working cycle, as a phase in [0,1):
  //   0.00-0.30  traverse seaward with an empty spreader
  //   0.30-0.45  lower into the hold and take the load
  //   0.45-0.75  traverse landward, loaded
  //   0.75-0.90  lower onto the apron and release
  //   0.90-1.00  hoist back up, empty
  // No ship alongside: park the trolley over the apron with the spreader up,
  // rather than miming a load into empty water.
  const working = berth ? berthOccupied(frame.time, handles) : true;
  const phase = working ? cranePhaseAt(frame.time, cranePhase) : 0.95;
  // Reach out to the vessel's centreline, not an arbitrary distance.
  const overShip = berth ? berth.x : quayX + dir * 37;
  const overApron = quayX - dir * 38;
  let travel: number; // 0 = over the apron, 1 = over the ship
  let drop: number; // 0 = hoisted up, 1 = down at the load
  let holding: boolean;
  if (phase < 0.3) {
    travel = phase / 0.3;
    drop = 0;
    holding = false;
  } else if (phase < 0.45) {
    travel = 1;
    drop = Math.sin(((phase - 0.3) / 0.15) * Math.PI); // down and back up
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
  // Lowering stops at the deck when working a ship, at the apron otherwise —
  // so a container is released where there is something to receive it.
  const restY = beam + 8;
  const seaDeckY = (berth ? berth.y : groundY) - DECK_RISE;
  const landStackY = groundY - 12;
  const targetY = travel > 0.5 ? seaDeckY : landStackY;
  const spreader = restY + drop * (targetY - restY);

  ctx.strokeStyle = frame.palette.ink;

  // Ground.
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(legBack - dir * 56, groundY); ctx.lineTo(quayX, groundY);
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
  if (handles === "bulk") {
    // A clamshell grab: two jaws, open on the way out, closed on the load.
    const jaw = holding ? 3.5 : 7;
    ctx.beginPath();
    ctx.moveTo(trolley - 7, spreader);
    ctx.lineTo(trolley, spreader + 2);
    ctx.lineTo(trolley + 7, spreader);
    ctx.moveTo(trolley - jaw, spreader + 2);
    ctx.lineTo(trolley - jaw * 0.4, spreader + 7);
    ctx.lineTo(trolley + jaw * 0.4, spreader + 7);
    ctx.lineTo(trolley + jaw, spreader + 2);
    ctx.stroke();
    if (holding) {
      ctx.fillStyle = frame.palette.ink;
      ctx.beginPath();
      ctx.moveTo(trolley - 2.6, spreader + 3);
      ctx.lineTo(trolley + 2.6, spreader + 3);
      ctx.lineTo(trolley, spreader + 7);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    box(ctx, trolley - 6, spreader, 12, 3.4, frame.palette.land);
    if (holding) {
      // The container under the spreader — the thing actually being moved.
      ctx.fillStyle = frame.palette.land;
      ctx.beginPath();
      ctx.rect(trolley - 7, spreader + 3.4, 14, 5);
      ctx.fill();
      ctx.stroke();
    }
  }
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
    ctx.fillStyle = frame.palette.land;
    ctx.fill();
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
    [128, 500, 34, 0.0, 0.22],
    [186, 500, 32, 1.7, 0.19],
    [244, 500, 36, 3.1, 0.25],
    [302, 500, 33, 5.0, 0.20],
    [157, 566, 30, 2.3, 0.17],
    [215, 566, 31, 0.8, 0.21],
    [273, 566, 28, 4.4, 0.24],
    [331, 566, 30, 2.9, 0.18],
  ];
  for (const [x, y, h, phase, spin] of rows) drawTurbine(ctx, frame, x, y, h, phase, spin);
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(108, 500); ctx.lineTo(358, 500);
  ctx.moveTo(137, 566); ctx.lineTo(387, 566);
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
    [122, 668, 92, 6],
    [228, 668, 92, 6],
    [122, 740, 92, 5],
    [228, 740, 92, 5],
  ];
  for (const [bx, by, bw, rows] of blocks) {
    // Parcel first — it is an opaque plate that masks the background mesh, so
    // it has to go down BEFORE the rows or it paints over them.
    ctx.lineWidth = 1.2;
    box(ctx, bx - 6, by - 5, bw + 12, rows * 6.6 + 4, frame.palette.land);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (let r = 0; r < rows; r += 1) {
      const y = by + r * 3.3 * 2;
      ctx.moveTo(bx, y + 1.5);
      ctx.lineTo(bx + bw, y + 1.5); // a row of panels, seen near-edge on
    }
    ctx.stroke();
  }
}

/**
 * Desalination plant, on the coast north of the works.
 *
 * Sited against the shoreline because that is what dictates its position in
 * reality: it draws seawater. The intake runs out through the coast, the
 * pressure vessels sit in banks, and the product water heads inland to the
 * electrolyser — which is why the plant is here at all, since an electrolyser
 * needs fresh water and the sea is the only source on this shore.
 */
function drawDesalination(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const base = 560; // ground line
  ctx.strokeStyle = frame.palette.ink;

  // Banks of RO pressure vessels: long horizontal tubes, stacked in racks.
  for (let rack = 0; rack < 2; rack += 1) {
    const ry = base - 31 + rack * 16;
    box(ctx, 478, ry, 49, 9, frame.palette.land);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (let i = 1; i < 4; i += 1) {
      ctx.moveTo(478, ry + i * 2.25);
      ctx.lineTo(527, ry + i * 2.25);
    }
    ctx.stroke();
    ctx.lineWidth = 1.2;
  }

  // Clearwater tank beside the racks.
  ctx.lineWidth = 1.3;
  box(ctx, 534, base - 22, 17, 22, frame.palette.land);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(534, base - 17);
  ctx.lineTo(551, base - 17);
  ctx.stroke();

  // Ground line.
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(472, base);
  ctx.lineTo(558, base);
  ctx.stroke();

  // Intake and brine outfall, crossing the coast into the sea. Dashed like
  // the other process lines, so they read as pipework rather than structure.
  ctx.strokeStyle = frame.palette.inkSoft;
  ctx.lineWidth = 1.1;
  dashed(
    ctx,
    () => {
      ctx.beginPath();
      ctx.moveTo(558, base - 11);
      ctx.lineTo(624, base - 11); // intake, out past the shoreline
      ctx.moveTo(558, base - 4);
      ctx.lineTo(612, base - 4); // brine return
      ctx.stroke();
    },
    [3, 3],
  );
  // Intake head in the water.
  ctx.lineWidth = 1;
  ctx.strokeStyle = frame.palette.ink;
  ctx.beginPath();
  ctx.moveTo(621, base - 14);
  ctx.lineTo(628, base - 14);
  ctx.lineTo(628, base - 8);
  ctx.lineTo(621, base - 8);
  ctx.stroke();
}

/** Electrolyser hall: a stack module block, the heart of the chain. */
function drawElectrolyser(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const x = 402;
  const y = 686;
  const w = 40; // ~110 m hall
  const d = 17; // ~45 m deep
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.4;
  box(ctx, x, y, w, d, frame.palette.land);
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
  box(ctx, x + 4, y - 22, w - 8, 15, frame.palette.land);
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
  box(ctx, 482, base - 15, 5, 15, frame.palette.land);
  box(ctx, 491, base - 15, 5, 15, frame.palette.land);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(482, base - 15); ctx.lineTo(487, base);
  ctx.moveTo(487, base - 15); ctx.lineTo(482, base);
  ctx.moveTo(491, base - 15); ctx.lineTo(496, base);
  ctx.moveTo(496, base - 15); ctx.lineTo(491, base);
  ctx.stroke();

  // Flare stack, ~60 m — the tallest thing in the works after the turbines.
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(562, base); ctx.lineTo(562, base - 22); ctx.lineTo(509, base - 22);
  ctx.stroke();

  // Storage spheres, ~45 m across, on their skirts.
  for (const [cx, r] of [[500, 8.5], [522, 8.5]] as const) {
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(cx, base - r - 2, r, 0, Math.PI * 2);
    ctx.fillStyle = frame.palette.land;
    ctx.fill();
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
  ctx.moveTo(458, base); ctx.lineTo(562, base);
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
      ctx.moveTo(354, 562); ctx.lineTo(378, 562); ctx.lineTo(378, 656);
      // PV fields → the same busbar.
      ctx.moveTo(362, 686); ctx.lineTo(378, 686);
      ctx.moveTo(362, 772); ctx.lineTo(378, 772); ctx.lineTo(378, 656);
      // Desalination → electrolyser: the fresh water the stacks consume.
      ctx.moveTo(504, 560); ctx.lineTo(504, 620); ctx.lineTo(392, 620);
      ctx.lineTo(392, 686);
      // Busbar → electrolyser hall.
      ctx.moveTo(378, 656); ctx.lineTo(402, 656); ctx.lineTo(402, 686);
      // Electrolyser → synthesis (hydrogen).
      ctx.moveTo(442, 696); ctx.lineTo(474, 696);
      // Synthesis → the export tank farm → the loading arms ON the quay.
      // This used to stop at x=614, dying in open land 86 units short of the
      // waterfront, so the chain never actually reached the ship.
      // Synthesis outlet -> export tank farm -> loading arms at both berths.
      // Starts at the plant's own edge (x=504); it used to begin at x=562,
      // 58 units east of anything, so the last link floated in empty land.
      ctx.moveTo(504, 696); ctx.lineTo(540, 696); ctx.lineTo(540, 760);
      ctx.lineTo(621, 760);
      ctx.moveTo(673, 760); ctx.lineTo(688, 760);
      ctx.moveTo(688, 760); ctx.lineTo(688, 874);
      ctx.moveTo(688, 760); ctx.lineTo(688, 930);
      ctx.stroke();
    },
    DASH,
    offset,
  );
}

/**
 * A row of container stacks standing ON a ground line.
 *
 * The base of the lowest box sits exactly at `groundY` and the stack grows
 * upward — the road-side yard used to be drawn from the line downward, so its
 * boxes hung underneath it. Boxes touch (pitch == height) rather than floating
 * 0.2 apart, which at this scale read as a gap.
 */
const BOX_W = 5.4;
const BOX_H = 2.4;

function containerStacks(
  ctx: CanvasRenderingContext2D,
  frame: Frame<Ink>,
  x: number,
  groundY: number,
  columns: number,
  heightAt: (col: number) => number,
): void {
  ctx.lineWidth = 0.9;
  for (let col = 0; col < columns; col += 1) {
    const stack = heightAt(col);
    for (let r = 0; r < stack; r += 1) {
      box(ctx, x + col * (BOX_W + 1), groundY - (r + 1) * BOX_H, BOX_W, BOX_H, frame.palette.land);
    }
  }
}

/**
 * The inland road and its container apron. The road leaves the frame at the
 * west border, so the corridor visibly connects to a hinterland rather than
 * beginning nowhere.
 */
function drawRoad(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(ROAD_WEST, ROAD_Y - 9);
  ctx.lineTo(ROAD_EAST + 20, ROAD_Y - 9);
  ctx.moveTo(ROAD_WEST, ROAD_Y + 9);
  ctx.lineTo(ROAD_EAST + 20, ROAD_Y + 9);
  ctx.stroke();
  // Centre line, dashed like a carriageway marking.
  ctx.lineWidth = 0.8;
  dashed(
    ctx,
    () => {
      ctx.beginPath();
      ctx.moveTo(ROAD_WEST, ROAD_Y);
      ctx.lineTo(ROAD_EAST + 20, ROAD_Y);
      ctx.stroke();
    },
    [10, 10],
  );

  // The apron: boxes waiting to be lifted, beside the berths.
  // The apron: stacked boxes between the road and the berths, plus a spur
  // up to the quay so the road visibly serves the ship.
  // TWO tiers of storage, which is how a terminal actually works:
  //
  //  1. the road-side yard, where trucks tip and drop — the bulk of the stock;
  //  2. small quayside stacks directly under each crane, the ready pile the
  //     machine is actually working from.
  //
  // Without the second tier the cranes appear to lift out of nowhere; without
  // the first, the road delivers to nothing.

  // --- 1. Road-side yard -------------------------------------------------
  containerStacks(ctx, frame, ROAD_EAST - 66, ROAD_Y - 22, 7, (col) => (col % 3) + 1);
  for (const [px, w, h] of [[ROAD_EAST - 158, 26, 11], [ROAD_EAST - 124, 20, 9]] as const) {
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, ROAD_Y - 22);
    ctx.lineTo(px + w / 2, ROAD_Y - 22 - h);
    ctx.lineTo(px + w, ROAD_Y - 22);
    ctx.closePath();
    ctx.fillStyle = frame.palette.land;
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let i = 1; i < 4; i += 1) {
      const t = i / 4;
      ctx.moveTo(px + (w / 2) * t, ROAD_Y - 22 - h * t);
      ctx.lineTo(px + w - (w / 2) * t, ROAD_Y - 22 - h * t);
    }
    ctx.stroke();
  }
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(ROAD_EAST - 162, ROAD_Y - 22);
  ctx.lineTo(ROAD_EAST - 20, ROAD_Y - 22);
  ctx.stroke();

  // --- 2. Ready piles under the cranes -----------------------------------
  // Small, and landward of each berth, so the trolley visibly picks up from
  // them on its way out to the ship.
  const CONTAINER_YARD_Y = BERTH_CONTAINER.y - 28;
  const BULK_YARD_Y = BERTH_BULK.y + 32;

  containerStacks(ctx, frame, 636, CONTAINER_YARD_Y + 2.4, 4, (col) => (col % 2) + 1);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(632, CONTAINER_YARD_Y + 2.4);
  ctx.lineTo(668, CONTAINER_YARD_Y + 2.4);
  ctx.stroke();

  for (const [px, w, h] of [[638, 18, 8], [662, 14, 6]] as const) {
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, BULK_YARD_Y);
    ctx.lineTo(px + w / 2, BULK_YARD_Y - h);
    ctx.lineTo(px + w, BULK_YARD_Y);
    ctx.closePath();
    ctx.fillStyle = frame.palette.land;
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let i = 1; i < 3; i += 1) {
      const t = i / 3;
      ctx.moveTo(px + (w / 2) * t, BULK_YARD_Y - h * t);
      ctx.lineTo(px + w - (w / 2) * t, BULK_YARD_Y - h * t);
    }
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(634, BULK_YARD_Y);
  ctx.lineTo(680, BULK_YARD_Y);
  ctx.stroke();

  // Haul route from the road-side yard up to the quayside piles.
  ctx.lineWidth = 0.9;
  dashed(
    ctx,
    () => {
      ctx.beginPath();
      ctx.moveTo(ROAD_EAST - 40, ROAD_Y - 22);
      ctx.lineTo(640, ROAD_Y - 22);
      ctx.lineTo(640, BULK_YARD_Y + 4);
      ctx.stroke();
    },
    [4, 4],
  );
}

/**
 * A truck in plan: tractor unit plus a container on the trailer when loaded.
 * `dir` is +1 heading east (to the port), -1 heading west (leaving).
 */
function drawTruck(
  ctx: CanvasRenderingContext2D,
  frame: Frame<Ink>,
  x: number,
  y: number,
  dir: 1 | -1,
  loaded: boolean,
  fade: number,
  kind: CargoKind,
): void {
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(x, y);
  ctx.scale(dir, 1);

  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 0.9;
  box(ctx, 4, -2.4, 4, 4.8, frame.palette.land); // tractor unit
  ctx.beginPath();
  ctx.moveTo(-9, 2.4);
  ctx.lineTo(4, 2.4); // trailer bed
  ctx.stroke();
  if (loaded) {
    if (kind === "bulk") {
      // A tipper body: sloped front, heaped load — never a square box.
      ctx.fillStyle = frame.palette.land;
      ctx.beginPath();
      ctx.moveTo(-9, 2.4);
      ctx.lineTo(-9, -1);
      ctx.lineTo(-6, -2.6);
      ctx.lineTo(1, -2.6);
      ctx.lineTo(3, 2.4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = frame.palette.land;
      ctx.beginPath();
      ctx.rect(-9, -2.2, 12, 4.6);
      ctx.fill();
      ctx.stroke();
    }
  } else if (kind === "bulk") {
    // Empty tipper: the body is still there, just not heaped.
    ctx.beginPath();
    ctx.moveTo(-9, 2.4);
    ctx.lineTo(-9, 0);
    ctx.moveTo(3, 2.4);
    ctx.lineTo(3, 0);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Trucks shuttling boxes between the hinterland and the quay: out loaded,
 * turn at the apron, back with a box picked up there — the same two-way
 * exchange the sea corridor runs.
 *
 * They fade over the last stretch before the west border rather than winking
 * out at it, which is what leaving the frame should look like.
 */
function drawTrucks(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const span = ROAD_EAST - ROAD_WEST;
  const FADE = 90; // units over which a truck dissolves at the border

  for (const [offset, kind] of TRUCKS) {
    const cycle = ((frame.time + offset) % HAUL_S) / HAUL_S;
    const outbound = cycle < 0.5;
    const u = outbound ? cycle * 2 : 1 - (cycle - 0.5) * 2;
    const x = ROAD_WEST + span * u;
    // Outbound in the north lane, inbound in the south, so the directions
    // never overlap — as on a real carriageway.
    const y = ROAD_Y + (outbound ? -4.5 : 4.5);
    const fade = Math.min(1, (x - ROAD_WEST) / FADE);
    if (fade <= 0.02) continue;
    drawTruck(ctx, frame, x, y, outbound ? 1 : -1, outbound, fade, kind);
  }
}

/**
 * Rotterdam's landside: the distribution road out to the hinterland, and the
 * yards that feed it. The export end has generation to explain where the
 * cargo comes from; the import end is purely a port, so it gets port and road
 * infrastructure instead of turbines it would never have.
 */
function drawImportRoad(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(ROAD_B_X - 9, ROAD_B_NORTH);
  ctx.lineTo(ROAD_B_X - 9, ROAD_B_SOUTH);
  ctx.moveTo(ROAD_B_X + 9, ROAD_B_NORTH);
  ctx.lineTo(ROAD_B_X + 9, ROAD_B_SOUTH);
  ctx.stroke();
  ctx.lineWidth = 0.8;
  dashed(
    ctx,
    () => {
      ctx.beginPath();
      ctx.moveTo(ROAD_B_X, ROAD_B_NORTH);
      ctx.lineTo(ROAD_B_X, ROAD_B_SOUTH);
      ctx.stroke();
    },
    [10, 10],
  );

  // Warehousing along the road — the shed roofs of a distribution park.
  ctx.lineWidth = 1;
  for (const [wy, h] of [[92, 26], [132, 20], [166, 24]] as const) {
    box(ctx, 700, wy, 44, h, frame.palette.land);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (let i = 1; i < 4; i += 1) {
      ctx.moveTo(700 + i * 11, wy);
      ctx.lineTo(700 + i * 11, wy + h);
    }
    ctx.stroke();
    ctx.lineWidth = 1;
    // Apron in front of each shed, joining the road.
    ctx.beginPath();
    ctx.moveTo(744, wy + h / 2);
    ctx.lineTo(ROAD_B_X - 9, wy + h / 2);
    ctx.stroke();
  }

  // Import container yard, landward of the berth.
  containerStacks(ctx, frame, 796, 250.4, 6, (col) => (col % 3) + 1);
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(792, 250.4);
  ctx.lineTo(840, 250.4);
  ctx.stroke();
}

/** Trucks on Rotterdam's road: in loaded from the quay, back out empty. */
function drawImportTrucks(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const span = ROAD_B_SOUTH - ROAD_B_NORTH;
  const FADE = 70;
  for (const [offset, kind] of TRUCKS_B) {
    const cycle = ((frame.time + offset) % HAUL_B_S) / HAUL_B_S;
    const outbound = cycle < 0.5; // heading north, away from the quay
    const u = outbound ? 1 - cycle * 2 : (cycle - 0.5) * 2;
    const y = ROAD_B_NORTH + span * u;
    const x = ROAD_B_X + (outbound ? -4.5 : 4.5);
    const fade = Math.min(1, (y - ROAD_B_NORTH) / FADE);
    if (fade <= 0.02) continue;
    // The road runs north-south, so the truck is drawn rotated a quarter turn.
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(outbound ? -Math.PI / 2 : Math.PI / 2);
    drawTruck(ctx, frame, 0, 0, 1, outbound, fade, kind);
    ctx.restore();
  }
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
    ctx.fillStyle = frame.palette.land;
    ctx.fill();
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
  kind: CargoKind,
): void {
  // Bulk carriers are the bigger, beamier hull; boxboats sit a little finer.
  const L = kind === "bulk" ? 26 : 22;
  const B = kind === "bulk" ? 8 : 7;
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
  if (kind === "bulk") {
    // Hatch covers down the deck — the bulk carrier's giveaway from above.
    ctx.beginPath();
    for (let i = 0; i < 4; i += 1) {
      const hx = stern + 6 + i * 4.2;
      ctx.rect(hx, -half + 1.2, 3, B - 2.4);
    }
    ctx.stroke();
  } else if (laden) {
    // Container rows: two lines of boxes on deck.
    ctx.beginPath();
    for (let i = 0; i < 5; i += 1) {
      const cx = stern + 5 + i * 2.8;
      ctx.rect(cx, -half + 1, 2.2, B - 2);
    }
    ctx.stroke();
  }

  // Deckhouse aft + mast, on both types.
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(stern + 1.5, -half + 1.2, 3.5, B - 2.4);
  ctx.moveTo(stern + 7, 0);
  ctx.lineTo(stern + 9, 0);
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
  const SAIL = 0.33; // of the cycle, each way
  const DWELL = 0.17; // alongside, each end — long enough to work cargo

  for (const [offset, kind] of FLEET) {
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
      // Alongside at the import terminal, discharging. The hull goes from
      // loaded to empty on the frame the crane lifts the last box clear —
      // not on a timer of its own.
      path = routePath;
      u = 1;
      const arrived = frame.time - (cycle - SAIL) * VOYAGE_S;
      laden = loadsSince(frame.time, arrived, IMPORT_CRANE_STAGGER) === 0;
    } else if (cycle < SAIL * 2 + DWELL) {
      // Home in ballast.
      path = returnPath;
      u = berthEase((cycle - SAIL - DWELL) / SAIL);
      laden = false;
    } else {
      // Alongside at the export quay, loading. Empty until the crane sets the
      // first box down on the deck; red from that exact frame.
      path = returnPath;
      u = 1;
      const arrived = frame.time - (cycle - (SAIL * 2 + DWELL)) * VOYAGE_S;
      laden = loadsSince(frame.time, arrived, BERTH_CARGO[kind]) > 0;
    }

    let { x, y } = poseAt(path, u);
    const { angle } = poseAt(path, u);
    // Alongside at the export quay, each trade lies at its own berth rather
    // than every ship stacking on the same point.
    if (cycle >= SAIL * 2 + DWELL) {
      const berth = kind === "bulk" ? BERTH_BULK : BERTH_CONTAINER;
      x = berth.x;
      y = berth.y;
    }
    drawVessel(ctx, frame, x, y, angle, laden, kind);
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
  ctx.translate(64, 76);
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-20, 0); ctx.lineTo(20, 0);
  ctx.moveTo(0, -20); ctx.lineTo(0, 20);
  ctx.stroke();
  box(ctx, -6, -6, 12, 12, frame.palette.land);
  ctx.fillStyle = frame.palette.label;
  monoLabel(ctx, "N", 0, -30, frame.font, { size: 13, spacing: 0, anchor: "middle" });
  ctx.restore();
}



/**
 * A caption tied to what it names by an elbow leader — the draughtsman's
 * convention. Without it a bare label floats in empty land and the reader has
 * to guess which structure it belongs to.
 */
/**
 * Clear a rectangle behind text so the background mesh does not run through
 * the glyphs. Measured from the actual string rather than assumed, so it stays
 * right if the font or the label changes.
 */
function labelPlate(
  ctx: CanvasRenderingContext2D,
  frame: Frame<Ink>,
  text: string,
  x: number,
  y: number,
  anchor: "start" | "middle" | "end" = "start",
): void {
  ctx.font = `12px ${frame.font}`;
  ctx.letterSpacing = "2px";
  const w = ctx.measureText(text).width;
  ctx.letterSpacing = "0px";
  const x0 = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
  ctx.fillStyle = frame.palette.land;
  ctx.fillRect(x0 - 3, y - 10, w + 6, 13);
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

  labelPlate(ctx, frame, text, textX, toY, anchor);
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
    drawSeaGrid(ctx, frame);
    drawShores(ctx, frame);
    drawLandGrid(ctx, frame);
    drawQuayTicks(ctx, frame);

    // --- Production shore, in process order: generation → conversion → export
    drawWindFarm(ctx, frame);
    drawPvArray(ctx, frame);
    drawDesalination(ctx, frame);
    drawFlow(ctx, frame);
    drawElectrolyser(ctx, frame);
    drawSynthesis(ctx, frame);
    drawRoad(ctx, frame);
    drawExportTerminal(ctx, frame);
    drawTrucks(ctx, frame);
    // Both cranes stand over the berth so either can reach the ship alongside.
    // One crane per trade, each over the berth its ships use.
    drawGantry(ctx, frame, 700, BERTH_CONTAINER.y - 26, 1, BERTH_CARGO.container, BERTH_CONTAINER, "container");
    drawGantry(ctx, frame, 700, BERTH_BULK.y + 26, 1, BERTH_CARGO.bulk, BERTH_BULK, "bulk");

    caption(ctx, frame, "[ WIND ]", 128, 570, 120, 600);
    caption(ctx, frame, "[ PV ARRAY ]", 128, 794, 120, 826);
    caption(ctx, frame, "[ DESALINATION ]", 500, 560, 472, 600);
    caption(ctx, frame, "[ ELECTROLYSIS ]", 408, 710, 402, 772);
    caption(ctx, frame, "[ NH3 SYNTHESIS ]", 470, 710, 402, 812);
    caption(ctx, frame, "[ FREIGHT ROAD ]", 300, 945, 292, 978);
    ctx.fillStyle = frame.palette.label;
    labelPlate(ctx, frame, "[ PECEM · BR ]", 128, 420);
    ctx.fillStyle = frame.palette.label;
    monoLabel(ctx, "[ PECEM · BR ]", 128, 420, frame.font);

    // --- Destination shore --------------------------------------------------
    drawImportRoad(ctx, frame);
    drawContainersB(ctx, frame);
    drawGantry(ctx, frame, 790, 300, -1, 2.3);
    drawImportTrucks(ctx, frame);
    caption(ctx, frame, "[ DISTRIBUTION ]", 722, 190, 700, 232);
    ctx.fillStyle = frame.palette.label;
    labelPlate(ctx, frame, "[ ROTTERDAM · NL ]", 878, 66, "end");
    ctx.fillStyle = frame.palette.label;
    monoLabel(ctx, "[ ROTTERDAM · NL ]", 878, 66, frame.font, { anchor: "end" });

    // --- The corridor -------------------------------------------------------
    drawReturnLane(ctx, frame);
    drawRoute(ctx, frame);
    drawWaypoints(ctx, frame);
    ctx.fillStyle = frame.palette.label;
    labelPlate(ctx, frame, "4600 NM", 800, 560);
    ctx.fillStyle = frame.palette.label;
    monoLabel(ctx, "4600 NM", 800, 560, frame.font);

    drawFleet(ctx, frame);
    drawSeaMarks(ctx, frame);
    drawCompass(ctx, frame);
  },
};
