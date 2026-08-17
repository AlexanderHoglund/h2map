"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  evaluateFuelEmissions,
  parseRefDataset,
  type FuelEmissionsResult,
  type NotParameterised,
} from "@h2map/fuel-emissions";
import { Section, Advanced } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Help } from "@/components/ui/Help";
import { NumberInput } from "@/components/ui/NumberInput";
import { Select } from "@/components/ui/Select";
import seedJson from "../../../../data/fuel-emissions-ref/2026-08-17-ets-carbon-4.json";

/**
 * Fuel Emissions Calculator (client-side, recomputes on keystroke).
 * Direction-first: a dropdown at the top of the always-visible form picks
 * the direction (default: from fossil to ZNZ fuel — the common starting
 * point), and the form is ordered so the fuel you START from comes
 * first. The equivalence line under the quantity and the fuel-needed
 * stat in the results are the pedagogical payload; a one-sentence method
 * line at the end is written for citation. Detail lives in Help
 * tooltips, not on the page.
 */

const ds = parseRefDataset(seedJson);

const fmt1 = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const fmt2 = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

const FRAMEWORK_LABELS: Record<string, string> = {
  fueleu: "FuelEU Maritime (AR4)",
  imo: "IMO Net-Zero (AR5 · provisional)",
};

/** Full legal citations for the method sentence. */
const FRAMEWORK_CITATIONS: Record<string, string> = {
  fueleu: "FuelEU Maritime (Regulation (EU) 2023/1805, Annex II)",
  imo: "the IMO LCA Guidelines (MEPC.391(81), provisional)",
};

/** Human labels for methaneSlip.byEngine ids (LNG only). */
const ENGINE_LABELS: Record<string, string> = {
  "lng-otto-df-medium-speed": "Otto dual-fuel · medium-speed",
  "lng-otto-df-slow-speed": "Otto dual-fuel · slow-speed",
  "lng-diesel-df-slow-speed": "Diesel dual-fuel · slow-speed",
  "lng-lbsi": "Lean-burn spark-ignition",
  "steam-turbine-boiler": "Steam turbine / boiler",
};

