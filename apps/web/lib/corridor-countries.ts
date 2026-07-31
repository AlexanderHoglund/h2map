/**
 * Full country list for the corridor's port-country selects. Ids are
 * kebab-case names; the seven ids that exist in the reference bundle
 * (denmark, netherlands, india, brazil, singapore, united-states, other)
 * carry their workbook WACC benchmarks — every other id resolves to the
 * generic "other" benchmark (see corridor-schema getCountry fallback).
 */

const NAMES = [
  "Afghanistan", "Albania", "Algeria", "Angola", "Argentina", "Armenia",
  "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh",
  "Barbados", "Belgium", "Belize", "Benin", "Bolivia", "Bosnia and Herzegovina",
  "Botswana", "Brazil", "Brunei", "Bulgaria", "Cabo Verde", "Cambodia",
  "Cameroon", "Canada", "Chile", "China", "Colombia", "Comoros",
  "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czechia", "Denmark",
  "Djibouti", "Dominican Republic", "Ecuador", "Egypt", "El Salvador",
  "Equatorial Guinea", "Eritrea", "Estonia", "Fiji", "Finland", "France",
  "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada",
  "Guatemala", "Guinea", "Guinea-Bissau", "Guyana", "Haiti", "Honduras",
  "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel",
  "Italy", "Ivory Coast", "Jamaica", "Japan", "Jordan", "Kazakhstan",
  "Kenya", "Kiribati", "Kuwait", "Latvia", "Lebanon", "Liberia", "Libya",
  "Lithuania", "Luxembourg", "Madagascar", "Malaysia", "Maldives", "Malta",
  "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia",
  "Monaco", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia",
  "Nauru", "Netherlands", "New Zealand", "Nicaragua", "Nigeria",
  "North Korea", "Norway", "Oman", "Pakistan", "Palau", "Panama",
  "Papua New Guinea", "Peru", "Philippines", "Poland", "Portugal", "Qatar",
  "Romania", "Russia", "Saint Kitts and Nevis", "Saint Lucia",
  "Saint Vincent and the Grenadines", "Samoa", "Saudi Arabia", "Senegal",
  "Seychelles", "Sierra Leone", "Singapore", "Slovenia", "Solomon Islands",
  "Somalia", "South Africa", "South Korea", "Spain", "Sri Lanka", "Sudan",
  "Suriname", "Sweden", "Syria", "Taiwan", "Tanzania", "Thailand",
  "Timor-Leste", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia",
  "Turkey", "Turkmenistan", "Tuvalu", "Ukraine", "United Arab Emirates",
  "United Kingdom", "United States", "Uruguay", "Vanuatu", "Venezuela",
  "Vietnam", "Yemen",
] as const;

export interface CountryOption {
  value: string;
  label: string;
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const CORRIDOR_COUNTRIES: CountryOption[] = NAMES.map((n) => ({
  value: slug(n),
  label: n,
}));
