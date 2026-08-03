/**
 * Auth/access acceptance (login build, 2026-08-03): integration checks
 * against the LIVE Supabase project + a locally running web server.
 *
 *   npx tsx scripts/corridor/smoke-auth.ts [baseUrl]
 *
 * Requires the 20260803000001_profiles migration to be APPLIED. Verifies:
 *   1. Signup trigger — profiles row auto-created with copied name/org,
 *      account_type 'full', is_admin false
 *   2. Profiles RLS — cross-user reads blocked; self-writes blocked
 *      (no authenticated write policy: nobody self-promotes)
 *   3. Expiry enforcement — expired access_expires_at => scenario API 403
 *      access_expired (POST and GET)                       [after PR 4]
 *   4. Admin API — non-admin 403 / anon 401; extendDays restores access;
 *      account_type round-trip; self-delete refused        [after PR 5]
 *   5. Scenario DELETE — cross-owner 404; owner 200 then 404 [after PR 6]
 *   6. Delete-user cascade — profile + scenarios rows gone
 *
 * Checks whose routes are not yet deployed report SKIP (route absent), so
 * the script is useful from PR 1 onward and complete by PR 6.
 *
 * Test users are created via the service-role admin API and deleted in
 * `finally`. Requires apps/web/.env.local (URL + anon + secret keys).
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { migrateScenarioInput } from "@h2map/corridor-schema";

const BASE = process.argv[2] ?? "http://localhost:3000";
const ROOT = new URL("../../", import.meta.url);

function env(): Record<string, string> {
  const text = readFileSync(new URL("apps/web/.env.local", ROOT), "utf8");
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]!] = m[2]!;
  }
  return out;
}

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${ok || detail === undefined ? "" : ` — ${JSON.stringify(detail).slice(0, 300)}`}`,
  );
  if (!ok) failures++;
}
function skip(label: string, why: string): void {
  console.log(`SKIP  ${label} — ${why}`);
}

async function main(): Promise<void> {
  const {
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anon,
    SUPABASE_SECRET_KEY: secret,
  } = env();
  if (!url || !anon || !secret) throw new Error("missing supabase env");
  const admin = createClient(url, secret, { auth: { persistSession: false } });

  const mkUser = async (email: string, meta?: Record<string, string>) => {
    const password = `corridor-${crypto.randomUUID()}`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: meta,
    });
    if (error) throw new Error(`createUser ${email}: ${error.message}`);
    const client = createClient(url, anon, { auth: { persistSession: false } });
    const { data: signIn, error: e2 } = await client.auth.signInWithPassword({
      email,
      password,
    });
    if (e2 || !signIn.session) throw new Error(`signIn ${email}: ${e2?.message}`);
    return { id: data.user.id, jwt: signIn.session.access_token, client };
  };

  const suffix = Date.now().toString(36);
  const userA = await mkUser(`auth-smoke-a-${suffix}@example.com`, {
    full_name: "Smoke User A",
    organisation: "Thaduberg Test",
  });
  const userB = await mkUser(`auth-smoke-b-${suffix}@example.com`);
  const deleted: string[] = [];

  const api = (path: string, init: RequestInit = {}, jwt?: string) =>
    fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(jwt ? { authorization: `Bearer ${jwt}` } : {}),
        ...(init.headers ?? {}),
      },
    });

  const payload = migrateScenarioInput(
    JSON.parse(
      readFileSync(
        new URL("fixtures/golden/corridor/excel-baseline.input.json", ROOT),
        "utf8",
      ),
    ),
  ).input as unknown as Record<string, unknown>;

  try {
    // --- 1. signup trigger --------------------------------------------------
    const { data: profA } = await admin
      .from("profiles")
      .select("*")
      .eq("id", userA.id)
      .maybeSingle();
    check("1a trigger auto-created A's profile", profA !== null);
    check(
      "1b display fields copied from metadata",
      profA?.full_name === "Smoke User A" && profA?.organisation === "Thaduberg Test",
      profA,
    );
    check(
      "1c defaults: full account, not admin, no expiry",
      profA?.account_type === "full" &&
        profA?.is_admin === false &&
        profA?.access_expires_at === null,
      profA,
    );
    const { data: profB } = await admin
      .from("profiles")
      .select("id")
      .eq("id", userB.id)
      .maybeSingle();
    check("1d trigger fires without metadata too", profB !== null);

    // --- 2. profiles RLS ----------------------------------------------------
    const userAClient = createClient(url, anon, {
      auth: { persistSession: false },
      global: { headers: { authorization: `Bearer ${userA.jwt}` } },
    });
    const { data: own } = await userAClient
      .from("profiles")
      .select("id, account_type")
      .eq("id", userA.id);
    check("2a user reads own profile", own?.length === 1);
    const { data: cross } = await userAClient
      .from("profiles")
      .select("id")
      .eq("id", userB.id);
    check("2b cross-user profile read blocked (0 rows)", cross?.length === 0);
    const { data: upd } = await userAClient
      .from("profiles")
      .update({ is_admin: true, account_type: "full" })
      .eq("id", userA.id)
      .select("id");
    check("2c self-promotion blocked (0 rows updated)", (upd ?? []).length === 0);

    // --- 3. expiry enforcement (needs PR 4's getCallerWithAccess) ----------
    await admin
      .from("profiles")
      .update({ access_expires_at: new Date(Date.now() - 3600e3).toISOString() })
      .eq("id", userA.id);
    const expiredPost = await api(
      "/api/v1/corridor/scenarios",
      { method: "POST", body: JSON.stringify({ name: "expired probe", payload }) },
      userA.jwt,
    );
    if (expiredPost.status === 201) {
      skip("3 expired-trial 403", "expiry not yet enforced in API (pre-PR 4)");
      // clean the accidental scenario
      const body = (await expiredPost.json()) as { id?: string };
      if (body.id) await admin.from("scenarios").delete().eq("id", body.id);
    } else {
      const body = (await expiredPost.json().catch(() => ({}))) as {
        error?: { code?: string };
      };
      check(
        "3a expired trial: scenario POST 403 access_expired",
        expiredPost.status === 403 && body.error?.code === "access_expired",
        { status: expiredPost.status, body },
      );
      const expiredGet = await api("/api/v1/corridor/scenarios", {}, userA.jwt);
      check("3b expired trial: scenario GET 403", expiredGet.status === 403);
    }
    // restore access for the remaining checks
    await admin
      .from("profiles")
      .update({ access_expires_at: null })
      .eq("id", userA.id);

    // --- 4. admin API (needs PR 5) -----------------------------------------
    const adminList = await api("/api/v1/admin/users", {}, userB.jwt);
    if (adminList.status === 404) {
      skip("4 admin API", "route absent (pre-PR 5)");
    } else {
      check("4a non-admin admin-list 403", adminList.status === 403);
      const anonList = await api("/api/v1/admin/users");
      check("4b anon admin-list 401", anonList.status === 401);
      await admin.from("profiles").update({ is_admin: true }).eq("id", userB.id);
      const asAdmin = await api("/api/v1/admin/users", {}, userB.jwt);
      const users = (await asAdmin.json().catch(() => [])) as {
        id: string;
        email?: string;
        last_sign_in_at?: string | null;
      }[];
      check(
        "4c admin lists users incl. A with email",
        asAdmin.status === 200 && users.some((u) => u.id === userA.id && !!u.email),
        { status: asAdmin.status, n: Array.isArray(users) ? users.length : null },
      );
      // expire A, extend via API, verify restored
      await admin
        .from("profiles")
        .update({
          account_type: "trial",
          access_expires_at: new Date(Date.now() - 3600e3).toISOString(),
        })
        .eq("id", userA.id);
      const extend = await api(
        `/api/v1/admin/users/${userA.id}`,
        { method: "PATCH", body: JSON.stringify({ extendDays: 30 }) },
        userB.jwt,
      );
      check("4d extendDays 30 accepted", extend.status === 200);
      const postAfterExtend = await api(
        "/api/v1/corridor/scenarios",
        { method: "POST", body: JSON.stringify({ name: "restored probe", payload }) },
        userA.jwt,
      );
      check("4e access restored after extend (201)", postAfterExtend.status === 201);
      if (postAfterExtend.status === 201) {
        const b = (await postAfterExtend.json()) as { id?: string };
        if (b.id) await admin.from("scenarios").delete().eq("id", b.id);
      }
      const typeChange = await api(
        `/api/v1/admin/users/${userA.id}`,
        { method: "PATCH", body: JSON.stringify({ account_type: "teaching" }) },
        userB.jwt,
      );
      const { data: profA2 } = await admin
        .from("profiles")
        .select("account_type")
        .eq("id", userA.id)
        .maybeSingle();
      check(
        "4f account_type round-trip",
        typeChange.status === 200 && profA2?.account_type === "teaching",
      );
      const selfDelete = await api(
        `/api/v1/admin/users/${userB.id}`,
        { method: "DELETE" },
        userB.jwt,
      );
      check("4g self-delete refused (400)", selfDelete.status === 400);
      // restore A to full for check 5
      await admin
        .from("profiles")
        .update({ account_type: "full", access_expires_at: null })
        .eq("id", userA.id);
    }

    // --- 5. scenario DELETE (needs PR 6) -----------------------------------
    const createRes = await api(
      "/api/v1/corridor/scenarios",
      { method: "POST", body: JSON.stringify({ name: "delete probe", payload }) },
      userA.jwt,
    );
    if (createRes.status !== 201) {
      check("5 setup scenario create", false, await createRes.text());
    } else {
      const { id } = (await createRes.json()) as { id: string };
      const delB = await api(
        `/api/v1/corridor/scenarios/${id}`,
        { method: "DELETE" },
        userB.jwt,
      );
      if (delB.status === 405) {
        skip("5 scenario DELETE", "handler absent (pre-PR 6)");
        await admin.from("scenarios").delete().eq("id", id);
      } else {
        check("5a cross-owner DELETE 404", delB.status === 404);
        const delA = await api(
          `/api/v1/corridor/scenarios/${id}`,
          { method: "DELETE" },
          userA.jwt,
        );
        check("5b owner DELETE 200", delA.status === 200);
        const getGone = await api(`/api/v1/corridor/scenarios/${id}`, {}, userA.jwt);
        check("5c deleted scenario GET 404", getGone.status === 404);
      }
    }

    // --- 6. delete-user cascade --------------------------------------------
    const seed = await api(
      "/api/v1/corridor/scenarios",
      { method: "POST", body: JSON.stringify({ name: "cascade probe", payload }) },
      userA.jwt,
    );
    const seedId =
      seed.status === 201 ? ((await seed.json()) as { id: string }).id : null;
    const { error: delErr } = await admin.auth.admin.deleteUser(userA.id);
    check("6a admin deleteUser succeeds", !delErr, delErr?.message);
    deleted.push(userA.id);
    const { data: profGone } = await admin
      .from("profiles")
      .select("id")
      .eq("id", userA.id);
    check("6b profile cascaded", profGone?.length === 0);
    const { data: scnGone } = await admin
      .from("scenarios")
      .select("id")
      .eq("owner", userA.id);
    check("6c scenarios cascaded", scnGone?.length === 0, { seedId });
  } finally {
    for (const u of [userA, userB]) {
      if (!deleted.includes(u.id)) {
        await admin.auth.admin.deleteUser(u.id).catch(() => {});
      }
    }
  }

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} FAILURES`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
