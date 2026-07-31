/**
 * Full-app golden (build-plan 4.4): drive the default corridor scenario
 * through the real UI and assert the workbook's headline numbers — the same
 * values the engine golden fixture pins at 1e-9, now proven end-to-end
 * through form → client-side engine → results panel. Plus an axe-core pass
 * (serious/critical) over the entry screen and all five steps (3.x
 * acceptance).
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const STEPS = ["Cargo & Corridor", "Vessel", "Fuel", "Port", "Regulation"];

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

test("default scenario reproduces the workbook's golden numbers", async ({ page }) => {
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

  // Headline golden numbers, straight from the untouched default form:
  // gap PV 166.95059118904504 → "$166.95m"; 376.57…/unit → "$377".
  // $/tCO2 uses the app's WELL-TO-WAKE default (D1): 74,304 t abated →
  // 2246.86 → "$2,247" (the workbook's TTW basis shows "$2,267" and stays
  // selectable in Model options — the engine golden pins it exactly).
  // The gap shows twice by design (top-bar chip + summary headline) —
  // scope the golden assertions to the docked COMPACT summary.
  const results = page.getByRole("complementary");
  await expect(results.getByText("$166.95m")).toBeVisible();
  await expect(results.getByText("$377", { exact: true })).toBeVisible();
  await expect(results.getByText("$2,247", { exact: true })).toBeVisible();
  await expect(results.getByText("well-to-wake basis")).toBeVisible();
  // Side totals (Output rows 8–9).
  await expect(results.getByText("$205.60m")).toBeVisible();
  await expect(results.getByText("$38.64m")).toBeVisible();

  // The FULL panel lives in its own Results tab (06): lifetime cargo
  // (row 80) renders only there, with the waterfall + per-year chart.
  await page.getByRole("button", { name: "06 Results" }).click();
  const full = page.getByRole("main");
  await expect(full.getByText("$166.95m")).toBeVisible();
  await expect(full.getByText("443,340")).toBeVisible();
  await expectNoSeriousViolations(page, "results tab");

  // Walk all five steps; results stay docked; axe on each.
  for (const [i, label] of STEPS.entries()) {
    await page.getByRole("button", { name: `0${i + 1} ${label}` }).click();
    await expect(results.getByText("$166.95m")).toBeVisible();
    await expectNoSeriousViolations(page, `step ${label}`);
  }

  // A live-model probe: overriding the green fuel price moves the gap.
  await page.getByRole("button", { name: "03 Fuel" }).click();
  const price = page.getByLabel("Fuel price").first();
  await price.fill("1200");
  await expect(page.getByText("$166.95m")).toHaveCount(0);
  await price.fill(""); // restore benchmark
  await expect(results.getByText("$166.95m")).toBeVisible();
});
