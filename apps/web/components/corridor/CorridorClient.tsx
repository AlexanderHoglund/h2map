"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { useCorridorModel } from "./state";
import { CargoStep, FuelStep, PortStep, RegulationStep, VesselStep } from "./steps";
import ResultsPanel from "./ResultsPanel";
import ScenarioBar from "./ScenarioBar";

/**
 * The integrated workspace: ONE model, one screen. The top bar is the only
 * nav — brand + the five steps (the workbook's input tabs). Below it: the
 * active step's form (left) and the results panel (right, wide, always
 * live — the engine runs client-side on every keystroke). On the FUEL step,
 * when the green fuel is constructed / built at a picked site, the full
 * Explorer (layers, cost years, basis, basemap, search, cell drawer,
 * evaluate split) opens as the center pane — "use as corridor fuel site"
 * feeds the green side directly.
 */

// The FULL Explorer (map + on-demand evaluate split) as the center canvas.
const ExplorerWorkspace = dynamic(
  () => import("@/components/hexplorer/ExplorerWorkspace"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-xs text-neutral-500">…</div>
    ),
  },
);

const STEPS = ["cargo", "vessel", "fuel", "port", "regulation"] as const;
type StepKey = (typeof STEPS)[number];

export default function CorridorClient() {
  const t = useTranslations("corridor");
  const tc = useTranslations();
  const model = useCorridorModel();
  const [entered, setEntered] = useState(false);
  const [step, setStep] = useState<StepKey>("cargo");
  const stepIndex = STEPS.indexOf(step);

  const goTo = (key: StepKey) => {
    setEntered(true);
    setStep(key);
  };

  const gap = model.result?.summary.gapPvUsdM;

  // The map belongs to the fuel decision: shown only while the green fuel is
  // constructed ("construct") or sited on the map ("build-here"). Picking a
  // cell on it converts construct → build-here with the cell as the site.
  const mapOpen =
    step === "fuel" &&
    (model.scenario.green.sourcing === "construct" ||
      model.scenario.green.sourcing === "build-here");

  const stepBody: Record<StepKey, React.ReactNode> = {
    cargo: <CargoStep model={model} />,
    vessel: <VesselStep model={model} />,
    fuel: <FuelStep model={model} />,
    port: <PortStep model={model} />,
    regulation: <RegulationStep model={model} />,
  };

  return (
    <div className="flex h-dvh flex-col">
      {/* ===== The one nav bar: brand | five steps | live gap + docs ===== */}
      <header className="flex shrink-0 items-stretch border-b border-neutral-300 bg-white">
        <Link
          href="/corridor"
          className="flex items-center gap-2.5 border-r border-neutral-300 px-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- decorative SVG */}
          <img src="/thaduberg-mark.svg" alt="" className="h-7 w-auto" />
          <span className="text-sm font-semibold tracking-tight">
            {tc("app.name")}
          </span>
        </Link>

        <nav
          aria-label={t("title")}
          className="flex min-w-0 flex-1 items-stretch overflow-x-auto"
        >
          {STEPS.map((key, i) => {
            const active = entered && key === step;
            const visited = entered && i <= stepIndex;
            return (
              <button
                key={key}
                type="button"
                onClick={() => goTo(key)}
                aria-current={active ? "step" : undefined}
                className={`flex shrink-0 flex-col items-start justify-center gap-0.5 border-r border-neutral-300 px-4 py-2 text-left transition-colors ${
                  active
                    ? "bg-brand text-white"
                    : visited
                      ? "bg-white text-neutral-900 hover:bg-neutral-100"
                      : "bg-white text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
                }`}
              >
                <span
                  className={`font-mono text-[10px] uppercase tracking-widest ${
                    active ? "text-white" : "text-neutral-500"
                  }`}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="whitespace-nowrap text-sm font-medium">
                  {t(`steps.${key}`)}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-4 px-4">
          {entered && gap != null && (
            <span className="hidden items-center gap-2 font-mono text-xs tabular-nums md:flex">
              <span className="uppercase tracking-widest text-neutral-500">
                {t("results.gapShort")}
              </span>
              <span className="font-semibold text-brand-deep">
                ${gap.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}m
              </span>
            </span>
          )}
          <Link
            href="/methodology"
            className="hidden text-xs text-neutral-500 hover:text-neutral-900 sm:block"
          >
            {tc("nav.methodology")}
          </Link>
        </div>
      </header>

      {/* ===== Entry screen (Cover tab) ===== */}
      {!entered ? (
        <main className="bg-plus-grid flex flex-1 items-center justify-center overflow-y-auto px-4">
          <div className="max-w-2xl border border-neutral-300 bg-white p-8">
            {/* The full Thaduberg lockup gets its landing moment here. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG */}
            <img
              src="/thaduberg-final-stripes-black-text.svg"
              alt="Thaduberg"
              className="mb-6 h-24 w-auto"
            />
            <h1 className="text-2xl font-semibold tracking-tight">{t("intro.heading")}</h1>
            <p className="mt-3 text-sm leading-relaxed text-neutral-600">
              {t("intro.body")}
            </p>
            <Button variant="primary" size="md" className="mt-6" onClick={() => setEntered(true)}>
              {model.hadDraft ? t("intro.resume") : t("intro.start")}
            </Button>
          </div>
        </main>
      ) : (
        /* ===== Workspace: form | map | results ===== */
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          {/* Form pane */}
          <div className="min-w-0 shrink-0 border-neutral-300 bg-page p-3 lg:w-95 lg:overflow-y-auto lg:border-r xl:w-100">
            <ScenarioBar model={model} />
            {stepBody[step]}
            <div className="mt-4 flex justify-between">
              <Button
                size="md"
                className="px-3 py-1.5 font-normal"
                disabled={stepIndex === 0}
                onClick={() => setStep(STEPS[stepIndex - 1] ?? step)}
              >
                {t("nav.back")}
              </Button>
              {stepIndex < STEPS.length - 1 && (
                <Button
                  variant="primary"
                  size="md"
                  className="px-3 py-1.5"
                  onClick={() => setStep(STEPS[stepIndex + 1] ?? step)}
                >
                  {t("nav.next")}
                </Button>
              )}
            </div>
          </div>

          {/* THE map — the full Explorer (incl. the evaluate split); fuel
              step only, while constructing / siting the green fuel */}
          {mapOpen && (
            <div className="relative h-105 shrink-0 border-y border-neutral-300 lg:h-auto lg:min-w-0 lg:flex-1 lg:border-y-0">
              <ExplorerWorkspace onUseSite={model.pickSite} />
            </div>
          )}

          {/* Results pane — always live; takes ALL remaining width when the
              map is closed (two-column card grid on wide screens) */}
          <aside
            className={`w-full overflow-y-auto border-neutral-300 bg-page p-3 lg:border-l ${
              mapOpen
                ? "shrink-0 lg:w-100 xl:w-130 2xl:w-160"
                : "min-w-0 lg:flex-1"
            }`}
          >
            <h2 className="mb-2 text-sm font-semibold">{t("results.heading")}</h2>
            <ResultsPanel
              result={model.result}
              scenario={model.scenario}
              error={model.error}
              wide={!mapOpen}
            />
          </aside>
        </main>
      )}
    </div>
  );
}
