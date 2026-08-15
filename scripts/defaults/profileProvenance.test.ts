import { describe, expect, it } from "vitest";
import { PROFILES } from "./profiles";

/**
 * Provenance guards on enriched profiles.
 *
 * "Enriched · 2026-08-15" records WHEN somebody looked, not what they found.
 * A reader deciding whether to trust a number needs the vintage of the
 * figure and what kind of quantity it is — a retail tariff and a PPA price
 * are both "electricity" and are not interchangeable. These assert the
 * fields exist rather than checking their prose.
 */
describe("enriched profile provenance", () => {
  it("cites a source and a retrieval date for every curated field", () => {
    for (const profile of PROFILES) {
      for (const [name, f] of Object.entries(profile.fields)) {
        expect(f.source.length, `${profile.iso2}.${name}`).toBeGreaterThan(20);
        expect(f.retrievedAt, `${profile.iso2}.${name}`).toMatch(
          /^\d{4}-\d{2}-\d{2}$/,
        );
      }
    }
  });

  it("records the figure's publication year, not just when it was fetched", () => {
    for (const profile of PROFILES) {
      for (const [name, f] of Object.entries(profile.fields)) {
        // Rate fields carry the year inside `rate`; others carry sourceYear.
        const year = f.rate?.sourceYear ?? f.sourceYear;
        expect(year, `${profile.iso2}.${name} needs a source year`).toBeDefined();
        expect(year!).toBeGreaterThan(2000);
        // A figure cannot be published after it was retrieved.
        expect(year!).toBeLessThanOrEqual(
          Number(f.retrievedAt.slice(0, 4)),
        );
      }
    }
  });

  it("states a basis wherever the quantity is ambiguous", () => {
    // The electricity price is the case that bit: it prices GRID IMPORTS,
    // and the calculator's PV/wind slots are captive generation with their
    // own pricing. Without a stated basis a reader assumes it prices
    // everything, and then wonders why the result did not move.
    for (const profile of PROFILES) {
      const elec = profile.fields.electricity_price_usd_mwh;
      if (!elec) continue;
      expect(elec.basis, `${profile.iso2}: electricity needs a basis`).toBeDefined();
      expect(elec.basis!).toMatch(/grid|retail|tariff/i);
    }
  });

  it("marks a field unverified rather than presenting it as solid", () => {
    // Not a requirement that anything BE unverified — a check that the flag
    // is a real boolean on every field, so "unverified" is a positive
    // statement rather than an absent property.
    for (const profile of PROFILES) {
      for (const [name, f] of Object.entries(profile.fields)) {
        expect(typeof f.verified, `${profile.iso2}.${name}`).toBe("boolean");
      }
    }
  });
});
