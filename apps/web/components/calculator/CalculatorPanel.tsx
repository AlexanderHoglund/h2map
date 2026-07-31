"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
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
import { encodeConfigParam } from "@/lib/url-state";
import { Section } from "./Accordion";
import { CheckboxField, NumberField } from "./fields";
import { BoltIcon, SunIcon, WindIcon } from "./icons";
import MiniMap from "./MiniMap";
import {
  anySourceEnabled,
  CALCULATOR_DEFAULTS,
  isSectionDirty,
  makeCalculatorSchema,
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

export interface CalculatorPanelProps {
  /** Fully-formed initial form values; the host resolves ?c= / ?lat&lon / defaults. */
  initialValues: CalculatorValues;
  /**
   * Embedded (in the Explorer split panel): single-column, no MiniMap, scrolls
   * internally, does not write ?c= to the URL, and shows a close button +
   * "open in full calculator" link. Default false = the standalone route.
   */
  embedded?: boolean;
  /** Route host only: debounced ?c= history.replaceState so state is shareable. */
  syncUrl?: boolean;
  /** Embedded only: coords of the currently-evaluated cell; changes push into the form. */
  coords?: { lat: number; lon: number } | null;
  /** Embedded only: collapse the panel. */
  onClose?: () => void;
}

export default function CalculatorPanel({
  initialValues,
  embedded = false,
  syncUrl = false,
  coords = null,
  onClose,
}: CalculatorPanelProps) {
  const t = useTranslations("calculator");
  const tExplorer = useTranslations("explorer");
  const { countries, failed: countriesFailed } = useCountryDefaults();
  const { state: sim, run, reset: resetSim } = useSimulation();

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
        // Embedded (syncUrl=false) never writes — the map owns the URL.
        if (!syncUrl) return;
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
  }, [form, getValues, setValue, syncUrl]);

  // ---- Embedded: new-cell coords push into the form (preserving other edits) --
  const coordsRef = useRef<string>("");
  useEffect(() => {
    if (!embedded || !coords) return;
    const key = `${coords.lat},${coords.lon}`;
    if (key === coordsRef.current) return;
    coordsRef.current = key;
    setValue("location.lat", Number(coords.lat.toFixed(6)), {
      shouldValidate: true,
      shouldDirty: true,
    });
    setValue("location.lon", Number(coords.lon.toFixed(6)), {
      shouldValidate: true,
      shouldDirty: true,
    });
  }, [coords, embedded, setValue]);
  // "Recalculate" nudge — derived (not stored, so no setState in an effect):
  // true when the location differs from what the last finished run used. The
  // profile fetch is slow, so we never auto-run; the user re-presses Calculate.
  const [lastRunKey, setLastRunKey] = useState<string | null>(null);
  const stale =
    sim.phase === "done" &&
    lastRunKey !== null &&
    lastRunKey !== `${values.location.lat},${values.location.lon}`;

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

  // Auto-apply a country's defaults silently — no confirm, and skip any field
  // the user has manually edited. Used when a cell is evaluated on the map.
  const autoApplyCountry = useCallback(
    (iso2: string) => {
      const row = countries.find((r) => r.iso2 === iso2);
      if (!row) return;
      setValue("location.country", iso2, { shouldValidate: true });
      const discountPct =
        row.wacc_suggestion !== null
          ? Number((row.wacc_suggestion * 100).toFixed(2))
          : null;
      const ef = row.grid_ef_tco2_mwh;
      const curDiscount = getValues("general.discountRatePct");
      const curEf = getValues("grid.emissionFactorTco2PerMwh");
      const discountEdited =
        curDiscount !== CALCULATOR_DEFAULTS.general.discountRatePct &&
        curDiscount !== lastApplied.current?.discountPct;
      const efEdited =
        curEf !== CALCULATOR_DEFAULTS.grid.emissionFactorTco2PerMwh &&
        curEf !== lastApplied.current?.ef;
      if (discountPct !== null && !discountEdited) {
        setValue("general.discountRatePct", discountPct, { shouldValidate: true });
      }
      if (ef !== null && !efEdited) {
        setValue("grid.emissionFactorTco2PerMwh", ef, { shouldValidate: true });
      }
      lastApplied.current = { discountPct: discountPct ?? curDiscount, ef: ef ?? curEf };
    },
    [countries, setValue, getValues],
  );

  // Resolve the evaluated cell's country (embedded) and apply its defaults if
  // it is one of the countries we have defaults for. Two effects so the apply
  // still fires if the defaults list finishes loading after the lookup.
  const [resolvedIso2, setResolvedIso2] = useState<string | null>(null);
  useEffect(() => {
    if (!embedded || !coords) return;
    let cancelled = false;
    fetch(`/api/v1/country?lat=${coords.lat}&lon=${coords.lon}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { iso2?: string | null } | null) => {
        if (!cancelled) setResolvedIso2(d?.iso2 ?? null);
      })
      .catch(() => {
        if (!cancelled) setResolvedIso2(null);
      });
    return () => {
      cancelled = true;
    };
  }, [embedded, coords]);
  useEffect(() => {
    if (!embedded || !resolvedIso2) return;
    if (!countries.some((r) => r.iso2 === resolvedIso2)) return;
    autoApplyCountry(resolvedIso2);
  }, [embedded, resolvedIso2, countries, autoApplyCountry]);

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
    setLastRunKey(`${valid.location.lat},${valid.location.lon}`);
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
    // Embedded: leave the explorer URL alone (the map owns it).
    if (syncUrl) window.history.replaceState(null, "", window.location.pathname);
  };

  const copyLink = useCallback(() => {
    const encoded = encodeConfigParam(getValues());
    // Embedded: share a standalone /calculator link and don't touch the
    // explorer URL. Route: keep the current path and update it in place.
    const rel = embedded
      ? `/calculator?c=${encoded}`
      : `${window.location.pathname}?c=${encoded}`;
    if (!embedded) window.history.replaceState(null, "", rel);
    void navigator.clipboard.writeText(`${window.location.origin}${rel}`);
  }, [getValues, embedded]);

  const [copied, setCopied] = useState(false);
  const copyLinkWithFlash = () => {
    copyLink();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Auto-scroll to results on success. Embedded scrolls its own panel; the
  // route scrolls the viewport.
  const resultsRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (sim.phase !== "done") return;
    if (embedded) {
      const c = scrollRef.current;
      const r = resultsRef.current;
      if (c && r) c.scrollTo({ top: r.offsetTop - c.offsetTop, behavior: "smooth" });
    } else {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [sim.phase, embedded]);

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
      <div
        ref={embedded ? scrollRef : undefined}
        className={
          embedded
            ? "flex h-full flex-col overflow-y-auto px-4 py-4"
            : "mx-auto max-w-6xl px-4 py-6"
        }
      >
        {embedded ? (
          <div className="mb-3 flex items-center justify-between gap-2 border-b border-neutral-300 pb-2">
            <h1 className="min-w-0 truncate text-base font-semibold">
              {tExplorer("panel.title")}
            </h1>
            <div className="flex shrink-0 items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                aria-label={tExplorer("panel.close")}
                className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </div>
          </div>
        ) : (
          <>
            <h1 className="text-lg font-semibold">{t("title")}</h1>
            <p className="mb-5 text-sm text-neutral-500">
              {t("subtitle")}
            </p>
          </>
        )}

        <div
          className={
            embedded
              ? ""
              : "md:grid md:grid-cols-[minmax(0,1fr)_280px] md:items-start md:gap-8"
          }
        >
          <form
            onSubmit={onCalculate}
            noValidate
            className={embedded ? "space-y-3" : "max-w-2xl space-y-3"}
          >
            {/* 1 — Location */}
            <Section
              title={t("sections.location")}
              dirty={isSectionDirty(values, "location")}
              dirtyLabel={t("modified")}
              resetLabel={t("reset")}
              onReset={() => resetSection("location")}
            >
              {!embedded && (
                <>
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
                  <p className="mt-1 text-[11px] text-neutral-400">
                    {t("location.mapHint")}
                  </p>
                </>
              )}
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
                    className="text-xs font-medium text-neutral-600"
                  >
                    {t("location.country")}
                  </label>
                  <select
                    id="field-country"
                    value={selectedCountry ?? ""}
                    onChange={(e) => applyCountry(e.target.value)}
                    disabled={countriesFailed}
                    className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm transition-colors duration-150 ease-out focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-50"
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
                <p className="mt-2 text-[11px] text-neutral-400">
                  {t("location.defaultsSource", { source: countryRow.source })}
                </p>
              ) : null}
              {countriesFailed ? (
                <p className="mt-2 text-[11px] text-neutral-400">
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
              <div className="mt-4 border-t border-neutral-100 pt-3">
                <h3 className="text-xs font-medium text-neutral-600">
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
                <p className="mt-3 text-[11px] text-neutral-400">
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
                    <p className="mt-1 text-[11px] tabular-nums text-neutral-400">
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
                className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-150 ease-out hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-50"
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
                <p className="text-xs text-red-600">{disabledReason}</p>
              ) : null}
              {stale && !running && !disabledReason ? (
                <p className="text-xs text-amber-600">
                  {tExplorer("panel.coordsChanged")}
                </p>
              ) : null}

              {sim.profileStatuses.length > 0 && sim.phase !== "idle" ? (
                <ul className="space-y-1 rounded-md border border-neutral-300 px-3 py-2 text-xs">
                  {sim.profileStatuses.map((s) => (
                    <li key={s.slot} className="flex flex-wrap items-center gap-2">
                      {s.state === "building" ? (
                        <Spinner className="text-brand" />
                      ) : s.state === "ready" ? (
                        <span className="text-emerald-600" aria-hidden>✓</span>
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
                        <span className="text-red-600">{s.message}</span>
                      ) : null}
                    </li>
                  ))}
                  {sim.phase === "profiles" ? (
                    <li className="text-neutral-400">
                      {t("run.firstVisitNote")}
                    </li>
                  ) : null}
                </ul>
              ) : null}

              {sim.phase === "error" ? (
                <div
                  role="alert"
                  className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700"
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
                  className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm transition-colors duration-150 ease-out hover:border-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                >
                  {t("run.resetAll")}
                </button>
                <button
                  type="button"
                  onClick={copyLinkWithFlash}
                  className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm transition-colors duration-150 ease-out hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                >
                  {copied ? t("run.copied") : t("run.copyLink")}
                </button>
              </div>
            </div>
          </form>

          {/* Sticky summary rail (tablet and up; not in the embedded panel) */}
          <aside className={embedded ? "hidden" : "hidden md:block"}>
            <div className="sticky top-16 space-y-3 rounded-lg border border-neutral-300 bg-white p-4 text-sm">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {t("rail.title")}
              </h2>
              <div className="tabular-nums text-neutral-600">
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
                  <span className="text-xs text-red-600">
                    {t("supply.atLeastOne")}
                  </span>
                ) : null}
              </div>
              {sim.response ? (
                <div className="border-t border-neutral-100 pt-3">
                  <div className="text-xs text-neutral-500">
                    {t("results.headline.lcoh")}
                  </div>
                  <div className="tabular-nums">
                    <span className="text-2xl font-semibold">
                      {sim.response.results.lcohUsdPerKg.toFixed(2)}
                    </span>{" "}
                    <span className="text-xs text-neutral-500">
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
            />
          ) : null}
        </div>
      </div>
    </FormProvider>
  );
}

function RailChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-brand/40 bg-brand-tint px-2 py-0.5 text-xs text-brand-deep">
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
      <div className="h-24 animate-pulse rounded-lg bg-neutral-100" />
      <div className="h-80 animate-pulse rounded-lg bg-neutral-100" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="h-64 animate-pulse rounded-lg bg-neutral-100" />
        <div className="h-64 animate-pulse rounded-lg bg-neutral-100" />
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
