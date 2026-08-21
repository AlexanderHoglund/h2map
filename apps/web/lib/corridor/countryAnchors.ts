/**
 * Country-level port-area anchors for the corridor's country selects:
 * one representative harbour-approach coordinate per country — NOT a
 * specific port. Selecting two countries is enough to draw the corridor
 * and route a sea distance; typed port coordinates always overwrite the
 * anchor, and the anchor itself is a render-time fallback, never stored
 * in a scenario. `inland: true` marks landlocked countries anchored to
 * the nearest reasonable coast (a neighbour's, or the country's actual
 * export corridor for Caspian-only states).
 *
 * Generated from data/geo/ne_110m_countries.geojson (Natural Earth 110m,
 * public domain) by scripts/geo/gen-country-anchors.ts - do not
 * hand-edit; re-run the script instead (curated entries live in
 * scripts/lib/countryAnchorsGen.ts).
 */

export interface CountryAnchor {
  lat: number;
  lon: number;
  /** Landlocked: the anchor is a neighbouring coast, not its own. */
  inland?: true;
}

/** Geometry-derived anchors (coastal vertex nearest the country label,
 *  nudged ~25 km seaward; landlocked -> nearest neighbouring coast). */
export const GENERATED_ANCHORS: Record<string, CountryAnchor> = {
  "afghanistan": { lat: 25.22, lon: 66.26, inland: true },
  "albania": { lat: 40.75, lon: 19.02 },
  "algeria": { lat: 36.11, lon: -0.2 },
  "angola": { lat: -11.25, lon: 13.51 },
  "argentina": { lat: -34.48, lon: -58.23 },
  "armenia": { lat: 41.98, lon: 41.4, inland: true },
  "australia": { lat: -31.71, lon: 131.25 },
  "austria": { lat: 45.87, lon: 13.41, inland: true },
  "azerbaijan": { lat: 41.98, lon: 41.4, inland: true },
  "bahamas": { lat: 24.97, lon: -78.01 },
  "bangladesh": { lat: 22.61, lon: 90.61 },
  "belgium": { lat: 51.49, lon: 3.54, inland: true },
  "belize": { lat: 17.09, lon: -88.07 },
  "benin": { lat: 6.12, lon: 3.4, inland: true },
  "bolivia": { lat: -19.53, lon: -70.14, inland: true },
  "bosnia-and-herzegovina": { lat: 42.99, lon: 16.98, inland: true },
  "botswana": { lat: -22.8, lon: 14.2, inland: true },
  "brazil": { lat: -13.83, lon: -38.72 },
  "brunei": { lat: 5.12, lon: 114.62 },
  "bulgaria": { lat: 42.59, lon: 27.98 },
  "cambodia": { lat: 10.99, lon: 102.93 },
  "cameroon": { lat: 2.96, lon: 9.6 },
  "canada": { lat: 60.1, lon: -94.18 },
  "chile": { lat: -38.31, lon: -73.79 },
  "china": { lat: 34.96, lon: 119.42 },
  "colombia": { lat: 3.88, lon: -77.35 },
  "costa-rica": { lat: 9.28, lon: -84.39 },
  "croatia": { lat: 44.95, lon: 14.64 },
  "cuba": { lat: 20.91, lon: -78.69 },
  "cyprus": { lat: 34.35, lon: 32.91 },
  "czechia": { lat: 54.19, lon: 14.5, inland: true },
  "denmark": { lat: 55.29, lon: 9.88 },
  "djibouti": { lat: 11.57, lon: 42.87 },
  "dominican-republic": { lat: 19.8, lon: -70.07 },
  "ecuador": { lat: -2.33, lon: -80.18 },
  "egypt": { lat: 27.79, lon: 33.58 },
  "el-salvador": { lat: 13.34, lon: -89.45 },
  "equatorial-guinea": { lat: 0.94, lon: 9.36 },
  "eritrea": { lat: 15.95, lon: 39.5 },
  "estonia": { lat: 58.29, lon: 24.04 },
  "fiji": { lat: -17.3, lon: 178.22 },
  "finland": { lat: 65.09, lon: 24.44 },
  "france": { lat: 45.96, lon: -1.51 },
  "gabon": { lat: 0.33, lon: 9.07 },
  "gambia": { lat: 14.3, lon: -17.35, inland: true },
  "georgia": { lat: 41.98, lon: 41.4 },
  "germany": { lat: 53.74, lon: 7.99 },
  "ghana": { lat: 5.12, lon: -0.46 },
  "greece": { lat: 39.7, lon: 23.14 },
  "guatemala": { lat: 13.69, lon: -90.63 },
  "guinea": { lat: 9.43, lon: -13.9 },
  "guinea-bissau": { lat: 11.34, lon: -15.86 },
  "guyana": { lat: 7.05, lon: -58.39 },
  "haiti": { lat: 19.04, lon: -73.02 },
  "honduras": { lat: 15.98, lon: -86.91 },
  "iceland": { lat: 63.47, lon: -17.63 },
  "india": { lat: 18.14, lon: 84.11 },
  "indonesia": { lat: -2.83, lon: 118.99 },
  "iran": { lat: 30.05, lon: 49.88 },
  "iraq": { lat: 29.57, lon: 48.44, inland: true },
  "ireland": { lat: 52.81, lon: -9.53 },
  "israel": { lat: 31.76, lon: 34.46 },
  "italy": { lat: 44.57, lon: 12.57 },
  "ivory-coast": { lat: 4.96, lon: -4.57 },
  "jamaica": { lat: 18.68, lon: -77.7 },
  "japan": { lat: 36.97, lon: 137.17 },
  "jordan": { lat: 31.76, lon: 34.46, inland: true },
  "kazakhstan": { lat: 66.3, lon: 72.88, inland: true },
  "kenya": { lat: -2.75, lon: 40.4 },
  "kuwait": { lat: 29.27, lon: 48.35 },
  "latvia": { lat: 57.01, lon: 23.71 },
  "lebanon": { lat: 34.83, lon: 35.97 },
  "liberia": { lat: 5.39, lon: -10.02 },
  "libya": { lat: 30.48, lon: 19.15 },
  "lithuania": { lat: 57.01, lon: 23.71, inland: true },
  "luxembourg": { lat: 50.35, lon: 1.26, inland: true },
  "madagascar": { lat: -19.17, lon: 49.27 },
  "malaysia": { lat: 1.61, lon: 104.02 },
  "mauritania": { lat: 19.08, lon: -16.49 },
  "mexico": { lat: 22.16, lon: -105.91 },
  "montenegro": { lat: 42.07, lon: 18.78 },
  "morocco": { lat: 32.08, lon: -9.69 },
  "mozambique": { lat: -14.22, lon: 40.83 },
  "myanmar": { lat: 19.58, lon: 93.49 },
  "namibia": { lat: -22.22, lon: 14.05 },
  "netherlands": { lat: 53.27, lon: 4.47 },
  "new-zealand": { lat: -39.44, lon: 174.1 },
  "nicaragua": { lat: 12.27, lon: -83.4 },
  "nigeria": { lat: 6.11, lon: 4.17 },
  "north-korea": { lat: 39.72, lon: 127.82 },
  "norway": { lat: 59.25, lon: 10.44 },
  "oman": { lat: 20.98, lon: 59.06 },
  "pakistan": { lat: 25.22, lon: 66.26 },
  "panama": { lat: 9.32, lon: -80.61 },
  "papua-new-guinea": { lat: -4.22, lon: 145.43 },
  "peru": { lat: -15.43, lon: -75.4 },
  "philippines": { lat: 13.41, lon: 122.69 },
  "poland": { lat: 54.66, lon: 18.62 },
  "portugal": { lat: 39.81, lon: -9.33 },
  "qatar": { lat: 25.2, lon: 51.85 },
  "romania": { lat: 44.85, lon: 29.14 },
  "russia": { lat: 64.04, lon: 36.75 },
  "saudi-arabia": { lat: 22.53, lon: 38.83 },
  "senegal": { lat: 15.68, lon: -16.93 },
  "sierra-leone": { lat: 8.09, lon: -13.34 },
  "slovenia": { lat: 45.15, lon: 13.96, inland: true },
  "solomon-islands": { lat: -8.32, lon: 159.04 },
  "somalia": { lat: 2.75, lon: 46.76 },
  "south-africa": { lat: -34.02, lon: 23.59 },
  "south-korea": { lat: 36.99, lon: 126.61 },
  "spain": { lat: 39.24, lon: 0 },
  "sri-lanka": { lat: 7.51, lon: 82.01 },
  "sudan": { lat: 18.68, lon: 37.71 },
  "suriname": { lat: 6, lon: -55.95 },
  "sweden": { lat: 64.88, lon: 21.61 },
  "syria": { lat: 35.46, lon: 35.63 },
  "taiwan": { lat: 23.53, lon: 119.86 },
  "tanzania": { lat: -5.9, lon: 38.97 },
  "thailand": { lat: 13.19, lon: 100.97 },
  "timor-leste": { lat: -9.32, lon: 125.98 },
  "togo": { lat: 5.12, lon: -0.46, inland: true },
  "trinidad-and-tobago": { lat: 10.63, lon: -60.86 },
  "tunisia": { lat: 33.81, lon: 10.61 },
  "turkey": { lat: 36.57, lon: 34.73 },
  "turkmenistan": { lat: 30.05, lon: 49.88, inland: true },
  "ukraine": { lat: 46.48, lon: 31.64 },
  "united-arab-emirates": { lat: 24.3, lon: 53.86 },
  "united-kingdom": { lat: 54.71, lon: -0.75 },
  "united-states": { lat: 29.5, lon: -93.77 },
  "uruguay": { lat: -34.62, lon: -57.29 },
  "vanuatu": { lat: -15.41, lon: 166.42 },
  "venezuela": { lat: 10.3, lon: -64.91 },
  "vietnam": { lat: 20.55, lon: 106.9 },
  "yemen": { lat: 13.12, lon: 45.88 },
};

