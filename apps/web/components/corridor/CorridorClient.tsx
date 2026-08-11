"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { useCorridorModel } from "./state";
import { downloadResultsXlsx } from "./exportXlsx";
import {
  CargoStep,
  CargoTabStep,
  FuelStep,
  PortStep,
  FinancingStep,
  RegulationStep,
  VesselStep,
} from "./steps";
import ResultsPanel from "./ResultsPanel";
import { firstBlockedTab, tabStatuses } from "./tabStatus";
import ResultsSummary from "./ResultsSummary";
import ScenarioBar from "./ScenarioBar";
import ProjectsPanel from "./ProjectsPanel";
import { useProjects } from "./useProjects";
import CorridorArtwork from "./CorridorArtwork";

/**
 * The integrated workspace: ONE model, one screen. The top bar is the only
 * nav — brand + the seven input steps + the Results tab. The input steps show
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

/**
 * The MMMCZCS Phase II domain sequence: Energy · Vessels · Cargo · Ports,
 * with Regulation & Funding beneath. Intro fronts the walk (route, ports,
 * timeline, model options). The keys are semantic and PURELY client state —
 * never in a URL or stored anywhere — so they name the domain, not the
 * scenario group a tab happens to render (the Cargo tab shows `cargo.*`
 * cargo-identity fields, but so does Intro's timeline: storage and
 * presentation are deliberately decoupled).
 */
const STEPS = ["intro", "energy", "vessels", "cargo", "ports", "financing", "regulation"] as const;
type StepKey = (typeof STEPS)[number];
/** Tab 00 (projects) sits before the seven input steps; results closes. */
type View = "projects" | StepKey | "results";

/**
 * Per-tab tone from the MMMCZCS process model's domain palette (globals.css
 * --domain-*). Intro and Results carry no domain — they stay neutral on the
 * brand tone; Projects sits outside the walk in grey. Held as
 * space-separated RGB channels so the value drops straight into an
 * rgb(… / α) at low alpha — the tint is decorative, never loud. Set as
 * `--tone` on each tab (its own colour) and on the workspace (the active
 * tab's colour); `--tone-text` is the AA-darkened variant for text.
 */
const TONES: Record<View, string> = {
  projects: "82 81 78",
  intro: "33 113 181", // no domain, brand tone
  energy: "78 167 46", // Energy
  vessels: "15 158 213", // Vessels
  cargo: "21 96 130", // Cargo
  ports: "233 113 50", // Ports
  financing: "160 43 147", // same domain family as Regulation ("Regulation & Funding")
  regulation: "160 43 147", // Regulation & Funding
  results: "33 113 181", // no domain, brand tone
};

/**
 * Simplified/Standard is a VIEW preference, not scenario state: it lives in
 * localStorage (per user, like the draft), never in the scenario object,
 * exported JSON or a share link — two people opening the same scenario in
 * different modes must see the same numbers. Simplified shows fewer inputs,
 * not different ones: everything below the sensitivity top-level stays on
 * its benchmarks and the folds lock shut.
 */
const VIEWMODE_KEY = "corridor-viewmode-v1";
type ViewMode = "simplified" | "standard";

/** Same hues darkened to ≥4.5:1 on white — for section headers, never washes. */
const TONE_TEXT: Record<View, string> = {
  projects: "#52514e",
  intro: "var(--color-brand-strong)",
  energy: "var(--domain-energy-text)",
  vessels: "var(--domain-vessels-text)",
  cargo: "var(--domain-cargo-text)",
  ports: "var(--domain-ports-text)",
  financing: "var(--domain-regulation-text)",
  regulation: "var(--domain-regulation-text)",
  results: "var(--color-brand-strong)",
};

