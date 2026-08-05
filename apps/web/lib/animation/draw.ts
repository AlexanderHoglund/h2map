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

/** Rectangle outline. */
export function box(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.beginPath();
  ctx.rect(x, y, w, h);
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