/** Hand-curated overrides - they win over the generated table. */
export const CURATED_ANCHORS: Record<string, CountryAnchor> = {
  "chile": { lat: -33.58, lon: -71.65 }, // San Antonio / Valparaiso approach
  "japan": { lat: 34.9, lon: 139.75 }, // Tokyo Bay approach (Uraga Channel)
  "netherlands": { lat: 51.98, lon: 3.95 }, // Rotterdam Maasgeul approach
  "australia": { lat: -20.25, lon: 118.58 }, // Port Hedland approach (geometric pick is the portless Nullarbor coast)
  "canada": { lat: 44.6, lon: -63.48 }, // Halifax approach (geometric pick is Hudson Bay)
  "belgium": { lat: 51.37, lon: 3.2 }, // Zeebrugge approach
  "benin": { lat: 6.3, lon: 2.44 }, // Cotonou roadstead
  "gambia": { lat: 13.5, lon: -16.75 }, // Banjul approach
  "iraq": { lat: 29.8, lon: 48.6 }, // Umm Qasr / Khor Abdullah approach
  "jordan": { lat: 29.45, lon: 34.95 }, // Aqaba approach
  "lithuania": { lat: 55.72, lon: 21.05 }, // Klaipeda approach
  "slovenia": { lat: 45.57, lon: 13.68 }, // Koper approach
  "togo": { lat: 6.1, lon: 1.28 }, // Lome roadstead
  "kazakhstan": { lat: 44.62, lon: 37.75, inland: true }, // Novorossiysk (CPC corridor; geometric pick is the Gulf of Ob)
  "singapore": { lat: 1.22, lon: 103.85 }, // Singapore Strait anchorage
  "bahrain": { lat: 26.2, lon: 50.68 }, // Khalifa Bin Salman approach
  "barbados": { lat: 13.1, lon: -59.64 }, // Bridgetown Deep Water Harbour
  "cabo-verde": { lat: 16.9, lon: -25 }, // Porto Grande, Mindelo
  "comoros": { lat: -11.69, lon: 43.24 }, // Moroni roadstead
  "grenada": { lat: 12.05, lon: -61.76 }, // St George's
  "kiribati": { lat: 1.36, lon: 172.93 }, // Betio, Tarawa
  "maldives": { lat: 4.18, lon: 73.5 }, // Male
  "malta": { lat: 35.89, lon: 14.54 }, // Valletta Grand Harbour
  "marshall-islands": { lat: 7.11, lon: 171.37 }, // Majuro
  "mauritius": { lat: -20.15, lon: 57.49 }, // Port Louis
  "micronesia": { lat: 6.98, lon: 158.21 }, // Pohnpei (Kolonia)
  "monaco": { lat: 43.73, lon: 7.43 }, // Port Hercule
  "nauru": { lat: -0.53, lon: 166.91 }, // Aiwo roadstead
  "palau": { lat: 7.33, lon: 134.47 }, // Malakal Harbor, Koror
  "saint-kitts-and-nevis": { lat: 17.29, lon: -62.72 }, // Basseterre
  "saint-lucia": { lat: 14.02, lon: -61 }, // Castries
  "saint-vincent-and-the-grenadines": { lat: 13.15, lon: -61.24 }, // Kingstown
  "samoa": { lat: -13.82, lon: -171.76 }, // Apia
  "seychelles": { lat: -4.62, lon: 55.47 }, // Port Victoria
  "tonga": { lat: -21.13, lon: -175.18 }, // Nuku'alofa
  "tuvalu": { lat: -8.52, lon: 179.2 }, // Funafuti
};

export const COUNTRY_ANCHORS: Record<string, CountryAnchor> = {
  ...GENERATED_ANCHORS,
  ...CURATED_ANCHORS,
};

/** The anchor for a country select value, if the country has one
 *  ("other" and unknown ids resolve to none). */
export function anchorForCountry(
  countryId: string | null | undefined,
): CountryAnchor | undefined {
  return countryId ? COUNTRY_ANCHORS[countryId] : undefined;
}
