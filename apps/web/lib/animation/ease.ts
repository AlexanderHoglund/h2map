/**
 * Easing curves shared by scenes. Pure maths, no canvas, no time source —
 * callers feed them phase fractions derived from `frame.time`.
 */

/** Hermite smoothstep on [0,1]: zero slope at both ends. */
export function smoothstep(u: number): number {
  const k = Math.min(Math.max(u, 0), 1);
  return k * k * (3 - 2 * k);
}

/**
 * Ease in and out of a berth: a vessel decelerates as it comes alongside,
 * holds nothing back mid-leg, then accelerates away. `smoothstep` on the
 * outer ~fifths of the leg, linear in the middle — so cruising speed reads
 * constant and only the arrivals are soft.
 */
export function berthEase(u: number): number {
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
