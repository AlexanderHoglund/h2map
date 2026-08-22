import type { RefBundle, ScenarioInput } from "@h2map/corridor-schema";

/**
 * THE cargo-unit resolution — one definition, four consumers (CargoTabStep,
 * ResultsPanel, ResultsSummary, exportXlsx).
 *
 * Replaces three drifted copies of
 * `scenario.cargo.unit ?? (typeId.startsWith("container") ? "teu" : "tonne")`
 * — a heuristic that matched only the two DEPRECATED container rows (the
 * live catalogue's ids are `cont-*`), so every live container ship silently
 * read "tonne" while its bundle row carried `defaultCargoUnit: "teu"`. The
 * bundle field is the source of truth here, which is also what makes
 * "passenger" work without any per-family string matching.
 *
 * The TEU weight default is 10 t — the GLEC Framework's default average
 * payload per TEU, adopted so derived $/tonne figures are comparable with
 * GLEC/ISO 14083 intensity accounting. The three consumers used to
 * disagree (10 / 14 / 1), so the same corridor showed different derived
 * $/tonne figures in the editor and the results panel; one constant, one
 * sourced convention.
 */

export type CargoUnit = "tonne" | "teu" | "passenger";

/**
 * Default average payload of one TEU, tonnes — the GLEC Framework
 * (Smart Freight Centre) default TEU-to-tonnes conversion. The benchmark a
 * fresh TEU switch gets; a user with a known cargo mix overrides it.
 */
export const TEU_WEIGHT_TONNES = 10;

export function cargoUnitOf(
  scenario: ScenarioInput,
  bundle: RefBundle,
): {
  unit: CargoUnit;
  /** null = weight is not a property of this unit (passengers). */
  unitWeightTonnes: number | null;
} {
  const row = bundle.vesselTypes.find((v) => v.id === scenario.vessel.typeId);
  const unit: CargoUnit =
    scenario.cargo.unit ?? row?.defaultCargoUnit ?? "tonne";
  const unitWeightTonnes =
    unit === "passenger"
      ? null
      : scenario.cargo.unitWeightTonnes ??
        (unit === "teu" ? TEU_WEIGHT_TONNES : 1);
  return { unit, unitWeightTonnes };
}
