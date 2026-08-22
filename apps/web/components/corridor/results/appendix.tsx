"use client";

import { useTranslations } from "next-intl";
import type {
  ResolvedScenario,
  ScenarioInput,
  ScenarioResult,
} from "@h2map/corridor-schema";
import { Card } from "@/components/ui/Card";
import { SectionLabel } from "@/components/ui/Stat";
import { exact, usd } from "@/lib/corridor/format";
import { DEFAULT_BUNDLE } from "../state";
import { ElasticitySection } from "./elasticity";

/**
 * The Appendix (Results tab): a two-pane split. The live elasticity
 * tornado ("what moves this corridor") on the left, the worked
 * abatement-cost formula on the right, side by side at xl and stacked
 * tornado-first below it — the ranking names WHICH inputs matter, the
 * formula shows WHERE the headline number comes from, and the two read
 * as one appendix.
 *
 * The formula pane:
 *
 * Two rows. Row one writes the FULL formula symbolically, exactly as this
 * scenario resolves it — the emissions basis picks the denominator, the
 * sourcing mode decides whether a fuel-price term exists, disabled schemes
 * are named as omitted rather than silently absent, an override collapses
 * its derivation to the typed number. Row two substitutes the values.
 *
 * EXACTNESS: the substituted identity uses `summary.greenTotalPvUsdM`,
 * `summary.fossilTotalPvUsdM` and `summary.co2AbatedTonnes` — the same
 * floats the engine divides at index.ts (`gap × 1e6 / abated`) — so the
 * final figure IS the headline number, not a reconstruction of it. The
 * component levels beneath (capex + opex + schemes per side) are the
 * engine's own per-instrument PVs; they agree with the totals to
 * floating-point association order (≤1e-12 relative, the cost-bridge
 * closure guarantee), which is invisible at the shown precision. The cost
 * bridge itself is deliberately NOT used for the identity — same caveat.
 */

/** The docs page's monospace formula shell, localized to the appendix. */
function F({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-2 overflow-x-auto border border-neutral-300 bg-neutral-50 px-4 py-3 font-mono text-[12px] leading-relaxed whitespace-pre">
      {children}
    </div>
  );
}

const SUP = { 2: "²", 6: "⁶" } as const;
const SIGMA = "Σ";
const MINUS = "−";
const DIV = "÷";
const TIMES = "×";

type Src = "override" | "benchmark" | "derived";

