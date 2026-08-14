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
import seedJson from "../../../../data/fuel-emissions-ref/2026-08-14-seed-2.json";

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

/**
 * Contextual default for the certified pathway intensity: 15 gCO2e/MJ is
 * the reference certified e-ammonia pathway; from 2035 the IMO ZNZ
 * threshold steps down to 14.0, which 15 can never clear, so the default
 * follows the period to 8 — a better (still typical, range 5–15)
 * certified pathway that clears 14.0 with the default pilot and slip.
 * Switching back restores 15. A hand-typed value is replaced on the next
 * framework/period switch — the default is contextual, not sticky.
 */
const certifiedDefaultFor = (fw: string, p: "to2034" | "from2035") =>
  fw === "imo" && p === "from2035" ? 8 : 15;

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
  /** IMO ZNZ compliance period — the threshold steps down in 2035. */
  const [period, setPeriod] = useState<"to2034" | "from2035">("to2034");
  const [direction, setDirection] = useState<"candidate" | "baseline">("baseline");
  const [candidateFuelId, setCandidateFuelId] = useState("e-ammonia");
  const [engineType, setEngineType] = useState("lng-otto-df-medium-speed");
  const [quantityTonnes, setQuantityTonnes] = useState(1000);
  const [candidateWtw, setCandidateWtw] = useState(15);
  const [baselineFuelId, setBaselineFuelId] = useState("hfo");
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
    setPeriod("to2034");
    setDirection("baseline");
    setCandidateFuelId("e-ammonia");
    setEngineType("lng-otto-df-medium-speed");
    setQuantityTonnes(1000);
    setCandidateWtw(certifiedDefaultFor("fueleu", "to2034"));
    setBaselineFuelId("hfo");
    setPilotShare(ds.pilotFuel.defaultShareOfEnergy);
    setPilotFuelId(ds.pilotFuel.defaultPilotFuelId);
    setN2oScenarioId("optimised-injection");
    setEfficiencyRatio(ds.engineEfficiencyRatio.default);
  };

  const refused = "notParameterised" in result && result.notParameterised;
  const ok = refused ? null : (result as FuelEmissionsResult);
  const active = ok ? (basis === "wellToWake" ? ok.wellToWake : ok.tankToWake) : null;
  const other = ok ? (basis === "wellToWake" ? ok.tankToWake : ok.wellToWake) : null;

  /* Form blocks, composed in direction order (start fuel first). */
  const candidateSelect = (
    <>
      <Select
        label={t("candidate")}
        value={candidateFuelId}
        options={ds.fuels
          .filter((f) => f.family === "green" || f.id === "lng")
          .map((f) => ({ value: f.id, label: f.name }))}
        onChange={setCandidateFuelId}
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
  );
  const quantityInput = (
    <NumberInput
      label={t("quantityOf", {
        fuel: direction === "candidate" ? candidateRow.name : baselineRow.name,
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
            baseline: baselineRow.name,
          })
        : t("equivalentReverse", {
            baselineQty: fmt1(ok.equivalentBaselineMassTonnes),
            baseline: baselineRow.name,
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
          onChange={(v) => {
            setFrameworkId(v);
            setCandidateWtw(certifiedDefaultFor(v, period));
          }}
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
        {/* The ZNZ threshold steps from 19.0 to 14.0 in 2035 — under the
            IMO framework the user picks which period they're asking about. */}
        {frameworkId === "imo" && (
          <Select
            label={t("period")}
            help={t("znzHelp")}
            value={period}
            options={[
              { value: "to2034", label: t("periodTo") },
              { value: "from2035", label: t("periodFrom") },
            ]}
            onChange={(v) => {
              const p = v as "to2034" | "from2035";
              setPeriod(p);
              setCandidateWtw(certifiedDefaultFor(frameworkId, p));
            }}
          />
        )}
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
                    [t("massFossil"), ok.equivalentBaselineMassTonnes, baselineRow.name, false],
                    [t("fuelNeeded"), ok.candidateMassTonnes, candidateRow.name, true],
                  ] as const)
                : ([
                    [t("massZnz"), ok.candidateMassTonnes, candidateRow.name, false],
                    [t("fossilReplaced"), ok.equivalentBaselineMassTonnes, baselineRow.name, true],
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
                  {t("detailIntensity", { fuel: baselineRow.name })}
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
              {/* ZNZ is the IMO's concept: one row, for the period the
                  user picked in the inputs. The verdict tests the FUEL's
                  own WtW intensity (incl. slip, excl. pilot) — verified
                  against the MEPC 83 text and the IMO NZF FAQ — never
                  the blended attained GFI above. */}
              {frameworkId === "imo" &&
                (() => {
                  const to2034 = period === "to2034";
                  const compliant = to2034
                    ? ok.znz.compliantTo2034
                    : ok.znz.compliantFrom2035;
                  const threshold = to2034
                    ? ok.znz.thresholdTo2034
                    : ok.znz.thresholdFrom2035;
                  return (
                    <div className="flex items-baseline justify-between gap-2">
                      <dt className="text-neutral-500">
                        {t(to2034 ? "znzTo2034" : "znzFrom2035", {
                          threshold: fmt1(threshold),
                        })}
                        <Help text={t("znzHelp")} />
                      </dt>
                      <dd
                        data-testid="znz"
                        className={`font-semibold ${
                          compliant ? "text-emerald-800" : "text-red-800"
                        }`}
                      >
                        {compliant ? t("yes") : t("no")}
                        <span className="ml-1 font-normal text-neutral-500">
                          · {t("znzFuelIntensity", {
                            value: fmt2(ok.znz.fuelWtwGco2ePerMj),
                          })}
                        </span>
                      </dd>
                    </div>
                  );
                })()}
            </dl>

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
                {/* Per-factor provenance: under the IMO framework the fuel
                    factors are SUBSTITUTED from FuelEU Annex II (IMO
                    defaults unpublished) — those rows carry the unverified
                    badge and say so. The certified pathway value (PoS) and
                    the literature N2O slip are not substitutions. */}
                {(
                  [
                    ["rowWtt", active.candidate.parts.wttTco2e, active.baseline.parts.wttTco2e, candidateRow.source, !certifiedRange],
                    ["rowTtwCo2", active.candidate.parts.ttwCo2Tco2e, active.baseline.parts.ttwCo2Tco2e, baselineRow.derivation, true],
                    ["rowTtwCh4", active.candidate.parts.ttwCh4Tco2e, active.baseline.parts.ttwCh4Tco2e, ds.gwpSets[ok.gwpSetId]!.source, true],
                    ["rowTtwN2o", active.candidate.parts.ttwN2oTco2e, active.baseline.parts.ttwN2oTco2e, ds.gwpSets[ok.gwpSetId]!.source, true],
                    ["rowSlip", active.candidate.parts.n2oSlipTco2e, 0, n2oScenario.source, false],
                    ["rowPilot", active.candidate.parts.pilotTco2e, 0, ds.pilotFuel.source, true],
                  ] as const
                )
                  // Only rows that carry a number render — zero rows are noise.
                  .filter(([, cand, base]) => Math.abs(cand) >= 0.05 || Math.abs(base) >= 0.05)
                  .map(([key, cand, base, source, annexFactors]) => {
                    const substituted = frameworkId === "imo" && annexFactors;
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
                            text={substituted ? `${t("imoSubstitution")} ${source}` : source}
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
            {/* The WtT inversion: green ammonia's UPSTREAM emissions exceed
                fossil's (15 vs 13.5 gCO2e/MJ) — every gram of saving is
                combustion-side. The single best demonstration of why the
                tool is well-to-wake; it must not sit unremarked. */}
            {ok.wellToWake.candidate.parts.wttTco2e >
              ok.wellToWake.baseline.parts.wttTco2e && (
              <p className="mt-2 bg-brand-tint/40 px-2.5 py-1.5 text-[11px] leading-snug text-brand-deep">
                {t("wttInversion", {
                  cand: fmt1(ok.wellToWake.candidate.parts.wttTco2e),
                  base: fmt1(ok.wellToWake.baseline.parts.wttTco2e),
                })}
              </p>
            )}
            {/* One-line method reference, kept as short as possible. */}
            <p className="mt-3 border-t border-neutral-200 pt-2 text-[11px] leading-relaxed text-neutral-600">
              {t("citation", {
                gwp: ok.gwpSetId,
                framework: FRAMEWORK_CITATIONS[frameworkId] ?? frameworkId,
                version: ds.datasetVersion,
              })}
              {/* The GWP set is IMO's; the fuel factors are not — say so. */}
              {frameworkId === "imo" && ` ${t("citationImoNote")}`}
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
