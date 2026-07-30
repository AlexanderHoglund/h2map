/**
 * Branded scalar unit types (build-plan cross-cutting rule 2: "Units are
 * types. Any new scalar crossing a module boundary gets a branded type first.
 * A raw `number` in an engine signature is a review-blocker.")
 *
 * Phantom-string brands over `number`: zero runtime cost, non-assignable
 * across brands, and arithmetic naturally decays to `number` — re-brand at
 * function boundaries via the constructors below. Constructors assert
 * finiteness only; RANGE validation lives in `@h2map/corridor-schema`'s zod
 * layer (one place, next to the field definitions).
 */

declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/** Costs in USD millions — the workbook's native cost unit. */
export type UsdM = Brand<number, "UsdM">;
/** Fuel price / CO2 price, USD per tonne. */
export type UsdPerTonne = Brand<number, "UsdPerTonne">;
/** Self-designed fuel support, USD per kg of green fuel. */
export type UsdPerKg = Brand<number, "UsdPerKg">;
/** IRA 45Z credit rate, USD per gasoline-gallon-equivalent. */
export type UsdPerGallon = Brand<number, "UsdPerGallon">;
/** EUA price / FuelEU penalty, EUR per tonne. */
export type EurPerTonne = Brand<number, "EurPerTonne">;
/** EUR→USD exchange rate. */
export type EurUsd = Brand<number, "EurUsd">;

// ---------------------------------------------------------------------------
// Dimensionless / time
// ---------------------------------------------------------------------------

/** 0–1 fraction: WACC, inflation, scope shares, premiums, support shares. */
export type Fraction = Brand<number, "Fraction">;
/** Calendar year (e.g. 2027). */
export type CalendarYear = Brand<number, "CalendarYear">;
/** 1-based model year index (the Excel column index). */
export type YearIndex = Brand<number, "YearIndex">;
/** Integer count: vessels, roundtrips per year. */
export type Count = Brand<number, "Count">;

// ---------------------------------------------------------------------------
// Physical
// ---------------------------------------------------------------------------

export type Tonnes = Brand<number, "Tonnes">;
export type TonnesPerVesselYear = Brand<number, "TonnesPerVesselYear">;
/** Combustion (tank-to-wake) emission factor, tonnes CO2 per tonne fuel. */
export type TCo2PerTonne = Brand<number, "TCo2PerTonne">;
/** Well-to-wake GHG intensity, grams CO2-equivalent per MJ. */
export type GCo2ePerMj = Brand<number, "GCo2ePerMj">;
/** Lower heating value, MJ per tonne. */
export type MjPerTonne = Brand<number, "MjPerTonne">;
/** Vessel energy intensity, GJ per nautical mile. */
export type GjPerNm = Brand<number, "GjPerNm">;
export type NauticalMiles = Brand<number, "NauticalMiles">;
/** Cargo throughput, units per year. */
export type UnitsPerYear = Brand<number, "UnitsPerYear">;

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

function assertFinite(n: number, unit: string): void {
  if (!Number.isFinite(n)) {
    throw new TypeError(`${unit}: expected a finite number, got ${n}`);
  }
}

function make<B extends Brand<number, string>>(unit: string) {
  return (n: number): B => {
    assertFinite(n, unit);
    return n as B;
  };
}

export const usdM = make<UsdM>("UsdM");
export const usdPerTonne = make<UsdPerTonne>("UsdPerTonne");
export const usdPerKg = make<UsdPerKg>("UsdPerKg");
export const usdPerGallon = make<UsdPerGallon>("UsdPerGallon");
export const eurPerTonne = make<EurPerTonne>("EurPerTonne");
export const eurUsd = make<EurUsd>("EurUsd");
export const fraction = make<Fraction>("Fraction");
export const calendarYear = make<CalendarYear>("CalendarYear");
export const yearIndex = make<YearIndex>("YearIndex");
export const count = make<Count>("Count");
export const tonnes = make<Tonnes>("Tonnes");
export const tonnesPerVesselYear = make<TonnesPerVesselYear>("TonnesPerVesselYear");
export const tCo2PerTonne = make<TCo2PerTonne>("TCo2PerTonne");
export const gCo2ePerMj = make<GCo2ePerMj>("GCo2ePerMj");
export const mjPerTonne = make<MjPerTonne>("MjPerTonne");
export const gjPerNm = make<GjPerNm>("GjPerNm");
export const nauticalMiles = make<NauticalMiles>("NauticalMiles");
export const unitsPerYear = make<UnitsPerYear>("UnitsPerYear");
