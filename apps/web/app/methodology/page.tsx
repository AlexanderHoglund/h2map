import Footer from "@/components/shell/Footer";

export const metadata = {
  title: "Methodology — H2MAP",
  description:
    "Full method behind the H2MAP LCOH estimates: formulas, assumptions, and sources.",
};

/** Block formula: monospace, scrolls horizontally on small screens. */
function F({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-3 overflow-x-auto rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 font-mono text-[13px] leading-relaxed dark:border-neutral-800 dark:bg-neutral-900">
      {children}
    </div>
  );
}

function H({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="mt-10 scroll-mt-16 border-b border-neutral-200 pb-1 text-lg font-semibold dark:border-neutral-800"
    >
      {children}
    </h2>
  );
}

const TOC: [string, string][] = [
  ["overview", "1. Overview & system boundary"],
  ["hydrogen", "2. Hydrogen from electricity"],
  ["profiles", "3. Resource profiles (capacity factors)"],
  ["dispatch", "4. Hourly dispatch"],
  ["degradation", "5. Degradation & stack replacement"],
  ["lcoh", "6. The LCOH formula"],
  ["lcoe", "7. Electricity pricing (LCOE)"],
  ["emissions", "8. Emissions ledger"],
  ["constants", "9. Constants & reference defaults"],
  ["map", "10. The map's configuration"],
  ["costyears", "11. Cost-year projections"],
  ["defaults", "12. Country defaults"],
  ["validation", "13. Validation"],
  ["limitations", "14. Limitations"],
  ["sources", "15. Sources"],
];

