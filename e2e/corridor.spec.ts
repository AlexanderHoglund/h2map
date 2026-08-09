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

const STEPS = ["Intro", "Energy", "Vessels", "Cargo", "Ports", "Regulation & Financing"];
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
  await page.getByRole("button", { name: /Start|Resume draft/ }).click();

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
  await page.getByRole("button", { name: "07 Results" }).click();
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
      "06 Regulation & Financing",
      "07 Results",
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
    await expect(page.getByRole("button", { name: "07 Results" })).toHaveAttribute(
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
  // Regulation & Financing.
  await expect(page.getByLabel("Emissions basis for CO2 abated")).toBeVisible();
  await expect(page.getByLabel("Rate basis")).toBeVisible();
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

  // Ports: Port A coordinates moved in.
  await page.getByRole("button", { name: "05 Ports" }).click();
  await expect(page.getByLabel("Port A latitude")).toBeVisible();
  await expect(page.getByLabel("Port A longitude")).toBeVisible();

  // Regulation & Financing: WACC (with its unverified badge) + inflation.
  await page.getByRole("button", { name: "06 Regulation & Financing" }).click();
  await expect(page.getByLabel("Discount rate (WACC)")).toBeVisible();
  await expect(page.getByLabel("Inflation rate")).toBeVisible();
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

test("Simple/Advanced is provably output-neutral", async ({ page }) => {
  // Written BEFORE the feature (sprint 2.4 working rule): if a single
  // number moves when the view mode toggles, the mode has become a model
  // variant and is out of scope.
  await page.goto("/corridor");
  await page.getByRole("button", { name: /Start|Resume draft/ }).click();
  const results = page.getByRole("complementary");
  await expect(results.getByText("$1,762.21m")).toBeVisible();
  const header = page.getByRole("banner");

  const summaryBefore = await results.innerText();
  // Let the debounced autosave write the draft before taking the baseline.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("corridor-draft-v2") !== null))
    .toBe(true);
  const draftBefore = await page.evaluate(() =>
    localStorage.getItem("corridor-draft-v2"),
  );
  for (let i = 0; i < 3; i += 1) {
    await header.getByRole("button", { name: "Simple" }).click();
    await expect(results.getByText("$1,762.21m")).toBeVisible();
    expect(await results.innerText()).toBe(summaryBefore);
    await header.getByRole("button", { name: "Advanced" }).click();
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

  // Simple hides the manifest-advanced fields and locks the folds; the
  // hidden set stays on its benchmarks.
  await header.getByRole("button", { name: "Simple" }).click();
  await page.getByRole("button", { name: "02 Energy" }).click();
  // fossil fuel price is advanced-ranked: hidden in Simple.
  await expect(page.getByLabel("Fuel price")).toHaveCount(0);
  await header.getByRole("button", { name: "Advanced" }).click();
  await expect(page.getByLabel("Fuel price")).toHaveCount(1);
  // Leave the preference as we found it for other tests.
  await expect(results.getByText("$1,762.21m")).toBeVisible();
});

test("per-tab completion indicators derive from validation", async ({ page }) => {
  await page.goto("/corridor");
  await page.getByRole("button", { name: /Start|Resume draft/ }).click();
  const results = page.getByRole("complementary");
  await expect(results.getByText("$1,762.21m")).toBeVisible();
  const nav = page.getByRole("navigation").first();

  // Reference Chilean scenario: every tab green (the WACC is overridden, so
  // the unverified benchmark is not in use — no amber).
  await expect(nav.getByRole("img", { name: /complete/ })).toHaveCount(8);

  // Break it: build-here without a site → Energy red, Results blocked, and
  // the Results message names the tab and links to it.
  await page.getByRole("button", { name: "02 Energy" }).click();
  await page.getByLabel("Fuel sourcing").first().selectOption("build-here");
  await expect(nav.getByRole("img", { name: /Energy: blocks results/ })).toBeVisible();
  await expect(page.getByText("$1,762.21m")).toHaveCount(0);
  await page.getByRole("button", { name: "07 Results" }).click();
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
  // actually in use — Regulation & Financing warns without blocking.
  await page.getByRole("button", { name: "06 Regulation & Financing" }).click();
  const wacc = page.getByLabel("Discount rate (WACC)");
  await wacc.fill("");
  await wacc.blur();
  await expect(
    nav.getByRole("img", { name: /Regulation & Financing: running on an unverified benchmark/ }),
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
  await expect(nav.getByRole("img", { name: /complete/ })).toHaveCount(8);
});

test("a stored tonne scenario with weight ≠ 1 is never rewritten on load", async ({ page }) => {
  // Enter once so the app writes its default draft…
  await page.goto("/corridor");
  await page.getByRole("button", { name: /Start|Resume draft/ }).click();
  await expect(page.getByRole("complementary").getByText("$")).toBeTruthy();
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
