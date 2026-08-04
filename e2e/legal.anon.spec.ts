/**
 * The legal notices must work for LOGGED-OUT visitors — they are the audience.
 * Two ways that silently breaks: forgetting the `/legal/` entry in the proxy's
 * isPublic() whitelist, or copy-pasting a content page as a template and
 * inheriting its `requireAccess()` call (which redirects independently of the
 * proxy). Both are covered here.
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PAGES = [
  { path: "/legal/privacy", heading: "Privacy policy" },
  { path: "/legal/cookies", heading: "Cookies & local storage" },
] as const;

for (const { path, heading } of PAGES) {
  test(`${path} is public and axe-clean`, async ({ page }) => {
    await page.goto(path);
    await expect(page).not.toHaveURL(/\/\?next=/);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(serious, serious.map((v) => `${v.id} (${v.impact})`).join(", ")).toEqual([]);
  });

  test(`${path} has no unfilled placeholders`, async ({ page }) => {
    // The deploy blocker: CONTROLLER still holds «TODO: …» values until someone
    // fills in the entity name, address, contact and supervisory authority.
    await page.goto(path);
    expect(await page.locator("body").innerText()).not.toContain("TODO");
  });
}

test("the cookie notice lists every key we actually store", async ({ page }) => {
  // Not a detector for NEW keys (only a human walkthrough catches those), but
  // it keeps the inventory honest about the ones we know about.
  await page.goto("/legal/cookies");
  const text = await page.locator("body").innerText();
  expect(text).toContain("sb-");
  expect(text).toContain("code-verifier");
  expect(text).toContain("corridor-draft-v2");
});

test("the landing links an anonymous visitor to both notices", async ({ page }) => {
  // The landing is fixed-height and cannot take the shared Footer, so it
  // carries its own links — the bit most likely to be lost in a redesign.
  await page.goto("/");
  await expect(page.locator('a[href="/legal/cookies"]')).toBeVisible();

  await page.locator('a[href="/legal/privacy"]').click();
  await expect(page.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeVisible();
});

test("a restricted referrer policy is served", async ({ page }) => {
  // Stops a share token in the path of /corridor/s/<token>, and the ?c=
  // scenario blob, reaching the tile hosts' access logs via Referer.
  const res = await page.goto("/");
  expect(res?.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
});
