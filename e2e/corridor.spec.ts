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
  await expect(full.getByText("24,750,000")).toBeVisible();
  await expect(full.getByText("1,450,095 t").first()).toBeVisible();
  // Fix #4: ETS is disabled here — the carbon-price reference must come
  // from the ACTIVE scheme (self-designed $280), labelled as such.
  await expect(full.getByText("your carbon price $280")).toBeVisible();
  await expectNoSeriousViolations(page, "results tab");

  // Walk all five steps; the compact summary stays docked; axe on each.
  for (const [i, label] of STEPS.entries()) {
    await page.getByRole("button", { name: `0${i + 1} ${label}` }).click();
    await expect(results.getByText(GAP)).toBeVisible();
    await expectNoSeriousViolations(page, `step ${label}`);
  }

  // A live-model probe: the green fuel price is overridden to 0 (plant cost
  // sits in CAPEX/OPEX). Pricing it moves the gap; restoring 0 restores it.
  await page.getByRole("button", { name: "03 Fuel" }).click();
  const price = page.getByLabel("Fuel price").first();
  await price.fill("1200");
  await expect(page.getByText(GAP)).toHaveCount(0);
  await price.fill("0");
  await expect(results.getByText(GAP)).toBeVisible();
});
