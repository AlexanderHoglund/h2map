/**
 * Reporting layer (Chilean-run fix #1): the pre/post-regulation split.
 *
 * Published green-corridor studies (e.g. MMMCZCS Chilean copper corridor)
 * report the gap BEFORE regulation, with regulatory effects as a separate
 * downstream line — the model's headline (post-regulation) is one layer
 * further on and not directly comparable. This module derives both from
 * the already-computed side aggregates; no new arithmetic paths.
 *
 * Pre-regulation = CAPEX PV + operating-cost PV only (all four regulation
 * modules excluded). `netRegulatoryEffectUsdM` is post − pre computed from
 * the same expressions, so `post === pre + net` holds exactly (same
 * floating-point operations, deterministic).
 */

import type { ScenarioReporting, SideResult } from "@h2map/corridor-schema";

export function buildReporting(
  green: SideResult,
  fossil: SideResult,
  cargoUnitsLifetime: number,
  co2AbatedTonnes: number,
): ScenarioReporting {
  const greenPre = green.capexPvUsdM + green.opexPvUsdM;
  const fossilPre = fossil.capexPvUsdM + fossil.opexPvUsdM;
  const pre = greenPre - fossilPre;
  const post = green.totalPvUsdM - fossil.totalPvUsdM;
  return {
    gapPvPreRegulationUsdM: pre,
    gapPvPostRegulationUsdM: post,
    netRegulatoryEffectUsdM: post - pre,
    greenPreRegulationPvUsdM: greenPre,
    fossilPreRegulationPvUsdM: fossilPre,
    costPerUnitPreRegulationUsd: (pre * 1e6) / cargoUnitsLifetime,
    costPerUnitPostRegulationUsd: (post * 1e6) / cargoUnitsLifetime,
    costPerTonneCo2PreRegulationUsd: (pre * 1e6) / co2AbatedTonnes,
    costPerTonneCo2PostRegulationUsd: (post * 1e6) / co2AbatedTonnes,
  };
}
