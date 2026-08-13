/**
 * Differentiated green financing (sprint 4, task 1): the interest saving —
 * or premium — on the side's debt-financed capital, relative to financing
 * it at the corridor's base rate, as an EXPLICIT per-year line.
 *
 * Deliberately NOT a per-side discount rate. In a cost model the discount
 * rate expresses time preference over costs, so a LOWER green rate makes
 * future costs LARGER in present value — the exact inversion of the benefit
 * (the methodology carries the worked $140.6m example). Cheap financing is a
 * reduction in interest actually paid; the model charges no interest line,
 * so the benchmark divergence is the whole effect.
 *
 * Outstanding balance ("define it once, keep it simple"): principal accrues
 * with the capital drawdown — so capital phasing flows through when enabled
 * — then amortizes per structure. With P = Σ capex × debtShare and tenor T:
 *   cumdraw_t = Σ_{k ≤ t} capex_k × debtShare
 *   amortizing: outstanding_t = min(cumdraw_t, P × (T − t + 1) / T)
 *   bullet:     outstanding_t = cumdraw_t                   (t ≤ T, else 0)
 *   line_t = −outstanding_t × (baseRate − greenRate)
 * Unphased capital reduces this to the planning-level benchmark shapes:
 * straight-line principal or full balance to maturity — a simplification,
 * not a term sheet. Negative Δr (a green premium) is allowed and never
 * clamped: the line then carries a positive cost.
 */

import type { FinancingParams } from "@h2map/corridor-schema";

export function financingLineUsdM(
  cfg: FinancingParams,
  capexByYearUsdM: readonly number[],
): number[] {
  const deltaR = cfg.baseRate - cfg.greenRate;
  const T = cfg.tenorYears;
  const principal =
    capexByYearUsdM.reduce((acc, v) => acc + v, 0) * cfg.debtShare;

  let cumdraw = 0;
  return capexByYearUsdM.map((capex, i) => {
    const t = i + 1;
    cumdraw += capex * cfg.debtShare;
    if (t > T) return 0;
    const outstanding =
      cfg.structure === "amortizing"
        ? Math.min(cumdraw, (principal * (T - t + 1)) / T)
        : cumdraw;
    return -outstanding * deltaR;
  });
}
