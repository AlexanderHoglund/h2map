/**
 * Authed scenario round-trip (login build): save the default draft to the
 * account, reload it via the ?s= URL, then delete it through the Manage
 * modal. Exercises the real API + RLS end-to-end with the e2e user.
 */

import { expect, test } from "@playwright/test";

test("save → reload via ?s= → delete through Manage", async ({ page }) => {
  await page.goto("/corridor");
  await page.getByRole("button", { name: /Start|Resume draft/ }).click();

  // Name + save the scenario.
  const name = `e2e round-trip ${Date.now().toString(36)}`;
  const nameInput = page.getByLabel("Scenario name");
  await nameInput.fill(name);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/corridor\?s=[0-9a-f-]{36}/);
  const url = page.url();

  // Fresh navigation to the ?s= URL loads it back (announced, never silent).
  await page.goto(url);
  await page.getByRole("button", { name: /Start|Resume draft/ }).click();
  await expect(page.getByText("Loaded", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel("Scenario name")).toHaveValue(name);

  // Delete via the Manage modal (confirm step included).
  await page.getByRole("button", { name: "Manage…" }).click();
  const dialog = page.getByRole("dialog", { name: "My scenarios" });
  await expect(dialog.getByText(name, { exact: true })).toBeVisible();
  const row = dialog.locator("tr", { hasText: name });
  await row.getByRole("button", { name: "Delete…" }).click();
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialog.getByText(name, { exact: true })).toHaveCount(0, { timeout: 15_000 });
});
