/**
 * The registry of enriched country profiles.
 *
 * One list, imported by both the applier and the tests, so a new country is
 * covered by the stored-profile guards (declared rate basis, matching
 * inflation assumption) the moment it is added here — rather than only if
 * someone remembers to extend the test.
 */
import { INDONESIA } from "./indonesia";
import type { CountryProfile } from "./indonesia";

export type { CountryProfile, ProfileField } from "./indonesia";

export const PROFILES: CountryProfile[] = [INDONESIA];
