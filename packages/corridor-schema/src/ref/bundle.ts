/**
 * Reference-bundle types + parser. Bundles are immutable and versioned
 * (`data/corridor-ref/<bundleId>.json`); a change publishes a NEW bundle id.
 * File I/O belongs to the consumer — this module parses an already-loaded
 * unknown into a typed bundle.
 */

import { z } from "zod";

const vesselTypeSchema = z.object({
  id: z.string(),
  label: z.string(),
  /** PER SHIP. The engine multiplies by `cargo.vessels` (schema v7). */
  capexUsdM: z.number(),
  opexUsdMPerYear: z.number(),
  /**
   * DEAD since schema v7 removed `consumptionMode`: consumption always
   * derives from corridor geometry, so nothing reads this. Optional so a
   * researched bundle need not invent one; the 2026-07-30 bundle still
   * carries it and the v6→v7 migration pins its own frozen copy.
   */
  fuelTonnesPerYear: z.number().optional(),
  /**
   * Whole-voyage energy per nautical mile — the figure consumption derives
   * from. Meaningless without `serviceSpeedKn`: it is measured AT a speed,
   * and GJ/nm scales with v² (not v³ — see `vesselDerivation.speedLaw`).
   */
  gjPerNm: z.number(),
  verified: z.boolean(),
  sourceNote: z.string(),

  // --- 2026-08-16 research catalogue, all OPTIONAL ---------------------
  // Additive per the bundle's extension rule (the `prodNameplateTonnesPerYear`
  // precedent below): the 2026-07-30 bundle carries none of these and must
  // keep parsing unchanged.

  /** EEDI reference-line family: bulk | tanker | chemical | container | … */
  family: z.string().optional(),
  dwtTonnes: z.number().positive().optional(),
  teuCapacity: z.number().positive().optional(),
  defaultCargoUnit: z.enum(["tonne", "teu", "passenger"]).optional(),

  // --- 2026-08-21 cruise catalogue (waves C1-C5), all OPTIONAL ----------
  // Additive per the same extension rule. Passenger vessels are priced and
  // costed per GROSS TON, not per deadweight tonne, and carry a hotel that
  // burns fuel every day of the year regardless of speed.

  /**
   * Gross tonnage — the denominator cruise capex and technical opex were
   * researched on ($/GT is near-flat across the 190-5,610-berth ladder,
   * elasticity −0.11; technical opex converges at $195/GT/yr across
   * Carnival, RCL and NCLH filings). Reference data; not consumed by the
   * engine.
   */
  grossTonnage: z.number().positive().optional(),
  /**
   * Lower berths — the passenger-capacity identity (occupancy runs
   * 105-110% of it; mega-ships carry up to 1.35x in upper berths).
   * Presentational: the engine does not couple throughput to capacity for
   * any cargo unit.
   */
  lowerBerths: z.number().positive().optional(),
  /**
   * Fuel energy for hotel services (accommodation, galleys, HVAC, reefer),
   * GJ/day, for ALL 365 days — at sea and at berth alike — and
   * SPEED-INDEPENDENT. The third energy term: consumption derivation adds
   * `hotelLoadGjPerDay x 365` per vessel-year OUTSIDE the v² speed factor,
   * because hotel energy does not fall when the ship slows (the MRV closure
   * test puts the 2-term model at −20% under slow steaming for exactly this
   * reason). A row carrying this field MUST ship `portGjPerDay = 0`: berth
   * hotel load is inside this term, and a separate port rate would count it
   * twice.
   */
  hotelLoadGjPerDay: z.number().nonnegative().optional(),
  /**
   * Hotel operating cost (crew hotel payroll, food, onboard COGS), $m/yr.
   * DATA ONLY — excluded from the engine by designation: it is
   * fuel-invariant, so it cancels in the corridor gap and in the
   * incremental cost per passenger, and including it would turn a
   * fuel-transition comparator into a cruise P&L. Carried so the number is
   * on the row with its provenance, not lost.
   */
  hotelOpexUsdMPerYear: z.number().nonnegative().optional(),
  /**
   * The speed `gjPerNm` was measured at. NOT decoration — a GJ/nm figure is
   * uninterpretable without it, and its absence in the first research pass
   * is what made the derived numbers look like they contradicted the study
   * reconstructions. Any UI showing GJ/nm must show this.
   *
   * METADATA, not an input (measured 2026-08-16): the model consumes
   * `gjPerNm` directly, so changing this field moves NOTHING — 10 kn vs
   * 20 kn is 0.0000% on all six headline KPIs. It tells a reader what the
   * energy figure means; it does not let them sail slower. Making speed a
   * real lever means adding a scenario input and applying the v² per-nm
   * correction in the consumption derivation, which is a modelling change
   * with its own decision to make, not a bundle field.
   */
  serviceSpeedKn: z.number().positive().optional(),
  /** Directional split; the equal-leg average reproduces `gjPerNm` exactly. */
  ladenGjPerNm: z.number().positive().optional(),
  ballastGjPerNm: z.number().positive().optional(),
  /**
   * Speed-INDEPENDENT day rates (no v² correction applies). All tier C —
   * the largest unsourced term in the catalogue. Their importance is a
   * property of the corridor, not the vessel: negligible on a 9,500 nm run,
   * a third of the fuel bill on a short one, hence the port-share warning.
   */
  portGjPerDay: z.number().nonnegative().optional(),
  idleGjPerDay: z.number().nonnegative().optional(),
  cargoSystemGjPerDay: z.number().nonnegative().optional(),
  /** Price basis year — the old table had none and silently aged. */
  costYear: z.number().int().optional(),
  /** Per-parameter tier strings: A sourced · B derived · C estimate. */
  provenance: z.record(z.string(), z.unknown()).optional(),
  /**
   * A superseded row kept so scenarios pinning its id reproduce their
   * ORIGINAL numbers. Never offered for new scenarios.
   */
  deprecated: z.boolean().optional(),
});