export function AppendixSection({
  result,
  resolved,
  scenario,
}: {
  result: ScenarioResult | null;
  resolved: ResolvedScenario | null;
  scenario: ScenarioInput;
}) {
  const t = useTranslations("corridor.results");
  if (!result || !resolved) return null;

  const s = result.summary;
  const srcTag = (src: Src) =>
    src === "override"
      ? t("appendixSourceOverride")
      : src === "benchmark"
        ? t("appendixSourceBenchmark")
        : t("appendixSourceDerived");

  const vesselRow = DEFAULT_BUNDLE.vesselTypes.find(
    (v) => v.id === scenario.vessel.typeId,
  );
  const wellToWake = resolved.flags.emissionsBasis === "wellToWake";
  const realBasis = resolved.flags.rateBasis === "real";
  const H = resolved.horizonYears;
  const vessels = resolved.vessels;
  const wacc = resolved.wacc.value as number;
  const inflation = resolved.inflation as number;
  const g = resolved.green;
  const f = resolved.fossil;

  // Active/omitted regulation schemes, decided by the engine's own PVs.
  const schemes: { key: string; label: string; green: number; fossil: number }[] = [
    { key: "ets", label: "EU ETS", green: s.etsGreenPvUsdM, fossil: s.etsFossilPvUsdM },
    { key: "fuelEu", label: "FuelEU", green: s.fuelEuGreenPvUsdM, fossil: s.fuelEuFossilPvUsdM },
    { key: "ira45z", label: "IRA 45Z", green: s.ira45zGreenPvUsdM, fossil: 0 },
    {
      key: "selfDesigned",
      label: "self-designed scheme",
      green: s.selfDesignedGreenPvUsdM,
      fossil: s.selfDesignedFossilPvUsdM,
    },
    {
      key: "imoNetZero",
      label: "IMO NZF",
      green:
        result.reporting.imoNetZero && !result.reporting.imoNetZero.notParameterised
          ? result.reporting.imoNetZero.green.pvUsdM
          : 0,
      fossil:
        result.reporting.imoNetZero && !result.reporting.imoNetZero.notParameterised
          ? result.reporting.imoNetZero.fossil.pvUsdM
          : 0,
    },
  ];
  const active = schemes.filter((x) => x.green !== 0 || x.fossil !== 0);
  const omitted = schemes.filter((x) => x.green === 0 && x.fossil === 0);
  const financing = s.financingGreenPvUsdM;

  // Phasing weights (symbolic CAPEX_t line).
  const phasing = scenario.capitalPhasing?.enabled
    ? scenario.capitalPhasing.green.weights
    : null;

  // --- symbolic lines ------------------------------------------------------
  const sym: string[] = [];
  const sub: string[] = [];
  const push = (a: string, b: string) => {
    sym.push(a);
    sub.push(b);
  };

  // L1 — the identity.
  push(
    `$/tCO2 abated = (PV_green ${MINUS} PV_fossil) ${TIMES} 10${SUP[6]} ${DIV} CO2_abated`,
    `$/tCO2 abated = (${exact(s.greenTotalPvUsdM)} ${MINUS} ${exact(s.fossilTotalPvUsdM)}) $m ${TIMES} 10${SUP[6]} ${DIV} ${exact(s.co2AbatedTonnes)} t`,
  );

  // L2 — side composition from the engine's own per-instrument PVs.
  const sideParts = (side: "green" | "fossil") => {
    const parts = [`CAPEX PV`, `OPEX PV`];
    for (const x of active) parts.push(x.label);
    if (side === "green" && financing !== undefined) parts.push("financing effect");
    return parts.join(" + ");
  };
  const sideValues = (side: "green" | "fossil") => {
    const capex = side === "green" ? s.greenCapexPvUsdM : s.fossilCapexPvUsdM;
    const opex = side === "green" ? s.greenOpexPvUsdM : s.fossilOpexPvUsdM;
    const bits = [exact(capex), exact(opex)];
    for (const x of active) bits.push(exact(side === "green" ? x.green : x.fossil));
    if (side === "green" && financing !== undefined) bits.push(exact(financing));
    const total = side === "green" ? s.greenTotalPvUsdM : s.fossilTotalPvUsdM;
    return `${bits.join(" + ")} = ${exact(total)} $m`;
  };
  push(`PV_green  = ${sideParts("green")}`, `PV_green  = ${sideValues("green")}`);
  push(`PV_fossil = ${sideParts("fossil")}`, `PV_fossil = ${sideValues("fossil")}`);

  // L2b — CAPEX/OPEX opened up: fleet, production plant, PORT STORAGE and
  // barges are all visible terms, not folded into a single "CAPEX PV". The
  // identities are the engine's own: unphased CAPEX PV IS the component sum
  // (year-1, undiscounted); OPEX PV = annual total × the annuity factor
  // Σ (1+i)^(t−1)/(1+WACC)^(t−1) — verified exact on the shipped scenarios.
  let annuity = 0;
  for (let tt = 1; tt <= H; tt++) {
    annuity +=
      (realBasis ? 1 : Math.pow(1 + inflation, tt - 1)) / Math.pow(1 + wacc, tt - 1);
  }
  for (const side of ["green", "fossil"] as const) {
    const r = side === "green" ? g : f;
    const name = side;
    const capexPv = side === "green" ? s.greenCapexPvUsdM : s.fossilCapexPvUsdM;
    const opexPv = side === "green" ? s.greenOpexPvUsdM : s.fossilOpexPvUsdM;
    const vc = r.vesselCapexUsdMPerShip;
    const pc = r.prodCapexUsdM;
    const psc = r.portStorageCapexUsdM;
    const bc = r.bargeCapexUsdM;
    const capexSum =
      vessels * (vc.value as number) +
      (pc.value as number) +
      (psc.value as number) +
      (bc.value as number);
    const phFactor = capexSum > 0 ? capexPv / capexSum : 1;
    const phased = Math.abs(phFactor - 1) > 1e-9;
    push(
      `CAPEX_${name} = vessels${TIMES}capex/ship + production + port storage + barges${phased ? `, ${TIMES} ${SIGMA}_t w_t${DIV}(1+WACC)^(t${MINUS}1)` : ""}`,
      `CAPEX_${name} = ${vessels}${TIMES}${exact(vc.value as number)} ${srcTag(vc.source as Src)} + ${exact(pc.value as number)} ${srcTag(pc.source as Src)} + ${exact(psc.value as number)} ${srcTag(psc.source as Src)} + ${exact(bc.value as number)} ${srcTag(bc.source as Src)} = ${exact(capexSum)}${phased ? ` ${TIMES} ${exact(phFactor, 6)} = ${exact(capexPv)}` : ""} $m${capexSum === 0 ? `   ${t("appendixSunk")}` : ""}`,
    );
    const vo = r.vesselOpexUsdMPerShipPerYear;
    const po = r.prodOpexUsdMPerYear;
    const pso = r.portStorageOpexUsdMPerYear;
    const bo = r.bargeOpexUsdMPerYear;
    const fuelAnnual =
      scenario[side].sourcing === "purchase"
        ? (vessels *
            (r.tonnesPerVesselYear.value as number) *
            (r.priceUsdPerTonne.value as number)) /
          1e6
        : 0;
    const fixedSum =
      vessels * (vo.value as number) +
      (po.value as number) +
      (pso.value as number) +
      (bo.value as number);
    push(
      `OPEX_${name}  = FUEL_${name} + vessels${TIMES}opex/ship + production + port storage + barges   [$m/yr]`,
      `OPEX_${name}  = ${exact(fuelAnnual)} + ${vessels}${TIMES}${exact(vo.value as number)} ${srcTag(vo.source as Src)} + ${exact(po.value as number)} ${srcTag(po.source as Src)} + ${exact(pso.value as number)} ${srcTag(pso.source as Src)} + ${exact(bo.value as number)} ${srcTag(bo.source as Src)} = ${exact(fuelAnnual + fixedSum)} $m/yr`,
    );
    push(
      `OPEX PV_${name} = OPEX_${name} ${TIMES} ${SIGMA}_t ${realBasis ? "1" : `(1+i)^(t${MINUS}1)`}${DIV}(1+WACC)^(t${MINUS}1)`,
      `OPEX PV_${name} = ${exact(fuelAnnual + fixedSum)} ${TIMES} ${exact(annuity, 6)} = ${exact(opexPv)} $m`,
    );
  }
  // Hotel opex on cruise rows: on the row, out of the comparison — say so.
  if (vesselRow?.hotelOpexUsdMPerYear) {
    push(
      t("appendixHotelOpex", { value: exact(vesselRow.hotelOpexUsdMPerYear) }),
      t("appendixHotelOpex", { value: exact(vesselRow.hotelOpexUsdMPerYear) }),
    );
  }

  // L3 — the per-year structure behind each PV.
  push(
    `PV_side   = ${SIGMA}_t [ CAPEX${TIMES}w_t + (FUEL + OPEX) ${TIMES} ${realBasis ? "1" : `(1+i)^(t${MINUS}1)`} + REG_t + FIN_t ] ${DIV} (1+WACC)^(t${MINUS}1)`,
    `            WACC ${exact(wacc, 4)} ${srcTag(resolved.wacc.source as Src)} · ` +
      (realBasis
        ? t("appendixRealBasis")
        : `i = ${exact(inflation, 4)}`) +
      ` · t = 1…${H} · w = ${phasing ? `[${phasing.join(", ")}]` : t("appendixUnphased")}`,
  );

  // L4 — fuel terms per side, shaped by sourcing.
  for (const side of ["green", "fossil"] as const) {
    const r = side === "green" ? g : f;
    const input = scenario[side];
    const tonnes = r.tonnesPerVesselYear;
    const name = side === "green" ? "green" : "fossil";
    if (input.sourcing === "purchase") {
      push(
        `FUEL_${name}  = vessels ${TIMES} t_${name} ${TIMES} price_${name} ${DIV} 10${SUP[6]}   [$m/yr]`,
        `FUEL_${name}  = ${vessels} ${TIMES} ${exact(tonnes.value as number)} t ${srcTag(tonnes.source as Src)} ${TIMES} $${exact(r.priceUsdPerTonne.value as number)}/t ${srcTag(r.priceUsdPerTonne.source as Src)} ${DIV} 10${SUP[6]} = ${exact((vessels * (tonnes.value as number) * (r.priceUsdPerTonne.value as number)) / 1e6)} $m/yr`,
      );
    } else {
      push(
        `FUEL_${name}  = 0 (${input.sourcing}: production CAPEX/OPEX carried in the CAPEX/OPEX lines)`,
        `FUEL_${name}  = 0 · production lines inside CAPEX ${exact(side === "green" ? s.greenCapexPvUsdM : s.fossilCapexPvUsdM)} / OPEX ${exact(side === "green" ? s.greenOpexPvUsdM : s.fossilOpexPvUsdM)} $m PV`,
      );
    }
    // Consumption: derivation or override.
    if (tonnes.source === "derived" && vesselRow) {
      const v0 = vesselRow.serviceSpeedKn;
      const vTyped = scenario.cargo.serviceSpeedKn;
      const speed = vTyped && v0 ? ` ${TIMES} (${exact(vTyped, 1)}/${exact(v0, 1)})${SUP[2]}` : "";
      const hotel = vesselRow.hotelLoadGjPerDay
        ? ` + ${exact(vesselRow.hotelLoadGjPerDay)}${TIMES}365${DIV}${scenario.cargo.roundtripsPerYear}`
        : "";
      const port =
        scenario.cargo.portDaysPerRoundTrip && scenario.cargo.portDaysPerRoundTrip > 0
          ? ` + ${exact(scenario.cargo.portDaysPerRoundTrip)}${TIMES}${exact((vesselRow.portGjPerDay ?? 0) + (vesselRow.cargoSystemGjPerDay ?? 0))} GJ`
          : "";
      push(
        `t_${name}     = (2 ${TIMES} nm ${TIMES} GJ/nm${vTyped ? ` ${TIMES} (v/v₀)${SUP[2]}` : ""}${vesselRow.hotelLoadGjPerDay ? ` + hotel${TIMES}365${DIV}loops` : ""}${port ? " + portDays" + TIMES + "rate" : ""}) ${TIMES} loops ${TIMES} 1000 ${DIV} LHV_${name}`,
        `t_${name}     = (2 ${TIMES} ${exact(scenario.cargo.oneWayDistanceNm)} ${TIMES} ${exact(vesselRow.gjPerNm, 3)}${speed}${hotel}${port}) ${TIMES} ${scenario.cargo.roundtripsPerYear} ${TIMES} 1000 ${DIV} ${exact(r.lhv.value as number)} = ${exact(tonnes.value as number)} t/yr`,
      );
    } else {
      push(
        `t_${name}     = ${t("appendixOverrideNote")}`,
        `t_${name}     = ${exact(tonnes.value as number)} t/yr ${srcTag(tonnes.source as Src)}`,
      );
    }
  }

  // L5 — the denominator, on the active basis, exactly.
  const perYear = s.co2AbatedTonnes / H;
  if (wellToWake) {
    push(
      `CO2_abated = vessels ${TIMES} (t_fossil${TIMES}LHV_f${TIMES}WtW_f ${MINUS} t_green${TIMES}LHV_g${TIMES}WtW_g) ${DIV} 10${SUP[6]} ${TIMES} years   [well-to-wake]`,
      `CO2_abated = ${vessels} ${TIMES} (${exact(f.tonnesPerVesselYear.value as number)}${TIMES}${exact(f.lhv.value as number)}${TIMES}${exact(f.wtw.value as number, 3)} ${MINUS} ${exact(g.tonnesPerVesselYear.value as number)}${TIMES}${exact(g.lhv.value as number)}${TIMES}${exact(g.wtw.value as number, 3)}) ${DIV} 10${SUP[6]} ${TIMES} ${H} = ${exact(perYear, 2)} ${TIMES} ${H} = ${exact(s.co2AbatedTonnes)} t`,
    );
  } else {
    push(
      `CO2_abated = vessels ${TIMES} (t_fossil${TIMES}EF_f ${MINUS} t_green${TIMES}EF_g) ${TIMES} years   [combustion]`,
      `CO2_abated = ${vessels} ${TIMES} (${exact(f.tonnesPerVesselYear.value as number)}${TIMES}${exact(f.combustionEf.value as number, 4)} ${MINUS} ${exact(g.tonnesPerVesselYear.value as number)}${TIMES}${exact(g.combustionEf.value as number, 4)}) ${TIMES} ${H} = ${exact(perYear, 2)} ${TIMES} ${H} = ${exact(s.co2AbatedTonnes)} t`,
    );
  }

  // Omitted schemes: named, never silently absent.
  if (omitted.length > 0) {
    const names = omitted.map((x) => x.label).join(", ");
    push(t("appendixOmitted", { names }), t("appendixOmitted", { names }));
  }

  return (
    // The Appendix split: the live elasticity tornado on the left, the
    // worked formula on the right, stacking tornado-first below xl — the
    // same two-card grid idiom the panel's chart pairs use.
    <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
      <ElasticitySection scenario={scenario} />
      <Card as="section">
        <SectionLabel className="mb-2">{t("appendix")}</SectionLabel>
        <p className="text-xs leading-snug text-neutral-500">{t("appendixIntro")}</p>

        <p className="mt-3 text-xs font-medium text-neutral-700">
          {t("appendixSymbolic")}
        </p>
        <F>{sym.join("\n")}</F>

        <p className="mt-3 text-xs font-medium text-neutral-700">
          {t("appendixSubstituted")}
        </p>
        <F>
          {sub.join("\n")}
          {"\n\n"}
          {`$/tCO2 abated = ${exact(s.gapPvUsdM)} ${TIMES} 10${SUP[6]} ${DIV} ${exact(s.co2AbatedTonnes)} = `}
          <span data-testid="appendix-abatement-exact" className="font-semibold">
            ${exact(s.costPerTonneCo2Usd)}
          </span>
          {`   (${t("appendixHeadlineNote", { rounded: usd(s.costPerTonneCo2Usd) })})`}
        </F>

        <p className="mt-1 text-[11px] leading-snug text-neutral-500">
          {t("appendixNote")}
        </p>
      </Card>
    </div>
  );
}
