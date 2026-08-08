import { dashed, labelPlate, monoLabel, polyline, shape } from "@/lib/animation/draw";
import { berthEase, smoothstep } from "@/lib/animation/ease";
import { measure, poseAt, type MeasuredPath } from "@/lib/animation/polyline";
import type { DesignSpace, Frame, Point, Scene } from "@/lib/animation/types";
import { LANDMASSES } from "./decoupling-geo";

/** The colours this scene draws with. `landmass` is the map silhouette grey;
 *  `attr` is the clean-fuel / environmental-attribute green. */
type Ink = "ink" | "inkSoft" | "landmass" | "page" | "label" | "attr";

/**
 * One voyage, many buyers — book & claim on the actual world map.
 *
 * The map is real geography (Natural Earth coastlines, Mediterranean to the
 * US West Coast). Iron ore moves Pilbara → Korea on the one solid route; a
 * green segment slides along it — the vessel on clean fuel. Everything else
 * is dashed "other trades": Korean ro-ro exports across the Pacific, the
 * container trunk to Piraeus, Australian coastal legs. The clean ammonia is
 * made in the Pilbara (wind, solar, electrolysis, NH3 synthesis — the small
 * annotation in the Indian Ocean), and the voyage's attribute goes to the
 * REGISTRY box in central Asia, from where it is sold on to cargo owners on
 * entirely different trades.
 *
 * Chart conventions, not scene conventions: routes are annotations and may
 * cross the silhouettes exactly as they do in the reference figure. Ports
 * carry dots and plated labels; cargo owners carry a small building glyph.
 */

const SPACE: DesignSpace = { width: 900, height: 520, fit: "meet" };

// ===== Ports ================================================================
// Positions come from the same equirectangular projection as the coastlines
// (lon 10°E→250°E across the Pacific, lat 65°N→55°S into 900×520).
export interface Port {
  readonly x: number;
  readonly y: number;
  readonly label: string;
  readonly anchor: "start" | "middle" | "end";
  /** Label offset from the dot. */
  readonly dx: number;
  readonly dy: number;
  /** Does a cargo owner sit here? Offset of the building glyph, if so. */
  readonly owner?: readonly [number, number];
}

export const PORTS: readonly Port[] = [
  { x: 51, y: 117, label: "Piraeus, GR", anchor: "start", dx: 9, dy: -8, owner: [-8, -26] },
  { x: 450, y: 126, label: "Ulsan, KR", anchor: "start", dx: 11, dy: -10, owner: [4, -30] },
  { x: 438, y: 133, label: "Gwangyang, KR", anchor: "end", dx: -10, dy: 10 },
  { x: 869, y: 135, label: "Long Beach, US", anchor: "end", dx: -10, dy: 4, owner: [-6, -24] },
  { x: 407, y: 370, label: "Pilbara Ports, AU", anchor: "start", dx: 10, dy: 2 },
  { x: 397, y: 421, label: "Fremantle, AU", anchor: "end", dx: -10, dy: 2, owner: [-58, -22] },
  { x: 506, y: 446, label: "Melbourne, AU", anchor: "middle", dx: 4, dy: 18, owner: [-42, -18] },
  { x: 528, y: 431, label: "Port Kembla, AU", anchor: "start", dx: 11, dy: -2, owner: [14, -20] },
];
const ULSAN = { x: 450, y: 126 } as const;
const PILBARA = { x: 407, y: 370 } as const;

// ===== Routes ===============================================================
/** The one clean-fuel voyage: iron ore, Pilbara → Ulsan via Makassar. Solid. */
export const ORE_ROUTE: readonly Point[] = [
  [407, 370], [404, 344], [401, 322], [404, 303], [410, 284], [416, 264],
  [421, 238], [423, 208], [429, 178], [439, 150], [447, 132], [450, 127],
];

export interface TradeRoute {
  readonly from: string;
  readonly to: string;
  readonly kind: "container" | "roro";
  /** Phase window in which the vessel is under way. */
  readonly window: readonly [number, number];
  readonly points: readonly Point[];
}

