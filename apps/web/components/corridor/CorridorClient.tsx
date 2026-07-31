"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { useCorridorModel } from "./state";
import { CargoStep, FuelStep, PortStep, RegulationStep, VesselStep } from "./steps";
import ResultsPanel from "./ResultsPanel";
import ResultsSummary from "./ResultsSummary";
import ScenarioBar from "./ScenarioBar";

/**
 * The integrated workspace: ONE model, one screen. The top bar is the only
 * nav — brand + the five input steps + the Results tab. The input steps show
 * the form with a COMPACT live summary docked right; the Results tab shows
 * the full panel (waterfall, regulatory table, per-year chart) at full
 * width. On the FUEL step, while the green fuel is constructed / built at a
 * picked site, the full Explorer (layers, cost years, basis, basemap,
 * search, cell drawer, evaluate split) opens as the center pane — "use as
 * corridor fuel site" feeds the green side directly.
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
type View = StepKey | "results";

export default function CorridorClient() {
  const t = useTranslations("corridor");
  const tc = useTranslations();
  const model = useCorridorModel();
  const [entered, setEntered] = useState(false);
  const [view, setView] = useState<View>("cargo");
  const stepIndex = view === "results" ? STEPS.length : STEPS.indexOf(view);

  const goTo = (key: View) => {
    setEntered(true);
    setView(key);
  };

  const gap = model.result?.summary.gapPvUsdM;

  // The map opens only when it is actually needed: the fuel step with the
  // green fuel sited on the map ("build-here"). Plain construct/purchase/
  // named-plant are number entry — no map.
  const mapOpen =
    view === "fuel" && model.scenario.green.sourcing === "build-here";

  const stepBody: Record<StepKey, React.ReactNode> = {
    cargo: <CargoStep model={model} />,
    vessel: <VesselStep model={model} />,
    fuel: <FuelStep model={model} />,
    port: <PortStep model={model} />,
    regulation: <RegulationStep model={model} />,
  };

  const tabs: { key: View; label: string }[] = [
    ...STEPS.map((key) => ({ key: key as View, label: t(`steps.${key}`) })),
    { key: "results", label: t("results.heading") },
  ];

  return (
    <div className="flex h-dvh flex-col">
      {/* ===== The one nav bar: brand | 5 steps + Results | gap + docs ===== */}
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
          {tabs.map(({ key, label }, i) => {
            const active = entered && key === view;
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
                  {label}
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
      ) : view === "results" ? (
        /* ===== Results tab: the full panel, full width ===== */
        <main className="min-h-0 flex-1 overflow-y-auto bg-page p-4">
          <div className="mx-auto max-w-375">
            <h2 className="mb-3 text-sm font-semibold">{t("results.heading")}</h2>
            <ResultsPanel
              result={model.result}
              scenario={model.scenario}
              error={model.error}
              wide
            />
          </div>
        </main>
      ) : (
        /* ===== Input steps: form | (map) | compact summary ===== */
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          {/* Form pane — gets the room when the map is closed */}
          <div
            className={`min-w-0 border-neutral-300 bg-page p-3 lg:overflow-y-auto lg:border-r ${
              mapOpen ? "shrink-0 lg:w-95 xl:w-100" : "lg:flex-1"
            }`}
          >
            <div className={mapOpen ? "" : "mx-auto max-w-3xl"}>
              <ScenarioBar model={model} />
              {stepBody[view]}
              <div className="mt-4 flex justify-between">
                <Button
                  size="md"
                  className="px-3 py-1.5 font-normal"
                  disabled={stepIndex === 0}
                  onClick={() => setView(STEPS[stepIndex - 1] ?? view)}
                >
                  {t("nav.back")}
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  className="px-3 py-1.5"
                  onClick={() =>
                    setView(stepIndex < STEPS.length - 1 ? STEPS[stepIndex + 1]! : "results")
                  }
                >
                  {stepIndex < STEPS.length - 1 ? t("nav.next") : t("results.heading")}
                </Button>
              </div>
            </div>
          </div>

          {/* THE map — the full Explorer (incl. the evaluate split); fuel
              step only, while constructing / siting the green fuel */}
          {mapOpen && (
            <div className="relative h-105 shrink-0 border-y border-neutral-300 lg:h-auto lg:min-w-0 lg:flex-1 lg:border-y-0">
              <ExplorerWorkspace onUseSite={model.pickSite} />
            </div>
          )}

          {/* Compact live summary — small; the full panel is the Results tab */}
          <aside className="w-full shrink-0 overflow-y-auto border-neutral-300 bg-page p-3 lg:w-72 lg:border-l xl:w-80">
            <h2 className="mb-2 text-sm font-semibold">{t("results.heading")}</h2>
            <ResultsSummary
              result={model.result}
              scenario={model.scenario}
              error={model.error}
              onViewFull={() => goTo("results")}
            />
          </aside>
        </main>
      )}
    </div>
  );
}
