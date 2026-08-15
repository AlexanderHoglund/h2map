/**
 * Discount-rate basis: keeping real and nominal apart.
 *
 * The LCOH engine discounts constant-USD cashflows with no escalation term,
 * which makes it a REAL framework — so the rate it consumes must be real.
 * Most published cost-of-capital figures are not. The IEA Cost of Capital
 * Observatory, the source of the enriched Indonesian 9.4%, reports NOMINAL
 * post-tax rates in local currency. Feeding that straight in overstates
 * LCOH by 7.7% (measured at the West Timor cell, -9.1/124.7: 9.4% consumed
 * as real vs the Fisher-converted 6.4%).
 *
 * The failure is silent, which is what makes it dangerous: a nominal rate is
 * a perfectly plausible number in the same range, so nothing looks wrong.
 * The defence is to make the basis a REQUIRED, TYPED part of any rate that
 * enters the system, so an un-labelled rate cannot be stored at all.
 *
 * The literature genuinely disagrees about the right figure — an Indonesian
 * PV study uses a real 9.5%, which is close to the IEA's nominal 9.4% but
 * means something quite different. That is precisely why this module records
 * number + basis + technology + year rather than adjudicating a single
 * "correct" value.
 */

/** How a published rate is quoted. Never infer this — it must be stated. */
export type RateBasis = "real" | "nominal";

export interface QuotedRate {
  value: number;
  basis: RateBasis;
  /** ISO 4217 of the quote, e.g. "IDR". A nominal rate is currency-specific. */
  currency: string;
  /** Publication year of the figure, not the year it was retrieved. */
  sourceYear: number;
  /**
   * What the cost of capital was measured FOR. We borrow solar-PV costs of
   * capital for hydrogen projects, which is a real simplification: hydrogen
   * carries offtake risk that a contracted PPA does not. Recorded so the
   * borrowing is visible rather than assumed away.
   */
  technology: string;
  source: string;
}

export interface InflationAssumption {
  /** Fraction per year, e.g. 0.0282. */
  value: number;
  currency: string;
  sourceYear: number;
  source: string;
}

/**
 * Fisher: r_real = (1 + r_nominal) / (1 + inflation) − 1.
 *
 * Deliberately the exact form, not the r − i approximation: at 9.4% and
 * 2.82% the approximation gives 6.58% against the exact 6.40%, and that
 * 18 bp propagates into every discounted cashflow.
 */
export function fisherReal(nominal: number, inflation: number): number {
  return (1 + nominal) / (1 + inflation) - 1;
}

/**
 * Resolve a quoted rate to the real rate the engine requires.
 *
 * A real rate passes through untouched. A nominal rate REQUIRES a matching
 * inflation assumption — and one quoted in the same currency, because
 * deflating an IDR-nominal rate by US inflation is not a conversion, it is
 * a category error that happens to produce a number.
 */
export function toRealRate(
  rate: QuotedRate,
  inflation: InflationAssumption | undefined,
): number {
  if (rate.basis === "real") return rate.value;
  if (!inflation) {
    throw new Error(
      `${rate.currency} rate is nominal (${rate.source}) but no inflation assumption was supplied; ` +
        "a nominal rate cannot be used in a real DCF",
    );
  }
  if (inflation.currency !== rate.currency) {
    throw new Error(
      `cannot deflate a ${rate.currency} nominal rate with ${inflation.currency} inflation — ` +
        "the currencies must match",
    );
  }
  return fisherReal(rate.value, inflation.value);
}
