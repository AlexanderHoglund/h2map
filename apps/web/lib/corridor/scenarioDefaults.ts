import { migrateScenarioInput, type ScenarioInput } from "@h2map/corridor-schema";
import fixtureDefaults from "../../../../fixtures/golden/corridor/excel-baseline.input.json";

/**
 * Pure scenario builders — shared by the client model (state.ts) and the
 * server (the starter-project seed route). NO "use client", no React.
 */

/** The workbook-default scenario (the frozen golden fixture, migrated). */
export function workbookScenario(): ScenarioInput {
  return migrateScenarioInput(JSON.parse(JSON.stringify(fixtureDefaults))).input;
}

/**
 * THE FROZEN REFERENCE CORRIDOR — the 500 nm corridor every §29 measurement
 * describes, published as a loadable preset so "open the app, set the input
 * to the endpoint shown, and the result is the number in the cell" is one
 * click instead of a transcription exercise.
 *
 * It is the SWEEP BASELINE posture exactly: the frozen workbook fixture
 * (Denmark, 500 nm, 20 years, one vessel, burns derived) with the app's
 * actual well-to-wake accounting — the same two-line construction
 * `scripts/corridor/sensitivity.ts` documents at length. On the frozen
 * 2026-07-30 bundle it reads a cost gap of $167.5m and an abatement cost of
 * $2,506/t (pinned by sweepParams.test.ts against the artifact, and by
 * elasticityLive.test.ts against this very builder).
 *
 * CAVEAT, and the reason the seeded project name says "docs baseline": the
 * scenario stays pinned to the frozen bundle, and OPENING it in the app
 * re-pins to the live catalogue like any old save — benchmark-driven
 * figures move with the re-cost, so the app's numbers will sit near, not
 * on, the frozen table. The docs figures are the frozen-bundle ones.
 */
export function referenceCorridorScenario(): ScenarioInput {
  const input = workbookScenario();
  input.flags = { ...(input.flags ?? {}), emissionsBasis: "wellToWake" };
  return input;
}

/**
 * APP DEFAULT: the Chilean copper-concentrate green corridor — populated
 * from "Chilean Green Corridors — Copper Concentrate Export" (MMMCZCS,
 * 11 Sep 2025; consortium: Sumitomo, Interacid, NYK, Codelco, MMMCZCS).
 * Mejillones → Japan/South Korea, 25 Mt concentrate over 15 years, 10
 * ammonia dual-fuel Handymax bulkers, 60 kt/yr green ammonia from 2030.
 *
 * Provenance per field: stated [S], derived [D], fitted to the study's
 * published totals [F], or assumption [A] — see the documentation's
 * default-scenario section. Key modelling choices:
 * - vessel-benchmark consumption with per-side tonnage overrides (the
 *   study's tonnages; distance-derived GJ/nm would encode an unstated
 *   slow-steaming assumption)
 * - green merchant price OVERRIDDEN TO 0: the study costs the plant as
 *   CAPEX/OPEX with no merchant fuel price (the corrected construct
 *   accounting — no workbook double count)
 * - EU ETS / FuelEU / 45Z all OFF (no EEA leg; Chilean production);
 *   self-designed regulation proxies the IMO Net-Zero Framework at
 *   $280/tCO2 (study's $250m regulatory benefit, TTW-priced here)
 * - emissions basis well-to-wake. v6: factors DERIVE from the refined
 *   fuel-emissions method (FuelEU accounting by default) — the study's
 *   WtW=0/91.16 treatment is preserved as the LEGACY calibration only
 *
 * The workbook-default scenario remains available via workbookScenario()
 * and the frozen golden fixture keeps pinning the engine.
 */
/**
 * The catalogue a NEW scenario is built against.
 *
 * `workbookScenario()` derives from the frozen golden fixture, which pins
 * the 2026-07-30 bundle forever — that is what keeps the golden test
 * meaningful. A new scenario should get the current vessel catalogue
 * instead, so this re-pins it. Saved scenarios keep whatever id they
 * carry: resolution rejects a mismatch outright rather than silently
 * re-pricing them against newer reference data.
 */
