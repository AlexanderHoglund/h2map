import type { Point } from "./types";

/**
 * Technical-drawing primitives: the canvas equivalents of what the entry-panel
 * SVG does by hand. Plain functions, context first, no state.
 *
 * Hairlines: canvas centres a stroke on its path, so a 1px line on an integer
 * coordinate covers half of two pixel rows and renders as 2px of grey. SVG
 * behaves identically, so for a faithful port we do nothing about it. A scene
 * that wants razor-sharp lines should offset by half a pixel — but do not
 * apply that to a port, it changes the look.
 */

/** Stroke a polyline. Dash phase carries across segments, as in SVG. */
export function polyline(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  close = false,
): void {
  ctx.beginPath();
  let first = true;
  for (const [x, y] of points) {
    if (first) {
      ctx.moveTo(x, y);
      first = false;
    } else {
      ctx.lineTo(x, y);
    }
  }
  if (close) ctx.closePath();
  ctx.stroke();
}

/** Fill a closed polygon, then stroke its outline — the landmass idiom. */
export function shape(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  fill: string,
  stroke: string,
  lineWidth: number,
): void {
  ctx.beginPath();
  let first = true;
  for (const [x, y] of points) {
    if (first) {
      ctx.moveTo(x, y);
      first = false;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

/**
 * Run `render` with a dash pattern applied, then always restore it.
 *
 * Dash state is sticky and global on a 2D context, so the classic canvas bug
 * is one dashed path silently dashing everything drawn after it. Routing every
 * dashed stroke through here makes that impossible. (Cheaper than save/restore,
 * which snapshots the whole state.)
 */
export function dashed(
  ctx: CanvasRenderingContext2D,
  render: () => void,
  pattern: readonly number[],
  offset = 0,
): void {
  ctx.setLineDash([...pattern]);
  ctx.lineDashOffset = offset;
  render();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
}

/**
 * Rectangle. Filled before stroking by default, so a background grid does not
 * show through the object sitting on top of it — a stroked-only outline over a
 * mesh reads as transparent, which is wrong for a container or a tank.
 *
 * Pass `fill: null` for a genuine outline (a window, a bounding box).
 */
export function box(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string | null = null,
): void {
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  if (fill !== null) {
    const previous = ctx.fillStyle;
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.fillStyle = previous;
  }
  ctx.stroke();
}

/** Fill a polygon opaquely, then stroke it — the "sits on the grid" idiom. */
export function solid(
  ctx: CanvasRenderingContext2D,
  render: () => void,
  fill: string,
): void {
  const previous = ctx.fillStyle;
  ctx.beginPath();
  render();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.fillStyle = previous;
  ctx.stroke();
}

/** A centred plus — the survey/waypoint mark. */
export function crosshair(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r = 4,
): void {
  ctx.beginPath();
  ctx.moveTo(x - r, y);
  ctx.lineTo(x + r, y);
  ctx.moveTo(x, y - r);
  ctx.lineTo(x, y + r);
  ctx.stroke();
}

/** The doubled sea-mark chevron. */
export function chevron(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 8, y - 6);
  ctx.lineTo(x + 16, y);
  ctx.moveTo(x + 6, y + 10);
  ctx.lineTo(x + 14, y + 4);
  ctx.lineTo(x + 22, y + 10);
  ctx.stroke();
}

/** Repeated ticks along a vertical edge — quay berth marks. */
export function ticks(
  ctx: CanvasRenderingContext2D,
  x: number,
  ys: readonly number[],
  len: number,
): void {
  ctx.beginPath();
  for (const y of ys) {
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y);
  }
  ctx.stroke();
}

export interface LabelOptions {
  readonly size?: number;
  readonly spacing?: number;
  readonly anchor?: "start" | "middle" | "end";
}

/**
 * Monospace label matching the SVG's `letterSpacing` treatment.
 *
 * `ctx.letterSpacing` is used directly — it is present in this project's DOM
 * typings and in every browser the app targets. Note it must be set BEFORE
 * `measureText` for the anchor maths to be right, and reset afterwards since
 * it is sticky like the dash pattern.
 *
 * `textBaseline` is pinned to "alphabetic" because that is what SVG's
 * `<text y>` means; it is also the canvas default, but stating it stops a
 * later scene from changing it and silently shifting every label.
 */
export function monoLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  { size = 12, spacing = 2, anchor = "start" }: LabelOptions = {},
): void {
  ctx.font = `${size}px ${font}`;
  ctx.letterSpacing = `${spacing}px`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = anchor === "middle" ? "center" : anchor === "end" ? "right" : "left";
  ctx.fillText(text, x, y);
  ctx.letterSpacing = "0px";
  ctx.textAlign = "left";
}

