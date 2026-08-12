/**
 * Full-app golden (build-plan 4.4, updated for the Chilean default): drive
 * the default corridor scenario through the real UI and assert its headline
 * numbers end-to-end (form → client-side engine → results panel), plus an
 * axe-core pass (serious/critical) over the entry screen and all tabs.
 *
 * The DEFAULT scenario is the MMMCZCS Chilean copper-concentrate corridor
 * (Mejillones → Japan): gap $1,762.21m, green total $2,850.66m (study:
 * $2,850m), fossil total incl. the IMO-NZF proxy $1,088.45m ($280/tCO2
 * priced on the WTW basis the model reports, fix #2), $71/t cargo,
 * $1,215/tCO2 (WTW), CO2 abated 1,450,095 t (study: 1.45 Mt exact),
 * lifetime cargo 24,750,000 t. The WORKBOOK golden ($166.95m…) still pins
 * the engine via the frozen fixture in the package tests.
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const STEPS = ["Intro", "Energy", "Vessels", "Cargo", "Ports", "Financing", "Regulation"];
const GAP = "$1,762.21m";

async function expectNoSeriousViolations(page: Page, context: string) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(
    serious,
    `${context}: ${serious.map((v) => `${v.id} (${v.impact})`).join(", ")}`,
  ).toEqual([]);
}

/** Simplified is the default view; tests that drive the full field set
 *  switch to Standard first (the header toggle). */
async function useStandard(page: Page) {
  await page.getByRole("banner").getByRole("button", { name: "Standard" }).click();
}

/**
 * Projects-first entry: Start lands on tab 00, and the walk unlocks only
 * once a project is open. Tests open the seeded Chilean example (same
 * numbers as the old default draft). The first entry of a run triggers the
 * once-per-user seeding server-side; if a parallel worker won the race but
 * its inserts landed after our list fetch, one reload picks them up.
 */
async function openExample(page: Page) {
  await page.goto("/corridor");
  await page.getByRole("button", { name: /Start|Resume draft/ }).click();
  // Pre-migration double-seeding can duplicate starters — .first() is
  // strict-mode-safe either way.
  const row = page
    .getByRole("row", { name: /Example \u2014 Chilean copper corridor/ })
    .first();
  try {
    await row.waitFor({ timeout: 5000 });
  } catch {
    await page.reload();
    await page.getByRole("button", { name: /Start|Resume draft/ }).click();
    await row.waitFor({ timeout: 15000 });
  }
  await row.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByRole("button", { name: "01 Intro" })).toHaveAttribute(
    "aria-current",
    "step",
    { timeout: 15000 },
  );
}

