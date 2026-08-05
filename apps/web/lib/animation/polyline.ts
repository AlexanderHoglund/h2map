import type { Point } from "./types";

/**
 * Arc-length parameterisation of a polyline — what CSS gives free via
 * `offset-path` + `offset-distance`, and canvas does not give at all.
 *
 * Geometry is stored in flat `Float64Array`s rather than tuples because
 * typed-array indexing returns `number` under `noUncheckedIndexedAccess`,
 * where `pts[i]` would be `Point | undefined` and force a guard at every
 * access. This is genuinely numeric buffer data, so the representation is
 * honest as well as convenient.
 */

export interface MeasuredPath {
  readonly xs: Float64Array;
  readonly ys: Float64Array;
  /** cumulative[i] = distance along the path from the start to vertex i. */
  readonly cumulative: Float64Array;
  readonly length: number;
}

export interface Pose {
  readonly x: number;
  readonly y: number;
  /** Tangent direction in radians — the `offset-rotate: auto` equivalent. */
  readonly angle: number;
}

const ORIGIN: Pose = Object.freeze({ x: 0, y: 0, angle: 0 });

/** Precompute cumulative arc length. Call once from `Scene.setup()`. */
export function measure(points: readonly Point[]): MeasuredPath {
  const n = points.length;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const cumulative = new Float64Array(n);

  let i = 0;
  let total = 0;
  let prevX = 0;
  let prevY = 0;
  for (const [x, y] of points) {
    if (i > 0) total += Math.hypot(x - prevX, y - prevY);
    xs[i] = x;
    ys[i] = y;
    cumulative[i] = total;
    prevX = x;
    prevY = y;
    i += 1;
  }
  return { xs, ys, cumulative, length: total };
}

/**
 * Position and heading at fraction `t` (0..1) of the total length.
 *
 * The heading is the segment's direction and therefore **snaps** at each
 * vertex rather than easing through the corner. That is exactly what CSS
 * `offset-rotate: auto` does on a polyline, and reproducing the discontinuity
 * is what makes the shipping port faithful.
 */
/**
 * Read a buffer slot as a plain number.
 *
 * `noUncheckedIndexedAccess` types `Float64Array[i]` as `number | undefined`
 * even though a typed array can never hold a hole — every index is either in
 * range or reads as NaN, never `undefined`. One helper is honest about that
 * and keeps the maths below free of guards that could never fire.
 */
function at(buf: Float64Array, i: number): number {
  return buf[i] ?? 0;
}

export function poseAt(path: MeasuredPath, t: number): Pose {
  const n = path.xs.length;
  if (n === 0) return ORIGIN;
  if (n === 1 || path.length === 0) {
    return { x: at(path.xs, 0), y: at(path.ys, 0), angle: 0 };
  }

  const target = Math.min(Math.max(t, 0), 1) * path.length;

  // Linear scan: these paths have a handful of vertices, so this beats a
  // binary search and stays obvious. Swap if a scene ever needs hundreds.
  let seg = 0;
  while (seg < n - 2 && at(path.cumulative, seg + 1) < target) seg += 1;

  const x0 = at(path.xs, seg);
  const y0 = at(path.ys, seg);
  const x1 = at(path.xs, seg + 1);
  const y1 = at(path.ys, seg + 1);
  const segStart = at(path.cumulative, seg);
  const segLength = at(path.cumulative, seg + 1) - segStart;
  const k = segLength > 0 ? (target - segStart) / segLength : 0;

  return {
    x: x0 + (x1 - x0) * k,
    y: y0 + (y1 - y0) * k,
    angle: Math.atan2(y1 - y0, x1 - x0),
  };
}
