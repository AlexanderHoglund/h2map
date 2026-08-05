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

/**
 * Production shore: enlarged to carry the whole chain — wind and solar
 * generation inland, electrolysis and synthesis mid-shore, then the export
 * quay. The sea is now just the corridor between the two coasts, because the
 * story is the process, not the ocean.
 */
const SHORE_A: readonly Point[] = [
  [0, 300], [200, 300], [200, 360], [420, 360],
  [420, 470], [640, 470], [640, 660], [700, 660],
  [700, 1000], [0, 1000],
];
/** Destination shore: the import terminal, top-right. */
const SHORE_B: readonly Point[] = [
  [900, 0], [900, 330], [790, 330], [790, 210],
  [690, 210], [690, 100], [540, 100], [540, 0],
];

/** Laden, quay to quay: Port A (620,880) → right angles → Port B (790,250). */
const ROUTE: readonly Point[] = [
  [700, 850], [770, 850], [770, 620], [840, 620], [840, 280], [790, 280],
];
/**
 * Ballast, the return leg. Offset from the laden track so the two are legible
 * as separate lanes — the convention on a real routeing chart, and it stops
 * the outbound and inbound vessels from overrunning each other.
 */
const ROUTE_BACK: readonly Point[] = [
  [790, 280], [872, 280], [872, 660], [800, 660], [800, 900], [700, 900],
];
const WAYPOINTS: readonly Point[] = [[770, 850], [770, 620], [840, 620], [840, 280]];
const SEA_MARKS: readonly Point[] = [[724, 200]];

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

/**
 * Wind turbine, three blades, rotating. `spin` is turns per second — each
 * machine gets its own phase and a slightly different rate so the farm does
 * not pulse in unison, which is the tell of a fake.
 */
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
  const blade = h * 0.42;

  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.4;
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
  ctx.arc(x, hubY, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

/** The wind farm: a row along the high ground, staggered so it reads as depth. */
function drawWindFarm(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const rows: readonly [x: number, y: number, h: number, phase: number, spin: number][] = [
    [80, 520, 86, 0.0, 0.22],
    [166, 520, 78, 1.7, 0.19],
    [250, 520, 90, 3.1, 0.25],
    [124, 604, 66, 2.3, 0.17],
    [212, 604, 72, 0.8, 0.21],
    [300, 604, 62, 4.4, 0.24],
  ];
  for (const [x, y, h, phase, spin] of rows) drawTurbine(ctx, frame, x, y, h, phase, spin);
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(50, 520); ctx.lineTo(320, 520);
  ctx.moveTo(94, 604); ctx.lineTo(360, 604);
  ctx.stroke();
}

/** PV array: rows of tilted panels on a ground line. */
function drawPvArray(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.2;
  for (let row = 0; row < 2; row += 1) {
    const y = 690 + row * 46;
    for (let c = 0; c < 6; c += 1) {
      const x = 50 + c * 44;
      // Panel in section: a tilted face on a short post.
      ctx.beginPath();
      ctx.moveTo(x, y + 14);
      ctx.lineTo(x + 30, y);
      ctx.moveTo(x + 15, y + 7);
      ctx.lineTo(x + 15, y + 20);
      ctx.moveTo(x + 6, y + 20);
      ctx.lineTo(x + 24, y + 20);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(40, y + 20); ctx.lineTo(320, y + 20);
    ctx.stroke();
  }
}

/** Electrolyser hall: a stack module block, the heart of the chain. */
function drawElectrolyser(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const x = 360;
  const y = 700;
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.5;
  box(ctx, x, y, 120, 62);
  // Stack modules inside — the repeated cell that says "electrolyser".
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 6; i += 1) {
    ctx.moveTo(x + i * 20, y + 6);
    ctx.lineTo(x + i * 20, y + 56);
  }
  ctx.moveTo(x + 6, y + 31); ctx.lineTo(x + 114, y + 31);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 10, y + 62); ctx.lineTo(x + 130, y + 62);
  ctx.stroke();
}

