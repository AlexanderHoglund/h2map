import Footer from "@/components/shell/Footer";
import { requireAccess } from "@/lib/server/access";
import TopBar from "@/components/shell/TopBar";

export const metadata = {
  title: "Documentation — Thaduberg",
  description:
    "Complete documentation of the Green Corridor cost model and the LCOH methodology behind it: every tab, field and formula, plus the full method for the levelized cost of hydrogen that prices a build-here site.",
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
  ["tab-financing", "7. Tab 05 — Financing"],
  ["tab-regulation", "8. Tab 06 — Regulation"],
  ["tab-results", "9. Tab 07 — Results"],
  ["engine", "10. The engine: formulas"],
  ["reference-data", "11. Reference data"],
  ["sensitivity", "12. What moves the result"],
  ["provenance", "13. Provenance, versions & limits"],
  ["inputs", "14. Complete input inventory"],
];

/** Part 2 — the LCOH methodology (the engine that prices a build-here site). */
const TOC_METHOD: [string, string][] = [
  ["m-overview", "15. Overview & system boundary"],
  ["m-hydrogen", "16. Hydrogen from electricity"],
  ["m-profiles", "17. Resource profiles (capacity factors)"],
  ["m-dispatch", "18. Hourly dispatch"],
  ["m-degradation", "19. Degradation & stack replacement"],
  ["m-lcoh", "20. The LCOH formula"],
  ["m-lcoe", "21. Electricity pricing (LCOE)"],
  ["m-emissions", "22. Emissions ledger"],
  ["m-constants", "23. Constants & reference defaults"],
  ["m-map", "24. The map's configuration"],
  ["m-costyears", "25. Cost-year projections"],
  ["m-defaults", "26. Country defaults"],
  ["m-verification", "27. Verification"],
  ["m-validation", "28. Validation"],
  ["m-limitations", "29. Limitations"],
  ["m-sources", "30. Sources"],
];

/**
 * Every scenario input, verbatim from the generated schema reference
 * (docs/corridor/field-reference.md — zod schema joined with the
 * sensitivity artifact; CI fails on drift). Columns: path, type,
 * required, sensitivity rank, max headline movement, UI placement.
 */
const ALL_INPUTS: [string, string, string, string, string, string][] = [
  ["schemaVersion", "= 5", "yes", "—", "—", "—"],
  ["refBundleId", "string", "yes", "—", "—", "—"],
  ["cargo.countryId", "string", "yes", "—", "—", "—"],
  ["cargo.routeType", '"point-to-point" | "single-point"', "yes", "—", "—", "—"],
  ["cargo.oneWayDistanceNm", "number", "yes", "#1", "74.1%", "top-level"],
  ["cargo.startYear", "integer", "yes", "—", "—", "—"],
  ["cargo.horizonYears", "integer", "yes", "#8", "17.6%", "top-level"],
  ["cargo.unitsPerYear", "number", "yes", "#26", "0.0%", "advanced"],
  ["cargo.inflation", "number", "yes", "#11", "14.0%", "top-level"],
  ["cargo.vessels", "integer", "yes", "#5", "32.9%", "top-level"],
  ["cargo.roundtripsPerYear", "number", "yes", "#15", "8.2%", "top-level"],
  ["cargo.waccOverride", "number | null", "yes", "#10", "14.6%", "top-level"],
  ["cargo.unit", '"tonne" | "teu"', "no", "—", "—", "—"],
  ["cargo.unitWeightTonnes", "number", "no", "—", "—", "—"],
  ["cargo.portAName", "string", "no", "—", "—", "—"],
  ["cargo.portACoords", "{ lat, lon }", "no", "—", "—", "advanced"],
  ["cargo.portBName", "string", "no", "—", "—", "—"],
  ["cargo.countryBId", "string", "no", "—", "—", "—"],
  ["vessel.typeId", "string", "yes", "—", "—", "—"],
  ["vessel.consumptionMode", '"distance" | "vessel-benchmark"', "yes", "—", "—", "—"],
  ["vessel.green.capexUsdM", "number | null", "yes", "#2", "56.9%", "top-level"],
  ["vessel.green.opexUsdMPerYear", "number | null", "yes", "#3", "42.5%", "top-level"],
  ["vessel.fossil.capexUsdM", "number | null", "yes", "—", "—", "—"],
  ["vessel.fossil.opexUsdMPerYear", "number | null", "yes", "—", "—", "—"],
  ["green.fuelId", "string", "yes", "—", "—", "—"],
  ["green.sourcing", '"purchase" | "build-plant" | "build-here"', "yes", "—", "—", "—"],
  ["green.buildHere", "object | null", "no", "—", "—", "—"],
  ["green.overrides.priceUsdPerTonne", "number | null", "yes", "#12", "13.7%", "top-level"],
  ["green.overrides.combustionEfTco2PerTonne", "number | null", "yes", "—", "—", "—"],
  ["green.overrides.lhvMjPerTonne", "number | null", "yes", "—", "—", "—"],
  ["green.overrides.wtwGco2PerMj", "number | null", "yes", "#25", "0.2%", "advanced"],
  ["green.overrides.fuelTonnesPerVesselYear", "number | null", "yes", "#7", "21.1%", "top-level"],
  ["green.overrides.prodCapexUsdM", "number | null", "yes", "#4", "32.9%", "top-level"],
  ["green.overrides.prodOpexUsdMPerYear", "number | null", "yes", "#6", "26.6%", "top-level"],
  ["green.overrides.portStorageCapexUsdM", "number | null", "yes", "#13", "10.8%", "top-level"],
  ["green.overrides.portStorageOpexUsdMPerYear", "number | null", "yes", "#14", "8.9%", "top-level"],
  ["green.overrides.bargeCapexUsdM", "number | null", "yes", "#16", "4.2%", "advanced"],
  ["green.overrides.bargeOpexUsdMPerYear", "number | null", "yes", "—", "—", "—"],
  ["fossil.fuelId", "string", "yes", "—", "—", "—"],
  ["fossil.sourcing", '"purchase" | "build-plant" | "build-here"', "yes", "—", "—", "—"],
  ["fossil.buildHere", "object | null", "no", "—", "—", "—"],
  ["fossil.overrides.priceUsdPerTonne", "number | null", "yes", "#20", "3.2%", "advanced"],
  ["fossil.overrides.combustionEfTco2PerTonne", "number | null", "yes", "—", "—", "—"],
  ["fossil.overrides.lhvMjPerTonne", "number | null", "yes", "—", "—", "—"],
  ["fossil.overrides.wtwGco2PerMj", "number | null", "yes", "#23", "1.9%", "advanced"],
  ["fossil.overrides.fuelTonnesPerVesselYear", "number | null", "yes", "—", "—", "—"],
  ["fossil.overrides.prodCapexUsdM", "number | null", "yes", "—", "—", "—"],
  ["fossil.overrides.prodOpexUsdMPerYear", "number | null", "yes", "—", "—", "—"],
  ["fossil.overrides.portStorageCapexUsdM", "number | null", "yes", "—", "—", "—"],
  ["fossil.overrides.portStorageOpexUsdMPerYear", "number | null", "yes", "—", "—", "—"],
  ["fossil.overrides.bargeCapexUsdM", "number | null", "yes", "—", "—", "—"],
  ["fossil.overrides.bargeOpexUsdMPerYear", "number | null", "yes", "—", "—", "—"],
  ["regulation.eurUsd", "number", "yes", "#24", "1.2%", "advanced"],
  ["regulation.ets.enabled", "boolean", "yes", "—", "—", "—"],
  ["regulation.ets.euaEurPerTonne", "number", "yes", "#19", "3.6%", "advanced"],
  ["regulation.ets.euaEscalation", "number", "no", "—", "—", "—"],
  ["regulation.ets.scope", "number 0–1", "yes", "#22", "2.4%", "advanced"],
  ["regulation.ets.gasCoverage.enabled", "boolean", "yes", "—", "—", "—"],
  ["regulation.ets.gasCoverage.fromCalendarYear", "integer", "yes", "—", "—", "—"],
  ["regulation.ets.gasCoverage.gwpCh4", "number", "yes", "—", "—", "—"],
  ["regulation.ets.gasCoverage.gwpN2o", "number", "yes", "—", "—", "—"],
  ["regulation.ets.gasCoverage.green.ch4TPerTonne", "number", "yes", "—", "—", "—"],
  ["regulation.ets.gasCoverage.green.n2oTPerTonne", "number", "yes", "—", "—", "—"],
  ["regulation.ets.gasCoverage.fossil.ch4TPerTonne", "number", "yes", "—", "—", "—"],
  ["regulation.ets.gasCoverage.fossil.n2oTPerTonne", "number", "yes", "—", "—", "—"],
  ["regulation.fuelEu.enabled", "boolean", "yes", "—", "—", "—"],
  ["regulation.fuelEu.penaltyEurPerTonne", "number", "yes", "#18", "3.7%", "advanced"],
  ["regulation.fuelEu.vlsfoMjPerTonne", "number", "yes", "—", "—", "—"],
  ["regulation.fuelEu.baselineGco2PerMj", "number", "yes", "—", "—", "—"],
  ["regulation.fuelEu.scope", "number 0–1", "yes", "#17", "3.7%", "advanced"],
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
  ["regulation.selfDesigned.co2PriceEscalation", "number", "no", "—", "—", "advanced"],
  ["regulation.selfDesigned.supportUsdPerKg", "number", "yes", "—", "—", "—"],
  ["regulation.selfDesigned.capexSupport", "number 0–1", "yes", "—", "—", "—"],
  ["regulation.selfDesigned.opexSupport", "number 0–1", "yes", "—", "—", "—"],
  ["regulation.selfDesigned.otherUsdM", "number", "yes", "—", "—", "—"],
  ["regulation.imoNetZero.enabled", "boolean", "yes", "—", "—", "—"],
  ["regulation.imoNetZero.scope", "number 0–1", "yes", "—", "—", "—"],
  ["regulation.imoNetZero.rewardUsdPerTonneCo2e", "number", "no", "—", "—", "—"],
  ["regulation.imoNetZero.priceEscalation", "number", "no", "—", "—", "—"],
  ["financing.enabled", "boolean", "yes", "—", "—", "—"],
  ["financing.greenRate", "number 0–1", "yes", "#9", "14.7%", "top-level"],
  ["financing.baseRate", "number 0–1", "yes", "—", "—", "—"],
  ["financing.debtShare", "number 0–1", "yes", "—", "—", "—"],
  ["financing.tenorYears", "integer 1–40", "yes", "—", "—", "—"],
  ["financing.structure", '"amortizing" | "bullet"', "yes", "—", "—", "—"],
  ["capitalPhasing.enabled", "boolean", "yes", "—", "—", "—"],
  ["capitalPhasing.green.weights", "number[] (sum = 1)", "yes", "#21", "3.0%", "advanced"],
  ["capitalPhasing.fossil.weights", "number[] (sum = 1)", "yes", "—", "—", "—"],
  ["flags.legacyExcelConstruct", "boolean", "no", "—", "—", "—"],
  ['flags.emissionsBasis', '"combustion" | "wellToWake"', "no", "—", "—", "—"],
  ['flags.rateBasis', '"nominal" | "real"', "no", "—", "—", "—"],
];

