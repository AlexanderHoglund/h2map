/**
 * Deliberately crude horizontal-plane PV proxy for sanity comparison ONLY:
 * CF ≈ GHI/1000 W/m² × 0.9 performance ratio, capped at 1. No transposition,
 * no temperature model. PVGIS seriescalc is the authoritative PV source in
 * the spike; this exists to cross-check gross magnitudes and correlation.
 */
export function crudePvCf(ghiWm2: number | null): number | null {
  if (ghiWm2 === null || !Number.isFinite(ghiWm2) || ghiWm2 < 0) return null;
  return Math.min(1, (ghiWm2 / 1000) * 0.9);
}
