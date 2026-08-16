/**
 * Publish 2026-08-18-fuel-v4: the vessel catalogue of v3, with the fuel rows
 * re-based from researched data.
 *
 * Bundles are IMMUTABLE — a change publishes a new id, never an edit (see
 * ref/bundle.ts and the bundle's own source.note). So this composes a NEW
 * bundle from two sources:
 *
 *   - everything that is not a fuel (vesselTypes, countries, benchmarkRules,
 *     fuelEmissions, constants, schedules, regulationDefaults, and the
 *     vessel derivation blocks) copied BYTE-IDENTICAL from v3, and asserted
 *     so;
 *   - the fuel rows, carrying the researched costs and their provenance.
 *
 * THE MIRROR IMAGE OF build-vessel-bundle.ts, which asserts `fuels` is
 * byte-identical to v1 and would throw the moment a fuel row moved. That
 * assertion is right for a vessel re-base and wrong for this one, so the
 * lists are swapped rather than the guard being weakened.
 *
 * WHAT IS ADDED, AND WHAT IS DELIBERATELY LEFT ALONE
 *
 * Added per fuel: a `research` block (production $/tpa at a stated reference
 * nameplate, port storage, bunkering, merchant price, vessel premium — each
 * with its own `verified` flag and real `sources[]`), and an
 * `incumbentInfrastructure` flag.
 *
 * The FLAT SCALARS STAY, unchanged, beside the research block. They are what
 * a bundle without research resolves through, four UI sites interpolate
 * `sourceNote` into a template string, and build-vessel-bundle.ts
 * concatenates it behind an `as string` cast. Removing them would be a flag
 * day for no gain: the resolver already prefers the research block when it
 * is present.
 *
 * `verified` is NOT rounded up. 13 of the 30 researched blocks are verified
 * and 17 are honestly false — bunkering is sourceable nowhere for any fuel,
 * and everything about LH2 is extrapolation because nothing at bunker scale
 * has been built. The UI badge exists to say so.
 *
 * Run: npx tsx scripts/corridor/build-fuel-bundle.ts
 */

import { readFileSync, writeFileSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url);
const PREV_ID = "2026-08-17-vessel-v3";
const NEW_ID = "2026-08-18-fuel-v4";
const RESEARCH = "docs/corridor/research/fuel-benchmarks-v1.json";

/**
 * Fuels that ride infrastructure already present at a commercial bunker
 * port. This is the axis that replaced the fossil/green branch: LNG is
 * fossil and still needs a full cryogenic terminal, while a biodiesel blend
 * goes into existing product tankage through the incumbent barge fleet.
 */
const INCUMBENT_INFRASTRUCTURE = new Set(["lsfo", "biodiesel-hvo"]);

interface ResearchFile {
  researchId: string;
  researchedAt: string;
  fuels: {
    id: string;
    production: unknown;
    portStorage: unknown;
    bunkering: unknown;
    merchantPrice: unknown;
    vesselCapexPremium: unknown;
  }[];
  regulationDefaults: { eurUsd: { value: number; sources: unknown[] } };
}

/** Sections that must be carried across untouched, and asserted so. */
const CARRIED = [
  "vesselTypes",
  "vesselTypeAliases",
  "vesselDerivation",
  "countries",
  "benchmarkRules",
  "fuelEmissions",
  "constants",
  "schedules",
  "schemaVersion",
] as const;

