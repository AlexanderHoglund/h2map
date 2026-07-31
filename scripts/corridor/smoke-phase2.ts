/**
 * Phase 2 acceptance (build-plan): integration checks against the LIVE
 * Supabase project + a locally running web server.
 *
 *   npx tsx scripts/corridor/smoke-phase2.ts [baseUrl]
 *
 * Verifies:
 *   1. RLS cross-owner isolation (user B cannot read/update A's scenario)
 *   2. API scenario round-trip is BIT-IDENTICAL (payload in === payload out)
 *   3. Share-token flow (anon read via token; token revocation)
 *   4. Reference-bundle endpoint (immutable cache header)
 *   5. lcoh-evaluate types errors for unservable sites (never a number)
 *
 * Test users are created via the service-role admin API and deleted at the
 * end. Requires apps/web/.env.local (URL + anon + secret keys).
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

/**
 * Canonical JSON (recursively key-sorted). Postgres `jsonb` normalizes object
 * key ORDER (values — including every number — are preserved exactly), so
 * "bit-identical round-trip" is asserted on canonical form: same keys, same
 * values, same numbers bit-for-bit; only transport key order is ignored.
 */
function canonical(v: unknown): string {
  return JSON.stringify(sortKeys(v));
}
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v !== null && typeof v === "object") {
    return Object.fromEntries(
      Object.keys(v as object)
        .sort()
        .map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]),
    );
  }
  return v;
}

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || detail === undefined ? "" : ` — ${JSON.stringify(detail).slice(0, 300)}`}`);
  if (!ok) failures++;
}

async function main(): Promise<void> {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SECRET_KEY: secret } = env();
  if (!url || !anon || !secret) throw new Error("missing supabase env");
  const admin = createClient(url, secret, { auth: { persistSession: false } });

  // --- test users ---------------------------------------------------------
  const mkUser = async (email: string) => {
    const password = `corridor-${crypto.randomUUID()}`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`createUser ${email}: ${error.message}`);
    const client = createClient(url, anon, { auth: { persistSession: false } });
    const { data: signIn, error: e2 } = await client.auth.signInWithPassword({ email, password });
    if (e2 || !signIn.session) throw new Error(`signIn ${email}: ${e2?.message}`);
    return { id: data.user.id, jwt: signIn.session.access_token };
  };
  const suffix = Date.now().toString(36);
  const userA = await mkUser(`corridor-smoke-a-${suffix}@example.com`);
  const userB = await mkUser(`corridor-smoke-b-${suffix}@example.com`);

  // The frozen fixture is v1; the API stores current-schema payloads only,
  // so clients migrate before writing (4.1).
  const payload = migrateScenarioInput(
    JSON.parse(
      readFileSync(new URL("fixtures/golden/corridor/excel-baseline.input.json", ROOT), "utf8"),
    ),
  ).input as unknown as Record<string, unknown>;

  const api = (path: string, init: RequestInit = {}, jwt?: string) =>
    fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(jwt ? { authorization: `Bearer ${jwt}` } : {}),
        ...(init.headers ?? {}),
      },
    });

  try {
    // --- 1. create as A + bit-identical round-trip ------------------------
    const createRes = await api("/api/v1/corridor/scenarios", {
      method: "POST",
      body: JSON.stringify({ name: "smoke corridor", payload }),
    }, userA.jwt);
    check("POST /scenarios → 201", createRes.status === 201, await (createRes.status === 201 ? null : createRes.text()));
    const created = (await createRes.json().catch(() => null)) as { id?: string; inputs?: unknown; results?: { summary?: { gapPvUsdM?: number } } } | null;
    const id = created?.id;
    check("round-trip payload BIT-IDENTICAL (canonical)", canonical(created?.inputs) === canonical(payload));
    check(
      "server-computed results match golden gap",
      created?.results?.summary?.gapPvUsdM === 166.95059118904504,
      created?.results?.summary?.gapPvUsdM,
    );

    const getRes = await api(`/api/v1/corridor/scenarios/${id}`, {}, userA.jwt);
    const fetched = (await getRes.json()) as { inputs?: unknown };
    check("GET /scenarios/:id round-trip BIT-IDENTICAL (canonical)", canonical(fetched.inputs) === canonical(payload));

    // --- 2. RLS cross-owner ----------------------------------------------
    const bRead = await api(`/api/v1/corridor/scenarios/${id}`, {}, userB.jwt);
    check("cross-owner GET → 404", bRead.status === 404);
    const bWrite = await api(`/api/v1/corridor/scenarios/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name: "stolen" }),
    }, userB.jwt);
    check("cross-owner PUT → 404", bWrite.status === 404);
    const anonList = await api("/api/v1/corridor/scenarios");
    check("anonymous list → 401", anonList.status === 401);

    // Direct-to-Postgres cross-owner probe (RLS itself, bypassing the API):
    const bClient = createClient(url, anon, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${userB.jwt}` } },
    });
    const { data: bRows } = await bClient.from("scenarios").select("id").eq("id", id!);
    check("RLS direct SELECT as B → 0 rows", (bRows ?? []).length === 0);

    // --- 3. share flow ----------------------------------------------------
    const shareRes = await api(`/api/v1/corridor/scenarios/${id}`, {
      method: "PUT",
      body: JSON.stringify({ share: true }),
    }, userA.jwt);
    const shared = (await shareRes.json()) as { share_token?: string };
    check("PUT share:true returns a token", typeof shared.share_token === "string" && shared.share_token.length >= 16);

    const anonShared = await api(`/api/v1/corridor/s/${shared.share_token}`);
    const sharedBody = (await anonShared.json()) as { payload?: unknown; name?: string; owner?: unknown; share_token?: unknown };
    check("anon share read → 200 + payload", anonShared.status === 200 && canonical(sharedBody.payload) === canonical(payload));
    check("share response leaks no owner/token", !("owner" in sharedBody) && !("share_token" in sharedBody));

    const revoke = await api(`/api/v1/corridor/scenarios/${id}`, {
      method: "PUT",
      body: JSON.stringify({ share: false }),
    }, userA.jwt);
    check("share revoked", revoke.status === 200);
    const afterRevoke = await api(`/api/v1/corridor/s/${shared.share_token}`);
    check("revoked token → 404", afterRevoke.status === 404);

    // --- 4. reference bundle ---------------------------------------------
    const refRes = await api("/api/v1/corridor/ref/2026-07-30-excel-v1");
    const refBody = (await refRes.json()) as { bundleId?: string; fuels?: unknown[] };
    check("ref bundle → 200 + content", refRes.status === 200 && refBody.bundleId === "2026-07-30-excel-v1" && refBody.fuels?.length === 6);
    check("ref bundle immutable cache header", refRes.headers.get("cache-control")?.includes("immutable") === true);
    const refMissing = await api("/api/v1/corridor/ref/no-such-bundle");
    check("unknown bundle → 404", refMissing.status === 404);

    // --- 5. lcoh-evaluate typed errors ------------------------------------
    const badBody = await api("/api/v1/corridor/lcoh-evaluate", {
      method: "POST",
      body: JSON.stringify({ site: { lat: 1, lon: 1 }, lcohConfig: {} }),
    });
    check("lcoh-evaluate invalid config → 400 validation", badBody.status === 400);
    const badH3 = await api("/api/v1/corridor/lcoh-evaluate", {
      method: "POST",
      body: JSON.stringify({ site: { h3: "nonsense" }, lcohConfig: { finance: { discountRate: 0.08, lifetimeYears: 20 }, electrolyzer: { capacityMw: 100, efficiencyLhv: 0.6, capexUsdPerKw: 1000, opexFractionPerYear: 0.03, stackLifetimeHours: 40000, stackReplacementCostFraction: 0.3, degradationPerYear: 0.01 }, pv: { capacityMw: 100, pricing: { mode: "lcoe", usdPerMwh: 30 } }, water: {} } }),
    });
    check("lcoh-evaluate invalid h3 → 400", badH3.status === 400, badH3.status !== 400 ? await badH3.text() : undefined);
  } finally {
    await admin.auth.admin.deleteUser(userA.id);
    await admin.auth.admin.deleteUser(userB.id);
    console.log("(test users deleted)");
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) FAILED`);
    process.exitCode = 1;
  } else {
    console.log("\nall checks passed");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
