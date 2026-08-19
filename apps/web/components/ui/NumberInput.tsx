"use client";

import { useId, useState } from "react";
import { Help } from "./Help";

/**
 * Labeled numeric input: bordered flex shell with a bare input plus a static
 * unit suffix in the flow. Only commits finite numbers.
 *
 * A free-typing draft buffer (the ResolvedField pattern) keeps mid-edit
 * states legal: "-", "1.", or an emptied field never commit and never snap
 * back mid-keystroke — `type="number"` reports partial input as "" and
 * `Number("") === 0`, which is how coordinates used to slam to 0 the moment
 * the field was cleared. Blur drops the draft, restoring the stored value.
 * `value: null` renders an empty field (unset coordinates are not 0).
 */
export function NumberInput({
  label,
  value,
  onChange,
  unit,
  help,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
  unit?: string;
  /** Accepted for call-site compatibility; the text input has no stepper. */
  step?: number | "any";
  /**
   * REQUIRED: the pedagogic "what is this field" answer, shown by the "?"
   * that fades in on hover. Every input in the app must be able to explain
   * itself; the type makes an unexplained field a compile error.
   */
  help: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);

  const shown = draft ?? (value === null ? "" : String(value));

  return (
    <div className="group/field">
      <label
        htmlFor={id}
        className="flex items-center gap-1 text-xs font-medium text-neutral-600"
      >
        {label}
        <Help text={help} />
      </label>
      <div className="mt-1 flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 transition-colors duration-150 ease-out focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/40">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={shown}
          onChange={(e) => {
            const text = e.target.value;
            setDraft(text);
            if (text.trim() === "") return; // emptied: keep typing, no commit
            const n = Number(text.replace(/,/g, ""));
            if (Number.isFinite(n)) onChange(n);
          }}
          onBlur={() => setDraft(null)}
          className="min-w-0 flex-1 bg-transparent text-sm tabular-nums outline-none"
        />
        {unit ? <span className="shrink-0 text-xs text-neutral-600">{unit}</span> : null}
      </div>
    </div>
  );
}