const LIVE_BUNDLE_ID = "2026-08-18-fuel-v4";

export function defaultScenario(): ScenarioInput {
  const input = workbookScenario();
  input.refBundleId = LIVE_BUNDLE_ID;

  input.cargo = {
    ...input.cargo,
    countryId: "chile", // [S]
    countryBId: "japan", // [S]
    portAName: "Mejillones",
    portACoords: { lat: -23.1, lon: -70.45 }, // [S]
    portBName: "Japan (Asia)", // [S] study does not name the discharge port
    portBCoords: { lat: 35.45, lon: 139.65 }, // [D] Yokohama proxy (Pub. 151)
    routeType: "point-to-point", // [S]
    oneWayDistanceNm: 9500, // [D] great-circle 9,072 nm + 5% routing
    startYear: 2030, // [S]
    horizonYears: 15, // [S]
    unit: "tonne", // [S]
    unitWeightTonnes: 1,
    unitsPerYear: 1_650_000, // [S] 1.65 Mt/yr × 15 ≈ 25 Mt
    vessels: 10, // [S]
    roundtripsPerYear: 3, // [S] 165 kt/vessel/yr ÷ 55 kt/voyage
    inflation: 0.02, // [A]
    waccOverride: 0.08, // [F] base rate implied by the financing benefit
  };

  input.vessel = {
    // [S] The RESEARCHED Handymax, not the retired v1 row of the same name.
    // Both are 58k dwt bulkers; the v1 row carries 3.2 GJ/nm against this
    // one's 2.334. The swap is inert HERE because this scenario overrides
    // both burns with the study's tonnages (verified: every resolved vessel
    // field is identical), but it matters the moment someone clears an
    // override — which is exactly what the sweep baseline does.
    typeId: "bulk-handymax-58k",
    // PER SHIP (v7); the engine multiplies by cargo.vessels = 10, so the
    // fleet totals are unchanged at $440m / $32m per year. [F] ~25% NH3
    // dual-fuel premium on a $35m Handymax — note the benchmark computes
    // 35 × 1.25 = 43.75, so the stated 44 carries a +0.57% override.
    green: { capexUsdMPerShip: 44, opexUsdMPerShipPerYear: 3.2 },
    // [F] NOT zero — the study costs a fossil NEWBUILD fleet, unlike the
    // workbook's retrofit-an-existing-fleet default ($35m / $2.8m a ship).
    fossil: { capexUsdMPerShip: 35, opexUsdMPerShipPerYear: 2.8 },
  };

  input.green = {
    ...input.green,
    fuelId: "e-ammonia", // [S]
    // v3: build-plant — production CAPEX + OPEX, no merchant price (the
    // mode the study actually uses; no price-0 workaround needed).
    sourcing: "build-plant", // [S] purpose-built plant
    overrides: {
      ...input.green.overrides,
      priceUsdPerTonne: null,
      // [D] NOT an independently published figure: 2,638 × 40,200/18,600 =
      // 5,701.5, i.e. the FOSSIL vessel-table benchmark restated at equal
      // delivered energy, then rounded. So it inherits that benchmark's
      // fleet-average inconsistency rather than corroborating it — the
      // distance-derived burn for this corridor is 7,152.6 t/vessel/yr.
      // Kept as an override because the study calibration must reproduce.
      fuelTonnesPerVesselYear: 5700,
      // v6: emission factors DERIVE from the fuel-emissions method
      // (certified 15 + N2O slip + 5% pilot → blend 22.14 under FuelEU).
      // The study's implied WtW=0 treatment survives as the documented
      // legacy calibration (chileStudyCalibrationInput / docs).
      lhvMjPerTonne: null,
      combustionEfTco2PerTonne: null,
      wtwGco2PerMj: null,
      prodCapexUsdM: 1100, // [F] 60 kt/yr plant, no economies of scale
      prodOpexUsdMPerYear: 72, // [F] incl. PPA electricity for 24/7 Haber-Bosch
      portStorageCapexUsdM: 150, // [F] tanks, refrigeration, pumping, jetty
      portStorageOpexUsdMPerYear: 8, // [F]
      bargeCapexUsdM: 0, // [S] jetty-side bunkering at 500 t/h — no barge
      bargeOpexUsdMPerYear: 0, // [S]
    },
  };

  input.fossil = {
    ...input.fossil,
    fuelId: "lsfo", // [S]
    sourcing: "purchase",
    overrides: {
      ...input.fossil.overrides,
      priceUsdPerTonne: 650, // [F]
      // [S] the vessel table's flat annual tonnage for this hull. It is a
      // fleet average over an unstated trade pattern: against the researched
      // row it implies ~45,775 nm/yr steamed, while this corridor steams
      // 57,000 (1.25×), so the distance-derived burn would be 3,284.9. Kept
      // as an override so the study calibration reproduces — see §21 legacy
      // behaviours. (The retired row implied 33,140 nm/yr, a 1.72× gap; the
      // researched energy makes the study's own tonnage far more plausible
      // as a fleet average, which is independent support for the change.)
      fuelTonnesPerVesselYear: 2638,
      // v6: derived — Annex II HFO row (91.744 / 3.169 CO2e / 40,500).
      lhvMjPerTonne: null,
      combustionEfTco2PerTonne: null,
      wtwGco2PerMj: null,
      prodCapexUsdM: null, // purchase forces 0
      prodOpexUsdMPerYear: null,
      portStorageCapexUsdM: 10, // [F] existing bunkering infrastructure
      portStorageOpexUsdMPerYear: 1, // [F]
      bargeCapexUsdM: 0,
      bargeOpexUsdMPerYear: 0,
    },
  };

  // Chile → Japan touches no EEA port: ETS, FuelEU and 45Z are all inert.
  // Self-designed proxies the IMO Net-Zero Framework (the one scheme that
  // WOULD apply; a first-class module is the known regulatory gap).
  input.regulation.ets.enabled = false;
  input.regulation.fuelEu.enabled = false;
  input.regulation.ira45z.enabled = false;
  input.regulation.ira45z.usProduced = false;
  input.regulation.selfDesigned = {
    ...input.regulation.selfDesigned,
    enabled: true,
    co2PriceUsdPerTonne: 280, // [F] calibrated to the study's ~$250m benefit
    supportUsdPerKg: 0,
    capexSupport: 0,
    opexSupport: 0,
    otherUsdM: 0,
  };

  // WTW is required to reproduce the study (§6 of its write-up): combustion
  // basis lands 15% low. The engine's flag-absent default stays combustion
  // (= Excel), which keeps the frozen golden fixture exact.
  input.flags = { emissionsBasis: "wellToWake", rateBasis: "nominal" };
  return input;
}

