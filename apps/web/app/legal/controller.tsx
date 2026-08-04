/**
 * ⚠️ FILL BEFORE PUBLISHING — see `docs/LEGAL_NOTES.md`.
 *
 * The identifying facts a privacy notice must state (GDPR Art. 13(1)(a),(f),
 * 13(2)(d)). They live in ONE constant, imported by both legal pages, so a
 * value cannot be right in one section and stale in another.
 *
 * Deliberately NOT environment variables: this is public, permanent,
 * legally-significant text that belongs in git history and in the diff record
 * — an env var would hide it from review and from the evidential trail.
 *
 * Three layers stop a placeholder reaching production:
 *   1. this single grep target,
 *   2. `<Todo>` renders unfilled values as obvious orange boxes,
 *   3. `e2e/legal.anon.spec.ts` FAILS if "TODO" survives in either page.
 */

export const TODO_PREFIX = "«TODO";

export const CONTROLLER = {
  legalName: "«TODO: registered legal name»",
  address: "«TODO: registered address»",
  registrationNumber: "«TODO: company / VAT registration number»",
  contactEmail: "«TODO: contact email»",
  supervisoryAuthority: "«TODO: supervisory authority»",
  supervisoryAuthorityUrl: "«TODO: supervisory authority website»",
  /** Where the Supabase project is hosted — check the dashboard, not the repo. */
  supabaseRegion: "«TODO: Supabase project region»",
  hostingProvider: "«TODO: hosting provider»",
} as const;

/** The date the text last changed. Hardcoded on purpose — a policy whose date
 *  advances by itself is worthless as a record of what it said when. */
export const LAST_UPDATED = "2026-08-04";

/**
 * Renders a value, boxing it in warning colours while it is still a
 * placeholder. An unfilled notice then looks obviously broken on the live page
 * instead of reading as a plausible sentence.
 */
export function Todo({ children }: { children: string }) {
  if (!children.startsWith(TODO_PREFIX)) return <>{children}</>;
  return (
    <span className="border border-warning px-1 font-mono text-[11px] text-warning">
      {children}
    </span>
  );
}
