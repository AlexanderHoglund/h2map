import { expect, test } from "@playwright/test";

// Plant a cookie whose refresh token the server will reject, then confirm the
// proxy clears it instead of retrying it on every navigation.
test.use({ storageState: { cookies: [], origins: [] } });

test("a stale refresh token is cleared, not retried forever", async ({ page, context, baseURL }) => {
  const ref = new URL(process.env.SB_URL ?? "https://vbsfniydnuovmhnlusms.supabase.co").hostname.split(".")[0];
  const payload = JSON.stringify({
    access_token: "expired.jwt.value",
    refresh_token: "definitely-not-valid",
    expires_at: Math.floor(Date.now() / 1000) - 3600,
    token_type: "bearer",
    user: { id: "00000000-0000-0000-0000-000000000000" },
  });
  const cookieName = `sb-${ref}-auth-token`;
  await context.addCookies([{
    name: cookieName,
    value: `base64-${Buffer.from(payload).toString("base64")}`,
    url: baseURL!,
  }]);

  // Gated page with a dead session → treated as anonymous, sent to landing.
  await page.goto("/corridor");
  await expect(page).toHaveURL(/\/\?next=%2Fcorridor/);

  // THE POINT: the bad cookie is gone, so the next navigation cannot repeat it.
  const after = (await context.cookies()).filter((c) => c.name.startsWith(`sb-${ref}-auth-token`));
  console.log("stale auth cookies remaining:", after.length);
  expect(after).toHaveLength(0);
});

test("after the clear, later navigations are clean (no recurrence)", async ({ page, context, baseURL }) => {
  const ref = new URL(process.env.SB_URL ?? "https://vbsfniydnuovmhnlusms.supabase.co").hostname.split(".")[0];
  await context.addCookies([{
    name: `sb-${ref}-auth-token`,
    value: "base64-" + Buffer.from(JSON.stringify({
      access_token: "x.y.z", refresh_token: "dead",
      expires_at: Math.floor(Date.now() / 1000) - 3600, token_type: "bearer",
      user: { id: "00000000-0000-0000-0000-000000000000" },
    })).toString("base64"),
    url: baseURL!,
  }]);

  await page.goto("/corridor");                       // 1st hit: clears the cookie
  await page.goto("/corridor");                       // 2nd hit: must not re-send it
  await page.goto("/");                               // 3rd: landing renders signed-out
  await expect(page).toHaveURL(/\/$|\/\?/);
  await expect(page.getByRole("button", { name: /sign in/i }).first()).toBeVisible();
  expect((await context.cookies()).filter((c) => c.name.includes("auth-token"))).toHaveLength(0);
});
