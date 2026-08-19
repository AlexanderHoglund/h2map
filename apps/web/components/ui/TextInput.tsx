"use client";

import { useId } from "react";
import { Help } from "./Help";

/** Labeled free-text input with the app's standard control styling. */
export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  help,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
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
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-neutral-300 bg-white px-2.5 py-1.5 text-sm outline-none transition-colors duration-150 ease-out placeholder:text-neutral-500 focus:border-brand focus:ring-2 focus:ring-brand/40"
      />
    </div>
  );
}