test("default scenario reproduces the Chilean corridor numbers", async ({ page }) => {
  await page.goto("/corridor");
  // Freeze CSS transitions/animations so axe never samples a mid-transition
  // color (the stepper's 150ms background fade reads as low contrast).
  await page.addStyleTag({
    content: "*, *::before, *::after { transition: none !important; animation: none !important; }",
  });

  // Entry screen (the Cover tab's how-to) — start fresh.
  await expect(page.getByRole("heading", { name: "Green Corridor cost model" })).toBeVisible();
  await expectNoSeriousViolations(page, "entry screen");
  await openExample(page);
  await useStandard(page);

  // Headline numbers, straight from the untouched default form. The gap
  // shows twice by design (top-bar chip + summary headline) — scope the
  // assertions to the docked COMPACT summary.
  const results = page.getByRole("complementary");
  await expect(results.getByText(GAP)).toBeVisible();
  await expect(results.getByText("$71", { exact: true })).toBeVisible();
  await expect(results.getByText("$1,215", { exact: true })).toBeVisible();
  await expect(results.getByText("well-to-wake basis")).toBeVisible();
  // Side totals: green ≈ the study's $2,850m; fossil incl. the NZF proxy.
  await expect(results.getByText("$2,850.66m")).toBeVisible();
  await expect(results.getByText("$1,088.45m")).toBeVisible();
  // Fix #1: the PRE-regulation gap (the study's $2,000m quantity) is shown
  // as a secondary line under the headline.
  await expect(results.getByText(/\$2,012\.44m/)).toBeVisible();

  // The FULL panel lives in its own Results tab (06): lifetime cargo and
  // the study-exact CO2 abatement render there.
  await page.getByRole("button", { name: "08 Results" }).click();
  const full = page.getByRole("main");
  await expect(full.getByText(GAP, { exact: true })).toBeVisible();
  // Twice by design: the snapshot strip and the Cargo & Corridor result card.
  await expect(full.getByText("24,750,000")).toHaveCount(2);
  // Derived figures render at four significant figures (sprint 1.2): the
  // engine's 1,450,095 t displays as 1,450,000 t; full precision stays in
  // the model (the exact GAP above is computed from it).
  await expect(full.getByText("1,450,000 t").first()).toBeVisible();
  // Fix #4: ETS is disabled here — the carbon-price reference must come
  // from the ACTIVE scheme (self-designed $280), labelled as such.
  await expect(full.getByText("your carbon price $280")).toBeVisible();
  // Fix #5: the annual chart labels every modelled year (15 ticks, 2030..2044)
  // — no asymmetric decimation that reads as a data gap.
  {
    const chart = page.locator("section", { hasText: "Annual cost, green vs fossil" }).last();
    const ticks = chart.locator(".recharts-xAxis .recharts-cartesian-axis-tick");
    await expect(ticks).toHaveCount(15);
    await expect(chart.getByText("2030", { exact: true })).toBeVisible();
    await expect(chart.getByText("2044", { exact: true })).toBeVisible();
  }
  // The MMMCZCS waterfall: five steps, labels wrapped on the axis, the
  // footnote stating the totals' regulatory boundary. Gross and incremental
  // read the golden quantities.
  {
    const chart = page
      .locator("section", { hasText: "Breakdown of total cost of the green corridor" })
      .last();
    for (const label of [
      "green corridor*",
      "fossil corridor*",
      "incremental cost",
      "Regulations",
    ]) {
      await expect(chart.getByText(label, { exact: false }).first()).toBeVisible();
    }
    await expect(chart.getByText("$2,012m", { exact: true })).toBeVisible(); // gross
    await expect(chart.getByText("$1,762m", { exact: true })).toBeVisible(); // incremental
    await expect(chart.getByText(/before regulatory instruments/)).toBeVisible();
  }

  // The same breakdown per tonne of CO2 abated: every step divided by the
  // lifetime abatement, so gross reads the pre-regulation abatement cost
  // and incremental the headline $1,215/t.
  {
    const chart = page
      .locator("section", { hasText: "Breakdown of abatement cost per tonne" })
      .last();
    await expect(chart.getByText("well-to-wake", { exact: false }).first()).toBeVisible();
    await expect(chart.getByText("$1,388", { exact: true })).toBeVisible(); // gross /t
    await expect(chart.getByText("$1,215", { exact: true })).toBeVisible(); // incremental /t
  }

  // The emissions & abatement diagram: pre/post bars per basis.
  {
    const chart = page.locator("section", { hasText: "Emissions & abatement" }).last();
    await expect(chart.getByText("Before regulation")).toBeVisible();
    await expect(chart.getByText("After regulation")).toBeVisible();
  }
  await expectNoSeriousViolations(page, "results tab");

  // Walk all six steps; the compact summary stays docked; axe on each.
  for (const [i, label] of STEPS.entries()) {
    await page.getByRole("button", { name: `0${i + 1} ${label}` }).click();
    await expect(results.getByText(GAP)).toBeVisible();
    await expectNoSeriousViolations(page, `step ${label}`);
  }

  // Sprint 2.1: the tab bar is the MMMCZCS domain order, exactly.
  {
    const nav = page.getByRole("navigation").first();
    const labels = (await nav.getByRole("button").allInnerTexts()).map((s) =>
      // strip the completion glyphs — the order is what this pins
      s.replace(/[✓▲✕]/g, "").replace(/\s+/g, " ").trim(),
    );
    expect(labels).toEqual([
      "00 Projects",
      "01 Intro",
      "02 Energy",
      "03 Vessels",
      "04 Cargo",
      "05 Ports",
      "06 Financing",
      "07 Regulation",
      "08 Results",
    ]);
  }

  // Back is disabled on Intro; Next traverses every tab once, in order,
  // and the last step's forward button reads Results and lands there.
  {
    const main = page.getByRole("main");
    await page.getByRole("button", { name: "01 Intro" }).click();
    await expect(main.getByRole("button", { name: "Back" })).toBeDisabled();
    for (const [i, label] of STEPS.slice(1).entries()) {
      await main.getByRole("button", { name: "Next" }).click();
      await expect(
        page.getByRole("button", { name: `0${i + 2} ${label}` }),
      ).toHaveAttribute("aria-current", "step");
    }
    await main.getByRole("button", { name: "Results", exact: true }).click();
    await expect(page.getByRole("button", { name: "08 Results" })).toHaveAttribute(
      "aria-current",
      "step",
    );
  }

  // Sprint 1.3: Fleet OPEX states its fuel-inclusion boundary on BOTH
  // vessel blocks (one label key serves green and fossil).
  await page.getByRole("button", { name: "03 Vessels" }).click();
  await expect(page.getByText("Fleet OPEX (excluding fuel)")).toHaveCount(2);

  // Sprint 1.7: the year fields are bounded selectors carrying the
  // resolved-field provenance chrome; defaults select the Chilean values.
  await page.getByRole("button", { name: "01 Intro" }).click();
  const startYear = page.getByLabel("Model start year");
  const horizon = page.getByLabel("Years modelled");
  await expect(startYear).toHaveValue("2030");
  await expect(horizon).toHaveValue("15");
  const startOptions = startYear.locator("option");
  await expect(startOptions.first()).toHaveText("2025");
  await expect(startOptions.last()).toHaveText("2055");
  const horizonOptions = horizon.locator("option");
  await expect(horizonOptions).toHaveCount(40); // honours the schema's ≤40 cap
  await expect(horizonOptions.last()).toHaveText("40");
  // Picking a non-default year flags override + restores cleanly, and the
  // model reacts (the golden gap belongs to 2030).
  await horizon.selectOption("20");
  await expect(page.getByText(GAP)).toHaveCount(0);
  await horizon.selectOption("15");
  await expect(results.getByText(GAP)).toBeVisible();

  // Sprint 3.3b: the Intro tab draws the route the ship actually sails —
  // the reference corridor crosses the Pacific with its routed distance and
  // NO canal marker, labelled indicative. (Routing is local and cached;
  // the generous timeout only covers the first cold evaluation.)
  {
    const map = page.getByRole("img", { name: "Corridor route map" });
    await expect(map).toBeVisible();
    await expect(page.getByText(/indicative route/)).toBeVisible({ timeout: 20000 });
    await expect(map.getByText("9,146 nm")).toBeVisible();
    await expect(map.getByText("Mejillones")).toBeVisible();
    await expect(map.getByText("Japan (Asia)")).toBeVisible();
    await expect(map.getByText("Panama")).toHaveCount(0);
    await expect(map.getByText("Suez")).toHaveCount(0);
  }

  // Sprint 2.3: Country precedes Port in DOM (and so keyboard) order at
  // both ends of the corridor.
  {
    const formLabels = (await page.getByRole("main").locator("label").allInnerTexts()).map(
      (s) => s.trim(),
    );
    const order = (name: string) => formLabels.findIndex((l) => l.startsWith(name));
    expect(order("Country (port A)")).toBeGreaterThanOrEqual(0);
    expect(order("Country (port A)")).toBeLessThan(order("Port A"));
    expect(order("Country (port B)")).toBeGreaterThanOrEqual(0);
    expect(order("Country (port B)")).toBeLessThan(order("Port B"));
  }

  // Sprint 2.2: every moved field renders on its MMMCZCS domain tab.
  // Intro: the model-option basis selects arrived; WACC left for
  // the Financing tab.
  await expect(page.getByLabel("Emissions basis for CO2 abated")).toBeVisible();
  await expect(page.getByLabel("Rate basis")).toHaveCount(0); // moved to Financing
  await expect(page.getByLabel("Discount rate (WACC)")).toHaveCount(0);
  await expect(page.getByLabel("Annual cargo throughput")).toHaveCount(0);

  // Cargo tab: unit + throughput; weight per unit exists only for TEU.
  await page.getByRole("button", { name: "04 Cargo" }).click();
  await expect(page.getByLabel("Cargo unit", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Annual cargo throughput")).toBeVisible();
  await expect(page.getByLabel("Weight per unit")).toHaveCount(0); // tonne default
  await page.getByLabel("Cargo unit", { exact: true }).selectOption("teu");
  const unitWeight = page.getByLabel("Weight per unit");
  await expect(unitWeight).toBeVisible();
  await expect(unitWeight).toHaveValue("14"); // the TEU benchmark
  await page.getByLabel("Cargo unit", { exact: true }).selectOption("tonne");
  await expect(page.getByLabel("Weight per unit")).toHaveCount(0);
  await expect(results.getByText(GAP)).toBeVisible(); // tonne weight back to 1

  // Coordinates live on Intro, beside the map they drive.
  await page.getByRole("button", { name: "01 Intro" }).click();
  await expect(page.getByLabel("Port A latitude")).toBeVisible();
  await expect(page.getByLabel("Port A longitude")).toBeVisible();
  await page.getByRole("button", { name: "05 Ports" }).click();
  await expect(page.getByText("Port storage — CAPEX (year 1)").first()).toBeVisible();

  // Financing: WACC (with its unverified badge) + inflation + rate basis.
  await page.getByRole("button", { name: "06 Financing" }).click();
  await expect(page.getByLabel("Discount rate (WACC)")).toBeVisible();
  await expect(page.getByLabel("Inflation rate")).toBeVisible();
  await expect(page.getByLabel("Rate basis")).toBeVisible();
  await expect(page.getByText("unverified benchmark")).toBeVisible();
  await expect(results.getByText(GAP)).toBeVisible();

  // A live-model probe: under v3 the green side (build-plant) has NO
  // merchant price row — probe the production CAPEX the mode is built on
  // (the fossil price now lives in the Advanced fold, rank #19).
  await page.getByRole("button", { name: "02 Energy" }).click();
  const prodCapex = page.getByLabel("Fuel production CAPEX (year 1)").first();
  await prodCapex.fill("2000");
  await expect(page.getByText(GAP)).toHaveCount(0);
  await prodCapex.fill("1100");
  await expect(results.getByText(GAP)).toBeVisible();

  // Display rounding is display-only (sprint 1.2). The default green
  // consumption is an OVERRIDE (5700) and renders exactly as typed. Clearing
  // it falls back to the vessel-table benchmark, which renders grouped
  // ("2,638") — while the draft carries no override at all, proving nothing
  // rounded was written back. (The slide-7 case, 9806.451613 → "9,806", is
  // pinned in the @h2map/units formatSig tests.)
  const consumption = page.getByLabel("Fuel consumption").first();
  await expect(consumption).toHaveValue("5700");
  await consumption.fill("");
  await consumption.blur();
  await expect(consumption).toHaveValue("2,638");
  // The draft autosave is debounced — poll until it reflects the clear.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const raw = localStorage.getItem("corridor-draft-v2");
          if (!raw) return "draft-missing";
          const draft = JSON.parse(raw) as {
            green?: { overrides?: Record<string, unknown> };
          };
          return draft.green?.overrides?.["fuelTonnesPerVesselYear"] ?? null;
        }),
      { timeout: 5000 },
    )
    .toBeNull();
  await consumption.fill("5700");
  await expect(results.getByText(GAP)).toBeVisible();
});

