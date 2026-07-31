import { test } from "@playwright/test";
test("probe console", async ({ page }) => {
  page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE-ERR:", m.text().slice(0, 300)); });
  page.on("pageerror", (e) => console.log("PAGE-ERR:", String(e).slice(0, 400)));
  await page.goto("/corridor");
  await page.waitForTimeout(8000);
  console.log("BODY:", (await page.locator("main").innerText()).slice(0, 200));
});