/** Everything else on the map: dashed "other trades". */
export const TRADE_ROUTES: readonly TradeRoute[] = [
  {
    from: "Ulsan",
    to: "Long Beach",
    kind: "roro",
    window: [0.05, 0.5],
    points: [
      [450, 126], [465, 119], [495, 104], [532, 87], [581, 72], [638, 65],
      [694, 72], [750, 87], [806, 110], [848, 131], [869, 135],
    ],
  },
  {
    from: "Ulsan",
    to: "Piraeus",
    kind: "container",
    window: [0.12, 0.78],
    points: [
      [446, 131], [437, 141], [418, 165], [401, 188], [382, 214], [369, 238],
      [356, 262], [350, 274], [338, 269], [322, 259], [292, 257], [262, 257],
      [236, 249], [199, 236], [158, 226], [129, 229], [111, 210], [99, 184],
      [89, 162], [84, 152], [79, 142], [66, 132], [54, 123], [51, 117],
    ],
  },
  {
    from: "Fremantle",
    to: "Melbourne",
    kind: "container",
    window: [0.3, 0.52],
    points: [
      [397, 421], [394, 432], [407, 440], [431, 445], [458, 450], [484, 454],
      [501, 453], [506, 446],
    ],
  },
  {
    from: "Pilbara Ports",
    to: "Fremantle",
    kind: "container",
    window: [0.55, 0.68],
    points: [[407, 370], [398, 377], [388, 390], [390, 407], [395, 419], [397, 421]],
  },
  {
    from: "Melbourne",
    to: "Port Kembla",
    kind: "roro",
    window: [0.8, 0.92],
    points: [[506, 446], [512, 452], [522, 449], [528, 439], [528, 431]],
  },
];

// ===== The registry =========================================================
/** The book & claim registry, boxed into the empty central-Asia interior. */
export const REGISTRY_BOX = { x: 284, y: 72, w: 88, h: 46 } as const;
const REGISTRY_CENTER: Point = [
  REGISTRY_BOX.x + REGISTRY_BOX.w / 2,
  REGISTRY_BOX.y + REGISTRY_BOX.h / 2,
];

// ===== The cycle ============================================================
export const CYCLE_S = 24;
/** t=0 — the reduced-motion poster — lands mid-voyage on the ore route. */
export const POSTER_OFFSET_S = 0.14 * CYCLE_S;

/** The clean-fuel ore voyage. */
export const ORE_SCHEDULE = {
  sailOut: [0.0, 0.34], // Pilbara → Ulsan, laden, the green segment
  alongside: [0.34, 0.48],
  sailHome: [0.48, 0.8], // ballast return
  loading: [0.8, 1.0], // bunkering clean ammonia, loading ore
} as const;

/** The attribute rises from the arrived vessel to the registry… */
export const ATTR_WINDOW = [0.36, 0.46] as const;
/** …and the registry sells it on to cargo owners on other trades. */
export const SELL_WINDOW = [0.5, 0.64] as const;
/** Owner ports the sold attributes travel to (must have `owner` glyphs). */
export const SOLD_TO = ["Piraeus", "Long Beach", "Port Kembla"] as const;

export function phaseAt(time: number): number {
  const s = (time + POSTER_OFFSET_S) % CYCLE_S;
  return (s < 0 ? s + CYCLE_S : s) / CYCLE_S;
}

// --- precomputed in setup() -------------------------------------------------
let orePath: MeasuredPath | null = null;
let tradePaths: readonly MeasuredPath[] = [];

// ===== Drawing ==============================================================
function drawMap(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  ctx.fillStyle = frame.palette.page;
  ctx.fillRect(0, 0, 900, 520);
  // Soft grey silhouettes, no borders — countries are context, not content.
  for (const land of LANDMASSES) {
    shape(ctx, land, frame.palette.landmass, frame.palette.landmass, 0.5);
  }
}

function drawRoutes(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  // The clean-fuel voyage: solid, the chart's one emphatic line.
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.5;
  polyline(ctx, ORE_ROUTE);
  labelPlate(ctx, "iron ore", 414, 232, frame.font, frame.palette.page, "end");
  ctx.fillStyle = frame.palette.label;
  monoLabel(ctx, "iron ore", 414, 232, frame.font, { size: 10, spacing: 1, anchor: "end" });

  // The other trades: dashed, quiet.
  ctx.strokeStyle = frame.palette.inkSoft;
  ctx.lineWidth = 1;
  for (const route of TRADE_ROUTES) {
    dashed(ctx, () => polyline(ctx, route.points), [4, 4]);
  }
}

