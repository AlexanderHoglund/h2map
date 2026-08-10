import type {
  ResolvedScenario,
  ScenarioInput,
  ScenarioResult,
} from "@h2map/corridor-schema";
import { CORRIDOR_ENGINE_VERSION } from "@h2map/corridor-engine";
import { DEFAULT_BUNDLE } from "./state";

/**
 * Excel export of the corridor run: a styled two-sheet workbook —
 * "Results" (headline, decomposition, per-year table) and "Inputs" (every
 * resolved input grouped by tab, with its provenance). Values come from the
 * RESOLVED scenario and the engine result, so the file reflects exactly
 * what the model computed — never raw form state. exceljs is imported
 * dynamically so the ~250 kB library never enters the main bundle.
 */

// Palette — mirrors the app (globals.css): brand blue headers, deep-blue
// titles, hairline borders, warm-gray zebra rows.
const BRAND = "FF2171B5";
const BRAND_DEEP = "FF08306B";
const HAIR = "FFDDDCD6";
const ZEBRA = "FFF7F7F5";
const SUBTLE = "FF6D6D6D";

type Row = import("exceljs").Row;
type Worksheet = import("exceljs").Worksheet;

const thin = { style: "thin" as const, color: { argb: HAIR } };
const boxBorder = { top: thin, left: thin, bottom: thin, right: thin };

function sectionTitle(ws: Worksheet, text: string): void {
  ws.addRow([]);
  const r = ws.addRow([text]);
  r.font = { bold: true, size: 12, color: { argb: BRAND_DEEP } };
}

function tableHeader(ws: Worksheet, cells: string[]): Row {
  const r = ws.addRow(cells);
  r.eachCell({ includeEmpty: false }, (c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    c.border = boxBorder;
    c.alignment = { vertical: "middle" };
  });
  return r;
}

/** Data row with borders + zebra striping; number formats applied per column. */
function dataRow(
  ws: Worksheet,
  cells: (string | number | null)[],
  opts: { zebra?: boolean; bold?: boolean; numFmt?: Record<number, string> } = {},
): Row {
  const r = ws.addRow(cells.map((c) => (c === null ? "—" : c)));
  r.eachCell({ includeEmpty: false }, (c, col) => {
    c.border = boxBorder;
    c.font = { size: 10, bold: opts.bold ?? false };
    if (opts.zebra) {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
    }
    const fmt = opts.numFmt?.[col];
    if (fmt && typeof c.value === "number") c.numFmt = fmt;
  });
  return r;
}

const M2 = "#,##0.00"; // $m with cents
const INT = "#,##0";
const DEC = "0.00";
const PCT = "0.0%";
const FACTOR = "0.0000";

