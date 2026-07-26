import {
  DAYS_PER_MONTH,
  HOURS_PER_YEAR,
  LHV_H2_KWH_PER_KG,
  WATER_L_PER_KG_H2,
} from "./constants";
import { discountFactors } from "./dcf";
import { dispatchYear } from "./dispatch";
import { annualEmissionsTco2e } from "./emissions";
import { lcoeFromCapex, lcoeMix } from "./lcoe";
import { stackReplacementYears } from "./stackSchedule";
import type {
  AnnualRow,
  LCOHInputs,
  LCOHResults,
  ResourceProfiles,
} from "./types";
import { EngineInputError, validateInputs } from "./validate";

export const ENGINE_VERSION = "0.1.0";

/**
 * Run the full LCOH simulation: hourly dispatch of one representative year,
 * per-year hydrogen/cost/emissions series over the project life, and the
 * discounted-cashflow LCOH with an exact per-component decomposition.
 *
 * LCOH is computed as the sum of per-component quotients (component present
 * value ÷ hydrogen present value), so `decomposition` sums to `lcohUsdPerKg`
 * exactly by construction rather than within floating-point tolerance.
 */
export function simulateLCOH(
  inputs: LCOHInputs,
  profiles: ResourceProfiles,
): LCOHResults {
  validateInputs(inputs, profiles);

  const { finance, electrolyzer, pv, wind, grid, water } = inputs;
  const flags = inputs.referenceFlags ?? {};
  const nameplateFirstYear = flags.nameplateEfficiencyInFirstYear ?? false;
  const resetOnReplacement = flags.resetEfficiencyOnStackReplacement ?? false;
  const lcoePaysCurtailed = flags.lcoePaysForCurtailedEnergy ?? false;
  const stackLifeOnEflh = flags.stackLifeOnEquivalentFullLoadHours ?? false;

  const years = finance.lifetimeYears;
  const electrolyzerKw = electrolyzer.capacityMw * 1000;
  const pvKw = pv ? pv.capacityMw * 1000 : 0;
  const windKw = wind ? wind.capacityMw * 1000 : 0;
  const gridMaxKw = grid ? grid.maxImportMw * 1000 : 0;

  const dispatch = dispatchYear({
    electrolyzerKw,
    pvKw,
    windKw,
    gridMaxKw,
    pvProfile: pv ? (profiles.pv ?? null) : null,
    windProfile: wind ? (profiles.wind ?? null) : null,
  });

  const df = discountFactors(finance.discountRate, years);
  let annuity = 0;
  for (let t = 1; t <= years; t++) annuity += df[t]!;

  // Reference: calendar operating hours (any hour with load > 0). Improved:
  // equivalent full-load hours = consumed energy ÷ rated power, which counts
  // partial-load hours proportionally.
  const stackWearHoursPerYear = stackLifeOnEflh
    ? dispatch.consumedKwh / electrolyzerKw
    : dispatch.operatingHours;
  const replacementYears = stackReplacementYears(
    stackWearHoursPerYear,
    electrolyzer.stackLifetimeHours,
    years,
  );
  const replacementsInYear = new Array<number>(years + 1).fill(0);
  for (const t of replacementYears) replacementsInYear[t]!++;

  // Effective efficiency per year. Reference mode is the doc-literal
  // η_t = η₀(1−d)^t for t = 1..N; flags switch to nameplate-first-year
  // indexing and/or reset the degradation clock on stack replacement.
  const retention = 1 - electrolyzer.degradationPerYear;
  const efficiency = new Float64Array(years + 1);
  let factor = 1;
  for (let t = 1; t <= years; t++) {
    if (!nameplateFirstYear) factor *= retention;
    efficiency[t] = electrolyzer.efficiencyLhv * factor;
    if (nameplateFirstYear) factor *= retention;
    if (resetOnReplacement && replacementsInYear[t]! > 0) factor = 1;
  }

  // Per-year hydrogen and water (dispatch energy is identical every year).
  const h2Kg = new Float64Array(years + 1);
  const waterM3 = new Float64Array(years + 1);
  for (let t = 1; t <= years; t++) {
    h2Kg[t] = (dispatch.consumedKwh * efficiency[t]!) / LHV_H2_KWH_PER_KG;
    waterM3[t] = (h2Kg[t]! * WATER_L_PER_KG_H2) / 1000;
  }

  let h2PvKg = 0;
  for (let t = 1; t <= years; t++) h2PvKg += h2Kg[t]! * df[t]!;
  if (h2PvKg <= 0) {
    throw new EngineInputError(
      "profiles",
      "configuration produces no hydrogen (no energy reaches the electrolyzer)",
    );
  }

  // --- Discounted cost per component (USD present values) ---

  const electrolyzerCapexUsd = electrolyzer.capexUsdPerKw * electrolyzerKw;
  const electrolyzerOpexPerYearUsd =
    electrolyzer.opexFractionPerYear * electrolyzerCapexUsd;

  const stackReplacementUsd =
    electrolyzer.stackReplacementCostFraction * electrolyzerCapexUsd;
  let stackPv = 0;
  for (const t of replacementYears) stackPv += stackReplacementUsd * df[t]!;

  function renewablePv(
    source: NonNullable<LCOHInputs["pv"]>,
    capacityKw: number,
    consumedKwh: number,
    generatedKwh: number,
  ): number {
    if (source.pricing.mode === "lcoe") {
      const chargedKwh = lcoePaysCurtailed ? generatedKwh : consumedKwh;
      const perYearUsd = (chargedKwh / 1000) * source.pricing.usdPerMwh;
      return perYearUsd * annuity;
    }
    const capexUsd = source.pricing.capexUsdPerKw * capacityKw;
    const opexPerYearUsd = source.pricing.opexFractionPerYear * capexUsd;
    return capexUsd + opexPerYearUsd * annuity;
  }

  const pvCostPv = pv
    ? renewablePv(pv, pvKw, dispatch.pvConsumedKwh, dispatch.pvGeneratedKwh)
    : 0;
  const windCostPv = wind
    ? renewablePv(
        wind,
        windKw,
        dispatch.windConsumedKwh,
        dispatch.windGeneratedKwh,
      )
    : 0;
  const gridCostPv = grid
    ? (dispatch.gridKwh / 1000) * grid.priceUsdPerMwh * annuity
    : 0;

  const waterUnitCostUsdPerM3 =
    water.priceUsdPerM3 +
    water.transportUsdPerM3Per100Km * (water.transportDistanceKm / 100);
  let waterCostPv = 0;
  for (let t = 1; t <= years; t++) {
    waterCostPv += waterM3[t]! * waterUnitCostUsdPerM3 * df[t]!;
  }

  const decomposition = {
    electricityPv: pvCostPv / h2PvKg,
    electricityWind: windCostPv / h2PvKg,
    electricityGrid: gridCostPv / h2PvKg,
    electrolyzerCapex: electrolyzerCapexUsd / h2PvKg,
    stackReplacements: stackPv / h2PvKg,
    electrolyzerOpex: (electrolyzerOpexPerYearUsd * annuity) / h2PvKg,
    water: waterCostPv / h2PvKg,
  };
  const lcohUsdPerKg =
    decomposition.electricityPv +
    decomposition.electricityWind +
    decomposition.electricityGrid +
    decomposition.electrolyzerCapex +
    decomposition.stackReplacements +
    decomposition.electrolyzerOpex +
    decomposition.water;

  // --- Reported LCOEs (USD/MWh) ---

  const pvLcoe = pv
    ? pv.pricing.mode === "lcoe"
      ? pv.pricing.usdPerMwh
      : lcoeFromCapex(
          pv.pricing.capexUsdPerKw,
          pv.pricing.opexFractionPerYear,
          pvKw,
          dispatch.pvGeneratedKwh,
          df,
        )
    : null;
  const windLcoe = wind
    ? wind.pricing.mode === "lcoe"
      ? wind.pricing.usdPerMwh
      : lcoeFromCapex(
          wind.pricing.capexUsdPerKw,
          wind.pricing.opexFractionPerYear,
          windKw,
          dispatch.windGeneratedKwh,
          df,
        )
    : null;
  const mix = lcoeMix(
    dispatch.pvConsumedKwh,
    pvLcoe,
    dispatch.windConsumedKwh,
    windLcoe,
    dispatch.gridKwh,
    grid?.priceUsdPerMwh ?? 0,
    dispatch.consumedKwh,
  );

  // Effective electricity cost per CONSUMED MWh: total discounted electricity
  // cost ÷ discounted consumed MWh. Reconciles to the electricity components
  // exactly (unlike `mix`, which is per generated MWh — see reconciliation
  // test). Consumed energy is identical every year, so its PV is E×annuity.
  const electricityCostPv = pvCostPv + windCostPv + gridCostPv;
  const consumedMwhPv = (dispatch.consumedKwh / 1000) * annuity;
  const effectivePerConsumedMwh =
    consumedMwhPv > 0 ? electricityCostPv / consumedMwhPv : 0;
  const utilization = {
    pv:
      pv && dispatch.pvGeneratedKwh > 0
        ? dispatch.pvConsumedKwh / dispatch.pvGeneratedKwh
        : null,
    wind:
      wind && dispatch.windGeneratedKwh > 0
        ? dispatch.windConsumedKwh / dispatch.windGeneratedKwh
        : null,
  };
  const renewableMatchedFraction =
    dispatch.consumedKwh > 0
      ? (dispatch.pvConsumedKwh + dispatch.windConsumedKwh) /
        dispatch.consumedKwh
      : 0;

  // --- Emissions ledger (never part of cost) ---

  const gridEf = grid?.emissionFactorTco2PerMwh ?? 0;
  let totalEmissionsTco2e = 0;
  let totalH2Kg = 0;
  let totalWaterM3 = 0;
  const annual: AnnualRow[] = [];
  for (let t = 1; t <= years; t++) {
    const emissions = annualEmissionsTco2e(
      dispatch.gridKwh,
      waterM3[t]!,
      water,
      gridEf,
    );
    totalEmissionsTco2e += emissions;
    totalH2Kg += h2Kg[t]!;
    totalWaterM3 += waterM3[t]!;
    annual.push({
      year: t,
      h2Kg: h2Kg[t]!,
      waterM3: waterM3[t]!,
      eConsumedKwh: dispatch.consumedKwh,
      ePvKwh: dispatch.pvConsumedKwh,
      eWindKwh: dispatch.windConsumedKwh,
      eGridKwh: dispatch.gridKwh,
      curtailedPvKwh: dispatch.curtailedPvKwh,
      curtailedWindKwh: dispatch.curtailedWindKwh,
      efficiencyLhv: efficiency[t]!,
      operatingHours: dispatch.operatingHours,
      stackReplacement: replacementsInYear[t]! > 0,
    });
  }

  // --- Performance: 12×24 average-day load profile (MW) ---

  const averageDayProfileMw: number[][] = DAYS_PER_MONTH.map(() =>
    new Array<number>(24).fill(0),
  );
  let month = 0;
  let hoursIntoMonth = 0;
  for (let h = 0; h < HOURS_PER_YEAR; h++) {
    if (hoursIntoMonth >= DAYS_PER_MONTH[month]! * 24) {
      month++;
      hoursIntoMonth = 0;
    }
    averageDayProfileMw[month]![h % 24]! += dispatch.hourlyLoadKw[h]! / 1000;
    hoursIntoMonth++;
  }
  for (let m = 0; m < 12; m++) {
    for (let hod = 0; hod < 24; hod++) {
      averageDayProfileMw[m]![hod] =
        averageDayProfileMw[m]![hod]! / DAYS_PER_MONTH[m]!;
    }
  }

  const referenceMode =
    !nameplateFirstYear &&
    !resetOnReplacement &&
    !lcoePaysCurtailed &&
    !stackLifeOnEflh;

  return {
    lcohUsdPerKg,
    decomposition,
    lcoe: { pv: pvLcoe, wind: windLcoe, mix, effectivePerConsumedMwh },
    annual,
    totals: {
      h2Kg: totalH2Kg,
      waterM3: totalWaterM3,
      eConsumedKwh: dispatch.consumedKwh * years,
      curtailedPvKwh: dispatch.curtailedPvKwh * years,
      curtailedWindKwh: dispatch.curtailedWindKwh * years,
      emissionsTco2e: totalEmissionsTco2e,
      emissionsKgCo2ePerKgH2:
        totalH2Kg > 0 ? (totalEmissionsTco2e * 1000) / totalH2Kg : 0,
      electrolyzerCapexUsd,
      stackReplacementsUsd: stackReplacementUsd * replacementYears.length,
      electrolyzerOpexUsd: electrolyzerOpexPerYearUsd * years,
    },
    performance: {
      electrolyzerCapacityFactor:
        dispatch.consumedKwh / (electrolyzerKw * HOURS_PER_YEAR),
      fullLoadHoursPerYear: dispatch.consumedKwh / electrolyzerKw,
      averageDayProfileMw,
      utilization,
      renewableMatchedFraction,
    },
    meta: { engineVersion: ENGINE_VERSION, referenceMode },
  };
}