export default async function DocsPage() {
  await requireAccess("/docs");
  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-4xl px-4 py-10 text-sm leading-6 text-neutral-800">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
          Green Corridor cost model — documentation &amp; methodology
        </h1>
        <p className="mt-2 text-neutral-600">
          The complete reference for the Thaduberg corridor model: every tab,
          every field, every formula. The model evaluates a green shipping
          corridor as the <strong>net-present-value cost gap</strong>{" "}between
          running the corridor on a green fuel versus a fossil fuel, with EU
          ETS, FuelEU Maritime, IRA&nbsp;45Z and self-designed regulation
          layered on top. The engine is pinned to a frozen reference case at 10
          significant digits, so a change that moves a number is always
          deliberate. The app&apos;s DEFAULT scenario is a real published
          case: the{" "}
          <strong>Chilean copper-concentrate green corridor</strong>{" "}
          (MMMCZCS, Sep 2025 — Sumitomo, Interacid, NYK, Codelco, MMMCZCS):
          Mejillones → Japan, 25 Mt of concentrate over 15 years on ten
          ammonia dual-fuel Handymax bulkers (§13).
        </p>

        <nav className="mt-6 border border-neutral-300 bg-white p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Contents
          </p>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            Part 1 · The Green Corridor model
          </p>
          <ol className="mt-1 grid gap-x-6 gap-y-1 sm:grid-cols-2">
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
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            Part 2 · LCOH methodology
          </p>
          <ol className="mt-1 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {TOC_METHOD.map(([id, label]) => (
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
          Every numeric input follows one resolution convention:{" "}
          <em>value used = your override if given, else the benchmark</em>. The interface shows where each number comes from with
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
            <strong>unverified benchmark</strong>{" "}— the reference data flags
            the value as illustrative, not sourced (all country WACCs carry
            this).
          </li>
        </ul>
        <p className="mt-2">
          Two view modes:{" "}
          <strong>Simplified</strong>{" "}(the default) shows only the inputs
          essential to describing a corridor — the structural choices (route,
          countries and ports, fuels, vessel type, cargo, horizon, module
          toggles) plus the fields whose sensitivity sweep moves the headline
          gap by ≥5% (§12).{" "}
          <strong>Standard</strong>{" "}shows everything. Every hidden field
          keeps its default or benchmark value — the mode never changes a
          number — and each section shows a counted strip naming how many
          hidden settings are in effect, one click from review. Placement is
          not editorial: the sweep decides it.
        </p>

        {/* 2 ---------------------------------------------------------- */}
        <H id="workflow">2. Accounts &amp; working with scenarios</H>
        <p className="mt-2">
          The platform sits behind a sign-in: request access on the home page
          (granted automatically once you confirm your email), or sign in
          with an existing account. Teaching and trial accounts are
          time-limited — at the end of the access period the platform locks
          with a contact screen, your saved scenarios are kept, and an
          extension restores everything exactly as it was.
        </p>
        <p className="mt-2">
          <strong>Projects first.</strong>{" "}The platform always opens on the
          Projects tab; the input tabs unlock once a project is selected or
          created. Every account starts with two projects, created once and
          never re-created: the{" "}
          <em>Chilean copper corridor example</em>{" "}(the published reference
          case, opening in Standard) and{" "}
          <em>My first corridor</em>{" "}(a blank starter — generic route,
          benchmark costs, every scheme off — opening in Simplified).
          Creating a new project asks for a name and whether it starts in
          Simplified or Standard; the choice is stored on the project and any
          project can switch between the two at any time from the header —
          the mode is remembered per project, across devices.
        </p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Draft autosave</strong>{" "}— every change is saved locally in
            your browser as the working copy of the current project;
            returning to the app offers to continue it from the Projects
            tab. Opening another project replaces the working copy — the app
            asks before discarding unsaved changes.
          </li>
          <li>
            <strong>Save / Duplicate</strong>{" "}— the scenario bar stores the
            current scenario to your account (server-validated, with the
            engine and reference-data versions pinned). Save updates the
            loaded scenario; Duplicate makes a copy. The URL then carries the
            scenario id, so a bookmark reopens it.
          </li>
          <li>
            <strong>Open / Manage</strong>{" "}— Open loads a saved scenario
            (loading under a newer schema or engine is announced, never
            silent). Manage lists all of your scenarios with load, share-link
            copy/revoke and <strong>delete</strong>{" "}(with confirmation).
          </li>
          <li>
            <strong>Share</strong>{" "}— creates a read-only link
            (/corridor/s/…) anyone can open without an account; the
            unguessable token is the access, and revoking it kills the link.
            Shared views show the stored results with an explicit
            recompute-under-current-model option.
          </li>
          <li>
            <strong>Field-level diff</strong>{" "}— compare the current draft
            against any saved scenario: every differing input plus the
            headline-gap delta.
          </li>
          <li>
            <strong>Export / Import JSON</strong>{" "}— the scenario bar downloads
            the full scenario as a versioned JSON file and can load one back.
            Files carry a schema version; older files are migrated on load.
          </li>
          <li>
            <strong>Reset</strong>{" "}— returns every field to the reference
            defaults (with confirmation).
          </li>
          <li>
            <strong>Navigation</strong>{" "}— the seven tabs in the top bar are free
            navigation; Back/Next at the bottom of each form walks them in
            order. The Results tab (§9) holds the full report; a compact live
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
              "Mejillones / Japan (Asia)",
              "Named berths for the corridor. Shown in the results snapshot; free text.",
            ],
            [
              "Country (port A)",
              "—",
              "Chile (default)",
              "THE anchor input: selects the financing (WACC) benchmark. Denmark, Netherlands, India, Brazil, Singapore and the United States carry their own reference benchmarks (5.5–11.5%); any other country uses the generic 8% benchmark. All are flagged unverified.",
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
              "9,500 (default)",
              "One-way distance. Drives distance-mode fuel consumption (×2 per roundtrip). The single most sensitive input in the model (§12).",
            ],
            [
              "Model start year",
              "year",
              "2030 (default)",
              "Calendar year of year 1. Matters for the regulation schedules: the ETS phase-in and the FuelEU target ladder are calendar-anchored (§8).",
            ],
            [
              "Years modelled",
              "yr",
              "15 (default; max 40)",
              "The horizon. Costs and cargo beyond it are not counted.",
            ],
            [
              "Annual cargo throughput",
              "units/yr",
              "1,650,000 (default)",
              "Only feeds the per-unit figures and lifetime cargo — it is NOT linked to fuel burn or vessel counts; the model keeps them independent. Advanced fold.",
            ],
            [
              "Discount rate (WACC)",
              "fraction",
              "0.08 (study override; else country benchmark)",
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
          The ships that serve the corridor. One vessel type is shared by
          both sides. <strong>The CAPEX/OPEX cells are FLEET totals</strong>{" "}
          — the vessel count multiplies fuel burn and regulation only, never
          these cells (the field labels say
          &ldquo;Fleet&rdquo;). The default scenario costs both fleets as
          newbuilds: green 10 × $44m = $440m, fossil 10 × $35m = $350m.
        </p>
        <Fields
          rows={[
            [
              "Vessel type",
              "—",
              "Handymax bulk (58k dwt), default",
              "Sets the benchmark CAPEX/OPEX, the benchmark annual fuel burn, and the energy-per-mile figure used by distance-mode consumption. Six types from tanker to 15k-TEU container ship (§11).",
            ],
            [
              "Consumption basis",
              "—",
              "vessel benchmark (default)",
              "Distance: fuel burn is derived from corridor length × roundtrips × the vessel's GJ/nm, divided by each fuel's energy density. Vessel benchmark: use the type's flat tonnes-per-year figure instead.",
            ],
            [
              "Number of vessels",
              "ships",
              "10 (default)",
              "Multiplies fuel burn and every regulation term — NOT the fleet CAPEX/OPEX cells.",
            ],
            [
              "Roundtrips per year",
              "1/yr",
              "3 (default)",
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
              "benchmark 0 · default 350",
              "The reference benchmark encodes 'existing baseline fleet' (zero). The Chilean default OVERRIDES it: the study costs a fossil newbuild fleet too.",
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
        <H3>Sourcing modes (schema v4)</H3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Purchase fuel</strong>{" "}— fuel bought at a price:
            the benchmark market price, or your own number as an override — a
            market assumption and a contracted delivered price are the same
            arithmetic, so both live here (schema v4 removed the separate
            &ldquo;named plant&rdquo; mode that only differed in labeling).
            Production CAPEX and O&amp;M are forced to zero — an override
            cannot resurrect them.
          </li>
          <li>
            <strong>Build a dedicated plant</strong>{" "}— the corridor pays the
            plant&apos;s capital and operating cost directly (production
            CAPEX/O&amp;M lines); the fuel price row is forced to zero so
            production cost is never charged twice. The Chilean default uses
            this mode with the study&apos;s fitted block ($1,100m /
            $72m/yr).
          </li>
          <li>
            <strong>Build here (pick a site on the map)</strong>{" "}— green side
            only. Same economics as build-plant — the SAME production
            CAPEX/OPEX lines — but the numbers come from evaluating a real
            site: the Explorer map opens, you click a hex, and{" "}
            <em>&ldquo;Use as corridor fuel site&rdquo;</em>{" "}launches the full
            LCOH calculator at that cell. The map tile&apos;s $/kg is only a
            guide for where to click; it never enters the corridor numbers.
          </li>
        </ul>
        <p className="mt-2">
          Scenarios saved before v3 in the legacy Construct mode (merchant
          price AND production CAPEX — a deliberate double-count in the
          original source) migrate to build-plant; if the price row was live,
          a dismissable banner flags it and the price row stays visible for
          comparison. Scenarios saved at v3
          with the named-plant mode migrate to purchase with the contract
          price carried over as a price override — identical numbers.
        </p>
        <H3>Build-here: from an evaluated site to the cost structure</H3>
        <p className="mt-2">
          The evaluation hands back the LCOH engine&apos;s full cost structure
          (capital, year-1 operating, year-1 hydrogen output, rate, life) and
          the corridor decomposes it into <strong>five components</strong>,
          each a derived seed you can override independently (the derived
          value stays as the restorable benchmark):
        </p>
        <F>
          prod CAPEX = H2 plant capital + synthesis plant capital{"   "}·{"   "}
          prod OPEX = H2 operating + synthesis operating + plant→port
          logistics
        </F>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Sizing</strong>{" "}— the plant is sized to the corridor, not
            the tile: nameplate = corridor demand × 1.05 margin (57,000 t/yr →
            59,850 t/yr for the Chilean default). The H2 block scales linearly
            from the evaluated configuration; the surplus is reported, never
            apportioned away.
          </li>
          <li>
            <strong>Synthesis scale correction</strong>{" "}— the synthesis
            benchmark is anchored to NEOM Green Hydrogen ($8.4bn / 1.2 Mt
            NH₃/yr, FID 2023), net of the electrolyser island and dedicated
            renewables that the LCOH engine prices separately, giving
            $1,400/tpa at 1.2 Mt/yr. A corridor-scale plant costs more per
            tonne:{" "}
            <code>(nameplate / 1.2Mt)^(0.6−1) × FOAK</code>. At 60 kt/yr that
            is ×3.31 on synthesis capital. A ~60 kt plant sits ~20× below the
            reference scale, so the six-tenths rule is being stretched well
            past its comfortable range — anything beyond 5× is flagged in the
            lineage.
          </li>
          <li>
            <strong>Firm power</strong>{" "}— a solar site runs its electrolyser
            around 30% of the year, but conventional Haber-Bosch has a 40–60%
            minimum load and is not commercially flexible, so an ammonia plant
            needs roughly 85% duty. Where the evaluated site falls short the
            model does <em>not</em>{" "}silently produce the carrier: it prices
            the cheapest way to close the gap — an H₂ buffer plus oversized
            plant (capital), firm round-the-clock power (the step from
            solar-shaped to firm, operating), or a grid top-up (operating,
            and it carries the grid&apos;s CO₂ into the ledger). The chosen
            strategy and its cost are always shown, and you can switch it.
          </li>
          <li>
            <strong>Logistics</strong>{" "}— great-circle plant→port distance
            (from the pinned Port A coordinates) × 1.3 route factor × the
            carrier&apos;s <em>inland</em>{" "}$/t·km. This first mile is road,
            rail or short pipeline — about ten times the deep-sea freight rate,
            which is a separate number.
          </li>
          <li>
            <strong>Rates</strong>{" "}— the corridor discounts the raw
            CAPEX/OPEX lines on its own timeline at its own WACC. The LCOH
            engine&apos;s internal discount rate is shown for transparency
            (and warned about when it diverges) but never used. The $/t on
            the lineage chip is a display figure only.
          </li>
          <li>
            <strong>Project type</strong>{" "}— one selector moves the
            first-of-a-kind premium, the scale basis and the firming
            requirement together, because they are not independent in reality.
            A corridor defaults to{" "}
            <strong>first-of-a-kind, dedicated</strong>{" "}(FOAK ×1.25): one
            plant, one offtaker, no shared infrastructure — which is what a
            green corridor is. <em>Nth-of-a-kind, merchant</em>{" "}(×1.0)
            assumes a mature supply chain at world scale;{" "}
            <em>match a published study</em>{" "}expects every value typed with
            its own provenance.
          </li>
          <li>
            <strong>A range, not a point</strong>{" "}— the headline carries its
            uncertainty band, computed by varying the four sourced drivers
            across their published ranges: electrolyser CAPEX
            $2,000–2,600/kW, the firm-power step 1.6–2.2×, the scale exponent
            0.6–0.7 and FOAK 1.0–1.4. The panel also names whichever driver
            contributes most of the spread. This is a screening estimate and
            the rendering says so.
          </li>
        </ul>
        <H3>Build-here acceptance: two Atacama sites (re-validated 2026-08-02)</H3>
        <p className="mt-2">
          Both study candidate sites evaluated through the real flow
          (map-mode gated profiles → LCOH engine → scaled to the 59,850 t/yr
          nameplate) against the Chilean default corridor, after the
          fuel-production realism pass (IEA-2024 electrolyser basis,
          NEOM-anchored synthesis, firm power, first-of-a-kind archetype):
        </p>
        <Fields
          rows={[
            [
              "María Elena (−22.35, −69.66)",
              "LCOH $8.97/kg · 27.6% duty",
              "CAPEX $973.5m · OPEX $55.2m/yr",
              "116 km to Mejillones. Central $2,707/t (range $2,209–$3,027). H2 plant $626.0m + synthesis $347.5m; firm PPA chosen at $17.1m/yr. Green PV $2,549.6m; gap $1,711.3m pre-regulation / $1,461.1m post; $1,007.60/tCO2 WTW.",
            ],
            [
              "La Negra (−23.75, −70.30)",
              "LCOH $9.58/kg · 24.5% duty",
              "CAPEX $1,024.2m · OPEX $55.7m/yr",
              "74 km to Mejillones. Central $2,808/t (range $2,297–$3,140). H2 plant $676.7m + synthesis $347.5m; firm PPA chosen at $17.1m/yr. Green PV $2,606.0m; gap $1,767.8m pre-regulation / $1,517.6m post; $1,046.55/tCO2 WTW.",
            ],
          ]}
        />
        <p className="mt-2">
          <strong>Reconciliation — the residual closed from 54% to 12%.</strong>{" "}
          The study&apos;s fitted block ($1,100m / $72m/yr) annuitized at the
          corridor&apos;s 8% over 25 years is <strong>$3,071/t</strong>. Before
          the realism pass the bottom-up build-here total was $1,422/t, leaving
          an unexplained residual of ≈$1,650/t (54%). It is now{" "}
          <strong>$2,707/t at María Elena — a residual of $364/t (11.8%)</strong>{" "}
          — and $2,808/t at La Negra, a residual of $263/t (8.6%). Both sit
          inside the ~20% threshold this exercise set for validating build-here
          for screening use, and the study&apos;s figure falls inside La
          Negra&apos;s reported range ($2,297–$3,140).
        </p>
        <p className="mt-2">
          The three suspects named in the previous write-up were all real, and
          each is now priced explicitly rather than assumed away:{" "}
          <strong>electricity</strong>{" "}— the site cannot run a synthesis loop
          on unbuffered daytime solar (27.6% duty vs the 85% Haber-Bosch needs),
          so a firm-power step is charged;{" "}
          <strong>project-level cost</strong>{" "}— the electrolyser island moved
          to IEA&apos;s installed basis, which explicitly includes EPC and
          contingency, and synthesis is anchored to a real project&apos;s
          balance sheet rather than an unanchored reference scale; and{" "}
          <strong>FOAK</strong>{" "}— a corridor plant is now costed as
          first-of-a-kind (×1.25) by default rather than nth-of-a-kind.
        </p>
        <p className="mt-2">
          <strong>What the remaining ~10% is, stated rather than tuned.</strong>{" "}
          Three things are still unmodelled and each would move the number in
          the same direction: differentiated (dual-WACC) green financing and a
          scenario-level synergy adjustment, which the study quantifies at
          ≈$250m each; and terminal/residual plant value at the 15-year
          horizon, deliberately off so the study reproduction holds. The
          consortium&apos;s plant-cost breakdown (their Figure 3) would replace
          the NEOM-scaled calibration with a direct one and remains the
          highest-value outstanding input. A ~10% residual on a screening
          estimate whose own reported range spans ±15% is not a discrepancy
          worth tuning.
        </p>
        <p className="mt-2">
          <strong>Site-to-site is the point.</strong>{" "}La Negra costs $100/t
          (3.7%) more than María Elena — better siting economics at María Elena
          (LCOH $8.97 vs $9.58/kg) partly offset by its longer haul (116 vs 74
          km). Absolute-level errors largely cancel in that comparison, which
          is what the map is actually for; the level is a screening estimate,
          the ordering is the product.
        </p>
        <H3>Per-fuel fields (each side)</H3>
        <Fields
          rows={[
            [
              "Fuel type",
              "—",
              "green: e-Ammonia · fossil: LSFO",
              "Selects the fuel's benchmark bundle: price, emission factors, energy density, production/storage/barge costs, vessel premium (§11).",
            ],
            [
              "Fuel price",
              "$/t",
              "e-ammonia 900 · LSFO 594",
              "Fuel price under purchase mode — benchmark market price, or your contracted delivered price as an override. Hidden under build-plant/build-here unless the legacy Construct flag keeps it live.",
            ],
            [
              "Fuel consumption",
              "t/vessel/yr",
              "default: 5,700 green / 2,638 fossil (study)",
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
              "Build-plant/build-here modes (under build-here it is the sum of the H2 + synthesis capital components); forced to 0 under purchase.",
            ],
            [
              "Fuel production O&M",
              "$m/yr",
              "e-ammonia 3 · LSFO 0",
              "Build-plant/build-here modes (under build-here: H2 + synthesis operating + logistics components); inflated; forced to 0 otherwise.",
            ],
          ]}
        />

        {/* 6 ---------------------------------------------------------- */}
        <H id="tab-port">6. Tab 04 — Port</H>
        <p className="mt-2">
          Shore-side infrastructure per side: bunkering storage and the barge
          (or pipeline) that moves fuel to the ship. The fossil side assumes
          existing infrastructure: its CAPEX benchmarks are zero and its OPEX
          benchmarks are 30% of the fuel-table values — the reference
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
        <H id="tab-financing">7. Tab 05 — Financing</H>
        <p className="mt-2">
          Separated from Regulation into its own tab (sprint 4 amendment):
          everything about the cost of money. The corridor discount rate
          (WACC, with its unverified-benchmark badge — the amber tab dot
          lives here) and the inflation rate (scenario keys stay{" "}
          <code>cargo.*</code>), then the two flag-gated sprint-4 modules
          below. Both are off by default and both leave the golden default
          untouched.
        </p>
        <H3>Differentiated green financing</H3>
        <F>
          financing<sub>t</sub>{" "}= −outstanding<sub>t</sub>{" "}× (baseRate −
          greenRate) &nbsp; (green side only)
        </F>
        <p className="mt-2">
          Off by default. The toggle initialises concrete values: base rate =
          the corridor&apos;s current discount rate, green rate 6%, full debt,
          tenor min(15, horizon), amortizing. The five parameters (green
          rate, base rate, debt share, tenor, amortizing/bullet structure)
          sit behind the Standard view; the green rate stays visible — it is
          sensitivity top-level — and is a negotiation
          outcome, not a market observable — concessional structures
          typically land 0.5–2.5pp below the commercial base rate. The line
          is an explicit interest saving on debt-financed green capital,
          shown as its own float in the cost bridge and its own row in the
          decomposition — deliberately NOT a per-side discount rate, which
          would invert the benefit (§10). A negative spread (green premium)
          is allowed and shows as a cost.
        </p>

        <H3>Capital deployment schedule</H3>
        <p className="mt-2">
          Off by default (all CAPEX in year 1). The toggle initialises
          both sides at 100% in year 1; the Standard view exposes a
          deployment-years selector (1–5), per-side share rows and a
          30/40/30 preset matching the reference study&apos;s build
          profile. Shares must sum to 1 per side — the form shows a live
          amber warning and the model refuses to compute rather than
          silently rescaling. The green financing drawdown follows the
          same schedule (§10).
        </p>


        <H id="tab-regulation">8. Tab 06 — Regulation</H>
        <p className="mt-2">
          Four schemes, each with its own toggle. All monetary terms use the
          EUR/USD rate (default 1.08) where the scheme is euro-denominated,
          and all are calendar-anchored — moving the start year moves the
          corridor through the schedules. <strong>In the Chilean default all
          three named schemes are OFF</strong> (a Chile → Japan corridor
          touches no EEA port; production is Chilean, so 45Z cannot apply) —
          the self-designed scheme is ON at $280/tCO2 as a proxy for the IMO
          Net-Zero Framework, the one scheme that would actually apply (a
          first-class IMO NZF module is the known regulatory gap).
        </p>

        <H3>EU ETS (maritime)</H3>
        <F>
          ETS cost<sub>t</sub>{" "}= vessels × fuel t × combustion EF × phase-in(cal)
          × scope × EUA € × EURUSD / 10⁶
        </F>
        <p className="mt-2">
          Phase-in: 0 before 2024 → 40% (2024) → 70% (2025) → 100% (2026+).
          Defaults: EUA €80/t, scope 1.0 (fraction of voyages in ETS scope).
          An optional annual <em>price escalation</em>{" "}(Advanced fold, default
          0) compounds the EUA price as (1+esc)^(t−1) — 0 keeps the flat
          nominal price, a falling real price under inflation; the same
          control exists on the self-designed CO2 price.
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
          through the fuel&apos;s energy content. The reference case has no sunset
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
          proportion to their emissions <strong>on the model&apos;s emissions
          basis</strong>{" "}(EF(basis): combustion → the combustion factor;
          well-to-wake → LHV × WTW intensity). The model reports abatement and
          prices carbon on the SAME series — under WTW the Chilean
          default&apos;s $280/t charge reproduces the study&apos;s ≈$250m
          regulatory benefit. The four support terms subsidize only the green
          side. Use it to find the CO2 price or subsidy that closes the gap.
        </p>
        <p className="mt-2 text-neutral-600">
          <strong>Decision of record (sprint 4):</strong>{" "}the CAPEX/OPEX
          support instruments STAY inside self-designed regulation rather
          than moving to the Financing tab. One scheme, one toggle:
          splitting its four support fields across two tabs would cost more
          comprehension than the taxonomy gains, and the schemes they
          approximate (contracts-for-difference, capital grants) are
          policy instruments, not loan terms. Revisit if the IMO
          module&apos;s reward mechanism matures into a real support channel.
        </p>

        <H3>IMO Net-Zero Framework (provisional)</H3>
        <F>
          attained GFI = the side&apos;s WTW intensity [gCO2eq/MJ]
          <br />
          base / direct target<sub>t</sub> = 93.3 × (1 − ladder(cal))
          <br />
          cost<sub>t</sub> = (tier1 tCO2e × $100 + tier2 tCO2e × $380) ×
          scope / 10⁶
        </F>
        <p className="mt-2">
          The scheme that applies to most non-EU corridors — including the
          Chilean default, where the other three are inert. Structure from
          the draft MEPC 83 text (approved April 2025; adoption targeted
          MEPC 85, October 2026 — every parameter row in the reference
          bundle is cited and marked provisional): two reduction ladders vs
          the 93.3 gCO2eq/MJ 2008 reference (base 4%→30%, direct 17%→43%
          over 2028–2035, held flat beyond until MEPC sets 2036+), tier-1
          $100/tCO2e on the direct→base band, tier-2 $380/tCO2e beyond the
          base target (prices established 2028–2030). Surplus below the
          direct target accrues a <em>ZNZ reward balance</em>{" "}reported in
          tonnes — the reward rate is genuinely undetermined and defaults to
          0. If a pinned bundle lacks the IMO rows the module reports{" "}
          <em>not parameterised</em>{" "}instead of computing zero. Off by
          default everywhere.
        </p>

        <H3>Model options</H3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Emissions basis</strong>{" "}— what &ldquo;CO2 abated&rdquo;
            (and $/tCO2) counts: combustion (tank-to-wake, the reference
            convention) or well-to-wake (lifecycle, the app&apos;s default for
            new scenarios). Both tonnages are always reported side by side in
            the results (§9).
          </li>
          <li>
            <strong>Rate basis</strong>{" "}— nominal (inflation
            escalates costs, the nominal WACC discounts them) or real
            (deflates the OPEX escalation).
          </li>
        </ul>

        {/* 8 ---------------------------------------------------------- */}
        <H id="tab-results">9. Tab 07 — Results</H>
        <p className="mt-2">
          The full report. Every element recomputes on every keystroke; a
          compact summary of the same numbers stays docked on the input tabs.
          Reading order: KPI strip, scenario snapshot strip, cost bridge +
          decomposition, the two charts, then the regulatory and emissions
          tables.
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
        <H3>Scenario snapshot strip</H3>
        <p className="mt-2">
          Directly under the KPIs: one compact line stating what corridor the
          numbers describe — route &amp; ports, cargo unit &amp; weight,
          distance, start year &amp; horizon, fleet &amp; roundtrips, fuels
          &amp; sourcing, derived fuel use per vessel-year, lifetime cargo.
          Everything below reads in that context, and an exported screenshot
          is self-describing.
        </p>
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
            <strong>Emissions &amp; abatement</strong>{" "}— the premium per
            tonne of CO2 avoided on each emissions basis, BEFORE and AFTER
            the regulation modules (grouped bars), against the active
            scheme&apos;s carbon price as a dashed reference line: how far
            above (or below) the market price of carbon this corridor&apos;s
            abatement sits, and how much of that distance regulation already
            closes.
          </li>
          <li>
            <strong>Abatement cost vs carbon price</strong>{" "}— the premium per
            tonne of CO2 avoided on each basis, next to your EU ETS allowance
            price as a dashed line: how far above the market price of carbon
            this corridor&apos;s abatement currently is.
          </li>
        </ul>
        <H3>Results by tab</H3>
        <p className="mt-2">
          The bottom band mirrors the input steps: one equal-framed card per
          tab, so every number can be traced back to where it was entered.
        </p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>01 Cargo &amp; Corridor</strong>{" "}— cargo per year,
            lifetime cargo, cost per unit (pre- and post-regulation), CO2
            abated on the active basis.
          </li>
          <li>
            <strong>02 Vessel</strong>{" "}— fleet CAPEX and OPEX, green vs
            fossil.
          </li>
          <li>
            <strong>03 Fuel</strong>{" "}— fuel use per vessel-year, production
            CAPEX/O&amp;M, fuel price and WTW intensity for both fuels.
          </li>
          <li>
            <strong>04 Port</strong>{" "}— storage and barge CAPEX/OPEX per
            side.
          </li>
          <li>
            <strong>05 Regulation</strong>{" "}— each scheme&apos;s discounted
            total per side, the net regulatory effect on the gap (negative =
            regulation narrows it), abatement cost on both bases with the
            model&apos;s active basis tagged, and the carbon-price reference
            drawn from the active scheme.
          </li>
        </ul>

        {/* 9 ---------------------------------------------------------- */}
        <H id="engine">10. The engine: formulas</H>
        <p className="mt-2">
          One pure function evaluates a side; the green/fossil asymmetries are
          data, not code branches. Per modelled year t (idx 1…horizon, cal =
          start year + t − 1, infl = (1+inflation)^(t−1)):
        </p>
        <F>
          CAPEX<sub>t</sub>{" "}= (fuelProd + storage + barge + vessel) ×
          w<sub>t</sub>, &nbsp;w = deployment weights (default w₁ = 1: all
          capital in year 1)
          <br />
          OPEX<sub>t</sub>{" "}= fuel purchase + prod O&amp;M + storage O&amp;M +
          barge O&amp;M + vessel O&amp;M &nbsp;(each × infl)
          <br />
          fuel purchase<sub>t</sub>{" "}= vessels × fuel t/yr × price $/t / 10⁶ ×
          infl
          <br />
          total<sub>t</sub>{" "}= CAPEX<sub>t</sub>{" "}+ OPEX<sub>t</sub>{" "}+ ETS
          <sub>t</sub>{" "}+ FuelEU<sub>t</sub>{" "}+ 45Z<sub>t</sub>{" "}+ self
          <sub>t</sub>{" "}[+ IMO<sub>t</sub>][+ financing<sub>t</sub>]
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
          The costs decompose exactly: the per-year lines sum to the total
          by construction, the waterfall&apos;s Δ terms are differences of the
          decomposition lines, and the decomposition&apos;s total row equals
          the headline gap to the last digit.
        </p>
        <H3>Differentiated green financing (flag-gated, default off)</H3>
        <p className="mt-2">
          <strong>
            The obvious implementation — a lower discount rate on the green
            side — is wrong, and wrong in the interesting direction.
          </strong>{" "}
          This is a cost model: the discount rate expresses time preference
          over costs, so lowering it makes future costs LARGER in present
          value. On the reference corridor, green operating cost of $112.01m/yr
          inflated at 2% discounts to $1,160.7m at 8% but $1,301.6m at 6% —
          &quot;cheap green financing&quot; implemented as a rate swap makes
          the green corridor $141m WORSE, the exact inversion of the benefit
          it is meant to represent. No per-side discount rate exists anywhere
          in this code, and none should be added.
        </p>
        <F>
          cumdraw<sub>t</sub>{" "}= Σ<sub>k≤t</sub>{" "}CAPEX<sub>k</sub>{" "}×
          debtShare
          <br />
          outstanding<sub>t</sub>{" "}(amortizing) = min(cumdraw<sub>t</sub>, P ×
          (T − t + 1) / T), &nbsp;P = Σ CAPEX × debtShare
          <br />
          outstanding<sub>t</sub>{" "}(bullet) = cumdraw<sub>t</sub>{" "}(t ≤ T,
          else 0)
          <br />
          financing<sub>t</sub>{" "}= −outstanding<sub>t</sub>{" "}× (baseRate −
          greenRate)
        </F>
        <p className="mt-2">
          The line is an explicit interest saving (or, with a negative Δr, a
          premium — never clamped) on debt-financed green capital, discounted
          at the corridor rate like every other line. It sits OUTSIDE the
          pre-regulation subtotal and inside the net-effect band of the
          waterfall, as its own float — where the MMMCZCS study&apos;s own
          waterfall places it. Calibration against that study is BOUNDS, not a target:
          with green CAPEX $1,690m, Δr = 2pp, full debt, tenor 15, the
          amortizing structure yields $196.0m and bullet $312.5m; the
          study&apos;s ≈$250m lies between them, consistent with partial
          amortization or a grace period whose structure the study does not
          state. Nothing is tuned to force $250m — a forced match would
          fabricate precision the source does not provide.
        </p>
        <H3>Capital deployment schedule (flag-gated, default off)</H3>
        <F>
          CAPEX<sub>t</sub>{" "}= Σ component CAPEX × w<sub>t</sub>, &nbsp;Σ w
          = 1 per side (validated by name, never normalised)
          <br />
          cumdraw<sub>t</sub>{" "}follows the same weights — the financing
          line&apos;s outstanding balance tracks the phased drawdown
        </F>
        <p className="mt-2">
          By default every capital dollar lands in year 1 at a discount
          factor of exactly 1.0 — the reference workbook&apos;s convention,
          and the most conservative PV treatment. Phasing spreads each
          side&apos;s CAPEX over the first N years by explicit shares:
          later capital discounts more, so its present value falls and
          never rises (r ≥ 0; property-tested). At 30/40/30 on both sides
          of the reference corridor (PV factor 0.92757) the green CAPEX PV
          is $1,567.6m, fossil $333.9m, the pre-regulation gap $1,916.1m
          and the headline gap $1,665.9m; phasing the green side alone
          moves the gap by −$122.4m. Weights that do not sum to 1 are
          rejected naming the exact field — a schedule that silently
          rescaled would misstate the capital program. No new output
          fields: phasing re-times existing lines, so the frozen golden
          shape is untouched by construction.
        </p>

        {/* 10 --------------------------------------------------------- */}
        <H id="reference-data">11. Reference data</H>
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
          Brazil 11.5% — all flagged <em>unverified</em>.
          Regulation defaults: EUA €80/t, EUR/USD 1.08, FuelEU penalty
          €2,400/t VLSFO-eq, VLSFO 41,000 MJ/t, baseline 91.16 gCO2e/MJ, 45Z
          $1/gal at 122.5 MJ/gal.
        </p>

        {/* 11 --------------------------------------------------------- */}
        <H id="sensitivity">12. What moves the result</H>
        <p className="mt-2">
          A one-at-a-time sweep from the default baseline, each input across
          its plausible range, ranked by maximum movement of the headline gap.
          This ranking decides which fields render top-level vs behind the
          Standard view:
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
        <H id="provenance">13. Provenance, versions &amp; limits</H>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Regression pinning</strong>{" "}— a frozen golden fixture
            pins the engine at 10⁻⁹ relative tolerance across every summary
            figure and all 20 years of every per-year line (gap $166.95m,
            green total $205.60m, fossil $38.64m, $377/unit). Any change that
            moves a number fails the suite, so it has to be deliberate.
          </li>
          <li>
            <strong>Legacy behaviours preserved</strong>{" "}— the
            construct-mode double count (migrated scenarios only, never
            selectable), no 45Z sunset, and cargo throughput deliberately not
            linked to fuel burn. Deviations from the original source are
            opt-in flags whose defaults reproduce it.
          </li>
          <li>
            <strong>Schema versioning</strong>{" "}— scenarios carry a schema
            version (currently 5); older exports are migrated on load through
            an append-only migration registry. v3 restructured fuel sourcing,
            v4 folded the named-plant mode into purchase, v5 added the project
            archetype.
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

        <H3>The default scenario: Chilean copper-concentrate corridor</H3>
        <p className="mt-2">
          The app opens on a real published case:{" "}
          <em>Chilean Green Corridors — Copper Concentrate Export</em>{" "}
          (MMMCZCS, 11 September 2025; consortium Sumitomo, Interacid, NYK,
          Codelco, MMMCZCS). Mejillones → Japan/South Korea, 25 Mt of copper
          concentrate over 15 years, ten ammonia dual-fuel Handymax bulkers,
          60 kt/yr of green ammonia produced in the Atacama from 2030. Every
          default value is provenance-tagged in the scenario source: stated
          in the study [S], derived from stated values [D], fitted to
          reconcile the study&apos;s published totals [F], or assumption [A].
          The fitted CAPEX/OPEX blocks reconcile to the published totals but
          are not sourced line-by-line. How the model reproduces the study
          with these inputs:
        </p>
        <div className="my-3 overflow-x-auto">
          <table className="w-full border border-neutral-300 text-[13px] tabular-nums">
            <thead>
              <tr className="border-b border-neutral-300 bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th className="px-3 py-2 font-medium">Metric</th>
                <th className="px-3 py-2 text-right font-medium">Study</th>
                <th className="px-3 py-2 text-right font-medium">Model</th>
                <th className="px-3 py-2 text-right font-medium">Δ</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Green corridor NPV", "$2,850m", "$2,850.66m", "+0.02%"],
                  ["Fossil corridor NPV (ex-regulation)", "$850m", "$838.22m", "−1.4%"],
                  ["Gap NPV (pre-regulation)", "$2,000m", "$2,012.44m", "+0.6%"],
                  ["Incremental cost per cargo tonne (pre-reg.)", "$80/t", "$81.31/t", "+1.6%"],
                  ["CO2 abated (15 yr, well-to-wake)", "1.45 Mt", "1,450,095 t", "exact"],
                  ["Regulatory benefit (IMO NZF proxy)", "≈$250m", "$250.23m", "≈exact"],
                ] as const
              ).map(([metric, study, model, delta]) => (
                <tr key={metric} className="border-b border-neutral-200 last:border-0">
                  <td className="px-3 py-1.5">{metric}</td>
                  <td className="px-3 py-1.5 text-right">{study}</td>
                  <td className="px-3 py-1.5 text-right">{model}</td>
                  <td className="px-3 py-1.5 text-right">{delta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2">
          The displayed headline (gap $1,762.21m, $71/t, $1,215/tCO2) is the
          post-regulation figure; the pre-regulation gap ($2,012.44m — the
          study&apos;s $2,000m quantity) shows directly beneath it and in the
          decomposition&apos;s &ldquo;Subtotal before regulation&rdquo; row.
          The regulatory line matches because the self-designed CO2 price now
          follows the model&apos;s emissions basis (well-to-wake here) — it
          prices the same series it reports. Known missing concepts the study
          quantifies that the model cannot yet hold: differentiated green
          financing (dual WACC, ≈$250m here) and a scenario-level synergy
          adjustment (≈$250m).
        </p>
        <p className="mt-2">
          <strong>Finding — the $280/t proxy vs the structured IMO
          module:</strong>{" "}replacing the calibrated self-designed proxy
          with the actual draft-MEPC-83 structure yields a net regulatory
          effect of only ≈$86m (vs the proxy&apos;s $250m): LSFO at 91.16
          gCO2eq/MJ sits <em>below</em>{" "}the base-target ladder until
          ≈2032, so most of its deficit is priced in the tier-1 $100 band,
          not at a flat $280 on every tonne. Not tuned away — either the
          study&apos;s $250m anticipates post-2030 price escalation /
          stricter parameters, or the flat-price proxy overstates the draft
          framework&apos;s near-term charge. The green side&apos;s
          reward-eligible surplus (≈0.9 MtCO2e over the horizon) is the
          upside the study flags, reported unpriced.
        </p>

        {/* 13 --------------------------------------------------------- */}
        <H id="inputs">14. Complete input inventory</H>
        <p className="mt-2">
          Every field a scenario carries — the machine-complete list,
          generated from the validation schema and joined with the
          sensitivity sweep (§12). <em>Required&nbsp;=&nbsp;no</em>{" "}
          marks optional additions that older scenarios may omit;{" "}
          <em>nullable</em>{" "}
          override fields use <code>null</code>{" "}
          to mean &ldquo;use the benchmark&rdquo;. Placement{" "}
          <em>top-level</em>{" "}
          = the field moved the headline gap ≥5% and renders prominently;{" "}
          <em>advanced</em>{" "}
          = it renders only in the Standard view; &ldquo;—&rdquo; = not
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
          object stores the evaluated site: cell id, coordinates, the LCOH
          engine&apos;s evaluated snapshot (LCOH, annual H2, capital, year-1
          operating, discount rate, engine version, plant life), the five
          cost components (each{" "}
          <code>{"{ derivedUsdM, overrideUsdM }"}</code>{" "}— H2 capital, H2
          operating, synthesis capital, synthesis operating, logistics
          operating), the firm-power resolution (evaluated vs required duty,
          the chosen strategy and whether you picked it, its capital,
          operating and imported-CO₂ cost) and the sizing record (nameplate,
          margin, scale factor, project archetype, FOAK, surplus, distance).
          The canonical, always-current version of this table is generated
          into <code>docs/corridor/field-reference.md</code>{" "}
          in the repository — CI fails if it drifts from the schema.
        </p>
        {/* ===================== PART 2 — LCOH METHODOLOGY ===================== */}
        <div className="mt-16 border-t-2 border-neutral-300 pt-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-deep">
            Part 2
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-neutral-900">
            LCOH methodology
          </h2>
          <p className="mt-2 text-neutral-600">
            How Thaduberg estimates the levelized cost of hydrogen (LCOH) — the
            method, every formula, and the data sources behind it. This is the
            engine that prices a <strong>build-here</strong>{" "}site (§5): pick a
            cell on the map, and the number handed back to the corridor is
            produced exactly as described below. It re-implements the published
            Chilean methodology «Motor de Cálculo LCOH» (Ministerio de Energía
            de Chile, April 2024); resource data and cost projections are
            layered on top.
          </p>
        </div>

        {/* 14 */}
        <H id="m-overview">15. Overview &amp; system boundary</H>
        <p className="mt-2">
          LCOH is the constant price per kilogram of hydrogen that exactly pays
          off every discounted cost of the project over its life. The system
          boundary is the <strong>electrolyzer outlet</strong>: production of
          hydrogen from electricity and water only. Compression, storage,
          conversion (ammonia, e-fuels), and transport are outside the boundary
          and not costed.
        </p>
        <p className="mt-2">
          One representative meteorological year of hourly generation is
          dispatched to the electrolyzer and repeated over the project life;
          costs and hydrogen are discounted to present value; LCOH is their
          ratio, decomposed into seven components that sum to it exactly.
        </p>

        {/* 15 */}
        <H id="m-hydrogen">16. Hydrogen from electricity</H>
        <p className="mt-2">
          Hydrogen output is electricity consumed by the electrolyzer times its
          efficiency, divided by the lower heating value (LHV) of hydrogen:
        </p>
        <F>
          H₂ [kg] = E_consumed [kWh] × η_LHV ÷ 33.33 [kWh/kg]
        </F>
        <p className="mt-2">
          η<sub>LHV</sub>{" "}is the system efficiency on an LHV basis (default
          60%), so producing 1 kg needs ≈ 33.33 / 0.60 ≈ 55.6 kWh. Water use is
          9 litres per kg of H₂. The electricity for water desalination and
          pumping is tracked for emissions only, never for cost (§22).
        </p>

        {/* 16 */}
        <H id="m-profiles">17. Resource profiles (capacity factors)</H>
        <p className="mt-2">
          Each location gets an 8760-hour <strong>capacity-factor</strong>{" "}
          profile (kWh generated per kW installed, per hour, 0–1) for solar and
          wind, built as a Typical Meteorological Year (TMY) from roughly a
          decade of data and cached per 0.1° grid cell.
        </p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Solar PV — PVGIS (authoritative):</strong>{" "}the JRC PVGIS
            model (<code>seriescalc</code>, <code>pvcalculation=1</code>, 1 kWp,
            14% system loss) returns hourly PV power <code>P</code>{" "}in watts;
            capacity factor = P / 1000. Mounting is fixed at optimal tilt, or
            single-/dual-axis tracking. If PVGIS is unavailable, a labeled
            low-fidelity fallback is used (GHI/1000 × 0.9).
          </li>
          <li>
            <strong>PV pathway on the map.</strong>{" "}PVGIS auto-resolves a
            per-cell radiation database (SARAH3/NSRDB satellite, its own
            tilt-aware PV model). Where that coverage ends, the crude GHI proxy
            above is a categorically different model, so adjacent hexes stop being
            comparable and a seam appears in the surface. On the map we therefore
            drop the crude fallback for PV: a cell PVGIS cannot serve renders as
            no-data rather than a non-comparable value. (An earlier version pinned{" "}
            <code>raddatabase=PVGIS-ERA5</code>{" "}for a &ldquo;consistent
            global&rdquo; model,
            but that endpoint is unreliable — frequent errors and materially
            too-low capacity factors — so the map uses PVGIS auto-resolve, which
            still reaches ERA5 internally only at high latitude where it is the
            best available database.) The provider and radiation database used are
            recorded per cell.
          </li>
          <li>
            <strong>Wind — Open-Meteo (ERA5, primary):</strong>{" "}hourly wind
            speed at 10 m and 100 m is extrapolated to hub height (120 or 160 m)
            with a per-hour power-law shear exponent, then converted through a
            digitized turbine power curve. NASA POWER (fixed shear α = 1/7) is
            the fallback.
          </li>
        </ul>
        <p className="mt-3 font-medium">Wind-speed extrapolation to hub height</p>
        <F>
          α = ln(v₁₀₀ / v₁₀) / ln(100 / 10), clamped to [0.05, 0.40]
          <br />
          v_hub = v₁₀₀ × (z_hub / 100)^α
        </F>
        <p className="mt-2">
          Wind capacity factor = P<sub>turbine</sub>(v<sub>hub</sub>) / P
          <sub>rated</sub>, where P<sub>turbine</sub>{" "}is linear interpolation on
          the reference 5.6 MW power curve (cut-in 3 m/s, rated ≈ 12 m/s,
          cut-out 25 m/s). The turbine sets the profile <em>shape</em>{" "}only;
          installed capacity scales linearly.
        </p>
        <p className="mt-2">
          <strong>Air-density correction (improved mode).</strong>{" "}A power curve
          is defined at sea-level density ρ₀ = 1.225 kg/m³; thinner air at
          elevation produces less power at a given speed. The lookup can be
          normalised (IEC 61400-12) using the site elevation and hourly air
          temperature:
        </p>
        <F>
          ρ = p(z) / (287.05 · T_hour) , p(z) = 101325·(1 − 0.0065·z/288.15)^5.25588
          <br />
          v_eq = v_hub · (ρ / 1.225)^(1/3) ; CF = P_turbine(v_eq) / P_rated
        </F>
        <p className="mt-2">
          Without it, wind is overstated ~22–33% at 2500–4000 m — biasing
          against exactly the high-elevation high-resource sites the map exists
          to surface. Reference profiles apply no correction.
        </p>
        <p className="mt-2">
          <strong>Turbine-class selection (improved mode).</strong>{" "}One
          mid-market machine applied everywhere penalises low-wind sites, where
          a developer would deploy a lower IEC wind class — same generator,
          larger rotor, so a lower <em>specific power</em>{" "}(rated kW per m² of
          swept area) that reaches rated power at a lower wind speed and yields
          far more energy in light winds. The improved path selects the class
          from the site&rsquo;s annual-mean hub-height speed (IEC classes are
          defined on wind speed, so the <em>uncorrected</em>{" "}mean is used):
          ≥9.5 m/s → Class I (rated ≈12.5 m/s), 7.5–9.5 → Class II (≈11.5),
          &lt;7.5 → Class III (≈10.5, largest rotor). The three curves are
          repositioned from the digitised generic curve; the selected class is
          exposed as a per-cell diagnostic. Reference mode keeps the single
          generic curve.
        </p>
        <p className="mt-3 font-medium">Typical Meteorological Year</p>
        <p className="mt-2">
          For each calendar month, the source year whose daily-mean
          distribution is closest to the long-term distribution is selected
          (Finkelstein–Schafer statistic — the mean absolute difference between
          the month&apos;s empirical cumulative distribution and the pooled
          long-term one), and the twelve selected months are stitched into one
          8760-hour year. Leap days are trimmed; provider gaps are
          linearly interpolated; a year with &gt; 5% missing hours is dropped.
        </p>

        {/* 17 */}
        <H id="m-dispatch">18. Hourly dispatch</H>
        <p className="mt-2">
          Each hour, renewables serve the electrolyzer first; the grid/PPA (if
          configured) tops up the shortfall up to its hourly cap and the
          electrolyzer&apos;s capacity. Available renewable power is{" "}
          <code>CF × capacity</code>{" "}per source. If total available renewable
          power exceeds the electrolyzer demand, both sources are scaled down
          pro-rata by the same factor:
        </p>
        <F>
          s = min(1, electrolyzer_kW / (availPV + availWind))
          <br />
          consumed_source = avail_source × s ; curtailed_source = avail_source ×
          (1 − s)
        </F>
        <p className="mt-2">
          Pro-rata scaling guarantees, per source,{" "}
          <code>generated = consumed + curtailed</code>{" "}exactly. Because the TMY
          repeats, the 8760-hour dispatch is computed once; only per-year scalar
          quantities (efficiency, hydrogen) change over the project life.
        </p>

        {/* 18 */}
        <H id="m-degradation">19. Degradation &amp; stack replacement</H>
        <p className="mt-2">
          Electrolyzer efficiency degrades geometrically each year (reference
          mode; d = degradation rate, default 1%/yr):
        </p>
        <F>η_t = η₀ × (1 − d)^t , for operating years t = 1 … N</F>
        <p className="mt-2">
          The stack is replaced whenever cumulative operating hours (hours with
          load &gt; 0) cross a multiple of its rated life (default 50 000 h —
          IEA&apos;s economic optimum); each replacement is a capital event costing
          a fraction of electrolyzer CAPEX (default 13%, which holds the event
          at ~$300/kW). A replacement falling in the final operating year
          is skipped. In reference mode efficiency is not reset on replacement.
        </p>

        {/* 19 */}
        <H id="m-lcoh">20. The LCOH formula</H>
        <p className="mt-2">
          All cashflows are discounted with the project discount rate r
          (default 8%). Investment occurs at year 0 (undiscounted); production
          and operating costs occur in years 1 … N:
        </p>
        <p className="mt-2">
          <strong>Financing layers.</strong>{" "}The map&rsquo;s default surface
          applies a single uniform r = 8% everywhere, so it ranks{" "}
          <em>resource</em>, not project cost — it is labelled{" "}
          &ldquo;resource-driven, uniform financing&rdquo; on the map itself.
          The capital-recovery factor over 20 yr swings from 0.087 at 6% to
          0.134 at 12% — a larger spread than the resource gap between two good
          sites — so an optional <em>risk-adjusted</em>{" "}layer instead applies
          each cell&rsquo;s country cost of capital
          (<code>country_defaults.wacc_suggestion</code>, matched by
          point-in-polygon against the Natural Earth boundaries). That WACC is a
          transparent World Bank income-group <em>heuristic</em>{" "}(0.06 OECD-high
          → 0.12 low-income), labelled as such wherever it appears and isolated
          in code so a measured cost-of-capital source can replace it.
        </p>
        <F>df₀ = 1 ; df_t = df_(t−1) / (1 + r) ; annuity A = Σ_(t=1..N) df_t</F>
        <p className="mt-2">
          LCOH is defined as the <strong>sum of per-component quotients</strong>
          — each component&apos;s discounted USD divided by discounted hydrogen
          — so the decomposition sums to LCOH exactly by construction:
        </p>
        <F>
          PV_H₂ = Σ_(t=1..N) H₂_t × df_t
          <br />
          LCOH = Σ_components ( PV_component / PV_H₂ )
        </F>
        <p className="mt-2">The seven components:</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-neutral-300 text-left">
                <th className="py-1.5 pr-3">Component</th>
                <th className="py-1.5">Discounted USD (numerator)</th>
              </tr>
            </thead>
            <tbody className="align-top">
              {[
                ["Electrolyzer CAPEX", "CAPEX_kW × capacity_kW (at t = 0)"],
                ["Electrolyzer OPEX", "opex_fraction × CAPEX × A"],
                [
                  "Stack replacements",
                  "Σ over replacement years of (replacement_cost × df_t)",
                ],
                [
                  "PV electricity",
                  "LCOE mode: (E_consumed/1000 × price) × A · CAPEX mode: CAPEX + OPEX × A",
                ],
                ["Wind electricity", "same as PV electricity, wind source"],
                ["Grid electricity", "(E_grid/1000 × grid_price) × A"],
                [
                  "Water",
                  "Σ_t (water_m³_t × unit_cost × df_t), unit_cost = price + transport × dist/100",
                ],
              ].map(([c, f]) => (
                <tr
                  key={c}
                  className="border-b border-neutral-100"
                >
                  <td className="py-1.5 pr-3 font-medium">{c}</td>
                  <td className="py-1.5 font-mono text-[12px] text-neutral-600">
                    {f}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 20 */}
        <H id="m-lcoe">21. Electricity pricing (LCOE)</H>
        <p className="mt-2">
          Renewable electricity is priced one of two ways per source. In{" "}
          <strong>LCOE mode</strong>{" "}a flat price per MWh is charged on{" "}
          <em>consumed</em>{" "}energy only (curtailed energy is free). In{" "}
          <strong>CAPEX mode</strong>{" "}the electricity cost is <em>derived</em>{" "}
          from the plant&apos;s build cost and its own generation — so a better
          resource yields cheaper electricity:
        </p>
        <F>
          LCOE = ( CAPEX + OPEX_per_year × A ) / ( (E_generated / 1000) × A )
          [USD/MWh]
        </F>
        <p className="mt-2">
          The reported <em>mix</em>{" "}LCOE is the consumed-energy-weighted average
          of the active sources:
        </p>
        <F>
          LCOE_mix = ( E_PV·LCOE_PV + E_wind·LCOE_wind + E_grid·price_grid ) /
          E_consumed
        </F>
        <p className="mt-2">
          The interactive Calculator lets you choose either mode. The world map
          uses CAPEX mode so that resource quality drives the map (§24).
        </p>
        <p className="mt-2">
          In CAPEX mode the electricity component charges the full plant CAPEX
          regardless of curtailment, but <code>LCOE_mix</code>{" "}is per MWh{" "}
          <em>generated</em>{" "}— so multiplying it by consumed energy under-counts
          by the utilization ratio. The engine therefore also reports an{" "}
          <strong>effective cost per consumed MWh</strong>{" "}(discounted
          electricity cost ÷ discounted consumed MWh), which reconciles to the
          electricity components exactly, and per-source utilization
          (E_consumed / E_generated).
        </p>

        {/* 21 */}
        <H id="m-emissions">22. Emissions ledger</H>
        <p className="mt-2">
          Emissions are tracked separately from cost. Grid electricity consumed
          by the electrolyzer, plus the electricity attributable to water
          (desalination 3.75 kWh/m³ if applicable; pumping 0.40 kWh/m³ per 100 m
          of lift), are multiplied by the grid emission factor:
        </p>
        <F>
          CO₂e_t [t] = ( E_grid + water_m³_t × water_elec_kWh/m³ ) / 1000 ×
          grid_EF [tCO₂/MWh]
        </F>
        <p className="mt-2">
          A renewables-only plant has a grid factor of 0 (water electricity is
          assumed drawn from the same clean supply), so its hydrogen emission
          factor is 0 kgCO₂e/kg. Water and desalination electricity never enter
          the cost side — this invariant is enforced by a dedicated test.
        </p>
        <p className="mt-2">
          This ledger is <strong>operational only</strong>, measured against the
          annual-average grid emission factor. It is <strong>not an RFNBO /
          RED II compliance assessment</strong>{" "}— that additionally requires
          additionality and geographic (same bidding zone) and temporal
          (monthly, then hourly) correlation against defined comparators, with a
          3.38 kgCO₂e/kg threshold. Because dispatch is hourly, the engine does
          report the <strong>hourly renewable-matched fraction</strong>{" "}(share
          of consumption served hour-by-hour by the project&apos;s own
          renewables), which is the figure a compliance-minded reader wants — but
          a 0 here means operationally clean, not RFNBO-compliant.
        </p>

        {/* 22 */}
        <H id="m-constants">23. Constants &amp; reference defaults</H>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="font-medium">Physical constants</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px]">
              <li>LHV of hydrogen: 33.33 kWh/kg</li>
              <li>Hours per year: 8760 (non-leap)</li>
              <li>Water consumption: 9 L/kg H₂</li>
              <li>Desalination electricity: 3.75 kWh/m³</li>
              <li>Pumping electricity: 0.40 kWh/m³ per 100 m</li>
            </ul>
          </div>
          <div>
            <p className="font-medium">Reference defaults</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px]">
              <li>Lifetime 20 yr · discount rate 8%/yr</li>
              <li>Electrolyzer 100 MW · 2300 USD/kW · 1.3% OPEX/yr</li>
              <li>Efficiency 60% LHV · degradation 1%/yr</li>
              <li>Stack life 50 000 h · replacement 13% of CAPEX (~$300/kW)</li>
              <li>Renewables 30 USD/MWh (or 850 USD/kW + 1% OPEX)</li>
              <li>Water 0.50 USD/m³ + 0.09/m³ per 100 km</li>
            </ul>
          </div>
        </div>

        {/* 23 */}
        <H id="m-map">24. The map&apos;s configuration</H>
        <p className="mt-2">
          Every hexagon on the Explorer is computed with a fixed reference
          configuration so cells are comparable: a 100 MW electrolyzer at the
          reference defaults, no grid, and a fixed 200 MW total of renewables
          whose PV share is swept over {"{0, 25, 50, 75, 100}"}%. The lowest-cost
          mix is the <em>Best combination</em>{" "}layer; PV-only and wind-only give
          the <em>Solar only</em>{" "}and <em>Wind only</em>{" "}layers.
        </p>
        <p className="mt-2">
          <strong>Best-achievable layer (oversizing sweep).</strong>{" "}The fixed
          2:1 point is one arbitrary design; the true optimum also depends on the
          renewable-to-electrolyser <em>ratio</em>, which is strongly
          profile-dependent — flat wind wants a lower ratio than peaky solar — so
          cells can invert. An optional layer sweeps ratio ∈ {"{1.25, 1.5, 2.0, 2.5, 3.0}"} ×
          PV share ∈ {"{0, 12.5, …, 100}"}% (45 configurations) and reports the
          minimum LCOH plus the winning ratio and mix as per-cell diagnostics.
          The fixed-2:1 layer is kept for continuity.
        </p>
        <p className="mt-2">
          Unlike the flat-30 reference, the map prices electricity in{" "}
          <strong>CAPEX mode</strong>{" "}so each cell&apos;s cost reflects its own
          capacity factor (IRENA 2023 global averages: solar 800 USD/kWp + 1.5%
          OPEX, onshore wind 1200 USD/kW + 2.5% OPEX). Colors use a fixed
          per-layer domain (never rescaled to the viewport), so a color means
          the same LCOH everywhere on that layer.
        </p>

        {/* 24 */}
        <H id="m-costyears">25. Cost-year projections (2030 / 2040 / 2050)</H>
        <p className="mt-2">
          The cost-year buttons re-price each cell with future technology costs.
          The <strong>resource is held constant</strong>{" "}— same capacity factors
          — so the change is purely the techno-economic cost-down. Multipliers
          on the 2024 base:
        </p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-[13px] tabular-nums">
            <thead>
              <tr className="border-b border-neutral-300 text-left">
                <th className="py-1.5 pr-3">Driver</th>
                <th className="py-1.5 pr-3">2024</th>
                <th className="py-1.5 pr-3">2030</th>
                <th className="py-1.5 pr-3">2040</th>
                <th className="py-1.5">2050</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Electrolyser CAPEX", "1.00", "0.70", "0.58", "0.50"],
                ["Solar PV CAPEX", "1.00", "0.69", "0.62", "0.57"],
                ["Wind CAPEX", "1.00", "0.92", "0.88", "0.85"],
                ["Efficiency (LHV)", "60%", "61%", "63%", "65%"],
                ["Stack life (h)", "40k", "60k", "80k", "100k"],
                ["Degradation (%/yr)", "1.0", "0.8", "0.6", "0.5"],
              ].map((r) => (
                <tr
                  key={r[0]}
                  className="border-b border-neutral-100"
                >
                  <td className="py-1.5 pr-3 font-medium">{r[0]}</td>
                  <td className="py-1.5 pr-3">{r[1]}</td>
                  <td className="py-1.5 pr-3">{r[2]}</td>
                  <td className="py-1.5 pr-3">{r[3]}</td>
                  <td className="py-1.5">{r[4]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2">
          The <strong>2030</strong>{" "}multipliers are derived from the IEA Global
          Hydrogen Review 2025 Assumptions Annex (electrolyser CAPEX 2000–2600 →
          1400–1820 USD/kW; solar/wind regional cost declines). IEA&apos;s
          hydrogen publications have a 2030 horizon, so <strong>2040 and 2050
          are extrapolated</strong>{" "}along IEA&apos;s stated direction and are
          labeled &quot;projected&quot; throughout the UI. Scenario: IEA
          Announced Pledges (APS); cost-down applied globally.
        </p>
        <p className="mt-2">
          <strong>Durability trajectory.</strong>{" "}Earlier packs cut CAPEX but
          held stack life flat and degradation at 1%/yr — incoherent,
          since durability is a primary learning-curve target, and it made the
          cost-down conservative. Stack life and degradation now improve
          alongside CAPEX (2024 unchanged). These durability figures are a{" "}
          <em>documented extrapolation</em>{" "}along the IEA/DOE direction, not
          IEA-published values. Because solar CAPEX falls faster than wind, the
          cheapest PV/wind mix <strong>flips</strong>{" "}in some cells between cost
          years — shifting toward solar by 2050.
        </p>

        {/* 25 */}
        <H id="m-defaults">26. Country defaults</H>
        <p className="mt-2">
          The Calculator&apos;s country selector fills a grid emission factor
          and a WACC suggestion for every country. Grid emission factors come
          from Our World in Data&apos;s carbon-intensity-of-electricity dataset
          (built on Ember + the Energy Institute), latest year, converted
          gCO₂/kWh ÷ 1000 → tCO₂/MWh. WACC suggestions follow a transparent World
          Bank income-group heuristic (high-income OECD 6%, upper-middle 8%,
          lower-middle 10%, low 12%). Countries are matched to ISO2 via Natural
          Earth boundaries.
        </p>

        {/* 26 */}
        <H id="m-verification">27. Verification</H>
        <p className="mt-2">
          Verification shows the code computes what the method specifies — it is
          not empirical grounding. Analytical cases reproduce hand-derived LCOH
          to ≤ 1e-6 (e.g. PV at CF ≡ 1, LCOE 30 USD/MWh, no degradation → 2.507
          USD/kg via the standard annuity); property tests assert monotonicity,
          energy closure, and mass balance; golden files pin full runs to 1e-12.
          These say nothing about whether the assumptions match reality — that is
          validation, below.
        </p>

        {/* 27 */}
        <H id="m-validation">28. Validation</H>
        <p className="mt-2">
          <strong>Chilean 47-project parity</strong>{" "}(Tabla 3-1, Motor de Cálculo
          LCOH, April 2024) is the one empirical comparison, and n = 32 with
          inferred coordinates is thin — the tool&apos;s job is screening, so the
          metrics that matter are shortlist fidelity, not a single global
          correlation:
        </p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Rank fidelity: Spearman ρ = 0.85; Kendall τ_b = 0.66</strong>{" "}
            with a bootstrap 95% CI of roughly [0.53, 0.78] — unchanged by the
            2026-08-02 cost re-base, which moved the level without disturbing
            the ordering.
          </li>
          <li>
            <strong>⚠ The level is no longer like-for-like.</strong>{" "}The
            published column is a <em>2022</em>{" "}cost basis; the engine now
            runs on IEA&apos;s <em>2024</em>{" "}installed CAPEX ($2,300/kW).
            Mean computed is 6.16 vs 4.51 published — that gap is a vintage
            difference, not a bias estimate. Read this harness as a
            screening-fidelity test until a same-vintage published dataset is
            available.
          </li>
          <li>
            <strong>Precision@5 = @10 = 1.0</strong>{" "}and top-decile retention
            1.0: the model identifies the cheapest sites — what a user actually
            shortlists — exactly. The discordance sits among the middle of the
            distribution, not the top.
          </li>
          <li>
            <strong>The pre-re-base −0.21 bias was structural, not
            geolocation.</strong>{" "}On the last same-vintage comparison
            (2022 basis vs the 2022 column) the model ran 4.30 vs 4.51 USD/kg.
            Coordinate inference is symmetric noise (a sensitivity run perturbing
            inferred coordinates ±0.2° moves a site&apos;s LCOH in either
            direction, so it can&apos;t produce a one-directional offset); the
            consistent gap traced to a baseline assumption differing from the
            study (efficiency, electrolyser CAPEX, discount rate, or oversizing
            ratio — see <code>npm run parity:sensitivity</code>). A baseline
            cause may not be uniform across geographies.
          </li>
          <li>
            <strong>One benchmark is thin for a global tool.</strong>{" "}A second
            published dataset with fully disclosed assumptions and coordinates
            (e.g. an IEA/IRENA or national green-hydrogen cost study) is the
            outstanding validation work; the parity harness is dataset-agnostic
            so one can be wired in when a comparably-specified source is
            obtained.
          </li>
        </ul>

        {/* 28 */}
        <H id="m-limitations">29. Limitations</H>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            No compression, storage, transport, or downstream conversion — the
            boundary is the electrolyzer outlet.
          </li>
          <li>
            One representative year repeated; no inter-annual variability,
            battery buffering, part-load efficiency curve, or oversizing
            optimizer (reserved for a future version).
          </li>
          <li>
            Map cells use one representative coordinate per H3 hexagon; the
            turbine curve carries no air-density correction.
          </li>
          <li>
            Cost-year 2040/2050 figures are extrapolations, not IEA-published
            values.
          </li>
          <li>
            Estimates are indicative, not investment-grade; they compare
            locations and technologies on a consistent basis.
          </li>
        </ul>

        {/* 29 */}
        <H id="m-sources">30. Sources</H>
        <ul className="mt-2 space-y-2">
          <li>
            <strong>Methodology:</strong>{" "}«Motor de Cálculo LCOH — Principales
            características», Ministerio de Energía de Chile / Centro de Energía
            FCFM U. de Chile / USACH / PUC, April 2024.
          </li>
          <li>
            <strong>Solar:</strong>{" "}PVGIS © European Commission, Joint Research
            Centre —{" "}
            <a
              href="https://re.jrc.ec.europa.eu/pvg_tools/"
              className="text-brand underline underline-offset-2 decoration-brand/30 hover:decoration-brand"
            >
              re.jrc.ec.europa.eu
            </a>
            .
          </li>
          <li>
            <strong>Wind &amp; weather:</strong>{" "}Open-Meteo.com (CC BY 4.0),
            based on ERA5 (Copernicus Climate Change Service); NASA POWER (NASA
            Langley Research Center) fallback.
          </li>
          <li>
            <strong>Renewable CAPEX:</strong>{" "}IRENA, Renewable Power Generation
            Costs 2023.
          </li>
          <li>
            <strong>Cost projections:</strong>{" "}IEA, Global Hydrogen Review 2025
            — Assumptions Annex (Announced Pledges Scenario).
          </li>
          <li>
            <strong>Grid emission factors:</strong>{" "}Our World in Data (Ember +
            Energy Institute), carbon intensity of electricity.
          </li>
          <li>
            <strong>Boundaries:</strong>{" "}Natural Earth (public domain).
            Basemap © CARTO, map data © OpenStreetMap contributors.
          </li>
        </ul>
        <p className="mt-6 text-xs text-neutral-500">
          Non-commercial use. Provider attributions are also shown inline with
          each resource-profile result.
        </p>
      </main>
      <Footer />
    </>
  );
}
