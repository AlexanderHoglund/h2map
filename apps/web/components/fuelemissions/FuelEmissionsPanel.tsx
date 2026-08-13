"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  evaluateFuelEmissions,
  parseRefDataset,
  type FuelEmissionsResult,
  type NotParameterised,
} from "@h2map/fuel-emissions";
import { formatSig } from "@h2map/units";
import { Section, Advanced } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Help } from "@/components/ui/Help";
import { NumberInput } from "@/components/ui/NumberInput";
import { Select } from "@/components/ui/Select";
import seedJson from "../../../../data/fuel-emissions-ref/2026-08-13-seed-1.json";

/**
 * Fuel Emissions Calculator (client-side, recomputes on keystroke — the
 * corridor pattern). The framework and basis selectors sit FIRST because
 * they change the answer; the energy-equivalence line renders directly
 * under the quantity because it is the pedagogical payload. Every factor
 * carries its provenance; unverified rows carry the badge; a fuel the
 * dataset cannot parameterise refuses with the dataset's own review note.
 */

const ds = parseRefDataset(seedJson);

const fmt1 = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const fmt2 = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export default function FuelEmissionsPanel() {
  const t = useTranslations("fuelEmissions");
  const [frameworkId, setFrameworkId] = useState("fueleu");
  const [basis, setBasis] = useState<"wellToWake" | "tankToWake">("wellToWake");
  const [candidateFuelId, setCandidateFuelId] = useState("e-ammonia");
  const [quantityTonnes, setQuantityTonnes] = useState(1000);
  const [candidateWtw, setCandidateWtw] = useState(15);
  const [baselineFuelId, setBaselineFuelId] = useState("vlsfo");
  const [pilotShare, setPilotShare] = useState(ds.pilotFuel.defaultShareOfEnergy);
  const [pilotFuelId, setPilotFuelId] = useState(ds.pilotFuel.defaultPilotFuelId);
  const [n2oScenarioId, setN2oScenarioId] = useState("optimised-injection");
  const [efficiencyRatio, setEfficiencyRatio] = useState(ds.engineEfficiencyRatio.default);

  const framework = ds.frameworks[frameworkId]!;
  const candidateRow = ds.fuels.find((f) => f.id === candidateFuelId)!;
  const baselineRow = ds.fuels.find((f) => f.id === baselineFuelId)!;
  const rfnboCeiling = ds.frameworks["fueleu"]?.rfnboCeilingGco2ePerMj ?? 28.2;
  const n2oScenario = ds.n2oSlip.scenarios.find((s) => s.id === n2oScenarioId)!;
  const isAmmonia = candidateFuelId === "e-ammonia";

  const result = useMemo(
    () =>
      evaluateFuelEmissions(
        {
          candidateFuelId,
          quantityTonnes,
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
      quantityTonnes,
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
  const refused = "notParameterised" in result && result.notParameterised;
  const ok = refused ? null : (result as FuelEmissionsResult);
  const active = ok ? (basis === "wellToWake" ? ok.wellToWake : ok.tankToWake) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* ===================== Inputs ===================== */}
      <div className="space-y-3">
        <Section title={t("framework")}>
          <Select
            label={t("framework")}
            help={t("frameworkHelp")}
            value={frameworkId}
            options={Object.entries(ds.frameworks).map(([id, fw]) => ({
              value: id,
              label: `${fw.name} — ${fw.legalBasis.split(",")[0]} (${fw.defaultGwpSet}${fw.verified === false ? " · provisional" : ""})`,
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
          <p className="sm:col-span-2 text-[11px] text-neutral-500">
            {t("gwpNote", { set: framework.defaultGwpSet, framework: framework.name })}
          </p>
        </Section>

        <Section title={t("candidate")}>
          <Select
            label={t("candidate")}
            value={candidateFuelId}
            options={ds.fuels
              .filter((f) => f.family === "green" || f.id === "lng")
              .map((f) => ({ value: f.id, label: f.name }))}
            onChange={setCandidateFuelId}
          />
          <NumberInput
            label={t("quantity")}
            unit="t"
            step={100}
            value={quantityTonnes}
            onChange={(v) => setQuantityTonnes(Math.max(0, v))}
          />
          {ok && (
            <p className="sm:col-span-2 bg-brand-tint/50 px-2.5 py-1.5 text-xs font-medium text-brand-deep">
              {t("equivalent", {
                candidateQty: quantityTonnes.toLocaleString("en-US"),
                candidate: candidateRow.name,
                baselineQty: fmt1(ok.equivalentBaselineMassTonnes),
                baseline: baselineRow.name,
              })}
              <Help text={t("equivalentHelp")} />
            </p>
          )}
          {isAmmonia && (
            <NumberInput
              label={t("candidateWtw")}
              unit="gCO2e/MJ"
              step={0.5}
              help={t("candidateWtwHelp")}
              value={candidateWtw}
              onChange={(v) => setCandidateWtw(Math.min(rfnboCeiling, Math.max(0.1, v)))}
            />
          )}
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
                  help={t("n2oScenarioHelp")}
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
                    <Help text={`${n2oScenario.derivation} — ${n2oScenario.source}`} />
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
        </Section>
      </div>

      {/* ===================== Results ===================== */}
      <div className="space-y-3">
        {refused ? (
          <div className="border border-amber-300 bg-amber-500/10 p-4 text-sm leading-relaxed text-amber-800">
            <p className="font-semibold">
              {t("notParameterised", {
                fuel: ds.fuels.find((f) => f.id === (result as NotParameterised).fuelId)?.name ?? "",
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
        ) : ok && active ? (
          <>
            <div className="border border-neutral-300 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
                {t("avoided")}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-px bg-neutral-300">
                <div className="bg-white p-3">
                  <p className="text-2xl font-semibold tabular-nums text-brand-deep">
                    {fmt1(ok.wellToWake.avoidedTco2e)}
                  </p>
                  <p className="text-[11px] text-neutral-500">tCO2e · {t("avoidedWtw")}</p>
                </div>
                <div className="bg-white p-3">
                  <p className="text-2xl font-semibold tabular-nums">
                    {fmt1(ok.tankToWake.avoidedTco2e)}
                  </p>
                  <p className="text-[11px] text-neutral-500">tCO2e · {t("avoidedTtw")}</p>
                </div>
              </div>
              <p className="mt-2 text-sm">
                {t("reduction")}:{" "}
                <span className="font-semibold tabular-nums">
                  {fmt1(active.reductionPercent)}%
                </span>
              </p>
              <p className="mt-1 text-xs text-neutral-600">
                {t("candidateIntensity")}:{" "}
                <span className="tabular-nums">{fmt2(active.candidate.intensityGco2ePerMj)}</span>{" "}
                · {t("baselineIntensity")}:{" "}
                <span className="tabular-nums">{fmt2(active.baseline.intensityGco2ePerMj)}</span>{" "}
                gCO2e/MJ
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {t("references", {
                  gfi: String(ok.references.imoGfi2008),
                  feu: String(ok.references.fuelEuBaseline),
                })}
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                <span
                  className={`px-1.5 py-0.5 font-medium ${
                    ok.znz.compliantTo2034
                      ? "bg-emerald-500/10 text-emerald-800"
                      : "bg-red-500/10 text-red-800"
                  }`}
                >
                  {t("znzTo2034")}: {ok.znz.compliantTo2034 ? t("compliant") : t("notCompliant")}{" "}
                  ({fmt2(ok.znz.blendWtwGco2ePerMj)})
                </span>
                <span
                  className={`px-1.5 py-0.5 font-medium ${
                    ok.znz.compliantFrom2035
                      ? "bg-emerald-500/10 text-emerald-800"
                      : "bg-red-500/10 text-red-800"
                  }`}
                >
                  {t("znzFrom2035")}:{" "}
                  {ok.znz.compliantFrom2035 ? t("compliant") : t("notCompliant")}
                </span>
              </div>
            </div>

            <div className="border border-neutral-300 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
                {t("decomposition", {
                  basis: basis === "wellToWake" ? t("avoidedWtw") : t("avoidedTtw"),
                })}
              </p>
              <table className="mt-2 w-full text-xs tabular-nums">
                <thead>
                  <tr className="border-b border-neutral-300 text-left text-[11px] uppercase tracking-wider text-neutral-500">
                    <th className="py-1.5 pr-2 font-medium">&nbsp;</th>
                    <th className="py-1.5 pr-2 text-right font-medium">{t("colCandidate")}</th>
                    <th className="py-1.5 text-right font-medium">{t("colBaseline")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["rowWtt", active.candidate.parts.wttTco2e, active.baseline.parts.wttTco2e, `${candidateRow.source}`],
                      ["rowTtwCo2", active.candidate.parts.ttwCo2Tco2e, active.baseline.parts.ttwCo2Tco2e, baselineRow.derivation],
                      ["rowTtwCh4", active.candidate.parts.ttwCh4Tco2e, active.baseline.parts.ttwCh4Tco2e, ds.gwpSets[ok.gwpSetId]!.source],
                      ["rowTtwN2o", active.candidate.parts.ttwN2oTco2e, active.baseline.parts.ttwN2oTco2e, ds.gwpSets[ok.gwpSetId]!.source],
                      ["rowSlip", active.candidate.parts.n2oSlipTco2e, 0, `${ds.n2oSlip.note} ${n2oScenario.source}`],
                      ["rowPilot", active.candidate.parts.pilotTco2e, 0, ds.pilotFuel.source],
                    ] as const
                  ).map(([key, cand, base, source]) => (
                    <tr key={key} className="border-b border-neutral-100">
                      <td className="py-1.5 pr-2 text-neutral-600">
                        {t(key)}
                        <Help text={source} />
                      </td>
                      <td className="py-1.5 pr-2 text-right">{fmt1(cand)}</td>
                      <td className="py-1.5 text-right">{fmt1(base)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-1.5 pr-2">{t("rowTotal")}</td>
                    <td className="py-1.5 pr-2 text-right">
                      {fmt1(active.candidate.emissionsTco2e)}
                    </td>
                    <td className="py-1.5 text-right">
                      {fmt1(active.baseline.emissionsTco2e)}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-2 text-[11px] leading-snug text-neutral-500">
                {t("datasetNote", { version: ds.datasetVersion })}{" "}
                {formatSig(ok.totalEnergyMj)} MJ delivered. {t("disclaimerNote")}
              </p>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
