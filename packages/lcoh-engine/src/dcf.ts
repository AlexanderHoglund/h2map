/**
 * Discounted-cashflow helpers.
 *
 * Discount factors are accumulated multiplicatively (df[t] = df[t-1]/(1+r))
 * rather than via Math.pow, so results are bit-identical across platforms —
 * a requirement of the golden-file regression suite.
 */

/** Discount factors for years 0..n (index 0 = 1, i.e. undiscounted year 0). */
export function discountFactors(rate: number, years: number): Float64Array {
  const df = new Float64Array(years + 1);
  df[0] = 1;
  const divisor = 1 + rate;
  for (let t = 1; t <= years; t++) {
    df[t] = df[t - 1]! / divisor;
  }
  return df;
}

/**
 * Present value of an annual series. `series[t]` is the cashflow in year t
 * (index 0 = year 0); the series may be shorter than the factor array.
 */
export function presentValue(
  series: ArrayLike<number>,
  df: Float64Array,
): number {
  let pv = 0;
  for (let t = 0; t < series.length; t++) {
    pv += series[t]! * df[t]!;
  }
  return pv;
}
