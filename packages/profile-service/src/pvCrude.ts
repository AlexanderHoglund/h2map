/**
 * Deliberately crude horizontal-plane PV proxy: CF ≈ GHI/1000 W/m² × 0.9
 * performance ratio, capped at 1. No transposition, no temperature model.
 * Used ONLY as the last-resort PV fallback when PVGIS is unavailable; the
 * profile is labeled with provider "open-meteo-crude" so consumers can see
 * the fidelity drop.
 */
export function crudePvCf(ghiWm2: number | null): number | null {
  if (ghiWm2 === null || !Number.isFinite(ghiWm2) || ghiWm2 < 0) return null;
  return Math.min(1, (ghiWm2 / 1000) * 0.9);
}
