/**
 * §29's tornado must be readable as a FIGURE: the long coupling-group label
 * ("Delivered energy demand (one bar: corridor length, roundtrips per year,
 * … move together)") once carried whitespace-nowrap, which stretched the
 * label column to the text's full unwrapped width and shoved the bar track
 * out of the viewport behind a horizontal scrollbar. The label now wraps in
 * a bounded column, so the whole figure fits and the bars keep their width.
 */

import { expect, test } from "@playwright/test";

test("the tornado fits its container and the bars keep their width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/docs");

  // The tornado's rows are the ones that carry a bar TRACK (the lead impact
  // table higher up shares the "Delivered energy demand" label but has no
  // bars — "one row:" there vs the tornado's "one bar:").
  const row = page
    .getByRole("row", { name: /Delivered energy demand/ })
    .filter({ has: page.locator("span.bg-neutral-100") })
    .first();
  await row.scrollIntoViewIfNeeded();
  await expect(row).toBeVisible();

  // The figure never scrolls sideways at a desktop viewport…
  const scroller = page
    .locator("div.overflow-x-auto", { has: row })
    .first();
  const fits = await scroller.evaluate(
    (el) => el.scrollWidth <= el.clientWidth + 1,
  );
  expect(fits, "tornado table overflows horizontally").toBe(true);

  // …and the bar track of the long-labeled row keeps real width.
  const track = row.locator("span.bg-neutral-100").first();
  const box = await track.boundingBox();
  expect(box, "bar track not rendered").not.toBeNull();
  expect(box!.width).toBeGreaterThan(300);

  await scroller.screenshot({ path: "shots/docs-tornado.png" });
});
