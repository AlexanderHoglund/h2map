"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useCorridorModel } from "./state";
import { CargoStep, FuelStep, PortStep, RegulationStep, VesselStep } from "./steps";
import ResultsPanel from "./ResultsPanel";
import ScenarioBar from "./ScenarioBar";

/**
 * Corridor shell (build-plan 3.1): five steps mirroring the workbook's input
 * tabs, linear progression with free navigation back, and the results panel
 * always docked (desktop right rail; stacked below on mobile). The Cover
 * tab's how-to-use content is the first-run entry screen. Scenario
 * auto-saves as a local draft (account save/share is 3.5).
 */

const STEPS = ["cargo", "vessel", "fuel", "port", "regulation"] as const;
type StepKey = (typeof STEPS)[number];

export default function CorridorClient() {
  const t = useTranslations("corridor");
  const model = useCorridorModel();
  const [entered, setEntered] = useState(false);
  const [step, setStep] = useState<StepKey>("cargo");
  const stepIndex = STEPS.indexOf(step);

  if (!entered) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-semibold">{t("intro.heading")}</h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          {t("intro.body")}
        </p>
        <button
          type="button"
          onClick={() => setEntered(true)}
          className="mt-6 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          {model.hadDraft ? t("intro.resume") : t("intro.start")}
        </button>
      </main>
    );
  }

  const stepBody: Record<StepKey, React.ReactNode> = {
    cargo: <CargoStep model={model} />,
    vessel: <VesselStep model={model} />,
    fuel: <FuelStep model={model} />,
    port: <PortStep model={model} />,
    regulation: <RegulationStep model={model} />,
  };

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 lg:flex-row">
      {/* Form column */}
      <div className="min-w-0 flex-1">
        <ScenarioBar model={model} />
        {/* Stepper */}
        <nav aria-label={t("title")} className="mb-4 flex flex-wrap gap-1">
          {STEPS.map((key, i) => {
            const active = key === step;
            const visited = i <= stepIndex;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setStep(key)}
                aria-current={active ? "step" : undefined}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-blue-600 text-white"
                    : visited
                      ? "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                      : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                }`}
              >
                {i + 1} · {t(`steps.${key}`)}
              </button>
            );
          })}
        </nav>

        {stepBody[step]}

        {/* Back / Next */}
        <div className="mt-4 flex justify-between">
          <button
            type="button"
            disabled={stepIndex === 0}
            onClick={() => setStep(STEPS[stepIndex - 1] ?? step)}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-neutral-700"
          >
            {t("nav.back")}
          </button>
          {stepIndex < STEPS.length - 1 && (
            <button
              type="button"
              onClick={() => setStep(STEPS[stepIndex + 1] ?? step)}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
            >
              {t("nav.next")}
            </button>
          )}
        </div>
      </div>

      {/* Docked results (desktop right rail; below the form on mobile) */}
      <aside className="w-full shrink-0 lg:w-[340px]">
        <div className="lg:sticky lg:top-16">
          <h2 className="mb-2 text-sm font-semibold">{t("results.heading")}</h2>
          <ResultsPanel result={model.result} scenario={model.scenario} error={model.error} />
        </div>
      </aside>
    </main>
  );
}
