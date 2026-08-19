/**
 * The tornado, rendered in the documentation for all three archetypes.
 *
 * §20 described what drives the model in prose and tables. This shows it. The
 * spans come from `uncertainty.json`, which computes them with the SAME
 * `buildTornado` the results panel calls — so the documentation cannot draw a
 * different picture from the app, and CI regenerates and diffs the artifact
 * like any other generated output.
 *
 * A SERVER COMPONENT: no hooks, no state, no interactivity. The docs page is
 * server-rendered and this is a pure function of committed data, so it stays
 * that way rather than becoming a second client island.
 *
 * Bars are plain divs rather than a chart library. Three fixed, tiny charts of
 * five bars each do not need Recharts, and the axis is one shared linear scale
 * so bar LENGTH is comparable across archetypes — a per-chart axis would make
 * the smallest driver look like the largest.
 */

const LABELS: Record<string, string> = {
  "energy-demand": "Fuel consumption",
  "green.priceUsdPerTonne": "Green fuel price",
  "fleet-capital": "Vessel CAPEX",
  "vessel-opex": "Vessel OPEX",
  "cargo.wacc": "Discount rate (WACC)",
  "cargo.inflation": "Inflation",
};

interface Bar {
  id: string;
  low: number;
  high: number;
  span: number;
  verified: boolean;
  coupled: boolean;
}
interface Result {
  archetype: { key: string; label: string };
  tornado: { base: number; bars: Bar[]; inapplicable: { id: string; reason: string }[] };
  importance: { id: string; rankCorrelation: number }[];
  bands: Record<string, { p10: number; p50: number; p90: number; deterministic: number }>;
}

const m = (v: number) => `$${v.toFixed(0)}m`;

export default function DocsTornado({
  results,
  headlineKpi,
}: {
  results: Result[];
  headlineKpi: string;
}) {
  return (
    <div className="my-4 space-y-6">
      {results.map((r) => {
        const bars = r.tornado.bars;
        if (bars.length === 0) return null;
        // One axis per archetype — the three corridors differ by an order of
        // magnitude in absolute gap, so a shared axis across all three would
        // flatten two of them into invisibility.
        const lo = Math.min(...bars.map((b) => Math.min(b.low, b.high)), r.tornado.base);
        const hi = Math.max(...bars.map((b) => Math.max(b.low, b.high)), r.tornado.base);
        const pad = (hi - lo) * 0.08 || 1;
        const a0 = lo - pad;
        const a1 = hi + pad;
        const pct = (v: number) => ((v - a0) / (a1 - a0)) * 100;
        const band = r.bands[headlineKpi];
        const corr = new Map(r.importance.map((i) => [i.id, i.rankCorrelation]));

        return (
          <div key={r.archetype.key}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
              {r.archetype.key} · {r.archetype.label}
            </p>
            <p className="mt-0.5 text-[11px] text-neutral-500">
              Baseline {m(r.tornado.base)}
              {band && (
                <>
                  {" · "}Monte Carlo P10–P90 {m(band.p10)}–{m(band.p90)}
                </>
              )}
            </p>
            <div className="mt-2 space-y-1">
              {bars.map((b) => {
                const left = Math.min(pct(b.low), pct(b.high));
                const width = Math.abs(pct(b.high) - pct(b.low));
                const rho = corr.get(b.id);
                return (
                  <div key={b.id} className="flex items-center gap-2">
                    <span className="w-40 shrink-0 text-right text-[11px] leading-snug text-neutral-700">
                      {LABELS[b.id] ?? b.id}
                      {!b.verified && (
                        <span className="text-amber-700" title="unverified range">
                          {" "}
                          *
                        </span>
                      )}
                    </span>
                    <span className="relative h-4 min-w-0 flex-1 bg-neutral-100">
                      {/* The baseline, so the reader can see which direction
                          each range pushes — WACC pushes DOWN, which is the
                          counterintuitive one worth seeing rather than being
                          told. */}
                      <span
                        className="absolute inset-y-0 w-px bg-neutral-400"
                        style={{ left: `${pct(r.tornado.base)}%` }}
                      />
                      <span
                        className="absolute inset-y-0.5 bg-brand"
                        style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%` }}
                      />
                    </span>
                    <span className="w-28 shrink-0 text-[11px] tabular-nums text-neutral-500">
                      {m(b.span)}
                      {rho !== undefined && (
                        <span className="text-neutral-400">
                          {" "}
                          ρ&nbsp;{rho.toFixed(2)}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            {r.tornado.inapplicable.length > 0 && (
              <p className="mt-1 text-[11px] leading-snug text-neutral-500">
                Not applicable here:{" "}
                {r.tornado.inapplicable
                  .map((i) => `${LABELS[i.id] ?? i.id} (${i.reason})`)
                  .join("; ")}
              </p>
            )}
          </div>
        );
      })}
      <p className="text-[11px] leading-snug text-neutral-500">
        Bar length is the span of the headline gap between the two ends of each
        researched range, from two full engine evaluations. The vertical rule is
        the unperturbed result. <strong>ρ</strong>{" "}is the Monte Carlo&apos;s
        signed rank correlation — negative on WACC because the model discounts
        cost flows, so a higher rate yields a smaller gap.{" "}
        <span className="text-amber-700">*</span>{" "}marks a range whose basis is
        recorded as unverified.
      </p>
    </div>
  );
}
