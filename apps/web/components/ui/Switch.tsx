"use client";

import { Help } from "./Help";

/**
 * Accessible on/off switch (role="switch"). Pass `label` for a standalone
 * aria-label, or wrap in a <label> and omit it.
 */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
        checked ? "bg-brand" : "bg-neutral-300"
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-150 ease-out ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

/** Full-width "label … switch" row. */
export function SwitchRow({
  label,
  checked,
  onChange,
  help,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  /** REQUIRED pedagogic explanation — see NumberInput. */
  help: string;
}) {
  return (
    <label className="group/field flex cursor-pointer items-center justify-between gap-3 text-sm font-medium">
      <span className="flex items-center gap-1.5">
        {label}
        <Help text={help} />
      </span>
      {/* A wrapping <label> does NOT name a role="switch" button in the
          accessibility tree — pass the label through so the switch is
          addressable by name (screen readers and tests alike). */}
      <Switch checked={checked} onChange={onChange} label={label} />
    </label>
  );
}