export async function downloadResultsXlsx(
  scenario: ScenarioInput,
  resolved: ResolvedScenario,
  result: ScenarioResult,
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Thaduberg";
  wb.created = new Date();

  const s = result.summary;
  const rep = result.reporting;
  const basis = scenario.flags?.emissionsBasis ?? "combustion";
  const basisLabel = basis === "wellToWake" ? "well-to-wake" : "combustion (TTW)";
  const routeLine = [
    [scenario.cargo.portAName, scenario.cargo.countryId].filter(Boolean).join(", "),
    scenario.cargo.routeType === "point-to-point"
      ? [scenario.cargo.portBName, scenario.cargo.countryBId].filter(Boolean).join(", ")
      : null,
  ]
    .filter(Boolean)
    .join(" → ");
  const span = `${scenario.cargo.startYear}–${scenario.cargo.startYear + scenario.cargo.horizonYears - 1}`;

  // ======================= Sheet 1 — Results =======================
  const ws = wb.addWorksheet("Results", {
    views: [{ showGridLines: false }],
    properties: { defaultRowHeight: 15 },
  });
  ws.columns = [
    { width: 34 },
    { width: 15 },
    { width: 15 },
    { width: 15 },
    { width: 15 },
    { width: 15 },
    { width: 15 },
    { width: 15 },
    { width: 15 },
    { width: 13 },
    { width: 13 },
  ];

  const title = ws.addRow(["Thaduberg — Green Corridor results"]);
  title.font = { bold: true, size: 16, color: { argb: BRAND_DEEP } };
  ws.addRow([
    `${routeLine} · ${scenario.cargo.routeType} · ${scenario.cargo.oneWayDistanceNm.toLocaleString("en-US")} nm · ${scenario.cargo.vessels} vessels · ${span}`,
  ]).font = { size: 10, color: { argb: SUBTLE } };
  ws.addRow([
    `Generated ${new Date().toISOString().slice(0, 10)} · engine ${CORRIDOR_ENGINE_VERSION} · reference bundle ${DEFAULT_BUNDLE.bundleId} · emissions basis: ${basisLabel}${scenario.cargo.routedDistance ? ` · route graph ${scenario.cargo.routedDistance.graphVersion}` : ""}`,
  ]).font = { size: 10, color: { argb: SUBTLE } };

  // ---- Headline ----
  sectionTitle(ws, "Headline");
  tableHeader(ws, ["Metric", "Value", "Unit"]);
  const headline: [string, number, string][] = [
    ["Incremental cost gap (PV)", s.gapPvUsdM, "$m"],
    ["Gap before regulatory instruments (PV)", rep.gapPvPreRegulationUsdM, "$m"],
    ["Net regulatory effect on the gap", rep.netRegulatoryEffectUsdM, "$m"],
    ["Green corridor total (PV)", s.greenTotalPvUsdM, "$m"],
    ["Fossil corridor total (PV)", s.fossilTotalPvUsdM, "$m"],
    ["Cost per unit of cargo", s.costPerUnitUsd, "$/unit"],
    ["Cost per unit before regulation", rep.costPerUnitPreRegulationUsd, "$/unit"],
    [`Cost per tonne CO2 abated (${basisLabel})`, s.costPerTonneCo2Usd, "$/t CO2"],
    [`CO2 abated over lifetime (${basisLabel})`, s.co2AbatedTonnes, "t"],
    ["Cargo over lifetime", s.cargoUnitsLifetime, "units"],
  ];
  headline.forEach(([label, value, unit], i) =>
    dataRow(ws, [label, value, unit], {
      zebra: i % 2 === 1,
      bold: i === 0,
      numFmt: { 2: unit === "t" || unit === "units" ? INT : M2 },
    }),
  );

  // ---- Cost decomposition ----
  const imo = rep.imoNetZero && !rep.imoNetZero.notParameterised ? rep.imoNetZero : null;
  const imoGreen = imo && "green" in imo ? imo.green.pvUsdM : 0;
  const imoFossil = imo && "fossil" in imo ? imo.fossil.pvUsdM : 0;
  sectionTitle(ws, "Cost decomposition (PV, $m)");
  tableHeader(ws, ["Line", "Green", "Fossil", "Δ green − fossil"]);
  const fmtMoney3 = { 2: M2, 3: M2, 4: M2 };
  const decomp: [string, number, number | null, { bold?: boolean }?][] = [
    ["CAPEX", s.greenCapexPvUsdM, s.fossilCapexPvUsdM],
    ["Operating cost", s.greenOpexPvUsdM, s.fossilOpexPvUsdM],
    [
      "Subtotal before regulation",
      s.greenCapexPvUsdM + s.greenOpexPvUsdM,
      s.fossilCapexPvUsdM + s.fossilOpexPvUsdM,
      { bold: true },
    ],
    ["EU ETS", s.etsGreenPvUsdM, s.etsFossilPvUsdM],
    ["FuelEU Maritime", s.fuelEuGreenPvUsdM, s.fuelEuFossilPvUsdM],
    ["IRA 45Z credit", s.ira45zGreenPvUsdM, null],
    ["Self-designed scheme", s.selfDesignedGreenPvUsdM, s.selfDesignedFossilPvUsdM],
    ...(s.financingGreenPvUsdM !== undefined
      ? ([["Green financing effect", s.financingGreenPvUsdM, null]] as [
          string,
          number,
          number | null,
        ][])
      : []),
    ...(imo
      ? ([["IMO Net-Zero Framework", imoGreen, imoFossil]] as [string, number, number | null][])
      : []),
    ["Total (PV)", s.greenTotalPvUsdM, s.fossilTotalPvUsdM, { bold: true }],
  ];
  decomp.forEach(([label, g, f, o], i) =>
    dataRow(ws, [label, g, f, f === null ? null : g - f], {
      zebra: i % 2 === 1,
      bold: o?.bold,
      numFmt: fmtMoney3,
    }),
  );
  // ---- Per-year table ----
  sectionTitle(ws, "Per-year cost, undiscounted ($m) — and the discounted gap");
  tableHeader(ws, [
    "Year",
    "Green CAPEX",
    "Green operating",
    "Green regulation",
    "Green total",
    "Fossil CAPEX",
    "Fossil operating",
    "Fossil regulation",
    "Fossil total",
    "Discount factor",
    "Gap (PV)",
  ]);
  const g = result.perYear.green;
  const f = result.perYear.fossil;
  const regOf = (side: typeof g, i: number) =>
    (side.etsUsdM[i] ?? 0) +
    (side.fuelEuUsdM[i] ?? 0) +
    (side.ira45zUsdM[i] ?? 0) +
    (side.selfDesignedUsdM[i] ?? 0) +
    (side.imoNetZeroUsdM?.[i] ?? 0) +
    (side.financingUsdM?.[i] ?? 0);
  const perYearFmt: Record<number, string> = {
    2: M2, 3: M2, 4: M2, 5: M2, 6: M2, 7: M2, 8: M2, 9: M2, 10: FACTOR, 11: M2,
  };
  g.totalUsdM.forEach((gt, i) => {
    dataRow(
      ws,
      [
        scenario.cargo.startYear + i,
        g.totalCapexUsdM[i] ?? 0,
        g.totalOpexUsdM[i] ?? 0,
        regOf(g, i),
        gt,
        f.totalCapexUsdM[i] ?? 0,
        f.totalOpexUsdM[i] ?? 0,
        regOf(f, i),
        f.totalUsdM[i] ?? 0,
        g.discountFactor[i] ?? 0,
        (g.pvUsdM[i] ?? 0) - (f.pvUsdM[i] ?? 0),
      ],
      { zebra: i % 2 === 1, numFmt: perYearFmt },
    );
  });

  // ======================= Sheet 2 — Inputs =======================
  const wi = wb.addWorksheet("Inputs", { views: [{ showGridLines: false }] });
  wi.columns = [{ width: 36 }, { width: 20 }, { width: 14 }, { width: 12 }];
  const t2 = wi.addRow(["Thaduberg — scenario inputs (as resolved by the model)"]);
  t2.font = { bold: true, size: 16, color: { argb: BRAND_DEEP } };
  wi.addRow([
    "Source: override = you typed it · derived = the model computed it · benchmark = reference default",
  ]).font = { size: 10, color: { argb: SUBTLE } };

  const rg = resolved.green;
  const rf = resolved.fossil;
  type InputRow = [string, string | number, string, string];
  const section = (name: string, rows: InputRow[]) => {
    sectionTitle(wi, name);
    tableHeader(wi, ["Field", "Value", "Unit", "Source"]);
    rows.forEach((row, i) =>
      dataRow(wi, row, {
        zebra: i % 2 === 1,
        numFmt: { 2: typeof row[1] === "number" && Number.isInteger(row[1]) ? INT : DEC },
      }),
    );
  };

  section("01 · Intro", [
    ["Route type", scenario.cargo.routeType, "—", "—"],
    ["Port A", [scenario.cargo.portAName, scenario.cargo.countryId].filter(Boolean).join(", "), "—", "—"],
    ...(scenario.cargo.routeType === "point-to-point"
      ? ([["Port B", [scenario.cargo.portBName, scenario.cargo.countryBId].filter(Boolean).join(", "), "—", "—"]] as InputRow[])
      : []),
    ["Cargo unit", scenario.cargo.unit ?? "tonne", "—", "—"],
    ["Weight per unit", scenario.cargo.unitWeightTonnes ?? 1, "t", "—"],
    [
      "One-way distance",
      scenario.cargo.oneWayDistanceNm,
      "nm",
      scenario.cargo.routedDistance?.nm === scenario.cargo.oneWayDistanceNm
        ? "derived"
        : "override",
    ],
    ...(scenario.cargo.routedDistance
      ? ([
          [
            "Routed distance (adopted)",
            scenario.cargo.routedDistance.nm,
            "nm",
            scenario.cargo.routedDistance.graphVersion,
          ],
        ] as InputRow[])
      : []),
    ["Cargo per year", resolved.unitsPerYear, "units/yr", "—"],
    ["Start year", scenario.cargo.startYear, "—", "—"],
    ["Years modelled", scenario.cargo.horizonYears, "yr", "—"],
    ["Vessels", resolved.vessels, "—", "—"],
    ["Roundtrips per year", scenario.cargo.roundtripsPerYear, "/yr", "—"],
    ["Inflation", resolved.inflation, "fraction", "—"],
    ["Discount rate (WACC)", resolved.wacc.value, "fraction", resolved.wacc.source],
  ]);

  const fuelRows = (side: typeof rg, input: typeof scenario.green): InputRow[] => [
    ["Fuel", input.fuelId, "—", "—"],
    ["Sourcing", input.sourcing, "—", "—"],
    ["Fuel price", side.priceUsdPerTonne.value, "$/t", side.priceUsdPerTonne.source],
    ["Fuel consumption", side.tonnesPerVesselYear.value, "t/vessel/yr", side.tonnesPerVesselYear.source],
    ["Energy density (LHV)", side.lhv.value, "MJ/t", side.lhv.source],
    ["CO2 emission factor, combustion", side.combustionEf.value, "t CO2/t", side.combustionEf.source],
    ["Well-to-wake intensity", side.wtw.value, "gCO2e/MJ", side.wtw.source],
    ["Production CAPEX (year 1)", side.prodCapexUsdM.value, "$m", side.prodCapexUsdM.source],
    ["Production O&M", side.prodOpexUsdMPerYear.value, "$m/yr", side.prodOpexUsdMPerYear.source],
  ];
  section("02 · Energy — green", fuelRows(rg, scenario.green));
  section("02 · Energy — fossil", fuelRows(rf, scenario.fossil));

  section("03 · Vessels", [
    ["Vessel type", scenario.vessel.typeId, "—", "—"],
    ["Consumption mode", scenario.vessel.consumptionMode, "—", "—"],
    ["Green fleet CAPEX (year 1)", rg.vesselCapexUsdM.value, "$m", rg.vesselCapexUsdM.source],
    ["Green fleet OPEX", rg.vesselOpexUsdMPerYear.value, "$m/yr", rg.vesselOpexUsdMPerYear.source],
    ["Fossil fleet CAPEX (year 1)", rf.vesselCapexUsdM.value, "$m", rf.vesselCapexUsdM.source],
    ["Fossil fleet OPEX", rf.vesselOpexUsdMPerYear.value, "$m/yr", rf.vesselOpexUsdMPerYear.source],
  ]);

  const portRows = (side: typeof rg): InputRow[] => [
    ["Port storage CAPEX (year 1)", side.portStorageCapexUsdM.value, "$m", side.portStorageCapexUsdM.source],
    ["Port storage OPEX", side.portStorageOpexUsdMPerYear.value, "$m/yr", side.portStorageOpexUsdMPerYear.source],
    ["Barge CAPEX (year 1)", side.bargeCapexUsdM.value, "$m", side.bargeCapexUsdM.source],
    ["Barge OPEX", side.bargeOpexUsdMPerYear.value, "$m/yr", side.bargeOpexUsdMPerYear.source],
  ];
  section("05 · Ports — green", portRows(rg));
  section("05 · Ports — fossil", portRows(rf));

  const reg = scenario.regulation;
  section("06 · Regulation & Financing", [
    ["EU ETS", reg.ets.enabled ? "enabled" : "off", "—", "—"],
    ["EUA price", reg.ets.euaEurPerTonne, "€/t CO2", "—"],
    ["EUR/USD", reg.eurUsd, "—", "—"],
    ["ETS scope", reg.ets.scope, "fraction", "—"],
    ["FuelEU Maritime", reg.fuelEu.enabled ? "enabled" : "off", "—", "—"],
    ["FuelEU penalty", reg.fuelEu.penaltyEurPerTonne, "€/t VLSFO-eq", "—"],
    ["FuelEU scope", reg.fuelEu.scope, "fraction", "—"],
    ["IRA 45Z", reg.ira45z.enabled ? "enabled" : "off", "—", "—"],
    ["45Z credit", reg.ira45z.creditUsdPerGallon, "$/gal", "—"],
    ["Self-designed scheme", reg.selfDesigned.enabled ? "enabled" : "off", "—", "—"],
    ["Self-designed CO2 price", reg.selfDesigned.co2PriceUsdPerTonne, "$/t CO2", "—"],
    ["H2-based fuel support", reg.selfDesigned.supportUsdPerKg, "$/kg", "—"],
    ["CAPEX support", reg.selfDesigned.capexSupport, "fraction", "—"],
    ["OPEX support", reg.selfDesigned.opexSupport, "fraction", "—"],
    ["IMO Net-Zero Framework", reg.imoNetZero?.enabled ? "enabled" : "off", "—", "—"],
    ["Green financing", scenario.financing?.enabled ? "enabled" : "off", "—", "—"],
    ...(scenario.financing?.enabled
      ? ([
          ["Green cost of debt", scenario.financing.greenRate, "fraction", "—"],
          ["Base cost of debt", scenario.financing.baseRate, "fraction", "—"],
          ["Debt share of green CAPEX", scenario.financing.debtShare, "fraction", "—"],
          ["Loan tenor", scenario.financing.tenorYears, "yr", "—"],
          ["Repayment structure", scenario.financing.structure, "—", "—"],
        ] as InputRow[])
      : []),
    ["Emissions basis", basis, "—", "—"],
    ["Rate basis", scenario.flags?.rateBasis ?? "nominal", "—", "—"],
  ]);
  // Percent-formatted cells (fractions) — applied after the fact where the
  // generic DEC format was set.
  for (const row of wi.getRows(1, wi.rowCount) ?? []) {
    const label = String(row.getCell(1).value ?? "");
    if (/Inflation|Discount rate|scope|support$|CAPEX support|OPEX support/i.test(label)) {
      const c = row.getCell(2);
      if (typeof c.value === "number") c.numFmt = PCT;
    }
  }

  // ---- download ----
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `thaduberg-corridor-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