/**
 * A low/central/high band. Every band in the researched data is strictly
 * ASCENDING except `scaleExponent`, which preserves the bundle's existing
 * descending convention (low 0.95 / central 0.85 / high 0.75 — `low` holds
 * the numerically larger exponent, i.e. LESS discount at scale).
 *
 * That inconsistency is deliberate on the research side and is flagged here
 * rather than normalised: one field inverted against fifteen others is how a
 * low/high gets silently swapped later. Normalising it is a separate change,
 * because it would move numbers.
 */
const bandSchema = z.object({
  low: z.number(),
  central: z.number(),
  high: z.number(),
});

/**
 * One citation. Replaces the `sourceNote` string, which for every fuel row
 * was a spreadsheet cell address (`Data_tables!B17`) — not something a reader
 * can check, and not a basis for `verified: true`.
 *
 * `figureUsed` is the number AS PRINTED in the source, before any conversion
 * of ours; the conversion belongs in `note`. That separation is what makes a
 * figure traceable back to a page rather than to our arithmetic.
 */
const sourceRefSchema = z.object({
  title: z.string(),
  publisher: z.string(),
  year: z.number().int(),
  locator: z.string(),
  url: z.string(),
  figureUsed: z.string(),
  note: z.string(),
});

/**
 * Production cost as $/tpa at a STATED reference nameplate, so it can be
 * scale-corrected. The flat `prodCapexUsdM` scalar below charged a 15 kt/yr
 * corridor and a 600 kt/yr one the same $55m.
 *
 * SCOPE: a complete export-ready complex INCLUDING dedicated renewables.
 * This is NOT the same quantity as `SynthesisBenchmark.plantCapexUsdPerTpa`,
 * which is synthesis-island only because the LCOH engine carries generation
 * separately. Renewables plus electrolysis are ~73% of this number; feeding
 * one into the other would double-count them. `scopeIncluded` /
 * `scopeExcluded` are carried so the boundary is data, not folklore.
 *
 * `foakMultiplier` applies to a NOAK or study-derived baseline ONLY. The
 * researched central is already FOAK-inclusive — it is anchored on NEOM at
 * financial close and AM Green at FID, both first-of-a-kind with contingency
 * inside their published numbers. See `productionCapexUsdM` in resolve.ts,
 * which deliberately does not apply it.
 */
