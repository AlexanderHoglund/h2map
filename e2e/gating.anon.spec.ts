/**
 * Anonymous gating (login build): every platform page redirects to the
 * landing with a return-to; the shared-scenario viewer stays public (the
 * revocable token IS the capability); the landing itself is accessible and
 * axe-clean.
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("gated pages redirect anonymous visitors to the landing", async ({ page }) => {
  await page.goto("/corridor");
  await expect(page).toHaveURL(/\/\?next=%2Fcorridor/);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();

  await page.goto("/docs");
  await expect(page).toHaveURL(/\/\?next=%2Fdocs/);

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/\?next=%2Fadmin/);
});

test("the shared-scenario viewer is NOT gated", async ({ page }) => {
  // An unknown token renders the viewer's own not-found state — the point is
  // that the proxy does not redirect to the landing.
  await page.goto("/corridor/s/e2e-fake-token-1234567890");
  await expect(page).not.toHaveURL(/\/\?next=/);
});

test("the landing is public and axe-clean", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "Request access" })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(
    serious,
    serious.map((v) => `${v.id} (${v.impact})`).join(", "),
  ).toEqual([]);
});
