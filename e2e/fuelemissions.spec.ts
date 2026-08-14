/**
 * Fuel Emissions Calculator: the direction dropdown (default: from
 * fossil to ZNZ fuel), the F1 energy-equivalence anchor through the real
 * UI, the not-parameterised refusal, e-methanol as a certified-pathway
 * fuel, the N2O range behavior, the citation method line and an axe
 * pass. The UI deliberately offers no zero N2O slip (documented
 * defaults, never zero), so the fixture-exact F1 state is reached by
 * zeroing the pilot share while the equivalence line — which is
 * slip-independent — pins the 453.7 t anchor.
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

test("direction dropdown, energy equivalence, refusal paths and the N2O range", async ({
  page,
}) => {
  await page.goto("/fuelemissionscalculator");
  await expect(
    page.getByRole("heading", { name: "Fuel Emissions Calculator" }),
  ).toBeVisible();
  // Reachable from the top menu (and gated by requireAccess server-side).
  await expect(
    page.getByRole("link", { name: "Fuel Emissions Calculator" }),
  ).toBeVisible();

  // Default direction: from fossil to ZNZ. 1,000 t of HFO (40.5e6 MJ)
  // with the documented 5% pilot needs 40.5e6 × 0.95 ÷ 18,600 =
  // 2,068.5 t of e-ammonia — the fuel-needed stat leads the results.
  await expect(page.getByLabel("Direction")).toHaveValue("baseline");
  await expect(page.getByLabel(/Quantity of Heavy fuel oil/)).toBeVisible();
  await expect(page.getByText("ZNZ fuel needed")).toBeVisible();
  await expect(page.getByTestId("mass-hero")).toContainText("2,068.5");
  await expect(page.getByText(/needs 2,068\.5 t/)).toBeVisible();

  // The one-line method reference is present and citation-ready.
  await expect(page.getByText(/Method: energy-delivered/)).toBeVisible();
  await expect(page.getByText(/2023\/1805/)).toBeVisible();

  // Fix 6 + round-2 E: the WtT inversion is surfaced PER MJ — the
  // candidate side's upstream (incl. the pilot's) is 14.97 gCO2e/MJ vs
  // the baseline's 13.50; the saving is entirely combustion-side.
  await expect(page.getByText(/upstream intensity is 14\.97/)).toBeVisible();

  // Switch to the ZNZ-first direction: the quantity relabels to the
  // candidate and the classic forward equivalence shows (5% pilot).
  await page
    .getByLabel("Direction")
    .selectOption({ label: "From ZNZ fuel to fossil" });
  await expect(page.getByLabel(/Quantity of e-Ammonia/)).toBeVisible();
  await expect(page.getByText(/replaces 483\.4 t/)).toBeVisible();

  // Zero the pilot (fixture F1's state): the pedagogical anchor appears —
  // 1,000 t of e-ammonia replaces 459.3 t of HFO, not 1,000 t.
  await page.getByText("Combustion-side corrections").click();
  const pilot = page.getByLabel("Pilot fuel share of energy");
  await pilot.fill("0");
  await expect(page.getByText(/replaces 459\.3 t/)).toBeVisible();

  // The N2O scenario is unverified and shown as a RANGE; switching the
  // scenario moves the avoided result.
  await expect(page.getByText("unverified").first()).toBeVisible();
  await expect(page.getByText(/Published range/)).toBeVisible();
  const avoided = page.getByTestId("avoided");
  const before = await avoided.innerText();
  await page
    .getByLabel("Ammonia N2O slip scenario")
    .selectOption({ label: "Highest observed in the literature" });
  await expect(avoided).not.toHaveText(before);
  await page
    .getByLabel("Ammonia N2O slip scenario")
    .selectOption({ label: "MAN / WinGD tested two-stroke engines" });

  // ZNZ is the IMO's concept — no status row under FuelEU. Under the IMO
  // framework the user picks the period; the threshold steps 19.0 → 14.0
  // and the certified-intensity DEFAULT follows it (15 → 8, since 15 can
  // never clear 14.0), so the reference case stays a compliant pathway.
  await expect(page.getByTestId("znz")).toHaveCount(0);
  await page
    .getByLabel("Accounting framework")
    .selectOption({ label: "IMO Net-Zero (AR5 · provisional)" });
  await expect(page.getByTestId("znz")).toContainText("Yes");
  // Fix 5: the verdict tests the FUEL's own WtW intensity (shown in
  // the row), never the blended attained GFI.
  await expect(page.getByTestId("znz")).toContainText("fuel 15.97 gCO2e/MJ");
  await expect(page.getByText(/Attained GFI/)).toBeVisible();
  // Round 2 (A/B/C): the IMO has its OWN fossil WtT, binned by sulphur —
  // the baseline renames to the band, a sulphur input appears, and with
  // no pilot burning (share 0) NOTHING is substituted: no blanket claim.
  await expect(page.getByLabel("Baseline sulphur content")).toBeVisible();
  await expect(page.getByText("Residual fuel oil, 0.10–0.50% S").first()).toBeVisible();
  await expect(page.getByText(/Substituted from FuelEU Annex II/)).toHaveCount(0);
  // Under IMO's heavier fossil upstream (16.8) the inversion REVERSES —
  // the note must not assert an inversion that isn't there.
  await expect(page.getByText(/upstream intensity is/)).toHaveCount(0);
  await page.getByLabel("ZNZ period").selectOption({ label: "From 2035" });
  // The certified field is WELL-TO-TANK (fix 3 of the verification
  // report): entering a WtW certificate would double-count the N2O slip.
  const certified = page.getByRole("textbox", {
    name: /Certified pathway intensity \(well-to-tank\)/,
  });
  await expect(certified).toHaveValue(/^8/);
  await expect(page.getByTestId("znz")).toContainText("Yes");
  // Back to FuelEU: the certified default returns to 15 with the switch.
  await page
    .getByLabel("Accounting framework")
    .selectOption({ label: "FuelEU Maritime (AR4)" });
  await expect(certified).toHaveValue(/^15/);

  // LNG computes under FuelEU per engine technology (slip is THE lever):
  // 1,000 t at 49,100 MJ/t replaces 1,212.3 t of HFO (pilot still 0).
  await page.getByLabel("Candidate fuel").selectOption({ label: "Liquefied natural gas (fossil)" });
  await expect(page.getByLabel("LNG engine type")).toBeVisible();
  await expect(page.getByText(/replaces 1,212\.3 t/)).toBeVisible();
  // Under the IMO framework it still refuses — no default upstream factor
  // (ICCT), and the FuelEU WtT is never borrowed. No headline number.
  await page
    .getByLabel("Accounting framework")
    .selectOption({ label: "IMO Net-Zero (AR5 · provisional)" });
  await expect(page.getByText(/Not parameterised/)).toBeVisible();
  await expect(page.getByText(/ICCT/)).toBeVisible();
  await expect(page.locator("p.text-3xl")).toHaveCount(0);
  await page
    .getByLabel("Accounting framework")
    .selectOption({ label: "FuelEU Maritime (AR4)" });

  // e-Methanol is a certified-pathway fuel like ammonia: it COMPUTES with
  // the certified E-value (still 15 here). 1,000 t at 19,900 MJ/t =
  // 19.9e6 MJ replaces 491.4 t HFO (pilot still 0).
  await page.getByLabel("Candidate fuel").selectOption({ label: "e-Methanol (RFNBO)" });
  await expect(page.getByText(/replaces 491\.4 t/)).toBeVisible();
  await expect(page.getByTestId("avoided")).toBeVisible();

  // Back to the ammonia anchor state.
  await page.getByLabel("Candidate fuel").selectOption({ label: "e-Ammonia (RFNBO)" });
  await expect(page.getByText(/replaces 459\.3 t/)).toBeVisible();

  // Back to fossil-first: "I want to replace 1,000 t of fossil fuel" —
  // the required candidate mass is 40.5e6 MJ ÷ 18,600 MJ/t = 2,177.4 t
  // (pilot still 0, state survives the direction change).
  await page
    .getByLabel("Direction")
    .selectOption({ label: "From fossil to zero / near-zero (ZNZ) fuel" });
  await expect(page.getByLabel(/Quantity of Heavy fuel oil/)).toBeVisible();
  await expect(page.getByText(/Replacing 1,000\.0 t .* needs 2,177\.4 t/)).toBeVisible();
  await expect(page.getByText("ZNZ fuel needed")).toBeVisible();
  // Same reduction either way — intensities are per-MJ (82.5% here: the
  // tested-two-stroke slip is still selected, adding ~1.1 gCO2e/MJ).
  await expect(page.getByText(/82\.5%/)).toBeVisible();

  // Reset restores every default in one click — the documented 5% pilot
  // returns, so 1,000 t of HFO needs 2,068.5 t again.
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByLabel("Direction")).toHaveValue("baseline");
  await expect(page.getByText(/needs 2,068\.5 t/)).toBeVisible();

  await axeClean(page, "fuel emissions calculator");
});
