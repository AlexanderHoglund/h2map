"use client";

import { useEffect, useState } from "react";
import type { CountryDefaults } from "./types";

/** Loads the country default packs once (GET /api/v1/defaults). */
export function useCountryDefaults() {
  const [countries, setCountries] = useState<CountryDefaults[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/defaults")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as CountryDefaults[];
      })
      .then((rows) => {
        if (!cancelled) setCountries(rows);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { countries, failed };
}
