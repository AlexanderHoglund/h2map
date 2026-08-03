import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { envLocal } from "./global-setup";

const ROOT = join(__dirname, "..");

/** Delete the throwaway e2e users minted by global-setup. */
export default async function globalTeardown(): Promise<void> {
  const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SECRET_KEY: secret } = envLocal();
  if (!url || !secret) return;
  const admin = createClient(url, secret, { auth: { persistSession: false } });
  try {
    const users = JSON.parse(
      readFileSync(join(ROOT, "e2e", ".auth", "users.json"), "utf8"),
    ) as { id: string }[];
    for (const u of users) {
      await admin.auth.admin.deleteUser(u.id).catch(() => {});
    }
  } catch {
    // no users file — setup failed before minting; nothing to clean
  }
  rmSync(join(ROOT, "e2e", ".auth"), { recursive: true, force: true });
}
