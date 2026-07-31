/**
 * THE single corridor-side evaluator (build-plan 1.1). Called once for green
 * and once for fossil — the workbook's mirrored formula blocks (rows 13–35 vs
 * 39–60, whose duplication had already drifted: Fuel!F29, Vessel!F18) must
 * not survive as two code paths. Everything that differs between the sides
 * arrives as data on `SideInputs`; this function never branches on
 * `side.label`.
 *
 * Per-year structure (transcription §5):
 *   componentCapex — year 1 only            (rows 13/16/19/22)
 *   componentOpex  — × (1+infl)^(idx−1)     (rows 17/20/23 + prod O&M of 14)
 *   fuelCost       — vessels × t/v/yr × $/t / 1e6 × infl   (row 14, purchase part)
 *   totalCapex = Σ capex; totalOpex = fuelCost + Σ opex    (rows 25/26)
 *   + ETS + FuelEU + 45Z + self-designed                   (rows 28–31)
 *   total (row 33) · df (row 34) · pv (row 35)
 */

import type { EvalContext, SideInputs, SidePerYear, SideResult } from "@h2map/corridor-schema";
import { discountFactor, inflationFactor } from "./rates";
import { etsCostUsdM } from "./regulation/ets";
import { fuelEuCostUsdM } from "./regulation/fuelEu";
import { ira45zCreditUsdM } from "./regulation/ira45z";
import { selfDesignedCostUsdM } from "./regulation/selfDesigned";
import { imoNetZeroYear } from "./regulation/imoNetZero";

export function evaluateSide(side: SideInputs, ctx: EvalContext): SideResult {
  const { fuel, regulations, vessels, components } = side;
  const wacc = ctx.discounting.wacc;

  const rows = ctx.timeline.years.map(({ idx, calendarYear }) => {
    // Rows 13/16/19/22 + 25: CAPEX in year 1 only, summed in component order.
    let totalCapex = 0;
    for (const c of components) totalCapex += idx === 1 ? c.capexUsdM : 0;

    // Row 14 (fuel purchase + production O&M) + rows 17/20/23 → row 26.
    // D6 — real basis deflates the inflation growth (nominal = Excel).
    const infl = ctx.rateBasis === "real" ? 1 : inflationFactor(ctx.inflation, idx);
    const fuelCost = ((vessels * fuel.tonnesPerVesselYear * fuel.priceUsdPerTonne) / 1e6) * infl;
    let totalOpex = fuelCost;
    for (const c of components) totalOpex += c.opexUsdMPerYear * infl;

    const ets = regulations.ets
      ? etsCostUsdM(regulations.ets, fuel, vessels, calendarYear, idx)
      : 0;
    const fuelEu = regulations.fuelEu
      ? fuelEuCostUsdM(regulations.fuelEu, fuel, vessels, calendarYear)
      : 0;
    const ira45z = regulations.ira45z
      ? ira45zCreditUsdM(regulations.ira45z, fuel, vessels, calendarYear)
      : 0;
    const selfDesigned = regulations.selfDesigned
      ? selfDesignedCostUsdM(
          regulations.selfDesigned,
          fuel,
          vessels,
          totalCapex,
          totalOpex,
          ctx.emissionsBasis ?? "combustion",
          idx,
        )
      : 0;

    // Fix #6 — the IMO Net-Zero module: a SEVENTH cost term, present only
    // when the module is active (the golden scenario never enables it).
    const imo = regulations.imoNetZero
      ? imoNetZeroYear(regulations.imoNetZero, fuel, vessels, calendarYear, idx)
      : null;

    // Row 33 — the exhaustive-decomposition identity (property-tested).
    const total =
      totalCapex + totalOpex + ets + fuelEu + ira45z + selfDesigned + (imo?.costUsdM ?? 0);
    const df = discountFactor(wacc, idx);
    return {
      totalCapex,
      totalOpex,
      ets,
      fuelEu,
      ira45z,
      selfDesigned,
      imo,
      total,
      df,
      pv: total * df,
    };
  });

  const perYear: SidePerYear = {
    // Fix #6 — emitted only when the module is active: the frozen golden
    // per-year key set must not change.
    ...(regulations.imoNetZero
      ? { imoNetZeroUsdM: rows.map((r) => r.imo?.costUsdM ?? 0) }
      : {}),
    totalCapexUsdM: rows.map((r) => r.totalCapex),
    totalOpexUsdM: rows.map((r) => r.totalOpex),
    etsUsdM: rows.map((r) => r.ets),
    fuelEuUsdM: rows.map((r) => r.fuelEu),
    ira45zUsdM: rows.map((r) => r.ira45z),
    selfDesignedUsdM: rows.map((r) => r.selfDesigned),
    totalUsdM: rows.map((r) => r.total),
    discountFactor: rows.map((r) => r.df),
    pvUsdM: rows.map((r) => r.pv),
  };

  // Summary rows 70/71 (Σ pv) and the 72–78/82–85 SUMPRODUCT(row, df) lines.
  const sumProduct = (values: number[]): number =>
    values.reduce((acc, v, i) => acc + v * rows[i]!.df, 0);

  return {
    perYear,
    totalPvUsdM: rows.reduce((acc, r) => acc + r.pv, 0),
    capexPvUsdM: sumProduct(rows.map((r) => r.totalCapex)),
    opexPvUsdM: sumProduct(rows.map((r) => r.totalOpex)),
    etsPvUsdM: sumProduct(rows.map((r) => r.ets)),
    fuelEuPvUsdM: sumProduct(rows.map((r) => r.fuelEu)),
    ira45zPvUsdM: sumProduct(rows.map((r) => r.ira45z)),
    selfDesignedPvUsdM: sumProduct(rows.map((r) => r.selfDesigned)),
    ...(regulations.imoNetZero
      ? {
          imoNetZero: {
            pvUsdM: sumProduct(rows.map((r) => r.imo?.costUsdM ?? 0)),
            tier1PvUsdM: sumProduct(rows.map((r) => r.imo?.tier1UsdM ?? 0)),
            tier2PvUsdM: sumProduct(rows.map((r) => r.imo?.tier2UsdM ?? 0)),
            rewardPvUsdM: sumProduct(rows.map((r) => r.imo?.rewardUsdM ?? 0)),
            surplusTonnesCo2e: rows.reduce(
              (acc, r) => acc + (r.imo?.surplusTonnesCo2e ?? 0),
              0,
            ),
          },
        }
      : {}),
  };
}
