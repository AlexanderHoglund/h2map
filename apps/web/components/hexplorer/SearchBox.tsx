"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

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
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [open, setOpen] = useState(false);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    const q = value.trim();
    if (q.length < 2 || COORD_RE.test(q)) {
      setResults([]);
      setOpen(false);
    }
  };

  useEffect(() => {
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
    if (results[0]) pick(results[0]);
  };

  return (
    <form onSubmit={handleSubmit} role="search" className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
        placeholder={t("search.placeholder")}
        aria-label={t("search.label")}
        className="w-full rounded-lg border border-neutral-200 bg-white/95 px-3 py-2 text-sm backdrop-blur placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:border-neutral-800 dark:bg-neutral-900/95 dark:placeholder:text-neutral-500"
      />
      {open && results.length > 0 && (
        <ul className="absolute top-full z-20 mt-1 w-full overflow-hidden rounded-lg border border-neutral-200 bg-white text-sm dark:border-neutral-800 dark:bg-neutral-900">
          {results.map((result) => (
            <li key={result.place_id ?? `${result.lat},${result.lon}`}>
              <button
                type="button"
                onClick={() => pick(result)}
                className="w-full truncate px-3 py-2 text-left hover:bg-neutral-100 focus:bg-neutral-100 focus:outline-none dark:hover:bg-neutral-800 dark:focus:bg-neutral-800"
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
