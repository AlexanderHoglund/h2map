import Footer from "@/components/shell/Footer";
import { requireAccess } from "@/lib/server/access";
import TopBar from "@/components/shell/TopBar";
import CountryDefaultsTable from "@/components/docs/CountryDefaultsTable";
import DocsNav from "@/components/docs/DocsNav";
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
 * §22 renders the GENERATED field reference (gen-docs writes the JSON next
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
  placement: string;
}
const FIELD_ROWS: FieldRow[] = (fieldReference as { rows: FieldRow[] }).rows;

/** §20's top-10 — same generated artifact, so it can never contradict §22. */
const SENSITIVITY_TOP10 = (
  sensitivityArtifact as {
    ranked: {
      id: string;
      label: string;
      relHeadlineMovement: number;
      maxRelMovement: number;
      bindingKpi: string;
    }[];
  }
).ranked.slice(0, 10);

/** KPI ids → the names §20 shows in its binding column. */
const KPI_LABEL: Record<string, string> = {
  gapPvUsdM: "cost gap",
  costPerUnitUsd: "$/cargo unit",
  costPerTonneCo2Usd: "$/tCO₂",
  greenTotalPvUsdM: "green total",
  fossilTotalPvUsdM: "fossil total",
  co2AbatedTonnes: "CO₂ abated",
};



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
          ammonia dual-fuel Handymax bulkers (§21).
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
          gap by ≥5% (§20).{" "}
          <strong>Standard</strong>{" "}shows everything. Every hidden field
          keeps its default or benchmark value — the mode never changes a
          number — and each section shows a counted strip naming how many
          hidden settings are in effect, one click from review. Placement is
          not editorial: the sweep decides it. Simplified additionally fixes
          the STRUCTURE: fuel is purchase-sourced (the sourcing selector and
          the map-sited build flow are Standard capabilities) and regulation
          is the self-designed scheme alone (toggle + CO2 price; the
          EU/IMO/US modules render only in Standard, with a strip reporting
          any that a scenario carries active).
        </p>

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
          created. Every account starts with five projects: the{" "}
          <em>Example — Chilean copper corridor</em>{" "}(the published reference
          case, a Standard project, created once — deleted, it stays gone);
          three further Standard views of that same corridor, each asserting
          less than the last —{" "}
          <em>… — as published</em>{" "}(the report&apos;s own emission
          accounting, reproducing all six published figures),{" "}
          <em>… — current model</em>{" "}(the study&apos;s asserted burns and
          fleet costs released, so the model derives them) and{" "}
          <em>… — benchmarks only</em>{" "}(nothing asserted at all: every
          figure a bundle benchmark or derived from the route);
          and{" "}
          <em>Simple corridor (template)</em>{" "}(a blank purchase-sourced
          Simplified template — generic route, benchmark costs, every scheme
          off — kept available for every account: deleting it brings the
          template back on the next visit, and edits to it are yours to
          keep).
        </p>
        <p className="mt-2">
          <strong>The three named variants are refreshed on every
          visit.</strong>{" "}They are reference material, not documents: their
          value is showing what the model <em>currently</em>{" "}says about one
          published corridor, so a copy left behind on an older reference
          bundle would look authoritative while being out of date. Edits to
          them are therefore overwritten — rename a copy if you want to keep
          one. The original{" "}<em>Example — Chilean copper corridor</em>{" "}
          and the Simplified template are both left alone, because those are
          places people work rather than mirrors of a shipped definition.
          Creating a new project asks for a name and its level —{" "}
          <strong>Simplified or Standard</strong>. The level is stored on the
          project and is a ONE-WAY ladder: a Simplified project can be
          upgraded to Standard from the header (permanent — it unlocks
          every field), a Standard project never becomes Simplified. A
          Simplified project works purchase-sourced fuel against the
          self-designed scheme only; Standard opens plant construction,
          map-sited production and the EU/IMO/US regulation modules.
        </p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Draft autosave</strong>{" "}— every change is saved locally
            in your browser as the working copy of the current project; the
            entry screen&apos;s button reads{" "}<em>Resume draft</em>{" "}when
            one exists, and the Projects tab&apos;s &ldquo;Currently
            editing&rdquo; card continues it. Opening or creating another
            project replaces the working copy — the app asks before
            discarding unsaved changes (Import and Reset carry their own
            confirmations).
          </li>
          <li>
            <strong>Save / Duplicate</strong>{" "}— the scenario bar stores the
            current scenario to your account (server-validated, with the
            engine and reference-data versions pinned). Save updates the
            open project — or creates one when none is open; Duplicate makes
            a copy named &ldquo;… (copy)&rdquo;. The URL then carries the
            project id, so a bookmark reopens it. The bar leads with the
            project identity (a mono PROJECT eyebrow + the name field + an
            amber &ldquo;unsaved&rdquo; badge for drafts) on every working
            tab.
          </li>
          <li>
            <strong>The Projects tab</strong>{" "}— all management lives on
            tab 00: open (loading under a newer schema or engine is
            announced, never silent — stale rows carry an &ldquo;older
            engine&rdquo; badge), rename in place, share-link copy/revoke,
            and <strong>delete</strong>{" "}(with confirmation). Each row
            shows the project&apos;s Simplified/Standard level as a chip.
          </li>
          <li>
            <strong>Share</strong>{" "}— creates a read-only link
            (/corridor/s/…) anyone can open without an account; the
            unguessable token is the access, and revoking it kills the link.
            Shared views show the stored results; when the saved row predates
            the current engine or reference bundle, an explicit
            recompute-under-current-model option appears (with a gap
            preview), and any signed-in viewer can open the shared scenario
            as their own draft.
          </li>
          <li>
            <strong>Export / Import JSON</strong>{" "}— the scenario bar downloads
            the scenario as a versioned JSON file in the COMPLETE form: every
            field of the form is always present, in a fixed order — fields
            you have not set are explicit{" "}<code>null</code>{" "}(port
            coordinates, country B, the financing and phasing blocks…), so
            the file documents the entire input surface. Import accepts the
            same complete form and older partial exports alike; files carry
            a schema version, older files are migrated on load, and the
            working copy takes the imported file&apos;s name.
          </li>
          <li>
            <strong>Completion dots</strong>{" "}— every tab carries a
            validation-derived indicator (never visit-derived): ✓ complete,
            ▲ running on an unverified top-level benchmark (today exactly
            the country WACC), ✕ a fault that blocks results — landing on a
            flagged tab focuses the offending control. The header also keeps
            a live gap chip and the project&apos;s Simplified/Standard level
            badge (with the one-way Upgrade button on Simplified projects).
          </li>
          <li>
            <strong>Reset</strong>{" "}— starts a NEW unsaved draft at the
            reference defaults (with confirmation): it also detaches the
            workspace from the open project — the saved row itself is
            untouched.
          </li>
          <li>
            <strong>Navigation</strong>{" "}— nine tabs in the top bar:
            Projects (00), seven input steps (01–07) and Results (08). The
            input steps stay DISABLED until a project is selected or created;
            after that they are free navigation, and Back/Next at the bottom
            of each form walks them in order. The Results tab (§10) holds the
            full report; a compact live summary stays docked on every input
            tab.
          </li>
        </ul>

        <H id="tab-intro">3. Tab 01 — Intro</H>
        <p className="mt-2">
          Defines the trade lane: route, countries, ports and the model
          horizon. Each end of the corridor is its own boxed group — country
          first (the constraining choice), then the port name and the
          coordinates that drive the map and the sea routing.
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
              "One-way distance; drives fuel consumption (×2 per roundtrip) — among the strongest inputs in the model (§20). With both ports pinned, the model also computes an INDICATIVE sea route on the maritime network (canal transits labelled Panama/Suez) and shows it as a derived benchmark: adoption is an explicit click, never automatic, and a typed distance diverging >15% from the routed figure gets an amber note.",
            ],
            [
              "Model start year",
              "year",
              "2030 (default)",
              "Calendar year of year 1. Matters for the regulation schedules: the ETS phase-in, the FuelEU target ladder and the IMO trajectories are calendar-anchored (§9).",
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
          basis — lives on the Financing tab (§8); the cargo identity on the
          Cargo tab (§6). Scenario keys keep their historical{" "}
          <code>cargo.*</code>{" "}paths regardless of which tab renders them.
        </p>

        <H id="tab-energy">4. Tab 02 — Energy</H>
        <p className="mt-2">
          The heart of the comparison: what each side burns and where it comes
          from. Both sides carry the same field set; the interesting choice is
          the green side&apos;s <strong>sourcing</strong>{" "}mode.
        </p>
        <H3 id="energy-sourcing">Sourcing modes (schema v4)</H3>
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
            tonne:{" "}
            <code>(nameplate / 1.2Mt)^(0.6−1) × FOAK</code>. At 60 kt/yr that
            is ×3.31 on synthesis capital before the archetype multiplier
            (×4.14 under the corridor default: first-of-a-kind dedicated,
            ×1.25). A ~60 kt plant sits ~20× below the
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
        <H3 id="energy-acceptance">Build-here acceptance: two Atacama sites (re-validated 2026-08-02)</H3>
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
        <H3 id="energy-perfuel">Per-fuel fields (each side)</H3>
        <Fields
          rows={[
            [
              "Fuel type",
              "—",
              "green: e-Ammonia · fossil: LSFO",
              "Selects the fuel's benchmark bundle: price, emission factors, energy density, production/storage/barge costs, vessel premium (§19).",
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
              "Always derived: 2 × distance × roundtrips × GJ/nm × 1000 / LHV, with a direct override as the escape hatch. The green side needs ~2.2× the mass because ammonia carries less energy per tonne. Worked example on the workbook baseline (tanker-35k at 4.0 GJ/nm, 500 nm × 12 roundtrips): green 2,580.6 t, fossil 1,194.0 t. The Chilean corridor's geometry (Handymax at 2.334 GJ/nm, 9,500 nm × 3) implies 7,152.6 and 3,284.9 — that scenario states its burns as overrides instead, to reproduce the study.",
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

        <H id="tab-vessels">5. Tab 03 — Vessels</H>
        <p className="mt-2">
          The ships that serve the corridor. One vessel type is shared by
          both sides. <strong>The CAPEX/OPEX cells are PER SHIP</strong>{" "}
          and the vessel count multiplies them into the fleet total, along
          with fuel burn and every regulation term. The default scenario
          costs both fleets as newbuilds: green 10 × $44m = $440m, fossil
          10 × $35m = $350m.
        </p>
        <p className="mt-2">
          <strong>This changed in schema v7, and it was a correctness
          fix.</strong>{" "}The cells used to be fleet totals that the engine
          never multiplied by vessel count — but the benchmark underneath
          them has always been per-ship (type CAPEX × (1 + premium)). So the
          field and the value offered by &ldquo;restore&rdquo; were different
          dimensions, and restoring a ten-ship fleet&apos;s green CAPEX cut
          it by an order of magnitude in silence, on what the sweep ranks as
          a top-five mover. Making the field per-ship puts it in the same
          dimension as its benchmark, which removes the trap rather than
          documenting it. Stored scenarios were divided by their vessel count
          on migration, so their numbers are unchanged.
        </p>
        <Fields
          rows={[
            [
              "Vessel type",
              "—",
              "Handymax bulk (58k dwt), default",
              "Sets the per-ship benchmark CAPEX/OPEX and the energy-per-mile figure (GJ/nm) that consumption derives from. 35 researched classes from Handysize bulk to 174k-m³ LNG carrier (§19). Seven superseded classes from the original workbook are retained so scenarios pinning them still resolve, but are hidden from the picker — they carry pre-research energy figures (the retired Handymax reads 3.2 GJ/nm against this one's 2.334).",
            ],
            [
              "Number of vessels",
              "ships",
              "10 (default)",
              "Multiplies fuel burn, every regulation term, and — since v7 — the per-ship vessel CAPEX/OPEX into fleet totals.",
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

        <H id="tab-cargo">6. Tab 04 — Cargo</H>
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
              "What one cargo unit IS. Defaults to tonne for tankers/bulk/Ro-Ro and TEU for container vessels. Switching writes the weight: TEU sets it to the ~14 t benchmark, tonne pins it to 1 (and the weight field hides).",
            ],
            [
              "Weight per unit",
              "t",
              "1 (tonne) / 14 (TEU)",
              "Renders only for TEU; used to derive cost per tonne of cargo. A stored tonne scenario with a different weight still computes with its stored value — nothing is rewritten on load.",
            ],
            [
              "Annual cargo throughput",
              "units/yr",
              "1,650,000 (default)",
              "Only feeds the per-unit figures and lifetime cargo — the sweep measures exactly 0.0% headline movement (§20). Standard view only.",
            ],
          ]}
        />

        <H id="tab-ports">7. Tab 05 — Ports</H>
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

        <H id="tab-financing">8. Tab 06 — Financing</H>
        <p className="mt-2">
          Separated from Regulation into its own tab (sprint 4 amendment):
          everything about the cost of money. The corridor discount rate
          (WACC, with its unverified-benchmark badge — the amber tab dot
          lives here), the inflation rate (scenario keys stay{" "}
          <code>cargo.*</code>) and the{" "}
          <strong>rate basis</strong>{" "}— nominal (inflation escalates
          costs, the nominal WACC discounts them) or real (deflates the OPEX
          escalation) — then the two flag-gated sprint-4 modules
          below. Both are off by default and both leave the golden default
          untouched.
        </p>
        <H3 id="fin-differentiated">Differentiated green financing</H3>
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
          would invert the benefit (§11). A negative spread (green premium)
          is allowed and shows as a cost.
        </p>

        <H3 id="fin-phasing">Capital deployment schedule</H3>
        <p className="mt-2">
          Off by default (all CAPEX in year 1). The toggle initialises
          both sides at 100% in year 1; the Standard view exposes a
          deployment-years selector (1–5), per-side share rows and a
          30/40/30 preset matching the reference study&apos;s build
          profile. Shares must sum to 1 per side — the form shows a live
          amber warning and the model refuses to compute rather than
          silently rescaling. The green financing drawdown follows the
          same schedule (§11).
        </p>


        <H id="tab-regulation">9. Tab 07 — Regulation</H>
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

        <H3 id="reg-accounting">Emission accounting (v6)</H3>
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
          pilot blend from the fuel-emissions dataset (§12–§18). Two rules
          keep it honest: the FuelEU and IMO <em>compliance modules</em>{" "}
          each price with their OWN framework regardless of this selection
          (the selector moves the reported intensities, abatement and the
          self-designed CO2 price), and explicit factor overrides in the
          Energy tab always win. Scenarios saved before v6 auto-upgrade to
          FuelEU accounting on open; the legacy workbook scalars survive
          only for the Excel golden fixture and the study-calibration test.
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
          GFI and the abatement figure instead.
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
          <strong>v6:</strong>{" "}WTW here is always the{" "}
          <em>FuelEU-accounted</em>{" "}intensity: when the emission method
          derived both frameworks&apos; values (§13), this module reads the
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
          <em>over-compliance credit</em>{" "}(divergence D2, off by default)
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
          <em>effective-until</em>{" "}calendar year (divergence D5) that zeroes
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
          <strong>Decision of record (sprint 4):</strong>{" "}the CAPEX/OPEX
          support instruments STAY inside self-designed regulation rather
          than moving to the Financing tab. One scheme, one toggle:
          splitting its four support fields across two tabs would cost more
          comprehension than the taxonomy gains, and the schemes they
          approximate (contracts-for-difference, capital grants) are
          policy instruments, not loan terms. Revisit if the IMO
          module&apos;s reward mechanism matures into a real support channel.
        </p>

        <H3 id="reg-imo">IMO Net-Zero Framework (provisional)</H3>
        <F>
          attained GFI = the side&apos;s WTW intensity, IMO-accounted
          [gCO2eq/MJ] — v6: the sulphur-binned fossil WtT and AR5 GWP set
          when derived (§13); falls back to the single WTW scalar on
          legacy scenarios
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
            new scenarios). Under well-to-wake the results carry a{" "}
            <code>divergences</code>{" "}block reporting BOTH tonnages side by
            side (§10); under the combustion default the block is absent and
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

        <H id="tab-results">10. Tab 08 — Results</H>
        <p className="mt-2">
          The full report. Every element recomputes on every keystroke; a
          compact summary of the same numbers stays docked on the input tabs.
          Reading order: KPI strip, scenario snapshot strip, the two cost
          bridges + the decomposition table, the two charts, then one result
          card per input tab. A{" "}<strong>Download Excel</strong>{" "}button
          above the report exports the same numbers as a styled two-sheet
          workbook (“Results”: headline, decomposition, per-year table;
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
          Regulation is <strong>grouped, not itemised</strong>: five
          instruments would draw five slivers and answer a question nobody
          asked. Hovering the bar breaks out every instrument inside it —{" "}
          <strong>including the ones that do not apply</strong>, shown as
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
          The block arithmetic lives in the engine (<code>buildCostBridge</code>),
          not the chart component, because the closure — that every block
          sums back to the headline gap — is only testable there. It is
          asserted relative to the gap at 1e-9 across every shipped scenario.
          Not bit-exact, deliberately: the engine sums each side&apos;s
          per-year rows then differences the totals, while the bridge sums
          per-instrument differences — same arithmetic, different
          association order, so the last one or two ULPs move (measured
          ≤1e-15 relative). A{" "}
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

        <H id="engine">11. The engine: formulas</H>
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
          exactly 1.000 and the check costs nothing. Override one side&apos;s
          burn alone and it silently stops being true, which is why the model
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

        {/* ================= PART 3 — FUEL EMISSIONS ================= */}
        {/* ============== THE EMISSION METHOD (§19–§18) ============== */}
        <div className="mt-12 border-t border-neutral-300 pt-6">
          <p className="text-neutral-600">
            <strong>The emission method (§19–§18)</strong>{" "}— how every
            gCO2e in the model is produced. Since v6 this ONE method serves
            two surfaces: the corridor engine derives its per-fuel factors
            from it (under the framework selected in Tab 07), and the
            standalone{" "}
            <a href="/fuelemissionscalculator" className="text-brand underline">
              Fuel Emissions Calculator
            </a>{" "}
            exposes it interactively. Four load-bearing decisions: the
            functional unit, the accounting framework, the combustion-side
            corrections, and the refusal to default what has no defensible
            default.
          </p>
        </div>

        <H id="fe-overview">12. The emission method &amp; functional unit</H>
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
          comparison runs through it — golden fixture F1 pins exactly this
          trap and fails any implementation that reintroduces it.
        </p>

        <H id="fe-frameworks">13. Accounting frameworks</H>
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
          dataset&apos;s own review note. The frameworks even CLASSIFY the
          same bunker differently: FuelEU bins residual fuels by ISO 8217
          viscosity grade while the IMO bins by sulphur content
          (MEPC.391(81)) — a typical 0.50%-S VLSFO is FuelEU&apos;s HFO row
          at WtT 13.5 but the IMO&apos;s 0.10–0.50%-S band at 16.8, a
          3.3-gCO2e/MJ divergence on the same physical fuel. The engine
          resolves the row per framework (a sulphur input appears under
          IMO) and substitutes an Annex II value ONLY where the IMO has no
          confirmed default (currently the distillate WtT), disclosing
          each substituted factor by name — it never falls back to a
          neighbouring value and never defaults to zero: LNG evaluates
          under FuelEU per engine technology but refuses under the IMO
          framework (the IMO guidelines lack a default upstream factor; the
          real range 18.5–28 gCO2e/MJ is 20–30% of HFO&apos;s whole
          lifecycle intensity, so a missing term flatters LNG
          substantially — FuelEU&apos;s WtT is never borrowed), and the
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

        <H id="fe-calculation">14. The emission calculation</H>
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
          The tool runs BOTH directions: a direction dropdown leads the
          form (default &ldquo;From fossil to zero / near-zero (ZNZ)
          fuel&rdquo;), which is ordered so the fuel you start from comes
          first; in that default direction the required ZNZ mass leads the
          results, and a one-sentence method line (functional unit,
          framework citation, GWP set, certified value, pilot, dataset
          version) closes them for citation. In reverse,
          the quantity is the baseline mass;
          the engine derives E<sub>base</sub>{" "}= quantity × LCV
          <sub>base</sub>, then E<sub>cand</sub>{" "}= E<sub>base</sub>{" "}/
          efficiencyRatio × (1 − pilotShare) and the required candidate
          mass — replacing 1,000 t of HFO needs 2,177.4 t of e-ammonia
          (40.5×10⁶ MJ ÷ 18,600 MJ/t). Every downstream quantity is the
          same computation, so the round trip is exact (property-tested).
        </p>
        <p className="mt-2">
          <strong>How the corridor consumes this method (v6).</strong>{" "}
          The corridor engine needs one WtW scalar, one combustion EF and
          one LHV per fuel. The derivation maps them as: green WtW := the
          BLEND intensity (certified WtT + N2O slip + pilot, over total
          delivered energy — the attained-GFI analogue; e-ammonia 22.14
          under FuelEU/AR4 at the defaults); green combustion EF := the TtW
          CO2e per tonne incl. slip and pilot combustion (0.140 t/t);
          fossil WtW := the framework&apos;s own row (91.744 FuelEU /
          94.90 IMO at 0.50%&nbsp;S); LHV := the dataset LCV. Both
          frameworks&apos; WtW values ride along so each compliance module
          prices with its own accounting. One documented approximation: the
          pilot&apos;s emissions ride the green fuel&apos;s factors while
          its ENERGY is not added to the corridor&apos;s tonnage. Where the
          method cannot honestly price a combination (LNG as a baseline;
          LNG under IMO) the corridor falls back to the legacy workbook
          scalar with disclosed provenance — never a silent zero.
        </p>
        <p className="mt-2">
          Both bases are always computed (well-to-wake and tank-to-wake,
          shown together), and each side decomposes exhaustively into
          WtT + TtW(CO2, CH4·GWP, N2O·GWP) + pilot + N2O slip, summing
          exactly to the side total — property-tested at 10⁻⁹. The blend
          intensity (candidate emissions over TOTAL delivered energy) is
          the attained-GFI analogue. ZNZ eligibility is a DIFFERENT test:
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
          share. The FuelEU view carries the analogous flag against the
          RFNBO ceiling of 28.2 gCO2e/MJ WtW (RED Article 28(5)), tested
          on the same fuel basis, with the matching procurement line when
          it fails. The default 5% pilot lifts the
          attained blend to 18.79 while the fuel itself stays at 15.0;
          and a certified 15 pathway plus real-world N2O misses the 14.0
          line applying from 2035 comfortably — the most
          decision-relevant fact on the screen.
        </p>

        <H id="fe-corrections">15. Combustion-side corrections</H>
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

        <H id="fe-validation">16. Emission-method validation &amp; regression</H>
        <p className="mt-2">
          The golden fixtures were computed BY HAND from the reference
          dataset before the engine existed, so they are independent of the
          implementation — if the engine disagrees, the engine is wrong,
          and there is deliberately no regenerate-from-code path. F2
          reproduces BetterSea&apos;s published FuelEU worked example (7,000
          t HFO → 78.244 TtW / 91.744 WtW gCO2e/MJ under AR4) to three
          decimals, exercising the exact Annex II arithmetic. Property
          tests pin the exhaustive decomposition, linearity in quantity,
          GWP-set isolation (a set switch moves only CH4/N2O-bearing
          terms), the identity avoided(X&nbsp;vs&nbsp;X)&nbsp;=&nbsp;0 for
          every parameterised fuel, and every refusal path. Reproducing
          GCMD&apos;s published GFI calculator as an independent cross-check
          remains an open item.
        </p>

        <H id="fe-limitations">17. Emission-method limitations &amp; open items</H>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            &ldquo;VLSFO&rdquo; is not an Annex II fuel class — residual
            fuels are classed by ISO 8217 viscosity grade (80 cSt splits
            LFO from HFO), not sulphur, so most VLSFO sold (typically RMG
            380) is the HFO row. The baseline menu therefore offers the
            Annex II classes directly — HFO (RME–RMK), LFO (RMA–RMD),
            MDO/MGO (DMX–DMB) — loaded atomically from one row each and
            confirmed against the DG MOVE FuelEU guidance document and the
            ESSF SAPS WS1 working document; a row-atomicity test forbids
            mixing factors across rows.
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
            framework it refuses — the IMO guidelines lack a default
            upstream factor (ICCT) and FuelEU&apos;s value is never
            borrowed. e-Methanol evaluates as a
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

        <H id="fe-sources">18. Emission-method source references</H>
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
                  ["BetterSea, 'How to Calculate GHG Intensity under FuelEU Maritime'", "The published worked example (7,000 t HFO containership, 91.744 gCO2e/MJ under AR4) reproduced by golden fixture F2 to three decimals."],
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

        <H id="reference-data">19. Reference data</H>
        <H3 id="ref-vessels">Vessel types</H3>
        <p className="mt-2">
          The catalogue behind the vessel selector, rendered from the
          reference bundle itself (<code>{vesselCatalogue.bundleId}</code>) —
          this table used to be hand-copied and went quietly stale whenever
          the data changed. <strong>CAPEX and OPEX are PER SHIP</strong>; the
          engine multiplies both by the vessel count. GJ/nm is a
          <em>service-speed</em>{" "}figure and means little without the speed
          beside it. Rows marked <em>retired</em>{" "}are superseded classes
          kept so a saved scenario pinning one still reproduces the numbers it
          was saved with — they are not offered for new scenarios.
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
          Fuels (price $/t · vessel premium · legacy factor columns)
        </H3>
        <p className="mt-2">
          <strong>v6 — the emission columns below are LEGACY.</strong>{" "}
          Since the emission-method replacement, combustion EF, LHV and WtW
          DERIVE per scenario from the fuel-emissions dataset under the
          selected accounting framework (§12–§18): green fuels as certified
          pathway + N2O slip + pilot blend (e-ammonia ≈ 22.14 gCO2e/MJ under
          FuelEU at the defaults), fossil fuels from the Annex II row under
          FuelEU (91.744) or the MEPC.391(81) sulphur band under IMO (94.90
          at 0.50%&nbsp;S). The table&apos;s emission scalars apply only to
          legacy scenarios and underivable combinations (LNG as a baseline),
          always with disclosed provenance. Prices and premiums remain the
          workbook benchmarks.
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

        <H id="sensitivity">20. What moves the results</H>
        <p className="mt-2">
          A one-at-a-time sweep from the workbook baseline — each input
          across its plausible range, enums across every defined option —
          against <strong>all six headline outputs</strong>: the cost gap,
          $/cargo unit, $/tCO₂ abated, green total, fossil total and lifetime
          CO₂ abated. Parameters whose module is off in the baseline are
          swept with the module SWITCHED ON, so their figures read as
          &ldquo;the module enabled at the range ends&rdquo; — which is why
          support and credit levers can outrank every physical input. The
          baseline runs the app&apos;s own defaults (well-to-wake emissions,
          distance-derived consumption), not the workbook&apos;s
          combustion-basis flags.
        </p>
        <p className="mt-2">
          <strong>Why more than the gap.</strong>{" "}This section used to
          measure movement of the gap alone, which made every driver of every
          other headline output invisible. The N₂O slip scenario moved the
          gap 1.7% and ranked nowhere, while moving $/tCO₂ by 102.7% and
          avoided emissions by half — §15 calls it the model&apos;s dominant
          uncertainty. Cargo throughput measured exactly 0.0% on the gap
          while being the sole divisor of $/cargo unit, the study&apos;s own
          headline figure. <strong>Gap movement</strong>{" "}is kept as the
          primary ranking for continuity; <strong>max across KPIs</strong>{" "}
          decides field placement, and the <strong>binding KPI</strong>{" "}
          column names the output responsible, so a field&apos;s prominence is
          traceable to what it actually moves. The top ten by gap movement,
          rendered from the same generated artifact as §22:
        </p>
        <div className="my-3 overflow-x-auto">
          <table className="w-full border border-neutral-300 text-[13px] tabular-nums">
            <thead>
              <tr className="border-b border-neutral-300 bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Input</th>
                <th className="px-3 py-2 text-right font-medium">Gap movement</th>
                <th className="px-3 py-2 text-right font-medium">Max across KPIs</th>
                <th className="px-3 py-2 font-medium">Binding KPI</th>
              </tr>
            </thead>
            <tbody>
              {SENSITIVITY_TOP10.map((row, i) => (
                <tr key={row.id} className="border-b border-neutral-200 last:border-0">
                  <td className="px-3 py-1.5">{i + 1}</td>
                  <td className="px-3 py-1.5">{row.label}</td>
                  <td className="px-3 py-1.5 text-right">
                    {(row.relHeadlineMovement * 100).toFixed(1)}%
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {(row.maxRelMovement * 100).toFixed(1)}%
                  </td>
                  <td className="px-3 py-1.5 text-neutral-600">
                    {KPI_LABEL[row.bindingKpi] ?? row.bindingKpi}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2">
          Among the always-on physical inputs, distance dominates because it
          drives the green fuel bill through derived consumption, and the
          fossil fleet&apos;s CAPEX/OPEX mirror the green pair with opposite
          sign. The named EU scheme parameters (ETS price/scope, FuelEU
          penalty/scope) move the gap by only a few percent under defaults —
          they matter far more at high carbon prices or late start years.
          Field PROMINENCE in the form is decided over a frozen subset of
          this sweep (≥5% movement on the binding KPI → top-level), plus
          explicit hiding for structure-dependent fields — §22 lists the
          placement and the binding KPI per field. Moving to the full KPI set
          promoted nine fields and demoted none, which is the expected shape:
          measuring more outputs can reveal movement, never hide it.
        </p>

        <H id="provenance">21. Provenance, versions &amp; limits</H>
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
            selectable: the{" "}<code>legacyExcelConstruct</code>{" "}flag set
            by migration is the only way past the double-count guard), no
            45Z sunset, and cargo throughput deliberately not linked to fuel
            burn. <strong>Stated-burn scenarios also survive</strong>: a
            scenario that used the retired vessel-benchmark consumption basis
            keeps its exact tonnage as an explicit{" "}
            <code>fuelTonnesPerVesselYear</code>{" "}override, so its numbers
            are unchanged — but it now carries a visible OVERRIDE badge
            against the distance-derived benchmark, and a dismissable note on
            load shows both figures side by side. That flat tonnage ignores
            which fuel is in the tank, so such scenarios often burn the same
            mass on both sides and compare very unequal delivered energy;
            the parity check (§11) says so. Deviations from the original source are the seven numbered
            divergences, opt-in with defaults that reproduce it: D1 emissions
            basis, D2 FuelEU over-compliance credit, D4 sourcing modes, D5
            45Z sunset, D6 real rate basis, D7 production-country WACC on a
            build-here plant (D3 was folded into D4).
          </li>
          <li>
            <strong>Schema versioning</strong>{" "}— scenarios carry a schema
            version (<strong>currently 7</strong>); older exports are migrated
            on load through an append-only migration registry: v2 renamed the
            45Z rate field, v3 restructured fuel sourcing (a v2 build-here
            scenario is REJECTED on load — its calculation basis changed —
            rather than silently reinterpreted), v4 folded the named-plant
            mode into purchase, v5 added the project archetype, v6 switched
            emission factors to the refined dataset, and v7 removed the
            consumption-basis switch and made vessel costs per-ship. A
            round-trip test with a compile-guarded, maximally-populated
            fixture proves the validation layer preserves every field —
            imports, saves and shares cannot silently strip data.
          </li>
          <li>
            <strong>Output contract</strong>{" "}— module outputs appear only
            while their module is active: the IMO and financing per-year
            lines and PV totals are conditional keys, the{" "}
            <code>divergences</code>{" "}block only exists under well-to-wake,
            and{" "}<code>reporting.imoNetZero</code>{" "}is either the per-side
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

        <H3 id="prov-default">The default scenario: Chilean copper-concentrate corridor</H3>
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
          <strong>v6 — the table above is the STUDY CALIBRATION (legacy
          factors), reproduced permanently by a pinned test.</strong>{" "}The
          shipped default now derives its factors from the refined method,
          which moves the headline deliberately: post-regulation gap{" "}
          <strong>$1,819.48m</strong>{" "}(was $1,762.21m), CO2 abated{" "}
          <strong>1,118,236 t</strong>{" "}(was the study-exact 1,450,095 —
          a WtW=0 green ammonia is not a certifiable value; certified 15 +
          N2O slip + 5% pilot gives a 22.14 blend), $1,627/tCO2 (was
          $1,215), and the green side now pays the self-designed CO2 price
          too ($60.75m PV; fossil $253.71m on the Annex II 91.744/40,500
          row). The pre-regulation figures are factor-independent and
          unchanged.
        </p>
        <H3 id="prov-fourways">The same corridor, four ways</H3>
        <p className="mt-2">
          The corridor is seeded four times, because &ldquo;what did the
          report say?&rdquo; and &ldquo;what does the model think?&rdquo; are
          different questions with different answers, and showing only one of
          them would be a choice disguised as a fact. The four differ in{" "}
          <em>how much study knowledge each one asserts</em>, from 27
          overridden fields down to none — which is why the last row of the
          table below is the one to read first.
        </p>
        <p className="mt-2">
          <em>Chilean copper corridor — as published</em>{" "}adopts the
          report&apos;s own emission accounting and brings every published
          figure back, all six within 1.7%. It lands bit-identical to the
          frozen calibration pin ($1,762.21m / 1,450,095 t / $1,215 per tCO2)
          while resolving against the <em>current</em>{" "}vessel catalogue
          rather than the 2026-07-30 one the pin uses — the same answers out
          of two different reference datasets, which is what distinguishes a
          reproduction from a coincidence.
        </p>
        <p className="mt-2">
          <em>Chilean copper corridor — current model</em>{" "}goes the other
          way. The shipped default reproduces the study by{" "}
          <em>asserting its answers</em>: the fuel burns, the fossil fleet cost
          and a $280/t regulatory proxy are all typed in. That is how you prove
          an engine can hit a published total, but it also means almost nothing
          downstream can move — the researched vessel catalogue, the derived
          consumption chain and the structured IMO module are all bypassed. So
          this variant releases those overrides. Consumption derives from the
          researched Handymax (2.334 GJ/nm) and the corridor&apos;s own
          geometry; the fossil counterfactual is priced from the catalogue as a
          newbuild fleet; regulation comes from the draft-MEPC-83 ladder
          instead of a fitted flat price; and green financing appears as its
          own line, where the study&apos;s waterfall puts it.
        </p>
        <p className="mt-2">
          <em>Chilean copper corridor — benchmarks only</em>{" "}is the strict
          case: <strong>zero overridden fields</strong>. Every figure is a
          bundle benchmark or derived from the route — no burn, no plant cost,
          no fleet price is typed in, and the $280/t self-designed proxy is off
          too, because a fitted input is an assertion even when it is not an
          override. It answers what this route costs if you know only the
          route — which makes it the one variant that reads the benchmark
          data directly, and therefore the only one that moved when that data
          was re-based.
        </p>
        <p className="mt-2">
          <strong>What the fuel benchmarks now are.</strong>{" "}Until 18 August
          2026 every fuel row cited a spreadsheet cell (<code>Data_tables!B17</code>)
          and claimed verified status on that basis. A cell address is not a
          source. Bundle{" "}<code>2026-08-18-fuel-v4</code>{" "}replaces them
          with researched figures carrying real provenance — publication,
          publisher, year, locator, URL, the figure as printed and the
          conversion applied — stored in{" "}
          <code>docs/corridor/research/</code>{" "}so a number can be walked
          back to its page without leaving the repository.
        </p>
        <p className="mt-2">
          Two consequences worth knowing. Production capex is now{" "}
          <strong>$/tonne-per-annum at a stated reference size</strong>, scale-
          corrected against the corridor&apos;s own demand: the old flat scalar
          charged a 15 kt/yr corridor and a 600 kt/yr one the same $55m. And{" "}
          <strong>13 of 30 researched blocks are verified; 17 are not</strong>,
          and the unverified ones show as unverified. Bunkering is verified for
          no fuel because no public bunker-vessel operating-cost benchmark
          exists for any of them, and every liquid-hydrogen block is
          extrapolation because nothing at bunker scale has been built.
          Rounding those up would recreate exactly the defect this replaced.
        </p>
        <p className="mt-2">
          <strong>It lands 24% below the study, and that gap is the
          output.</strong>{" "}This is a different number from the one this
          section carried before 18 August 2026, and the change is the point.
          The benchmark plant used to be an unsourced flat $55m that did not
          scale with the corridor at all — 5% of the study&apos;s 60 kt/yr
          Atacama facility — so the benchmark-only gap came out at $334m, 83%
          below the study. Bundle{" "}<code>2026-08-18-fuel-v4</code>{" "}
          re-based the fuel rows from researched sources and made production
          capex scale with the corridor&apos;s own demand, so the same plant
          now costs $827m and the gap is $1,520m.
        </p>
        <p className="mt-2">
          <strong>It closes on the study and stops.</strong>{" "}76% of the
          published figure, not 100%, and nothing was tuned to get there —
          landing exactly on $2,000m would have meant something was. The
          residual is scale, first-of-a-kind execution and site quality: the
          researched plant scaled to this corridor is $827m against the
          study&apos;s fitted $1,100m, which the research note predicted at
          roughly 35% below on its own arithmetic before any of it was built.
          Note the one figure that barely moves — CO2 abated at −4%, the same
          as the current-model variant, because both derive their burns and
          neither depends on what the plant cost.
        </p>
        <p className="mt-2">
          <strong>What separates the first three is one number.</strong>{" "}Every
          cost input is shared, and the shipped default already reproduces the
          report on green NPV, fossil NPV, the gap and cost per cargo tonne. It
          diverges on exactly two figures — CO2 abated (−23%) and the
          regulatory benefit (−23%) — and both trace to the green well-to-wake
          factor: the report treats green ammonia as zero, the refined method
          derives 22.14 gCO2e/MJ (certified 15 + N2O slip + 5% pilot fuel) and
          holds that a zero is not a certifiable value. The as-published
          variant is therefore the report&apos;s accounting, not the
          model&apos;s best estimate, and should not be read as one.
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
          <strong>Deriving the burn lands closer to the study than asserting
          it did.</strong>{" "}CO2 abated moves from −23% to −4.2% and cost per
          cargo tonne from +1.6% to −0.06%, with nothing tuned — the model is
          not being fitted to the study here, it is being let go and then
          scored. That is independent corroboration of the vessel catalogue,
          and it is only visible once the overrides come off. Delivered-energy
          parity also becomes exact by construction (ratio 1.000) rather than
          by the coincidence the asserted pair relies on: the study&apos;s
          5,700/2,638 tonnages happen to sit 0.03% from the ammonia/LSFO LHV
          ratio, which nothing enforced.
        </p>
        <p className="mt-2">
          <strong>Why the $280/t proxy is off in this variant.</strong>{" "}It was
          calibrated to reproduce the study&apos;s ≈$250m regulatory benefit at
          a time when the model had no financing module. The study&apos;s own
          waterfall carries financing and regulation as two separate floats, so
          with the financing line on, keeping the fitted proxy counts part of
          the same benefit twice — net regulation reaches −$435.6m against the
          study&apos;s ≈$250m. The structured IMO module gives −$320.9m from
          bundle-parameterised trajectories and is fitted to nothing. Financing
          is bounds, not a target: amortizing yields $195.9m and bullet
          $312.5m, and the study&apos;s ≈$250m sits between them; this variant
          ships the conservative end.
        </p>
        <p className="mt-2">
          The residual is stated rather than tuned. The green side is unmoved
          because its plant CAPEX/OPEX are still the study&apos;s fitted
          figures — nothing has replaced them as a source — and the CO2 gap is
          an accounting disagreement, not an arithmetic one: the study&apos;s
          1.45 Mt assumes a WtW=0 green ammonia, which is not certifiable under
          the refined method. Capital phasing stays off for the same reason: it
          would move the gap another ≈$122m, but the study states no deployment
          schedule, so any weights would be invented. Both projects are seeded
          together and neither disturbs the other; the calibration pin above is
          unaffected, since it resolves against the 2026-07-30 bundle.
        </p>
        <p className="mt-2">
          The displayed legacy-calibration headline (gap $1,762.21m, $71/t,
          $1,215/tCO2) is the
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
          reward-eligible surplus (≈0.9 MtCO2e over the horizon under the
          legacy WtW=0 treatment) is the upside the study flags, reported
          unpriced. <strong>v6:</strong>{" "}under refined factors the IMO
          module prices the fossil side with IMO&apos;s own accounting
          (94.90, sulphur-binned) — net effect ≈$100.4m — and the ZNZ
          surplus falls to ≈0.56 MtCO2e: the legacy treatment overstated
          the reward basis ~1.6×.
        </p>

        <H id="inputs">22. Complete input inventory</H>
        <div className="mt-3 border border-brand/40 bg-brand-tint px-4 py-3">
          <p className="text-sm font-medium text-brand-deep">
            Writing a scenario file by hand?
          </p>
          <p className="mt-1 text-[13px] leading-snug text-neutral-700">
            For desk research and AI-assisted data entry there is a generated{" "}
            <strong>JSON input template</strong>{" "}at{" "}
            <code>docs/corridor/input-template.md</code>{" "}
            (<code>npm run corridor:template</code>). It carries the complete
            object to copy, the legal id values for every field the importer
            will reject you for, the unit and bound of every number, a{" "}
            <em>what you must not do</em>{" "}table, and the minimum set of
            decisions that yields a meaningful scenario. It is generated from
            this same schema and reference bundle, and a test asserts the
            published template still imports and computes — so it cannot
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
          Every field a scenario carries — rendered directly from the
          GENERATED field reference (the zod validation schema joined with
          the sensitivity sweep, §20; CI regenerates and fails on drift, so
          this table cannot desync from the model).{" "}
          <em>Required&nbsp;=&nbsp;no</em>{" "}marks optional additions that
          older scenarios may omit; <em>nullable</em>{" "}override fields use{" "}
          <code>null</code>{" "}to mean &ldquo;use the benchmark&rdquo;.
        </p>
        <p className="mt-2">
          <strong>Rank, gap movement, max across KPIs and binding
          KPI</strong>{" "}come from the one-at-a-time sweep (§20): each input
          is moved across its plausible range — enums across every option —
          and the movement of all six headline outputs is recorded. Rank and
          the gap column preserve the historical ranking; PLACEMENT follows
          the max across KPIs, and the binding KPI names which output
          produced it. Inputs whose module is off in the
          baseline (self-designed regulation, IMO NZF, 45Z, the FuelEU
          credit, financing) are swept{" "}
          <em>with the module switched on</em>, so their figures read as
          &ldquo;the module enabled at the range ends&rdquo; — e.g. the
          self-designed &ldquo;other support&rdquo; tops the table because
          $0–50m/yr over a 20-year horizon IS that large. Fields still
          showing &ldquo;—&rdquo; are selectors, toggles, descriptive
          fields, mode-dependent values the sweep cannot move (fossil
          production costs are zeroed under purchase sourcing), or the
          build-here surface with its dedicated evaluate flow;{" "}
          <code>cargo.unitsPerYear</code>{" "}is swept and measures exactly
          0.0% — the engine counts vessels and roundtrips, not units.
        </p>
        <p className="mt-2">
          <strong>Elasticity</strong>{" "}answers a different question from the
          movement columns beside it, and neither replaces the other. Movement
          asks <em>how far can this field push the gap across its assumed
          range</em>; elasticity asks{" "}<em>how hard does it push per unit of
          itself</em>{" "}— a small standard nudge (±10%, or ±1 percentage point
          for rates and fractions), normalised. That makes it a property of the
          model at that point rather than of a range someone chose:{" "}
          <code>regulation.selfDesigned.otherUsdM</code>{" "}tops the movement
          ranking at 376% only because it is swept $0–50m.
        </p>
        <p className="mt-2">
          It is reported as a <strong>range across three archetypes</strong>{" "}
          — Chilean copper (build, deep-sea), Australia–Korea iron ore
          (purchase, deep-sea) and the Skagerrak green box (contract offtake,
          short-sea) — because the spread <em>is</em>{" "}the finding. Corridor
          length measures 0.29 where consumption is derived from geometry and
          exactly 0.00 where the burn is typed, so a single averaged figure
          would report it as moderately important everywhere when it is
          decisive on one corridor and inert on another.
        </p>
        <p className="mt-2">
          <strong>Coupled</strong>{" "}names the fields that are not independent,
          and whose individual figures therefore overstate them. Green and
          fossil consumption are energy-matched on any real corridor, so moving
          one alone describes a state the model itself rejects; moved together
          the pair measures 0.27 against a naive sum of 0.62. Fleet capital is
          starker: green vessel CAPEX is <em>+0.25</em>{" "}and fossil{" "}
          <em>−0.20</em>, so a yard-price shock lifts both sides and the gap
          barely moves — 0.05 together against 0.46 apart. The group figure is
          the honest one; the per-field figures explain the mechanism.
        </p>
        <p className="mt-2">
          Both columns are one-at-a-time, so <strong>interactions are
          invisible</strong>{" "}to them by construction — WACC and horizon
          compound on a capital-heavy corridor and neither column can say so.
          Elasticity is also <em>leverage only</em>: multiplying it by a
          declared, cited uncertainty range is what yields impact, and that
          exposure data is a separate reference dataset.
        </p>
        <p className="mt-2">
          <strong>Placement</strong>{" "}is the UI prominence contract and is
          deliberately narrower than the ranking:{" "}<em>top-level</em>{" "}
          renders prominently (≥5% movers among the interface&apos;s
          prominence-swept set), <em>advanced</em>{" "}renders behind the
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
                  <td className="px-3 py-1.5">{row.placement}</td>
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
          This table and its markdown twin{" "}
          <code>docs/corridor/field-reference.md</code>{" "}are written by the
          same generator from the same artifacts — CI fails if either
          drifts from the schema or the sweep.
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
            engine that prices a <strong>build-here</strong>{" "}site (§4): pick a
            cell on the map, and the number handed back to the corridor is
            produced exactly as described below. It re-implements the published
            Chilean methodology «Motor de Cálculo LCOH» (Ministerio de Energía
            de Chile, April 2024); resource data and cost projections are
            layered on top.
          </p>
        </div>

        {/* 14 */}
        <H id="m-overview">23. Overview &amp; system boundary</H>
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
        <H id="m-hydrogen">24. Hydrogen from electricity</H>
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
          emissions only, never for cost (§30).
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
        <H id="m-profiles">25. Resource profiles (capacity factors)</H>
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
            <strong>PV pathway on the map.</strong>{" "}PVGIS auto-resolves the
            radiation database per cell and runs its own tilt-aware PV model on
            it. Where PVGIS cannot serve a cell at all we drop the crude GHI
            proxy rather than substitute it: that proxy is a categorically
            different model, so adjacent hexes would stop being comparable and
            a seam would appear in the surface. Such a cell renders as
            <strong>{" "}no-data</strong>. The provider and radiation database
            are recorded per cell (see the data-source tiers below).
          </li>
          <li>
            <strong>Which radiation database serves a cell is a question of
            longitude, not latitude.</strong>{" "}PVGIS v5_3 offers exactly two
            — <code>PVGIS-ERA5</code>{" "}and <code>PVGIS-SARAH3</code>{" "}
            (NSRDB was dropped after v5_2 and is now rejected everywhere,
            including over the United States). SARAH3 is derived from
            Meteosat, so it covers the prime disc only. Measured across the
            whole 3,264-row PV cache: SARAH3 serves 50% and 92% of cells in
            the +0..30° and +30..60° longitude bands and <strong>0% of every
            other band</strong>{" "}— the Americas, Asia-Pacific and Oceania
            are ERA5 in their entirety. Latitude predicts nothing by
            comparison (+45..60° is 68% SARAH3, +15..30° is 0%).
          </li>
          <li>
            <strong>ERA5 is not a degraded tier.</strong>{" "}For most of the
            map it is the only database PVGIS has, and where both exist they
            agree closely and in no fixed direction (Turkana SARAH3 0.203 vs
            ERA5 0.194; Namibia 0.221 vs 0.224; Ouarzazate 0.217 vs 0.217).
            An earlier note in this project claimed pinned ERA5 returned
            capacity factors about 3× too low and blamed it for the Kenyan
            speckle; a live probe disproved both — that speckle was a
            mounting-geometry problem, since fixed. So{" "}
            <code>pv_db_tier</code>{" "}is recorded and shown for transparency
            but does <em>not</em>{" "}change how a cell is drawn. The real
            caveat is resolution: ERA5&apos;s ~31 km grid is coarse for
            coastlines and mountains, which is a reason to treat single cells
            carefully, not a reason to apply a bias correction — and no
            correction is applied without a citable basis.
          </li>
          <li>
            <strong>Which radiation database, and where.</strong>{" "}Verified
            against the live API (2026-08-15). PVGIS v5_3 accepts exactly two
            values worldwide —{" "}<code>PVGIS-SARAH3</code>{" "}and{" "}
            <code>PVGIS-ERA5</code>. NSRDB was dropped after v5_2 and is
            rejected everywhere, including over the United States. SARAH3
            covers the <strong>Meteosat prime disc only</strong>{" "}(Europe,
            Africa, the Middle East); pinning it at Sumbawa, the Pilbara or
            the Atacama returns &ldquo;out of the spatial coverage&hellip;
            select another database (PVGIS-ERA5)&rdquo;. So across the
            Americas, Asia-Pacific and Oceania —{" "}
            <strong>about 70% of our seeded cells</strong>{" "}— ERA5 is not a
            fallback, it is the only database PVGIS has. Where both exist they
            agree closely and in no fixed direction (Turkana SARAH3 0.203 vs
            ERA5 0.194; Namibia 0.221 vs 0.224; Ouarzazate 0.217 vs 0.217), so
            there is no systematic reanalysis bias to correct and none is
            applied. A satellite-derived product for the Asia-Pacific or the
            Americas would require a different provider entirely, not a
            different PVGIS parameter.
          </li>
          <li>
            <strong>Wind — Open-Meteo (ERA5, primary):</strong>{" "}hourly wind
            speed at 10 m and 100 m is extrapolated to hub height (120 or 160 m)
            with a per-hour power-law shear exponent, then converted through a
            digitized turbine power curve. On the map this path also applies
            the air-density correction and per-site IEC turbine-class
            selection. NASA POWER (fixed shear α = 1/7, generic curve, neither
            correction) is the fallback and currently serves{" "}
            <strong>2.2% of cells</strong>. That is a real modelling
            difference, so — symmetrically with the PV no-data policy above —
            those cells are <strong>flagged rather than hidden</strong>:{" "}
            <code>wind_fidelity</code>{" "}is recorded per cell, rendered
            distinguishably, and shown in the cell drawer. Flagging rather than
            masking is the right trade here because the value is real and the
            population is small; masking 2.2% of otherwise-good cells would
            lose more than it protects.
          </li>
          <li>
            <strong>Data-source tiers (per-cell provenance).</strong>{" "}Every
            cell records where its numbers came from, and the export schema
            carries the same fields:{" "}<code>pv_provider</code>,{" "}
            <code>pv_dataset_version</code>{" "}(which encodes the radiation
            database, the mounting geometry and the year span),{" "}
            <code>pv_db_tier</code>{" "}(<code>satellite</code>{" "}|{" "}
            <code>era5</code>),{" "}<code>wind_provider</code>,{" "}
            <code>wind_dataset_version</code>{" "}(hub height, IEC turbine
            class, air-density flag) and{" "}<code>wind_fidelity</code>{" "}
            (<code>improved</code>{" "}|{" "}<code>fallback</code>).{" "}
            <code>pv_db_tier</code>{" "}is transparency, not a quality ranking —
            see the coverage note above;{" "}<code>wind_fidelity</code>{" "}is a
            genuine fidelity distinction. Cached profiles also carry a model
            generation in their dataset version, and the cache refuses to serve
            a superseded generation (e.g. a profile built before the mounting
            rule), so one map never mixes two models.{" "}
            <strong>This transition is still in progress</strong>: refusing a
            superseded profile turns it into a re-fetch, and re-fetching is
            rate-limited by the upstream providers, so the map currently holds
            a mix of cells already rebuilt under the mounting rule and cells
            awaiting their turn (1,918 of 6,160 ready cells rebuilt as of
            2026-08-15). Cells whose PV cannot be re-fetched at all — the
            seeded-over-water cases, where PVGIS answers{" "}
            <em>location over the sea</em>{" "}— never convert, so the share does
            not reach 100%. Until the sweep completes, cross-cell comparisons
            of solar values carry this caveat.
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
        <H id="m-dispatch">26. Hourly dispatch</H>
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
        <H id="m-degradation">27. Degradation &amp; stack replacement</H>
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
        <H id="m-lcoh">28. The LCOH formula</H>
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
          point-in-polygon against the Natural Earth boundaries. Two tiers
          supply it, and the layer records which: a{" "}
          <strong>researched</strong>{" "}rate (<code>wacc_curated</code>) where
          an enriched profile has one, otherwise the transparent World Bank
          income-group <em>heuristic</em>{" "}(<code>wacc_suggestion</code>, 0.06
          OECD-high → 0.12 low-income) — a bracket, not a measurement, and
          labelled as such wherever it appears. Curated wins, the same rule the
          Calculator applies; before that rule reached the map, an enriched
          country was financed at its income bracket here while the Calculator
          used its researched rate, so one product answered the same question
          two ways.
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
        <H id="m-lcoe">29. Electricity pricing (LCOE)</H>
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
          uses CAPEX mode so that resource quality drives the map (§32).
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
        <H id="m-emissions">30. Emissions ledger</H>
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
        <H id="m-constants">31. Constants &amp; reference defaults</H>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="font-medium">Physical constants</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px]">
              <li>LHV of hydrogen: 33.33 kWh/kg</li>
              <li>Hours per year: 8760 (non-leap)</li>
              <li>
                Water consumption: 9 L/kg H₂{" "}
                <span className="text-neutral-500">
                  (stoichiometric floor — a plant needs 15–30; see §24)
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
                  (real — cashflows are constant-USD, see §28)
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
        <H id="m-map">32. The map&apos;s configuration</H>
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
          capacity factor. Generation costs are IRENA{" "}
          <em>Renewable Power Generation Costs in 2024</em>{" "}global
          weighted-average total installed cost — solar 691 USD/kWp + 1.5%
          OPEX, onshore wind 1,041 USD/kW + 2.5% OPEX — replacing the 2023
          edition&apos;s 800 / 1,200, which had left a map labelled 2024
          running 2023 costs. Each cost pack now carries its generation-cost
          basis year so a vintage mismatch is visible in the data rather than
          inferred (see §33). The OPEX fractions were checked against the same
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
          res-3 solar layer measures 9.34&ndash;15.48), so the earlier
          0&ndash;10 domain spent its warm half on values that never occur while
          pinning every tropical cell to one blue at the top. Values outside the
          domain pin to their end&apos;s own reserved colour rather than
          extrapolating. Above{" "}<strong>25 USD/kg</strong>{" "}(configurable) a
          cell is drawn in a neutral grey instead of a ramp colour: past that
          point the number has stopped being a price and become a verdict —
          Atacama wind at CF&nbsp;0.02 computes 770&ndash;1,003 USD/kg, which is
          &ldquo;this technology does not work here&rdquo;, not &ldquo;expensive&rdquo;.
        </p>
        <p className="mt-2">
          <strong>Sweep persistence.</strong>{" "}The best-achievable and
          risk-adjusted-WACC layers are written by the recompute passes, not by
          the per-cell seeder (which stays fast), so a freshly seeded cell
          carries the base layers immediately and the optional layers once a
          recompute has visited it. At the last census 4,544 of 5,993 ready
          cells carried them; the remainder are cells seeded since the last
          pass, which the scheduled job fills as it re-fetches. Measured on that
          population, the fixed 2:1 design point costs a median 2.5 % against
          free sizing, and it favours <em>solar</em>: solar-led cells gain a
          mean 2.63 % from sweeping the ratio, wind-led cells 4.21 %, because
          flat wind saturates the electrolyser at a lower ratio (mean optimum
          1.57&times;) than peaky solar does (2.18&times;).
        </p>

        {/* 24 */}
        <H id="m-costyears">33. Cost-year projections (2030 / 2040 / 2050)</H>
        <p className="mt-2">
          The cost-year buttons re-price each cell with future technology costs.
          The <strong>resource is held constant</strong>{" "}— same capacity factors
          — so the change is purely the techno-economic cost-down. Absolute
          values, with the multiplier on the 2024 base in brackets. This table
          is <strong>generated from the engine&apos;s own cost packs</strong>{" "}
          (<code>npm run docs:costpacks</code>), not transcribed — an earlier
          hand-copied version drifted from the code it described.
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
          <strong>Durability trajectory.</strong>{" "}Earlier packs cut CAPEX but
          held stack life flat and degradation at 1%/yr — incoherent,
          since durability is a primary learning-curve target, and it made the
          cost-down conservative. Stack life and degradation now improve
          alongside CAPEX. These durability figures are a{" "}
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
          20-year life is an integer that jumps. At 6,719 operating hours a
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
        <H id="m-defaults">34. Country defaults &amp; enriched profiles</H>
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
          <strong>Cost of capital is stored REAL, and says so.</strong>{" "}The
          engine discounts constant-USD cashflows with no escalation term, so
          it needs a real rate — but most published surveys quote{" "}
          <em>nominal</em>. Indonesia&apos;s 9.4% from the IEA Cost of Capital
          Observatory is nominal, local currency; deflated by Bank
          Indonesia&apos;s 2.5% target through the exact Fisher relation it
          becomes <strong>6.73% real</strong>, which is what the model uses.
          Consuming the nominal figure directly would have overstated LCOH by
          about 7.7%. Every stored rate now records its basis, currency,
          publication year and the technology it was measured for, and a rate
          without a declared basis fails a test rather than being silently
          consumed.
        </p>
        <p className="mt-2">
          Two caveats travel with that number rather than being resolved. It
          is a <strong>solar-PV</strong>{" "}cost of capital borrowed for a
          hydrogen project, which carries offtake risk a contracted PPA does
          not — if anything it understates hydrogen&apos;s true cost of
          capital. And the literature genuinely disagrees: an Indonesian PV
          study uses a <em>real</em>{" "}9.5%, deceptively close to the
          IEA&apos;s nominal 9.4% but meaning something quite different. This
          is why the model records number, basis, technology and year rather
          than quietly picking one figure.
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
          <strong>Which field reaches which surface.</strong>{" "}A country
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
        <CountryDefaultsTable snapshot={countryDefaults} />
        <p className="mt-2 text-neutral-600">
          Snapshotted from the live table by{" "}
          <code>npm run defaults:snapshot</code>{" "}into{" "}
          <code>data/country-defaults/snapshot.json</code>, which this page
          renders — so the published values have a git history rather than
          depending on a live query.
        </p>
        <p className="mt-2">
          <strong>Known divergence.</strong>{" "}The Green Corridor model keeps
          its <em>own</em>{" "}seven-row country list (kebab-case ids, all
          marked unverified, from the source workbook) and does not read these
          profiles: a country outside those seven resolves to the{" "}
          <code>other</code>{" "}row at 8%. So an enriched profile improves the
          Calculator and the map&apos;s risk-adjusted layer, but not yet the
          corridor&apos;s discount rate. Recorded here deliberately rather
          than papered over.
        </p>

        {/* 26 */}
        <H id="m-verification">35. Verification</H>
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
        <H id="m-validation">36. Validation</H>
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
            — §37) are different. A finding of the form &ldquo;wind beats
            solar here&rdquo; in an un-benchmarked region rests on the model
            alone, not on this validation.
          </li>
        </ul>

        {/* 28 */}
        <H id="m-limitations">37. Limitations</H>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            No compression, storage, transport, or downstream conversion — the
            boundary is the electrolyzer outlet.
          </li>
          <li>
            One representative year repeated; no inter-annual variability,
            battery buffering, or part-load efficiency curve (reserved for a
            future version). Oversizing IS swept on the map&apos;s
            best-achievable layer (&sect;32), though the headline layers stay at
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
            <strong>Wind model tiers.</strong>{" "}On the map the Open-Meteo path
            DOES apply an air-density correction and per-site IEC turbine-class
            selection (their dataset tags carry <code>-airdensity</code>{" "}and
            the selected class). The NASA POWER fallback does not: a generic
            curve with fixed &alpha;&nbsp;=&nbsp;1/7 shear. That is a real
            modelling difference, so those cells are outlined on the map and
            named in the cell drawer rather than rendered as if they were
            comparable. Measured 2026-08-15 over ready cells: 58% improved,
            1.3% fallback — and <strong>37% not recorded at all</strong>,
            because they were computed before the provenance columns existed.
            Those are deliberately not flagged, since asserting either tier
            would be false, but the drawer reports their provenance as
            unrecorded rather than leaving the reader to assume. The
            scheduled re-seed stamps each cell as it refreshes, so the
            unrecorded share shrinks on its own.
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
        <H id="m-sources">38. Sources</H>
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
      </div>
      <Footer />
    </>
  );
}