test("Simplified/Standard is provably output-neutral", async ({ page }) => {
  // Written BEFORE the feature (sprint 2.4 working rule): if a single
  // number moves when the view mode toggles, the mode has become a model
  // variant and is out of scope. (Opening the example applies its STORED
  // mode — the loop below then toggles both ways regardless.)
  await openExample(page);
  const results = page.getByRole("complementary");
  await expect(results.getByText("$1,762.21m")).toBeVisible();
  const header = page.getByRole("banner");

  const summaryBefore = await results.innerText();
  // Let the post-load autosave settle before taking the baseline: opening
  // the example rewrites the draft (migration normalizes key order), so the
  // baseline is captured only once the draft has stopped changing.
  await expect
    .poll(async () => {
      const a = await page.evaluate(() => localStorage.getItem("corridor-draft-v2"));
      await page.waitForTimeout(600);
      const b = await page.evaluate(() => localStorage.getItem("corridor-draft-v2"));
      return a !== null && a === b;
    })
    .toBe(true);
  const draftBefore = await page.evaluate(() =>
    localStorage.getItem("corridor-draft-v2"),
  );
  for (let i = 0; i < 3; i += 1) {
    await header.getByRole("button", { name: "Simplified" }).click();
    await expect(results.getByText("$1,762.21m")).toBeVisible();
    expect(await results.innerText()).toBe(summaryBefore);
    await header.getByRole("button", { name: "Standard" }).click();
    await expect(results.getByText("$1,762.21m")).toBeVisible();
    expect(await results.innerText()).toBe(summaryBefore);
  }
  // The mode never touches the scenario: the draft is byte-identical and
  // carries no view-mode key (two people opening the same scenario in
  // different modes see the same numbers).
  const draftAfter = await page.evaluate(() =>
    localStorage.getItem("corridor-draft-v2"),
  );
  expect(draftAfter).toBe(draftBefore);
  expect(draftAfter).not.toContain("viewMode");
  expect(draftAfter).not.toContain("simple");

  // Simplified hides the non-essential fields; the hidden set stays on its
  // benchmarks.
  await header.getByRole("button", { name: "Simplified" }).click();
  await page.getByRole("button", { name: "02 Energy" }).click();
  // fossil fuel price is advanced-ranked: hidden in Simplified.
  await expect(page.getByLabel("Fuel price")).toHaveCount(0);
  await header.getByRole("button", { name: "Standard" }).click();
  await expect(page.getByLabel("Fuel price")).toHaveCount(1);
  // Leave the preference as we found it for other tests.
  await expect(results.getByText("$1,762.21m")).toBeVisible();
});