/**
 * THE SAME CORRIDOR, RUN ON THE CURRENT MODEL.
 *
 * `defaultScenario()` reproduces the MMMCZCS study by ASSERTING its answers:
 * the burns, the fossil fleet cost and the regulatory benefit are all typed
 * in. That was the right way to prove the engine could hit a published
 * total, but it means almost nothing downstream can move — so the researched
 * vessel catalogue, the derived consumption chain, the fossil-fleet basis and
 * the structured IMO module are all bypassed or hand-substituted.
 *
 * This variant releases those overrides and lets the model derive what it
 * can. It is NOT tuned to the study; where it lands is the finding.
 *
 * Measured against the study's published totals (bundle 2026-08-18-fuel-v4):
 *
 *                        study      asserted      derived
 *   green PV (pre-reg)   $2,850m    +0.02%        +0.02%
 *   fossil PV (pre-reg)  $850m      −1.4%         +2.6%
 *   gap PV (pre-reg)     $2,000m    +0.6%         −1.1%
 *   $/t cargo (pre-reg)  $80        +1.6%         −0.1%
 *   CO2 abated           1.45 Mt    −23%          −4.2%
 *
 * The headline: DERIVING the burn lands closer to the study than asserting
 * it did. That is independent validation of the vessel catalogue, and it is
 * only visible once the overrides come off.
 *
 * What is deliberately NOT changed: the plant CAPEX/OPEX blocks (still the
 * study's fitted figures — nothing has replaced them as a source), the
 * corridor geometry, the 8% WACC and the well-to-wake basis.
 */
