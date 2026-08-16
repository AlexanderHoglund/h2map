/**
 * Number formatting for the corridor UI — ONE definition per convention.
 *
 * These lived as private copies inside three components: `ResultsPanel`,
 * `ResultsSummary` (byte-identical duplicates) and `CorridorClient` (inlined
 * a third time). Predictably they drifted, and the drift was visible on
 * screen — the same gap read `$1,690.00m` in the KPI strip and `$1,690m` in
 * the chart directly beneath it, and abatement read `$1,215/t` on its card
 * against `$1,215.239/t` in its own tooltip.
 *
 * TWO $m conventions is deliberate, and the distinction is by CONTEXT, not
 * by value:
 *
 *   usdM       tables, KPIs, tooltips — anywhere a reader may compare
 *              digits or copy a figure. Always 2dp, so a column of numbers
 *              aligns and nothing looks rounded away.
 *   usdMShort  chart bar labels and captions, where the number is read at a
 *              glance and trailing zeros on a $1,690m figure are noise.
 *
 * Anything read as $/tonne uses `usd`: whole dollars, always. Sub-dollar
 * precision on an abatement cost is false precision, and it was the source
 * of the card-vs-tooltip mismatch.
 */

/**
 * Full-precision $m: always 2dp. Tables, KPIs, tooltips.
 *
 * The sign goes OUTSIDE the currency symbol. Every previous copy of this
 * interpolated the raw number, so a negative delta rendered "$-195.92m" —
 * visible today in the decomposition table's delta column.
 */
export function usdM(n: number): string {
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}m`;
}

/**
 * Magnitude-aware $m for chart labels: whole millions at $100m and above,
 * 2dp below.
 *
 * Note the minimumFractionDigits — without it the small branch renders
 * "$12.5m" and "$0.5m" alongside "$60.75m", which is the same inconsistency
 * this module exists to remove. It only ever had a maximum before.
 */
export function usdMShort(n: number): string {
  const whole = Math.abs(n) >= 100;
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", {
    maximumFractionDigits: whole ? 0 : 2,
    minimumFractionDigits: whole ? 0 : 2,
  })}m`;
}

/** Signed $m, for a delta column where the direction carries meaning. */
export function usdMSigned(n: number): string {
  return `${n > 0 ? "+" : ""}${usdM(n)}`;
}

/** Whole dollars — $/tonne and $/tCO2. Never sub-dollar. */
export function usd(n: number): string {
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  })}`;
}

/** Whole number with thousands separators. */
export function int(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** Readable form of a benchmark id ("e-ammonia" -> "E-ammonia"). */
export function idLabel(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/** Round to 2dp — for chart DATA, not display. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
