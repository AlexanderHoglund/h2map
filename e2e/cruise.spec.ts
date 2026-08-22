/**
 * Cruise ships in the corridor UI (bundle 2026-08-21-cruise-v6): a cruise
 * row is selectable, announces its hotel third term, the passenger cargo
 * unit hides the weight field and relabels the per-unit KPI, and results
 * keep computing — a deployment loop is just a corridor whose cargo is
 * passenger-trips.
 */

import { expect, test, type Page } from "@playwright/test";

async function useStandard(page: Page) {
  const banner = page.getByRole("banner");
  const upgrade = banner.getByRole("button", { name: "Upgrade to Standard" });
  if (await upgrade.isVisible().catch(() => false)) {
    page.once("dialog", (d) => void d.accept());
    await upgrade.click();
  }
  await expect(banner.getByText("Standard", { exact: true })).toBeVisible();
}

async function openExample(page: Page) {
  await page.goto("/corridor");
  await page.getByRole("button", { name: /Start|Resume draft/ }).click();
  const row = page
    .getByRole("row", { name: /Example — Chilean copper corridor/ })
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

test("a cruise deployment loop: hotel term visible, passenger unit, results compute", async ({
  page,
}) => {
  await openExample(page);
  await useStandard(page);
  const results = page.getByRole("complementary");

  // Select the premium cruise class on the Vessels tab; the hotel third
  // term must be announced, not silent.
  await page.getByRole("button", { name: "03 Vessels" }).click();
  const vessel = page.getByLabel(/Vessel type/);
  await vessel.selectOption("cruise-premium-2400");
  await expect(page.getByText(/928 GJ\/day hotel load/)).toBeVisible();
  await expect(results.getByText(/\$[\d,.]+m/).first()).toBeVisible();

  // Cargo tab: pick the passenger unit — weight is not a passenger
  // attribute, so the weight field must hide.
  await page.getByRole("button", { name: "02 Cargo" }).click();
  const unit = page.getByLabel(/Cargo unit/);
  await unit.selectOption("passenger");
  await expect(page.getByLabel("Weight per unit")).toHaveCount(0);

  // The per-unit KPI reads passenger-trips, and the model keeps computing.
  await expect(results.getByText("per passenger-trip")).toBeVisible();
  await expect(results.getByText(/\$[\d,.]+m/).first()).toBeVisible();

  // Leave the shared seeded example as found: bulker + tonne unit.
  await unit.selectOption("tonne");
  await page.getByRole("button", { name: "03 Vessels" }).click();
  await vessel.selectOption("bulk-handymax-58k");
  await expect(results.getByText(/\$[\d,.]+m/).first()).toBeVisible();
});