export function modernChileScenario(): ScenarioInput {
  const input = defaultScenario();

  // 1. Consumption DERIVES from corridor geometry and the researched hull
  //    (7,152.6 t green / 3,284.9 t fossil) instead of restating the study's
  //    own tonnages. This is the change that moves CO2 abated from −23% to
  //    −4.2%, and it makes the energy-parity ratio exactly 1.000 by
  //    construction rather than by the coincidence the asserted pair relies
  //    on (5700/2638 happens to match the LHV ratio to 0.03%).
  input.green.overrides.fuelTonnesPerVesselYear = null;
  input.fossil.overrides.fuelTonnesPerVesselYear = null;

  // 2. Say the fossil counterfactual is a newbuild fleet, rather than
  //    asserting a per-ship figure to work around the "already afloat"
  //    benchmark. This is what the default's `capexUsdMPerShip: 35` override
  //    was standing in for; the flag states it and the catalogue prices it.
  input.vessel.fossil.capexUsdMPerShip = null;
  input.flags = { ...input.flags, fossilFleetBasis: "newbuild" };

  // 3. The structured IMO Net-Zero Framework REPLACES the $280/t proxy.
  //    That proxy was fitted to reproduce the study's ≈$250m benefit back
  //    when the financing module did not exist. With financing on (below),
  //    keeping it counts part of the same benefit twice — net regulation
  //    reaches −$435.6m against the study's ≈$250m. The IMO ladder is
  //    parameterised from the bundle and fitted to nothing.
  input.regulation.selfDesigned = {
    ...input.regulation.selfDesigned,
    enabled: false,
  };
  input.regulation.imoNetZero = { enabled: true, scope: 1 };

  // 4. Green financing as its own line — where the study's own waterfall
  //    puts it, separate from the regulatory float. Calibration is BOUNDS,
  //    not a target: amortizing yields $195.9m and bullet $312.5m, and the
  //    study's ≈$250m sits between them. Amortizing is the conservative end;
  //    nothing here is tuned to hit 250.
  input.financing = {
    enabled: true,
    greenRate: 0.06,
    baseRate: 0.08,
    debtShare: 1,
    tenorYears: 15,
    structure: "amortizing",
  };

  return input;
}

