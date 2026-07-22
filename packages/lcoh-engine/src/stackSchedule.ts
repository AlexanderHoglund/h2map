/**
 * Stack-replacement scheduling: a replacement CAPEX event is charged in the
 * operating year during which cumulative electrolyzer operating hours cross
 * a multiple of the stack lifetime. Operating hours are calendar hours with
 * load > 0 (not full-load-equivalent) — see docs/ENGINE_NOTES.md.
 *
 * A replacement whose crossing falls in the final operating year is skipped:
 * no operator replaces a stack the year the plant retires. The source doc is
 * silent on this; the decision is logged in ENGINE_NOTES.md.
 */
export function stackReplacementYears(
  operatingHoursPerYear: number,
  stackLifetimeHours: number,
  lifetimeYears: number,
): number[] {
  if (operatingHoursPerYear <= 0) return [];
  const years: number[] = [];
  let cumulative = 0;
  let nextThreshold = stackLifetimeHours;
  for (let t = 1; t <= lifetimeYears; t++) {
    cumulative += operatingHoursPerYear;
    while (cumulative >= nextThreshold) {
      if (t < lifetimeYears) years.push(t);
      nextThreshold += stackLifetimeHours;
    }
  }
  return years;
}
