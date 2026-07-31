"use client";

import { useId } from "react";
import { Help } from "./Help";

/**
 * Labeled numeric input: bordered flex shell with a bare input plus a static
 * unit suffix in the flow. Only commits finite numbers.
 */
export function NumberInput({
  label,
  value,
  onChange,
  unit,
  step = "any",
  help,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  step?: number | "any";
  help?: string;
}) {
  const id = useId();
  return (
    <div>
      <label
        htmlFor={id}
        className="flex items-center gap-1 text-xs font-medium text-neutral-600"
      >
        {label}
        {help ? <Help text={help} /> : null}
      </label>
      <div className="mt-1 flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 transition-colors duration-150 ease-out focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/40">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(n);
          }}
          className="min-w-0 flex-1 bg-transparent text-sm tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        {unit ? <span className="shrink-0 text-xs text-neutral-600">{unit}</span> : null}
      </div>
    </div>
  );
}
