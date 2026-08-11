/**
 * Authed project round-trip (login build + Projects tab): save the draft as
 * a project, reload it via the ?s= URL, rename it, then delete it from tab
 * 00. Exercises the real API + RLS end-to-end with the e2e user.
 */

import { expect, test } from "@playwright/test";

test("save → reload via ?s= → rename → delete from the Projects tab", async ({ page }) => {
  await page.goto("/corridor");
  await page.getByRole("button", { name: /Start|Resume draft/ }).click();
  // Projects-first: continue the local draft to reach the input tabs.
  await page.getByRole("button", { name: "Continue editing" }).click();

  // Name + save the project from the scenario bar.
  const name = `e2e round-trip ${Date.now().toString(36)}`;
  await page.getByLabel("Scenario name").fill(name);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/corridor\?s=[0-9a-f-]{36}/);
  const url = page.url();

  // Fresh navigation to the ?s= URL loads it back (announced, never silent).
  await page.goto(url);
  await page.getByRole("button", { name: /Start|Resume draft/ }).click();
  await expect(page.getByText("Loaded", { exact: true })).toBeVisible({ timeout: 15_000 });
  // The deep link chose the project — the walk is unlocked; go to the form.
  await page.getByRole("button", { name: "01 Intro" }).click();
  await expect(page.getByLabel("Scenario name")).toHaveValue(name);

  // Tab 00 lists it, marked as the project being edited.
  await page.getByRole("button", { name: "00 Projects" }).click();
  const row = page.locator("table tr", { hasText: name });
  await expect(row).toBeVisible();
  await expect(row.getByText("(editing)")).toBeVisible();

  // Rename in place. Edit mode swaps the name text for an input, so the
  // hasText locator would stop matching — pin the editing row by its input
  // (positional locators broke when the seeded starters joined the list).
  const editRow = page
    .locator("table tbody tr")
    .filter({ has: page.locator("input") })
    .first();
  const renamed = `${name} renamed`;
  await row.getByRole("button", { name: "Rename" }).click();
  await editRow.locator("input").fill(renamed);
  await editRow.getByRole("button", { name: "Save name" }).click();
  const renamedRow = page.locator("table tr", { hasText: renamed });
  await expect(renamedRow).toBeVisible({ timeout: 15_000 });

  // Delete (confirm step included) — wait for the confirm affordance so the
  // second click cannot land on the pre-confirm button.
  await renamedRow.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(renamedRow.getByText("Delete permanently?")).toBeVisible();
  await renamedRow.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator("table tr", { hasText: renamed })).toHaveCount(0, {
    timeout: 15_000,
  });
});