export default function CorridorClient() {
  const t = useTranslations("corridor");
  const tc = useTranslations();
  const model = useCorridorModel();
  const [entered, setEntered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);
  const [legacyDismissed, setLegacyDismissed] = useState(false);
  // Projects-first: the platform lands on tab 00 until a project is
  // selected or created (the input tabs stay disabled until then).
  const [view, setView] = useState<View>("projects");
  const [projectChosen, setProjectChosen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    // Simplified is the default; stored preferences (including the legacy
    // "simple"/"advanced" values) are honored.
    try {
      const stored = localStorage.getItem(VIEWMODE_KEY);
      return stored === "standard" || stored === "advanced"
        ? "standard"
        : "simplified";
    } catch {
      return "simplified";
    }
  });
  const viewModeRef = useRef(viewMode);
  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);
  /** Apply a mode locally (state + browser pref) — no server write. */
  const applyViewMode = useCallback((m: ViewMode) => {
    setViewMode(m);
    try {
      localStorage.setItem(VIEWMODE_KEY, m);
    } catch {
      /* best-effort preference */
    }
  }, []);
  const projects = useProjects(model, {
    getViewMode: useCallback(() => viewModeRef.current, []),
    // A loaded project reopens in whatever mode it was last in.
    onViewMode: useCallback(
      (m: ViewMode | null) => {
        if (m) applyViewMode(m);
      },
      [applyViewMode],
    ),
  });
  /** The header toggle IS the project's mode: apply + persist to the row. */
  const pickViewMode = (m: ViewMode) => {
    applyViewMode(m);
    projects.setProjectViewMode(m);
  };
  // Step position for Back/Next + the visited shading. Projects (tab 00) is
  // not part of the walk: it reports -1.
  const stepIndex =
    view === "results"
      ? STEPS.length
      : view === "projects"
        ? -1
        : STEPS.indexOf(view);

  // A project is "chosen" once any saved row is open (load / create / save /
  // the ?s= deep link) or the user explicitly continues the local draft.
  const chosen = projectChosen || projects.currentId !== null;

  const goTo = (key: View) => {
    // The input tabs unlock only once a project is selected or created.
    if (!chosen && key !== "projects") return;
    setEntered(true);
    setView(key);
  };

  const gap = model.result?.summary.gapPvUsdM;

  // Per-tab completion state (validation-derived) + focus-the-fault: landing
  // on a tab whose indicator is red or amber puts focus on the offending
  // control, so the dot navigates AND points.
  const statuses = tabStatuses(model);
  const blockedTab = firstBlockedTab(statuses);
  useEffect(() => {
    const status = statuses[view];
    if (status.state === "green" || !status.targetFieldId) return;
    const id = requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(
          `[data-field-id="${status.targetFieldId}"] select, ` +
            `[data-field-id="${status.targetFieldId}"] input`,
        )
        ?.focus();
    });
    return () => cancelAnimationFrame(id);
    // Only when the user changes tab — statuses recompute every render and
    // must not steal focus mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // The map opens only when it is actually needed: the Energy step with the
  // green fuel sited on the map ("build-here"). Purchase/build-plant are
  // number entry — no map.
  const mapOpen =
    view === "energy" && model.scenario.green.sourcing === "build-here";

  const stepProps = {
    model,
    viewMode,
    revealStandard: () => pickViewMode("standard"),
  };
  const stepBody: Record<StepKey, React.ReactNode> = {
    intro: <CargoStep {...stepProps} />,
    energy: <FuelStep {...stepProps} />,
    vessels: <VesselStep {...stepProps} />,
    cargo: <CargoTabStep {...stepProps} />,
    ports: <PortStep {...stepProps} />,
    financing: <FinancingStep {...stepProps} />,
    regulation: <RegulationStep {...stepProps} />,
  };

  const tabs: { key: View; label: string }[] = [
    { key: "projects", label: t("projects.tab") },
    ...STEPS.map((key) => ({ key: key as View, label: t(`steps.${key}`) })),
    { key: "results", label: t("results.heading") },
  ];

  return (
    <div
      className="flex h-dvh flex-col"
      style={
        { "--tone": TONES[view], "--tone-text": TONE_TEXT[view] } as React.CSSProperties
      }
    >
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

        {/* The project being edited — pinned to the LEFT on every tab so it
            is always clear whose numbers the workspace shows. Clicking it
            returns to the Projects tab. */}
        {entered && chosen && (
          <button
            type="button"
            onClick={() => goTo("projects")}
            title={projects.name}
            className="flex w-44 shrink-0 flex-col items-start justify-center gap-0.5 border-r border-neutral-300 bg-brand-tint/40 px-3 py-2 text-left transition-colors hover:bg-brand-tint"
          >
            <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-600">
              {t("projects.chipLabel")}
              {!projects.currentId && (
                <span className="ml-1 normal-case tracking-normal text-amber-800">
                  {t("projects.chipUnsaved")}
                </span>
              )}
            </span>
            <span className="w-full truncate whitespace-nowrap text-sm font-medium text-brand-deep">
              {projects.name}
            </span>
          </button>
        )}

        <nav
          aria-label={t("title")}
          className="flex min-w-0 flex-1 items-stretch overflow-x-auto"
        >
          {tabs.map(({ key, label }, i) => {
            const active = entered && key === view;
            const visited = entered && i <= stepIndex + 1;
            const locked = !chosen && key !== "projects";
            return (
              <button
                key={key}
                type="button"
                onClick={() => goTo(key)}
                disabled={locked}
                aria-disabled={locked || undefined}
                aria-current={active ? "step" : undefined}
                style={{ "--tone": TONES[key] } as React.CSSProperties}
                className={`flex w-40 shrink-0 flex-col items-start justify-center gap-0.5 border-r border-neutral-300 px-4 py-2 text-left transition-colors ${
                  locked
                    ? "cursor-not-allowed bg-neutral-100 text-neutral-400"
                    : active
                    ? "bg-[rgb(var(--tone)/0.12)] text-neutral-900 shadow-[inset_0_-2px_0_0_rgb(var(--tone))]"
                    : visited
                      ? "bg-[rgb(var(--tone)/0.06)] text-neutral-900 hover:bg-[rgb(var(--tone)/0.11)]"
                      : "bg-[rgb(var(--tone)/0.05)] text-neutral-600 hover:bg-[rgb(var(--tone)/0.10)] hover:text-neutral-900"
                }`}
              >
                <span className="flex w-full items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-600">
                    {String(i).padStart(2, "0")}
                  </span>
                  {/* Completion dot: validation-derived, never visit-derived.
                      Shape + colour together — ✓/▲/✕ read without colour. */}
                  {entered && !locked && (
                    <span
                      role="img"
                      aria-label={`${label}: ${t(`tabStatus.${statuses[key].state}`)}`}
                      className={`text-[10px] font-bold leading-none ${
                        statuses[key].state === "red"
                          ? "text-danger"
                          : statuses[key].state === "amber"
                            ? "text-warning"
                            : "text-success"
                      }`}
                    >
                      {statuses[key].state === "red"
                        ? "✕"
                        : statuses[key].state === "amber"
                          ? "▲"
                          : "✓"}
                    </span>
                  )}
                </span>
                <span className="w-full truncate whitespace-nowrap text-sm font-medium">
                  {label}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-stretch">
          {entered && (
            <div
              role="group"
              aria-label={t("viewMode.label")}
              className="hidden items-center gap-1 px-3 md:flex"
            >
              {(["simplified", "standard"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={viewMode === m}
                  onClick={() => pickViewMode(m)}
                  className={`px-2 py-1 text-[11px] font-medium uppercase tracking-wide transition-colors ${
                    viewMode === m
                      ? "bg-neutral-800 text-white"
                      : "bg-neutral-500/10 text-neutral-600 hover:bg-neutral-500/20 hover:text-neutral-900"
                  }`}
                >
                  {t(`viewMode.${m}`)}
                </button>
              ))}
            </div>
          )}
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
          {/* The menu block, far right (dark, matta-style) */}
          <button
            type="button"
            onClick={() => {
              setMenuOpen((v) => !v);
              setDisclaimerOpen(false);
            }}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className={`flex min-w-40 items-center justify-center gap-2 px-8 text-sm font-medium transition-colors ${
              menuOpen
                ? "bg-neutral-800 text-white"
                : "bg-neutral-700 text-white hover:bg-neutral-800"
            }`}
          >
            {tc("nav.menu")}
          </button>
        </div>
        {menuOpen && (
          <div className="absolute right-0 top-full z-50 w-80 border-b border-l border-neutral-300 bg-white shadow-md">
            <Link
              href="/about/data"
              className="flex items-center justify-between border-b border-neutral-200 px-5 py-3.5 text-sm text-neutral-800 transition-colors hover:bg-neutral-100"
            >
              {tc("nav.about")} <span aria-hidden>→</span>
            </Link>
            <Link
              href="/docs"
              className="flex items-center justify-between border-b border-neutral-200 px-5 py-3.5 text-sm text-neutral-800 transition-colors hover:bg-neutral-100"
            >
              {tc("nav.documentation")} <span aria-hidden>→</span>
            </Link>
            <button
              type="button"
              onClick={() => setDisclaimerOpen((v) => !v)}
              aria-expanded={disclaimerOpen}
              className="flex w-full items-center justify-between px-5 py-3.5 text-sm text-neutral-800 transition-colors hover:bg-neutral-100"
            >
              {tc("nav.disclaimer")} <span aria-hidden>{disclaimerOpen ? "↓" : "→"}</span>
            </button>
            {disclaimerOpen && (
              <div className="border-t border-neutral-200 bg-neutral-50 px-5 py-4">
                <p className="text-xs leading-relaxed text-neutral-700">
                  {tc("disclaimer.body")}
                </p>
              </div>
            )}
            {/* Account, last: who you are + sign out. */}
            <div className="border-t border-neutral-300 bg-neutral-50">
              {projects.session?.user.email && (
                <p
                  className="truncate px-5 pt-3 text-[11px] text-neutral-500"
                  title={projects.session.user.email}
                >
                  {tc("nav.signedInAs", { email: projects.session.user.email })}
                </p>
              )}
              <button
                type="button"
                onClick={async () => {
                  setMenuOpen(false);
                  await getBrowserSupabase().auth.signOut();
                  window.location.assign("/");
                }}
                className="flex w-full items-center justify-between px-5 py-3.5 text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-100"
              >
                {tc("nav.signOut")} <span aria-hidden>→</span>
              </button>
            </div>
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
                onClick={() => {
                  setEntered(true);
                  // A ?s= deep link has already chosen the project — go
                  // straight to the form; otherwise the walk starts at
                  // Projects (select or create first).
                  setView(chosen ? "intro" : "projects");
                }}
                className="mt-8 inline-flex items-center gap-2 bg-brand-tint px-5 py-2.5 text-sm font-medium text-brand-deep transition-colors hover:bg-brand hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                {model.hadDraft ? t("intro.resume") : t("intro.start")} →
              </button>
            </div>
          </div>
          {/* Right: the drafting-grid panel with the 2D shipping chart */}
          <div className="bg-plus-grid relative hidden overflow-hidden border-l border-neutral-300 lg:block lg:w-1/2">
            <CorridorArtwork />
          </div>
        </main>
      ) : view === "projects" ? (
        /* ===== Tab 00 — Projects: saved work, managed ===== */
        <main className="min-h-0 flex-1 overflow-y-auto bg-[rgb(var(--tone)/0.03)] p-4">
          <ProjectsPanel
            projects={projects}
            onOpen={() => {
              setProjectChosen(true);
              setView("intro");
            }}
          />
        </main>
      ) : view === "results" ? (
        /* ===== Results tab: the full panel, full width ===== */
        <main className="min-h-0 flex-1 overflow-y-auto bg-[rgb(var(--tone)/0.03)] p-4">
          <div className="mx-auto max-w-375">
            {/* Same scenario bar as the input steps — name, JSON round-trip,
                reset and the autosave note apply to the report too. */}
            <ScenarioBar model={model} projects={projects} />
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">{t("results.heading")}</h2>
              <Button
                size="md"
                className="px-3 py-1.5"
                disabled={!model.result || !model.resolved}
                onClick={() => {
                  if (model.result && model.resolved) {
                    void downloadResultsXlsx(model.scenario, model.resolved, model.result);
                  }
                }}
              >
                {t("results.downloadXlsx")}
              </Button>
            </div>
            <ResultsPanel
              result={model.result}
              scenario={model.scenario}
              resolved={model.resolved}
              error={model.error}
              errorNav={
                blockedTab
                  ? { label: t(`steps.${blockedTab}`), onGo: () => goTo(blockedTab) }
                  : undefined
              }
            />
          </div>
        </main>
      ) : (
        /* ===== Input steps: form | (map) | compact summary ===== */
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[rgb(var(--tone)/0.03)] lg:flex-row lg:overflow-hidden">
          {/* Form pane — wide enough to breathe in both modes: with the map
              open it keeps a comfortable fixed width (the map flexes), and
              with it closed it takes the room next to the summary */}
          <div
            className={`min-w-0 border-neutral-300 p-3 lg:overflow-y-auto lg:border-r ${
              mapOpen ? "shrink-0 lg:w-130 xl:w-150" : "lg:flex-1"
            }`}
          >
            <div className={mapOpen ? "" : "mx-auto max-w-3xl"}>
              <ScenarioBar model={model} projects={projects} />
              {model.scenario.flags?.legacyExcelConstruct && !legacyDismissed && (
                <div className="mb-4 flex items-start gap-3 border border-amber-300 bg-amber-500/10 px-3 py-2 text-xs leading-snug text-amber-800">
                  <span className="flex-1">{t("legacyBanner")}</span>
                  <button
                    type="button"
                    onClick={() => setLegacyDismissed(true)}
                    className="shrink-0 border border-amber-300 px-2 py-0.5 font-medium hover:bg-amber-500/10"
                  >
                    {t("legacyBannerDismiss")}
                  </button>
                </div>
              )}
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