test("per-tab completion indicators derive from validation", async ({ page }) => {
  await openExample(page);
  const results = page.getByRole("complementary");
  await expect(results.getByText("$1,762.21m")).toBeVisible();
  const nav = page.getByRole("navigation").first();

  // Reference Chilean scenario: every tab green (the WACC is overridden, so
  // the unverified benchmark is not in use — no amber).
  await expect(nav.getByRole("img", { name: /complete/ })).toHaveCount(9);

  // Break it: build-here without a site → Energy red, Results blocked, and
  // the Results message names the tab and links to it.
  await page.getByRole("button", { name: "02 Energy" }).click();
  await page.getByLabel("Fuel sourcing").first().selectOption("build-here");
  await expect(nav.getByRole("img", { name: /Energy: blocks results/ })).toBeVisible();
  await expect(page.getByText("$1,762.21m")).toHaveCount(0);
  await page.getByRole("button", { name: "08 Results" }).click();
  await expect(nav.getByRole("img", { name: /Results: blocks results/ })).toBeVisible();
  const fix = page.getByRole("button", { name: "Fix on Energy" });
  await expect(fix).toBeVisible();
  await fix.click();
  // Landing on the red tab focuses the offending control.
  await expect(page.getByRole("button", { name: "02 Energy" })).toHaveAttribute(
    "aria-current",
    "step",
  );
  await expect
    .poll(() =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return el?.closest("[data-field-id]")?.getAttribute("data-field-id") ?? null;
      }),
    )
    .toBe("green.sourcing");
  await page.getByLabel("Fuel sourcing").first().selectOption("build-plant");
  await expect(results.getByText("$1,762.21m")).toBeVisible();

  // Amber: clear the WACC override so the UNVERIFIED country benchmark is
  // actually in use — the Financing tab warns without blocking.
  await page.getByRole("button", { name: "06 Financing" }).click();
  const wacc = page.getByLabel("Discount rate (WACC)");
  await wacc.fill("");
  await wacc.blur();
  await expect(
    nav.getByRole("img", { name: /Financing: running on an unverified benchmark/ }),
  ).toBeVisible();
  // NOT blocking: the summary still shows a computed headline (the generic
  // "other" WACC row may or may not equal the override, so no exact value).
  await expect(results.getByText(/\$[0-9,.]+m/).first()).toBeVisible();
  // Restore the override. (The generic benchmark happens to equal 0.08, so
  // filling the same digits fires no input event — go via a distinct value.)
  await wacc.fill("0.07");
  await wacc.fill("0.08");
  await wacc.blur();
  await expect(results.getByText("$1,762.21m")).toBeVisible();
  await expect(nav.getByRole("img", { name: /complete/ })).toHaveCount(9);
});

