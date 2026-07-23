"use client";

import { useFormContext, type FieldPath } from "react-hook-form";
import type { CalculatorValues } from "./schema";

type Name = FieldPath<CalculatorValues>;

/**
 * Form primitives bound to the calculator form context. Numeric fields render
 * the unit inside the input (right-aligned suffix), an optional "?" help
 * tooltip (title attribute), and the inline zod validation message.
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
}) {
  const { register, getFieldState, formState } = useFormContext<CalculatorValues>();
  const { error } = getFieldState(name, formState);
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
      <div className="relative mt-1">
        <input
          id={id}
          type="number"
          step={step}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          {...register(name, {
            valueAsNumber: true,
            onChange: () => onUserEdit?.(),
          })}
          className={`w-full rounded-md border bg-white px-2.5 py-1.5 pr-16 text-sm tabular-nums transition-colors duration-150 ease-out focus:outline-none focus:ring-2 focus:ring-blue-600/40 disabled:opacity-50 dark:bg-neutral-900 ${
            error
              ? "border-red-500 dark:border-red-500"
              : "border-neutral-300 focus:border-blue-600 dark:border-neutral-700"
          }`}
        />
        {unit ? (
          <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-neutral-400 dark:text-neutral-500">
            {unit}
          </span>
        ) : null}
      </div>
      {error?.message ? (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error.message}</p>
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
        className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm transition-colors duration-150 ease-out focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/40 dark:border-neutral-700 dark:bg-neutral-900"
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
        className="h-4 w-4 accent-blue-600"
      />
      <span className="flex items-center gap-1">
        {label}
        {help ? <Help text={help} /> : null}
      </span>
    </label>
  );
}

/** Small "?" affordance with a native title tooltip. */
export function Help({ text }: { text: string }) {
  return (
    <span
      title={text}
      aria-label={text}
      role="img"
      className="inline-flex h-3.5 w-3.5 cursor-help select-none items-center justify-center rounded-full border border-neutral-300 text-[9px] leading-none text-neutral-400 dark:border-neutral-600 dark:text-neutral-500"
    >
      ?
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
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150 ease-out ${
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
