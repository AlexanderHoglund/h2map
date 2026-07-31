import Footer from "@/components/shell/Footer";
import TopBar from "@/components/shell/TopBar";

export const metadata = {
  title: "Documentation — Thaduberg",
  description:
    "Complete documentation of the Green Corridor cost model: every tab, every field, every formula — inputs, benchmarks, regulation schemes and outputs.",
};

/** Block formula: monospace, scrolls horizontally on small screens. */
function F({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-3 overflow-x-auto border border-neutral-300 bg-neutral-50 px-4 py-3 font-mono text-[13px] leading-relaxed">
      {children}
    </div>
  );
}

function H({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="mt-12 scroll-mt-16 border-b border-neutral-300 pb-1 text-lg font-semibold"
    >
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-6 text-sm font-semibold">{children}</h3>;
}

/** Field table: name / unit / default·benchmark / what it does. */
function Fields({
  rows,
}: {
  rows: [name: string, unit: string, benchmark: string, notes: string][];
}) {
  return (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border border-neutral-300 text-[13px]">
        <thead>
          <tr className="border-b border-neutral-300 bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-500">
            <th className="px-3 py-2 font-medium">Field</th>
            <th className="px-3 py-2 font-medium">Unit</th>
            <th className="px-3 py-2 font-medium">Benchmark / default</th>
            <th className="px-3 py-2 font-medium">What it does</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, unit, benchmark, notes]) => (
            <tr key={name} className="border-b border-neutral-200 align-top last:border-0">
              <td className="whitespace-nowrap px-3 py-2 font-medium">{name}</td>
              <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-neutral-600">
                {unit}
              </td>
              <td className="px-3 py-2 tabular-nums text-neutral-700">{benchmark}</td>
              <td className="px-3 py-2 text-neutral-700">{notes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TOC: [string, string][] = [
  ["overview", "1. Overview & how the model works"],
  ["workflow", "2. Working with scenarios"],
  ["tab-cargo", "3. Tab 01 — Cargo & Corridor"],
  ["tab-vessel", "4. Tab 02 — Vessel"],
  ["tab-fuel", "5. Tab 03 — Fuel"],
  ["tab-port", "6. Tab 04 — Port"],
  ["tab-regulation", "7. Tab 05 — Regulation"],
  ["tab-results", "8. Tab 06 — Results"],
  ["engine", "9. The engine: formulas"],
  ["reference-data", "10. Reference data"],
  ["sensitivity", "11. What moves the result"],
  ["provenance", "12. Provenance, versions & limits"],
  ["inputs", "13. Complete input inventory"],
];

/**
 * Every scenario input, verbatim from the generated schema reference
 * (docs/corridor/field-reference.md — zod schema joined with the
 * sensitivity artifact; CI fails on drift). Columns: path, type,
 * required, sensitivity rank, max headline movement, UI placement.
 */
const ALL_INPUTS: [string, string, string, string, string, string][] = [
  ["schemaVersion", "= 2", "yes", "—", "—", "—"],
  ["refBundleId", "string", "yes", "—", "—", "—"],
  ["cargo.countryId", "string", "yes", "—", "—", "—"],
  ["cargo.routeType", '"point-to-point" | "single-point"', "yes", "—", "—", "—"],
  ["cargo.oneWayDistanceNm", "number", "yes", "#1", "74.1%", "top-level"],
  ["cargo.startYear", "integer", "yes", "—", "—", "—"],
  ["cargo.horizonYears", "integer", "yes", "#8", "17.6%", "top-level"],
  ["cargo.unitsPerYear", "number", "yes", "#24", "0.0%", "advanced"],
  ["cargo.inflation", "number", "yes", "#10", "14.0%", "top-level"],
  ["cargo.vessels", "integer", "yes", "#5", "32.9%", "top-level"],
  ["cargo.roundtripsPerYear", "number", "yes", "#14", "8.2%", "top-level"],
  ["cargo.waccOverride", "number | null", "yes", "#9", "14.6%", "top-level"],
  ["cargo.unit", '"tonne" | "teu"', "no", "—", "—", "—"],
  ["cargo.unitWeightTonnes", "number", "no", "—", "—", "—"],
  ["cargo.portAName", "string", "no", "—", "—", "—"],
  ["cargo.portBName", "string", "no", "—", "—", "—"],
  ["cargo.countryBId", "string", "no", "—", "—", "—"],
  ["vessel.typeId", "string", "yes", "—", "—", "—"],
  ["vessel.consumptionMode", '"distance" | "vessel-benchmark"', "yes", "—", "—", "—"],
  ["vessel.green.capexUsdM", "number | null", "yes", "#2", "56.9%", "top-level"],
  ["vessel.green.opexUsdMPerYear", "number | null", "yes", "#3", "42.5%", "top-level"],
  ["vessel.fossil.capexUsdM", "number | null", "yes", "—", "—", "—"],
  ["vessel.fossil.opexUsdMPerYear", "number | null", "yes", "—", "—", "—"],
  ["green.fuelId", "string", "yes", "—", "—", "—"],
  ["green.sourcing", '"construct" | "purchase" | "named-plant" | "build-here"', "yes", "—", "—", "—"],
  ["green.deliveredPriceUsdPerTonne", "number | null", "no", "—", "—", "—"],
  ["green.buildHere", "object | null", "no", "—", "—", "—"],
  ["green.overrides.priceUsdPerTonne", "number | null", "yes", "#11", "13.7%", "top-level"],
  ["green.overrides.combustionEfTco2PerTonne", "number | null", "yes", "—", "—", "—"],
  ["green.overrides.lhvMjPerTonne", "number | null", "yes", "—", "—", "—"],
  ["green.overrides.wtwGco2PerMj", "number | null", "yes", "#23", "0.2%", "advanced"],
  ["green.overrides.fuelTonnesPerVesselYear", "number | null", "yes", "#7", "21.1%", "top-level"],
  ["green.overrides.prodCapexUsdM", "number | null", "yes", "#4", "32.9%", "top-level"],
  ["green.overrides.prodOpexUsdMPerYear", "number | null", "yes", "#6", "26.6%", "top-level"],
  ["green.overrides.portStorageCapexUsdM", "number | null", "yes", "#12", "10.8%", "top-level"],
  ["green.overrides.portStorageOpexUsdMPerYear", "number | null", "yes", "#13", "8.9%", "top-level"],
  ["green.overrides.bargeCapexUsdM", "number | null", "yes", "#15", "4.2%", "advanced"],
  ["green.overrides.bargeOpexUsdMPerYear", "number | null", "yes", "—", "—", "—"],
  ["fossil.fuelId", "string", "yes", "—", "—", "—"],
  ["fossil.sourcing", '"construct" | "purchase" | "named-plant" | "build-here"', "yes", "—", "—", "—"],
  ["fossil.deliveredPriceUsdPerTonne", "number | null", "no", "—", "—", "—"],
  ["fossil.buildHere", "object | null", "no", "—", "—", "—"],
  ["fossil.overrides.priceUsdPerTonne", "number | null", "yes", "#19", "3.2%", "advanced"],
  ["fossil.overrides.combustionEfTco2PerTonne", "number | null", "yes", "—", "—", "—"],
  ["fossil.overrides.lhvMjPerTonne", "number | null", "yes", "—", "—", "—"],
  ["fossil.overrides.wtwGco2PerMj", "number | null", "yes", "#21", "1.9%", "advanced"],
  ["fossil.overrides.fuelTonnesPerVesselYear", "number | null", "yes", "—", "—", "—"],
  ["fossil.overrides.prodCapexUsdM", "number | null", "yes", "—", "—", "—"],
  ["fossil.overrides.prodOpexUsdMPerYear", "number | null", "yes", "—", "—", "—"],
  ["fossil.overrides.portStorageCapexUsdM", "number | null", "yes", "—", "—", "—"],
  ["fossil.overrides.portStorageOpexUsdMPerYear", "number | null", "yes", "—", "—", "—"],
  ["fossil.overrides.bargeCapexUsdM", "number | null", "yes", "—", "—", "—"],
  ["fossil.overrides.bargeOpexUsdMPerYear", "number | null", "yes", "—", "—", "—"],
  ["regulation.eurUsd", "number", "yes", "#22", "1.2%", "advanced"],
  ["regulation.ets.enabled", "boolean", "yes", "—", "—", "—"],
  ["regulation.ets.euaEurPerTonne", "number", "yes", "#18", "3.6%", "advanced"],
  ["regulation.ets.scope", "number 0–1", "yes", "#20", "2.4%", "advanced"],
  ["regulation.ets.gasCoverage.enabled", "boolean", "yes", "—", "—", "—"],
  ["regulation.ets.gasCoverage.fromCalendarYear", "integer", "yes", "—", "—", "—"],
  ["regulation.ets.gasCoverage.gwpCh4", "number", "yes", "—", "—", "—"],
  ["regulation.ets.gasCoverage.gwpN2o", "number", "yes", "—", "—", "—"],
  ["regulation.ets.gasCoverage.green.ch4TPerTonne", "number", "yes", "—", "—", "—"],
  ["regulation.ets.gasCoverage.green.n2oTPerTonne", "number", "yes", "—", "—", "—"],
  ["regulation.ets.gasCoverage.fossil.ch4TPerTonne", "number", "yes", "—", "—", "—"],
  ["regulation.ets.gasCoverage.fossil.n2oTPerTonne", "number", "yes", "—", "—", "—"],
  ["regulation.fuelEu.enabled", "boolean", "yes", "—", "—", "—"],
  ["regulation.fuelEu.penaltyEurPerTonne", "number", "yes", "#17", "3.7%", "advanced"],
  ["regulation.fuelEu.vlsfoMjPerTonne", "number", "yes", "—", "—", "—"],
  ["regulation.fuelEu.baselineGco2PerMj", "number", "yes", "—", "—", "—"],
  ["regulation.fuelEu.scope", "number 0–1", "yes", "#16", "3.7%", "advanced"],
  ["regulation.fuelEu.credit.enabled", "boolean", "yes", "—", "—", "—"],
  ["regulation.fuelEu.credit.surplusValueEurPerTonneVlsfoEq", "number", "yes", "—", "—", "—"],
  ["regulation.fuelEu.credit.rfnbo", "boolean", "yes", "—", "—", "—"],
  ["regulation.fuelEu.credit.rfnboMultiplier", "number", "yes", "—", "—", "—"],
  ["regulation.fuelEu.credit.rfnboUntil", "integer", "yes", "—", "—", "—"],
  ["regulation.ira45z.enabled", "boolean", "yes", "—", "—", "—"],
  ["regulation.ira45z.usProduced", "boolean", "yes", "—", "—", "—"],
  ["regulation.ira45z.creditUsdPerGallon", "number", "yes", "—", "—", "—"],
  ["regulation.ira45z.effectiveUntil", "integer | null", "no", "—", "—", "—"],
  ["regulation.selfDesigned.enabled", "boolean", "yes", "—", "—", "—"],
  ["regulation.selfDesigned.co2PriceUsdPerTonne", "number", "yes", "—", "—", "—"],
  ["regulation.selfDesigned.supportUsdPerKg", "number", "yes", "—", "—", "—"],
  ["regulation.selfDesigned.capexSupport", "number 0–1", "yes", "—", "—", "—"],
  ["regulation.selfDesigned.opexSupport", "number 0–1", "yes", "—", "—", "—"],
  ["regulation.selfDesigned.otherUsdM", "number", "yes", "—", "—", "—"],
  ['flags.emissionsBasis', '"combustion" | "wellToWake"', "no", "—", "—", "—"],
  ['flags.rateBasis', '"nominal" | "real"', "no", "—", "—", "—"],
];

export default function DocsPage() {
  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-4xl px-4 py-10 text-sm leading-6 text-neutral-800">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
          Green Corridor cost model — documentation
        </h1>
        <p className="mt-2 text-neutral-600">
          The complete reference for the Thaduberg corridor model: every tab,
          every field, every formula. The model evaluates a green shipping
          corridor as the <strong>net-present-value cost gap</strong>{" "}between
          running the corridor on a green fuel versus a fossil fuel, with EU
          ETS, FuelEU Maritime, IRA&nbsp;45Z and self-designed regulation
          layered on top. It is a faithful re-implementation of the{" "}
          <em> Green Corridor Model Simplified</em>{" "}workbook — the untouched
          default scenario reproduces the workbook&apos;s numbers to
          10&nbsp;significant digits.
        </p>

        <nav className="mt-6 border border-neutral-300 bg-white p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Contents
          </p>
          <ol className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {TOC.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="text-brand underline underline-offset-2 decoration-brand/30 hover:decoration-brand"
                >
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* 1 ---------------------------------------------------------- */}
        <H id="overview">1. Overview &amp; how the model works</H>
        <p className="mt-2">
          The model compares two configurations of the <em>same</em>{" "}corridor —
          same route, same cargo, same schedule — differing only in the fuel
          chain: a <strong>green corridor</strong>{" "}(e-ammonia, e-methanol,
          liquid hydrogen, biodiesel or LNG, with its production, storage and
          handling assets) and a <strong>fossil corridor</strong>{" "}(the
          conventional baseline, LSFO by default). For every modelled year it
          builds each side&apos;s full cost line — CAPEX, OPEX, fuel and the
          four regulation schemes — discounts it to present value, and reports:
        </p>
        <F>
          Gap (PV) = Σ<sub>years</sub>{" "}green<sub>t</sub>{" "}· df<sub>t</sub>{" "}− Σ
          <sub>years</sub>{" "}fossil<sub>t</sub>{" "}· df<sub>t</sub>
          <br />
          df<sub>t</sub>{" "}= 1 / (1 + WACC)<sup>t−1</sup>
        </F>
        <p className="mt-2">
          The engine runs <strong>in your browser on every keystroke</strong>{" "}—
          there is no &ldquo;calculate&rdquo; button and no server round-trip;
          the results panel and the top-bar gap chip are always live.
        </p>
        <H3>Benchmarks, overrides and the source badges</H3>
        <p className="mt-2">
          Every numeric input follows the workbook&apos;s resolution
          convention: <em>value used = your override if given, else the
          benchmark</em>. The interface shows where each number comes from with
          a badge on the field:
        </p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>BENCHMARK</strong>{" "}— the reference value from the model&apos;s
            data tables (fuel properties, vessel costs, country WACCs).
          </li>
          <li>
            <strong>DERIVED</strong>{" "}— computed from other inputs (e.g.
            distance-mode fuel consumption, the green vessel&apos;s fuel
            premium, the fossil side&apos;s &times;0.3 logistics rule).
          </li>
          <li>
            <strong>OVERRIDE</strong>{" "}— you typed a value; the benchmark stays
            visible underneath (&ldquo;benchmark: X — restore&rdquo;) so you
            can always get back.
          </li>
          <li>
            <strong>unverified benchmark</strong>{" "}— the workbook itself flags
            the value as illustrative, not sourced (all country WACCs carry
            this).
          </li>
        </ul>
        <p className="mt-2">
          Fields are split between the main grid and an{" "}
          <strong>Advanced</strong>{" "}fold per tab. Placement is not editorial:
          an input renders top-level when a one-at-a-time sensitivity sweep
          moves the headline gap by ≥5% across its plausible range (§11).
        </p>

        {/* 2 ---------------------------------------------------------- */}
        <H id="workflow">2. Working with scenarios</H>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Draft autosave</strong>{" "}— every change is saved locally in
            your browser; returning to the app offers to resume the draft.
          </li>
          <li>
            <strong>Export / Import JSON</strong>{" "}— the scenario bar downloads
            the full scenario as a versioned JSON file and can load one back.
            Files carry a schema version; older files are migrated on load.
          </li>
          <li>
            <strong>Reset</strong>{" "}— returns every field to the workbook
            defaults (with confirmation).
          </li>
          <li>
            <strong>Navigation</strong>{" "}— the six tabs in the top bar are free
            navigation; Back/Next at the bottom of each form walks them in
            order. The Results tab (§8) holds the full report; a compact live
            summary stays docked on every input tab.
          </li>
        </ul>

        {/* 3 ---------------------------------------------------------- */}
        <H id="tab-cargo">3. Tab 01 — Cargo &amp; Corridor</H>
        <p className="mt-2">
          Defines the trade lane, the cargo and the model&apos;s financial
          frame. Everything here is shared by both sides of the comparison.
        </p>
        <Fields
          rows={[
            [
              "Corridor type",
              "—",
              "Point-to-point",
              "Point-to-point shows two ports (A and B); single point shows one. Descriptive — the cost model works from distance, not geography.",
            ],
            [
              "Port A / Port B",
              "text",
              "empty",
              "Named berths for the corridor. Shown in the results snapshot; free text.",
            ],
            [
              "Country (port A)",
              "—",
              "Denmark",
              "THE anchor input: selects the financing (WACC) benchmark. Denmark, Netherlands, India, Brazil, Singapore and the United States carry workbook benchmarks (5.5–11.5%); any other country uses the generic 8% benchmark. All are flagged unverified.",
            ],
            [
              "Country (port B)",
              "—",
              "= country A",
              "Descriptive; shown in the snapshot. Does not affect the numbers.",
            ],
            [
              "Cargo unit",
              "tonne | TEU",
              "by vessel type",
              "What one cargo unit IS. Defaults to tonne for tankers/bulk/Ro-Ro and TEU for container vessels. Presentation + per-tonne derivations only — the engine counts units.",
            ],
            [
              "Weight per unit",
              "t",
              "1 (tonne) / 14 (TEU)",
              "Used to derive cost per tonne of cargo when the unit is a TEU.",
            ],
            [
              "Corridor length, one-way",
              "nm",
              "500",
              "One-way distance. Drives distance-mode fuel consumption (×2 per roundtrip). The single most sensitive input in the model (§11).",
            ],
            [
              "Model start year",
              "year",
              "2027",
              "Calendar year of year 1. Matters for the regulation schedules: the ETS phase-in and the FuelEU target ladder are calendar-anchored (§7).",
            ],
            [
              "Years modelled",
              "yr",
              "20 (max 40)",
              "The horizon. Costs and cargo beyond it are not counted.",
            ],
            [
              "Annual cargo throughput",
              "units/yr",
              "22,167",
              "Only feeds the per-unit figures and lifetime cargo — it is NOT linked to fuel burn or vessel counts (the workbook keeps them independent; so does the model). Advanced fold.",
            ],
            [
              "Discount rate (WACC)",
              "fraction",
              "country benchmark (DK 0.055)",
              "Discounts every year's cost to present value on both sides. Override for a project-specific rate. Unverified benchmark.",
            ],
            [
              "Inflation rate",
              "fraction",
              "0.02",
              "Escalates every OPEX line (fuel, O&M, storage, barge, vessel) as (1+i)^(t−1). CAPEX is year-1 and not inflated.",
            ],
          ]}
        />

        {/* 4 ---------------------------------------------------------- */}
        <H id="tab-vessel">4. Tab 02 — Vessel</H>
        <p className="mt-2">
          The ships that serve the corridor. One vessel type is shared by both
          sides; the green side buys new tonnage while the fossil side sails
          the existing baseline fleet.
        </p>
        <Fields
          rows={[
            [
              "Vessel type",
              "—",
              "Tanker 35k dwt",
              "Sets the benchmark CAPEX/OPEX, the benchmark annual fuel burn, and the energy-per-mile figure used by distance-mode consumption. Six types from tanker to 15k-TEU container ship (§10).",
            ],
            [
              "Consumption basis",
              "—",
              "Distance-based",
              "Distance: fuel burn is derived from corridor length × roundtrips × the vessel's GJ/nm, divided by each fuel's energy density. Vessel benchmark: use the type's flat tonnes-per-year figure instead.",
            ],
            [
              "Number of vessels",
              "ships",
              "1",
              "Multiplies fuel burn, vessel costs and every regulation term.",
            ],
            [
              "Roundtrips per year",
              "1/yr",
              "12",
              "Multiplies distance-mode fuel burn.",
            ],
            [
              "Green vessel CAPEX",
              "$m",
              "derived: type CAPEX × (1 + fuel premium)",
              "New-build premium for the green fuel (e-ammonia +25%, LH2 +30%, e-methanol +15%…). Tanker 35k × e-ammonia benchmark: 20 × 1.25 = 25.",
            ],
            [
              "Green vessel OPEX",
              "$m/yr",
              "type OPEX (1.2)",
              "Annual operating cost excl. fuel; inflated.",
            ],
            [
              "Fossil vessel CAPEX",
              "$m",
              "0",
              "The workbook's 'existing baseline vessel' rule — the fossil fleet is already on the water, so its benchmark CAPEX is zero. Override if your baseline includes new tonnage.",
            ],
            [
              "Fossil vessel OPEX",
              "$m/yr",
              "type OPEX (1.2)",
              "Same benchmark as green — operating a ship costs the same either way.",
            ],
          ]}
        />

        {/* 5 ---------------------------------------------------------- */}
        <H id="tab-fuel">5. Tab 03 — Fuel</H>
        <p className="mt-2">
          The heart of the comparison: what each side burns and where it comes
          from. Both sides carry the same field set; the interesting choice is
          the green side&apos;s <strong>sourcing</strong>{" "}mode.
        </p>
        <H3>Sourcing modes</H3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Construct plant (legacy)</strong>{" "}— the workbook&apos;s
            default. You pay the merchant fuel price AND production
            CAPEX/O&amp;M. This double-counts production cost by design — it is
            kept for comparability with the workbook and labeled as such in
            the form.
          </li>
          <li>
            <strong>Purchase fuel</strong>{" "}— merchant fuel at the (benchmark or
            overridden) price; production CAPEX and O&amp;M are forced to zero
            — an override cannot resurrect them, exactly as in the workbook.
          </li>
          <li>
            <strong>Named plant (delivered price)</strong>{" "}— you know the
            delivered price; type it directly. Production lines zeroed.
          </li>
          <li>
            <strong>Build here (pick a site on the map)</strong>{" "}— green side
            only. The full Explorer map opens as the center pane; click a
            colored hex, open the cell, and choose{" "}
            <em>&ldquo;Use as corridor fuel site&rdquo;</em>. The delivered
            price is then derived live (see below). Production lines zeroed —
            production cost lives inside the delivered price.
          </li>
        </ul>
        <H3>Build-here: from a map cell to a delivered price</H3>
        <p className="mt-2">The delivered $/t chains three steps:</p>
        <F>
          delivered $/t = synthesis gate price(site LCOH, carrier, config) +
          distance × 1.3 × carrier shipping $/t·km
        </F>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Site LCOH</strong>{" "}— seeded by the picked cell&apos;s
            best-combination 2024 value (the same seeded engine value the
            Explorer shows; masked cells cannot be picked). Freely adjustable
            afterwards.
          </li>
          <li>
            <strong>Synthesis</strong>{" "}— hydrogen at the site LCOH is converted
            to the carrier (e-ammonia, e-methanol or LH2) through a plant
            annuitized at the <em>production-side WACC</em>{" "}— deliberately a
            separate rate from the corridor discount rate — plus synthesis
            electricity and, for e-methanol, a CO2 feedstock price.
          </li>
          <li>
            <strong>Logistics</strong>{" "}— plant→bunker-port distance × a 1.3
            route factor × the carrier&apos;s shipping rate.
          </li>
          <li>
            <strong>Evaluate here</strong>{" "}— from the cell drawer you can open
            the full LCOH calculator, change any production assumption
            (electrolyzer CAPEX, efficiency, financing…), recompute, and press
            &ldquo;Use as corridor fuel site&rdquo; to hand the evaluated LCOH
            back into the corridor.
          </li>
        </ul>
        <p className="mt-2">
          Every knob — site LCOH, production WACC, electricity, CO2 feedstock,
          distance — recomputes the delivered price live; picking any other
          hex moves the site.
        </p>
        <H3>Per-fuel fields (each side)</H3>
        <Fields
          rows={[
            [
              "Fuel type",
              "—",
              "green: e-Ammonia · fossil: LSFO",
              "Selects the fuel's benchmark bundle: price, emission factors, energy density, production/storage/barge costs, vessel premium (§10).",
            ],
            [
              "Fuel price",
              "$/t",
              "e-ammonia 900 · LSFO 594",
              "Merchant price (construct/purchase modes).",
            ],
            [
              "Fuel consumption",
              "t/vessel/yr",
              "derived (distance mode)",
              "Distance mode: 2 × distance × roundtrips × GJ/nm × 1000 / LHV. Defaults: green 2,580.6 t, fossil 1,194.0 t — the green side needs ~2.2× the mass because ammonia carries less energy per tonne.",
            ],
            [
              "CO2 emission factor, combustion",
              "t CO2/t fuel",
              "e-ammonia 0.1 · LSFO 3.3",
              "Tank-to-wake factor: drives ETS, the self-designed CO2 term, and TTW-basis CO2 abated.",
            ],
            [
              "Energy density (LHV)",
              "MJ/t",
              "e-ammonia 18,600 · LSFO 40,200",
              "Converts distance-energy to fuel mass, and fuel mass to energy for FuelEU and 45Z.",
            ],
            [
              "Well-to-wake intensity",
              "gCO2e/MJ",
              "e-ammonia 15 · LSFO 92.4",
              "Lifecycle intensity: drives FuelEU compliance and WTW-basis CO2 abated. Advanced fold.",
            ],
            [
              "Fuel production CAPEX (year 1)",
              "$m",
              "e-ammonia 55 · LSFO 0",
              "Construct mode only; forced to 0 under purchase/named-plant/build-here.",
            ],
            [
              "Fuel production O&M",
              "$m/yr",
              "e-ammonia 3 · LSFO 0",
              "Construct mode only; inflated; forced to 0 otherwise.",
            ],
          ]}
        />

        {/* 6 ---------------------------------------------------------- */}
        <H id="tab-port">6. Tab 04 — Port</H>
        <p className="mt-2">
          Shore-side infrastructure per side: bunkering storage and the barge
          (or pipeline) that moves fuel to the ship. The fossil side assumes
          existing infrastructure: its CAPEX benchmarks are zero and its OPEX
          benchmarks are 30% of the fuel-table values — the workbook&apos;s
          &ldquo;×0.3 existing-infrastructure&rdquo; rule, shown as DERIVED.
        </p>
        <Fields
          rows={[
            [
              "Storage CAPEX",
              "$m",
              "green (e-ammonia) 12 · fossil 0",
              "Year-1 investment in port storage.",
            ],
            [
              "Storage OPEX",
              "$m/yr",
              "green 0.5 · fossil 0.5×0.3 = 0.15… (LSFO: 0)",
              "Annual storage operating cost; inflated.",
            ],
            [
              "Barge CAPEX",
              "$m",
              "green 5 · fossil 0",
              "Year-1 investment in bunkering craft.",
            ],
            [
              "Barge OPEX",
              "$m/yr",
              "green 0.3 · fossil ×0.3 rule",
              "Annual bunkering operating cost; inflated.",
            ],
          ]}
        />

        {/* 7 ---------------------------------------------------------- */}
        <H id="tab-regulation">7. Tab 05 — Regulation</H>
        <p className="mt-2">
          Four schemes, each with its own toggle. All monetary terms use the
          EUR/USD rate (default 1.08) where the scheme is euro-denominated,
          and all are calendar-anchored — moving the start year moves the
          corridor through the schedules.
        </p>

        <H3>EU ETS (maritime)</H3>
        <F>
          ETS cost<sub>t</sub>{" "}= vessels × fuel t × combustion EF × phase-in(cal)
          × scope × EUA € × EURUSD / 10⁶
        </F>
        <p className="mt-2">
          Phase-in: 0 before 2024 → 40% (2024) → 70% (2025) → 100% (2026+).
          Defaults: EUA €80/t, scope 1.0 (fraction of voyages in ETS scope).
          Because it prices <em>combustion</em>{" "}CO2, the green side&apos;s cost
          is tiny (EF 0.1 vs 3.3) — ETS mostly burdens the fossil side, closing
          the gap.
        </p>

        <H3>FuelEU Maritime</H3>
        <F>
          deficit<sub>t</sub>{" "}= max(0, WTW − baseline × (1 − target(cal)))
          <br />
          penalty<sub>t</sub>{" "}= deficit × (vessels × fuel t × LHV) / WTW /
          41,000 × €2,400 × scope × EURUSD / 10⁶
        </F>
        <p className="mt-2">
          The GHG-intensity target ladder tightens from 2% (2025) through 6%
          (2030), 14.5% (2035), 31% (2040), 62% (2045) to 80% (2050), against
          the 91.16 gCO2e/MJ baseline. The max(0,·) clamp means a compliant
          fuel pays exactly zero — e-ammonia at WTW 15 is compliant for the
          whole ladder, which is why the green side&apos;s FuelEU line is
          exactly $0.00m under defaults while LSFO&apos;s grows with every
          step.
        </p>

        <H3>IRA 45Z clean fuel credit (green side only)</H3>
        <F>
          credit<sub>t</sub>{" "}= − vessels × fuel t × (rate $/gal ÷ 122.5 MJ/gal
          × LHV) / 10⁶ &nbsp; (if enabled AND US-produced)
        </F>
        <p className="mt-2">
          A negative cost (income). Default rate $1/gal-equivalent, converted
          through the fuel&apos;s energy content. The workbook has no sunset
          year; the model reproduces that, with an optional
          &ldquo;effective-until&rdquo; divergence flag for realistic
          expiry.
        </p>

        <H3>Self-designed regulation</H3>
        <F>
          cost<sub>t</sub>{" "}= + vessels × t × combEF × CO2 $/t /10⁶ &nbsp;
          (both sides)
          <br />
          &nbsp;&nbsp;− vessels × t × 1000 × support $/kg /10⁶ − capex% ×
          CAPEX<sub>t</sub>{" "}− opex% × OPEX<sub>t</sub>{" "}− other $m &nbsp;
          (green side only)
        </F>
        <p className="mt-2">
          A sandbox for policy design: a carbon price hits both sides in
          proportion to combustion emissions; the four support terms subsidize
          only the green side. Use it to find the CO2 price or subsidy that
          closes the gap.
        </p>

        <H3>Model options</H3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Emissions basis</strong>{" "}— what &ldquo;CO2 abated&rdquo;
            (and $/tCO2) counts: combustion (tank-to-wake, the workbook&apos;s
            convention) or well-to-wake (lifecycle, the app&apos;s default for
            new scenarios). Both tonnages are always reported side by side in
            the results (§8).
          </li>
          <li>
            <strong>Rate basis</strong>{" "}— nominal (workbook: inflation
            escalates costs, the nominal WACC discounts them) or real
            (deflates the OPEX escalation).
          </li>
        </ul>

        {/* 8 ---------------------------------------------------------- */}
        <H id="tab-results">8. Tab 06 — Results</H>
        <p className="mt-2">
          The full report. Every element recomputes on every keystroke; a
          compact summary of the same numbers stays docked on the input tabs.
        </p>
        <H3>KPI strip</H3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Incremental cost gap (PV)</strong>{" "}— the headline: total
            discounted green cost minus total discounted fossil cost.
          </li>
          <li>
            <strong>Per tonne / per TEU of cargo</strong>{" "}— gap × 10⁶ ÷
            lifetime cargo units. The label follows your cargo unit; with TEUs
            the snapshot adds a derived per-tonne-of-cargo figure.
          </li>
          <li>
            <strong>Per tonne CO2 abated</strong>{" "}— gap × 10⁶ ÷ CO2 abated on
            the active emissions basis (chip shows which).
          </li>
          <li>
            <strong>Green / fossil corridor totals</strong>{" "}— each side&apos;s
            full discounted cost.
          </li>
          <li>
            <strong>CO2 abated over lifetime</strong>{" "}— on the active basis.
          </li>
        </ul>
        <H3>Cost bridge (waterfall)</H3>
        <p className="mt-2">
          Reads left to right: the fossil corridor total, then what changes
          when you go green — ΔCAPEX (new vessels, production plant, port
          assets), ΔOPEX (fuel bill and operations), ΔRegulation (usually
          negative: ETS and FuelEU burden the fossil side) — landing on the
          green corridor total. Red bars push the cost up, blue bars pull it
          down, gray bars are the anchored totals, and the final dark-blue bar
          is the <strong>green premium</strong>{" "}— the gap itself, spanning
          fossil total → green total.
        </p>
        <H3>Cost decomposition table</H3>
        <p className="mt-2">
          The same information as exact numbers: green | fossil | Δ for CAPEX,
          operating cost and each regulation scheme, with the signed Δ column
          in the waterfall&apos;s colors. The total row is the gap. IRA 45Z
          shows &ldquo;—&rdquo; on the fossil side — the credit does not exist
          there.
        </p>
        <H3>Charts</H3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Annual cost, green vs fossil</strong>{" "}— undiscounted cost
            per year. The green spike in year 1 is CAPEX (production plant +
            vessel + port); the following years show the fuel-bill difference
            and the slow drift from inflation and the FuelEU ladder.
          </li>
          <li>
            <strong>Cumulative discounted gap</strong>{" "}— the year-by-year PV
            difference accumulated: how the headline gap builds over the
            corridor&apos;s life. If regulation ever flips the annual
            difference negative, this curve bends down — the break-even
            signal.
          </li>
          <li>
            <strong>Abatement cost vs carbon price</strong>{" "}— the premium per
            tonne of CO2 avoided on each basis, next to your EU ETS allowance
            price as a dashed line: how far above the market price of carbon
            this corridor&apos;s abatement currently is.
          </li>
        </ul>
        <H3>Tables &amp; snapshot</H3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Regulatory impact (PV)</strong>{" "}— each scheme&apos;s
            discounted total per side, and the net regulatory effect on the
            gap (negative = regulation narrows it).
          </li>
          <li>
            <strong>Emissions &amp; abatement</strong>{" "}— CO2 abated and
            abatement cost on BOTH bases (combustion and well-to-wake), the
            model&apos;s active basis tagged.
          </li>
          <li>
            <strong>Scenario snapshot</strong>{" "}— the inputs that produced the
            report: route, ports, cargo unit &amp; weight, horizon, fleet,
            fuels &amp; sourcing, derived fuel use per vessel-year, lifetime
            cargo. Makes an exported screenshot self-describing.
          </li>
        </ul>

        {/* 9 ---------------------------------------------------------- */}
        <H id="engine">9. The engine: formulas</H>
        <p className="mt-2">
          One pure function evaluates a side; the green/fossil asymmetries are
          data, not code branches. Per modelled year t (idx 1…horizon, cal =
          start year + t − 1, infl = (1+inflation)^(t−1)):
        </p>
        <F>
          CAPEX<sub>t</sub>{" "}= (t = 1) ? fuelProd + storage + barge + vessel : 0
          <br />
          OPEX<sub>t</sub>{" "}= fuel purchase + prod O&amp;M + storage O&amp;M +
          barge O&amp;M + vessel O&amp;M &nbsp;(each × infl)
          <br />
          fuel purchase<sub>t</sub>{" "}= vessels × fuel t/yr × price $/t / 10⁶ ×
          infl
          <br />
          total<sub>t</sub>{" "}= CAPEX<sub>t</sub>{" "}+ OPEX<sub>t</sub>{" "}+ ETS
          <sub>t</sub>{" "}+ FuelEU<sub>t</sub>{" "}+ 45Z<sub>t</sub>{" "}+ self
          <sub>t</sub>
          <br />
          PV<sub>t</sub>{" "}= total<sub>t</sub>{" "}× df<sub>t</sub>, &nbsp;df
          <sub>t</sub>{" "}= 1/(1+WACC)^(t−1) &nbsp;(df₁ = 1 exactly)
        </F>
        <F>
          CO2 abated<sub>t</sub>{" "}= vessels × (fossil t × fossil EF − green t ×
          green EF) &nbsp;[active basis factors]
          <br />
          $/unit = gap × 10⁶ / (units per year × horizon)
          <br />
          $/tCO2 = gap × 10⁶ / Σ CO2 abated
        </F>
        <p className="mt-2">
          Derived benchmarks (the DERIVED badges): distance-mode consumption{" "}
          <code className="mx-1">
            2 × nm × roundtrips × GJ/nm × 1000 / LHV
          </code>
          ; green vessel CAPEX{" "}
          <code className="mx-1">type CAPEX × (1 + premium)</code>; fossil
          vessel/storage/barge CAPEX = 0 and logistics OPEX × 0.3
          (existing-infrastructure rules). Purchase-type sourcing forces
          production lines to zero with precedence over overrides.
        </p>
        <p className="mt-2">
          The costs decompose exactly: the six per-year lines sum to the total
          by construction, the waterfall&apos;s Δ terms are differences of the
          decomposition lines, and the decomposition&apos;s total row equals
          the headline gap to the last digit.
        </p>

        {/* 10 --------------------------------------------------------- */}
        <H id="reference-data">10. Reference data</H>
        <H3>Vessel types (CAPEX $m · OPEX $m/yr · fuel t/yr · GJ/nm)</H3>
        <div className="my-3 overflow-x-auto">
          <table className="w-full border border-neutral-300 text-[13px] tabular-nums">
            <thead>
              <tr className="border-b border-neutral-300 bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 text-right font-medium">CAPEX</th>
                <th className="px-3 py-2 text-right font-medium">OPEX</th>
                <th className="px-3 py-2 text-right font-medium">Fuel t/yr</th>
                <th className="px-3 py-2 text-right font-medium">GJ/nm</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Tanker (35k dwt)", 20, 1.2, "2,400", 4],
                  ["Tanker (80k dwt)", 35, 2, "5,200", 7],
                  ["Bulk carrier (60k dwt)", 25, 1.5, "3,000", 5],
                  ["Container (5k TEU)", 45, 2.8, "6,500", 6],
                  ["Container (15k TEU)", 90, 5, "14,000", 10],
                  ["Ro-Ro / Ferry", 30, 2, "3,500", 4.5],
                ] as const
              ).map(([label, capex, opex, cons, gj]) => (
                <tr key={label} className="border-b border-neutral-200 last:border-0">
                  <td className="px-3 py-1.5">{label}</td>
                  <td className="px-3 py-1.5 text-right">{capex}</td>
                  <td className="px-3 py-1.5 text-right">{opex}</td>
                  <td className="px-3 py-1.5 text-right">{cons}</td>
                  <td className="px-3 py-1.5 text-right">{gj}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <H3>
          Fuels (price $/t · combustion EF tCO2/t · LHV MJ/t · WTW gCO2e/MJ ·
          vessel premium)
        </H3>
        <div className="my-3 overflow-x-auto">
          <table className="w-full border border-neutral-300 text-[13px] tabular-nums">
            <thead>
              <tr className="border-b border-neutral-300 bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th className="px-3 py-2 font-medium">Fuel</th>
                <th className="px-3 py-2 text-right font-medium">Price</th>
                <th className="px-3 py-2 text-right font-medium">Comb. EF</th>
                <th className="px-3 py-2 text-right font-medium">LHV</th>
                <th className="px-3 py-2 text-right font-medium">WTW</th>
                <th className="px-3 py-2 text-right font-medium">Premium</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["LSFO (conventional)", 594, 3.3, "40,200", 92.4, "—"],
                  ["LNG", 550, 2.75, "48,000", 84, "+10%"],
                  ["e-Ammonia", 900, 0.1, "18,600", 15, "+25%"],
                  ["e-Methanol", 850, 0.2, "19,900", 15, "+15%"],
                  ["Biodiesel / HVO", "1,100", 0.3, "44,000", 25, "+5%"],
                  ["Hydrogen (liquid)", "1,200", 0, "120,000", 10, "+30%"],
                ] as const
              ).map(([label, price, ef, lhv, wtw, prem]) => (
                <tr key={label} className="border-b border-neutral-200 last:border-0">
                  <td className="px-3 py-1.5">{label}</td>
                  <td className="px-3 py-1.5 text-right">{price}</td>
                  <td className="px-3 py-1.5 text-right">{ef}</td>
                  <td className="px-3 py-1.5 text-right">{lhv}</td>
                  <td className="px-3 py-1.5 text-right">{wtw}</td>
                  <td className="px-3 py-1.5 text-right">{prem}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2">
          Fuel tables also carry per-fuel production CAPEX/O&amp;M and
          storage/barge cost benchmarks (e.g. e-ammonia: 55 / 3 / 12 / 0.5 / 5
          / 0.3 $m-terms). Country WACC benchmarks: Denmark and Netherlands
          5.5%, Singapore 6%, United States 7%, generic/other 8%, India 9.5%,
          Brazil 11.5% — all flagged <em>unverified</em>{" "}per the workbook.
          Regulation defaults: EUA €80/t, EUR/USD 1.08, FuelEU penalty
          €2,400/t VLSFO-eq, VLSFO 41,000 MJ/t, baseline 91.16 gCO2e/MJ, 45Z
          $1/gal at 122.5 MJ/gal.
        </p>

        {/* 11 --------------------------------------------------------- */}
        <H id="sensitivity">11. What moves the result</H>
        <p className="mt-2">
          A one-at-a-time sweep from the default baseline, each input across
          its plausible range, ranked by maximum movement of the headline gap.
          This ranking decides which fields render top-level vs in the
          Advanced fold:
        </p>
        <div className="my-3 overflow-x-auto">
          <table className="w-full border border-neutral-300 text-[13px] tabular-nums">
            <thead>
              <tr className="border-b border-neutral-300 bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Input</th>
                <th className="px-3 py-2 text-right font-medium">Max gap movement</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  [1, "Corridor length (one-way distance)", "74.1%"],
                  [2, "Green vessel CAPEX", "56.9%"],
                  [3, "Green vessel OPEX", "42.5%"],
                  [4, "Green fuel production CAPEX", "32.9%"],
                  [5, "Number of vessels", "32.9%"],
                  [6, "Green fuel production O&M", "26.6%"],
                  [7, "Green fuel consumption", "21.1%"],
                  [8, "Years modelled", "17.6%"],
                  [9, "Discount rate (WACC)", "14.6%"],
                  [10, "Inflation rate", "14.0%"],
                ] as const
              ).map(([rank, label, move]) => (
                <tr key={rank} className="border-b border-neutral-200 last:border-0">
                  <td className="px-3 py-1.5">{rank}</td>
                  <td className="px-3 py-1.5">{label}</td>
                  <td className="px-3 py-1.5 text-right">{move}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2">
          Distance dominates because it drives the green fuel bill through
          derived consumption; regulation parameters (ETS/FuelEU, ranks
          16–22) move the gap by only a few percent under defaults — they
          matter far more at high carbon prices or late start years.
        </p>

        {/* 12 --------------------------------------------------------- */}
        <H id="provenance">12. Provenance, versions &amp; limits</H>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Source of truth</strong>{" "}— the{" "}
            <em>Green Corridor Model Simplified</em>{" "}workbook (sha256
            d3b219…38fbd), transcribed cell by cell. A frozen golden fixture
            pins the engine to the workbook&apos;s cached values at 10⁻⁹
            relative tolerance: gap $166.95m, green total $205.60m, fossil
            $38.64m, $377/unit, all 20 years of every per-year line.
          </li>
          <li>
            <strong>Deliberate quirks preserved</strong>{" "}— construct-mode
            double counting; no 45Z sunset; cargo throughput not linked to
            fuel burn; TTW as the workbook&apos;s abatement basis. Deviations
            are opt-in flags with the workbook behavior as default.
          </li>
          <li>
            <strong>Schema versioning</strong>{" "}— scenarios carry a schema
            version (currently 2); older exports are migrated on load through
            an append-only migration registry.
          </li>
          <li>
            <strong>Not modelled</strong>{" "}— port congestion, vessel routing,
            fuel-price trajectories over time (prices escalate with general
            inflation only), carbon-price trajectories, residual vessel value,
            financing structure beyond a single WACC.
          </li>
          <li>
            <strong>Disclaimer</strong>{" "}— outputs are estimates from public
            benchmarks and your inputs, not investment, legal or regulatory
            advice; unverified benchmarks are flagged in the UI. Verify
            against primary sources before committing capital.
          </li>
        </ul>

        {/* 13 --------------------------------------------------------- */}
        <H id="inputs">13. Complete input inventory</H>
        <p className="mt-2">
          Every field a scenario carries — the machine-complete list,
          generated from the validation schema and joined with the
          sensitivity sweep (§11). <em>Required&nbsp;=&nbsp;no</em>{" "}
          marks optional additions that older scenarios may omit;{" "}
          <em>nullable</em>{" "}
          override fields use <code>null</code>{" "}
          to mean &ldquo;use the benchmark&rdquo;. Placement{" "}
          <em>top-level</em>{" "}
          = the field moved the headline gap ≥5% and renders prominently;{" "}
          <em>advanced</em>{" "}
          = it lives in the tab&apos;s Advanced fold; &ldquo;—&rdquo; = not
          swept (selectors, toggles, descriptive fields) or rendered by its
          own dedicated control.
        </p>
        <div className="my-3 overflow-x-auto">
          <table className="w-full border border-neutral-300 text-xs">
            <thead>
              <tr className="border-b border-neutral-300 bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th className="px-3 py-2 font-medium">Field</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Req.</th>
                <th className="px-3 py-2 font-medium">Rank</th>
                <th className="px-3 py-2 text-right font-medium">Max gap movement</th>
                <th className="px-3 py-2 font-medium">Placement</th>
              </tr>
            </thead>
            <tbody>
              {ALL_INPUTS.map(([field, type, req, rank, move, place]) => (
                <tr key={field} className="border-b border-neutral-200 last:border-0">
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono">{field}</td>
                  <td className="px-3 py-1.5 font-mono text-neutral-600">{type}</td>
                  <td className="px-3 py-1.5">{req}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{rank}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{move}</td>
                  <td className="px-3 py-1.5">{place}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-neutral-600">
          The <code>green.buildHere</code> / <code>fossil.buildHere</code>{" "}
          object stores the map-pick lineage: cell id, coordinates, site LCOH,
          carrier, synthesis gate price, distance to port and logistics cost.
          The canonical, always-current version of this table is generated
          into <code>docs/corridor/field-reference.md</code>{" "}
          in the repository — CI fails if it drifts from the schema.
        </p>
      </main>
      <Footer />
    </>
  );
}
