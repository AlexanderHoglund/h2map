/**
 * Leap-year helper: drop Feb 29 (UTC hours 1416–1439 of a leap year) so an
 * 8784-hour series becomes the engine's required 8760. The 2022 spike year
 * is non-leap, so this ships for future fetches only.
 */
export function trimLeapDay<T>(hourly: readonly T[]): T[] {
  if (hourly.length !== 8784) return [...hourly];
  return [...hourly.slice(0, 1416), ...hourly.slice(1440)];
}
