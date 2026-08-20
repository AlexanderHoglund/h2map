/**
 * A schema-invalid value must never blank the form (the "field closes down"
 * bug): typing 0 into a capital-phasing weight breaks the sum-to-1 rule,
 * resolution throws, and before the fix `resolved` went null — unmounting
 * the WACC field and the entire Vessels/Energy/Ports tab contents while the
 * user was still typing. The right behavior is the calculator's: the field
 * stays exactly where it is and turns red, the message names the rule, and
 * the rest of the form keeps rendering on the last good resolution.
 */

import { expect, test, type Page } from "@playwright/test";

/** Ensure Standard mode (one-way upgrade; no-op when already Standard). */
async function useStandard(page: Page) {
  const banner = page.getByRole("banner");
  const upgrade = banner.getByRole("button", { name: "Upgrade to Standard" });
  if (await upgrade.isVisible().catch(() => false)) {
    page.once("dialog", (d) => void d.accept());
    await upgrade.click();
  }
  await expect(banner.getByText("Standard", { exact: true })).toBeVisible();
}

/** Open the seeded Chilean example (see corridor.spec.ts). */
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

test("a zeroed phasing weight lights the field red instead of blanking the form", async ({
  page,
}) => {
  await openExample(page);
  await useStandard(page);

  await page.getByRole("button", { name: "06 Financing" }).click();
  const wacc = page.getByLabel(/Discount rate \(WACC\)/);
  await expect(wacc).toBeVisible();

  // The SwitchRow's wrapping <label> names the row, not the button — target
  // the switch through its row.
  await page
    .locator("label", { hasText: "Capital deployment schedule" })
    .getByRole("switch")
    .click();
  const weight = page.getByLabel(/Green share, year 1/);
  await expect(weight).toBeVisible();

  // Zero the only weight: the green shares now sum to 0, the scenario stops
  // resolving — and the form must NOT disappear.
  await weight.fill("0");

  // The field stays mounted, turns red, and the message names the rule.
  await expect(weight).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText(/shares must sum to 1/)).toBeVisible();
  // The resolved-backed WACC field above it survives on the last good
  // resolution (it used to unmount with the whole grid).
  await expect(wacc).toBeVisible();

  // The other tabs keep their forms too (they bail out without `resolved`).
  await page.getByRole("button", { name: "02 Vessels" }).click();
  await expect(page.getByLabel(/Roundtrips per year/)).toBeVisible();
  await page.getByRole("button", { name: "06 Financing" }).click();

  // Repairing the weight restores a clean scenario in place.
  await page.getByLabel(/Green share, year 1/).fill("1");
  await expect(page.getByText(/shares must sum to 1/)).toBeHidden();
  await expect(page.getByLabel(/Green share, year 1/)).not.toHaveAttribute(
    "aria-invalid",
    "true",
  );
});
