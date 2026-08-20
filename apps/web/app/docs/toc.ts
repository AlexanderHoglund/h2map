/**
 * The documentation's section tree — the ONE source of truth for both the
 * sticky left navigation and the inline Contents block.
 *
 * It used to be two flat arrays of [id, label] pairs, with each heading's text
 * written a second time at its own call site. They had already drifted:
 * §16 read "Emission-method validation" here and "…validation & regression"
 * in the heading; §17 likewise. A third copy for the sidebar would have drifted
 * again, so both now read this file.
 *
 * IDS ARE A URL CONTRACT. Every id below is an anchor someone can copy out of
 * the address bar and paste into a ticket or an email, so they are chosen to be
 * short and stable and are NOT derived from the heading prose — a slug computed
 * from the text would silently break every shared link the next time a heading
 * is reworded. Renaming an id here is breaking a published URL; adding one is
 * free.
 *
 * The `id` of every entry must match the `id` passed to the corresponding
 * `<H>` / `<H3>` in page.tsx. `scripts/lib/docsToc.test.ts` asserts that
 * correspondence in both directions, because a typo'd id is a dead link that
 * renders perfectly.
 */

export interface TocNode {
  id: string;
  label: string;
  /** Sub-headings (`<H3 id=…>`), rendered when the section is active. */
  children?: readonly TocNode[];
}

export interface TocPart {
  /** Shown as an eyebrow above the group; not itself a link. */
  title: string;
  sections: readonly TocNode[];
}

export const TOC_PARTS: readonly TocPart[] = [
  {
    title: "Part A · The model in ten minutes",
    sections: [
      {
        id: "overview",
        label: "1. Overview & how the model works",
        children: [{ id: "overview-badges", label: "Benchmarks, overrides & badges" }],
      },
      { id: "fe-overview", label: "2. The emission method & functional unit" },
      { id: "engine", label: "3. The engine: formulas" },
      { id: "prov-default", label: "4. The default scenario" },
    ],
  },
  {
    title: "Part B · Building a scenario, tab by tab",
    sections: [
      { id: "tab-intro", label: "5. Tab 01 — Intro" },
      {
        id: "tab-energy",
        label: "6. Tab 02 — Energy",
        children: [
          { id: "energy-sourcing", label: "Sourcing modes" },
          { id: "energy-buildhere", label: "Build-here: site to cost structure" },
          { id: "energy-acceptance", label: "Build-here worked example" },
          { id: "energy-perfuel", label: "Per-fuel fields" },
        ],
      },
      { id: "tab-vessels", label: "7. Tab 03 — Vessels" },
      { id: "tab-cargo", label: "8. Tab 04 — Cargo" },
      { id: "tab-ports", label: "9. Tab 05 — Ports" },
      {
        id: "tab-financing",
        label: "10. Tab 06 — Financing",
        children: [
          { id: "fin-differentiated", label: "Differentiated green financing" },
          { id: "fin-phasing", label: "Capital deployment schedule" },
          { id: "engine-financing", label: "Financing: the arithmetic" },
          { id: "engine-phasing", label: "Phasing: the arithmetic" },
        ],
      },
      {
        id: "tab-regulation",
        label: "11. Tab 07 — Regulation",
        children: [
          { id: "reg-accounting", label: "Emission accounting" },
          { id: "reg-ets", label: "EU ETS (maritime)" },
          { id: "reg-fueleu", label: "FuelEU Maritime" },
          { id: "reg-ira45z", label: "IRA 45Z clean fuel credit" },
          { id: "reg-selfdesigned", label: "Self-designed regulation" },
          { id: "reg-imo", label: "IMO Net-Zero Framework" },
          { id: "reg-options", label: "Model options" },
        ],
      },
      {
        id: "tab-results",
        label: "12. Tab 08 — Results",
        children: [
          { id: "results-kpis", label: "KPI strip" },
          { id: "results-snapshot", label: "Scenario snapshot strip" },
          { id: "results-waterfalls", label: "Cost bridges (two waterfalls)" },
          { id: "results-funding", label: "Who pays: the funding split" },
          { id: "results-decomposition", label: "Cost decomposition table" },
          { id: "results-charts", label: "Charts" },
          { id: "results-bytab", label: "Results by tab" },
        ],
      },
      { id: "workflow", label: "13. Getting started: accounts & sharing" },
    ],
  },
  {
    title: "Part C · Where the numbers come from",
    sections: [
      { id: "fe-frameworks", label: "14. Accounting frameworks" },
      { id: "fe-calculation", label: "15. The emission calculation" },
      { id: "fe-corrections", label: "16. Combustion-side corrections" },
      {
        id: "reference-data",
        label: "17. Reference data",
        children: [
          { id: "ref-vessels", label: "Vessel types" },
          { id: "ref-fuels", label: "Fuels" },
        ],
      },
      { id: "m-overview", label: "18. LCOH: overview & system boundary" },
      { id: "m-hydrogen", label: "19. Hydrogen from electricity" },
      { id: "m-profiles", label: "20. Resource profiles (capacity factors)" },
      { id: "m-dispatch", label: "21. Hourly dispatch" },
      { id: "m-degradation", label: "22. Degradation & stack replacement" },
      { id: "m-lcoh", label: "23. The LCOH formula" },
      { id: "m-lcoe", label: "24. Electricity pricing (LCOE)" },
      { id: "m-emissions", label: "25. Emissions ledger" },
      { id: "m-map", label: "26. The map's configuration" },
      { id: "m-costyears", label: "27. Cost-year projections" },
      { id: "m-defaults", label: "28. Country defaults" },
    ],
  },
  {
    title: "Part D · How much to trust it",
    sections: [
      {
        id: "sensitivity",
        label: "29. What moves the results",
        children: [
          { id: "sensitivity-columns", label: "How to read the table" },
          { id: "impact-leverage-exposure", label: "Impact: leverage x exposure" },
          { id: "impact-tornado", label: "The tornado" },
          { id: "impact-monte-carlo", label: "The uncertainty band" },
        ],
      },
      { id: "fe-validation", label: "30. Emission-method validation" },
      { id: "m-verification", label: "31. LCOH verification" },
      { id: "m-validation", label: "32. LCOH validation" },
      { id: "fe-limitations", label: "33. Emission-method limitations" },
      { id: "m-limitations", label: "34. LCOH limitations" },
      {
        id: "provenance",
        label: "35. Provenance & limits",
        children: [{ id: "prov-fourways", label: "The same corridor, four ways" }],
      },
      { id: "fe-sources", label: "36. Emission-method sources" },
      { id: "m-sources", label: "37. LCOH sources" },
    ],
  },
  {
    title: "Appendix · Reference material",
    sections: [
      { id: "inputs", label: "38. Complete input inventory" },
      { id: "m-constants", label: "39. Constants & reference defaults" },
    ],
  },
];

/** Every id in the tree, sections and sub-sections, in document order. */
export const TOC_IDS: readonly string[] = TOC_PARTS.flatMap((part) =>
  part.sections.flatMap((s) => [s.id, ...(s.children ?? []).map((c) => c.id)]),
);