/** Ammonia synthesis + storage: braced reactors and a spherical tank. */
function drawSynthesis(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const y = 700;
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.5;
  // Two reactor columns.
  box(ctx, 512, y + 6, 26, 56);
  box(ctx, 548, y + 6, 26, 56);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(512, y + 6); ctx.lineTo(538, y + 62);
  ctx.moveTo(538, y + 6); ctx.lineTo(512, y + 62);
  ctx.moveTo(548, y + 6); ctx.lineTo(574, y + 62);
  ctx.moveTo(574, y + 6); ctx.lineTo(548, y + 62);
  ctx.stroke();
  // Flare stack.
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(582, y + 62); ctx.lineTo(582, y - 16); ctx.lineTo(592, y - 16);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(502, y + 62); ctx.lineTo(596, y + 62);
  ctx.stroke();

  // Spherical storage — the unmistakable ammonia silhouette.
  ctx.beginPath();
  ctx.arc(452, y + 40, 22, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(430, y + 40); ctx.lineTo(474, y + 40);
  ctx.moveTo(452, y + 18); ctx.lineTo(452, y + 62);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(438, y + 62); ctx.lineTo(442, y + 56);
  ctx.moveTo(466, y + 62); ctx.lineTo(462, y + 56);
  ctx.moveTo(426, y + 62); ctx.lineTo(478, y + 62);
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
  ctx.lineWidth = 1.4;
  dashed(
    ctx,
    () => {
      ctx.beginPath();
      // Wind + solar → electrolyser busbar.
      ctx.moveTo(320, 580); ctx.lineTo(350, 580); ctx.lineTo(350, 700);
      ctx.lineTo(380, 700);
      ctx.moveTo(320, 710); ctx.lineTo(350, 710);
      ctx.moveTo(320, 756); ctx.lineTo(350, 756); ctx.lineTo(350, 710);
      // Electrolyser → storage → synthesis.
      ctx.moveTo(480, 720); ctx.lineTo(500, 720);
      ctx.moveTo(474, 740); ctx.lineTo(512, 740);
      // Synthesis → quay.
      ctx.moveTo(596, 762); ctx.lineTo(640, 762); ctx.lineTo(640, 840);
      ctx.lineTo(672, 840);
      ctx.stroke();
    },
    DASH,
    offset,
  );
}

// ===== Destination shore: PORT B ============================================

/** Import terminal storage: spheres, mirroring the export side's tankage. */
function drawContainersB(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.4;
  for (const [cx, r] of [[840, 16], [878, 12]] as const) {
    ctx.beginPath();
    ctx.arc(cx, 300 - r, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - r, 300 - r); ctx.lineTo(cx + r, 300 - r);
    ctx.stroke();
    ctx.lineWidth = 1.4;
  }
  ctx.beginPath();
  ctx.moveTo(816, 300); ctx.lineTo(896, 300);
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
 * The fleet, on a continuous circuit: laden along the corridor, then back in
 * ballast down the return lane. Each vessel spends the first half of its cycle
 * outbound and the second half inbound, so the two lanes stay populated and
 * the loop closes without anything teleporting.
 */
function drawFleet(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  if (!routePath || !returnPath) return;
  for (const offset of SHIP_OFFSETS) {
    const cycle = ((frame.time + offset) % VOYAGE_S) / VOYAGE_S;
    const laden = cycle < 0.5;
    const leg = laden ? cycle * 2 : (cycle - 0.5) * 2;
    const { x, y, angle } = poseAt(laden ? routePath : returnPath, leg);
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
    drawContainersA(ctx, frame);
    drawGantry(ctx, frame, 700, 870, 1);

    caption(ctx, frame, "[ WIND ]", 150, 470, 44, 428);
    caption(ctx, frame, "[ PV ARRAY ]", 150, 756, 44, 800);
    caption(ctx, frame, "[ ELECTROLYSIS ]", 420, 762, 360, 800);
    caption(ctx, frame, "[ NH3 SYNTHESIS ]", 540, 762, 470, 838, "start");
    ctx.fillStyle = frame.palette.label;
    monoLabel(ctx, "[ PECEM · BR ]", 44, 340, frame.font);

    // --- Destination shore --------------------------------------------------
    drawContainersB(ctx, frame);
    drawGantry(ctx, frame, 790, 330, -1);
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
