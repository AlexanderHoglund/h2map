/**
 * Display formatters for §29's tables — pure, no React, so the scripts-side
 * tests can pin the exact strings the docs render without pulling in JSX.
 */

const MINUS = "−";

/** "$167.5m" / "−$462.9m"; a magnitude that rounds to zero drops its sign. */
export const usdM = (v: number): string => {
  const mag = Math.abs(v).toFixed(1);
  return `${v < 0 && mag !== "0.0" ? MINUS : ""}$${mag}m`;
};

/** "$2,506/t" / "−$6,928/t" — whole dollars; the cents are noise here. */
export const usdPerT = (v: number): string => {
  const mag = Math.round(Math.abs(v));
  return `${v < 0 && mag !== 0 ? MINUS : ""}$${mag.toLocaleString("en-US")}/t`;
};

/**
 * The lead table's one number: the effect of ONE nudge (+10%, or +1pp for
 * rates) on an output, as a signed percent a person can read — "−9.2%" means
 * the output falls 9.2% when the input rises 10%. Takes the artifact's
 * `effect` (a fraction); an effect that rounds to zero drops its sign, so a
 * measured zero reads "0.0%" rather than "−0.0%".
 */
export const effectPercent = (effect: number): string => {
  const mag = Math.abs(effect * 100).toFixed(1);
  if (mag === "0.0") return "0.0%";
  return `${effect < 0 ? MINUS : "+"}${mag}%`;
};