const fuelProductionSchema = z.object({
  referenceNameplateTonnesPerYear: z.number().nonnegative(),
  capexUsdPerTpa: bandSchema,
  opexUsdPerTpaPerYear: bandSchema,
  scaleExponent: bandSchema,
  foakMultiplier: bandSchema,
  scopeIncluded: z.array(z.string()),
  scopeExcluded: z.array(z.string()),
  verified: z.boolean(),
  sources: z.array(sourceRefSchema),
});

/** Absolute cost at a stated throughput — port storage and bunkering. */
const fuelFacilitySchema = z.object({
  basisTonnesPerYearThroughput: z.number().nonnegative().optional(),
  capexUsdM: bandSchema,
  opexUsdMPerYear: bandSchema,
  scopeIncluded: z.array(z.string()).optional(),
  /** jetty (shore-to-ship), barge (ship-to-ship), or both. */
  mode: z.enum(["jetty", "barge", "both"]).optional(),
  verified: z.boolean(),
  sources: z.array(sourceRefSchema),
});

/** A researched scalar with its own provenance and verified flag. */
const fuelPricedSchema = z.object({
  usdPerTonne: bandSchema,
  priceType: z.enum(["delivered", "fob", "production-cost"]),
  assessmentDate: z.string(),
  verified: z.boolean(),
  sources: z.array(sourceRefSchema),
});

const fuelPremiumSchema = z.object({
  fraction: bandSchema,
  appliesTo: z.string(),
  verified: z.boolean(),
  sources: z.array(sourceRefSchema),
});

/**
 * The researched block. OPTIONAL and parallel to the flat scalars above, not
 * a replacement for them: four UI sites interpolate `sourceNote` into a
 * template string and `build-vessel-bundle.ts` concatenates it behind an
 * `as string` cast, so a flag-day swap would render "[object Object]".
 * Bundles published before this block simply resolve the old way.
 *
 * `verified` lives PER BLOCK, not per fuel. A well-sourced production cost
 * beside a guessed barge cost is the normal case — 13 of 30 blocks in the
 * researched data are verified and the other 17 are honestly false. The UI
 * badge is the point of recording it.
 */
const fuelResearchSchema = z.object({
  production: fuelProductionSchema,
  portStorage: fuelFacilitySchema,
  bunkering: fuelFacilitySchema,
  merchantPrice: fuelPricedSchema,
  vesselCapexPremium: fuelPremiumSchema,
});