/** Small warehouse glyph — the cargo owner, as in the legend. */
function drawOwner(ctx: CanvasRenderingContext2D, frame: Frame<Ink>, x: number, y: number): void {
  ctx.strokeStyle = frame.palette.ink;
  ctx.fillStyle = frame.palette.page;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(x, y, 12, 8);
  ctx.fill();
  ctx.stroke();
  // Sawtooth roof.
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 3, y - 3);
  ctx.lineTo(x + 6, y);
  ctx.lineTo(x + 9, y - 3);
  ctx.lineTo(x + 12, y);
  ctx.stroke();
  // Door.
  ctx.beginPath();
  ctx.rect(x + 4.5, y + 3.5, 3, 4.5);
  ctx.stroke();
}

function drawPorts(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  for (const port of PORTS) {
    ctx.fillStyle = frame.palette.ink;
    ctx.beginPath();
    ctx.arc(port.x, port.y, 2.4, 0, Math.PI * 2);
    ctx.fill();

    const lx = port.x + port.dx;
    const ly = port.y + port.dy;
    labelPlate(ctx, port.label, lx, ly, frame.font, frame.palette.page, port.anchor);
    ctx.fillStyle = frame.palette.label;
    monoLabel(ctx, port.label, lx, ly, frame.font, { size: 10, spacing: 1, anchor: port.anchor });
    if (port.owner) {
      drawOwner(ctx, frame, port.x + port.owner[0], port.y + port.owner[1]);
    }
  }
}

/** Vessel glyph in plan view. Container = striped grey; ro-ro = solid dark;
 *  ballast = quiet outline (the ore ship going home empty). */
function drawShipGlyph(
  ctx: CanvasRenderingContext2D,
  frame: Frame<Ink>,
  x: number,
  y: number,
  angle: number,
  kind: "container" | "roro" | "ballast" | "clean",
  alpha: number,
  scale = 1,
): void {
  if (alpha <= 0.02) return;
  const L = 17 * scale;
  const B = 6 * scale;
  const half = B / 2;
  const bow = L * 0.5;
  const stern = -L * 0.5;
  const main =
    kind === "roro" ? frame.palette.ink : kind === "clean" ? frame.palette.attr : frame.palette.inkSoft;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(stern, -half);
  ctx.lineTo(bow - 5 * scale, -half);
  ctx.lineTo(bow, 0);
  ctx.lineTo(bow - 5 * scale, half);
  ctx.lineTo(stern, half);
  ctx.closePath();
  if (kind === "roro" || kind === "clean") {
    ctx.fillStyle = main;
    ctx.fill();
  } else {
    ctx.fillStyle = frame.palette.page;
    ctx.fill();
    ctx.strokeStyle = main;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  if (kind === "container") {
    // The stripes that read "boxes on deck".
    ctx.strokeStyle = main;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i <= 3; i += 1) {
      const sx = stern + (i * (L - 6 * scale)) / 4;
      ctx.moveTo(sx, -half + 1);
      ctx.lineTo(sx, half - 1);
    }
    ctx.stroke();
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
  ctx.lineWidth = 1.3;
  ctx.stroke();
}

/** Sample an arc-length slice [u0,u1] of a measured path as a polyline. */
function pathSlice(path: MeasuredPath, u0: number, u1: number, n = 12): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= n; i += 1) {
    const pose = poseAt(path, u0 + ((u1 - u0) * i) / n);
    pts.push([pose.x, pose.y]);
  }
  return pts;
}

/** The clean-fuel voyage: a green segment sliding up the solid route — the
 *  legend's "Clean fuel". Ballast home as a quiet outline; a growing green
 *  stub while bunkering at Pilbara. */
