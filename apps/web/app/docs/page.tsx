import Footer from "@/components/shell/Footer";
import { requireAccess } from "@/lib/server/access";
import TopBar from "@/components/shell/TopBar";
import CountryDefaultsTable from "@/components/docs/CountryDefaultsTable";
import DocsNav from "@/components/docs/DocsNav";
import DocsImpactTable from "@/components/docs/DocsImpactTable";
import DocsTornado from "@/components/docs/DocsTornado";
import uncertaintyArtifact from "../../../../data/corridor-sensitivity/uncertainty.json";
import { TOC_IDS, TOC_PARTS } from "./toc";
import countryDefaults from "../../../../data/country-defaults/snapshot.json";
import fieldReference from "../../../../data/corridor-sensitivity/field-reference.json";
import sensitivityArtifact from "../../../../data/corridor-sensitivity/sensitivity.json";
import costPacks from "../../../../data/cost-packs/table.json";
import vesselCatalogue from "../../../../data/corridor-ref/vessel-catalogue.json";

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

/**
 * Sub-heading. `id` is optional so a future H3 can be added without one, but
 * every current call site carries one: the left nav links to these, and a nav
 * that lists some sub-sections while silently omitting others is worse than a
 * nav that lists none. The ids live in `./toc.ts` — see that file on why they
 * are explicit rather than slugged from this text.
 */