const fuelSchema = z.object({
  id: z.string(),
  label: z.string(),
  /**
   * Which side of the comparison this fuel can serve (2026-08-09, additive
   * per the bundle's additive-extension rule). The model exists to compare a
   * fossil corridor against a green one; a "fossil" corridor burning
   * e-ammonia computes happily and silently collapses that comparison, so
   * the family is reference data, not a UI convention: selectors filter on
   * it and scenario resolution rejects a cross-family fuelId outright.
   */
  family: z.enum(["fossil", "green"]),
  priceUsdPerTonne: z.number(),
  combustionEfTco2PerTonne: z.number(),
  prodCapexUsdM: z.number(),
  prodOpexUsdMPerYear: z.number(),
  portStorageCapexUsdM: z.number(),
  portStorageOpexUsdMPerYear: z.number(),
  bargeCapexUsdM: z.number(),
  bargeOpexUsdMPerYear: z.number(),
  vesselCapexPremium: z.number(),
  lhvMjPerTonne: z.number(),
  wtwGco2PerMj: z.number(),
  /**
   * Nameplate the prodCapex/prodOpex rows describe, t/yr (2026-08-02, additive
   * and OPTIONAL per the bundle's additive-extension rule — an older bundle
   * without it simply cannot be scale-corrected). Without a stated capacity a
   * bare "$55m" is unrelatable to any $/tpa benchmark: at 60 kt/yr it implies
   * $917/tpa for a complete green-ammonia complex, ~20x below the NEOM-derived
   * $1,400/tpa. Stating the nameplate is what makes the two commensurable and
   * lets a user typing over the row anchor it correctly.
   */
  prodNameplateTonnesPerYear: z.number().positive().optional(),
  /**
   * Whether this fuel rides infrastructure that already exists at a
   * commercial bunker port.
   *
   * Replaces the `isFossil` branch in resolve.ts, which was the wrong axis
   * twice over: it keyed on WHICH SIDE of the comparison a fuel sat on
   * rather than on the fuel, and it discarded the row's own port and barge
   * capex. LNG is fossil and needs a full cryogenic terminal plus a $55-90m
   * bunker vessel — it already carries $8m/$3m in this bundle and the fossil
   * side zeroed both. True for LSFO and for biodiesel blends, which go into
   * existing product tankage through the incumbent barge fleet.
   *
   * Optional so an older bundle without it falls back to the side branch.
   */
  incumbentInfrastructure: z.boolean().optional(),
  verified: z.boolean(),
  sourceNote: z.string(),
  /** Researched costs with real provenance. Absent on pre-2026-08-18 bundles. */
  research: fuelResearchSchema.optional(),
});

const countrySchema = z.object({
  id: z.string(),
  label: z.string(),
  wacc: z.number(),
  verified: z.boolean(),
  sourceNote: z.string(),
});

const scheduleStepSchema = z.object({
  fromCalendarYear: z.number().int(),
  value: z.number(),
});