function drawCleanFuel(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  if (!orePath) return;
  const p = phaseAt(frame.time);
  const S = ORE_SCHEDULE;
  const SEG = 46 / orePath.length; // the green wake astern, as a fraction

  const drawSeg = (u0: number, u1: number, alpha: number) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = frame.palette.attr;
    ctx.lineWidth = 3.4;
    ctx.lineCap = "round";
    polyline(ctx, pathSlice(orePath!, Math.max(0, u0), Math.min(1, u1)));
    ctx.restore();
  };

  if (p < S.sailOut[1]) {
    const u = berthEase(p / S.sailOut[1]);
    drawSeg(u - SEG, u, 1);
    const pose = poseAt(orePath, u);
    drawShipGlyph(ctx, frame, pose.x, pose.y, pose.angle, "clean", 1, 0.95);
  } else if (p < S.alongside[1]) {
    // Alongside at Ulsan: the segment fades as the attribute detaches.
    const k = (p - S.alongside[0]) / (S.alongside[1] - S.alongside[0]);
    drawSeg(1 - SEG, 1, 1 - smoothstep(k));
    drawShipGlyph(ctx, frame, ULSAN.x + 6, ULSAN.y + 12, -Math.PI / 2, "ballast", 1, 0.95);
  } else if (p < S.sailHome[1]) {
    const u = berthEase((p - S.sailHome[0]) / (S.sailHome[1] - S.sailHome[0]));
    const pose = poseAt(orePath, 1 - u);
    drawShipGlyph(ctx, frame, pose.x, pose.y, pose.angle + Math.PI, "ballast", 1, 0.95);
  } else {
    // Loading and bunkering: green grows from the Pilbara end of the route.
    const k = (p - S.loading[0]) / (1 - S.loading[0]);
    drawSeg(0, smoothstep(k) * SEG, 1);
    drawShipGlyph(ctx, frame, PILBARA.x + 6, PILBARA.y - 8, Math.PI / 2, "ballast", 1, 0.95);
  }
}

/** The other trades: container and ro-ro glyphs tracing the dashed lines. */
function drawTradeVessels(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const p = phaseAt(frame.time);
  for (let i = 0; i < TRADE_ROUTES.length; i += 1) {
    const route = TRADE_ROUTES[i];
    const path = tradePaths[i];
    if (!route || !path) continue;
    const [start, end] = route.window;
    if (p < start || p >= end) continue;
    const u = berthEase((p - start) / (end - start));
    const { x, y, angle } = poseAt(path, u);
    const alpha = Math.min(1, u * 8, (1 - u) * 8);
    drawShipGlyph(ctx, frame, x, y, angle, route.kind, alpha, 0.85);
  }
}

function drawRegistry(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const { x, y, w, h } = REGISTRY_BOX;
  ctx.fillStyle = frame.palette.page;
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.stroke();
  // Double outline — the institution, as on the diagram cards.
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.rect(x + 3, y + 3, w - 6, h - 6);
  ctx.stroke();
  ctx.fillStyle = frame.palette.label;
  monoLabel(ctx, "REGISTRY", x + w / 2, y + 19, frame.font, {
    size: 10,
    spacing: 2,
    anchor: "middle",
  });
  // Ledger lines.
  ctx.strokeStyle = frame.palette.inkSoft;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let i = 0; i < 3; i += 1) {
    ctx.moveTo(x + 14, y + 27 + i * 5);
    ctx.lineTo(x + w - 14, y + 27 + i * 5);
  }
  ctx.stroke();
}

/** The attribute detaches from the arrived voyage and books into the
 *  registry; the registry then sells it on to cargo owners elsewhere. */
