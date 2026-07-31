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
import ShippingCanvas from "./ShippingCanvas";

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
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);
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
      <header className="relative flex shrink-0 items-stretch border-b border-neutral-300 bg-white">
        <Link
          href="/corridor"
          className="flex flex-col items-start justify-center gap-1 border-r border-neutral-300 px-4"
        >
          {/* Small mark with the name BELOW the wave (the lockup's layout) */}
          {/* eslint-disable-next-line @next/next/no-img-element -- decorative SVG */}
          <img src="/thaduberg-mark.svg" alt="" className="h-4 w-auto" />
          <span className="text-[11px] font-semibold leading-none tracking-tight">
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
                className={`flex w-40 shrink-0 flex-col items-start justify-center gap-0.5 border-r border-neutral-300 px-4 py-2 text-left transition-colors ${
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
                <span className="w-full truncate whitespace-nowrap text-sm font-medium">
                  {label}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-stretch">
          {entered && gap != null && (
            <span className="hidden items-center gap-2 px-4 font-mono text-xs tabular-nums md:flex">
              <span className="uppercase tracking-widest text-neutral-500">
                {t("results.gapShort")}
              </span>
              <span className="font-semibold text-brand-deep">
                ${gap.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}m
              </span>
            </span>
          )}
          {/* The menu, far right */}
          <nav className="hidden items-center gap-1 border-l border-neutral-300 px-3 sm:flex">
            <Link
              href="/about/data"
              className="px-2.5 py-1 text-xs text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
            >
              {tc("nav.about")}
            </Link>
            <Link
              href="/methodology"
              className="px-2.5 py-1 text-xs text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
            >
              {tc("nav.documentation")}
            </Link>
            <button
              type="button"
              onClick={() => setDisclaimerOpen((v) => !v)}
              aria-expanded={disclaimerOpen}
              className="px-2.5 py-1 text-xs text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
            >
              {tc("nav.disclaimer")}
            </button>
          </nav>
        </div>
        {disclaimerOpen && (
          <div className="absolute right-3 top-full z-50 mt-2 w-80 border border-neutral-300 bg-white p-4 shadow-md">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
              {tc("disclaimer.title")}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-neutral-700">
              {tc("disclaimer.body")}
            </p>
            <button
              type="button"
              onClick={() => setDisclaimerOpen(false)}
              className="mt-3 border border-neutral-300 px-2.5 py-1 text-xs font-medium hover:bg-neutral-100"
            >
              OK
            </button>
          </div>
        )}
      </header>

      {/* ===== Entry screen: split hero — copy left, shipping chart right ===== */}
      {!entered ? (
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          {/* Left: plain column, headline-led (the technical texture stays
              on the chart panel) */}
          <div className="flex flex-1 items-center bg-page px-8 py-12 lg:px-14">
            <div className="max-w-xl">
              {/* eslint-disable-next-line @next/next/no-img-element -- static brand SVG */}
              <img
                src="/thaduberg-final-stripes-black-text.svg"
                alt="Thaduberg"
                className="mb-10 h-14 w-auto"
              />
              <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight lg:text-5xl">
                {t("intro.heading")}
              </h1>
              <p className="mt-6 text-base leading-relaxed text-neutral-600">
                {t("intro.body")}
              </p>
              <button
                type="button"
                onClick={() => setEntered(true)}
                className="mt-8 inline-flex items-center gap-2 bg-brand-tint px-5 py-2.5 text-sm font-medium text-brand-deep transition-colors hover:bg-brand hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                {model.hadDraft ? t("intro.resume") : t("intro.start")} →
              </button>
            </div>
          </div>
          {/* Right: the drafting-grid panel with the 2D shipping chart */}
          <div className="bg-plus-grid relative hidden overflow-hidden border-l border-neutral-300 lg:block lg:w-[55%]">
            <ShippingCanvas />
          </div>
        </main>
      ) : view === "results" ? (
        /* ===== Results tab: the full panel, full width ===== */
        <main className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mx-auto max-w-375">
            <h2 className="mb-3 text-sm font-semibold">{t("results.heading")}</h2>
            <ResultsPanel
              result={model.result}
              scenario={model.scenario}
              error={model.error}
            />
          </div>
        </main>
      ) : (
        /* ===== Input steps: form | (map) | compact summary ===== */
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          {/* Form pane — wide enough to breathe in both modes: with the map
              open it keeps a comfortable fixed width (the map flexes), and
              with it closed it takes the room next to the summary */}
          <div
            className={`min-w-0 border-neutral-300 p-3 lg:overflow-y-auto lg:border-r ${
              mapOpen ? "shrink-0 lg:w-130 xl:w-150" : "lg:flex-1"
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

          {/* Compact live summary — small; the full panel is the Results tab.
              Hidden while the map is open (the top-bar gap chip stays live)
              so form + map are never squeezed three ways. */}
          {!mapOpen && (
            <aside className="w-full shrink-0 overflow-y-auto border-neutral-300 p-3 lg:w-72 lg:border-l xl:w-80">
              <h2 className="mb-2 text-sm font-semibold">{t("results.heading")}</h2>
              <ResultsSummary
                result={model.result}
                scenario={model.scenario}
                error={model.error}
                onViewFull={() => goTo("results")}
              />
            </aside>
          )}
        </main>
      )}
    </div>
  );
}
