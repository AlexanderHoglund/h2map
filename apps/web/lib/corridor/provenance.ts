/**
 * Source notes, made fit for the user's eyes.
 *
 * Reference rows carry `sourceNote` strings written for the data's own
 * audit trail: spreadsheet cell addresses ("Data_tables!B17"), dataset
 * version prefixes ("2026-08-17-vessel-v3:"), and internal quality-tier
 * codes ("B:", "CAPEX A, OPEX A"). None of that means anything to a user —
 * the cells point into files they do not have and the codes are unexplained.
 * This strips the internals and keeps whatever human sentence remains; when
 * nothing remains, the caller falls back to a plain label instead.
 *
 * Display-only by design: the data keeps its full notes for auditing, and
 * nothing here feeds the engine.
 */
export function sourceLabel(note: string | undefined): string | undefined {
  if (!note) return undefined;
  const cleaned = note
    // spreadsheet cell references, parenthesised or bare
    .replace(/\(\s*Data_tables![A-Z]+\d+\s*\)/gi, "")
    .replace(/Data_tables![A-Z]+\d+/gi, "")
    // dataset-version prefixes: "2026-08-17-vessel-v3:"
    .replace(/\b\d{4}-\d{2}-\d{2}-[a-z-]+-v\d+:\s*/gi, "")
    // internal quality-tier codes: a leading "B:" and "CAPEX A, OPEX A"
    .replace(/^\s*[A-C]:\s*/, "")
    .replace(/;?\s*CAPEX [A-C], OPEX [A-C]/g, "")
    // tier tags like "[S]"
    .replace(/\s*\[[A-Z]\]\s*/g, " ")
    // leftover separators
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-–—·;,]+|[\s\-–—·;,]+$/g, "")
    .trim();
  return cleaned.length > 0 ? cleaned : undefined;
}