function drawAttributeFlows(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const p = phaseAt(frame.time);
  const [rx, ry] = REGISTRY_CENTER;

  if (p >= ATTR_WINDOW[0] && p < ATTR_WINDOW[1]) {
    const k = smoothstep((p - ATTR_WINDOW[0]) / (ATTR_WINDOW[1] - ATTR_WINDOW[0]));
    const x = ULSAN.x + (rx + REGISTRY_BOX.w / 2 - 3 - ULSAN.x) * k;
    const y = ULSAN.y - 6 + (ry - (ULSAN.y - 6)) * k;
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = frame.palette.attr;
    ctx.lineWidth = 0.8;
    dashed(
      ctx,
      () => {
        ctx.beginPath();
        ctx.moveTo(ULSAN.x, ULSAN.y - 6);
        ctx.lineTo(rx + REGISTRY_BOX.w / 2 - 3, ry);
        ctx.stroke();
      },
      [2, 3],
    );
    ctx.restore();
    diamond(ctx, x, y, 4.5, frame.palette.attr, frame.palette.attr);
  }

  if (p >= SELL_WINDOW[0] && p < SELL_WINDOW[1]) {
    const k = smoothstep((p - SELL_WINDOW[0]) / (SELL_WINDOW[1] - SELL_WINDOW[0]));
    for (const name of SOLD_TO) {
      const port = PORTS.find((q) => q.label.startsWith(name));
      if (!port?.owner) continue;
      const tx = port.x + port.owner[0] + 6;
      const ty = port.y + port.owner[1] + 4;
      const x = rx + (tx - rx) * k;
      const y = ry + (ty - ry) * k;
      const alpha = Math.min(1, k * 6, (1 - k) * 6 + 0.25);
      ctx.save();
      ctx.globalAlpha = alpha;
      diamond(ctx, x, y, 3.4, frame.palette.attr, frame.palette.attr);
      ctx.restore();
    }
  }
}

/** Wind, solar, electrolysis, NH3 synthesis — where the clean fuel is made. */
function drawProduction(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const ox = 172;
  const oy = 300;
  ctx.strokeStyle = frame.palette.inkSoft;
  ctx.lineWidth = 0.8;

  // Leader to the Pilbara port dot.
  dashed(
    ctx,
    () => {
      ctx.beginPath();
      ctx.moveTo(ox + 128, oy + 26);
      ctx.lineTo(PILBARA.x - 6, PILBARA.y - 3);
      ctx.stroke();
    },
    [2, 3],
  );

  ctx.fillStyle = frame.palette.label;
  monoLabel(ctx, "Clean ammonia, Pilbara", ox, oy - 12, frame.font, { size: 10, spacing: 1 });

  // Wind: three small turbines, blades turning slowly.
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i += 1) {
    const tx = ox + 6 + i * 16;
    const ty = oy + 22;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx, ty - 12);
    ctx.stroke();
    const spin = frame.time * 1.4 + i * 1.1;
    for (let b = 0; b < 3; b += 1) {
      const a = spin + (b * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.moveTo(tx, ty - 12);
      ctx.lineTo(tx + Math.cos(a) * 6, ty - 12 + Math.sin(a) * 6);
      ctx.stroke();
    }
  }
  ctx.fillStyle = frame.palette.inkSoft;
  monoLabel(ctx, "wind", ox + 8, oy + 32, frame.font, { size: 7, spacing: 1 });

  // Solar: a hatched panel.
  ctx.strokeStyle = frame.palette.ink;
  ctx.fillStyle = frame.palette.page;
  ctx.beginPath();
  ctx.rect(ox + 72, oy + 8, 26, 13);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let i = 1; i < 4; i += 1) {
    ctx.moveTo(ox + 72 + i * 6.5, oy + 8);
    ctx.lineTo(ox + 72 + i * 6.5, oy + 21);
  }
  ctx.moveTo(ox + 72, oy + 14.5);
  ctx.lineTo(ox + 98, oy + 14.5);
  ctx.stroke();
  ctx.fillStyle = frame.palette.inkSoft;
  monoLabel(ctx, "solar", ox + 76, oy + 32, frame.font, { size: 7, spacing: 1 });

  // Electrolysis: the stack grid.
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 0.9;
  ctx.fillStyle = frame.palette.page;
  ctx.beginPath();
  ctx.rect(ox + 4, oy + 42, 24, 11);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  for (let i = 1; i < 4; i += 1) {
    ctx.moveTo(ox + 4 + i * 6, oy + 42);
    ctx.lineTo(ox + 4 + i * 6, oy + 53);
  }
  ctx.stroke();
  ctx.fillStyle = frame.palette.inkSoft;
  monoLabel(ctx, "electrolysis", ox + 2, oy + 64, frame.font, { size: 7, spacing: 1 });

  // NH3 synthesis: the twin drums.
  ctx.strokeStyle = frame.palette.ink;
  ctx.beginPath();
  ctx.arc(ox + 84, oy + 47, 5, 0, Math.PI * 2);
  ctx.moveTo(ox + 100, oy + 47);
  ctx.arc(ox + 95, oy + 47, 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = frame.palette.inkSoft;
  monoLabel(ctx, "NH3 synthesis", ox + 74, oy + 64, frame.font, { size: 7, spacing: 1 });
}

