"use client";

import { useFormContext } from "react-hook-form";
import { useTranslations } from "next-intl";
import { NumberField, SelectField, Switch } from "./fields";
import { BoltIcon, SunIcon, WindIcon } from "./icons";
import type { CalculatorValues } from "./schema";

/**
 * Electricity supply: three toggleable source cards (solar / wind / grid) and
 * a persistent strip summarizing the active mix. Renewable cards offer
 * LCOE vs CAPEX+OPEX pricing with a 150 ms crossfade; plant sizes stay
 * live-coupled to the electrolyzer capacity until manually edited.
 */
export default function SupplySection() {
  const t = useTranslations("calculator");
  const { watch, setValue } = useFormContext<CalculatorValues>();
  const v = watch();
  const none = !v.pv.enabled && !v.wind.enabled && !v.grid.enabled;

  const money = (n: number) =>
    Number.isFinite(n) ? n.toLocaleString("en-US") : "—";

  return (
    <div className="space-y-3">
      <SourceCard
        icon={<SunIcon />}
        title={t("supply.solar")}
        enabled={v.pv.enabled}
        onToggle={(on) => setValue("pv.enabled", on, { shouldValidate: true })}
      >
        <PricingFields slot="pv" />
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CoupledCapacityField slot="pv" name="pv.capacityMw" />
          <SelectField
            name="pv.kind"
            label={t("supply.arrayConfig")}
            help={t("help.pvKind")}
            options={[
              ["pv_fixed", t("supply.pvFixed")],
              ["pv_1axis", t("supply.pv1axis")],
              ["pv_2axis", t("supply.pv2axis")],
            ]}
          />
        </div>
      </SourceCard>

      <SourceCard
        icon={<WindIcon />}
        title={t("supply.wind")}
        enabled={v.wind.enabled}
        onToggle={(on) => setValue("wind.enabled", on, { shouldValidate: true })}
      >
        <PricingFields slot="wind" />
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CoupledCapacityField slot="wind" name="wind.capacityMw" />
          <SelectField
            name="wind.kind"
            label={t("supply.hub")}
            help={t("help.windKind")}
            options={[
              ["wind_120", t("supply.hub120")],
              ["wind_160", t("supply.hub160")],
            ]}
          />
        </div>
      </SourceCard>

      <SourceCard
        icon={<BoltIcon />}
        title={t("supply.grid")}
        enabled={v.grid.enabled}
        onToggle={(on) => setValue("grid.enabled", on, { shouldValidate: true })}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <NumberField
            name="grid.priceUsdPerMwh"
            label={t("supply.gridPrice")}
            unit="USD/MWh"
            help={t("help.gridPrice")}
          />
          <CoupledCapacityField slot="grid" name="grid.maxImportMw" />
          <NumberField
            name="grid.emissionFactorTco2PerMwh"
            label={t("supply.gridEf")}
            unit="tCO₂/MWh"
            step={0.01}
            help={t("help.gridEf")}
          />
        </div>
      </SourceCard>

      {/* Persistent active-mix strip */}
      <div
        className={`flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-xs ${
          none
            ? "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
            : "border-neutral-200 bg-neutral-50 text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300"
        }`}
      >
        {none ? (
          <span>{t("supply.atLeastOne")}</span>
        ) : (
          <>
            <span className="font-medium">{t("supply.activeMix")}</span>
            {v.pv.enabled ? (
              <MixChip
                icon={<SunIcon className="h-3.5 w-3.5" />}
                text={`${money(v.pv.capacityMw)} MW · ${
                  v.pv.pricingMode === "lcoe"
                    ? `${money(v.pv.lcoeUsdPerMwh)} USD/MWh`
                    : `${money(v.pv.capexUsdPerKw)} USD/kWp`
                }`}
              />
            ) : null}
            {v.wind.enabled ? (
              <MixChip
                icon={<WindIcon className="h-3.5 w-3.5" />}
                text={`${money(v.wind.capacityMw)} MW · ${
                  v.wind.pricingMode === "lcoe"
                    ? `${money(v.wind.lcoeUsdPerMwh)} USD/MWh`
                    : `${money(v.wind.capexUsdPerKw)} USD/kW`
                }`}
              />
            ) : null}
            {v.grid.enabled ? (
              <MixChip
                icon={<BoltIcon className="h-3.5 w-3.5" />}
                text={`≤ ${money(v.grid.maxImportMw)} MW · ${money(v.grid.priceUsdPerMwh)} USD/MWh`}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function MixChip({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2 py-0.5 tabular-nums dark:border-neutral-700 dark:bg-neutral-800">
      {icon}
      {text}
    </span>
  );
}

function SourceCard({
  icon,
  title,
  enabled,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  enabled: boolean;
  onToggle: (on: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-lg border transition-colors duration-150 ease-out ${
        enabled
          ? "border-blue-600/50 bg-blue-50/40 dark:border-blue-500/40 dark:bg-blue-950/20"
          : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950"
      }`}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="flex items-center gap-2 text-sm font-medium">
          {icon}
          {title}
        </span>
        <Switch checked={enabled} onChange={onToggle} label={title} />
      </div>
      {enabled ? (
        <div className="border-t border-neutral-100 px-3 py-3 dark:border-neutral-800/60">
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** LCOE vs CAPEX+OPEX radio + the active mode's fields, crossfaded (150 ms). */
function PricingFields({ slot }: { slot: "pv" | "wind" }) {
  const t = useTranslations("calculator");
  const { watch, setValue } = useFormContext<CalculatorValues>();
  const mode = watch(`${slot}.pricingMode`);

  return (
    <div>
      <div
        role="radiogroup"
        aria-label={t("supply.pricingLabel")}
        className="flex gap-4 text-sm"
      >
        {(["lcoe", "capex"] as const).map((m) => (
          <label key={m} className="flex cursor-pointer items-center gap-1.5">
            <input
              type="radio"
              name={`${slot}-pricing-mode`}
              checked={mode === m}
              onChange={() =>
                setValue(`${slot}.pricingMode`, m, { shouldValidate: true })
              }
              className="accent-blue-600"
            />
            {m === "lcoe" ? t("supply.pricingLcoe") : t("supply.pricingCapex")}
          </label>
        ))}
      </div>
      <FadeSwitch mode={mode}>
        {(shown) =>
          shown === "lcoe" ? (
            /* Same 2-column grid as CAPEX mode (second cell empty) so the
               card height doesn't jump when switching modes. */
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <NumberField
                name={`${slot}.lcoeUsdPerMwh`}
                label={t("supply.lcoe")}
                unit="USD/MWh"
                help={t("help.lcoe")}
              />
              <div aria-hidden className="hidden sm:block" />
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <NumberField
                name={`${slot}.capexUsdPerKw`}
                label={t("supply.capex")}
                unit={slot === "pv" ? "USD/kWp" : "USD/kW"}
                step={10}
                help={t("help.sourceCapex")}
              />
              <NumberField
                name={`${slot}.opexPctPerYear`}
                label={t("supply.opex")}
                unit="%/yr"
                step={0.1}
                help={t("help.sourceOpex")}
              />
            </div>
          )
        }
      </FadeSwitch>
    </div>
  );
}

/**
 * Plant-size / max-power field, live-coupled to the electrolyzer capacity
 * until the user edits it; the link button (in the label row) re-couples.
 */
function CoupledCapacityField({
  slot,
  name,
}: {
  slot: "pv" | "wind" | "grid";
  name: "pv.capacityMw" | "wind.capacityMw" | "grid.maxImportMw";
}) {
  const t = useTranslations("calculator");
  const { watch, setValue } = useFormContext<CalculatorValues>();
  const coupled = watch(`${slot}.coupled`);
  const label = slot === "grid" ? t("supply.maxPower") : t("supply.plantSize");

  const recouple = () => {
    const cap = watch("electrolyzer.capacityMw");
    setValue(`${slot}.coupled`, !coupled, { shouldValidate: true });
    if (!coupled && Number.isFinite(cap)) {
      setValue(name, cap, { shouldValidate: true });
    }
  };

  return (
    <div>
      <NumberField
        name={name}
        label={label}
        unit="MW"
        help={slot === "grid" ? t("help.gridMax") : t("help.plantSize")}
        onUserEdit={() => {
          if (coupled) setValue(`${slot}.coupled`, false);
        }}
        labelAction={
          <button
            type="button"
            onClick={recouple}
            title={coupled ? t("supply.coupledOn") : t("supply.coupledOff")}
            aria-label={coupled ? t("supply.coupledOn") : t("supply.coupledOff")}
            aria-pressed={coupled}
            className={`shrink-0 rounded p-0.5 transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${
              coupled
                ? "text-blue-600"
                : "text-neutral-300 hover:text-neutral-500 dark:text-neutral-600 dark:hover:text-neutral-400"
            }`}
          >
            <LinkIcon />
          </button>
        }
      />
      <p className="mt-1 text-[11px] text-neutral-400 dark:text-neutral-500">
        {coupled ? t("supply.coupledHint") : t("supply.uncoupledHint")}
      </p>
    </div>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5">
      <path
        d="M6.5 9.5l3-3M5.75 7L4.4 8.35a2.3 2.3 0 003.25 3.25L9 10.25M10.25 9l1.35-1.35A2.3 2.3 0 008.35 4.4L7 5.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Fade between pricing modes: the key swap remounts the active mode's fields,
 * which enter at opacity 0 (@starting-style) and fade in over 150 ms — only
 * the active mode's fields are ever in the DOM.
 */
function FadeSwitch<M extends string>({
  mode,
  children,
}: {
  mode: M;
  children: (shown: M) => React.ReactNode;
}) {
  return (
    <div
      key={mode}
      className="opacity-100 transition-opacity duration-150 ease-out starting:opacity-0"
    >
      {children(mode)}
    </div>
  );
}
