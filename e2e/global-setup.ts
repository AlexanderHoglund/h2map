import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type FullConfig } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * e2e auth strategy (login build): the app is gated, so specs run with a
 * pre-authenticated storageState. This setup:
 *   1. creates a confirmed throwaway user (+ an admin) via the service-role
 *      admin API against the LIVE dev Supabase project (.env.local — the
 *      old "dummy Supabase env suffices" note no longer holds),
 *   2. signs each in through the real landing UI on :3100,
 *   3. saves cookie storageState to e2e/.auth/ (gitignored).
 * globalTeardown deletes the users. User ids are passed to teardown via
 * e2e/.auth/users.json.
 */

// Playwright transpiles this file as CJS — no import.meta here.
const ROOT = join(__dirname, "..");

export function envLocal(): Record<string, string> {
  const text = readFileSync(join(ROOT, "apps/web/.env.local"), "utf8");
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]!] = m[2]!;
  }
  return out;
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SECRET_KEY: secret } = envLocal();
  if (!url || !secret) {
    throw new Error(
      "e2e requires apps/web/.env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY (the app is auth-gated)",
    );
  }
  const admin = createClient(url, secret, { auth: { persistSession: false } });
  const baseURL =
    config.projects[0]?.use?.baseURL ?? "http://127.0.0.1:3100";

  mkdirSync(join(ROOT, "e2e/.auth"), { recursive: true });
  const suffix = Date.now().toString(36);
  const created: { id: string }[] = [];

  const mint = async (kind: "user" | "admin") => {
    const email = `e2e-${kind}-${suffix}@example.com`;
    const password = `e2e-${crypto.randomUUID()}`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `E2E ${kind}`, organisation: "Thaduberg e2e" },
    });
    if (error) throw new Error(`createUser ${email}: ${error.message}`);
    created.push({ id: data.user.id });
    if (kind === "admin") {
      // Tolerated pre-migration: the profiles table may not exist yet; the
      // admin specs then skip on the missing /admin capability.
      const { error: e2 } = await admin
        .from("profiles")
        .update({ is_admin: true })
        .eq("id", data.user.id);
      if (e2) console.warn(`[e2e setup] admin flag not set (${e2.message})`);
    }

    // Sign in through the real landing UI and capture the cookie session.
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(baseURL + "/");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/corridor", { timeout: 30_000 });
    await page
      .context()
      .storageState({ path: join(ROOT, "e2e", ".auth", `${kind}.json`) });
    await browser.close();
  };

  await mint("user");
  await mint("admin");

  writeFileSync(join(ROOT, "e2e", ".auth", "users.json"), JSON.stringify(created));
}
