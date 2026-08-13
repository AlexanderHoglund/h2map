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
import seedJson from "../../../../data/fuel-emissions-ref/2026-08-13-seed-1.json";

/**
 * Fuel Emissions Calculator (client-side, recomputes on keystroke).
 * Direction-first: the page opens on a two-card chooser — "I have green
 * fuel" or "Replace fossil fuel" — and only then shows the form, ordered
 * for that direction (the fuel you START from comes first). The
 * equivalence line under the quantity is the pedagogical payload both
 * ways. Detail lives in Help tooltips, not on the page.
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

export default function FuelEmissionsPanel() {
  const t = useTranslations("fuelEmissions");
  const [frameworkId, setFrameworkId] = useState("fueleu");
  const [basis, setBasis] = useState<"wellToWake" | "tankToWake">("wellToWake");
  const [direction, setDirection] = useState<"candidate" | "baseline" | null>(null);
  const [candidateFuelId, setCandidateFuelId] = useState("e-ammonia");
  const [quantityTonnes, setQuantityTonnes] = useState(1000);
  const [candidateWtw, setCandidateWtw] = useState(15);
  const [baselineFuelId, setBaselineFuelId] = useState("vlsfo");
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
          quantityTonnes,
          quantityBasis: direction ?? "candidate",
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
  const refused = "notParameterised" in result && result.notParameterised;
  const ok = refused ? null : (result as FuelEmissionsResult);
  const active = ok ? (basis === "wellToWake" ? ok.wellToWake : ok.tankToWake) : null;
  const other = ok ? (basis === "wellToWake" ? ok.tankToWake : ok.wellToWake) : null;

  /* ============ Direction chooser: decide first, then the form ========= */
  if (!direction) {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
          {t("chooserPrompt")}
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {/* Fossil-first: "I have fossil" is the common starting point. */}
          <button
            type="button"
            onClick={() => setDirection("baseline")}
            className="border border-neutral-300 bg-white p-5 text-left transition-colors hover:border-brand-deep hover:bg-brand-tint/30"
          >
            <span className="block text-base font-semibold text-brand-deep">
              {t("directionReverse")}
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-neutral-600">
              {t("chooserReverseDesc")}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setDirection("candidate")}
            className="border border-neutral-300 bg-white p-5 text-left transition-colors hover:border-brand-deep hover:bg-brand-tint/30"
          >
            <span className="block text-base font-semibold text-brand-deep">
              {t("directionForward")}
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-neutral-600">
              {t("chooserForwardDesc")}
            </span>
          </button>
        </div>
      </div>
    );
  }

  /* Form blocks, composed in direction order (start fuel first). */
  const candidateSelect = (
    <Select
      label={t("candidate")}
      value={candidateFuelId}
      options={ds.fuels
        .filter((f) => f.family === "green" || f.id === "lng")
        .map((f) => ({ value: f.id, label: f.name }))}
      onChange={setCandidateFuelId}
    />
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
        <div className="sm:col-span-2 flex items-center justify-between bg-neutral-500/10 px-2.5 py-1.5">
          <span className="text-xs font-medium text-neutral-700">
            {direction === "candidate" ? t("directionForward") : t("directionReverse")}
          </span>
          <button
            type="button"
            onClick={() => setDirection(null)}
            className="text-xs font-medium text-brand-deep underline"
          >
            {t("changeDirection")}
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
            <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
              {t("avoided")}
            </p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-brand-deep">
              {fmt1(active.avoidedTco2e)}{" "}
              <span className="text-sm font-normal text-neutral-500">
                tCO2e · {basis === "wellToWake" ? t("avoidedWtw") : t("avoidedTtw")}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-neutral-500">
              {fmt1(other.avoidedTco2e)} tCO2e{" "}
              {basis === "wellToWake" ? t("avoidedTtw") : t("avoidedWtw")} ·{" "}
              {t("reduction")}{" "}
              <span className="font-medium tabular-nums">
                {fmt1(active.reductionPercent)}%
              </span>
            </p>
            <p className="mt-2 text-xs text-neutral-600">
              {fmt2(active.candidate.intensityGco2ePerMj)} vs{" "}
              {fmt2(active.baseline.intensityGco2ePerMj)} gCO2e/MJ
              <Help
                text={t("intensityHelp", {
                  gfi: String(ok.references.imoGfi2008),
                  feu: String(ok.references.fuelEuBaseline),
                })}
              />
            </p>
            <p className="mt-1 text-xs">
              ZNZ:{" "}
              <span
                className={
                  ok.znz.compliantTo2034
                    ? "font-medium text-emerald-800"
                    : "font-medium text-red-800"
                }
              >
                {ok.znz.compliantTo2034 ? t("compliant") : t("notCompliant")} ≤19.0 (to
                2034)
              </span>
              ,{" "}
              <span
                className={
                  ok.znz.compliantFrom2035
                    ? "font-medium text-emerald-800"
                    : "font-medium text-red-800"
                }
              >
                {ok.znz.compliantFrom2035 ? t("compliant") : t("notCompliant")} ≤14.0
                (from 2035)
              </span>{" "}
              — {t("blend")} {fmt2(ok.znz.blendWtwGco2ePerMj)}
            </p>

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
                {(
                  [
                    ["rowWtt", active.candidate.parts.wttTco2e, active.baseline.parts.wttTco2e, candidateRow.source],
                    ["rowTtwCo2", active.candidate.parts.ttwCo2Tco2e, active.baseline.parts.ttwCo2Tco2e, baselineRow.derivation],
                    ["rowTtwCh4", active.candidate.parts.ttwCh4Tco2e, active.baseline.parts.ttwCh4Tco2e, ds.gwpSets[ok.gwpSetId]!.source],
                    ["rowTtwN2o", active.candidate.parts.ttwN2oTco2e, active.baseline.parts.ttwN2oTco2e, ds.gwpSets[ok.gwpSetId]!.source],
                    ["rowSlip", active.candidate.parts.n2oSlipTco2e, 0, n2oScenario.source],
                    ["rowPilot", active.candidate.parts.pilotTco2e, 0, ds.pilotFuel.source],
                  ] as const
                )
                  // Only rows that carry a number render — zero rows are noise.
                  .filter(([, cand, base]) => Math.abs(cand) >= 0.05 || Math.abs(base) >= 0.05)
                  .map(([key, cand, base, source]) => (
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
                  <td className="py-1.5 text-right">{fmt1(active.baseline.emissionsTco2e)}</td>
                </tr>
              </tbody>
            </table>
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
