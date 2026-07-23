"use client";

import { useId, useState } from "react";
import { useFormContext, type FieldPath } from "react-hook-form";
import type { CalculatorValues } from "./schema";

type Name = FieldPath<CalculatorValues>;

/**
 * Form primitives bound to the calculator form context. Numeric fields render
 * a wrapper-as-input (bordered flex container with a bare input plus a static
 * unit suffix in the flow), an optional "?" help popover, and the inline zod
 * validation message.
 */

export function NumberField({
  name,
  label,
  unit,
  step = 1,
  help,
  disabled,
  onUserEdit,
  className,
  labelAction,
}: {
  name: Name;
  label: string;
  unit?: string;
  step?: number | "any";
  help?: string;
  disabled?: boolean;
  /** Called when the user types into the field (used to decouple linked fields). */
  onUserEdit?: () => void;
  className?: string;
  /** Optional control rendered right-aligned in the label row (e.g. the recouple button). */
  labelAction?: React.ReactNode;
}) {
  const { register, getFieldState, formState } = useFormContext<CalculatorValues>();
  const { error } = getFieldState(name, formState);
  const inputId = `field-${name.replace(/\./g, "-")}`;
  const errorId = `${inputId}-error`;

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={inputId}
          className="flex items-center gap-1 text-xs font-medium text-neutral-600 dark:text-neutral-400"
        >
          {label}
          {help ? <Help text={help} /> : null}
        </label>
        {labelAction}
      </div>
      <div
        className={`mt-1 flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1.5 transition-colors duration-150 ease-out focus-within:ring-2 dark:bg-neutral-900 ${
          disabled ? "opacity-50" : ""
        } ${
          error
            ? "border-red-500 focus-within:ring-red-500/30 dark:border-red-500"
            : "border-neutral-300 focus-within:border-blue-600 focus-within:ring-blue-500/50 dark:border-neutral-700"
        }`}
      >
        <input
          id={inputId}
          type="number"
          step={step}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error?.message ? errorId : undefined}
          {...register(name, {
            valueAsNumber: true,
            onChange: () => onUserEdit?.(),
          })}
          className="min-w-0 flex-1 bg-transparent text-sm tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        {unit ? (
          <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-500">
            {unit}
          </span>
        ) : null}
      </div>
      {error?.message ? (
        <p id={errorId} className="mt-1 text-xs text-red-600 dark:text-red-400">
          {error.message}
        </p>
      ) : null}
    </div>
  );
}

export function SelectField({
  name,
  label,
  options,
  help,
  className,
}: {
  name: Name;
  label: string;
  options: [string, string][];
  help?: string;
  className?: string;
}) {
  const { register } = useFormContext<CalculatorValues>();
  const id = `field-${name.replace(/\./g, "-")}`;
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="flex items-center gap-1 text-xs font-medium text-neutral-600 dark:text-neutral-400"
      >
        {label}
        {help ? <Help text={help} /> : null}
      </label>
      <select
        id={id}
        {...register(name)}
        className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm transition-colors duration-150 ease-out focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:border-neutral-700 dark:bg-neutral-900"
      >
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}

export function CheckboxField({
  name,
  label,
  help,
}: {
  name: Name;
  label: string;
  help?: string;
}) {
  const { register } = useFormContext<CalculatorValues>();
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        {...register(name)}
        className="h-4 w-4 accent-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
      />
      <span className="flex items-center gap-1">
        {label}
        {help ? <Help text={help} /> : null}
      </span>
    </label>
  );
}

/**
 * Small "?" affordance: a focusable button with a hand-rolled popover shown
 * on hover and keyboard focus (dismissed on blur / mouse-leave / Escape).
 */
export function Help({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={text}
        aria-describedby={open ? tooltipId : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className="inline-flex h-4 w-4 cursor-help select-none items-center justify-center rounded-full border border-neutral-300 text-[10px] leading-none text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 dark:border-neutral-600 dark:text-neutral-500"
      >
        ?
      </button>
      {open ? (
        <div
          id={tooltipId}
          role="tooltip"
          className="absolute left-0 top-full z-20 mt-1.5 w-56 rounded-md border border-neutral-200 bg-white/95 px-2.5 py-1.5 text-xs font-normal normal-case text-neutral-600 backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/95 dark:text-neutral-300"
        >
          {text}
        </div>
      ) : null}
    </span>
  );
}

/** Accessible on/off switch (used by the source cards). */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${
        checked ? "bg-blue-600" : "bg-neutral-300 dark:bg-neutral-600"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-150 ease-out ${
          checked ? "translate-x-4.5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
