/**
 * Discounting and inflation (Calculation rows 34/59 and the ×(1+infl)^(idx−1)
 * OPEX growth). Both use the (idx − 1) exponent convention: year 1 is
 * uninflated and its discount factor is exactly 1 ((1+r)**0 === 1 in IEEE),
 * which is why the fixture's green CAPEX PV is exactly 97. Computed per-year
 * directly (matching Excel's per-column independence), never as a running
 * cumulative product.
 */

import type { Fraction, YearIndex } from "@h2map/units";

/** Row 34/59: 1 / (1 + wacc)^(idx − 1). */
export function discountFactor(wacc: Fraction, idx: YearIndex): number {
  return 1 / (1 + wacc) ** (idx - 1);
}

/** OPEX growth: (1 + inflation)^(idx − 1). */
export function inflationFactor(inflation: Fraction, idx: YearIndex): number {
  return (1 + inflation) ** (idx - 1);
}
