export interface Site {
  slug: string;
  name: string;
  lat: number;
  lon: number;
}

/** Phase 0 spike sites (plan doc §10). */
export const SITES: Site[] = [
  { slug: "magallanes", name: "Magallanes, Chile", lat: -52.5, lon: -70.9 },
  { slug: "atacama", name: "Atacama, Chile", lat: -24.2, lon: -69.1 },
  { slug: "skane", name: "Skåne, Sweden", lat: 55.7, lon: 13.4 },
  { slug: "rotterdam", name: "Rotterdam, Netherlands", lat: 51.95, lon: 4.1 },
  { slug: "namibia", name: "Lüderitz region, Namibia", lat: -26.6, lon: 15.2 },
];

/** Non-leap reference year used by all providers in the spike. */
export const SPIKE_YEAR = 2022;