test("routed distance follows override > derived(routed), adoption-only", async ({ page }) => {
  await openExample(page);
  const results = page.getByRole("complementary");
  await expect(results.getByText(GAP)).toBeVisible();

  // The stored typed distance is an override: untouched on load, exact
  // golden gap — and the routed figure waits beside it as a benchmark.
  const distance = page.getByLabel("Corridor length, one-way");
  await expect(distance).toHaveValue("9500");
  await expect(page.getByText("routed: 9,146 nm")).toBeVisible({ timeout: 20000 });
  // 9,500 vs 9,146 is a 3.9% divergence — BELOW the 15% threshold: silent.
  await expect(page.getByText(/Typed distance differs/)).toHaveCount(0);

  // Adoption is an ordinary, user-initiated action: the field flips to the
  // routed figure and the draft records the value WITH its graph-version
  // provenance. (In this scenario fuel consumption is overridden, so the
  // gap itself is insensitive to distance — the point pinned here is that
  // nothing but the click writes the value.)
  await page.getByRole("button", { name: "use this" }).click();
  await expect(distance).toHaveValue("9,146");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem("corridor-draft-v2");
        if (!raw) return null;
        const draft = JSON.parse(raw) as {
          cargo: { oneWayDistanceNm: number; routedDistance?: { graphVersion: string } };
        };
        return `${draft.cargo.oneWayDistanceNm}|${draft.cargo.routedDistance?.graphVersion ?? ""}`;
      }),
    )
    .toBe("9146|searoute-ts@2.2.0/marnet-plus-100km");
  // Typing a value back makes it an override again and clears the adopted
  // provenance (it no longer describes the typed figure).
  await distance.fill("9500");
  await expect(results.getByText(GAP)).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem("corridor-draft-v2");
        if (!raw) return null;
        const draft = JSON.parse(raw) as {
          cargo: { oneWayDistanceNm: number; routedDistance?: unknown };
        };
        return `${draft.cargo.oneWayDistanceNm}|${draft.cargo.routedDistance === undefined}`;
      }),
    )
    .toBe("9500|true");

  // Divergence notice: reroute to Rotterdam (via Panama, 6,942 nm) while
  // the typed figure stays 9,500 — a 37% miss, ABOVE the threshold.
  await page.getByLabel("Port B latitude").fill("51.9");
  await page.getByLabel("Port B longitude").fill("4.47");
  await expect(page.getByText(/Typed distance differs/)).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/via the Panama Canal/)).toBeVisible();
  // Non-blocking throughout: the model still shows its result.
  await expect(results.getByText(GAP)).toBeVisible();

  // Restore Yokohama; the notice clears.
  await page.getByLabel("Port B latitude").fill("35.45");
  await page.getByLabel("Port B longitude").fill("139.65");
  await expect(page.getByText("routed: 9,146 nm")).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/Typed distance differs/)).toHaveCount(0);
  await expect(results.getByText(GAP)).toBeVisible();
});