/**
 * THE SAME CORRIDOR, REPRODUCING THE PUBLISHED REPORT AS CLOSELY AS THE
 * MODEL CAN.
 *
 * Where `modernChileScenario()` releases the study's assertions to see where
 * the current model lands on its own, this one goes the other way: it adopts
 * the report's own emission accounting so every published figure comes back.
 *
 * Scored against the MMMCZCS totals — all six within 1.7%, five within 0.7%:
 *
 *   green corridor NPV     $2,850m   →  $2,850.66m   +0.02%
 *   fossil corridor NPV      $850m   →    $838.22m   −1.39%
 *   gap NPV (pre-reg)      $2,000m   →  $2,012.44m   +0.62%
 *   $/cargo tonne (pre-reg)    $80   →      $81.31   +1.64%
 *   CO2 abated              1.45 Mt  →  1,450,095 t  +0.01%
 *   regulatory benefit       ≈$250m  →    $250.23m   +0.09%
 *
 * It lands BIT-IDENTICAL to the frozen calibration pin ($1,762.21m /
 * 1,450,095 t / $71.20 per cargo tonne / $1,215 per tCO2, verified to zero
 * relative difference on every summary metric) — while resolving against the
 * CURRENT vessel bundle rather than the 2026-07-30 one the pin uses. That
 * identity across two different catalogues is the evidence this reproduces
 * the report rather than approximating it.
 *
 * THE ONE LEVER THAT MATTERS is the green well-to-wake factor. Everything
 * else in `defaultScenario()` already reproduces the report; the shipped
 * default diverges on exactly two figures, CO2 abated (−23%) and the
 * regulatory benefit (−23%), and both trace to the same cause. The report
 * treats green ammonia as zero WtW. The refined method derives 22.14
 * gCO2e/MJ (certified 15 + N2O slip + 5% pilot fuel) and says the zero is
 * not a certifiable value.
 *
 * So this scenario is NOT the model's own best estimate, and should not be
 * read as one. It answers "what did the report say?", which is a different
 * and legitimate question from "what does the model think?". The three
 * examples together are the honest presentation: the report's own numbers,
 * the model's own numbers, and the shipped default in between.
 */
export function studyChileScenario(): ScenarioInput {
  const input = defaultScenario();

  // Drop the refined accounting block: absent = the legacy workbook scalar
  // path, which is what the explicit factors below then feed. Without this
  // the derived factors would still win on the fields left null.
  delete input.regulation.emissions;

  // The report's implied factors, stated rather than derived. Green WtW = 0
  // is the report's own treatment and the whole reason the numbers return;
  // it is not certifiable under the refined method, which is exactly why
  // this variant is labelled as the report's accounting and not the
  // model's.
  input.green.overrides.lhvMjPerTonne = 18_600;
  input.green.overrides.combustionEfTco2PerTonne = 0;
  input.green.overrides.wtwGco2PerMj = 0;

  // Fossil LSFO on the report's own scalars (40,200 MJ/t and 91.16
  // gCO2e/MJ) rather than the Annex II HFO row the refined method picks
  // (40,500 / 91.744). A small difference, but it belongs to the same
  // accounting choice.
  input.fossil.overrides.lhvMjPerTonne = 40_200;
  input.fossil.overrides.combustionEfTco2PerTonne = 3.114;
  input.fossil.overrides.wtwGco2PerMj = 91.16;

  return input;
}

/**
 * Null every override so the resolution yields pure benchmark values.
 *
 * THE SWEEP BASELINE DEPENDS ON THIS BEING COMPLETE — in particular on
 * `fuelTonnesPerVesselYear` being null on both sides. A frozen burn override
 * makes consumption constant, so `cargo.oneWayDistanceNm` measures 0.0%
 * movement, loses its ≥5% top-level placement and gets demoted in the UI: a
 * real field pushed into "advanced" by a bookkeeping choice in the baseline,
 * not by its actual influence. The loop below covers every override key, so
 * a new one is nulled automatically.
 */
export function clearOverrides(s: ScenarioInput): ScenarioInput {
  const c = JSON.parse(JSON.stringify(s)) as ScenarioInput;
  c.cargo.waccOverride = null;
  c.vessel.green = { capexUsdMPerShip: null, opexUsdMPerShipPerYear: null };
  c.vessel.fossil = { capexUsdMPerShip: null, opexUsdMPerShipPerYear: null };
  for (const side of [c.green, c.fossil]) {
    for (const k of Object.keys(side.overrides) as (keyof typeof side.overrides)[]) {
      side.overrides[k] = null;
    }
  }
  return c;
}

