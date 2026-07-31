"use client";

import { useFormContext, type FieldPath } from "react-hook-form";
import { Help } from "@/components/ui/Help";
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
          className="flex items-center gap-1 text-xs font-medium text-neutral-600"
        >
          {label}
          {help ? <Help text={help} /> : null}
        </label>
        {labelAction}
      </div>
      <div
        className={`mt-1 flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-1.5 transition-colors duration-150 ease-out focus-within:ring-2 ${
          disabled ? "opacity-50" : ""
        } ${
          error
            ? "border-red-500 focus-within:ring-red-500/30"
            : "border-neutral-300 focus-within:border-brand focus-within:ring-brand/40"
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
          <span className="shrink-0 text-xs text-neutral-500">
            {unit}
          </span>
        ) : null}
      </div>
      {error?.message ? (
        <p id={errorId} className="mt-1 text-xs text-red-600">
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
        className="flex items-center gap-1 text-xs font-medium text-neutral-600"
      >
        {label}
        {help ? <Help text={help} /> : null}
      </label>
      <select
        id={id}
        {...register(name)}
        className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm transition-colors duration-150 ease-out focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40"
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
        className="h-4 w-4 accent-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      />
      <span className="flex items-center gap-1">
        {label}
        {help ? <Help text={help} /> : null}
      </span>
    </label>
  );
}

// Help and Switch moved to the shared primitives; re-exported here so the
// calculator's existing imports keep working.
export { Help };
export { Switch } from "@/components/ui/Switch";
