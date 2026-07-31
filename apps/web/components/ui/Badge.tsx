"use client";

/** Uppercase micro-label chip (the technical-voice eyebrow). */
export function Badge({
  tone = "neutral",
  className = "",
  children,
}: {
  tone?: "neutral" | "brand" | "warning";
  className?: string;
  children: React.ReactNode;
}) {
  const toneCls = {
    neutral: "bg-neutral-100 text-neutral-600",
    brand: "bg-brand-tint text-brand-deep",
    warning: "bg-amber-500/20 text-amber-800",
  }[tone];
  return (
    <span
      className={`px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${toneCls} ${className}`}
    >
      {children}
    </span>
  );
}
