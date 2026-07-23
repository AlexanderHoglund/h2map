/**
 * Small inline source icons (16px, stroke currentColor) used by the supply
 * cards and the summary-rail chips — replaces the platform-dependent emoji.
 */

export function SunIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    >
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M12.8 3.2l-1.1 1.1M4.3 11.7l-1.1 1.1" />
    </svg>
  );
}

export function WindIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    >
      <path d="M1.5 4.7h7.1a1.7 1.7 0 1 0-1.7-1.7" />
      <path d="M1.5 8h11.2a1.7 1.7 0 1 1-1.7 1.7" />
      <path d="M1.5 11.3h5.6a1.5 1.5 0 1 1-1.5 1.5" />
    </svg>
  );
}

export function BoltIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8.8 1.5 3.6 9h3.2l-.6 5.5L11.4 7H8.2l.6-5.5z" />
    </svg>
  );
}