/**
 * Chart mesh over a design space: straight lines on land, a tight ripple at
 * sea — the chart-maker's shorthand for water, costing one sine. Small
 * wavelength on purpose: the eye should still read a straight grid, with the
 * texture legible only up close; long swells make the mesh look bent.
 *
 * The caller owns stroke colour, alpha and any clipping (land grids are
 * clipped to shore polygons); this draws geometry only.
 */
export function gridLines(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  step: number,
  wavy: boolean,
  time: number,
): void {
  const AMP = 0.9;
  const WAVELENGTH = 13;
  const DRIFT = 4; // units per second the pattern slides
  const STEP = 2; // short segments, so a tight curve stays smooth

  ctx.beginPath();
  for (let y = step; y < height; y += step) {
    if (!wavy) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      continue;
    }
    for (let x = 0; x <= width; x += STEP) {
      const wy = y + Math.sin((x + time * DRIFT) / WAVELENGTH) * AMP;
      if (x === 0) ctx.moveTo(x, wy);
      else ctx.lineTo(x, wy);
    }
  }
  for (let x = step; x < width; x += step) {
    if (!wavy) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      continue;
    }
    for (let y = 0; y <= height; y += STEP) {
      const wx = x + Math.sin((y + time * DRIFT) / WAVELENGTH) * AMP;
      if (y === 0) ctx.moveTo(wx, y);
      else ctx.lineTo(wx, y);
    }
  }
  ctx.stroke();
}

/**
 * Clear a rectangle behind a 12px mono label so a background mesh does not
 * run through the glyphs. Measured from the actual string — it stays right if
 * the font or the text changes.
 */
export function labelPlate(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  plateFill: string,
  anchor: "start" | "middle" | "end" = "start",
): void {
  ctx.font = `12px ${font}`;
  ctx.letterSpacing = "2px";
  const w = ctx.measureText(text).width;
  ctx.letterSpacing = "0px";
  const x0 = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
  ctx.fillStyle = plateFill;
  ctx.fillRect(x0 - 3, y - 10, w + 6, 13);
}

export interface CaptionColors {
  readonly leader: string;
  readonly plate: string;
  readonly text: string;
}

/**
 * A caption tied to its subject by a leader that CANNOT strike the text.
 *
 * The label sits below the subject and the leader drops vertically to just
 * above cap height, with a short foot stopping shy of the first glyph. The
 * geometry is written this way because the obvious elbow — horizontal along
 * the baseline from the subject back to the label — traverses the whole
 * string whenever the label sits underneath, and renders as a strikethrough.
 */
export function caption(
  ctx: CanvasRenderingContext2D,
  text: string,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  font: string,
  colors: CaptionColors,
  anchor: "start" | "end" = "start",
): void {
  const capTop = toY - 11; // clear of the 12px glyphs' cap height

  ctx.strokeStyle = colors.leader;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(fromX, capTop - 4);
  ctx.lineTo(anchor === "start" ? toX + 3 : toX - 3, capTop - 4);
  ctx.stroke();
  // Tick at the subject end, so the leader clearly originates somewhere.
  ctx.beginPath();
  ctx.moveTo(fromX - 3, fromY);
  ctx.lineTo(fromX + 3, fromY);
  ctx.stroke();

  labelPlate(ctx, text, toX, toY, font, colors.plate, anchor);
  ctx.fillStyle = colors.text;
  monoLabel(ctx, text, toX, toY, font, { anchor });
}