export default function FuelEmissionsPanel() {
  const t = useTranslations("fuelEmissions");
  const [frameworkId, setFrameworkId] = useState("fueleu");
  const [basis, setBasis] = useState<"wellToWake" | "tankToWake">("wellToWake");
  const [direction, setDirection] = useState<"candidate" | "baseline">("baseline");
  const [candidateFuelId, setCandidateFuelId] = useState("e-ammonia");
  const [engineType, setEngineType] = useState("lng-otto-df-medium-speed");
  const [quantityTonnes, setQuantityTonnes] = useState(1000);
  const [candidateWtw, setCandidateWtw] = useState(15);
  const [baselineFuelId, setBaselineFuelId] = useState("hfo");
  const [sulphurPercent, setSulphurPercent] = useState(0.5);
  const [pilotShare, setPilotShare] = useState(ds.pilotFuel.defaultShareOfEnergy);
  const [pilotFuelId, setPilotFuelId] = useState(ds.pilotFuel.defaultPilotFuelId);
  const [n2oScenarioId, setN2oScenarioId] = useState("optimised-injection");
  const [efficiencyRatio, setEfficiencyRatio] = useState(ds.engineEfficiencyRatio.default);

  const candidateRow = ds.fuels.find((f) => f.id === candidateFuelId)!;
  const baselineRow = ds.fuels.find((f) => f.id === baselineFuelId)!;
  const rfnboCeiling = ds.frameworks["fueleu"]?.rfnboCeilingGco2ePerMj ?? 28.2;
  const n2oScenario = ds.n2oSlip.scenarios.find((s) => s.id === n2oScenarioId)!;
  const isAmmonia = candidateFuelId === "e-ammonia";
  // A pathway fuel carries a certified-value RANGE instead of a fixed WtT
  // (e-ammonia AND e-methanol) — the certified input renders for these.
  const certifiedRange = candidateRow.wttRangeGco2ePerMj ?? null;

  const result = useMemo(
    () =>
      evaluateFuelEmissions(
        {
          candidateFuelId,
          engineType: candidateRow.requiresEngineType ? engineType : undefined,
          quantityTonnes,
          quantityBasis: direction,
          baselineFuelId,
          baselineSulphurPercent: sulphurPercent,
          frameworkId,
          candidateWtwGco2ePerMj: Math.min(candidateWtw, rfnboCeiling),
          pilotShare,
          pilotFuelId,
          n2oSlipGPerG: isAmmonia ? n2oScenario.value : 0,
          efficiencyRatio,
        },
        ds,
      ),
    [
      candidateFuelId,
      candidateRow.requiresEngineType,
      engineType,
      quantityTonnes,
      direction,
      baselineFuelId,
      sulphurPercent,
      frameworkId,
      candidateWtw,
      rfnboCeiling,
      pilotShare,
      pilotFuelId,
      isAmmonia,
      n2oScenario.value,
      efficiencyRatio,
    ],
  );
  /** Everything back to the page's initial state. */
  const resetAll = () => {
    setFrameworkId("fueleu");
    setBasis("wellToWake");
    setDirection("baseline");
    setCandidateFuelId("e-ammonia");
    setEngineType("lng-otto-df-medium-speed");
    setQuantityTonnes(1000);
    setCandidateWtw(15);
    setBaselineFuelId("hfo");
    setSulphurPercent(0.5);
    setPilotShare(ds.pilotFuel.defaultShareOfEnergy);
    setPilotFuelId(ds.pilotFuel.defaultPilotFuelId);
    setN2oScenarioId("optimised-injection");
    setEfficiencyRatio(ds.engineEfficiencyRatio.default);
  };

  const refused = "notParameterised" in result && result.notParameterised;
  const ok = refused ? null : (result as FuelEmissionsResult);
  /* Fix B: the same bunker is named by the ACTIVE framework's
     classification — ISO 8217 grade under FuelEU, sulphur band under IMO. */
  const baselineName = ok ? ok.baselineLabel : baselineRow.name;
  const active = ok ? (basis === "wellToWake" ? ok.wellToWake : ok.tankToWake) : null;
  const other = ok ? (basis === "wellToWake" ? ok.tankToWake : ok.wellToWake) : null;
  /* The badge follows the VALUE: WtT substitutions (incl. the pilot's
     upstream, which fix E moved into the WtT row) mark the WtT row; LCV
     substitutions sit in the TtW denominator and mark the CO2 row. */
  const subWtt = ok ? ok.substitutedFactors.filter((f) => f.includes("WtT")) : [];
  const subLcv = ok ? ok.substitutedFactors.filter((f) => f.includes("LCV")) : [];

  /* Form blocks, composed in direction order (start fuel first). */
  const candidateSelect = (
    <>
      <Select
        label={t("candidate")}
        value={candidateFuelId}
        options={ds.fuels
          .filter((f) => f.family === "green" || f.id === "lng")
          .map((f) => ({ value: f.id, label: f.name }))}
        onChange={(v) => {
          setCandidateFuelId(v);
          // Each pathway fuel carries its own reference prefill (15 / 18 /
          // 10) — an editable default, never silently applied by the engine.
          const row = ds.fuels.find((f) => f.id === v);
          if (row?.defaultCertifiedWttGco2ePerMj) {
            setCandidateWtw(row.defaultCertifiedWttGco2ePerMj);
          }
        }}
      />
      {/* LNG: methane slip is per engine technology — an explicit input. */}
      {candidateRow.requiresEngineType && (
        <Select
          label={t("engineType")}
          help={`${ds.methaneSlip.note} — ${ds.methaneSlip.source}`}
          value={engineType}
          options={ds.methaneSlip.byEngine.map((e) => ({
            value: e.engine,
            label: ENGINE_LABELS[e.engine] ?? e.engine,
          }))}
          onChange={setEngineType}
        />
      )}
    </>
  );
  const baselineSelect = (
    <>
      <Select
        label={t("baseline")}
        help={t("baselineHelp")}
        value={baselineFuelId}
        options={ds.fuels
          .filter((f) => f.family === "fossil" && f.id !== "lng")
          .map((f) => ({
            value: f.id,
            label: `${f.name}${f.verified ? "" : " *"}`,
          }))}
        onChange={setBaselineFuelId}
      />
      {/* The IMO bins residual fuels by SULPHUR (MEPC.391(81)), not ISO
          8217 grade — the band drives the IMO WtT (16.8 vs 14.1). */}
      {frameworkId === "imo" && (
        <NumberInput
          label={t("sulphur")}
          unit="% S"
          step={0.1}
          help={`${ds.imoFossilWtt.classificationNote} ${ds.imoFossilWtt.source}`}
          value={sulphurPercent}
          onChange={(v) => setSulphurPercent(Math.min(4.5, Math.max(0.1, v)))}
        />
      )}
      {/* The selector picks the PHYSICAL fuel; outputs show the resolved
          IMO classification — state the mapping so neither reads as a
          contradiction of the other. */}
      {frameworkId === "imo" && ok && (
        <p className="sm:col-span-2 text-[11px] leading-snug text-neutral-500">
          {t("resolvesTo", { label: ok.baselineLabel })}
        </p>
      )}
    </>
  );
  const quantityInput = (
    <NumberInput
      label={t("quantityOf", {
        fuel: direction === "candidate" ? candidateRow.name : baselineName,
      })}
      unit="t"
      step={100}
      value={quantityTonnes}
      onChange={(v) => setQuantityTonnes(Math.max(0, v))}
    />
  );
  const certifiedInput = certifiedRange ? (
    <NumberInput
      label={t("candidateWtw")}
      unit="gCO2e/MJ"
      step={0.5}
      help={`${t("candidateWtwHelp")} ${t("certifiedRange", {
        fuel: candidateRow.name,
        low: String(certifiedRange[0]),
        high: String(certifiedRange[1]),
      })}`}
      value={candidateWtw}
      onChange={(v) =>
        setCandidateWtw(Math.min(rfnboCeiling, Math.max(certifiedRange[0], v)))
      }
    />
  ) : null;
  const equivalenceLine = ok ? (
    <p className="sm:col-span-2 bg-brand-tint/50 px-2.5 py-1.5 text-xs font-medium text-brand-deep">
      {direction === "candidate"
        ? t("equivalent", {
            candidateQty: fmt1(ok.candidateMassTonnes),
            candidate: candidateRow.name,
            baselineQty: fmt1(ok.equivalentBaselineMassTonnes),
            baseline: baselineName,
          })
        : t("equivalentReverse", {
            baselineQty: fmt1(ok.equivalentBaselineMassTonnes),
            baseline: baselineName,
            candidateQty: fmt1(ok.candidateMassTonnes),
            candidate: candidateRow.name,
          })}
      <Help text={t("equivalentHelp")} />
    </p>
  ) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* ===================== Inputs (one card) ===================== */}
      <Section title={t("compare")}>
        {/* Direction leads: pick what you're doing, the form re-orders. */}
        <div className="sm:col-span-2 flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Select
              label={t("direction")}
              value={direction}
              options={[
                { value: "baseline", label: t("directionReverse") },
                { value: "candidate", label: t("directionForward") },
              ]}
              onChange={(v) => setDirection(v as "candidate" | "baseline")}
            />
          </div>
          <button
            type="button"
            onClick={resetAll}
            className="shrink-0 border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-900"
          >
            {t("reset")}
          </button>
        </div>
        <Select
          label={t("framework")}
          help={t("frameworkHelp")}
          value={frameworkId}
          options={Object.keys(ds.frameworks).map((id) => ({
            value: id,
            label: FRAMEWORK_LABELS[id] ?? id,
          }))}
          onChange={setFrameworkId}
        />
        <Select
          label={t("basis")}
          value={basis}
          options={[
            { value: "wellToWake", label: t("basisWtw") },
            { value: "tankToWake", label: t("basisTtw") },
          ]}
          onChange={(v) => setBasis(v as "wellToWake" | "tankToWake")}
        />
        {direction === "candidate" ? (
          <>
            {candidateSelect}
            {quantityInput}
            {equivalenceLine}
            {certifiedInput}
            {baselineSelect}
          </>
        ) : (
          <>
            {baselineSelect}
            {quantityInput}
            {candidateSelect}
            {certifiedInput}
            {equivalenceLine}
          </>
        )}
        <div className="sm:col-span-2">
        <Advanced label={t("advanced")}>
          <NumberInput
            label={t("pilotShare")}
            unit="0–1"
            step={0.01}
            help={t("pilotShareHelp")}
            value={pilotShare}
            onChange={(v) => setPilotShare(Math.min(0.5, Math.max(0, v)))}
          />
          <Select
            label={t("pilotFuel")}
            value={pilotFuelId}
            options={ds.fuels
              .filter((f) => f.family === "fossil" && f.id !== "lng")
              .map((f) => ({ value: f.id, label: f.name }))}
            onChange={setPilotFuelId}
          />
          {isAmmonia && (
            <>
              <Select
                label={t("n2oScenario")}
                help={`${t("n2oScenarioHelp")} ${n2oScenario.derivation} — ${n2oScenario.source}`}
                value={n2oScenarioId}
                options={ds.n2oSlip.scenarios.map((s) => ({
                  value: s.id,
                  label: s.label,
                }))}
                onChange={setN2oScenarioId}
              />
              <p className="sm:col-span-2 flex items-start gap-2 bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-amber-800">
                <Badge tone="warning">{t("unverified")}</Badge>
                <span>
                  {t("n2oRange", {
                    low: String(ds.n2oSlip.range[0]),
                    high: String(ds.n2oSlip.range[1]),
                  })}
                </span>
              </p>
            </>
          )}
          <NumberInput
            label={t("efficiencyRatio")}
            unit="×"
            step={0.05}
            help={t("efficiencyRatioHelp")}
            value={efficiencyRatio}
            onChange={(v) => setEfficiencyRatio(Math.min(2, Math.max(0.5, v)))}
          />
        </Advanced>
        </div>
      </Section>

      {/* ===================== Results (one card) ===================== */}
      <div className="space-y-3">
        {refused ? (
          <div className="border border-amber-300 bg-amber-500/10 p-4 text-sm leading-relaxed text-amber-800">
            <p className="font-semibold">
              {t("notParameterised", {
                fuel:
                  ds.fuels.find((f) => f.id === (result as NotParameterised).fuelId)?.name ??
                  "",
              })}
            </p>
            <p className="mt-1 text-xs">
              {t("notParameterisedMissing", {
                missing: (result as NotParameterised).missing.join(", "),
              })}
            </p>
            {(result as NotParameterised).reviewNote && (
              <p className="mt-2 text-xs text-amber-900">
                {(result as NotParameterised).reviewNote}
              </p>
            )}
          </div>
        ) : ok && active && other ? (
          <div className="border border-neutral-300 bg-white p-4">
            {/* The two sides of the exchange — start fuel first, the
                derived mass is the hero. */}
            <div className="grid grid-cols-2 gap-3">
              {(direction === "baseline"
                ? ([
                    [t("massFossil"), ok.equivalentBaselineMassTonnes, baselineName, false],
                    [t("fuelNeeded"), ok.candidateMassTonnes, candidateRow.name, true],
                  ] as const)
                : ([
                    [t("massZnz"), ok.candidateMassTonnes, candidateRow.name, false],
                    [t("fossilReplaced"), ok.equivalentBaselineMassTonnes, baselineName, true],
                  ] as const)
              ).map(([label, qty, fuel, hero]) => (
                <div key={label}>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
                    {label}
                  </p>
                  <p
                    data-testid={hero ? "mass-hero" : undefined}
                    className={`mt-1 tabular-nums ${
                      hero
                        ? "text-3xl font-semibold text-brand-deep"
                        : "text-xl font-medium text-neutral-800"
                    }`}
                  >
                    {fmt1(qty)}{" "}
                    <span className="text-sm font-normal text-neutral-500">t {fuel}</span>
                  </p>
                </div>
              ))}
            </div>

            {/* One headline number; everything else is a labelled row. */}
            <div className="mt-3 border-t border-neutral-200 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
                {t("avoided")}
              </p>
              <p
                data-testid="avoided"
                className="mt-1 text-3xl font-semibold tabular-nums text-brand-deep"
              >
                {fmt1(active.avoidedTco2e)}{" "}
                <span className="text-sm font-normal text-neutral-500">
                  tCO2e · {basis === "wellToWake" ? t("avoidedWtw") : t("avoidedTtw")} ·{" "}
                  {t("reductionInline", { pct: fmt1(active.reductionPercent) })}
                </span>
              </p>
            </div>

            <dl className="mt-3 space-y-1.5 border-t border-neutral-200 pt-2.5 text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-neutral-500">
                  {t("detailAvoidedOther", {
                    basis: basis === "wellToWake" ? t("avoidedTtw") : t("avoidedWtw"),
                  })}
                </dt>
                <dd className="font-medium tabular-nums text-neutral-800">
                  {fmt1(other.avoidedTco2e)} tCO2e
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-neutral-500">
                  {t("detailIntensity", { fuel: candidateRow.name })}
                  <Help
                    text={t("intensityHelp", {
                      gfi: String(ok.references.imoGfi2008),
                      feu: String(ok.references.fuelEuBaseline),
                    })}
                  />
                </dt>
                <dd className="font-medium tabular-nums text-neutral-800">
                  {fmt2(active.candidate.intensityGco2ePerMj)} gCO2e/MJ
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-neutral-500">
                  {t("detailIntensity", { fuel: baselineName })}
                </dt>
                <dd className="font-medium tabular-nums text-neutral-800">
                  {fmt2(active.baseline.intensityGco2ePerMj)} gCO2e/MJ
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-neutral-500">
                  {frameworkId === "imo"
                    ? t("attainedGfi", { share: fmt1(pilotShare * 100) })
                    : t("blendLabel")}
                  <Help text={t("blendHelp")} />
                </dt>
                <dd className="font-medium tabular-nums text-neutral-800">
                  {fmt2(ok.znz.blendWtwGco2ePerMj)} gCO2e/MJ
                </dd>
              </div>
              {/* FuelEU's own threshold flag: the RFNBO ceiling of 28.2
                  gCO2e/MJ WtW (RED Article 28(5)), tested on the same
                  fuel basis as the IMO's ZNZ verdict — the decision-
                  relevant answer this view was missing. */}
              {frameworkId === "fueleu" &&
                certifiedRange &&
                (() => {
                  const qualifies = ok.znz.fuelWtwGco2ePerMj <= rfnboCeiling;
                  return (
                    <div className="flex items-baseline justify-between gap-2">
                      <dt className="text-neutral-500">
                        {t("rfnboRow", { threshold: fmt1(rfnboCeiling) })}
                        <Help
                          text={`${t("rfnboHelp")} ${
                            ds.frameworks["fueleu"]?.rfnboCeilingSource ?? ""
                          }`}
                        />
                      </dt>
                      <dd
                        data-testid="rfnbo"
                        className={`font-semibold ${
                          qualifies ? "text-emerald-800" : "text-red-800"
                        }`}
                      >
                        {qualifies ? t("yes") : t("no")}
                        <span className="ml-1 font-normal text-neutral-500">
                          · {t("znzFuelIntensity", {
                            value: fmt2(ok.znz.fuelWtwGco2ePerMj),
                          })}
                        </span>
                      </dd>
                    </div>
                  );
                })()}
              {/* ZNZ is the IMO's concept. BOTH periods render side by
                  side (round-2 fix F): a user checking 2034 has no reason
                  to suspect 2035 fails, and the 14.0 line is the binding
                  constraint. The verdict tests the FUEL's own WtW
                  intensity (incl. slip, excl. pilot) — verified against
                  the MEPC 83 text and the IMO NZF FAQ — never the blended
                  attained GFI above. */}
              {frameworkId === "imo" &&
                (
                  [
                    ["znz-2034", "znzTo2034", ok.znz.thresholdTo2034, ok.znz.compliantTo2034],
                    ["znz-2035", "znzFrom2035", ok.znz.thresholdFrom2035, ok.znz.compliantFrom2035],
                  ] as const
                ).map(([testid, labelKey, threshold, compliant]) => (
                  <div key={testid} className="flex items-baseline justify-between gap-2">
                    <dt className="text-neutral-500">
                      {t(labelKey, { threshold: fmt1(threshold) })}
                      {testid === "znz-2034" && <Help text={t("znzHelp")} />}
                    </dt>
                    <dd
                      data-testid={testid}
                      className={`font-semibold ${
                        compliant ? "text-emerald-800" : "text-red-800"
                      }`}
                    >
                      {compliant ? t("yes") : t("no")}
                      {testid === "znz-2034" && (
                        <span className="ml-1 font-normal text-neutral-500">
                          · {t("znzFuelIntensity", {
                            value: fmt2(ok.znz.fuelWtwGco2ePerMj),
                          })}
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
            </dl>

            {/* FuelEU's matching procurement line when the ceiling fails. */}
            {frameworkId === "fueleu" &&
              certifiedRange &&
              ok.znz.fuelWtwGco2ePerMj > rfnboCeiling &&
              (() => {
                const extra =
                  ok.znz.fuelWtwGco2ePerMj - Math.min(candidateWtw, rfnboCeiling);
                const required = rfnboCeiling - extra;
                return (
                  <p className="mt-2 bg-brand-tint/40 px-2.5 py-1.5 text-[11px] leading-snug text-brand-deep">
                    {required > 0
                      ? t("rfnboSpec", { wtt: fmt2(required) })
                      : t("rfnboSpecNone")}
                  </p>
                );
              })()}
            {/* The procurement specification (fix F): what certified WtT
                would clear the 2035 line, given the selected N2O scenario
                — derived as 14.0 − the non-certified share of the fuel's
                intensity. Turns the verdict into a purchasable number. */}
            {frameworkId === "imo" &&
              certifiedRange &&
              !ok.znz.compliantFrom2035 &&
              (() => {
                const extra =
                  ok.znz.fuelWtwGco2ePerMj - Math.min(candidateWtw, rfnboCeiling);
                const required = ok.znz.thresholdFrom2035 - extra;
                return (
                  <p className="mt-2 bg-brand-tint/40 px-2.5 py-1.5 text-[11px] leading-snug text-brand-deep">
                    {required > 0
                      ? t("znzSpec", { wtt: fmt2(required) })
                      : t("znzSpecNone")}
                  </p>
                );
              })()}

            <table className="mt-3 w-full text-xs tabular-nums">
              <thead>
                <tr className="border-b border-neutral-300 text-left text-[11px] uppercase tracking-wider text-neutral-500">
                  <th className="py-1.5 pr-2 font-medium">
                    {t("decomposition", {
                      basis: basis === "wellToWake" ? t("avoidedWtw") : t("avoidedTtw"),
                    })}
                  </th>
                  <th className="py-1.5 pr-2 text-right font-medium">{t("colCandidate")}</th>
                  <th className="py-1.5 text-right font-medium">{t("colBaseline")}</th>
                </tr>
              </thead>
              <tbody>
                {/* Per-factor provenance (fix C): the badge marks ONLY
                    factors genuinely absent from the selected framework and
                    substituted from Annex II — the engine names them in
                    substitutedFactors. Combustion factors are chemistry the
                    IMO covers itself; residual WtT under IMO is native
                    (sulphur-binned); the certified PoS value and the
                    literature N2O slip are never substitutions. */}
                {/* Fix E: the stage rows are COLUMN-COMPARABLE — the WtT
                    row absorbs the pilot's upstream tonnes (stated in its
                    tooltip) and the pilot row keeps only combustion, so
                    summing a column's stages gives the engine's number. */}
                {(
                  [
                    ["rowWtt", active.candidate.parts.wttTco2e + active.pilotSplit.wttTco2e, active.baseline.parts.wttTco2e, active.pilotSplit.wttTco2e > 0 ? `${candidateRow.source} — ${t("wttIncludesPilot", { pilot: fmt1(active.pilotSplit.wttTco2e) })}` : candidateRow.source, subWtt],
                    ["rowTtwCo2", active.candidate.parts.ttwCo2Tco2e, active.baseline.parts.ttwCo2Tco2e, baselineRow.derivation, subLcv],
                    ["rowTtwCh4", active.candidate.parts.ttwCh4Tco2e, active.baseline.parts.ttwCh4Tco2e, ds.gwpSets[ok.gwpSetId]!.source, [] as string[]],
                    ["rowTtwN2o", active.candidate.parts.ttwN2oTco2e, active.baseline.parts.ttwN2oTco2e, ds.gwpSets[ok.gwpSetId]!.source, [] as string[]],
                    ["rowSlip", active.candidate.parts.n2oSlipTco2e, 0, n2oScenario.source, [] as string[]],
                    ["rowPilot", active.pilotSplit.ttwTco2e, 0, ds.pilotFuel.source, [] as string[]],
                  ] as const
                )
                  // Only rows that carry a number render — zero rows are noise.
                  .filter(([, cand, base]) => Math.abs(cand) >= 0.05 || Math.abs(base) >= 0.05)
                  .map(([key, cand, base, source, subs]) => {
                    const substituted = subs.length > 0;
                    return (
                      <tr key={key} className="border-b border-neutral-100">
                        <td className="py-1.5 pr-2 text-neutral-600">
                          {t(key)}
                          {substituted && (
                            <span className="ml-1 align-middle">
                              <Badge tone="warning">{t("unverified")}</Badge>
                            </span>
                          )}
                          <Help
                            text={
                              substituted
                                ? `${t("imoSubstitutionRow", { factors: subs.join(", ") })} ${source}`
                                : source
                            }
                          />
                        </td>
                        <td className="py-1.5 pr-2 text-right">{fmt1(cand)}</td>
                        <td className="py-1.5 text-right">{fmt1(base)}</td>
                      </tr>
                    );
                  })}
                <tr className="font-semibold">
                  <td className="py-1.5 pr-2">{t("rowTotal")}</td>
                  <td className="py-1.5 pr-2 text-right">
                    {fmt1(active.candidate.emissionsTco2e)}
                  </td>
                  <td className="py-1.5 text-right">{fmt1(active.baseline.emissionsTco2e)}</td>
                </tr>
              </tbody>
            </table>
            {/* The WtT inversion, stated PER MJ (fix E: the tonnage form
                mixed row structures and understated its own finding) and
                CONDITIONAL — under IMO's heavier fossil upstream (16.8)
                the inversion reverses and must not be asserted. */}
            {(() => {
              const candUp =
                ((ok.wellToWake.candidate.parts.wttTco2e +
                  ok.wellToWake.pilotSplit.wttTco2e) /
                  ok.totalEnergyMj) *
                1e6;
              const baseUp =
                (ok.wellToWake.baseline.parts.wttTco2e / ok.baselineEnergyMj) * 1e6;
              return candUp > baseUp ? (
                <p className="mt-2 bg-brand-tint/40 px-2.5 py-1.5 text-[11px] leading-snug text-brand-deep">
                  {t("wttInversion", { cand: fmt2(candUp), base: fmt2(baseUp) })}
                </p>
              ) : null;
            })()}
            {/* One-line method reference, kept as short as possible. */}
            <p className="mt-3 border-t border-neutral-200 pt-2 text-[11px] leading-relaxed text-neutral-600">
              {t("citation", {
                gwp: ok.gwpSetId,
                framework: FRAMEWORK_CITATIONS[frameworkId] ?? frameworkId,
                version: ds.datasetVersion,
              })}
              {/* Name exactly WHICH factors are substituted — never a
                  blanket claim (round-2 fix A). */}
              {ok.substitutedFactors.length > 0 &&
                ` ${t("citationSubstituted", {
                  factors: ok.substitutedFactors.join(", "),
                })}`}
            </p>
            <p className="mt-2 text-[11px] text-neutral-500">
              {t("footer", { version: ds.datasetVersion })}{" "}
              <a href="/docs#fe-overview" className="underline">
                {t("footerDocs")}
              </a>
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
