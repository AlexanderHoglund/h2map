/**
 * TEMPORARY read-only audit: Indonesia's hex_lcoh coverage by resolution.
 * Not committed — delete after use.
 */
import { makeSupabase } from "../lib/serviceDeps";
import { loadWorldProgram } from "./worldProgram";

async function main(): Promise<void> {
  const db = makeSupabase();
  const program = loadWorldProgram();
  const id = program.find((c) => c.name === "Indonesia");
  if (!id) throw new Error("Indonesia not found in world program");

  for (const res of [2, 3, 4]) {
    const want = id.cells(res);
    const statuses = new Map<string, number>();
    const tiers = new Map<string, number>();
    let ready = 0;
    let solarNull = 0;
    let windNull = 0;
    for (let i = 0; i < want.length; i += 400) {
      const chunk = want.slice(i, i + 400);
      const { data, error } = await db
        .from("hex_lcoh")
        .select("h3, status, lcoh_solar, lcoh_wind, pv_db_tier, wind_fidelity")
        .in("h3", chunk);
      if (error) throw new Error(`res${res}: ${error.message}`);
      for (const r of data ?? []) {
        const s = (r.status as string) ?? "?";
        statuses.set(s, (statuses.get(s) ?? 0) + 1);
        if (s === "ready") {
          ready += 1;
          if (r.lcoh_solar == null) solarNull += 1;
          if (r.lcoh_wind == null) windNull += 1;
          const t = `${r.pv_db_tier ?? "?"}/${r.wind_fidelity ?? "?"}`;
          tiers.set(t, (tiers.get(t) ?? 0) + 1);
        }
      }
    }
    const present = [...statuses.values()].reduce((a, b) => a + b, 0);
    const pct = (n: number, d: number): string =>
      d === 0 ? "-" : `${((100 * n) / d).toFixed(1)}%`;
    console.log(
      `res ${res}: ${want.length} in polygon | ${present} rows (${pct(present, want.length)}) | ` +
        `${[...statuses].map(([k, v]) => `${k}=${v}`).join(" ")}` +
        (ready
          ? ` | of ready: solar null ${solarNull} (${pct(solarNull, ready)}), wind null ${windNull} (${pct(windNull, ready)})`
          : ""),
    );
    if (ready)
      console.log(
        `        provenance (pv_db_tier/wind_fidelity): ${[...tiers]
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `${k}=${v}`)
          .join(" ")}`,
      );
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
