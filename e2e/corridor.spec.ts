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

const STEPS = ["Cargo & Corridor", "Vessel", "Fuel", "Port", "Regulation"];
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
  await page.getByRole("button", { name: "06 Results" }).click();
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

  // Walk all five steps; the compact summary stays docked; axe on each.
  for (const [i, label] of STEPS.entries()) {
    await page.getByRole("button", { name: `0${i + 1} ${label}` }).click();
    await expect(results.getByText(GAP)).toBeVisible();
    await expectNoSeriousViolations(page, `step ${label}`);
  }

  // Sprint 1.3: Fleet OPEX states its fuel-inclusion boundary on BOTH
  // vessel blocks (one label key serves green and fossil).
  await page.getByRole("button", { name: "02 Vessel" }).click();
  await expect(page.getByText("Fleet OPEX (excluding fuel)")).toHaveCount(2);

  // A live-model probe: under v3 the green side (build-plant) has NO
  // merchant price row — probe the production CAPEX the mode is built on
  // (the fossil price now lives in the Advanced fold, rank #19).
  await page.getByRole("button", { name: "03 Fuel" }).click();
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
