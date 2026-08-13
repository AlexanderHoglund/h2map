/**
 * Fuel Emissions Calculator: direction-first chooser, the F1
 * energy-equivalence anchor through the real UI, the not-parameterised
 * refusal, e-methanol as a certified-pathway fuel, the N2O range behavior
 * and an axe pass. The UI deliberately offers no zero N2O slip
 * (documented defaults, never zero), so the fixture-exact F1 state is
 * reached by zeroing the pilot share while the equivalence line — which
 * is slip-independent — pins the 453.7 t anchor.
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function axeClean(page: Page, context: string) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious, `${context}: ${serious.map((v) => v.id).join(", ")}`).toEqual([]);
}

test("direction chooser, energy equivalence, refusal paths and the N2O range", async ({
  page,
}) => {
  await page.goto("/fuelemissionscalculator");
  await expect(
    page.getByRole("heading", { name: "Fuel Emissions Calculator" }),
  ).toBeVisible();

  // Direction-first: no form until you decide what you're doing.
  await expect(page.getByText("What do you want to do?")).toBeVisible();
  await expect(page.getByLabel("Candidate fuel")).toHaveCount(0);
  await axeClean(page, "direction chooser");
  await page.getByRole("button", { name: /I have green fuel/ }).click();

  // Defaults: 1,000 t e-ammonia @ WtW 15 vs VLSFO with the documented 5%
  // pilot — the equivalence line shows the TOTAL energy in baseline mass.
  await expect(page.getByText(/replaces 477\.5 t/)).toBeVisible();

  // Zero the pilot (fixture F1's state): the pedagogical anchor appears —
  // 1,000 t of e-ammonia replaces 453.7 t of VLSFO, not 1,000 t.
  await page.getByText("Combustion-side corrections").click();
  const pilot = page.getByLabel("Pilot fuel share of energy");
  await pilot.fill("0");
  await expect(page.getByText(/replaces 453\.7 t/)).toBeVisible();

  // The N2O scenario is unverified and shown as a RANGE; switching the
  // scenario moves the avoided result.
  await expect(page.getByText("unverified").first()).toBeVisible();
  await expect(page.getByText(/Published range/)).toBeVisible();
  const avoided = page.locator("p.text-3xl").first();
  const before = await avoided.innerText();
  await page
    .getByLabel("Ammonia N2O slip scenario")
    .selectOption({ label: "Highest observed in the literature" });
  await expect(avoided).not.toHaveText(before);
  // The worst published slip destroys ZNZ qualification outright.
  await expect(page.getByText(/exceeds ≤19\.0/)).toBeVisible();
  await page
    .getByLabel("Ammonia N2O slip scenario")
    .selectOption({ label: "MAN / WinGD tested two-stroke engines" });
  await expect(page.getByText(/meets ≤19\.0/)).toBeVisible();

  // LNG refuses: missing upstream factor + per-engine slip — the dataset's
  // own review note renders, and no headline number is produced.
  await page.getByLabel("Candidate fuel").selectOption({ label: "Liquefied natural gas (fossil)" });
  await expect(page.getByText(/Not parameterised/)).toBeVisible();
  await expect(page.getByText(/ICCT/)).toBeVisible();
  await expect(page.locator("p.text-3xl")).toHaveCount(0);

  // e-Methanol is a certified-pathway fuel like ammonia: it COMPUTES with
  // the certified E-value (still 15 here). 1,000 t at 19,900 MJ/t =
  // 19.9e6 MJ replaces 485.4 t VLSFO (pilot still 0).
  await page.getByLabel("Candidate fuel").selectOption({ label: "e-Methanol (RFNBO)" });
  await expect(page.getByText(/replaces 485\.4 t/)).toBeVisible();
  await expect(page.locator("p.text-3xl")).toHaveCount(1);

  // Back to the ammonia anchor state.
  await page.getByLabel("Candidate fuel").selectOption({ label: "e-Ammonia (RFNBO)" });
  await expect(page.getByText(/replaces 453\.7 t/)).toBeVisible();

  // REVERSE direction via the chooser: "I want to replace 1,000 t of
  // fossil fuel" — the quantity relabels to the baseline and the line
  // flips to the required candidate mass: 41.0e6 MJ ÷ 18,600 MJ/t =
  // 2,204.3 t (pilot still 0, state survives the direction change).
  await page.getByRole("button", { name: "Change direction" }).click();
  await expect(page.getByText("What do you want to do?")).toBeVisible();
  await page.getByRole("button", { name: /Replace fossil fuel/ }).click();
  await expect(page.getByLabel(/Quantity of Very low sulphur/)).toBeVisible();
  await expect(page.getByText(/Replacing 1,000\.0 t .* needs 2,204\.3 t/)).toBeVisible();
  // Same reduction either way — intensities are per-MJ (82.2% here: the
  // tested-two-stroke slip is still selected, adding ~1.1 gCO2e/MJ).
  await expect(page.getByText(/82\.2%/)).toBeVisible();

  await axeClean(page, "fuel emissions calculator");
});