function drawLegend(ctx: CanvasRenderingContext2D, frame: Frame<Ink>): void {
  const y = 507;
  // A quiet band, so the legend never fights the Southern Ocean.
  ctx.fillStyle = frame.palette.page;
  ctx.fillRect(0, 490, 900, 30);
  ctx.strokeStyle = frame.palette.landmass;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 490.5);
  ctx.lineTo(900, 490.5);
  ctx.stroke();
  ctx.textBaseline = "alphabetic";

  // Solid: the ore voyage.
  ctx.strokeStyle = frame.palette.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(24, y - 4);
  ctx.lineTo(56, y - 4);
  ctx.stroke();
  ctx.fillStyle = frame.palette.label;
  monoLabel(ctx, "Iron ore, Australia to Korea", 63, y, frame.font, { size: 9, spacing: 1 });

  // Dashed: everything else.
  ctx.strokeStyle = frame.palette.inkSoft;
  ctx.lineWidth = 1;
  dashed(
    ctx,
    () => {
      ctx.beginPath();
      ctx.moveTo(258, y - 4);
      ctx.lineTo(290, y - 4);
      ctx.stroke();
    },
    [4, 4],
  );
  ctx.fillStyle = frame.palette.inkSoft;
  monoLabel(ctx, "Other trades", 297, y, frame.font, { size: 9, spacing: 1 });

  // Green: the clean-fuel segment.
  ctx.strokeStyle = frame.palette.attr;
  ctx.lineWidth = 3.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(392, y - 4);
  ctx.lineTo(420, y - 4);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.fillStyle = frame.palette.label;
  monoLabel(ctx, "Clean fuel", 428, y, frame.font, { size: 9, spacing: 1 });

  // Vessel kinds.
  drawShipGlyph(ctx, frame, 514, y - 4, 0, "container", 1, 0.8);
  ctx.fillStyle = frame.palette.label;
  monoLabel(ctx, "Container", 528, y, frame.font, { size: 9, spacing: 1 });
  drawShipGlyph(ctx, frame, 614, y - 4, 0, "roro", 1, 0.8);
  ctx.fillStyle = frame.palette.label;
  monoLabel(ctx, "Ro-ro", 628, y, frame.font, { size: 9, spacing: 1 });

  // The cargo owner.
  drawOwner(ctx, frame, 690, y - 9);
  ctx.fillStyle = frame.palette.label;
  monoLabel(ctx, "Cargo owner", 708, y, frame.font, { size: 9, spacing: 1 });

  // The attribute.
  diamond(ctx, 792, y - 4, 4, frame.palette.attr, frame.palette.attr);
  ctx.fillStyle = frame.palette.label;
  monoLabel(ctx, "Attribute (EAC)", 802, y, frame.font, { size: 9, spacing: 1 });
}

// ===== The scene ============================================================
export const decouplingScene: Scene<Ink> = {
  id: "decoupling",
  space: SPACE,
  palette: [
    { key: "ink", prop: "--anim-ink", fallback: "#3f3e3a" },
    { key: "inkSoft", prop: "--anim-ink-soft", fallback: "#9b9a90" },
    { key: "landmass", prop: "--viz-grid", fallback: "#e1e0d9" },
    { key: "page", prop: "--color-page", fallback: "#f9f9f7" },
    { key: "label", prop: "--viz-ink-secondary", fallback: "#52514e" },
    { key: "attr", prop: "--viz-series-green", fallback: "#008300" },
  ],

  setup() {
    orePath = measure(ORE_ROUTE);
    tradePaths = TRADE_ROUTES.map((route) => measure(route.points));
  },

  draw(ctx, frame) {
    drawMap(ctx, frame);
    drawRoutes(ctx, frame);
    drawProduction(ctx, frame);
    drawRegistry(ctx, frame);
    drawPorts(ctx, frame);
    drawTradeVessels(ctx, frame);
    drawCleanFuel(ctx, frame);
    drawAttributeFlows(ctx, frame);
    drawLegend(ctx, frame);
  },
};
