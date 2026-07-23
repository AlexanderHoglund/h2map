"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { FormProvider, useForm, useWatch, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  DESAL_KWH_PER_M3,
  HOURS_PER_YEAR,
  LHV_H2_KWH_PER_KG,
  PUMP_KWH_PER_M3_PER_100M,
  WATER_L_PER_KG_H2,
} from "@h2map/lcoh-engine";
import { decodeConfigParam, encodeConfigParam } from "@/lib/url-state";
import { Section } from "./Accordion";
import { CheckboxField, NumberField } from "./fields";
import { BoltIcon, SunIcon, WindIcon } from "./icons";
import MiniMap from "./MiniMap";
import {
  anySourceEnabled,
  CALCULATOR_DEFAULTS,
  isSectionDirty,
  makeCalculatorSchema,
  mergeConfig,
  type CalculatorValues,
  type SectionKey,
} from "./schema";
import SupplySection from "./SupplySection";
import { useCountryDefaults } from "./useCountryDefaults";
import { useSimulation } from "./useSimulation";

const ResultsSection = dynamic(() => import("./results/ResultsSection"), {
  ssr: false,
  loading: () => <ResultsSkeleton />,
});

export default function CalculatorClient() {
  const t = useTranslations("calculator");
  const searchParams = useSearchParams();
  const { countries, failed: countriesFailed } = useCountryDefaults();
  const { state: sim, run, reset: resetSim } = useSimulation();

  // Initial values: full config from ?c= (share link), else Explorer handoff
  // via ?lat=&lon=, else reference defaults. Read once on mount.
  const [initialValues] = useState<CalculatorValues>(() => {
    const c = searchParams.get("c");
    if (c) {
      const decoded = decodeConfigParam<unknown>(c);
      if (decoded) return mergeConfig(decoded);
    }
    const out = structuredClone(CALCULATOR_DEFAULTS);
    const lat = Number(searchParams.get("lat"));
    const lon = Number(searchParams.get("lon"));
    if (
      searchParams.has("lat") &&
      searchParams.has("lon") &&
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lon) <= 180
    ) {
      out.location.lat = Number(lat.toFixed(6));
      out.location.lon = Number(lon.toFixed(6));
    }
    return out;
  });

  const schema = useMemo(() => makeCalculatorSchema(t), [t]);
  const form = useForm<CalculatorValues>({
    resolver: zodResolver(schema),
    defaultValues: initialValues,
    mode: "onChange",
  });
  const { setValue, getValues, handleSubmit, reset, formState } = form;
  // Full form snapshot for the summary rail, dirty dots, and helpers.
  // (useWatch instead of watch() — the React Compiler can memoize it safely.)
  const values = useWatch({ control: form.control }) as CalculatorValues;

  // ---- Coupling + shareable-URL sync -------------------------------------
  const urlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const unsubscribe = form.subscribe({
      formState: { values: true },
      callback: ({ name }) => {
        // Live-couple plant sizes / grid max power to the electrolyzer capacity.
        if (name === "electrolyzer.capacityMw") {
          const cap = getValues("electrolyzer.capacityMw");
          if (Number.isFinite(cap)) {
            if (getValues("pv.coupled") && getValues("pv.capacityMw") !== cap) {
              setValue("pv.capacityMw", cap, { shouldValidate: true });
            }
            if (getValues("wind.coupled") && getValues("wind.capacityMw") !== cap) {
              setValue("wind.capacityMw", cap, { shouldValidate: true });
            }
            if (getValues("grid.coupled") && getValues("grid.maxImportMw") !== cap) {
              setValue("grid.maxImportMw", cap, { shouldValidate: true });
            }
          }
        }
        // Debounced history.replaceState so any state is shareable via ?c=.
        if (urlTimer.current) clearTimeout(urlTimer.current);
        urlTimer.current = setTimeout(() => {
          const encoded = encodeConfigParam(getValues());
          window.history.replaceState(null, "", `${window.location.pathname}?c=${encoded}`);
        }, 400);
      },
    });
    return () => {
      unsubscribe();
      if (urlTimer.current) clearTimeout(urlTimer.current);
    };
  }, [form, getValues, setValue]);

  // ---- Country defaults ---------------------------------------------------
  const lastApplied = useRef<{ discountPct: number; ef: number } | null>(null);
  const applyCountry = (iso2: string) => {
    setValue("location.country", iso2 || null, { shouldValidate: true });
    if (!iso2) return;
    const row = countries.find((r) => r.iso2 === iso2);
    if (!row) return;
    const discountPct =
      row.wacc_suggestion !== null ? row.wacc_suggestion * 100 : null;
    const ef = row.grid_ef_tco2_mwh;
    if (discountPct === null && ef === null) return;

    const curDiscount = getValues("general.discountRatePct");
    const curEf = getValues("grid.emissionFactorTco2PerMwh");
    const edited =
      (curDiscount !== CALCULATOR_DEFAULTS.general.discountRatePct &&
        curDiscount !== lastApplied.current?.discountPct) ||
      (curEf !== CALCULATOR_DEFAULTS.grid.emissionFactorTco2PerMwh &&
        curEf !== lastApplied.current?.ef);
    if (edited && !window.confirm(t("location.confirmOverride"))) return;

    if (discountPct !== null) {
      setValue("general.discountRatePct", Number(discountPct.toFixed(2)), {
        shouldValidate: true,
      });
    }
    if (ef !== null) {
      setValue("grid.emissionFactorTco2PerMwh", ef, { shouldValidate: true });
    }
    lastApplied.current = {
      discountPct: discountPct !== null ? Number(discountPct.toFixed(2)) : curDiscount,
      ef: ef ?? curEf,
    };
  };

  // ---- Run ----------------------------------------------------------------
  const running = sim.phase === "profiles" || sim.phase === "simulating";
  const anySource = anySourceEnabled(values);
  const disabledReason = !anySource
    ? t("supply.atLeastOne")
    : !formState.isValid
      ? (firstErrorMessage(formState.errors) ?? t("run.invalid"))
      : null;

  const onCalculate = handleSubmit((valid) => {
    if (!anySourceEnabled(valid)) return;
    void run(valid);
  });

  const resetSection = (key: SectionKey) => {
    reset(
      { ...getValues(), [key]: structuredClone(CALCULATOR_DEFAULTS[key]) },
      { keepDefaultValues: true },
    );
  };

  const resetAll = () => {
    reset(structuredClone(CALCULATOR_DEFAULTS));
    resetSim();
    lastApplied.current = null;
    window.history.replaceState(null, "", window.location.pathname);
  };

  const copyLink = useCallback(() => {
    const encoded = encodeConfigParam(getValues());
    const rel = `${window.location.pathname}?c=${encoded}`;
    window.history.replaceState(null, "", rel);
    void navigator.clipboard.writeText(`${window.location.origin}${rel}`);
  }, [getValues]);

  const [copied, setCopied] = useState(false);
  const copyLinkWithFlash = () => {
    copyLink();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Auto-scroll to results on success.
  const resultsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (sim.phase === "done") {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [sim.phase]);

  // Indicative production helper (t H₂/yr at full load).
  const cap = values.electrolyzer.capacityMw;
  const eff = values.electrolyzer.efficiencyPct;
  const indicativeTons =
    Number.isFinite(cap) && Number.isFinite(eff)
      ? (cap * HOURS_PER_YEAR * (eff / 100)) / LHV_H2_KWH_PER_KG
      : null;

  const selectedCountry = values.location.country;
  const countryRow = countries.find((r) => r.iso2 === selectedCountry);

  // Human-readable country options ("Chile (CL)"), sorted by display name.
  const countryOptions = useMemo(() => {
    let regionNames: Intl.DisplayNames | null = null;
    try {
      regionNames = new Intl.DisplayNames(["en"], { type: "region" });
    } catch {
      regionNames = null;
    }
    const displayName = (iso2: string) => {
      try {
        return regionNames?.of(iso2) ?? iso2;
      } catch {
        return iso2;
      }
    };
    return countries
      .map((r) => ({ iso2: r.iso2, name: displayName(r.iso2) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [countries]);

  return (
    <FormProvider {...form}>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="mb-5 text-sm text-neutral-500 dark:text-neutral-400">
          {t("subtitle")}
        </p>

        <div className="md:grid md:grid-cols-[minmax(0,1fr)_280px] md:items-start md:gap-8">
          <form onSubmit={onCalculate} noValidate className="max-w-2xl space-y-3">
            {/* 1 — Location */}
            <Section
              title={t("sections.location")}
              dirty={isSectionDirty(values, "location")}
              dirtyLabel={t("modified")}
              resetLabel={t("reset")}
              onReset={() => resetSection("location")}
            >
              <MiniMap
                lat={values.location.lat}
                lon={values.location.lon}
                onChange={(lat, lon) => {
                  setValue("location.lat", Number(lat.toFixed(6)), {
                    shouldValidate: true,
                    shouldDirty: true,
                  });
                  setValue("location.lon", Number(lon.toFixed(6)), {
                    shouldValidate: true,
                    shouldDirty: true,
                  });
                }}
              />
              <p className="mt-1 text-[11px] text-neutral-400 dark:text-neutral-500">
                {t("location.mapHint")}
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <NumberField
                  name="location.lat"
                  label={t("location.latitude")}
                  unit="°"
                  step={0.000001}
                  help={t("help.lat")}
                />
                <NumberField
                  name="location.lon"
                  label={t("location.longitude")}
                  unit="°"
                  step={0.000001}
                  help={t("help.lon")}
                />
                <div>
                  <label
                    htmlFor="field-country"
                    className="text-xs font-medium text-neutral-600 dark:text-neutral-400"
                  >
                    {t("location.country")}
                  </label>
                  <select
                    id="field-country"
                    value={selectedCountry ?? ""}
                    onChange={(e) => applyCountry(e.target.value)}
                    disabled={countriesFailed}
                    className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm transition-colors duration-150 ease-out focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/40 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900"
                  >
                    <option value="">{t("location.countryNone")}</option>
                    {countryOptions.map((r) => (
                      <option key={r.iso2} value={r.iso2}>
                        {r.name === r.iso2 ? r.iso2 : `${r.name} (${r.iso2})`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {countryRow?.source ? (
                <p className="mt-2 text-[11px] text-neutral-400 dark:text-neutral-500">
                  {t("location.defaultsSource", { source: countryRow.source })}
                </p>
              ) : null}
              {countriesFailed ? (
                <p className="mt-2 text-[11px] text-neutral-400 dark:text-neutral-500">
                  {t("location.countryUnavailable")}
                </p>
              ) : null}
            </Section>

            {/* 2 — General */}
            <Section
              title={t("sections.general")}
              dirty={isSectionDirty(values, "general")}
              dirtyLabel={t("modified")}
              resetLabel={t("reset")}
              onReset={() => resetSection("general")}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <NumberField
                  name="general.lifetimeYears"
                  label={t("general.lifetime")}
                  unit="yr"
                  help={t("help.lifetime")}
                />
                <NumberField
                  name="general.discountRatePct"
                  label={t("general.discount")}
                  unit="%/yr"
                  step={0.1}
                  help={t("help.discount")}
                />
                <NumberField
                  name="general.waterPriceUsdPerM3"
                  label={t("general.waterPrice")}
                  unit="USD/m³"
                  step={0.1}
                  help={t("help.waterPrice")}
                />
                <NumberField
                  name="general.waterTransportUsdPerM3Per100Km"
                  label={t("general.waterTransport")}
                  unit="USD/m³/100km"
                  step={0.01}
                  help={t("help.waterTransport")}
                />
                <NumberField
                  name="general.waterTransportDistanceKm"
                  label={t("general.transportDistance")}
                  unit="km"
                  step={10}
                  help={t("help.transportDistance")}
                />
              </div>
              <div className="mt-4 border-t border-neutral-100 pt-3 dark:border-neutral-800/60">
                <h3 className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  {t("general.emissionsOnly")}
                </h3>
                <div className="mt-2 grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
                  <CheckboxField
                    name="general.waterDesalinated"
                    label={t("general.desalinated")}
                    help={t("help.desalinated")}
                  />
                  <NumberField
                    name="general.waterPumpingHeadM"
                    label={t("general.pumpingHead")}
                    unit="m"
                    step={10}
                    help={t("help.pumpingHead")}
                  />
                </div>
                <p className="mt-3 text-[11px] text-neutral-400 dark:text-neutral-500">
                  {t("general.constantsNote", {
                    desal: DESAL_KWH_PER_M3,
                    pump: PUMP_KWH_PER_M3_PER_100M.toFixed(2),
                    water: WATER_L_PER_KG_H2,
                  })}
                </p>
              </div>
            </Section>

            {/* 3 — Electrolyzer */}
            <Section
              title={t("sections.electrolyzer")}
              dirty={isSectionDirty(values, "electrolyzer")}
              dirtyLabel={t("modified")}
              resetLabel={t("reset")}
              onReset={() => resetSection("electrolyzer")}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <NumberField
                    name="electrolyzer.capacityMw"
                    label={t("electrolyzer.capacity")}
                    unit="MW"
                    step={10}
                    help={t("help.capacity")}
                  />
                  {indicativeTons !== null ? (
                    <p className="mt-1 text-[11px] tabular-nums text-neutral-400 dark:text-neutral-500">
                      {t("electrolyzer.indicative", {
                        tons: Math.round(indicativeTons).toLocaleString("en-US"),
                      })}
                    </p>
                  ) : null}
                </div>
                <NumberField
                  name="electrolyzer.efficiencyPct"
                  label={t("electrolyzer.efficiency")}
                  unit="% LHV"
                  step={0.5}
                  help={t("help.efficiency")}
                />
                <NumberField
                  name="electrolyzer.capexUsdPerKw"
                  label={t("electrolyzer.capex")}
                  unit="USD/kW"
                  step={10}
                  help={t("help.capex")}
                />
                <NumberField
                  name="electrolyzer.opexPctPerYear"
                  label={t("electrolyzer.opex")}
                  unit="%/yr"
                  step={0.1}
                  help={t("help.opex")}
                />
                <NumberField
                  name="electrolyzer.stackLifetimeHours"
                  label={t("electrolyzer.stackLifetime")}
                  unit="h"
                  step={1000}
                  help={t("help.stackLifetime")}
                />
                <NumberField
                  name="electrolyzer.stackReplacementPct"
                  label={t("electrolyzer.stackReplacement")}
                  unit="% CAPEX"
                  step={1}
                  help={t("help.stackReplacement")}
                />
                <NumberField
                  name="electrolyzer.degradationPctPerYear"
                  label={t("electrolyzer.degradation")}
                  unit="%/yr"
                  step={0.1}
                  help={t("help.degradation")}
                />
              </div>
            </Section>

            {/* 4 — Electricity supply */}
            <Section
              title={t("sections.supply")}
              dirty={
                isSectionDirty(values, "pv") ||
                isSectionDirty(values, "wind") ||
                isSectionDirty(values, "grid")
              }
              dirtyLabel={t("modified")}
              resetLabel={t("reset")}
              onReset={() => {
                resetSection("pv");
                resetSection("wind");
                resetSection("grid");
              }}
            >
              <SupplySection />
            </Section>

            {/* 5 — Run */}
            <div className="space-y-2 pt-1">
              <button
                type="submit"
                disabled={disabledReason !== null || running}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {running ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner />
                    {sim.phase === "profiles"
                      ? t("run.fetchingProfiles")
                      : t("run.simulating")}
                  </span>
                ) : (
                  t("run.calculate")
                )}
              </button>
              {disabledReason && !running ? (
                <p className="text-xs text-red-600 dark:text-red-400">{disabledReason}</p>
              ) : null}

              {sim.profileStatuses.length > 0 && sim.phase !== "idle" ? (
                <ul className="space-y-1 rounded-md border border-neutral-200 px-3 py-2 text-xs dark:border-neutral-800">
                  {sim.profileStatuses.map((s) => (
                    <li key={s.slot} className="flex flex-wrap items-center gap-2">
                      {s.state === "building" ? (
                        <Spinner className="text-blue-600" />
                      ) : s.state === "ready" ? (
                        <span className="text-emerald-600 dark:text-emerald-400" aria-hidden>✓</span>
                      ) : (
                        <span className="text-red-600" aria-hidden>✕</span>
                      )}
                      <span className="font-medium">
                        {s.slot === "pv" ? t("supply.solar") : t("supply.wind")}
                      </span>
                      <span className="text-neutral-400">{s.kind}</span>
                      {s.state === "ready" ? (
                        <span className="text-neutral-500">
                          {s.provider} · {s.cacheHit ? t("run.cached") : t("run.computed")}
                        </span>
                      ) : null}
                      {s.state === "error" ? (
                        <span className="text-red-600 dark:text-red-400">{s.message}</span>
                      ) : null}
                    </li>
                  ))}
                  {sim.phase === "profiles" ? (
                    <li className="text-neutral-400 dark:text-neutral-500">
                      {t("run.firstVisitNote")}
                    </li>
                  ) : null}
                </ul>
              ) : null}

              {sim.phase === "error" ? (
                <div
                  role="alert"
                  className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                >
                  <p className="font-medium">{t("run.errorTitle")}</p>
                  {/* Per-source profile errors already appear in the staged
                      rows above — only repeat a message when there is one. */}
                  {sim.error ? <p className="mt-1 text-xs">{sim.error}</p> : null}
                </div>
              ) : null}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={resetAll}
                  className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm transition-colors duration-150 ease-out hover:border-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 dark:border-neutral-700 dark:hover:border-neutral-500"
                >
                  {t("run.resetAll")}
                </button>
                <button
                  type="button"
                  onClick={copyLinkWithFlash}
                  className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm transition-colors duration-150 ease-out hover:border-blue-600 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 dark:border-neutral-700"
                >
                  {copied ? t("run.copied") : t("run.copyLink")}
                </button>
              </div>
            </div>
          </form>

          {/* Sticky summary rail (tablet and up) */}
          <aside className="hidden md:block">
            <div className="sticky top-16 space-y-3 rounded-lg border border-neutral-200 bg-white p-4 text-sm dark:border-neutral-800 dark:bg-neutral-950">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                {t("rail.title")}
              </h2>
              <div className="tabular-nums text-neutral-600 dark:text-neutral-300">
                {Number.isFinite(values.location.lat) && Number.isFinite(values.location.lon)
                  ? `${values.location.lat.toFixed(6)}°, ${values.location.lon.toFixed(6)}°`
                  : "—"}
                {selectedCountry ? ` · ${selectedCountry}` : ""}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {values.pv.enabled ? (
                  <RailChip icon={<SunIcon className="h-3.5 w-3.5" />} label={t("supply.solar")} />
                ) : null}
                {values.wind.enabled ? (
                  <RailChip icon={<WindIcon className="h-3.5 w-3.5" />} label={t("supply.wind")} />
                ) : null}
                {values.grid.enabled ? (
                  <RailChip icon={<BoltIcon className="h-3.5 w-3.5" />} label={t("supply.grid")} />
                ) : null}
                {!anySource ? (
                  <span className="text-xs text-red-600 dark:text-red-400">
                    {t("supply.atLeastOne")}
                  </span>
                ) : null}
              </div>
              {sim.response ? (
                <div className="border-t border-neutral-100 pt-3 dark:border-neutral-800/60">
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    {t("results.headline.lcoh")}
                  </div>
                  <div className="tabular-nums">
                    <span className="text-2xl font-semibold">
                      {sim.response.results.lcohUsdPerKg.toFixed(2)}
                    </span>{" "}
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      USD/kg H₂
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </aside>
        </div>

        {/* Screen-reader announcement on success (terse — the visual results
            subtree is too large for a useful aria-live region). */}
        <div aria-live="polite" className="sr-only">
          {sim.phase === "done" && sim.response
            ? t("results.announce", {
                lcoh: sim.response.results.lcohUsdPerKg.toFixed(2),
              })
            : null}
        </div>

        {/* Results */}
        <div ref={resultsRef} className="mt-8 scroll-mt-16 lg:max-w-none">
          {running ? <ResultsSkeleton /> : null}
          {sim.phase === "done" && sim.response ? (
            <ResultsSection
              response={sim.response}
              lifetimeYears={values.general.lifetimeYears}
              onCopyLink={copyLink}
            />
          ) : null}
        </div>
      </main>
    </FormProvider>
  );
}

function RailChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-blue-600/40 bg-blue-50 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
      {icon}
      {label}
    </span>
  );
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={`h-3.5 w-3.5 animate-spin ${className}`}>
      <circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="28"
        strokeDashoffset="20"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ResultsSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="h-24 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-900" />
      <div className="h-80 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-900" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="h-64 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-900" />
        <div className="h-64 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-900" />
      </div>
    </div>
  );
}

/** First inline validation message found (for the disabled-button reason). */
function firstErrorMessage(errors: FieldErrors<CalculatorValues>): string | null {
  const walk = (node: unknown): string | null => {
    if (!node || typeof node !== "object") return null;
    const rec = node as Record<string, unknown>;
    if (typeof rec.message === "string" && rec.message) return rec.message;
    for (const value of Object.values(rec)) {
      const found = walk(value);
      if (found) return found;
    }
    return null;
  };
  return walk(errors);
}