export default function MethodologyPage() {
  return (
    <>
      <main className="mx-auto max-w-3xl px-4 py-10 text-sm leading-6 text-neutral-800 dark:text-neutral-200">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          Methodology
        </h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          How H2MAP estimates the levelized cost of hydrogen (LCOH) — the full
          method, every formula, and the data sources behind it. The
          calculation engine re-implements the published Chilean methodology
          «Motor de Cálculo LCOH» (Ministerio de Energía de Chile, April 2024);
          resource data and cost projections are layered on top as described
          below.
        </p>

        <nav className="mt-6 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Contents
          </p>
          <ol className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {TOC.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="text-blue-600 hover:underline dark:text-blue-400"
                >
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* 1 */}
        <H id="overview">1. Overview &amp; system boundary</H>
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

        {/* 2 */}
        <H id="hydrogen">2. Hydrogen from electricity</H>
        <p className="mt-2">
          Hydrogen output is electricity consumed by the electrolyzer times its
          efficiency, divided by the lower heating value (LHV) of hydrogen:
        </p>
        <F>
          H₂ [kg] = E_consumed [kWh] × η_LHV ÷ 33.33 [kWh/kg]
        </F>
        <p className="mt-2">
          η<sub>LHV</sub> is the system efficiency on an LHV basis (default
          60%), so producing 1 kg needs ≈ 33.33 / 0.60 ≈ 55.6 kWh. Water use is
          9 litres per kg of H₂. The electricity for water desalination and
          pumping is tracked for emissions only, never for cost (§8).
        </p>

        {/* 3 */}
        <H id="profiles">3. Resource profiles (capacity factors)</H>
        <p className="mt-2">
          Each location gets an 8760-hour <strong>capacity-factor</strong>{" "}
          profile (kWh generated per kW installed, per hour, 0–1) for solar and
          wind, built as a Typical Meteorological Year (TMY) from roughly a
          decade of data and cached per 0.1° grid cell.
        </p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Solar PV — PVGIS (authoritative):</strong> the JRC PVGIS
            model (<code>seriescalc</code>, <code>pvcalculation=1</code>, 1 kWp,
            14% system loss) returns hourly PV power <code>P</code> in watts;
            capacity factor = P / 1000. Mounting is fixed at optimal tilt, or
            single-/dual-axis tracking. If PVGIS is unavailable, a labeled
            low-fidelity fallback is used (GHI/1000 × 0.9).
          </li>
          <li>
            <strong>Wind — Open-Meteo (ERA5, primary):</strong> hourly wind
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
          <sub>rated</sub>, where P<sub>turbine</sub> is linear interpolation on
          the reference 5.6 MW power curve (cut-in 3 m/s, rated ≈ 12 m/s,
          cut-out 25 m/s). The turbine sets the profile <em>shape</em> only;
          installed capacity scales linearly.
        </p>
        <p className="mt-2">
          <strong>Air-density correction (improved mode).</strong> A power curve
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
          <strong>Turbine-class selection (improved mode).</strong> One
          mid-market machine applied everywhere penalises low-wind sites, where
          a developer would deploy a lower IEC wind class — same generator,
          larger rotor, so a lower <em>specific power</em> (rated kW per m² of
          swept area) that reaches rated power at a lower wind speed and yields
          far more energy in light winds. The improved path selects the class
          from the site&rsquo;s annual-mean hub-height speed (IEC classes are
          defined on wind speed, so the <em>uncorrected</em> mean is used):
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

        {/* 4 */}
        <H id="dispatch">4. Hourly dispatch</H>
        <p className="mt-2">
          Each hour, renewables serve the electrolyzer first; the grid/PPA (if
          configured) tops up the shortfall up to its hourly cap and the
          electrolyzer&apos;s capacity. Available renewable power is{" "}
          <code>CF × capacity</code> per source. If total available renewable
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
          <code>generated = consumed + curtailed</code> exactly. Because the TMY
          repeats, the 8760-hour dispatch is computed once; only per-year scalar
          quantities (efficiency, hydrogen) change over the project life.
        </p>

        {/* 5 */}
        <H id="degradation">5. Degradation &amp; stack replacement</H>
        <p className="mt-2">
          Electrolyzer efficiency degrades geometrically each year (reference
          mode; d = degradation rate, default 1%/yr):
        </p>
        <F>η_t = η₀ × (1 − d)^t , for operating years t = 1 … N</F>
        <p className="mt-2">
          The stack is replaced whenever cumulative operating hours (hours with
          load &gt; 0) cross a multiple of its rated life (default 40 000 h);
          each replacement is a capital event costing a fraction of electrolyzer
          CAPEX (default 30%). A replacement falling in the final operating year
          is skipped. In reference mode efficiency is not reset on replacement.
        </p>

        {/* 6 */}
        <H id="lcoh">6. The LCOH formula</H>
        <p className="mt-2">
          All cashflows are discounted with the project discount rate r
          (default 8%). Investment occurs at year 0 (undiscounted); production
          and operating costs occur in years 1 … N:
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
              <tr className="border-b border-neutral-300 text-left dark:border-neutral-700">
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
                  className="border-b border-neutral-100 dark:border-neutral-800"
                >
                  <td className="py-1.5 pr-3 font-medium">{c}</td>
                  <td className="py-1.5 font-mono text-[12px] text-neutral-600 dark:text-neutral-400">
                    {f}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 7 */}
        <H id="lcoe">7. Electricity pricing (LCOE)</H>
        <p className="mt-2">
          Renewable electricity is priced one of two ways per source. In{" "}
          <strong>LCOE mode</strong> a flat price per MWh is charged on{" "}
          <em>consumed</em> energy only (curtailed energy is free). In{" "}
          <strong>CAPEX mode</strong> the electricity cost is <em>derived</em>{" "}
          from the plant&apos;s build cost and its own generation — so a better
          resource yields cheaper electricity:
        </p>
        <F>
          LCOE = ( CAPEX + OPEX_per_year × A ) / ( (E_generated / 1000) × A )
          [USD/MWh]
        </F>
        <p className="mt-2">
          The reported <em>mix</em> LCOE is the consumed-energy-weighted average
          of the active sources:
        </p>
        <F>
          LCOE_mix = ( E_PV·LCOE_PV + E_wind·LCOE_wind + E_grid·price_grid ) /
          E_consumed
        </F>
        <p className="mt-2">
          The interactive Calculator lets you choose either mode. The world map
          uses CAPEX mode so that resource quality drives the map (§10).
        </p>
        <p className="mt-2">
          In CAPEX mode the electricity component charges the full plant CAPEX
          regardless of curtailment, but <code>LCOE_mix</code> is per MWh{" "}
          <em>generated</em> — so multiplying it by consumed energy under-counts
          by the utilization ratio. The engine therefore also reports an{" "}
          <strong>effective cost per consumed MWh</strong> (discounted
          electricity cost ÷ discounted consumed MWh), which reconciles to the
          electricity components exactly, and per-source utilization
          (E_consumed / E_generated).
        </p>

        {/* 8 */}
        <H id="emissions">8. Emissions ledger</H>
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
          RED II compliance assessment</strong> — that additionally requires
          additionality and geographic (same bidding zone) and temporal
          (monthly, then hourly) correlation against defined comparators, with a
          3.38 kgCO₂e/kg threshold. Because dispatch is hourly, the engine does
          report the <strong>hourly renewable-matched fraction</strong> (share
          of consumption served hour-by-hour by the project&apos;s own
          renewables), which is the figure a compliance-minded reader wants — but
          a 0 here means operationally clean, not RFNBO-compliant.
        </p>

        {/* 9 */}
        <H id="constants">9. Constants &amp; reference defaults</H>
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
              <li>Electrolyzer 100 MW · 1000 USD/kW · 3% OPEX/yr</li>
              <li>Efficiency 60% LHV · degradation 1%/yr</li>
              <li>Stack life 40 000 h · replacement 30% of CAPEX</li>
              <li>Renewables 30 USD/MWh (or 850 USD/kW + 1% OPEX)</li>
              <li>Water 0.50 USD/m³ + 0.09/m³ per 100 km</li>
            </ul>
          </div>
        </div>

        {/* 10 */}
        <H id="map">10. The map&apos;s configuration</H>
        <p className="mt-2">
          Every hexagon on the Explorer is computed with a fixed reference
          configuration so cells are comparable: a 100 MW electrolyzer at the
          reference defaults, no grid, and a fixed 200 MW total of renewables
          whose PV share is swept over {"{0, 25, 50, 75, 100}"}%. The lowest-cost
          mix is the <em>Best combination</em> layer; PV-only and wind-only give
          the <em>Solar only</em> and <em>Wind only</em> layers.
        </p>
        <p className="mt-2">
          Unlike the flat-30 reference, the map prices electricity in{" "}
          <strong>CAPEX mode</strong> so each cell&apos;s cost reflects its own
          capacity factor (IRENA 2023 global averages: solar 800 USD/kWp + 1.5%
          OPEX, onshore wind 1200 USD/kW + 2.5% OPEX). Colors use a fixed
          per-layer domain (never rescaled to the viewport), so a color means
          the same LCOH everywhere on that layer.
        </p>

        {/* 11 */}
        <H id="costyears">11. Cost-year projections (2030 / 2040 / 2050)</H>
        <p className="mt-2">
          The cost-year buttons re-price each cell with future technology costs.
          The <strong>resource is held constant</strong> — same capacity factors
          — so the change is purely the techno-economic cost-down. Multipliers
          on the 2024 base:
        </p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-[13px] tabular-nums">
            <thead>
              <tr className="border-b border-neutral-300 text-left dark:border-neutral-700">
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
              ].map((r) => (
                <tr
                  key={r[0]}
                  className="border-b border-neutral-100 dark:border-neutral-800"
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
          The <strong>2030</strong> multipliers are derived from the IEA Global
          Hydrogen Review 2025 Assumptions Annex (electrolyser CAPEX 2000–2600 →
          1400–1820 USD/kW; solar/wind regional cost declines). IEA&apos;s
          hydrogen publications have a 2030 horizon, so <strong>2040 and 2050
          are extrapolated</strong> along IEA&apos;s stated direction and are
          labeled &quot;projected&quot; throughout the UI. Scenario: IEA
          Announced Pledges (APS); cost-down applied globally.
        </p>

        {/* 12 */}
        <H id="defaults">12. Country defaults</H>
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

        {/* 13 */}
        <H id="validation">13. Validation</H>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Analytical cases:</strong> closed-form scenarios reproduce
            hand-derived LCOH to ≤ 1e-6 (e.g. PV at CF ≡ 1, LCOE 30 USD/MWh, no
            degradation → 2.507 USD/kg via the standard annuity), plus property
            tests (monotonicity, energy closure, mass balance) and golden files
            at 1e-12.
          </li>
          <li>
            <strong>Chilean 47-project parity:</strong> against the published
            Tabla 3-1 results, the engine reproduces the 2022 column with a mean
            of 4.30 vs 4.51 USD/kg and Spearman rank correlation ρ = 0.85 (site
            coordinates are inferred from region names, which explains the
            residual).
          </li>
        </ul>

        {/* 14 */}
        <H id="limitations">14. Limitations</H>
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

        {/* 15 */}
        <H id="sources">15. Sources</H>
        <ul className="mt-2 space-y-2">
          <li>
            <strong>Methodology:</strong> «Motor de Cálculo LCOH — Principales
            características», Ministerio de Energía de Chile / Centro de Energía
            FCFM U. de Chile / USACH / PUC, April 2024.
          </li>
          <li>
            <strong>Solar:</strong> PVGIS © European Commission, Joint Research
            Centre —{" "}
            <a
              href="https://re.jrc.ec.europa.eu/pvg_tools/"
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              re.jrc.ec.europa.eu
            </a>
            .
          </li>
          <li>
            <strong>Wind &amp; weather:</strong> Open-Meteo.com (CC BY 4.0),
            based on ERA5 (Copernicus Climate Change Service); NASA POWER (NASA
            Langley Research Center) fallback.
          </li>
          <li>
            <strong>Renewable CAPEX:</strong> IRENA, Renewable Power Generation
            Costs 2023.
          </li>
          <li>
            <strong>Cost projections:</strong> IEA, Global Hydrogen Review 2025
            — Assumptions Annex (Announced Pledges Scenario).
          </li>
          <li>
            <strong>Grid emission factors:</strong> Our World in Data (Ember +
            Energy Institute), carbon intensity of electricity.
          </li>
          <li>
            <strong>Boundaries:</strong> Natural Earth (public domain).
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
