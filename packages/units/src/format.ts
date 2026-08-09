/**
 * Display formatting for derived and benchmark numbers.
 *
 * The style guide's rule: never render precision the number doesn't have.
 * Derived values come out of chains like distance × roundtrips × GJ/nm ÷ LHV
 * whose inputs carry three or four significant figures at best, so the UI
 * shows four by default. Display-only — the full value stays in the scenario,
 * in the engine and in exported JSON. Values the user typed are NEVER passed
 * through this: an override shows exactly what was entered.
 */

/**
 * Format to `sig` significant figures with thousands grouping.
 *
 * `9806.451613 → "9,806"`, `2580.6451… → "2,581"`, `0.0554 → "0.0554"`,
 * `92.4 → "92.4"`. Trailing fractional zeros are dropped (`900 → "900"`,
 * not `"900.0"`); integers keep their magnitude (never collapse to
 * exponent notation for the sizes this app shows).
 */
export function formatSig(n: number, sig = 4): string {
  if (!Number.isFinite(n)) return String(n);
  if (n === 0) return "0";

  // Number() collapses toPrecision's exponent form back to plain digits
  // (9.806e+4 → 98060) for every magnitude this app displays.
  const rounded = Number(n.toPrecision(sig));

  // Split so the integer part gets grouping and the fraction keeps only what
  // toPrecision left (minus trailing zeros, which Number() already dropped).
  const [intPart, fracPart] = Math.abs(rounded).toString().split(".");
  const grouped = Number(intPart).toLocaleString("en-US");
  const sign = rounded < 0 ? "-" : "";
  return fracPart !== undefined ? `${sign}${grouped}.${fracPart}` : `${sign}${grouped}`;
}