function main(): void {
  const prev = JSON.parse(
    readFileSync(new URL(`data/corridor-ref/${PREV_ID}.json`, ROOT), "utf8"),
  ) as Record<string, unknown>;
  const research = JSON.parse(
    readFileSync(new URL(RESEARCH, ROOT), "utf8"),
  ) as ResearchFile;

  const byId = new Map(research.fuels.map((f) => [f.id, f]));
  const prevFuels = prev.fuels as Record<string, unknown>[];

  // Every fuel in the bundle must be researched. A silent miss would leave a
  // row on its spreadsheet-cell provenance while its neighbours moved.
  for (const f of prevFuels) {
    if (!byId.has(f.id as string)) {
      throw new Error(`fuel "${String(f.id)}" has no researched counterpart`);
    }
  }

  const fuels: Record<string, unknown>[] = prevFuels.map((f) => {
    const r = byId.get(f.id as string)!;
    return {
      ...f,
      incumbentInfrastructure: INCUMBENT_INFRASTRUCTURE.has(f.id as string),
      research: {
        production: r.production,
        portStorage: r.portStorage,
        bunkering: r.bunkering,
        merchantPrice: r.merchantPrice,
        vesselCapexPremium: r.vesselCapexPremium,
      },
    };
  });

  const out: Record<string, unknown> = {
    ...prev,
    bundleId: NEW_ID,
    source: {
      ...(prev.source as Record<string, unknown>),
      note:
        `Fuel cost rows re-based from ${research.researchId} (researched ` +
        `${research.researchedAt}; see docs/corridor/research/). Every fuel ` +
        `row previously cited a spreadsheet cell (Data_tables!B15-B20) and ` +
        `claimed verified:true on that basis. The flat scalars are retained ` +
        `unchanged beside the new research block so a consumer reading them ` +
        `is unaffected. Every non-fuel section is copied byte-identical from ` +
        `${PREV_ID}. Reference data is immutable: any change is a NEW bundle ` +
        `id, never an edit.`,
      fuelMethod:
        "Production capex is USD per tonne-per-annum at a stated reference " +
        "nameplate, scale-corrected against the corridor's own demand — the " +
        "flat scalar charged a 15 kt/yr corridor the same as a 600 kt/yr " +
        "one. Scope is a complete export-ready complex INCLUDING dedicated " +
        "renewables, which is NOT the synthesis-island scope of " +
        "SynthesisBenchmark.plantCapexUsdPerTpa. capexUsdPerTpa.central is " +
        "already FOAK-inclusive (anchored on NEOM at financial close and AM " +
        "Green at FID); foakMultiplier applies to a NOAK or study-derived " +
        "baseline only and the resolver deliberately does not apply it.",
    },
    fuels,
  };

  // --- assert the non-fuel sections really are byte-identical -------------
  // The mirror of build-vessel-bundle.ts, which asserts `fuels` against v1.
  for (const key of CARRIED) {
    const a = JSON.stringify(prev[key]);
    const b = JSON.stringify(out[key]);
    if (a !== b) throw new Error(`${key} is not byte-identical to ${PREV_ID}`);
  }

  // --- assert the fuel rows changed ONLY by addition ----------------------
  // The researched figures live in `research`; the flat scalars must survive
  // untouched, because that is what an older consumer still reads.
  for (const [i, f] of fuels.entries()) {
    const before = { ...prevFuels[i]! };
    const after = { ...(f as Record<string, unknown>) };
    delete after.research;
    delete after.incumbentInfrastructure;
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      throw new Error(`fuel "${String(f.id)}" changed beyond the added blocks`);
    }
  }

  writeFileSync(
    new URL(`data/corridor-ref/${NEW_ID}.json`, ROOT),
    JSON.stringify(out, null, 2) + "\n",
    "utf8",
  );

  // The vessel catalogue exists because §19's table was once a hand-copied
  // literal that went stale every time the data changed. Fuels had no
  // equivalent, so re-basing prices would have recreated exactly that
  // problem. Emit one.
  const docRows = fuels.map((f) => {
    const r = (f as { research: { production: { capexUsdPerTpa: { central: number }; referenceNameplateTonnesPerYear: number; scaleExponent: { central: number }; verified: boolean }; merchantPrice: { usdPerTonne: { central: number }; priceType: string; assessmentDate: string; verified: boolean }; portStorage: { capexUsdM: { central: number }; verified: boolean }; bunkering: { capexUsdM: { central: number }; verified: boolean }; vesselCapexPremium: { fraction: { central: number }; verified: boolean } } }).research;
    return {
      id: f.id as string,
      label: f.label as string,
      family: f.family as string,
      incumbentInfrastructure: f.incumbentInfrastructure,
      productionCapexUsdPerTpa: r.production.capexUsdPerTpa.central,
      productionReferenceTpa: r.production.referenceNameplateTonnesPerYear,
      productionScaleExponent: r.production.scaleExponent.central,
      productionVerified: r.production.verified,
      merchantPriceUsdPerTonne: r.merchantPrice.usdPerTonne.central,
      merchantPriceType: r.merchantPrice.priceType,
      merchantPriceAssessedAt: r.merchantPrice.assessmentDate,
      merchantPriceVerified: r.merchantPrice.verified,
      portStorageCapexUsdM: r.portStorage.capexUsdM.central,
      portStorageVerified: r.portStorage.verified,
      bunkeringCapexUsdM: r.bunkering.capexUsdM.central,
      bunkeringVerified: r.bunkering.verified,
      vesselCapexPremium: r.vesselCapexPremium.fraction.central,
      vesselCapexPremiumVerified: r.vesselCapexPremium.verified,
    };
  });
  writeFileSync(
    new URL("data/corridor-ref/fuel-catalogue.json", ROOT),
    JSON.stringify(
      {
        generatedBy: "scripts/corridor/build-fuel-bundle.ts",
        bundleId: NEW_ID,
        researchId: research.researchId,
        note:
          "Central figures only — the bundle carries the full low/central/high " +
          "band and the sources. Production capex is $/tpa at the stated " +
          "reference, NOT an absolute: it is scale-corrected against the " +
          "corridor's demand at resolution. A false `verified` is a real " +
          "finding, not a gap to fill.",
        rows: docRows,
      },
      null,
      1,
    ) + "\n",
    "utf8",
  );

  const verified = docRows.filter((r) => r.productionVerified).length;
  console.log(
    `wrote data/corridor-ref/${NEW_ID}.json (${fuels.length} fuels, ` +
      `${verified} with a verified production block) + fuel-catalogue.json`,
  );
}

main();
