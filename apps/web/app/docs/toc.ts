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
    title: "Part 1 · The Green Corridor model",
    sections: [
      {
        id: "overview",
        label: "1. Overview & how the model works",
        children: [{ id: "overview-badges", label: "Benchmarks, overrides & badges" }],
      },
      { id: "workflow", label: "2. Working with scenarios" },
      { id: "tab-intro", label: "3. Tab 01 — Intro" },
      {
        id: "tab-energy",
        label: "4. Tab 02 — Energy",
        children: [
          { id: "energy-sourcing", label: "Sourcing modes" },
          { id: "energy-buildhere", label: "Build-here: site to cost structure" },
          { id: "energy-acceptance", label: "Build-here acceptance" },
          { id: "energy-perfuel", label: "Per-fuel fields" },
        ],
      },
      { id: "tab-vessels", label: "5. Tab 03 — Vessels" },
      { id: "tab-cargo", label: "6. Tab 04 — Cargo" },
      { id: "tab-ports", label: "7. Tab 05 — Ports" },
      {
        id: "tab-financing",
        label: "8. Tab 06 — Financing",
        children: [
          { id: "fin-differentiated", label: "Differentiated green financing" },
          { id: "fin-phasing", label: "Capital deployment schedule" },
        ],
      },
      {
        id: "tab-regulation",
        label: "9. Tab 07 — Regulation",
        children: [
          { id: "reg-accounting", label: "Emission accounting (v6)" },
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
        label: "10. Tab 08 — Results",
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
      {
        id: "engine",
        label: "11. The engine: formulas",
        children: [
          { id: "engine-financing", label: "Differentiated green financing" },
          { id: "engine-phasing", label: "Capital deployment schedule" },
        ],
      },
      // v6: the emission method is PART of the corridor model (and also
      // powers the standalone calculator) — documented inline, not as a
      // separate part. Anchor ids unchanged (external links keep working).
      { id: "fe-overview", label: "12. The emission method & functional unit" },
      { id: "fe-frameworks", label: "13. Accounting frameworks" },
      { id: "fe-calculation", label: "14. The emission calculation" },
      { id: "fe-corrections", label: "15. Combustion-side corrections" },
      { id: "fe-validation", label: "16. Emission-method validation & regression" },
      { id: "fe-limitations", label: "17. Emission-method limitations & open items" },
      { id: "fe-sources", label: "18. Emission-method sources" },
      {
        id: "reference-data",
        label: "19. Reference data",
        children: [
          { id: "ref-vessels", label: "Vessel types" },
          { id: "ref-fuels", label: "Fuels" },
        ],
      },
      {
        id: "sensitivity",
        label: "20. What moves the results",
        children: [
          { id: "impact-leverage-exposure", label: "Impact: leverage x exposure" },
          { id: "impact-tornado", label: "The tornado" },
          { id: "impact-monte-carlo", label: "The uncertainty band" },
        ],
      },
      {
        id: "provenance",
        label: "21. Provenance, versions & limits",
        children: [
          { id: "prov-default", label: "The default scenario" },
          { id: "prov-fourways", label: "The same corridor, four ways" },
        ],
      },
      { id: "inputs", label: "22. Complete input inventory" },
    ],
  },
  {
    title: "Part 2 · LCOH methodology",
    sections: [
      { id: "m-overview", label: "23. Overview & system boundary" },
      { id: "m-hydrogen", label: "24. Hydrogen from electricity" },
      { id: "m-profiles", label: "25. Resource profiles (capacity factors)" },
      { id: "m-dispatch", label: "26. Hourly dispatch" },
      { id: "m-degradation", label: "27. Degradation & stack replacement" },
      { id: "m-lcoh", label: "28. The LCOH formula" },
      { id: "m-lcoe", label: "29. Electricity pricing (LCOE)" },
      { id: "m-emissions", label: "30. Emissions ledger" },
      { id: "m-constants", label: "31. Constants & reference defaults" },
      { id: "m-map", label: "32. The map's configuration" },
      { id: "m-costyears", label: "33. Cost-year projections" },
      { id: "m-defaults", label: "34. Country defaults" },
      { id: "m-verification", label: "35. Verification" },
      { id: "m-validation", label: "36. Validation" },
      { id: "m-limitations", label: "37. Limitations" },
      { id: "m-sources", label: "38. Sources" },
    ],
  },
];

/** Every id in the tree, sections and sub-sections, in document order. */
export const TOC_IDS: readonly string[] = TOC_PARTS.flatMap((part) =>
  part.sections.flatMap((s) => [s.id, ...(s.children ?? []).map((c) => c.id)]),
);
