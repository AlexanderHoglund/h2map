"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

/** "lat, lon" direct entry — the keyboard path (Enter flies there). */
const COORD_RE = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;

interface NominatimResult {
  place_id?: number;
  display_name: string;
  lat: string;
  lon: string;
}

interface Props {
  onNavigate: (lat: number, lon: number) => void;
}

/** Debounced Nominatim place search + direct coordinate entry. */
export default function SearchBox({ onNavigate }: Props) {
  const t = useTranslations("explorer");
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  /** Set when `setQuery` is programmatic (picking a result) — skips the fetch. */
  const skipFetchRef = useRef(false);

  const optionId = (index: number) => `${listboxId}-option-${index}`;

  const handleQueryChange = (value: string) => {
    setQuery(value);
    const q = value.trim();
    if (q.length < 2 || COORD_RE.test(q)) {
      setResults([]);
      setOpen(false);
    }
  };

  useEffect(() => {
    if (skipFetchRef.current) {
      skipFetchRef.current = false;
      return;
    }
    const q = query.trim();
    if (q.length < 2 || COORD_RE.test(q)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`,
          { signal: controller.signal },
        );
        if (!res.ok) {
          setResults([]);
          return;
        }
        const list = (await res.json()) as NominatimResult[];
        setResults(Array.isArray(list) ? list.slice(0, 5) : []);
        setActiveIndex(0);
        setOpen(true);
      } catch {
        // Fetch errors (including aborts): empty list, silently.
        setResults([]);
      }
    }, 400);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const goTo = (lat: number, lon: number) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
    setOpen(false);
    onNavigate(lat, lon);
  };

  const pick = (result: NominatimResult) => {
    if (result.display_name !== query) skipFetchRef.current = true;
    setQuery(result.display_name);
    goTo(Number(result.lat), Number(result.lon));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const m = COORD_RE.exec(query);
    if (m) {
      goTo(Number(m[1]), Number(m[2]));
      return;
    }
    const picked = results[activeIndex] ?? results[0];
    if (picked) pick(picked);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
      return;
    }
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    }
  };

  const expanded = open && results.length > 0;

  return (
    <form
      onSubmit={handleSubmit}
      role="search"
      className="relative"
      onBlur={(e) => {
        // Close when focus leaves the search box (input + results).
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <input
        type="text"
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t("search.placeholder")}
        aria-label={t("search.label")}
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={expanded ? optionId(activeIndex) : undefined}
        className="w-full rounded-lg border border-neutral-200 bg-white/95 px-3 py-2 text-sm backdrop-blur placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand/40"
      />
      {expanded && (
        <ul
          role="listbox"
          id={listboxId}
          aria-label={t("search.label")}
          className="absolute top-full z-20 mt-1 w-full overflow-hidden rounded-lg border border-neutral-200 bg-white/95 text-sm backdrop-blur"
        >
          {results.map((result, index) => (
            <li
              key={result.place_id ?? `${result.lat},${result.lon}`}
              role="option"
              id={optionId(index)}
              aria-selected={index === activeIndex}
            >
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => pick(result)}
                className={`w-full truncate px-3 py-2 text-left focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40 ${
                  index === activeIndex
                    ? "bg-neutral-100"
                    : ""
                }`}
                title={result.display_name}
              >
                {result.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
