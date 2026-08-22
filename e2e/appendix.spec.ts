/**
 * The Results Appendix: the abatement cost written out symbolically and
 * with substituted values, closing on the EXACT headline figure. The
 * closure assertion re-runs the printed arithmetic in the test — if the
 * substituted operands could not reproduce the printed result, the whole
 * feature would be decoration.
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

test("the appendix derives the exact abatement cost from substituted values", async ({
  page,
}) => {
  await openExample(page);
  await useStandard(page);
  await page.getByRole("button", { name: "08 Results" }).click();

  const appendix = page.locator("section", {
    hasText: "Appendix - the abatement cost, worked",
  }).last();
  await appendix.scrollIntoViewIfNeeded();
  await expect(appendix).toBeVisible();

  // Row 1 — symbolic, shaped by the scenario: the identity, the
  // well-to-wake denominator (the example's basis), and the disabled
  // schemes named as omitted rather than silently absent.
  await expect(appendix.getByText(/PV_green − PV_fossil/).first()).toBeVisible();
  await expect(appendix.getByText(/well-to-wake/).first()).toBeVisible();
  await expect(appendix.getByText(/Omitted \(disabled/).first()).toBeVisible();
  await expect(appendix.getByText(/EU ETS/).first()).toBeVisible();

  // Row 2 — substituted: the example overrides its burns, so the
  // consumption line must say so instead of faking a derivation.
  await expect(appendix.getByText(/\(your override\)/).first()).toBeVisible();

  // Every cost aspect is a VISIBLE term: fleet, production, port storage
  // and barges appear in both sides' CAPEX and OPEX expansions, and the
  // green CAPEX line carries the example's actual components
  // (10×44 fleet + 1,100 production + 150 port storage + 0 barges = 1,690).
  await expect(
    appendix.getByText(/CAPEX_green = vessels×capex\/ship \+ production \+ port storage \+ barges/),
  ).toBeVisible();
  await expect(appendix.getByText(/10×44 .* \+ 150 .* = 1,690/)).toBeVisible();
  await expect(
    appendix.getByText(/OPEX_fossil {2}= FUEL_fossil \+ vessels×opex\/ship \+ production \+ port storage \+ barges/),
  ).toBeVisible();

  // The exact figure: matches the engine headline to the dollar…
  const exactEl = page.getByTestId("appendix-abatement-exact");
  const exactText = (await exactEl.textContent())!;
  expect(exactText).toMatch(/^\$1,637\.8/);
  await expect(appendix.getByText(/headline shows \$1,638/)).toBeVisible();

  // …and the printed arithmetic actually reproduces it. Parse the final
  // line's operands (gap $m × 10⁶ ÷ abated t) and re-run the quotient.
  const finalLine = (await appendix
    .locator("div.font-mono")
    .last()
    .textContent())!;
  const m = finalLine.match(
    /\$\/tCO2 abated = ([\d,.]+) × 10⁶ ÷ ([\d,.]+) = \$([\d,.]+)/,
  );
  expect(m, `final line parse: ${finalLine.slice(-200)}`).not.toBeNull();
  const num = (s: string) => Number(s.replace(/,/g, ""));
  const recomputed = (num(m![1]) * 1e6) / num(m![2]);
  const printed = num(m![3]);
  expect(Math.abs(recomputed - printed) / printed).toBeLessThan(1e-6);

  await appendix.screenshot({ path: "shots/appendix.png" });
});