test("provenance badges answer where a number comes from", async ({ page }) => {
  await openExample(page);
  await useStandard(page);
  const results = page.getByRole("complementary");
  await expect(results.getByText(GAP)).toBeVisible();

  // Year selector: the benchmark badge cites the study default.
  await expect(
    page.getByRole("button", { name: /MMMCZCS Chilean copper study default/ }).first(),
  ).toBeVisible();

  // WACC (overridden by default): the badge names what the value replaces
  // and which reference row it came from.
  await page.getByRole("button", { name: "06 Financing" }).click();
  const overrideBadge = page.getByRole("button", {
    name: /replaces the benchmark 0\.08.*2026-07-30-excel-v1/,
  });
  await expect(overrideBadge).toBeVisible();

  // Cleared to the benchmark: the badge cites the bundle row and carries
  // the unverified marker; keyboard focus opens the tooltip.
  const wacc = page.getByLabel("Discount rate (WACC)");
  await wacc.fill("");
  await wacc.blur();
  const benchmarkBadge = page.getByRole("button", {
    name: /Reference benchmark: 2026-07-30-excel-v1.*unverified/,
  });
  await expect(benchmarkBadge).toBeVisible();
  await benchmarkBadge.focus();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await expectNoSeriousViolations(page, "provenance tooltip open");

  // Restore the reference override (benchmark equals it, so via 0.07).
  await wacc.fill("0.07");
  await wacc.fill("0.08");
  await wacc.blur();
  await expect(results.getByText(GAP)).toBeVisible();
});

test("numeric inputs tolerate clearing, signs and partial input", async ({ page }) => {
  // Regression: the controlled number inputs used to commit Number("") = 0
  // the moment a field was cleared — coordinates slammed to 0 and typing a
  // leading "-" was impossible.
  await openExample(page);
  const lat = page.getByLabel("Port A latitude");
  await expect(lat).toHaveValue("-23.1");
  // Clearing leaves the field EMPTY while editing — no snap to 0…
  await lat.fill("");
  await expect(lat).toHaveValue("");
  // …and a signed decimal types cleanly, keystroke by keystroke.
  await lat.pressSequentially("-33.03");
  await expect(lat).toHaveValue("-33.03");
  await lat.blur();
  await expect(lat).toHaveValue("-33.03");
  // A dangling partial edit ("-") never commits: blur restores the stored value.
  await lat.fill("");
  await lat.pressSequentially("-");
  await lat.blur();
  await expect(lat).toHaveValue("-33.03");
  // Restore the reference coordinate.
  await lat.fill("-23.1");
  await lat.blur();
  await expect(lat).toHaveValue("-23.1");
});

test("a stored tonne scenario with weight ≠ 1 is never rewritten on load", async ({ page }) => {
  // Enter once so the app writes its default draft… (the model autosaves
  // from mount — no project needs to be open for the draft slot to exist).
  await page.goto("/corridor");
  await page.getByRole("button", { name: /Start|Resume draft/ }).click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("corridor-draft-v2") !== null))
    .toBe(true);
  // …then plant a tonne scenario carrying a non-1 weight, as an old save might.
  await page.evaluate(() => {
    const draft = JSON.parse(localStorage.getItem("corridor-draft-v2")!) as {
      cargo: { unit?: string; unitWeightTonnes?: number };
    };
    draft.cargo.unit = "tonne";
    draft.cargo.unitWeightTonnes = 2;
    localStorage.setItem("corridor-draft-v2", JSON.stringify(draft));
  });
  await page.reload();
  await page.getByRole("button", { name: /Resume draft/ }).click();
  // Projects-first: the unsaved draft resumes via the editing card.
  await page.getByRole("button", { name: "Continue editing" }).click();
  // The weight field hides for tonnes, but the stored value must survive:
  // no load-time rewrite, even after the debounced autosave runs.
  await page.getByRole("button", { name: "04 Cargo" }).click();
  await expect(page.getByLabel("Weight per unit")).toHaveCount(0);
  await page.waitForTimeout(1200); // let the autosave cycle write back
  const stored = await page.evaluate(() => {
    const draft = JSON.parse(localStorage.getItem("corridor-draft-v2")!) as {
      cargo: { unitWeightTonnes?: number };
    };
    return draft.cargo.unitWeightTonnes;
  });
  expect(stored).toBe(2);
});

