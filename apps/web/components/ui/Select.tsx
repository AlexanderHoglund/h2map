"use client";

import { useId } from "react";
import { Help } from "./Help";

/** Labeled controlled <select> with the app's standard control styling. */
export function Select({
  label,
  value,
  options,
  onChange,
  help,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  /** REQUIRED pedagogic explanation — see NumberInput. */
  help: string;
}) {
  const id = useId();
  return (
    <div className="group/field">
      <label
        htmlFor={id}
        className="flex items-center gap-1 text-xs font-medium text-neutral-600"
      >
        {label}
        <Help text={help} />
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm outline-none transition-colors duration-150 ease-out focus:border-brand focus:ring-2 focus:ring-brand/40"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