export const refBundleSchema = z.object({
  bundleId: z.string(),
  schemaVersion: z.literal(1),
  source: z.object({
    workbook: z.string(),
    sha256: z.string(),
    transcribedAt: z.string(),
    note: z.string().optional(),
  }),
  vesselTypes: z.array(vesselTypeSchema).nonempty(),
  /**
   * Old vessel id → current id, for classes a later catalogue RENAMED but
   * left numerically unchanged. `getVesselType` follows these before it
   * throws, so a stored scenario pinning a retired name still resolves.
   *
   * Only for renames that preserve the value. A class whose figure MOVED
   * keeps its own row (`deprecated: true`) instead — aliasing it would
   * silently change a saved scenario's numbers, which is the one thing a
   * reference-data change must never do.
   */
  vesselTypeAliases: z.record(z.string(), z.string()).optional(),
  /**
   * The parametric layer: how to derive a vessel the catalogue does not
   * name. `a × capacity^(1−c) × LHV/(CF×10⁶) × k`, per IMO EEDI reference
   * lines (MEPC.203(62), bulk row amended by MEPC 75 — that amendment caps
   * the bulk line at 279,000 dwt, above which intensity is held flat and
   * GJ/nm goes linear in dwt; Valemax-scale ships need it).
   */
  vesselDerivation: z
    .object({
      speedLaw: z.object({
        /**
         * 2.0, NOT 3.0. Power ∝ v³ gives GJ/DAY ∝ v³, but nm/day ∝ v, so
         * GJ/NM ∝ v². Applying 3.0 to a per-nm quantity understates by 12%
         * at 11.5 vs 13 kn and 23% at 10 kn.
         */
        perNmExponent: z.number().positive(),
        perDayExponent: z.number().positive(),
        note: z.string(),
      }),
      eediReferenceLines: z.record(
        z.string(),
        z.object({
          a: z.number().positive(),
          c: z.number().positive(),
          /** dwt above which the line is held flat (MEPC 75). */
          cap: z.number().positive().nullable(),
          /** Capacity basis as a fraction of dwt (container: 0.7). */
          capfrac: z.number().positive(),
        }),
      ),
      /**
       * Per-family gap between the 1999–2009 design-speed regression and a
       * modern ship at operating speed. Fitted, not sourced — carries the
       * unverified badge and is the first thing to revisit with THETIS-MRV.
       */
      familyCalibration: z.record(z.string(), z.number().positive()),
      ballastRatio: z.record(z.string(), z.number().positive()),
    })
    .optional(),
  fuels: z.array(fuelSchema).nonempty(),
  countries: z.array(countrySchema).nonempty(),
  benchmarkRules: z.object({
    fossilPortLogisticsOpexFactor: z.number(),
    fossilVesselCapexUsdM: z.number(),
    fossilPortCapexUsdM: z.number(),
  }),
  constants: z.object({
    ira45zMjPerGallon: z.number(),
  }),
  // v6 — corridor→fuel-emissions integration: the dataset version this
  // bundle derives refined factors from, and the fuel-id mapping between
  // the two id spaces. Optional (additive): a bundle without it cannot
  // resolve refined factors and every scenario runs the legacy scalars.
  fuelEmissions: z
    .object({
      datasetVersion: z.string().min(1),
      map: z.record(z.string(), z.string()),
    })
    .optional(),
  schedules: z.object({
    etsPhaseIn: z.array(scheduleStepSchema).nonempty(),
    fuelEuTargets: z.array(scheduleStepSchema).nonempty(),
    // IMO Net-Zero Framework GFI reduction ladders vs the 2008 reference
    // (draft MEPC 83, provisional pending adoption). Optional: an older
    // bundle without them makes the IMO module report "not parameterised".
    imoBaseTargets: z.array(scheduleStepSchema).nonempty().optional(),
    imoDirectTargets: z.array(scheduleStepSchema).nonempty().optional(),
  }),
  regulationDefaults: z.object({
    eurUsd: z.number(),
    ets: z.object({
      euaEurPerTonne: z.number(),
      scope: z.number(),
      /**
       * The year maritime ETS starts covering CH4 and N2O as well as CO2.
       *
       * Reference DATA, not a user preference: it is a date in the Directive,
       * already in force. Optional so an older bundle still parses — a
       * scenario resolving against one keeps the CO2-only behaviour, which is
       * what it was computed with.
       */
      gasCoverageFromCalendarYear: z.number().int().optional(),
      /** Legal basis for the year above. */
      gasCoverageSourceNote: z.string().optional(),
    }),
    fuelEu: z.object({
      penaltyEurPerTonne: z.number(),
      vlsfoMjPerTonne: z.number(),
      baselineGco2PerMj: z.number(),
      scope: z.number(),
    }),
    ira45z: z.object({ rateUsdPerGallon: z.number() }),
    // IMO NZF pricing/reference parameters (provisional, per sourceNote).
    // The ZNZ reward rate is deliberately ABSENT — undetermined at source.
    imoNetZero: z
      .object({
        effectiveFromCalendarYear: z.number().int(),
        referenceIntensityGco2PerMj: z.number().positive(),
        tier1UsdPerTonneCo2e: z.number().nonnegative(),
        tier2UsdPerTonneCo2e: z.number().nonnegative(),
        sourceNote: z.string(),
      })
      .optional(),
  }),
});

export type RefBundle = z.infer<typeof refBundleSchema>;
export type RefVesselType = z.infer<typeof vesselTypeSchema>;
export type RefFuel = z.infer<typeof fuelSchema>;
export type RefCountry = z.infer<typeof countrySchema>;

export function parseRefBundle(data: unknown): RefBundle {
  return refBundleSchema.parse(data);
}