test("green financing: explicit line, sign-readable, defaults untouched", async ({ page }) => {
  // Sprint 4.1. The financing effect is an explicit interest-saving line —
  // NEVER a per-side discount rate. On the default corridor the amortizing
  // structure at Δr = 2pp reproduces the $196.0m calibration bound, so the
  // waterfall float must read −$196m (the sign carried in TEXT, readable
  // without colour, per the sprint 3 rule).
  await openExample(page);
  const results = page.getByRole("complementary");
  await expect(results.getByText(GAP)).toBeVisible();

  // Toggle on from the Financing tab. Toggle-on initialises concrete
  // values (base rate = the corridor rate 8%, green 6%, tenor 15,
  // amortizing) — the gap must move immediately.
  await page.getByRole("button", { name: "06 Financing" }).click();
  const toggle = page.getByRole("switch", { name: "Differentiated green financing" });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(results.getByText(GAP)).toHaveCount(0);
  await expect(results.getByText("$1,566.29m")).toBeVisible(); // 1,762.21 − 195.92

  // Results: the waterfall gains the financing float between the gross
  // incremental bar and the regulation bar, with the sign in the label.
  await page.getByRole("button", { name: "08 Results" }).click();
  {
    const chart = page
      .locator("section", { hasText: "Breakdown of total cost of the green corridor" })
      .last();
    // The wrapped axis label's tspans concatenate without a space, like the
    // existing "Total cost ofgreen corridor*" labels.
    await expect(chart.getByText("Greenfinancing", { exact: false }).first()).toBeVisible();
    await expect(chart.getByText("\u2212$196m", { exact: true })).toBeVisible();
    await expect(chart.getByText("$2,012m", { exact: true })).toBeVisible(); // gross unchanged
    await expect(chart.getByText("$1,566m", { exact: true })).toBeVisible(); // incremental after
  }
  // The decomposition table gains a green-only "Green financing effect" row.
  await expect(page.getByText("Green financing effect").first()).toBeVisible();

  // Toggle off → the golden default is byte-identical again.
  await page.getByRole("button", { name: "06 Financing" }).click();
  await toggle.click();
  await expect(results.getByText(GAP)).toBeVisible();
  await expect(page.getByText("Green financing effect")).toHaveCount(0);
});

test("capital phasing: 30/40/30 re-times capital, refuses bad sums", async ({ page }) => {
  // Sprint 4.2. Phasing spreads CAPEX over the first N years by explicit
  // shares; the annual chart and its caption are data-driven, so three
  // capital bars and the recomputed year-1 figure need no chart changes.
  await openExample(page);
  await useStandard(page);
  const results = page.getByRole("complementary");
  await expect(results.getByText(GAP)).toBeVisible();

  await page.getByRole("button", { name: "06 Financing" }).click();
  await page.getByRole("switch", { name: "Capital deployment schedule" }).click();
  // Toggle-on initialises 100% in year 1 — output-neutral by construction.
  await expect(results.getByText(GAP)).toBeVisible();

  await page.getByRole("button", { name: "30/40/30 preset" }).click();
  await expect(results.getByText("$1,665.88m")).toBeVisible();

  // The annual chart's caption recomputes (year-1 capital 0.3 × $1,690m)
  // and switches to the phased wording — "charged in full up front" would
  // now be false.
  await page.getByRole("button", { name: "08 Results" }).click();
  await expect(
    page.getByText(/Year 1 carries \$507m of green capital under the deployment schedule/),
  ).toBeVisible();

  // Bad sums are refused BY NAME, never silently rescaled: zeroing year 3
  // shows the live amber warning and the results panel carries the error.
  await page.getByRole("button", { name: "06 Financing" }).click();
  const y3 = page.getByLabel("Green share, year 3");
  await y3.fill("0");
  await expect(page.getByText(/Green shares must sum to 1 \(currently 0\.70\)/)).toBeVisible();
  await expect(page.getByText(/capitalPhasing\.green\.weights must sum to 1/)).toBeVisible();
  await y3.fill("0.3");
  await expect(results.getByText("$1,665.88m")).toBeVisible();

  // Off again → the golden default returns.
  await page.getByRole("switch", { name: "Capital deployment schedule" }).click();
  await expect(results.getByText(GAP)).toBeVisible();
});