/**
 * THE SAME CORRIDOR ON IN-MODEL BENCHMARKS ONLY — nothing asserted.
 *
 * The other three variants all type numbers in. Counted as resolved fields
 * carrying an OVERRIDE badge: the shipped default has 21, the as-published
 * variant 27, the current-model variant 17. This one has ZERO. Every figure
 * is either a benchmark from the reference bundle or derived from the
 * corridor's own geometry (19 derived, 11 benchmark).
 *
 * It answers a question none of the others can: what does this route cost if
 * you know only the route, and take every cost from the model's own
 * reference data?
 *
 * THE ANSWER, on bundle 2026-08-18-fuel-v4:
 *
 *   gap NPV (pre-reg)   $1,520.2m   against the study's $2,000m   (−24%)
 *   $/cargo tonne          $61.42   against $80                   (−23%)
 *   plant CAPEX / OPEX  $827m / $42.9m/yr   vs the study's $1,100m / $72m/yr
 *
 * It closes to 76% of the study and stops. Nothing here is tuned to the
 * study — landing exactly on $2,000m would have meant something was — and
 * the residual is scale, first-of-a-kind execution and site quality.
 *
 * THIS USED TO SAY SOMETHING VERY DIFFERENT, and the change is worth keeping
 * on the record. Before 18 August 2026 the answer was a $334m gap and $13.50
 * a tonne, 83% below the study, because production capex was an unsourced
 * flat $55m that did not scale with the corridor at all: a 15 kt/yr corridor
 * and a 600 kt/yr one were charged the same. That made the benchmark plant
 * 5% of the study's Atacama facility, and this scenario was the cleanest way
 * to see it. The fuel rows have since been re-based from researched sources
 * and production capex now scales with the corridor's own demand, so the
 * same plant costs $827m — 75% of the study's fitted figure.
 *
 * IT IS STILL NOT A CORRIDOR ESTIMATE, for a narrower reason than before.
 * The costs are now researched rather than generic, but 17 of the 30
 * researched blocks are honestly unverified — bunkering for every fuel,
 * everything about liquid hydrogen — so this reads the best public data
 * there is, not a project estimate. Sizing the plant from an evaluated site
 * is what the build-here/LCOH path exists for.
 *
 * Two decisions this makes beyond clearing overrides, both for the same
 * reason — a fitted input is an assertion even when it is not an override:
 *  - the $280/t self-designed price is OFF. It was calibrated to reproduce
 *    the study's ≈$250m benefit, so it carries study knowledge.
 *  - the structured IMO ladder replaces it, parameterised from the bundle.
 */
export function benchmarkChileScenario(): ScenarioInput {
  // clearOverrides() nulls every override key by iteration, so a newly added
  // override is covered here automatically rather than silently missed.
  const input = clearOverrides(defaultScenario());

  input.regulation.selfDesigned = {
    ...input.regulation.selfDesigned,
    enabled: false,
    co2PriceUsdPerTonne: 0,
  };
  input.regulation.imoNetZero = { enabled: true, scope: 1 };

  return input;
}

/**
 * The empty starter project (projects-first UX, 2026-08-11): every override
 * on its benchmark, every regulation module off, and NEUTRAL identity —
 * generic country, unnamed ports, round placeholder numbers. It must still
 * compute (the results rail is always live), so it is a starting point, not
 * a null form.
 */
export function emptyScenario(): ScenarioInput {
  const input = clearOverrides(defaultScenario());
  // Simplified projects are purchase-only (the sourcing selector is a
  // Standard capability) — the starter must be expressible in Simplified.
  input.green.sourcing = "purchase";
  input.cargo = {
    ...input.cargo,
    countryId: "other",
    countryBId: "other",
    portAName: "",
    portBName: "",
    routeType: "point-to-point",
    oneWayDistanceNm: 5000,
    startYear: 2030,
    horizonYears: 15,
    unit: "tonne",
    unitWeightTonnes: 1,
    unitsPerYear: 1_000_000,
    vessels: 5,
    roundtripsPerYear: 10,
    inflation: 0.02,
  };
  delete input.cargo.portACoords;
  delete input.cargo.portBCoords;
  delete input.cargo.routedDistance;
  input.regulation.selfDesigned = {
    ...input.regulation.selfDesigned,
    enabled: false,
  };
  return input;
}