function H3({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="mt-6 scroll-mt-16 text-sm font-semibold">
      {children}
    </h3>
  );
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

/**
 * §38 renders the GENERATED field reference (gen-docs writes the JSON next
 * to the markdown twin; CI fails on drift) — the table cannot desync from
 * the schema or the sweep. TYPE_OVERLAY adds display-only richer type
 * labels; unknown paths fall through to the generated type string.
 */
const TYPE_OVERLAY: Record<string, string> = {
  "regulation.ets.scope": "number 0–1",
  "regulation.fuelEu.scope": "number 0–1",
  "regulation.selfDesigned.capexSupport": "number 0–1",
  "regulation.selfDesigned.opexSupport": "number 0–1",
  "regulation.imoNetZero.scope": "number 0–1",
  "financing.greenRate": "number 0–1",
  "financing.baseRate": "number 0–1",
  "financing.debtShare": "number 0–1",
  "financing.tenorYears": "integer 1–40",
  "capitalPhasing.green.weights": "number[] (sum = 1)",
  "capitalPhasing.fossil.weights": "number[] (sum = 1)",
};

interface FieldRow {
  path: string;
  type: string;
  required: boolean;
  rank: number | null;
  movementPct: number | null;
  /** Gap elasticity across the three archetypes, as a range ("0.00–0.29"). */
  elasticity?: string;
  /** Coupling groups this field belongs to, if any. */
  coupled?: string[];
  /** Measurement tier: measured / swept only (+reason) / not swept. */
  status?: string;
  placement: string;
}
const FIELD_ROWS: FieldRow[] = (fieldReference as { rows: FieldRow[] }).rows;

/**
 * The three measurement tiers, counted from the data rather than written down,
 * so the summary can never disagree with the table under it.
 *
 * The distinction matters and a bare "—" cell hides it: a field can be outside
 * the sweep entirely, inside it but unperturbable on these archetypes, or
 * measured and found to move nothing. Those are three different claims and
 * only the last one is a finding.
 */
const FIELD_TIERS = {
  total: FIELD_ROWS.length,
  measured: FIELD_ROWS.filter((r) => r.status === "measured").length,
  sweptOnly: FIELD_ROWS.filter((r) => r.status?.startsWith("swept only")).length,
  notSwept: FIELD_ROWS.filter((r) => r.status === "not swept").length,
};

/**
 * EVERY swept input with its two impacts — on the cost gap and on the CO₂
 * abatement cost. These are the two figures the model exists to produce, and
 * the two rankings diverge sharply (corridor length: 76.6% on the gap, 366%
 * on abatement cost), so both are shown per row; `DocsImpactTable` ranks by
 * the tab the reader picks (abatement cost by default).
 *
 * From the same generated artifact §38 reads; the two tables cannot
 * contradict each other.
 */
const SENSITIVITY_ROWS = (
  sensitivityArtifact as {
    ranked: {
      id: string;
      label: string;
      options?: unknown;
      range: readonly (string | number)[];
      movementByKpi: Record<string, number>;
    }[];
  }
).ranked
  .map((r) => ({
    id: r.id,
    label: r.label,
    /** A choice (fuel, hull, sourcing…): impact is across its options. */
    isChoice: typeof r.range[0] === "string",
    gap: r.movementByKpi.gapPvUsdM ?? 0,
    abatement: r.movementByKpi.costPerTonneCo2Usd ?? 0,
  }));




export default async function DocsPage() {
  await requireAccess("/docs");
  return (
    <>
      <TopBar />
      {/* The sidebar sits BESIDE the prose, and the prose keeps its measure:
          `max-w-4xl` stays on <main>, only this container grows. */}
      <div className="mx-auto flex max-w-7xl gap-8 px-4">
        <DocsNav parts={TOC_PARTS} ids={TOC_IDS} />
        <main className="min-w-0 max-w-4xl py-10 text-sm leading-6 text-neutral-800">
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
          ammonia dual-fuel Handymax bulkers (§35).
        </p>

        {/* Kept as the page's own Contents, and the ONLY navigation below
            `lg` where the sticky sidebar is hidden. Reads the same tree as the
            sidebar, so the two can no longer disagree. */}
        <nav className="mt-6 border border-neutral-300 bg-white p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Contents
          </p>
          {TOC_PARTS.map((part) => (
            <div key={part.title} className="mt-4 first:mt-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                {part.title}
              </p>
              <ol className="mt-1 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {part.sections.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="text-brand underline underline-offset-2 decoration-brand/30 hover:decoration-brand"
                    >
                      {s.label}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </nav>

                {/* ===================== PART A — THE MODEL IN TEN MINUTES ===================== */}
        <div className="mt-16 border-t-2 border-neutral-300 pt-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-deep">
            Part A
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-neutral-900">
            The model in ten minutes
          </h2>
          <p className="mt-2 text-neutral-600">
            The whole model in four short sections: what it compares, the one unit everything rests on, the formulas, and the published case it ships with.
          </p>
        </div>

<H id="overview">1. Overview &amp; how the model works</H>
        <p className="mt-2">
          The model compares two configurations of the <em>same</em>{" "}corridor —
          same route, same cargo, same schedule — differing only in the fuel
          chain: a <strong>green corridor</strong>{" "}(e-ammonia, e-methanol,
          liquid hydrogen, biodiesel or LNG, with its production, storage and
          handling assets) and a <strong>fossil corridor</strong>{" "}(the
          conventional baseline, LSFO by default). For every modelled year it
          builds each side&apos;s full cost line — CAPEX, OPEX, fuel and the
          five regulation schemes — discounts it to present value, and reports:
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
        <H3 id="overview-badges">Benchmarks, overrides and the source badges</H3>
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
            fuel consumption, the green vessel&apos;s fuel
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
          gap by ≥5% (§29).{" "}
          <strong>Standard</strong>{" "}shows everything. Every hidden field
          keeps its default or benchmark value — the mode never changes a
          number — and each section shows a counted strip naming how many
          hidden settings are in effect, one click from review. Which fields
          appear prominently is decided by the measured sensitivity results
          (§29), not by editorial judgement. Simplified additionally fixes
          the STRUCTURE: fuel is purchase-sourced (the sourcing selector and
          the map-sited build flow are Standard capabilities) and regulation
          is the self-designed scheme alone (toggle + CO2 price; the
          EU/IMO/US modules render only in Standard, with a strip reporting
          any that a scenario carries active).
        </p>

        <H id="fe-overview">2. The emission method &amp; functional unit</H>
        <p className="mt-2">
          <strong>A tonne of green fuel does not replace a tonne of fossil
          fuel.</strong>{" "}e-Ammonia carries 18,600 MJ/t against
          HFO&apos;s 40,500 (the Annex II residual row covering most
          VLSFO sold), so 1,000 t of e-ammonia replaces about 459.3 t of
          HFO — not 1,000 t. A calculator comparing tonne-for-tonne
          overstates avoided emissions by more than 2× for ammonia (3,437
          vs the correct 1,427 tCO2e on the reference case). The functional
          unit is therefore{" "}
          <strong>energy delivered on board (MJ)</strong>{" "}and every
          comparison runs through it — a hand-computed regression case guards
          exactly this trap.
        </p>

        <H id="engine">3. The engine: formulas</H>
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
          Derived benchmarks (the DERIVED badges): fuel consumption{" "}
          <code className="mx-1">
            2 × nm × roundtrips × GJ/nm × 1000 / LHV
          </code>
          , always — there is no alternative basis, only an override; green
          vessel CAPEX per ship{" "}
          <code className="mx-1">type CAPEX × (1 + premium)</code>; fossil
          vessel/storage/barge CAPEX = 0 and logistics OPEX × 0.3
          (existing-infrastructure rules). Purchase-type sourcing forces
          production lines to zero with precedence over overrides.
        </p>
        <p className="mt-2">
          <strong>Delivered-energy parity.</strong>{" "}CO₂ abated is a{" "}
          <em>mass</em>{" "}comparison — fossil tonnes × EF minus green tonnes
          × EF — so it only describes the same transport work when the two
          burns carry equal energy. The derived chain guarantees that: both
          sides solve one geometry against their own LHV, so the ratio is
          exactly 1.000. Overriding only one side&apos;s
          burn makes the sides carry different delivered energy, which is why
          the model
          computes green MJ against fossil MJ and raises an amber note past
          ±5% divergence, on the Results Energy card and the CO₂-abated
          figure itself. Nothing is clamped or rescaled — you may have reason
          to compare unequal work, and the model&apos;s job is to say that you
          are.
        </p>
        <p className="mt-2">
          The costs decompose exactly: the per-year lines sum to the total
          by construction, the waterfall&apos;s Δ terms are differences of the
          decomposition lines, and the decomposition&apos;s total row equals
          the headline gap to the last digit.
        </p>
        <H id="prov-default">4. The default scenario — the Chilean copper-concentrate corridor</H>
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
          <strong>The table above is the study-calibration variant — the
          study&apos;s own emission accounting, reproduced exactly.</strong>{" "}
          The current default scenario derives its factors from the emission
          method (§15–§30) instead, and the two variants therefore differ
          deliberately: the current default computes a post-regulation gap
          of{" "}
          <strong>$1,819.48m</strong>{" "}where the study-calibration variant
          pins $1,762.21m; CO2 abated of{" "}
          <strong>1,118,236 t</strong>{" "}against the variant&apos;s
          study-exact 1,450,095 (a WtW=0 green ammonia is not a certifiable
          value; the derived blend is 22.14 gCO2e/MJ, §15); and $1,627/tCO2 against
          the variant&apos;s $1,215. Under the current default the green side
          also pays the self-designed CO2 price
          ($60.75m PV; fossil $253.71m on the Annex II 91.744/40,500
          row). The pre-regulation figures are factor-independent and
          identical in both.
        </p>
                {/* ===================== PART B — BUILDING A SCENARIO, TAB BY TAB ===================== */}
        <div className="mt-16 border-t-2 border-neutral-300 pt-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-deep">
            Part B
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-neutral-900">
            Building a scenario, tab by tab
          </h2>
          <p className="mt-2 text-neutral-600">
            Every tab of the wizard in order — what each field is, what the model does with it, and where the numbers come from when you type nothing.
          </p>
        </div>

<H id="tab-intro">5. Tab 01 — Intro</H>
        <p className="mt-2">
          Defines the trade lane: route, countries, ports and the model
          horizon. Each end of the corridor is its own boxed group — country
          first (the constraining choice), then the port name and the
          coordinates that drive the map and the sea routing. In every field
          table below, <em>Benchmark / default</em>{" "}is the value the model
          uses until you override it; <em>What it does</em>{" "}explains the
          effect on the result.
        </p>
        <Fields
          rows={[
            [
              "Corridor type",
              "—",
              "Point-to-point",
              "Point-to-point shows two ports (A and B); single point shows one.",
            ],
            [
              "Country (port A)",
              "—",
              "Chile (default)",
              "THE anchor input: selects the financing (WACC) benchmark. Denmark, Netherlands, India, Brazil, Singapore and the United States carry their own reference benchmarks (5.5–11.5%); any other country silently falls back to the generic 8% benchmark. All are flagged unverified.",
            ],
            [
              "Port A / Port B",
              "text",
              "Mejillones / Japan (Asia)",
              "Named berths for the corridor; free text, shown in the results snapshot.",
            ],
            [
              "Port coordinates (lat/lon, both ends)",
              "°",
              "−23.10/−70.45 → 35.45/139.65",
              "Drive the route map, the sea-routed distance benchmark below, and the plant→port logistics leg of a build-here site. Clearing them simply removes the route drawing — the cost model still works from the typed distance.",
            ],
            [
              "Corridor length, one-way",
              "nm",
              "9,500 (default)",
              "One-way distance; drives fuel consumption (×2 per roundtrip) — among the strongest inputs in the model (§29). With both ports pinned, the model also computes an INDICATIVE sea route on the maritime network (canal transits labelled Panama/Suez) and shows it as a derived benchmark: adoption is an explicit click, never automatic, and a typed distance diverging >15% from the routed figure gets an amber note.",
            ],
            [
              "Model start year",
              "year",
              "2030 (default)",
              "Calendar year of year 1. Matters for the regulation schedules: the ETS phase-in, the FuelEU target ladder and the IMO trajectories are calendar-anchored (§11).",
            ],
            [
              "Years modelled",
              "yr",
              "15 (default; max 40)",
              "The horizon. Costs and cargo beyond it are not counted.",
            ],
            [
              "Emissions basis",
              "—",
              "well-to-wake (new scenarios)",
              "What “CO2 abated” (and $/tCO2) counts: combustion (tank-to-wake) or well-to-wake (lifecycle). Standard view only; the Chilean default runs well-to-wake. The rate basis lives on the Financing tab.",
            ],
          ]}
        />
        <p className="mt-2 text-neutral-600">
          The financial frame — discount rate (WACC), inflation and the rate
          basis — lives on the Financing tab (§10); the cargo identity on the
          Cargo tab (§8). In an exported scenario file these fields are
          stored under{" "}
          <code>cargo.*</code>{" "}— the field names inside the file do not
          follow the tab that renders them.
        </p>

        <H id="tab-energy">6. Tab 02 — Energy</H>
        <p className="mt-2">
          The heart of the comparison: what each side burns and where it comes
          from. Both sides carry the same field set; the interesting choice is
          the green side&apos;s <strong>sourcing</strong>{" "}mode.
        </p>
        <H3 id="energy-sourcing">Sourcing modes</H3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Purchase fuel</strong>{" "}— fuel bought at a price:
            the benchmark market price, or your own number as an override — a
            market assumption and a contracted delivered price are the same
            arithmetic, so both live here.
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
          Older saved scenarios open under the closest current mode; if a
          fuel price was set, a dismissable banner flags it and the price row
          stays visible for comparison.
        </p>
        <H3 id="energy-buildhere">Build-here: from an evaluated site to the cost structure</H3>
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
            tonne, following the six-tenths rule (cost scales with
            capacity^0.6):{" "}
            <code>(nameplate / 1.2Mt)^(0.6−1) × FOAK</code>. At 60 kt/yr that
            is ×3.31 on synthesis capital before the archetype multiplier
            (×4.14 under the corridor default: first-of-a-kind dedicated,
            ×1.25). A ~60 kt plant sits ~20× below the
            reference scale, so the six-tenths rule is being stretched well
            past its comfortable range — anything beyond 5× is flagged in
            the site&apos;s assumptions panel.
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
            the site summary chip in the Energy tab is a display figure
            only — the corridor prices from the raw CAPEX/OPEX lines.
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
        <H3 id="energy-acceptance">Build-here worked example: two Atacama sites</H3>
        <p className="mt-2">
          Both study candidate sites evaluated through the real flow
          (map-mode gated profiles → LCOH engine → scaled to the 59,850 t/yr
          nameplate) against the Chilean default corridor, on the current
          basis: IEA-2024 electrolyser basis,
          NEOM-anchored synthesis, firm power, first-of-a-kind archetype:
        </p>
        <div className="my-3 overflow-x-auto">
          <table className="w-full border border-neutral-300 text-[13px]">
            <thead>
              <tr className="border-b border-neutral-300 bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th className="px-3 py-2 font-medium">Site</th>
                <th className="px-3 py-2 font-medium">LCOH &amp; duty</th>
                <th className="px-3 py-2 font-medium">Plant cost</th>
                <th className="px-3 py-2 font-medium">Corridor result</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-neutral-200 align-top">
                <td className="whitespace-nowrap px-3 py-2 font-medium">
                  María Elena (−22.35, −69.66)
                </td>
                <td className="px-3 py-2 tabular-nums text-neutral-700">
                  LCOH $8.97/kg · 27.6% duty
                </td>
                <td className="px-3 py-2 tabular-nums text-neutral-700">
                  CAPEX $973.5m · OPEX $55.2m/yr
                </td>
                <td className="px-3 py-2 text-neutral-700">
                  116 km to Mejillones. Central $2,707/t (range
                  $2,209–$3,027). H2 plant $626.0m + synthesis $347.5m; firm
                  PPA chosen at $17.1m/yr. Green PV $2,549.6m; gap $1,711.3m
                  pre-regulation / $1,461.1m post; $1,007.60/tCO2 WTW.
                </td>
              </tr>
              <tr className="border-b border-neutral-200 align-top last:border-0">
                <td className="whitespace-nowrap px-3 py-2 font-medium">
                  La Negra (−23.75, −70.30)
                </td>
                <td className="px-3 py-2 tabular-nums text-neutral-700">
                  LCOH $9.58/kg · 24.5% duty
                </td>
                <td className="px-3 py-2 tabular-nums text-neutral-700">
                  CAPEX $1,024.2m · OPEX $55.7m/yr
                </td>
                <td className="px-3 py-2 text-neutral-700">
                  74 km to Mejillones. Central $2,808/t (range $2,297–$3,140).
                  H2 plant $676.7m + synthesis $347.5m; firm PPA chosen at
                  $17.1m/yr. Green PV $2,606.0m; gap $1,767.8m pre-regulation
                  / $1,517.6m post; $1,046.55/tCO2 WTW.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2">
          <strong>Reconciliation.</strong>{" "}Build-here lands within ~12%
          of the study: $2,707/t at María Elena and $2,808/t at La Negra
          against <strong>$3,071/t</strong>{" "}for the study&apos;s fitted
          block ($1,100m / $72m/yr) annuitized at the corridor&apos;s 8% —
          inside the ~20% screening threshold, with the study&apos;s figure
          falling inside La Negra&apos;s reported range. The residual has
          three known unmodelled items, each of which would move the number
          the same way: differentiated green financing and a scenario-level
          synergy adjustment (which the study quantifies at ≈$250m each),
          and terminal plant value at the 15-year horizon.
        </p>
        <p className="mt-2">
          <strong>Site-to-site is the point.</strong>{" "}La Negra costs $100/t
          (3.7%) more than María Elena — better siting economics at María Elena
          (LCOH $8.97 vs $9.58/kg) partly offset by its longer haul (116 vs 74
          km). Absolute-level errors largely cancel in that comparison, which
          is what the map is actually for; the level is a screening estimate,
          the ordering is the product.
        </p>
        <H3 id="energy-perfuel">Per-fuel fields (each side)</H3>
        <Fields
          rows={[
            [
              "Fuel type",
              "—",
              "green: e-Ammonia · fossil: LSFO",
              "Selects the fuel's benchmark bundle: price, emission factors, energy density, production/storage/barge costs, vessel premium (§17).",
            ],
            [
              "Fuel price",
              "$/t",
              "e-ammonia 900 · LSFO 594",
              "Fuel price under purchase mode — benchmark market price, or your contracted delivered price as an override. Hidden under build-plant/build-here unless the scenario carries the legacyExcelConstruct flag, which keeps the price row charged alongside production costs.",
            ],
            [
              "Fuel consumption",
              "t/vessel/yr",
              "default: 5,700 green / 2,638 fossil (study)",
              "Always derived: 2 × distance × roundtrips × GJ/nm × 1000 / LHV, with a direct override as the escape hatch. The green side needs ~2.2× the mass because ammonia carries less energy per tonne. Worked example (tanker-35k at 4.0 GJ/nm, 500 nm × 12 roundtrips): green 2,580.6 t, fossil 1,194.0 t. The Chilean corridor's geometry (Handymax at 2.334 GJ/nm, 9,500 nm × 3) implies 7,152.6 and 3,284.9 — that scenario states its burns as overrides instead, to reproduce the study.",
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

        <H id="tab-vessels">7. Tab 03 — Vessels</H>
        <p className="mt-2">
          The ships that serve the corridor. One vessel type is shared by
          both sides. <strong>The CAPEX/OPEX cells are PER SHIP</strong>{" "}—
          enter per-ship costs, and the vessel count multiplies them into
          the fleet total, along with fuel burn and every regulation term.
          The benchmark underneath each cell is per-ship too (type CAPEX ×
          (1 + premium)), so the field and the value offered by
          &ldquo;restore&rdquo; are always the same dimension. The default
          scenario costs both fleets as newbuilds: green 10 × $44m = $440m,
          fossil 10 × $35m = $350m.
        </p>
        <Fields
          rows={[
            [
              "Vessel type",
              "—",
              "Handymax bulk (58k dwt), default",
              "Sets the per-ship benchmark CAPEX/OPEX and the energy-per-mile figure (GJ/nm) that consumption derives from. 35 researched classes from Handysize bulk to 174k-m³ LNG carrier (§17). Some retired classes are hidden from the picker but still resolve if a saved scenario names one; they carry older energy figures, so do not use them for new work.",
            ],
            [
              "Number of vessels",
              "ships",
              "10 (default)",
              "Multiplies fuel burn, every regulation term, and the per-ship vessel CAPEX/OPEX into fleet totals.",
            ],
            [
              "Roundtrips per year",
              "1/yr",
              "3 (default)",
              "Multiplies fuel burn: consumption is 2 × corridor length × roundtrips × GJ/nm ÷ the fuel's energy density.",
            ],
            [
              "Service speed",
              "kn",
              "the vessel type's own (optional)",
              "Corrects the vessel's energy for sailing faster or slower than its DESIGN speed, at the SQUARE of the ratio — GJ per day scales with v³, but nm/day scales with v, so GJ per nm scales with v². Leave unset unless speed is a choice you are modelling: several catalogue rows take their energy from a published study, and that figure is already the burn at that study's speeds, so correcting it again double-counts.",
            ],
            [
              "Port days per round trip",
              "days",
              "none (optional)",
              "Fuel burned alongside at zero miles, from the vessel's port and cargo-system day rates. A distance-only formula cannot express this at all, and it is not always small — GMF's cycle is 24 laden + 7 port + 22 ballast days. Every day rate behind it is a sector ESTIMATE, so the Results panel reports the share of round-trip energy it accounts for and warns past ~10%.",
            ],
            [
              "Green vessel CAPEX",
              "$m",
              "derived: type CAPEX × (1 + fuel premium)",
              "Per ship. New-build premium for the green fuel (e-ammonia +25%, LH2 +30%, e-methanol +15%…). Tanker 35k × e-ammonia benchmark: 20 × 1.25 = 25 — a single-hull figure, matching the field.",
            ],
            [
              "Green vessel OPEX",
              "$m/yr",
              "type OPEX (1.2)",
              "Per ship, annual operating cost excl. fuel; inflated.",
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

        <H id="tab-cargo">8. Tab 04 — Cargo</H>
        <p className="mt-2">
          Deliberately thin: the cargo identity only. The engine counts
          units — throughput feeds the per-unit figures and lifetime cargo,
          never fuel burn or vessel counts.
        </p>
        <Fields
          rows={[
            [
              "Cargo unit",
              "tonne | TEU",
              "by vessel type",
              "What one cargo unit IS. Defaults to tonne for tankers/bulk/Ro-Ro and TEU for container vessels. Switching writes the weight: TEU sets it to the 10 t benchmark, tonne pins it to 1 (and the weight field hides).",
            ],
            [
              "Weight per unit",
              "t",
              "1 (tonne) / 10 (TEU)",
              "Renders only for TEU; used to derive cost per tonne of cargo. A stored tonne scenario with a different weight still computes with its stored value — nothing is rewritten on load.",
            ],
            [
              "Annual cargo throughput",
              "units/yr",
              "1,650,000 (default)",
              "Only feeds the per-unit figures and lifetime cargo — the sweep measures exactly 0.0% headline movement (§29). Standard view only.",
            ],
          ]}
        />

        <H id="tab-ports">9. Tab 05 — Ports</H>
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

        <H id="tab-financing">10. Tab 06 — Financing</H>
        <p className="mt-2">
          Everything about the cost of money. The corridor discount rate
          (WACC, with its unverified-benchmark badge — the amber tab dot
          lives here), the inflation rate (stored under{" "}
          <code>cargo.*</code>{" "}in the scenario file, §5) and the{" "}
          <strong>rate basis</strong>{" "}— nominal (inflation escalates
          costs, the nominal WACC discounts them) or real (deflates the OPEX
          escalation) — then the two optional modules
          below. Both are off by default and both leave the default
          scenario&apos;s results untouched.
        </p>
        <H3 id="fin-differentiated">Differentiated green financing</H3>
        <p className="mt-2">
          Off by default. The module prices concessional green debt as an
          explicit interest saving on the green side&apos;s debt-financed
          capital — its own float in the cost bridge, its own row in the
          decomposition. The toggle initialises concrete values (base rate =
          the corridor&apos;s current discount rate, green rate 6%, full
          debt, tenor min(15, horizon), amortizing); the green rate stays
          visible — a negotiation outcome, not a market observable — and the
          other parameters sit behind the Standard view. The arithmetic, and
          why this is deliberately NOT a per-side discount rate, is below.
        </p>

        <H3 id="fin-phasing">Capital deployment schedule</H3>
        <p className="mt-2">
          Off by default (all CAPEX in year 1). Phasing spreads each
          side&apos;s CAPEX over the first 1–5 years by explicit shares,
          with a 30/40/30 preset matching the reference study&apos;s build
          profile; shares must sum to 1 per side, and the model refuses to
          compute rather than silently rescaling. The green financing
          drawdown follows the same schedule; the arithmetic is below.
        </p>


        <H3 id="engine-financing">Differentiated green financing (flag-gated, default off)</H3>
        <p className="mt-2">
          <strong>
            The obvious implementation — a lower discount rate on the green
            side — is wrong, and wrong in the interesting direction.
          </strong>{" "}
          This is a cost model: the discount rate expresses time preference
          over costs, so lowering it makes future costs LARGER in present
          value. On the reference corridor, green operating cost of $112.00m/yr
          inflated at 2% discounts to $1,160.7m at 8% but $1,301.2m at 6% —
          &quot;cheap green financing&quot; implemented as a rate swap makes
          the green corridor $140.6m WORSE, the exact inversion of the benefit
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
          amortizing structure yields $195.9m and bullet $312.5m; the
          study&apos;s ≈$250m lies between them, consistent with partial
          amortization or a grace period whose structure the study does not
          state. Nothing is tuned to force $250m — a forced match would
          fabricate precision the source does not provide.
        </p>
        <H3 id="engine-phasing">Capital deployment schedule (flag-gated, default off)</H3>
        <F>
          CAPEX<sub>t</sub>{" "}= Σ component CAPEX × w<sub>t</sub>, &nbsp;Σ w
          = 1 per side (validated by name, never normalised)
          <br />
          cumdraw<sub>t</sub>{" "}follows the same weights — the financing
          line&apos;s outstanding balance tracks the phased drawdown
        </F>
        <p className="mt-2">
          By default every capital dollar lands in year 1 at a discount
          factor of exactly 1.0 — the reference convention,
          and the most conservative PV treatment. Phasing spreads each
          side&apos;s CAPEX over the first N years by explicit shares:
          later capital discounts more, so its present value falls and
          never rises (r ≥ 0). A worked example — these are the phased
          example&apos;s own figures, not the default headline: at 30/40/30
          on both sides
          of the reference corridor (PV factor 0.92757) the green CAPEX PV
          is $1,567.6m, fossil $333.9m, the pre-regulation gap $1,916.1m
          and the headline gap $1,665.9m; phasing the green side alone
          moves the gap by −$122.4m. Weights that do not sum to 1 are
          rejected naming the exact field — a schedule that silently
          rescaled would misstate the capital program. No new output
          fields: phasing re-times existing lines, so the shape of the
          results is unchanged by construction.
        </p>

        <H id="tab-regulation">11. Tab 07 — Regulation</H>
        <p className="mt-2">
          Five schemes, each with its own toggle. All monetary terms use the
          EUR/USD rate (default 1.08) where the scheme is euro-denominated,
          and all are calendar-anchored — moving the start year moves the
          corridor through the schedules. <strong>In the Chilean default all
          three named schemes are OFF</strong> (a Chile → Japan corridor
          touches no EEA port; production is Chilean, so 45Z cannot apply) —
          the self-designed scheme is ON at $280/tCO2 as a proxy for the IMO
          Net-Zero Framework, the one scheme that would actually apply (a
          first-class IMO NZF module now exists — below — and is off by
          default). In a Simplified project only the self-designed scheme
          renders (toggle + CO2 price); the other four appear in Standard,
          with a counted strip if a scenario carries one of them active.
        </p>

        <H3 id="reg-accounting">Emission accounting</H3>
        <p className="mt-2">
          The tab opens with the{" "}<strong>accounting-framework
          selector</strong>{" "}(visible in both view modes):{" "}
          <strong>FuelEU Maritime by default</strong>, IMO Net-Zero
          switchable. It governs which framework&apos;s factors the
          corridor&apos;s fuel intensities derive from — the same physical
          bunker is 91.744 gCO2e/MJ under FuelEU&apos;s Annex II viscosity
          row and 94.90 under the IMO&apos;s 0.10–0.50%-sulphur band
          (MEPC.391(81)), and each framework fixes its own GWP set (AR4 vs
          AR5). Green fuels derive as certified pathway WtT + N2O slip +
          pilot blend from the fuel-emissions dataset (§15–§30). Two rules
          keep it honest: the FuelEU and IMO <em>compliance modules</em>{" "}
          each price with their OWN framework regardless of this selection
          (the selector moves the reported intensities, abatement and the
          self-designed CO2 price), and explicit factor overrides in the
          Energy tab always win. Older saved scenarios open under FuelEU
          accounting; a scenario that pins its own stored factors keeps
          them, so its numbers never move.
        </p>

        <H3 id="reg-ets">EU ETS (maritime)</H3>
        <F>
          EF<sub>CO2e</sub>{" "}= combustion EF{" "}[+ CH4 t/t × GWP<sub>CH4</sub>{" "}
          + N2O t/t × GWP<sub>N2O</sub>, from the gas-coverage year]
          <br />
          ETS cost<sub>t</sub>{" "}= vessels × fuel t × EF<sub>CO2e</sub>{" "}×
          phase-in(cal) × scope × EUA € × EURUSD / 10⁶
        </F>
        <p className="mt-2">
          Phase-in: 0 before 2024 → 40% (2024) → 70% (2025) → 100% (2026+).
          Defaults: EUA €80/t, scope 1.0 — <strong>1.0 for intra-EEA
          voyages, 0.5 for a voyage between an EEA and a third-country
          port</strong>{" "}(100% of emissions between EU/EEA ports, 50%
          between an EEA and a non-EEA port). An optional annual{" "}
          <em>price escalation</em>{" "}(Advanced fold, default 0) compounds
          the EUA price as (1+esc)^(t−1) — 0 keeps the flat nominal price, a
          falling real price under inflation; the same control exists on the
          self-designed CO2 price.
        </p>
        <p className="mt-2">
          ETS prices combustion CO2e, so it burdens a fuel by its{" "}
          <strong>fossil</strong>{" "}carbon content. Certified biogenic and
          RFNBO carbon is zero-rated under the Directive and is flagged as
          such on the fuel row; a carbon-free fuel then pays only for its
          fossil pilot fuel. Certified e-methanol burns 1.4550 tCO2/t at the
          stack but is chargeable for 0.0800 — the 5% MGO pilot alone — while
          every other basis in the model still sees the full stack factor.
        </p>
        <p className="mt-2">
          From 2026 the charge covers CH4 and N2O as well as CO2, and{" "}
          <em>gas coverage</em>{" "}is therefore ON by default from that year,
          with the slip factors and GWPs derived from the selected accounting
          framework rather than typed. This is material: methane slip is 23%
          of the ETS charge for an LNG dual-fuel medium-speed Otto engine
          (3.1% slip under FuelEU, 3.5% under IMO) against 3% for a
          slow-speed diesel, and ammonia&apos;s N2O slip is the same order as
          its pilot term. Non-CO2 gases are <strong>not</strong>{" "}zero-rated
          by carbon origin — bio-LNG still pays for its methane.
        </p>
        <p className="mt-2">
          ETS is a <strong>tank-to-wake</strong>{" "}instrument and is
          unaffected by the model&apos;s emissions-basis flag — unlike the
          self-designed scheme, which follows it. Blue, grey and e-ammonia
          therefore carry the same ETS charge: all three are carbon-free at
          the stack, and their upstream differences appear in FuelEU, the IMO
          GFI (the IMO&apos;s greenhouse-gas fuel intensity measure) and the
          abatement figure instead.
        </p>

        <H3 id="reg-fueleu">FuelEU Maritime</H3>
        <F>
          deficit<sub>t</sub>{" "}= max(0, WTW − baseline × (1 − target(cal)))
          <br />
          penalty<sub>t</sub>{" "}= deficit × (vessels × fuel t × LHV) / WTW /
          VLSFO MJ/t × penalty €/t × scope × EURUSD / 10⁶
          <br />
          credit<sub>t</sub>{" "}= surplus × [RFNBO ×mult until year] × mass ×
          value €/t × scope × EURUSD / 10⁶ &nbsp;(credit enabled, surplus
          &gt; 0)
        </F>
        <p className="mt-2">
          WTW here is always the{" "}
          <em>FuelEU-accounted</em>{" "}intensity: when the emission method
          derives both frameworks&apos; values (§14), this module reads the
          FuelEU one regardless of the framework selected for display —
          FuelEU compliance is never priced with IMO numbers, or vice
          versa.
        </p>
        <p className="mt-2">
          The GHG-intensity target ladder tightens from 2% (2025) through 6%
          (2030), 14.5% (2035), 31% (2040), 62% (2045) to 80% (2050), against
          the 91.16 gCO2e/MJ baseline (both the baseline and the VLSFO
          energy content are parameters; defaults €2,400/t and 41,000 MJ/t).
          The max(0,·) clamp means a compliant fuel pays exactly zero under
          the default — e-ammonia at WTW 15 is compliant for the whole
          ladder, so the green side&apos;s FuelEU line is exactly $0.00m while
          LSFO&apos;s grows with every step. The optional{" "}
          <em>over-compliance credit</em>{" "}(off by default)
          replaces the clamp: a surplus earns revenue at the configured
          value per notional VLSFO-eq tonne, with the RFNBO multiplier
          (×2 by default) applied until its cutoff year — with it on, a
          compliant fuel earns rather than paying zero.
        </p>

        <H3 id="reg-ira45z">IRA 45Z clean fuel credit (green side only)</H3>
        <F>
          credit<sub>t</sub>{" "}= − vessels × fuel t × (rate $/gal ÷ 122.5 MJ/gal
          × LHV) / 10⁶ &nbsp; (if enabled AND US-produced)
        </F>
        <p className="mt-2">
          A negative cost (income). Default rate $1/gal-equivalent, converted
          through the fuel&apos;s energy content. The reference case has no
          sunset year; the model reproduces that, with an optional{" "}
          <em>effective-until</em>{" "}calendar year that zeroes
          the credit in later years — the credit as legislated runs to
          end-2027. Absent or null both mean &ldquo;no sunset&rdquo;.
        </p>

        <H3 id="reg-selfdesigned">Self-designed regulation</H3>
        <F>
          cost<sub>t</sub>{" "}= + vessels × t × EF(basis) × CO2 $/t ×
          (1+esc)^(t−1) /10⁶ &nbsp; (both sides)
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
          The CAPEX/OPEX support instruments live inside self-designed
          regulation, not on the Financing tab, because they are policy
          instruments, not loan terms — the schemes they approximate are
          contracts-for-difference and capital grants. One scheme, one
          toggle.
        </p>

        <H3 id="reg-imo">IMO Net-Zero Framework (provisional)</H3>
        <F>
          attained GFI = the side&apos;s WTW intensity, IMO-accounted
          [gCO2eq/MJ] — the sulphur-binned fossil WtT and AR5 GWP set
          when derived (§14); falls back to the single WTW scalar on
          scenarios that pin stored factors
          <br />
          base / direct target<sub>t</sub> = 93.3 × (1 − ladder(cal))
          <br />
          cost<sub>t</sub> = (tier1 tCO2e × $100 + tier2 tCO2e × $380 −
          surplus tCO2e × reward $/t) × esc(t) × scope / 10⁶, &nbsp;
          esc(t) = (1+priceEscalation)^(t−1)
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
          0 (a non-zero rate SUBTRACTS from the cost, inside the same term).
          An optional price escalation compounds the tier prices and the
          reward together. If a pinned bundle lacks the IMO rows the module
          reports{" "}
          <em>not parameterised</em>{" "}instead of computing zero. Off by
          default everywhere.
        </p>

        <H3 id="reg-options">Model options</H3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Emissions basis</strong>{" "}— what &ldquo;CO2 abated&rdquo;
            (and $/tCO2) counts: combustion (tank-to-wake, the reference
            convention) or well-to-wake (lifecycle, the app&apos;s default for
            new scenarios). Under well-to-wake the results report BOTH
            tonnages side by
            side (§12); under the combustion default
            the single series is the combustion one. The selector renders on
            the Intro tab, Standard view.
          </li>
          <li>
            <strong>Fossil fleet basis</strong>{" "}— what the fossil
            counterfactual IS. The reference convention benchmarks fossil
            vessel CAPEX to <em>zero</em>: the ships are already afloat, so
            the comparison charges the green corridor for newbuilds and the
            fossil one for nothing. That is right for{" "}
            <em>&ldquo;what does switching cost?&rdquo;</em>{" "}and wrong for{" "}
            <em>&ldquo;what does this trade lane cost, either way?&rdquo;</em>{" "}
            — a greenfield corridor buys conventional tonnage too. Setting it
            to <strong>newbuild</strong>{" "}derives fossil vessel CAPEX from
            the vessel type, with no green-fuel readiness premium (a
            conventional ship does not pay one). Port and logistics rules stay
            on the existing-infrastructure basis under both settings: needing
            new ships is a different claim from needing new terminals.
            Absent = <strong>existing</strong>, the reference behaviour.
          </li>
        </ul>

        <H id="tab-results">12. Tab 08 — Results</H>
        <p className="mt-2">
          The full report. Every element recomputes on every keystroke; a
          compact summary of the same numbers stays docked on the input tabs.
          Reading order: KPI strip, scenario snapshot strip, the two cost
          bridges + the decomposition table, the two charts, then one result
          card per input tab. A{" "}<strong>Download Excel</strong>{" "}button
          above the report exports the same numbers as a styled two-sheet
          file (“Results”: headline, decomposition, per-year table;
          “Inputs”: every resolved input grouped by tab with its
          provenance).
        </p>
        <H3 id="results-kpis">KPI strip</H3>
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
        <p className="mt-2 text-neutral-600">
          The gap, per-unit and per-tonne KPIs each carry a secondary
          &ldquo;… before regulatory instruments&rdquo; line — the same
          quantity with every scheme (and the financing line) removed, so
          the regulation effect is always visible next to the headline.
        </p>
        <H3 id="results-snapshot">Scenario snapshot strip</H3>
        <p className="mt-2">
          Directly under the KPIs: one compact line stating what corridor the
          numbers describe — route &amp; ports, cargo unit &amp; weight,
          distance, start year &amp; horizon, fleet &amp; roundtrips, fuels
          &amp; sourcing, derived fuel use per vessel-year, lifetime cargo.
          Everything below reads in that context, and an exported screenshot
          is self-describing.
        </p>
        <H3 id="results-waterfalls">Cost bridges (two waterfalls)</H3>
        <p className="mt-2">
          The MMMCZCS-style breakdown. Left to right:{" "}
          <strong>Total cost of green corridor*</strong>{" "}(anchored),{" "}
          <strong>Total cost of fossil corridor*</strong>{" "}(hangs from the
          green total down to the gross level),{" "}
          <strong>Gross cost before regulation</strong>, then{" "}
          <strong>Regulations</strong>{" "}(every instrument in one bar) and{" "}
          <strong>Optimized financing</strong>{" "}(the green-debt interest
          line, which is not a policy and so never sits inside regulation),
          landing on <strong>Incremental cost</strong>{" "}— the headline
          gap.
        </p>
        <p className="mt-2">
          Regulation is <strong>grouped, not itemised</strong>. Hover the bar
          to see each instrument inside it —{" "}
          <strong>including those that do not apply to this
          corridor</strong>, shown as
          &ldquo;not applicable&rdquo; rather than omitted. That distinction
          matters: a corridor touching no EEA port genuinely escapes ETS and
          FuelEU, and a missing row would read as &ldquo;nobody modelled
          this&rdquo; instead of &ldquo;this scheme does not reach here&rdquo;.
          The decomposition table below carries the same instruments as exact
          numbers. A float that <strong>widens</strong>{" "}the gap is coloured
          differently from one that closes it, on the CVD-safe diverging pair.
        </p>
        <H3 id="results-funding">Who pays: the funding split</H3>
        <p className="mt-2">
          Set a{" "}<strong>cargo-owner willingness to pay</strong>{" "}(Financing
          tab, $/tCO2e abated, default 0) and the waterfall continues past the
          incremental cost into two more bars:{" "}
          <strong>Cargo owner green premium</strong>{" "}and{" "}
          <strong>Public funding</strong>. This is the MMMCZCS figure&apos;s
          right-hand block, and it answers a different question from
          everything left of it.
        </p>
        <p className="mt-2">
          <strong>It is an allocation, not a cost — and the distinction is
          load-bearing.</strong>{" "}The willingness to pay never enters the
          corridor&apos;s present value, so the headline gap does not move when
          you set it: a customer agreeing to pay does not make the corridor
          cheaper to run. A model that reported a smaller gap because somebody
          volunteered money would be conflating what a corridor{" "}
          <em>costs</em>{" "}with how it is <em>funded</em>. Priced per tonne
          abated rather than per tonne of cargo, so it scales with what the
          corridor actually delivers — a commitment to fund
          decarbonisation, not freight.
        </p>
        <p className="mt-2">
          <strong>Public funding is the residual</strong>{" "}— the
          incremental cost less the cargo-owner share — and is never
          entered directly. That is what makes the bar honest: it always
          balances, and it answers &ldquo;how large is the funding
          gap?&rdquo; rather than asserting an answer. If the willingness to
          pay exceeds the incremental cost the residual goes{" "}
          <strong>negative</strong>, and it is reported that way rather than
          clamped at zero: an over-funded corridor pays for itself
          commercially, which is a result worth seeing, not a floor to hide
          behind. Default 0 means the split is absent entirely — a
          willingness to pay is a fact about one negotiation, never a
          benchmark the model can supply.
        </p>
        <p className="mt-2">
          The bars always sum back to the headline gap. A{" "}
          <strong>second waterfall</strong>{" "}repeats the same bars
          denominated in $ per tonne of CO2 abated (every step over the same
          lifetime abatement, active basis tagged), so the gross bar reads the
          pre-regulation abatement cost and the final bar the headline $/tCO2.
        </p>
        <H3 id="results-decomposition">Cost decomposition table</H3>
        <p className="mt-2">
          The same information as exact numbers: green | fossil | Δ rows for
          CAPEX, operating cost, a{" "}
          <strong>subtotal before regulation</strong>, then EU ETS, FuelEU,
          IRA 45Z, self-designed, the{" "}
          <strong>green financing effect</strong>{" "}(when the module is on)
          and IMO Net-Zero (when active), with the signed Δ column in the
          waterfall&apos;s colors. The total row equals the headline gap to
          the last digit. Green-side-only lines (45Z, financing) show
          &ldquo;—&rdquo; on the fossil side.
        </p>
        <H3 id="results-charts">Charts</H3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Annual cost, green vs fossil</strong>{" "}— undiscounted
            cost per year, stacked by cost NATURE per side (CAPEX / operating
            / regulation), every modelled year labelled. A caption states how
            much green capital year 1 carries and what share of the lifetime
            gap year 1 alone is; with a capital deployment schedule on, the
            caption switches wording (“charged in full up front” would be
            false).
          </li>
          <li>
            <strong>Emissions &amp; abatement</strong>{" "}— the premium per
            tonne of CO2 avoided on each emissions basis, BEFORE and AFTER
            the regulation modules (grouped bars), against a dashed
            carbon-price reference chosen by precedence from the ACTIVE
            schemes: ETS allowance price → self-designed CO2 price → the
            IMO tier-1 price → none (each with its own caption; with no
            scheme active the caption says so instead of showing a stale
            price).
          </li>
        </ul>
        <H3 id="results-bytab">Results by tab</H3>
        <p className="mt-2">
          The bottom band mirrors the input steps — one equal-framed card
          per COST-CARRYING tab (Intro has no card of its own; its identity
          renders in the snapshot strip above):
        </p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>02 Energy</strong>{" "}— fuel use per vessel-year,
            production CAPEX/O&amp;M, fuel price and WTW intensity for both
            fuels.
          </li>
          <li>
            <strong>03 Vessels</strong>{" "}— fleet CAPEX and OPEX, green vs
            fossil.
          </li>
          <li>
            <strong>04 Cargo</strong>{" "}— cargo per year, lifetime cargo,
            cost per unit (pre- and post-regulation), CO2 abated on the
            active basis.
          </li>
          <li>
            <strong>05 Ports</strong>{" "}— storage and barge CAPEX/OPEX per
            side.
          </li>
          <li>
            <strong>06 Financing</strong>{" "}— the discount rate and
            inflation in use, the green financing effect (PV, when the
            module is on) and the capital deployment shares (green, with the
            fossil profile when it differs).
          </li>
          <li>
            <strong>07 Regulation</strong>{" "}— each scheme&apos;s
            discounted total per side incl. IMO when active, the{" "}
            <strong>regulation-only</strong>{" "}net effect on the gap
            (negative = regulation narrows it; the financing line reports on
            its own card), abatement cost on both bases with the active
            basis tagged, the carbon-price reference from the active scheme,
            the ZNZ surplus balance when the IMO module accrues one, and an
            amber &ldquo;not parameterised&rdquo; notice when the pinned
            bundle lacks the IMO rows.
          </li>
        </ul>

        <H id="workflow">13. Getting started: accounts, saving &amp; sharing</H>
        <p className="mt-2">
          The platform sits behind a sign-in: request access on the home page
          (granted automatically once you confirm your email), or sign in
          with an existing account. Time-limited accounts keep their saved
          scenarios past expiry; an extension restores everything as it was.
        </p>
        <p className="mt-2">
          <strong>Projects first.</strong>{" "}The app opens on the Projects
          tab; the input tabs unlock once a project is selected or created.
          Every account starts with five projects: the Chilean example, its
          three published-case variants (§35 explains what each one asserts)
          and a blank Simplified template. A project is{" "}
          <strong>Simplified or Standard</strong>{" "}— a one-way ladder:
          Simplified works purchase-sourced fuel against the self-designed
          scheme only and can be upgraded permanently to Standard, which
          opens plant construction, map-sited production and the EU/IMO/US
          regulation modules. Every change autosaves locally in your browser
          as the working copy of the current project, and the app asks
          before discarding unsaved changes.
        </p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Save / Duplicate</strong>{" "}— Save stores the scenario
            to your account and updates the open project (or creates one
            when none is open); Duplicate makes a copy. The URL carries the
            project id, so a bookmark reopens it. Renaming, share-link
            management and delete live on the Projects tab.
          </li>
          <li>
            <strong>Share</strong>{" "}— creates a read-only link anyone can
            open without an account; revoking it kills the link. Shared
            views show the stored results, offer an explicit recompute when
            the save predates the current model, and a signed-in viewer can
            open the scenario as their own draft.
          </li>
          <li>
            <strong>Export / Import JSON</strong>{" "}— downloads the
            scenario as a versioned file with every field present and unset
            fields explicit{" "}<code>null</code>, so the file documents the
            entire input surface. Import accepts the same complete form and
            older partial exports alike; older files are migrated on load.
          </li>
          <li>
            <strong>Status marks</strong>{" "}— every tab carries one of four
            marks: <strong>○</strong>{" "}not yet reviewed (you have not
            opened and left this tab for this project),{" "}
            <strong>▲</strong>{" "}worth checking (one of the model&apos;s own
            cautions, such as the two sides no longer delivering the same
            energy — a warning is never hidden by moving on; unverified
            reference values are flagged on the field itself, not on the
            tab), <strong>✕</strong>{" "}a fault that
            blocks results, and <strong>✓</strong>{" "}reviewed with nothing
            flagged. Hovering the mark says why; landing on a flagged tab
            focuses the offending control. Reviewed marks are remembered per
            project on this browser. The header also keeps a live gap chip
            and the project&apos;s Simplified/Standard level badge (with the
            one-way Upgrade button on Simplified projects).
          </li>
          <li>
            <strong>Reset</strong>{" "}— starts a new unsaved draft at the
            reference defaults (with confirmation) and detaches the
            workspace from the open project; the saved row is untouched.
          </li>
        </ul>

                {/* ===================== PART C — WHERE THE NUMBERS COME FROM ===================== */}
        <div className="mt-16 border-t-2 border-neutral-300 pt-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-deep">
            Part C
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-neutral-900">
            Where the numbers come from
          </h2>
          <p className="mt-2 text-neutral-600">
            The sources behind the benchmarks: the emission accounting, the reference tables, and the LCOH method that prices a build-here site.
          </p>
        </div>

<H id="fe-frameworks">14. Accounting frameworks</H>
        <p className="mt-2">
          The same fuel has different official values under different
          frameworks, so &ldquo;the&rdquo; emission factor does not exist —
          only <em>a framework&apos;s</em>{" "}emission factor. Two are
          supported, clearly labelled, never blended:
        </p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>FuelEU Maritime, Annex II</strong>{" "}(Regulation (EU)
            2023/1805) — legally fixed default values: LCVs, WtT factors,
            TtW CO2/CH4/N2O per fuel. GWP set{" "}
            <strong>AR4</strong>{" "}(CH4 25, N2O 298) as currently drafted;
            EMSA has flagged a move to AR5. RFNBO pathway values come from
            RED Delegated Regulation (EU) 2023/1185 under the Article 28(5)
            ceiling of 28.2 gCO2eq/MJ.
          </li>
          <li>
            <strong>IMO LCA Guidelines</strong>{" "}(MEPC.391(81), revising
            MEPC.376(79)) — the framework the Net-Zero Framework&apos;s GFI
            runs on. GWP set{" "}<strong>AR5</strong>{" "}(CH4 28, N2O 265);
            2008 reference GFI 93.3 gCO2eq/MJ; ZNZ threshold at most 19.0
            gCO2eq/MJ to end-2034 and 14.0 from 2035 (MEPC 83 approved
            text; adoption targeted MEPC 85, October 2026 — marked
            provisional). Defaults are not yet published for all fuels.
          </li>
        </ul>
        <p className="mt-2">
          The engine takes ONE framework id and reads every factor — and
          the GWP set — from it. Averaging frameworks, or mixing one
          framework&apos;s WtT with another&apos;s TtW, is structurally
          impossible. A (fuel, framework) combination missing a needed
          factor reports{" "}<em>not parameterised</em>{" "}with the
          dataset&apos;s own review note.
        </p>
        <p className="mt-2">
          The frameworks even CLASSIFY the
          same bunker differently: FuelEU bins residual fuels by ISO 8217
          viscosity grade while the IMO bins by sulphur content
          (MEPC.391(81)) — a typical 0.50%-S VLSFO is FuelEU&apos;s HFO row
          at WtT 13.5 but the IMO&apos;s 0.10–0.50%-S band at 16.8, a
          3.3-gCO2e/MJ divergence on the same physical fuel. The engine
          resolves the row per framework (a sulphur input appears under
          IMO) and substitutes an Annex II value ONLY where the IMO has no
          confirmed default (currently the distillate WtT), disclosing
          each substituted factor by name — it never falls back to a
          neighbouring value and never defaults to zero.
        </p>
        <p className="mt-2">
          LNG evaluates
          under FuelEU per engine technology but refuses under the IMO
          framework: the IMO guidelines lack a default upstream factor, and
          the
          real range 18.5–28 gCO2e/MJ is 20–30% of HFO&apos;s whole
          lifecycle intensity, so a missing term would flatter LNG
          substantially — FuelEU&apos;s WtT is never borrowed.
        </p>
        <p className="mt-2">
          The
          pathway fuels — e-ammonia and
          e-methanol — require a CERTIFIED pathway value from the Proof
          of Sustainability, applied{" "}<strong>well-to-tank</strong>:
          combustion terms (the ammonia N2O slip) are added separately,
          so a well-to-wake certificate figure must not be entered — the
          RFNBO ceiling of 28.2 is itself a well-to-wake number. A
          zero-emission pathway is an assumption, not a certifiable
          value. For e-methanol
          the certificate also resolves whether the combustion carbon
          counts (DAC-sourced vs point-source-captured CO2, RED Delegated
          Regulation 2023/1185); on the tank-to-wake basis the chemical
          stack CO2 (1.375 g/g ÷ 0.0199 MJ/g = 69.1 gCO2/MJ) is always
          reported — methanol is a carbon molecule regardless of
          accounting.
        </p>

        <H id="fe-calculation">15. The emission calculation</H>
        <F>
          E<sub>cand</sub>{" "}= quantity × LCV<sub>cand</sub>{" "}&nbsp;[MJ]
          &nbsp;·&nbsp; E<sub>total</sub>{" "}= E<sub>cand</sub>{" "}/ (1 −
          pilotShare) &nbsp;·&nbsp; E<sub>pilot</sub>{" "}= E<sub>total</sub>{" "}
          − E<sub>cand</sub>
          <br />
          E<sub>base</sub>{" "}= E<sub>total</sub>{" "}× efficiencyRatio
          &nbsp;·&nbsp; baselineMass = E<sub>base</sub>{" "}/ LCV
          <sub>base</sub>
          <br />
          intensity = WtT + (ttwCO2 + ttwCH4×GWP<sub>CH4</sub>{" "}+
          ttwN2O×GWP<sub>N2O</sub>) / LCV &nbsp;[gCO2e/MJ]
          <br />
          candidate adds: n2oSlip × GWP<sub>N2O</sub>{" "}/ LCV &nbsp;·&nbsp;
          pilot priced at its FULL intensity
          <br />
          avoided = E<sub>base</sub>×intensity<sub>base</sub>{" "}−
          (E<sub>cand</sub>×intensity<sub>cand</sub>{" "}+
          E<sub>pilot</sub>×intensity<sub>pilot</sub>) &nbsp;[tCO2e]
        </F>
        <p className="mt-2">
          The tool runs BOTH directions. A direction dropdown leads the
          form (default &ldquo;From fossil to zero / near-zero (ZNZ)
          fuel&rdquo;), ordered so the fuel you start from comes
          first; in that default direction the required ZNZ mass leads the
          results, and a one-sentence method line (functional unit,
          framework citation, GWP set, certified value, pilot, dataset
          version) closes them for citation.
        </p>
        <p className="mt-2">
          In reverse, the quantity is the baseline mass:
          the engine derives E<sub>base</sub>{" "}= quantity × LCV
          <sub>base</sub>, then E<sub>cand</sub>{" "}= E<sub>base</sub>{" "}/
          efficiencyRatio × (1 − pilotShare) and the required candidate
          mass — replacing 1,000 t of HFO needs 2,177.4 t of e-ammonia
          (40.5×10⁶ MJ ÷ 18,600 MJ/t). Every downstream quantity is the
          same computation, so the round trip is exact.
        </p>
        <p className="mt-2">
          <strong>How the corridor consumes this method.</strong>{" "}
          The corridor engine needs one WtW scalar, one combustion EF and
          one LHV per fuel. The derivation maps them as: green WtW is the
          BLEND intensity (certified WtT + N2O slip + pilot, over total
          delivered energy — the analogue of attained GFI, the IMO&apos;s
          greenhouse-gas fuel intensity measure; e-ammonia 22.14
          under FuelEU/AR4 at the defaults); green combustion EF is the TtW
          CO2e per tonne incl. slip and pilot combustion (0.140 t/t);
          fossil WtW is the framework&apos;s own row (91.744 FuelEU /
          94.90 IMO at 0.50%&nbsp;S); LHV is the dataset LCV. Both
          frameworks&apos; WtW values ride along so each compliance module
          prices with its own accounting.
        </p>
        <p className="mt-2">
          One documented approximation: the
          pilot&apos;s emissions ride the green fuel&apos;s factors while
          its ENERGY is not added to the corridor&apos;s tonnage. Where the
          method cannot honestly price a combination (LNG as a baseline;
          LNG under IMO) the corridor falls back to the stored per-fuel
          factor with disclosed provenance — never a silent zero.
        </p>
        <p className="mt-2">
          Both bases are always computed (well-to-wake and tank-to-wake,
          shown together), and each side decomposes exhaustively into
          WtT + TtW(CO2, CH4·GWP, N2O·GWP) + pilot + N2O slip, summing
          exactly to the side total.
        </p>
        <p className="mt-2">
          ZNZ eligibility is a DIFFERENT test:
          it applies to the well-to-wake GHG intensity of the fuel or
          energy source itself — including its own combustion terms and
          the N2O slip, excluding pilot fuel (MEPC 83 approved text; IMO
          Net-Zero Framework FAQ: &ldquo;ZNZs have a GHG Fuel Intensity of
          no more than 19.0 gCO2eq/MJ&rdquo;) — shown in the UI under the
          IMO framework with BOTH periods side by side, since the
          threshold steps from 19.0 to 14.0 in 2035 and the 14.0 line is
          the binding constraint; a derived line states the certified WtT
          a pathway would need to clear it — a procurement specification,
          computed as 14.0 minus the fuel&apos;s non-certified intensity
          share.
        </p>
        <p className="mt-2">
          The FuelEU view carries the analogous flag against the
          RFNBO ceiling of 28.2 gCO2e/MJ WtW (RED Article 28(5)), tested
          on the same fuel basis, with the matching procurement line when
          it fails. The default 5% pilot lifts the attained blend — the
          intensity of the blend including pilot fuel — to 18.79 while the
          fuel alone stays at 15.0;
          and a certified 15 pathway plus real-world N2O misses the 14.0
          line applying from 2035 comfortably — the most
          decision-relevant fact on the screen.
        </p>

        <H id="fe-corrections">16. Combustion-side corrections</H>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Pilot fuel</strong>{" "}— ammonia and methanol dual-fuel
            engines burn ~3–8% fossil pilot by energy (default 5%, MGO;
            MAN ES: ammonia-mode operation uses around 95% ammonia on an
            energy basis). It moves the avoided tonnes barely (pilot energy
            displaces baseline energy at almost the same intensity) but
            lifts the blend intensity from 15.00 to 18.79 — the floor pure
            fuel-intensity arithmetic misses.
          </li>
          <li>
            <strong>Methane slip (LNG)</strong>{" "}— Cslip is the fraction
            of fuel escaping combustion as CH4, defined at 50% engine load
            and set per engine technology by both frameworks (0.2–3.1%
            across technologies under FuelEU): per g of fuel, (1−Cslip)
            combusts and Cslip is priced as CH4 at the framework&apos;s
            GWP. Engine type is therefore an explicit input — an Otto
            dual-fuel medium-speed engine lands at 89.20 gCO2e/MJ WtW
            under FuelEU AR4, barely below HFO&apos;s 91.74, while a
            diesel slow-speed engine reaches 76.08.
          </li>
          <li>
            <strong>N2O slip</strong>{" "}— THE dominant uncertainty:
            published values span ×37 (6.81×10⁻⁵ to 2.5×10⁻³ g N2O/g
            NH3). Between best and worst, avoided emissions fall ~48% and
            the fuel stops qualifying as ZNZ (51.69 gCO2e/MJ at the highest
            observed value). Neither framework fixes an ammonia N2O
            default, so the parameter carries the unverified badge, ships
            as three cited scenarios, and the UI always shows the range —
            never a bare point. A methodological note: moving AR4 → AR5
            raises the reduction (N2O&apos;s GWP falls 298 → 265, and N2O
            is a larger share of ammonia&apos;s footprint than of the
            baseline&apos;s) — a GWP housekeeping update systematically
            flatters ammonia, so movement between sets is not a modelling
            change.
          </li>
          <li>
            <strong>Engine efficiency ratio</strong>{" "}— equal fuel energy
            is only equal transport work if the converters match. MAN
            full-engine testing indicates similar thermal efficiency in
            diesel and ammonia mode for two-stroke dual-fuel engines, so
            1.0 is the evidenced default (exposed as an advanced
            parameter), not an omission.
          </li>
        </ul>

        <H id="reference-data">17. Reference data</H>
        <H3 id="ref-vessels">Vessel types</H3>
        <p className="mt-2">
          The catalogue behind the vessel selector, rendered from the
          reference bundle itself (<code>{vesselCatalogue.bundleId}</code>{" "}—
          a bundle is a dated, versioned set of reference data),
          so it cannot go stale when the data changes.{" "}
          <strong>CAPEX and OPEX are PER SHIP</strong>; the
          engine multiplies both by the vessel count. GJ/nm is a
          <em>service-speed</em>{" "}figure and means little without the speed
          beside it. Rows marked <em>retired</em>{" "}are superseded classes
          kept so a saved scenario pinning one still reproduces the numbers it
          was saved with — they are not offered for new scenarios.{" "}
          <strong>Size</strong>{" "}is TEU for container ships and dwt
          (deadweight tonnes) for the others.
        </p>
        <div className="my-3 overflow-x-auto">
          <table className="w-full border border-neutral-300 text-[13px] tabular-nums">
            <thead>
              <tr className="border-b border-neutral-300 bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 text-right font-medium">Size</th>
                <th className="px-3 py-2 text-right font-medium">CAPEX $m</th>
                <th className="px-3 py-2 text-right font-medium">OPEX $m/yr</th>
                <th className="px-3 py-2 text-right font-medium">GJ/nm</th>
                <th className="px-3 py-2 text-right font-medium">at kn</th>
              </tr>
            </thead>
            <tbody>
              {vesselCatalogue.rows.map((r) => (
                <tr
                  key={r.id}
                  className={`border-b border-neutral-200 last:border-0 ${
                    r.deprecated ? "text-neutral-500" : ""
                  }`}
                >
                  <td className="px-3 py-1.5">
                    {r.label}
                    {r.deprecated ? (
                      <span className="ml-1.5 text-[10px] uppercase tracking-wide text-neutral-400">
                        retired
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {r.teuCapacity
                      ? `${r.teuCapacity.toLocaleString("en-US")} TEU`
                      : r.dwtTonnes
                        ? `${r.dwtTonnes.toLocaleString("en-US")} dwt`
                        : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right">{r.capexUsdM}</td>
                  <td className="px-3 py-1.5 text-right">{r.opexUsdMPerYear}</td>
                  <td className="px-3 py-1.5 text-right">{r.gjPerNm}</td>
                  <td className="px-3 py-1.5 text-right">
                    {r.serviceSpeedKn ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <H3 id="ref-fuels">
          Fuels (price $/t · vessel premium · stored fallback factors)
        </H3>
        <p className="mt-2">
          <strong>The emission columns below are stored fallbacks.</strong>{" "}
          Combustion EF, LHV and WtW
          derive per scenario from the fuel-emissions dataset under the
          selected accounting framework: green fuels as the derived blend
          intensity (e-ammonia ≈ 22.14 gCO2e/MJ under
          FuelEU at the defaults, §15), fossil fuels from the Annex II row under
          FuelEU (91.744) or the MEPC.391(81) sulphur band under IMO (94.90
          at 0.50%&nbsp;S). The table&apos;s emission scalars apply only to
          scenarios that pin them and to underivable combinations (LNG as a
          baseline),
          always with disclosed provenance. Prices and premiums remain the
          stored benchmarks.
        </p>
        <p className="mt-2">
          In the table, <strong>Price</strong>{" "}is $/t;{" "}
          <strong>Comb. EF</strong>{" "}is tCO2 per tonne of fuel burned;{" "}
          <strong>LHV</strong>{" "}is the energy content in MJ/t;{" "}
          <strong>WTW</strong>{" "}is the well-to-wake intensity in gCO2e/MJ;{" "}
          <strong>Premium</strong>{" "}is the vessel CAPEX uplift for this
          fuel.
        </p>
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

        <H id="m-overview">18. Overview &amp; system boundary</H>
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
        <H id="m-hydrogen">19. Hydrogen from electricity</H>
        <p className="mt-2">
          Hydrogen output is electricity consumed by the electrolyzer times its
          efficiency, divided by the lower heating value (LHV) of hydrogen:
        </p>
        <F>
          H₂ [kg] = E_consumed [kWh] × η_LHV ÷ 33.33 [kWh/kg]
        </F>
        <p className="mt-2">
          η<sub>LHV</sub>{" "}is the system efficiency on an LHV basis (default
          60%), so producing 1 kg needs ≈ 33.33 / 0.60 ≈ 55.6 kWh. The
          electricity for water desalination and pumping is tracked for
          emissions only, never for cost (§25).
        </p>
        <p className="mt-2">
          <strong>Water: 9 litres per kg is a stoichiometric floor, not plant
          demand.</strong>{" "}It is what the electrolysis reaction itself
          consumes — the theoretical minimum, and the figure the source
          methodology specifies. A real plant withdraws more, because
          purification rejects part of the feed and cooling consumes more
          again: published total consumption runs 15–25 L/kg, and RMI puts it
          at 20–30 L/kg. For <em>cost</em>{" "}this barely matters — even at
          30 L/kg and a dear water price the line is a few cents per kg
          against an LCOH of several dollars. For <em>volume</em>{" "}it matters
          a great deal, since reported water use and the desalination
          electricity in the emissions ledger both scale linearly with it.
          When siting against a local water budget, multiply the reported
          volume by 2–3×.
        </p>

        {/* 16 */}
        <H id="m-profiles">20. Resource profiles (capacity factors)</H>
        <p className="mt-2">
          Each location gets an 8760-hour <strong>capacity-factor</strong>{" "}
          profile (kWh generated per kW installed, per hour, 0–1) for solar and
          wind, built as a Typical Meteorological Year (TMY) from roughly a
          decade of data and cached per 0.1° grid cell.
        </p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Solar PV — PVGIS.</strong>{" "}The JRC PVGIS model (an
            hourly series for a 1 kWp system at 14% system loss) returns
            hourly PV power in watts; capacity factor = power / 1000.
            Mounting is fixed at optimal tilt, or single-/dual-axis tracking.
            PVGIS resolves its own radiation database per cell —
            Meteosat-derived SARAH3 where the satellite disc reaches, ERA5
            reanalysis everywhere else. ERA5 is not a degraded tier: for most
            of the world it is the only database PVGIS has, and where both
            exist they agree closely and in no fixed direction. Its real
            caveat is resolution — a ~31 km grid is coarse for coastlines
            and mountains — a reason to treat single cells carefully, not to
            apply a bias correction without a citable basis.
          </li>
          <li>
            <strong>No silent substitute on the map.</strong>{" "}Where PVGIS
            cannot serve a cell, the crude GHI proxy (GHI/1000 × 0.9, a
            labeled low-fidelity fallback used only off the map) is{" "}
            <em>not</em>{" "}substituted: it is a categorically different
            model, so adjacent hexes would stop being comparable and a seam
            would appear in the surface. Such a cell is left blank
            (<strong>no-data</strong>).
          </li>
          <li>
            <strong>Wind — hourly reanalysis (Open-Meteo, ERA5).</strong>{" "}
            Hourly wind speed at 10 m and 100 m is extrapolated to hub height
            (120 or 160 m) with a per-hour power-law shear exponent, then
            converted through a digitized turbine power curve. On the map
            this path also applies the air-density correction and per-site
            IEC turbine-class selection below. A small share of cells is
            served by the fallback provider (NASA POWER: fixed shear
            α = 1/7, generic curve, neither correction) — a real modelling
            difference, so those cells are flagged rather than hidden.
          </li>
          <li>
            <strong>Provenance is mixed, and recorded per cell.</strong>{" "}
            Every cell records which provider, radiation database and wind
            model produced its numbers — the export schema carries the same
            fields, and the cell drawer shows them — so a value can always be
            traced to the model that made it, and cells built by different
            pathways are never presented as interchangeable.
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
        <H id="m-dispatch">21. Hourly dispatch</H>
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
        <H id="m-degradation">22. Degradation &amp; stack replacement</H>
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
        <H id="m-lcoh">23. The LCOH formula</H>
        <p className="mt-2">
          All cashflows are discounted with the project discount rate r
          (default 8%). Investment occurs at year 0 (undiscounted); production
          and operating costs occur in years 1 … N:
        </p>
        <p className="mt-2">
          <strong>The rate is REAL, and this matters more than it looks.</strong>{" "}
          Costs here are constant-USD — there is no inflation or escalation
          term anywhere in the engine — which makes this a real DCF, so it
          must be given a real rate. Most published cost-of-capital surveys
          quote <em>nominal</em>, and the two are indistinguishable at the
          point of use: both are plausible numbers in the same range, so
          feeding a nominal rate in fails silently and simply makes hydrogen
          look dearer. Measured at one cell, a nominal 9.4% consumed as real
          overstated LCOH by 7.7%. Rates entering the model therefore declare
          their basis, currency, publication year and the technology they were
          measured for, and are converted at the boundary via the exact Fisher
          relation r_real = (1 + r_nominal) / (1 + i) − 1 — not the r − i
          approximation, which is 18 bp adrift at these values and compounds
          across a 20-year horizon.
        </p>
        <p className="mt-2">
          <strong>Financing layers.</strong>{" "}The map&rsquo;s default surface
          applies a single uniform r = 8% everywhere, so it ranks{" "}
          <em>resource</em>, not project cost — it is labelled{" "}
          &ldquo;resource-driven, uniform financing&rdquo; on the map itself.
          The capital-recovery factor over 20 yr swings from 0.087 at 6% to
          0.134 at 12% — a larger spread than the resource gap between two good
          sites — so an optional <em>risk-adjusted</em>{" "}layer instead applies
          each cell&rsquo;s country cost of capital, matched by
          point-in-polygon against the Natural Earth boundaries. The rate
          comes from the same two-tier country supply the Calculator uses — a
          researched rate where an enriched profile has one, else the
          income-group heuristic (§28) — and the layer records which tier
          served each cell.
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
        <p className="mt-2">
          The seven components — each row is the numerator of its PV term; the
          denominator is discounted hydrogen throughout:
        </p>
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
        <H id="m-lcoe">24. Electricity pricing (LCOE)</H>
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
          uses CAPEX mode so that resource quality drives the map (§26).
        </p>
        <p className="mt-2">
          Do not multiply <code>LCOE_mix</code>{" "}by consumed energy to
          recover the electricity cost — it under-counts by the utilization
          ratio: in CAPEX mode the electricity component charges the full
          plant CAPEX regardless of curtailment, while{" "}
          <code>LCOE_mix</code>{" "}is per MWh{" "}
          <em>generated</em>. The engine therefore also reports an{" "}
          <strong>effective cost per consumed MWh</strong>{" "}(discounted
          electricity cost ÷ discounted consumed MWh), which reconciles to the
          electricity components exactly, and per-source utilization
          (E_consumed / E_generated).
        </p>

        {/* 21 */}
        <H id="m-emissions">25. Emissions ledger</H>
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
          the cost side.
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
        <H id="m-map">26. The map&apos;s configuration</H>
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
          the cheapest mix can swap between two cells. An optional layer sweeps ratio ∈ {"{1.25, 1.5, 2.0, 2.5, 3.0}"} ×
          PV share ∈ {"{0, 12.5, …, 100}"}% (45 configurations) and reports the
          minimum LCOH plus the winning ratio and mix as per-cell diagnostics.
          The fixed-2:1 layer is kept as a comparable fixed design point.
        </p>
        <p className="mt-2">
          Unlike the flat-30 reference, the map prices electricity in{" "}
          <strong>CAPEX mode</strong>{" "}so each cell&apos;s cost reflects its own
          capacity factor. Generation costs are IRENA{" "}
          <em>Renewable Power Generation Costs in 2024</em>{" "}global
          weighted-average total installed cost — solar 691 USD/kWp + 1.5%
          OPEX, onshore wind 1,041 USD/kW + 2.5% OPEX. Each cost pack carries
          its generation-cost
          basis year so a vintage mismatch is visible in the data rather than
          inferred (see §27). The OPEX fractions were checked against the same
          edition: with IRENA&apos;s own CAPEX, ~25-year life and
          region-weighted real WACC they reproduce its published LCOE of 43
          and 34 USD/MWh to within a few percent.
        </p>
        <p className="mt-2">
          <strong>Colour domain and the non-viability ceiling.</strong>{" "}Colours
          use a fixed per-layer domain of{" "}
          <strong>3.5&ndash;14 USD/kg</strong>, never rescaled to the viewport,
          so a colour means the same LCOH everywhere on that layer and across
          layers. Both bounds are deliberate: nothing on Earth produces below
          ~3.5 at today&apos;s costs, and real cells run to ~15.5 (Indonesia&apos;s
          res-3 solar layer — H3 hex grid resolution 3, cells roughly 100 km
          across — measures 9.34&ndash;15.48). Values outside the
          domain pin to their end&apos;s own reserved colour rather than
          extrapolating. Above{" "}<strong>25 USD/kg</strong>{" "}(configurable) a
          cell is drawn in a neutral grey instead of a ramp colour: past that
          point the number has stopped being a price and become a verdict —
          Atacama wind at CF&nbsp;0.02 computes 770&ndash;1,003 USD/kg, which is
          &ldquo;this technology does not work here&rdquo;, not &ldquo;expensive&rdquo;.
        </p>
        <p className="mt-2">
          <strong>Sweep persistence.</strong>{" "}The best-achievable and
          risk-adjusted-WACC layers arrive slightly later than the base
          layers: a freshly added cell shows the base layers immediately and
          gains the optional layers once the scheduled recompute pass reaches
          it. At the last census 4,544 of 5,993 ready
          cells carried them; the remainder are cells seeded since the last
          pass, which the scheduled job fills as it re-fetches. Measured on that
          population, the fixed 2:1 design point costs a median 2.5 % against
          free sizing, and it favours <em>solar</em>: solar-led cells gain a
          mean 2.63 % from sweeping the ratio, wind-led cells 4.21 %, because
          flat wind saturates the electrolyser at a lower ratio (mean optimum
          1.57&times;) than peaky solar does (2.18&times;).
        </p>

        {/* 24 */}
        <H id="m-costyears">27. Cost-year projections (2030 / 2040 / 2050)</H>
        <p className="mt-2">
          The cost-year buttons re-price each cell with future technology costs.
          The <strong>resource is held constant</strong>{" "}— same capacity factors
          — so the change is purely the techno-economic cost-down. Absolute
          values, with the multiplier on the 2024 base in brackets. This table
          is <strong>generated from the engine&apos;s own cost packs</strong>,
          not transcribed. <em>Driver</em>{" "}is the cost input that changes;
          ×N is the multiplier against the 2024 base.
        </p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-[13px] tabular-nums">
            <thead>
              <tr className="border-b border-neutral-300 text-left">
                <th className="py-1.5 pr-3">Driver</th>
                {costPacks.years.map((y) => (
                  <th key={y} className="py-1.5 pr-3">
                    {y}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {costPacks.rows.map((r) => (
                <tr key={r.driver} className="border-b border-neutral-100">
                  <td className="py-1.5 pr-3 font-medium">
                    {r.driver}
                    <span className="ml-1 text-neutral-500">({r.unit})</span>
                  </td>
                  {r.values.map((v, i) => (
                    <td key={costPacks.years[i]} className="py-1.5 pr-3">
                      {v}
                      {i > 0 && (
                        <span className="ml-1 text-[11px] text-neutral-400">
                          ×{r.multipliers[i]}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          OPEX is held flat across years at{" "}
          {(costPacks.opex.solarFraction * 100).toFixed(1)}% of CAPEX per year
          for solar and {(costPacks.opex.windFraction * 100).toFixed(1)}% for
          wind. Generation-cost basis year: {costPacks.costBasisYear}.
        </p>
        <p className="mt-2">
          <strong>Two drivers, two sources, each internally consistent.</strong>{" "}
          The <strong>electrolyser</strong>{" "}trajectory comes from the IEA
          Global Hydrogen Review 2025 Assumptions Annex (system CAPEX 2000–2600
          → 1400–1820 USD/kW by 2030, midpoints 2300 → 1610). The{" "}
          <strong>generation</strong>{" "}trajectory comes from IRENA{" "}
          <em>Renewable Power Generation Costs in 2024</em>: solar PV total
          installed cost falls ~40% over the coming decade, onshore wind ~20%
          and then <em>stabilises</em>{" "}at USD 850–1,000/kW. Wind is therefore
          floored at 850, which is why its 2040 and 2050 figures are equal —
          that is the projection reaching the level the source describes, not a
          stuck value. Both are applied globally, not per region.
        </p>
        <p className="mt-2">
          Each source publishes a decade horizon, so <strong>2040 and 2050 are
          extrapolated</strong>{" "}and are labeled &quot;projected&quot;
          throughout the UI. Scenario for the electrolyser line: IEA Announced
          Pledges (APS).
        </p>
        <p className="mt-2">
          <strong>Durability trajectory.</strong>{" "}Stack life and degradation
          improve alongside CAPEX across the cost years — durability is a
          primary learning-curve target. These durability figures are a{" "}
          <em>documented extrapolation</em>{" "}along the IEA/DOE direction, not
          IEA-published values; the 50,000 h starting point is IEA&apos;s stated
          economic optimum (up to 95,000 h technically achievable). Because
          solar CAPEX falls faster than wind, the cheapest PV/wind mix{" "}
          <strong>flips</strong>{" "}in some cells between cost years — shifting
          toward solar by 2050.
        </p>
        <p className="mt-2">
          <strong>Stack replacement is a step, not a curve.</strong>{" "}A
          replacement happens when cumulative operating hours cross a multiple
          of the stack life, so the <em>count</em>{" "}of replacements over the
          20-year life is an integer that jumps (roughly: 20-year operating
          hours ÷ stack life, rounded down). At 6,719 operating hours a
          year, a 50,000 h stack is replaced in years 8 and 15 — two events;
          the same cell at 40,000 h would be replaced in years 6, 12 and 18 —
          three. Because each cost year has a different stack life, the
          boundaries fall at different operating-hour thresholds: a 50,000 h
          stack adds its second replacement at about 5,500 h/yr, a 75,000 h
          stack at about 8,000 h/yr. A cell can therefore sit on one side of a
          boundary in 2024 and the other in 2030.
        </p>
        <p className="mt-2">
          <strong>Why this shows up in the rankings.</strong>{" "}Measured, the
          largest such step is about <strong>1.4% of LCOH</strong>{" "}— small in
          absolute terms, but the top of the solar ranking is packed far more
          tightly than that. Median gap between adjacent cells in the top 50:{" "}
          <strong>0.049%</strong>{" "}for solar·2030, 0.096% for solar·2024,
          0.190% for wind·2030. So a single boundary crossing moves a cell
          roughly 29 ranks in solar·2030, 15 in solar·2024 and 7 in wind·2030.
          That is why rank churn concentrates in one layer-year rather than
          appearing everywhere: solar·2030 has the least rank resolution to
          lose, not the most instability. Read the <em>values</em>{" "}rather
          than the ordinal positions when cells are this close — a top-50
          ordering separated by half a tenth of a percent is not a meaningful
          ranking, and the map&apos;s colour bins deliberately do not resolve
          it either.
        </p>

        {/* 25 */}
        <H id="m-defaults">28. Country defaults &amp; enriched profiles</H>
        <p className="mt-2">
          The Calculator&apos;s country selector fills a grid emission factor
          and a cost of capital for every country. Two tiers supply them, and
          the table below shows which tier each country is on and what it
          actually carries.
        </p>
        <p className="mt-2">
          <strong>Regional heuristic (the default, 172 countries).</strong>{" "}
          Grid emission factors come from Our World in Data&apos;s
          carbon-intensity-of-electricity dataset (built on Ember + the Energy
          Institute), latest year, converted gCO₂/kWh ÷ 1000 → tCO₂/MWh — a
          real measurement, refreshed automatically. The WACC is a{" "}
          <em>suggestion</em>{" "}from a transparent World Bank income-group
          heuristic (high-income OECD 6%, high-income non-OECD 7%,
          upper-middle 8%, lower-middle 10%, low 12%, fallback 9%): a bracket,
          not a country estimate, because per-country cost-of-capital data is
          proprietary. Countries are matched to ISO2 via Natural Earth
          boundaries.
        </p>
        <p className="mt-2">
          <strong>Enriched profile.</strong>{" "}A researched country carries
          real cost and finance inputs — cost of capital, country risk
          premium, industrial electricity price, water price, land and
          labour, and per-technology CAPEX overrides — each carrying its
          source, the <em>publication year</em>{" "}of the figure (not merely
          when it was retrieved), and a <em>basis</em>{" "}saying what kind of
          quantity it is. Curation is <em>per field</em>: a profile may
          research the cost of capital and still let the automated grid factor
          keep updating, and any field it leaves empty falls back to the model
          default. A value the research could not confirm ships marked
          unverified rather than being quietly presented as solid.
        </p>
        <p className="mt-2">
          Cost of capital is stored on a <strong>real</strong>{" "}basis, with
          its currency, publication year and the technology it was measured
          for recorded alongside — §23 explains why the basis matters and how
          nominal survey rates are converted at the boundary.
        </p>
        <p className="mt-2">
          <strong>Curated always beats the automated refresh.</strong>{" "}The
          ingest runs every three hours; on an enriched country it writes only
          the fields the profile leaves empty and never touches its
          citations. The heuristic WACC keeps refreshing underneath a
          researched one so the comparison stays visible — the table shows
          both.
        </p>
        <p className="mt-2">
          <strong>Which field reaches which surface.</strong>{" "}The three
          columns of the table below are the three surfaces a country value
          feeds: the Calculator form, the map&apos;s country coloring
          (choropleth), and the Corridor model. A country
          field only matters where something consumes it, and not every field
          reaches every surface — the map prices generation from CAPEX, so an
          electricity <em>price</em>{" "}has nothing to act on there.
        </p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-neutral-300 text-left">
                <th className="py-1.5 pr-3">Field</th>
                <th className="py-1.5 pr-3">Calculator</th>
                <th className="py-1.5 pr-3">Map (choropleth)</th>
                <th className="py-1.5">Corridor</th>
              </tr>
            </thead>
            <tbody>
              {[
                [
                  "Cost of capital (curated, else heuristic)",
                  "Discount rate",
                  "Risk-adjusted layer only",
                  "No — see divergence below",
                ],
                [
                  "Grid emission factor",
                  "Grid emissions",
                  "Not used (no grid import)",
                  "No",
                ],
                [
                  "Industrial electricity price",
                  "Grid import price — only when the grid is enabled",
                  "No — generation is CAPEX-priced",
                  "No",
                ],
                [
                  "Industrial water price",
                  "Water cost",
                  "No — held at the model default",
                  "No",
                ],
                [
                  "Country risk premium",
                  "Informational only",
                  "No",
                  "No",
                ],
              ].map((r) => (
                <tr key={r[0]} className="border-b border-neutral-100">
                  <td className="py-1.5 pr-3 font-medium">{r[0]}</td>
                  <td className="py-1.5 pr-3">{r[1]}</td>
                  <td className="py-1.5 pr-3">{r[2]}</td>
                  <td className="py-1.5">{r[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2">
          The electricity row is the one that surprises. It is a{" "}
          <strong>retail industrial tariff</strong>, so it prices grid
          <em>imports</em>{" "}— and the calculator&apos;s PV and wind slots are{" "}
          <em>captive</em>{" "}generation with their own LCOE or CAPEX pricing.
          Applying a national retail tariff to a dedicated renewable plant
          would be wrong, so it is deliberately not done; with the grid
          switched off (the default) the field has no effect at all, and the
          citation list says so rather than showing a number that never
          reaches the result. Worth knowing that renewable PPAs in Indonesia
          price <em>below</em>{" "}retail industrial power, which is the
          relevant comparison for a captive project. A single national price
          also glosses over the eastern-Indonesia premium — acceptable for
          screening, but eastern Indonesia is exactly where the best solar
          cells are.
        </p>
        <p className="mt-2">
          The table below lists every country&apos;s working values: the grid
          emission factor, the cost of capital in use (an enriched value shows
          the heuristic it replaced beside it), electricity and water prices,
          and the basis — enriched profile or regional heuristic, as defined
          in the two tiers above.
        </p>
        <CountryDefaultsTable snapshot={countryDefaults} />
        <p className="mt-2 text-neutral-600">
          The table renders a committed snapshot of the live values
          (<code>data/country-defaults/snapshot.json</code>) — so the
          published values are dated and traceable rather than depending on a
          live query.
        </p>
        <p className="mt-2">
          <strong>Known divergence.</strong>{" "}The Green Corridor model keeps
          its <em>own</em>{" "}seven-row country list (its own ids, all
          marked unverified) and does not read these
          profiles: a country outside those seven resolves to the{" "}
          <code>other</code>{" "}row at 8%. An enriched profile therefore
          improves the
          Calculator and the map&apos;s risk-adjusted layer, but not the
          corridor&apos;s discount rate.
        </p>

        {/* 26 */}
                {/* ===================== PART D — HOW MUCH TO TRUST IT ===================== */}
        <div className="mt-16 border-t-2 border-neutral-300 pt-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-deep">
            Part D
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-neutral-900">
            How much to trust it
          </h2>
          <p className="mt-2 text-neutral-600">
            What moves the results, how the model is tested against published work, and where its limits are.
          </p>
        </div>

<H id="sensitivity">29. What moves the results</H>
        <p className="mt-2">
          Every numeric input is moved across its plausible range, one at a
          time, and every option of every selector is tried. The effect is
          measured on <strong>all six headline outputs</strong>: the cost gap,
          cost per cargo unit, cost per tonne of CO&#8322; abated, the green
          and fossil totals, and lifetime CO&#8322; abated.
        </p>
        <p className="mt-2">
          Where a scheme is switched off by default &mdash; self-designed
          regulation, the IMO framework, 45Z, the FuelEU credit, differentiated
          financing &mdash; it is <strong>switched on</strong>{" "}for its own
          sweep. Those figures therefore read as &ldquo;this scheme, enabled,
          at the ends of its range&rdquo;, which is why a support lever can
          outrank a physical input: $0&ndash;50m/yr of public money over twenty
          years genuinely is that large.
        </p>

        <H3 id="sensitivity-columns">How to read the table</H3>
        <div className="my-3 overflow-x-auto">
          <table className="w-full border border-neutral-300 text-[13px]">
            <thead>
              <tr className="border-b border-neutral-300 bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th className="px-3 py-2 font-medium">Column</th>
                <th className="px-3 py-2 font-medium">What it tells you</th>
              </tr>
            </thead>
            <tbody className="align-top">
              <tr className="border-b border-neutral-200">
                <td className="px-3 py-2 font-medium">
                  CO&#8322; abatement cost impact
                </td>
                <td className="px-3 py-2">
                  How far the <em>cost per tonne of CO&#8322; abated</em>{" "}
                  &mdash; the figure funders and policy comparisons quote &mdash;
                  moves when this input is pushed across its plausible range,
                  as a percentage of the figure itself. 40% means it changes by
                  four tenths of its own value. Use it to answer:{" "}
                  <em>if I am wrong about this, how wrong is my number?</em>
                </td>
              </tr>
              <tr className="border-b border-neutral-200">
                <td className="px-3 py-2 font-medium">Cost gap impact</td>
                <td className="px-3 py-2">
                  The same measurement on the <em>cost gap</em>{" "}&mdash; the
                  headline dollar difference between running green and running
                  fossil. The two columns rank very differently: corridor
                  length moves the abatement cost 366% but the gap only 76.6%,
                  because distance changes the fuel bill <em>and</em>{" "}the
                  tonnes abated at once.
                </td>
              </tr>
              <tr className="border-b border-neutral-200 last:border-0">
                <td className="px-3 py-2 font-medium">(choice)</td>
                <td className="px-3 py-2">
                  Rows marked <em>choice</em>{" "}are decisions, not dials &mdash;
                  which fuel, which hull, buy or build. Their impact is the
                  biggest change across the options you could pick, so read it
                  as <em>&ldquo;how much does this decision matter&rdquo;</em>,
                  not as a &plusmn;range on one number. Choices are evaluated
                  against the current reference data.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2">
          The tabs pick which figure the table is ranked by — the{" "}
          <strong>CO&#8322; abatement cost</strong>{" "}by default — and the
          ranking column is shown in bold. A
          0.0% is a measurement, not a gap in coverage &mdash; the input was
          swept and measured at zero: cargo unit choice
          really cannot move either figure, and the table says so instead of
          omitting it. The other four measured outputs (per-unit cost, both
          side totals, tonnes abated) still decide field placement in the form
          &mdash; &sect;38 carries those details per field.
        </p>
        <p className="mt-2">
          <strong>Every swept input is listed below.</strong>{" "}A field absent
          from this table was not swept at all; &sect;38 lists all
          {" "}scenario fields and says which of the three measurement tiers
          each falls into, and why.
        </p>
        <DocsImpactTable rows={SENSITIVITY_ROWS} />
        <p className="mt-2">
          The top of the ranking is a mix of support levers, geometry and
          decisions: self-designed public support (376% &mdash; $0&ndash;50m/yr
          over twenty years genuinely is that large), corridor length (366%
          &mdash; distance changes the fuel bill <em>and</em>{" "}the tonnes
          abated at once) and the vessel class (186% here, and the biggest
          lever of all on the cost gap at 446%). Some inputs matter to one
          answer and not the other: the N&#8322;O slip scenario doubles the
          abatement cost (100.5%) while barely touching the gap (0.5%), and
          vessel count does the reverse &mdash; switch tabs to see the other
          ranking. The named EU scheme parameters (ETS
          price and scope, FuelEU penalty and scope) move either figure by
          only a few percent under defaults; they matter far more at high
          carbon prices or late start years.
        </p>

        <H3 id="impact-leverage-exposure">Impact: leverage &times; exposure</H3>
        <p className="mt-2">
          The sweep above answers <em>how far can this input push the result
          across its plausible range</em>. That places fields in the form
          well, and it is the wrong question for ranking risk, for three
          reasons visible in its own table.
        </p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Range arbitrariness.</strong>{" "}
            Self-designed &ldquo;other support&rdquo;
            (<code>regulation.selfDesigned.otherUsdM</code>) tops the table
            at 376%
            because it is swept $0&ndash;50m. That is a choice about the
            sweep, not a property of the model &mdash; two inputs with
            identical influence score differently if their assumed ranges
            differ.
          </li>
          <li>
            <strong>Coupled inputs double-count.</strong>{" "}Green and fossil
            fuel consumption score 21.0% and 41.1% independently, but they are
            energy-matched on any real corridor. Moving one alone makes the
            parity check report the ratio (1.30) and flag it as
            diverged &mdash; the model itself rejects
            the state being measured.
          </li>
          <li>
            <strong>One-at-a-time sees no interactions.</strong>{" "}WACC and
            horizon compound on a capital-heavy corridor and no sweep of this
            shape can see it.
          </li>
        </ul>
        <p className="mt-2">
          So impact is separated into its two factors and multiplied.{" "}
          <strong>Leverage</strong>{" "}is a property of the model &mdash; an{" "}
          <em>elasticity</em>, measured by a small standard nudge (&plusmn;10%,
          or &plusmn;1 percentage point for rates and fractions) and
          normalised, so it cannot inherit an assumed range.{" "}
          <strong>Exposure</strong>{" "}is a property of the world &mdash; a
          researched, cited range held in a versioned reference dataset.
          Neither is interesting alone: a field can have enormous leverage and
          be known precisely, or be a coin-flip that barely matters.
        </p>
        <p className="mt-2">
          Both are measured across <strong>three archetypes</strong>, because
          elasticity is scenario-dependent and one baseline hides that:
          Chilean copper (build, deep-sea), Australia&ndash;Korea iron ore
          (purchase, deep-sea) and the Skagerrak green box (contract offtake,
          short-sea). Corridor length measures <strong>0.29</strong>{" "}where
          consumption is derived from geometry and exactly{" "}
          <strong>0.00</strong>{" "}where the burn is typed &mdash; the same
          field, decisive on one corridor and inert on another. &sect;38
          reports the range across archetypes rather than an average for
          exactly that reason.
        </p>
        <p className="mt-2">
          <strong>Coupling groups</strong>{" "}fix the double-count by moving
          members together (the figures are elasticities: the % change in the
          gap per 1% change in the input). On the Chilean archetype{" "}
          <code>energy-demand</code>{" "}measures <strong>0.267</strong>{" "}
          against a naive sum of parts of 0.621 &mdash; the one-at-a-time view
          overstates by 2.3&times;. Fleet capital is starker: green vessel
          CAPEX is <em>+0.25</em>{" "}and fossil <em>&minus;0.20</em>, so a
          yard-price shock lifts both sides and the gap barely moves &mdash;{" "}
          <strong>0.05</strong>{" "}together against 0.46 apart. The group
          figure is the honest one; the per-field figures explain the
          mechanism.
        </p>

        <H3 id="impact-tornado">The tornado</H3>
        <p className="mt-2">
          Each bar is <strong>two full engine evaluations</strong>{" "}at the
          declared low and high &mdash; never an elasticity multiplied by a
          range width, because the model is non-linear in places where
          extrapolation would silently lie.
        </p>
        <p className="mt-2">
          Bars sort by span, and every range is declared and cited: when
          someone challenges a range &mdash; and they will &mdash; the
          leverage is the model&apos;s, the range has a named basis, and
          changing the range rescales the bar. Coupled groups render as one
          bar. A range that cannot act on a corridor is{" "}
          <em>reported with a reason</em>{" "}rather than dropped, because a
          silently missing bar reads as &ldquo;this does not matter
          here&rdquo; &mdash; on a corridor that builds its own fuel there is
          no merchant price to move, which is a different statement from the
          price being unimportant.
        </p>
        <p className="mt-2">
          Ranges without a defensible basis are recorded as{" "}
          <code>unquantified</code>{" "}— a declared absence — and excluded
          from impact entirely. An
          input absent from the chart means nobody has stated a range for it,{" "}
          <em>not</em>{" "}that it does not matter &mdash; an incomplete honest
          table beats a complete invented one.
        </p>

        <p className="mt-2">
          The three reference corridors, drawn from the committed artifact.
          The bars measure the{" "}
          <strong>cost gap</strong>{" "}&mdash; unlike the ranking table above,
          which defaults to the abatement cost, a tornado is drawn for one
          output at a time, and the gap in dollars is the one a bar chart can
          carry across three corridors:
        </p>
        <DocsTornado
          results={
            (uncertaintyArtifact as { results: Parameters<typeof DocsTornado>[0]["results"] })
              .results
          }
          headlineKpi={(uncertaintyArtifact as { headlineKpi: string }).headlineKpi}
        />

        <H3 id="impact-monte-carlo">The uncertainty band</H3>
        <p className="mt-2">
          The tornado moves one input at a time, so it cannot see
          interactions. A seeded Monte Carlo samples every declared range in
          the same draw and reports where the answer actually lands, plus a
          signed <strong>rank correlation</strong>{" "}per input &mdash; an
          importance ranking that survives interaction and non-linearity,
          which neither the sweep nor the elasticity can produce.
        </p>
        <F>
          A P10 1652.7 &middot; P50 1690.3 &middot; P90 1730.3 &mdash; top
          driver WACC (&minus;0.73)
          <br />
          B P10 &nbsp;440.6 &middot; P50 &nbsp;469.9 &middot; P90 &nbsp;507.0
          &mdash; top driver inflation (+0.83)
          <br />
          C P10 1860.4 &middot; P50 1908.9 &middot; P90 1957.1 &mdash; top
          driver WACC (&minus;0.80)
        </F>
        <p className="mt-2">
          <strong>The negative sign on WACC is not an error.</strong>{" "}The
          model discounts <em>cost</em>{" "}flows, so a higher discount rate
          produces a <em>smaller</em>{" "}gap. It is also why the Chilean
          archetype&apos;s deterministic result sits at the 99th percentile of
          its own band: that scenario discounts at 8% while the researched
          range for its region is centred on 10%, so nearly every draw
          discounts harder than the scenario does. The band is the model
          saying the scenario&apos;s own discount rate is optimistic relative
          to the research &mdash; and the row driving it is among the least
          verified in the dataset, which is recorded rather than smoothed
          over.
        </p>
        <p className="mt-2">
          The band is <strong>reproducible</strong>: the random seed is fixed
          and the results are version-controlled, so an engine change that
          moves the band is always a deliberate, recorded change. Only the
          summary is stored; the draws are reproducible from the fixed seed.
        </p>


        <H id="fe-validation">30. Emission-method validation &amp; regression</H>
        <p className="mt-2">
          The reference cases were computed BY HAND from the reference
          dataset, so they are independent of the
          implementation — if the engine disagrees, the engine is wrong.
          The method
          reproduces BetterSea&apos;s published FuelEU worked example (7,000
          t HFO → 78.244 TtW / 91.744 WtW gCO2e/MJ under AR4) to three
          decimals, exercising the exact Annex II arithmetic. Guaranteed
          properties: the decomposition is exhaustive, results are linear in
          quantity, a GWP-set switch moves only CH4/N2O-bearing
          terms, avoided(X&nbsp;vs&nbsp;X)&nbsp;=&nbsp;0 for
          every parameterised fuel, and every refusal path refuses rather
          than guessing. Reproducing
          GCMD&apos;s published GFI calculator as an independent cross-check
          remains an open item.
        </p>

        <H id="m-verification">31. Verification</H>
        <p className="mt-2">
          Verification shows the code computes what the method specifies — it is
          not empirical grounding. Analytical cases reproduce hand-derived LCOH
          to ≤ 1e-6 (e.g. PV at CF ≡ 1, LCOE 30 USD/MWh, no degradation → 2.507
          USD/kg via the standard annuity); monotonicity,
          energy closure and mass balance hold as guaranteed properties; full
          runs are pinned against frozen references at 1e-12.
          These say nothing about whether the assumptions match reality — that is
          validation, below.
        </p>

        {/* 27 */}
        <H id="m-validation">32. Validation</H>
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
            with a bootstrap 95% confidence interval of roughly [0.53, 0.78].
          </li>
          <li>
            <strong>⚠ The level is not like-for-like.</strong>{" "}The
            published column is a <em>2022</em>{" "}cost basis; the engine
            runs IEA&apos;s <em>2024</em>{" "}installed CAPEX ($2,300/kW).
            Mean computed is 6.16 vs 4.51 published — that gap is a vintage
            difference, not a bias estimate. Read this comparison as a
            screening-fidelity measure until a same-vintage published dataset
            is available.
          </li>
          <li>
            <strong>Precision@5 = @10 = 1.0</strong>{" "}and top-decile retention
            1.0: the model identifies the cheapest sites — what a user actually
            shortlists — exactly. The discordance sits among the middle of the
            distribution, not the top.
          </li>
          <li>
            <strong>A same-vintage −0.21 offset is structural, not
            geolocation.</strong>{" "}On a same-vintage comparison
            (2022 basis vs the 2022 column) the model ran 4.30 vs 4.51 USD/kg.
            Coordinate inference is symmetric noise (a sensitivity run perturbing
            inferred coordinates ±0.2° moves a site&apos;s LCOH in either
            direction, so it can&apos;t produce a one-directional offset); the
            consistent gap traced to a baseline assumption differing from the
            study (efficiency, electrolyser CAPEX, discount rate, or oversizing
            ratio). A baseline
            cause may not be uniform across geographies.
          </li>
          <li>
            <strong>One benchmark is thin for a global tool.</strong>{" "}A second
            published dataset with fully disclosed assumptions and coordinates
            (e.g. an IEA/IRENA or national green-hydrogen cost study) is the
            outstanding validation work; the comparison is dataset-agnostic,
            so a new dataset can be added when a comparably-specified source is
            obtained.
          </li>
          <li>
            <strong>This set cannot adjudicate a solar-versus-wind bias
            outside Chile.</strong>{" "}Worth stating plainly, because it is the
            question the map is most often used to answer. The 32 sites sit in
            one country, in a resource regime — Atacama solar and Magallanes
            wind — that is close to the global extreme for both technologies,
            and the comparison validates <em>total</em>{" "}LCOH per site rather
            than the two single-technology layers against each other. So it
            says nothing about whether the solar or the wind layer is
            systematically high or low in, say, maritime Southeast Asia, where
            both the resource physics and the data pathway (ERA5 rather than
            SARAH3, and a wind field whose within-hex spread exceeds its mean
            — §34) are different. A finding of the form &ldquo;wind beats
            solar here&rdquo; in an un-benchmarked region rests on the model
            alone, not on this validation.
          </li>
        </ul>

        {/* 28 */}
        <H id="fe-limitations">33. Emission-method limitations &amp; open items</H>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            &ldquo;VLSFO&rdquo; is not an Annex II fuel class — residual
            fuels are classed by ISO 8217 viscosity grade (80 cSt splits
            LFO from HFO), not sulphur, so most VLSFO sold (typically RMG
            380) is the HFO row. The baseline menu therefore offers the
            Annex II classes directly — HFO (RME–RMK), LFO (RMA–RMD),
            MDO/MGO (DMX–DMB) — loaded atomically from one row each and
            confirmed against the DG MOVE FuelEU guidance document and the
            ESSF SAPS WS1 working document; factors are never mixed across
            rows.
          </li>
          <li>
            The IMO fossil WtT bands (16.8 / 14.1) and the LNG LCV
            divergence (0.0480 vs Annex II&apos;s 0.0491) are confirmed via
            a paper citing MEPC.391(81) verbatim (arXiv:2502.07201);
            paragraph-level verification against the resolution text
            itself, the IMO distillate WtT, and the IMO residual LCVs
            remain open — the last two are carried from Annex II as
            disclosed substitutions.
          </li>
          <li>
            LNG evaluates under FuelEU per engine technology, but its WtT
            of 18.5 gCO2e/MJ is carried from a secondary table pending
            verification against the Annex II LNG row; under the IMO
            framework it refuses (§14). e-Methanol evaluates as a
            certified-pathway fuel (the user supplies the E-value per
            project, range 1–28.2 gCO2e/MJ), but the dedicated DAC-sourced
            and point-source-captured pathway rows from RED Delegated
            Regulation 2023/1185 remain to be added, and its combustion
            CH4/N2O are carried as nil pending an Annex II methanol row.
          </li>
          <li>
            Out of scope by design: cost (the corridor model prices),
            fleets and voyages (quantity is the unit), FuelEU/IMO
            compliance-balance arithmetic (pooling, banking, penalties),
            blue/grey ammonia and the bio-fuel pathways (research rows
            pending), non-marine fuels.
          </li>
        </ul>

        <H id="m-limitations">34. Limitations</H>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            No compression, storage, transport, or downstream conversion — the
            boundary is the electrolyzer outlet.
          </li>
          <li>
            One representative year repeated; no inter-annual variability,
            battery buffering, or part-load efficiency curve. Oversizing is
            swept on the map&apos;s
            best-achievable layer (&sect;26), though the headline layers stay at
            the fixed 2:1 design point.
          </li>
          <li>
            <strong>Map cells use one representative coordinate per H3
            hexagon — and for wind that is sometimes not enough.</strong>{" "}A
            res-3 hex covers roughly 12,000 km², computed from a single
            centroid. Measured against the finer res-4 cells already seeded
            inside their parents, the wind capacity factor varies a lot{" "}
            <em>within</em>{" "}a hex everywhere: mean spread 0.061 CF across
            Indonesian hexes, 0.266 across Chilean ones. Note the direction —
            the absolute spread is <em>larger</em>{" "}in Chile, so this is a
            property of the resolution, not of any one region.
          </li>
          <li>
            What differs is the spread <em>relative to the value</em>. Chilean
            hexes average 0.15–0.42 CF, so a hex value still ranks a region
            usefully. Indonesian hexes cluster at 0.02–0.07, where a spread of
            0.061 <strong>exceeds the mean</strong>: the number stops being a
            weak estimate of a site and becomes uninformative about it.
            Indonesian wind is a ridge-siting problem, not a regional average
            — which is why a hand-picked coordinate can imply CF 0.20–0.25
            while the hex 65 km away reports 0.044, and <em>both are
            right</em>. Cells below 12% wind CF therefore carry an explicit
            note in the cell drawer telling the reader to treat the figure as
            a typical unsited location. The threshold is on the data, not on a
            region list, because the same condition holds anywhere wind is
            weak and terrain-driven.
          </li>
          <li>
            <strong>Wind model tiers.</strong>{" "}Not every cell is built by
            the improved wind path (&sect;20): fallback cells use a generic
            curve with fixed shear and neither the density nor the class
            correction, and some older cells do not record which path built
            them. Both facts are surfaced rather than smoothed over —
            fallback cells are outlined on the map and named in the cell
            drawer, and an unrecorded provenance is reported as unrecorded
            rather than asserted either way.
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
        <H id="provenance">35. Provenance, versions &amp; limits</H>
        <p className="mt-2">
          The defaults reproduce the study — the MMMCZCS Chilean
          copper-concentrate corridor — exactly; every departure from it is
          opt-in and listed here. The seven numbered divergences (D1–D7) are
          those deliberate departures:
        </p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>D1 — emissions basis</strong>: CO2 abated (and $/tCO2)
            can count well-to-wake lifecycle emissions instead of the
            study&apos;s combustion-only basis (§11).
          </li>
          <li>
            <strong>D2 — FuelEU over-compliance credit</strong>: a compliance
            surplus can earn revenue instead of being floored at zero, with
            the RFNBO multiplier (§11).
          </li>
          <li>
            <strong>D3 — ETS gas coverage</strong>: the maritime ETS charge
            can cover CH4 and N2O from 2026 — material for LNG methane slip
            and ammonia N2O — instead of CO2 alone (§11).
          </li>
          <li>
            <strong>D4 — sourcing modes</strong>: green fuel can be
            purchased, built as a dedicated plant, or built at an evaluated
            map site, rather than the study&apos;s one fixed construct (§6).
          </li>
          <li>
            <strong>D5 — 45Z sunset</strong>: the credit can end after 2027
            as legislated; the study runs it with no sunset (§11).
          </li>
          <li>
            <strong>D6 — rate basis</strong>: costs can be discounted on a
            real basis, deflating the OPEX escalation, instead of the
            study&apos;s nominal convention (§10).
          </li>
          <li>
            <strong>D7 — production-country WACC</strong>: a build-here plant
            is financed at the production country&apos;s cost of capital, a
            deliberately separate number from the corridor&apos;s discount
            rate (§6).
          </li>
        </ul>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Source behaviours preserved</strong>{" "}— the
            construct-mode double count (never
            selectable: only a scenario carrying the{" "}
            <code>legacyExcelConstruct</code>{" "}flag
            passes the double-count guard, which keeps its fuel-price row
            charged alongside production costs), no
            45Z sunset, and cargo throughput deliberately not linked to fuel
            burn. <strong>Stated-burn scenarios also survive</strong>: a
            scenario carrying an explicit tonnage override
            (<code>fuelTonnesPerVesselYear</code>) keeps its exact tonnage
            with a visible OVERRIDE badge
            against the distance-derived benchmark. That flat tonnage ignores
            which fuel is in the tank, so such scenarios often burn the same
            mass on both sides and compare very unequal delivered energy;
            the parity check (§3) says so.
          </li>
          <li>
            <strong>Output contract</strong>{" "}— module outputs appear only
            while their module is active: the IMO and financing per-year
            lines and PV totals are conditional keys, the dual-tonnage
            comparison (the{" "}
            <code>divergences</code>{" "}block) only exists under well-to-wake,
            and the IMO Net-Zero result
            (<code>reporting.imoNetZero</code>) is either the per-side
            result or a{" "}<em>not parameterised</em>{" "}marker. One naming
            trap: with green financing on, the reported{" "}
            <em>net regulatory effect</em>{" "}includes the financing line
            (everything outside the pre-regulation subtotal); the Results
            surfaces split it back out — the Regulation card and waterfall
            bar show the regulation-only net, financing its own line.
          </li>
          <li>
            <strong>Not modelled</strong>{" "}— port congestion, weather
            routing, fuel-price trajectories over time (prices escalate with
            general inflation only; carbon prices carry optional escalators),
            residual vessel value, and financing beyond one corridor WACC
            plus the explicit green-financing interest line.
          </li>
          <li>
            <strong>Disclaimer</strong>{" "}— outputs are estimates from public
            benchmarks and your inputs, not investment, legal or regulatory
            advice; unverified benchmarks are flagged in the UI. Verify
            against primary sources before committing capital.
          </li>
        </ul>

        <H3 id="prov-fourways">The same corridor, four ways</H3>
        <p className="mt-2">
          The corridor is seeded four times, because &ldquo;what did the
          report say?&rdquo; and &ldquo;what does the model think?&rdquo; are
          different questions with different answers. The four variants
          differ in <em>how much study knowledge each one asserts</em>, from
          27 overridden fields down to none.
        </p>
        <p className="mt-2">
          <em>As published</em>{" "}adopts the report&apos;s own emission
          accounting and brings every published figure back, all six within
          1.7%. It lands bit-identical to the shipped default ($1,762.21m /
          1,450,095 t / $1,215 per tCO2) while resolving against the{" "}
          <em>current</em>{" "}vessel catalogue rather than the dated
          reference bundle the default pins — the same answers out of two
          different reference datasets, which is what distinguishes a
          reproduction from a coincidence.
        </p>
        <p className="mt-2">
          <em>Default</em>{" "}— the shipped scenario — reproduces the study
          by <em>asserting its answers</em>: the fuel burns, the fossil fleet
          cost and a $280/t regulatory proxy are all typed in. That is how
          you prove an engine can hit a published total. It departs from the
          report on exactly two figures — CO2 abated and the regulatory
          benefit, both −23% — and both trace to one number: the report
          treats green ammonia as zero well-to-wake, while the emission
          method derives a 22.14 gCO2e/MJ blend (§15) and holds that a zero
          is not a certifiable value.
        </p>
        <p className="mt-2">
          <em>Current model</em>{" "}releases those overrides and lets the
          model derive what the default asserts. Consumption derives from the
          researched Handymax (2.334 GJ/nm) and the corridor&apos;s own
          geometry; the fossil counterfactual is priced from the catalogue as
          a newbuild fleet; regulation comes from the structured IMO module
          (the draft-MEPC-83 ladder) instead of the fitted flat price; and
          green financing appears as its own line, where the study&apos;s
          waterfall puts it (§10 holds the arithmetic). Capital phasing
          stays off: the study states no deployment schedule, so any weights
          would be invented.
        </p>
        <p className="mt-2">
          <em>Benchmarks only</em>{" "}is the strict case:{" "}
          <strong>zero overridden fields</strong>. Every figure is a
          reference-data benchmark or derived from the route — no burn, no
          plant cost, no fleet price is typed in, and the $280/t proxy is off
          too, because a fitted input is an assertion even when it is not an
          override. It answers what this route costs if you know only the
          route, and it lands 24% below the study: the researched plant
          benchmark, scale-corrected to this corridor&apos;s 60 kt/yr, costs
          $827m against the study&apos;s fitted $1,100m. That residual is
          scale, first-of-a-kind execution and site quality — nothing was
          tuned to close it, because landing exactly on $2,000m would have
          meant something was.
        </p>
        <p className="mt-2">
          The table below compares all four against the report&apos;s own
          figures: <em>As published</em>, <em>Default</em>{" "}(the shipped
          default scenario), <em>Current model</em>{" "}and{" "}
          <em>Benchmarks</em>{" "}(benchmarks only). Bold marks the three
          refreshed variant-project columns; the Default column — the shipped
          scenario itself — is not bold.
        </p>
        <div className="my-3 overflow-x-auto">
          <table className="w-full border border-neutral-300 text-[13px] tabular-nums">
            <thead>
              <tr className="border-b border-neutral-300 bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th className="px-3 py-2 font-medium">Metric</th>
                <th className="px-3 py-2 text-right font-medium">Report</th>
                <th className="px-3 py-2 text-right font-medium">As published</th>
                <th className="px-3 py-2 text-right font-medium">Default</th>
                <th className="px-3 py-2 text-right font-medium">Current model</th>
                <th className="px-3 py-2 text-right font-medium">Benchmarks</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Green corridor NPV", "$2,850m", "+0.02%", "+0.02%", "+0.02%", "−31%"],
                  ["Fossil corridor NPV", "$850m", "−1.4%", "−1.4%", "+2.6%", "−46%"],
                  ["Gap NPV (pre-regulation)", "$2,000m", "+0.6%", "+0.6%", "−1.1%", "−24%"],
                  ["Cost per cargo tonne (pre-reg.)", "$80/t", "+1.6%", "+1.6%", "−0.06%", "−23%"],
                  ["CO2 abated (15 yr, well-to-wake)", "1.45 Mt", "+0.01%", "−23%", "−4.2%", "−4.2%"],
                  ["Regulatory benefit", "≈$250m", "+0.09%", "−23%", "n/a", "n/a"],
                  ["Overridden fields", "—", "27", "21", "17", "0"],
                ] as const
              ).map(([metric, report, published, dflt, derived, bench]) => (
                <tr key={metric} className="border-b border-neutral-200 last:border-0">
                  <td className="px-3 py-1.5">{metric}</td>
                  <td className="px-3 py-1.5 text-right">{report}</td>
                  <td className="px-3 py-1.5 text-right font-medium">{published}</td>
                  <td className="px-3 py-1.5 text-right">{dflt}</td>
                  <td className="px-3 py-1.5 text-right font-medium">{derived}</td>
                  <td className="px-3 py-1.5 text-right font-medium">{bench}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2">
          <strong>What the comparison proves.</strong>{" "}Deriving the burn
          lands closer to the study than asserting it did — CO2 abated moves
          from −23% to −4.2% and cost per cargo tonne from +1.6% to −0.06%,
          with nothing tuned: the model is let go and then scored, which is
          independent corroboration of the vessel catalogue. Delivered-energy
          parity becomes exact by construction (ratio 1.000) rather than by
          coincidence. The residuals that remain are stated rather than
          tuned: the green plant costs are still the study&apos;s fitted
          figures because nothing has replaced them as a source, and the CO2
          gap is an accounting disagreement, not an arithmetic one. The
          as-published variant is therefore the report&apos;s accounting,
          not the model&apos;s best estimate, and should not be read as one.
        </p>

        <H id="fe-sources">36. Emission-method source references</H>
        <p className="mt-2">
          Every factor the emission method uses is anchored to a named
          published source; the table lists each source and what it anchors.
        </p>
        <div className="my-3 overflow-x-auto">
          <table className="w-full border border-neutral-300 text-xs">
            <thead>
              <tr className="border-b border-neutral-300 bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">What it anchors</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Regulation (EU) 2023/1805, Annex II (FuelEU Maritime)", "Default LCVs, WtT factors, TtW CO2/CH4/N2O per fuel; the AR4 GWP basis; the VLSFO reference energy content; the missing-value rule (Article 10)."],
                  ["RED II Article 28(5) + Delegated Regulation (EU) 2023/1185", "The RFNBO ceiling of 28.2 gCO2eq/MJ (≥70% saving vs the fossil comparator) and certified pathway E-values for e-fuels."],
                  ["IMO: 2024 LCA Guidelines, MEPC.391(81) rev. MEPC.376(79)", "The global framework's default-value structure, the AR5 GWP basis, and the 93.3 gCO2eq/MJ 2008 reference GFI."],
                  ["MEPC 83 approved Net-Zero Framework text (April 2025) + IMO Net-Zero Framework FAQ", "ZNZ thresholds: at most 19.0 gCO2eq/MJ to end-2034, 14.0 from 1 January 2035 — applying to the fuel/energy source's own WtW intensity, not the ship's attained GFI (FAQ wording verified 2026-08-14). Adoption targeted MEPC 85 (October 2026) — provisional."],
                  ["MEPC 83/7/23 — Pacific Environment / Clean Shipping Coalition", "The ammonia N2O literature range (6.81×10⁻⁵ to 2.5×10⁻³ g N2O/g NH3) and the optimised-injection reduction figure behind the default scenario."],
                  ["BetterSea, 'How to Calculate GHG Intensity under FuelEU Maritime'", "The published worked example (7,000 t HFO containership, 91.744 gCO2e/MJ under AR4) reproduced to three decimals as a hand-computed reference case."],
                  ["European Commission DG MOVE, FuelEU guidance document for shipping companies", "Verbatim reproduction of the Annex II table used to confirm the HFO / LFO / MDO-MGO rows (retrieved 2026-08-14)."],
                  ["ESSF SAPS WS1 working document", "Second independent reproduction of the Annex II table — cross-check for the same three rows (retrieved 2026-08-14)."],
                  ["Sustainable Ships, 'Emission Properties for EU ETS, FuelEU and IMO Net-Zero' (July 2025)", "Per-engine methane-slip values under both frameworks (Otto MS/SS, Diesel SS, LBSI, steam) and the biofuel reference E-value note."],
                  ["Ammonia Energy Association (September 2025), citing MAN ES Research Centre Copenhagen and WinGD", "The ~95/5 ammonia/pilot energy split, tested two-stroke N2O emission levels, and the efficiency-ratio 1.0 evidence."],
                  ["'Well-to-Tank Carbon Intensity Variability of Fossil Marine Fuels' (arXiv:2502.07201, Feb 2025)", "Verbatim citation of MEPC.391(81) fossil WtT defaults — HFO 0.10–0.50% S = 16.8, >0.50% S = 14.1 gCO2e/MJ — and the IMO LNG LCV of 0.0480 MJ/g (retrieved 2026-08-14)."],
                  ["ICCT (April 2025)", "The missing IMO default upstream factor for fossil LNG and the real 18.5–28 gCO2e/MJ range — the reason LNG refuses under the IMO framework."],
                  ["GCMD GFI calculator (post-MEPC 83)", "Planned independent cross-check (e-ammonia case) — open item, not yet reproduced."],
                ] as const
              ).map(([src, anchors]) => (
                <tr key={src} className="border-b border-neutral-200 align-top last:border-0">
                  <td className="px-3 py-1.5 font-medium">{src}</td>
                  <td className="px-3 py-1.5 text-neutral-600">{anchors}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-neutral-600">
          The reference dataset (
          <code>data/fuel-emissions-ref/2026-08-17-ets-carbon-4.json</code>) carries
          these citations row by row — every factor in the calculator&apos;s
          decomposition table surfaces its own source and derivation in a
          tooltip, and rows pending primary-source verification render with
          the unverified badge.
        </p>

        <H id="m-sources">37. Sources</H>
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
        {/* ===================== APPENDIX — REFERENCE MATERIAL ===================== */}
        <div className="mt-16 border-t-2 border-neutral-300 pt-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-deep">
            Appendix
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-neutral-900">
            Reference material
          </h2>
          <p className="mt-2 text-neutral-600">
            Every field a scenario can carry, and the constants the methodology uses.
          </p>
        </div>

<H id="inputs">38. Complete input inventory</H>
        <div className="mt-3 border border-brand/40 bg-brand-tint px-4 py-3">
          <p className="text-sm font-medium text-brand-deep">
            Writing a scenario file by hand?
          </p>
          <p className="mt-1 text-[13px] leading-snug text-neutral-700">
            For desk research and AI-assisted data entry there is a generated{" "}
            <strong>JSON input template</strong>{" "}at{" "}
            <code>docs/corridor/input-template.md</code>. It carries the complete
            object to copy, the legal id values for every field the importer
            will reject you for, the unit and bound of every number, a{" "}
            <em>what you must not do</em>{" "}table, and the minimum set of
            decisions that yields a meaningful scenario. It is generated from
            this same schema and reference bundle, and the published template
            always imports and computes — it cannot
            drift from the model it describes.
          </p>
          <p className="mt-2 text-[13px] leading-snug text-neutral-700">
            The three rules that cause the most silent damage:{" "}
            <code>null</code>{" "}means &ldquo;use the model&apos;s own
            value&rdquo;, never zero; every non-null number is an{" "}
            <strong>override</strong>{" "}that replaces a figure the model would
            otherwise derive consistently with the rest of the scenario; and
            an <strong>unknown key is ignored in silence</strong>{" "}— a
            misspelled field imports cleanly and is simply dropped, so
            confirm each value you meant to set actually shows an OVERRIDE
            badge. A wrong <em>value</em>{" "}is rejected and names its path; a
            wrong <em>key</em>{" "}is not.
          </p>
        </div>
        <p className="mt-2">
          Every field a scenario can carry. The table is generated from the
          model itself — the same definitions that validate an imported file,
          joined to the measurements in §29 — and rebuilt on every change, so
          it cannot fall out of step with the model it describes. In the
          table, <strong>#</strong>{" "}is the row number,{" "}
          <strong>Field</strong>{" "}is the dot-path the field uses in a
          scenario file, <strong>Type</strong>{" "}is the value&apos;s JSON
          type and <strong>Req.</strong>{" "}means Required.{" "}
          <em>Required&nbsp;=&nbsp;no</em>{" "}marks an optional field: omit
          it and the model uses its own value; an override field set to{" "}
          <code>null</code>{" "}means
          &ldquo;use the model&apos;s own value&rdquo;.
        </p>
        <p className="mt-2">
          <strong>Rank</strong>{" "}and{" "}<strong>Max gap movement</strong>{" "}
          come from the same sweep behind §29: movement is how far the field
          can push the headline cost gap across its assumed range, as a
          percentage of the gap, and rank orders every swept field by that
          figure. §29 shows each input&apos;s impact on the cost gap and the
          CO&#8322; abatement cost side by side; this table carries the gap
          figure so the measurement sits next to the field&apos;s definition.
          Form placement follows the largest movement across all six KPIs.
        </p>
        <p className="mt-2">
          Some entries read &ldquo;—&rdquo; in the movement columns, and the{" "}
          <strong>Status</strong>{" "}column says which of three reasons
          applies: of {FIELD_TIERS.total}{" "}scenario fields,{" "}
          {FIELD_TIERS.measured}{" "}carry an elasticity,{" "}
          {FIELD_TIERS.sweptOnly}{" "}are swept but not perturbable on the
          three archetypes, and {FIELD_TIERS.notSwept}{" "}are outside the
          sweep entirely. Most of the last group are simply not the kind of
          field a sweep can move: a
          selector, a toggle, an id, or a value that only exists in one
          sourcing mode (fossil production costs are zero when the fuel is
          bought rather than built). One case is worth knowing about because
          it looks like an error and is not:{" "}
          <code>cargo.unitsPerYear</code>{" "}is swept and measures exactly
          0.0% on the gap, because the engine counts vessels and roundtrips
          rather than cargo units — yet it is the sole divisor of cost per
          cargo unit, so it dominates that KPI while leaving the gap
          untouched. That is why a 0.0% here does not mean the field does
          nothing, and why placement follows all six KPIs rather than the
          gap alone.
        </p>
        <p className="mt-2">
          The <strong>Elasticity</strong>{" "}and <strong>Coupled</strong>{" "}
          columns carry the leverage measurements defined in §29: elasticity
          is the model&apos;s response to a small standard nudge, reported as
          a range across the three archetypes because the spread is the
          finding, and coupled fields are grouped because their individual
          figures overstate them — §29 explains both mechanisms and their
          limits (one input at a time; interactions invisible).
        </p>
        <p className="mt-2">
          <strong>Placement</strong>{" "}says where the field appears in the
          interface; it is decided by the measured movement across all six
          outputs, and is deliberately narrower than the ranking:{" "}
          <em>top-level</em>{" "}
          renders prominently (fields moving a headline output by ≥5%),{" "}
          <em>advanced</em>{" "}renders behind the
          Standard view, and &ldquo;—&rdquo; means the field&apos;s
          visibility is decided by its section&apos;s own controls — a field
          can be a large documented mover while living behind a module
          toggle or a dedicated control.
        </p>
        <div className="my-3 overflow-x-auto">
          <table className="w-full border border-neutral-300 text-xs">
            <thead>
              <tr className="border-b border-neutral-300 bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th className="px-3 py-2 text-right font-medium">#</th>
                <th className="px-3 py-2 font-medium">Field</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Req.</th>
                <th className="px-3 py-2 font-medium">Rank</th>
                <th className="px-3 py-2 text-right font-medium">Max gap movement</th>
                <th className="px-3 py-2 text-right font-medium">Elasticity</th>
                <th className="px-3 py-2 font-medium">Coupled</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Placement</th>
              </tr>
            </thead>
            <tbody>
              {FIELD_ROWS.map((row, i) => (
                <tr key={row.path} className="border-b border-neutral-200 last:border-0">
                  <td className="px-3 py-1.5 text-right tabular-nums text-neutral-400">
                    {i + 1}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono">{row.path}</td>
                  <td className="px-3 py-1.5 font-mono text-neutral-600">
                    {TYPE_OVERLAY[row.path] ?? row.type}
                  </td>
                  <td className="px-3 py-1.5">{row.required ? "yes" : "no"}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">
                    {row.rank != null ? `#${row.rank}` : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {row.movementPct != null ? `${row.movementPct.toFixed(1)}%` : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {row.elasticity ?? "—"}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[11px] text-neutral-600">
                    {row.coupled?.length ? row.coupled.join(", ") : "—"}
                  </td>
                  <td
                    className={`px-3 py-1.5 text-[11px] leading-snug ${
                      row.status === "measured"
                        ? "font-medium text-neutral-800"
                        : "text-neutral-500"
                    }`}
                  >
                    {row.status ?? "—"}
                  </td>
                  <td className="px-3 py-1.5">{row.placement}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-neutral-600">
          The <code>green.buildHere</code> / <code>fossil.buildHere</code>{" "}
          object stores the evaluated site:
        </p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-neutral-600">
          <li>
            <strong>Identity</strong>{" "}— cell id and coordinates.
          </li>
          <li>
            <strong>Evaluated snapshot</strong>{" "}— LCOH, annual H2, capital,
            year-1 operating, discount rate, engine version, plant life.
          </li>
          <li>
            <strong>The five cost components</strong>{" "}— H2 capital, H2
            operating, synthesis capital, synthesis operating, logistics
            operating; each{" "}
            <code>{"{ derivedUsdM, overrideUsdM }"}</code>.
          </li>
          <li>
            <strong>Firm-power resolution</strong>{" "}— evaluated vs required
            duty, the chosen strategy and whether you picked it, its capital,
            operating and imported-CO₂ cost.
          </li>
          <li>
            <strong>Sizing record</strong>{" "}— nameplate, margin, scale
            factor, project archetype, FOAK (the first-of-a-kind cost
            factor), surplus, distance.
          </li>
        </ul>
        <p className="mt-2 text-neutral-600">
          This table and its markdown twin{" "}
          <code>docs/corridor/field-reference.md</code>{" "}are written by the
          same generator from the same artifacts, so the two cannot drift
          apart from the model.
        </p>
        <H id="m-constants">39. Constants &amp; reference defaults</H>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="font-medium">Physical constants</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px]">
              <li>LHV of hydrogen: 33.33 kWh/kg</li>
              <li>Hours per year: 8760 (non-leap)</li>
              <li>
                Water consumption: 9 L/kg H₂{" "}
                <span className="text-neutral-500">
                  (stoichiometric floor — a plant needs 15–30; see §19)
                </span>
              </li>
              <li>Desalination electricity: 3.75 kWh/m³</li>
              <li>Pumping electricity: 0.40 kWh/m³ per 100 m</li>
            </ul>
          </div>
          <div>
            <p className="font-medium">Reference defaults</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px]">
              <li>
                Lifetime 20 yr · discount rate 8%/yr{" "}
                <span className="text-neutral-500">
                  (real — cashflows are constant-USD, see §23)
                </span>
              </li>
              <li>Electrolyzer 100 MW · 2300 USD/kW · 1.3% OPEX/yr</li>
              <li>Efficiency 60% LHV · degradation 1%/yr</li>
              <li>Stack life 50 000 h · replacement 13% of CAPEX (~$300/kW)</li>
              <li>Renewables 30 USD/MWh (or 850 USD/kW + 1% OPEX)</li>
              <li>Water 0.50 USD/m³ + 0.09/m³ per 100 km</li>
            </ul>
          </div>
        </div>

        {/* 23 */}
        
        </main>
      </div>
      <Footer />
    </>
  );
}