test("Simplified shows only essential inputs, defaults carry the rest", async ({ page }) => {
  // The example opens in its stored Standard mode — switch to Simplified
  // (any project can jump between the two at any time).
  await openExample(page);
  const results = page.getByRole("complementary");
  await expect(results.getByText(GAP)).toBeVisible();
  const header = page.getByRole("banner");
  await header.getByRole("button", { name: "Simplified" }).click();
  await expect(header.getByRole("button", { name: "Simplified" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Energy: fuel-property constants and every fossil numeric are hidden;
  // the sensitivity top-level set stays.
  await page.getByRole("button", { name: "02 Energy" }).click();
  await expect(page.getByLabel("Energy density, LHV")).toHaveCount(0);
  await expect(page.getByLabel(/combustion/i)).toHaveCount(0);
  await expect(page.getByLabel("Fuel price")).toHaveCount(0); // fossil purchase
  await expect(page.getByLabel("Fuel production CAPEX (year 1)")).toHaveCount(1); // green only
  await expect(page.getByLabel("Fuel consumption")).toHaveCount(1); // green only

  // Vessels: fossil fleet pair runs on benchmarks behind the strip.
  await page.getByRole("button", { name: "03 Vessels" }).click();
  await expect(page.getByLabel("Fleet CAPEX (year 1)")).toHaveCount(1);

  // Regulation: toggles only - the active self-designed scheme's numbers
  // are defaulted and hidden.
  await page.getByRole("button", { name: "07 Regulation" }).click();
  await expect(page.getByLabel("CO2 price", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("switch").first()).toBeVisible();

  // A hidden value in effect is COUNTED: set the self-designed CO2 price in
  // Standard, return to Simplified, and the scheme's strip turns emphatic.
  await useStandard(page);
  const co2 = page.getByLabel("CO2 price", { exact: true });
  await co2.fill("300");
  await expect(results.getByText(GAP)).toHaveCount(0); // price moved the model
  await header.getByRole("button", { name: "Simplified" }).click();
  await expect(page.getByText(/1 detailed setting in effect but hidden/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Switch to Standard" }).first()).toBeVisible();

  // Restore the default; the golden gap returns.
  await useStandard(page);
  await co2.fill("280");
  await expect(results.getByText(GAP)).toBeVisible();
});

test("projects-first: tabs lock until a project is chosen; create picks the mode", async ({ page }) => {
  await page.goto("/corridor");
  await page.getByRole("button", { name: /Start|Resume draft/ }).click();
  // Landed on tab 00 with the walk locked.
  await expect(page.getByRole("button", { name: "00 Projects" })).toHaveAttribute(
    "aria-current",
    "step",
  );
  await expect(page.getByRole("button", { name: "01 Intro" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "08 Results" })).toBeDisabled();

  // The two once-per-user starters are there, with their mode chips.
  await expect(
    page.getByRole("row", { name: /Example \u2014 Chilean copper corridor/ }).first(),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("row", { name: /My first corridor/ }).first()).toBeVisible();

  // Create a new project in Standard: it opens on Intro, unlocked, in
  // Standard, computing from the blank starter (benchmarks, schemes off).
  await page.getByRole("button", { name: "New project" }).click();
  await page.getByPlaceholder("My corridor").fill("Gating test corridor");
  await page.getByRole("radio", { name: "Standard" }).check();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("button", { name: "01 Intro" })).toHaveAttribute(
    "aria-current",
    "step",
    { timeout: 15000 },
  );
  await expect(
    page.getByRole("banner").getByRole("button", { name: "Standard" }),
  ).toHaveAttribute("aria-pressed", "true");
  // The scenario bar leads with the project identity on every working tab.
  await expect(page.getByLabel("Scenario name")).toHaveValue("Gating test corridor");
  await expect(page.getByRole("button", { name: "08 Results" })).toBeEnabled();
  await expect(page.getByRole("complementary").getByText(GAP)).toHaveCount(0);

  // Export the blank project: the COMPLETE form carries EVERY field —
  // including the never-touched coordinates — as explicit nulls; importing
  // the same file back is lossless (results unchanged).
  {
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export JSON", exact: true }).click();
    const download = await downloadPromise;
    const fs = await import("node:fs/promises");
    const path = await download.path();
    const text = await fs.readFile(path, "utf8");
    const file = JSON.parse(text) as {
      cargo: Record<string, unknown>;
      financing: unknown;
      capitalPhasing: unknown;
    };
    expect(file.cargo.portACoords).toEqual({ lat: null, lon: null });
    expect(file.cargo.portBCoords).toEqual({ lat: null, lon: null });
    expect(file.cargo).toHaveProperty("countryBId");
    expect(file.cargo).toHaveProperty("routedDistance");
    expect(file).toHaveProperty("financing");
    expect(file).toHaveProperty("capitalPhasing");
    const before = await page.getByRole("complementary").innerText();
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Import JSON", exact: true }).click();
    await (await chooser).setFiles(path);
    await expect(page.getByText("Scenario imported")).toBeVisible();
    await expect
      .poll(() => page.getByRole("complementary").innerText())
      .toBe(before);
  }

  // Reopen the example: golden numbers return and the walk stays unlocked.
  await page.getByRole("button", { name: "00 Projects" }).click();
  await page
    .getByRole("row", { name: /Example \u2014 Chilean copper corridor/ })
    .first()
    .getByRole("button", { name: "Open", exact: true })
    .click();
  await expect(page.getByRole("complementary").getByText(GAP)).toBeVisible({
    timeout: 15000,
  });

  // Clean up the created project so reruns against a persistent user stay
  // deterministic (the e2e users are minted per run anyway).
  await page.getByRole("button", { name: "00 Projects" }).click();
  const created = page.getByRole("row", { name: /Gating test corridor/ }).first();
  await created.getByRole("button", { name: "Delete", exact: true }).click();
  // Wait for the confirm step to render — a second click that lands before
  // the re-render hits the ORIGINAL button and never confirms (flake).
  await expect(created.getByText("Delete permanently?")).toBeVisible();
  await created.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("row", { name: /Gating test corridor/ })).toHaveCount(0, {
    timeout: 15000,
  });
});
