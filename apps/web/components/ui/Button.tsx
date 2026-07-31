"use client";

/**
 * The app's button. Three visual weights:
 * - primary: the one brand-colored action on a surface
 * - secondary: bordered neutral (most toolbar actions)
 * - ghost: borderless text button
 */
export function Button({
  variant = "secondary",
  size = "sm",
  className = "",
  type = "button",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
}) {
  const variantCls = {
    primary:
      "bg-brand text-white hover:bg-brand-strong disabled:hover:bg-brand",
    secondary:
      "border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100",
    ghost: "text-neutral-700 hover:bg-neutral-100",
  }[variant];
  const sizeCls = {
    sm: "px-2.5 py-1 text-xs",
    md: "px-4 py-2 text-sm",
  }[size];
  return (
    <button
      type={type}
      className={`rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-40 ${variantCls} ${sizeCls} ${className}`}
      {...rest}
    />
  );
}
