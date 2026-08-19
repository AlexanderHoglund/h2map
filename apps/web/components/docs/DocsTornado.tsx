/**
 * The tornado, rendered in the documentation for all three archetypes.
 *
 * §20 ranks inputs in a table; this keeps the SAME table structure — the same
 * header styling, the same column discipline, one row per input — and adds
 * the bar as one column among the others, so the reader moves from the
 * ranking to the tornado without relearning how to read.
 *
 * The spans come from `uncertainty.json`, computed by `buildTornado` in
 * lib/corridor/tornado — the tested implementation the Monte Carlo shares —
 * and CI regenerates and diffs the artifact like any other generated output.
 *
 * A SERVER COMPONENT: no hooks, no state, no interactivity. The docs page is
 * server-rendered and this is a pure function of committed data, so it stays
 * that way rather than becoming another client island.
 *
 * Bars are plain divs rather than a chart library. The axis is one shared
 * linear scale per archetype so bar LENGTH is comparable within a corridor —
 * the three corridors differ by an order of magnitude in absolute gap, so a
 * scale shared across all three would flatten two of them into invisibility.
 */

import { rangeLabel } from "@/lib/corridor/tornado";

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
  rangeLow: number;
  rangeHigh: number;
  unit: string;
  verified: boolean;
  coupled: boolean;
}
interface Result {
  archetype: { key: string; label: string };
  tornado: { base: number; bars: Bar[]; inapplicable: { id: string; reason: string }[] };
  importance: { id: string; rankCorrelation: number }[];
  bands: Record<string, { p10: number; p50: number; p90: number; deterministic: number }>;
}

const m = (v: number) => `$${Math.round(v).toLocaleString("en-US")}m`;
const mPair = (a: number, b: number) => {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return `$${Math.round(lo).toLocaleString("en-US")}–${Math.round(hi).toLocaleString("en-US")}m`;
};

const TH = "px-3 py-2 font-medium";

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
              Baseline gap {m(r.tornado.base)}
              {band && (
                <>
                  {" · "}Monte Carlo P10–P90 {mPair(band.p10, band.p90)}
                </>
              )}
            </p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full border border-neutral-300 text-[13px] tabular-nums">
                <thead>
                  <tr className="border-b border-neutral-300 bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-500">
                    <th className={TH}>Input</th>
                    <th className={`${TH} whitespace-nowrap`}>Researched range</th>
                    <th className={`${TH} w-full min-w-50`}>
                      Effect on the cost gap
                    </th>
                    <th className={`${TH} whitespace-nowrap text-right`}>
                      Gap at the ends
                    </th>
                    <th className={`${TH} text-right`}>ρ</th>
                  </tr>
                </thead>
                <tbody>
                  {bars.map((b) => {
                    const left = Math.min(pct(b.low), pct(b.high));
                    const width = Math.abs(pct(b.high) - pct(b.low));
                    const rho = corr.get(b.id);
                    return (
                      <tr
                        key={b.id}
                        className="border-b border-neutral-200 last:border-0"
                      >
                        <td className="whitespace-nowrap px-3 py-1.5">
                          {LABELS[b.id] ?? b.id}
                          {b.coupled && (
                            <span className="ml-1.5 text-[11px] text-neutral-500">
                              (coupled)
                            </span>
                          )}
                          {!b.verified && (
                            <span
                              className="ml-1 text-amber-700"
                              title="range recorded as unverified"
                            >
                              *
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-neutral-600">
                          {rangeLabel(b.rangeLow, b.rangeHigh, b.unit)}
                        </td>
                        <td className="px-3 py-1.5">
                          <span className="relative block h-4 w-full bg-neutral-100">
                            {/* The baseline, so the reader can see which
                                direction each range pushes — WACC pushes
                                DOWN, which is the counterintuitive one worth
                                seeing rather than being told. */}
                            <span
                              className="absolute inset-y-0 w-px bg-neutral-400"
                              style={{ left: `${pct(r.tornado.base)}%` }}
                            />
                            <span
                              className="absolute inset-y-0.5 bg-brand"
                              style={{
                                left: `${left}%`,
                                width: `${Math.max(width, 0.5)}%`,
                              }}
                            />
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right text-neutral-600">
                          {mPair(b.low, b.high)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right text-neutral-500">
                          {rho !== undefined ? rho.toFixed(2) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  {r.tornado.inapplicable.map((i) => (
                    <tr
                      key={i.id}
                      className="border-b border-neutral-200 text-neutral-500 last:border-0"
                    >
                      <td className="whitespace-nowrap px-3 py-1.5">
                        {LABELS[i.id] ?? i.id}
                      </td>
                      <td colSpan={4} className="px-3 py-1.5 italic">
                        not applicable — {i.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      <div className="overflow-x-auto">
        <table className="w-full border border-neutral-300 text-[13px]">
          <thead>
            <tr className="border-b border-neutral-300 bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-500">
              <th className={TH}>Column</th>
              <th className={TH}>What it tells you</th>
            </tr>
          </thead>
          <tbody className="align-top text-neutral-700">
            <tr className="border-b border-neutral-200">
              <td className="whitespace-nowrap px-3 py-2 font-medium">
                Researched range
              </td>
              <td className="px-3 py-2">
                The declared, cited range in the input&apos;s own units.{" "}
                <em>(coupled)</em>{" "}means the range moves a group of fields
                together; <span className="text-amber-700">*</span>{" "}means the
                range&apos;s basis is recorded as unverified.
              </td>
            </tr>
            <tr className="border-b border-neutral-200">
              <td className="whitespace-nowrap px-3 py-2 font-medium">
                Effect on the cost gap
              </td>
              <td className="px-3 py-2">
                The bar runs between <strong>two full engine evaluations</strong>,
                one at each end of the range, on one shared scale per corridor —
                so bar length compares within a corridor. The vertical rule is
                the corridor&apos;s own result; a bar reaching left of it means
                that end of the range <em>lowers</em>{" "}the gap.
              </td>
            </tr>
            <tr className="border-b border-neutral-200">
              <td className="whitespace-nowrap px-3 py-2 font-medium">
                Gap at the ends
              </td>
              <td className="px-3 py-2">
                The same pair of evaluations as dollar figures — where the gap
                lands at the two ends of the range.
              </td>
            </tr>
            <tr className="border-b border-neutral-200 last:border-0">
              <td className="whitespace-nowrap px-3 py-2 font-medium">ρ</td>
              <td className="px-3 py-2">
                The Monte Carlo&apos;s signed rank correlation with the gap —
                how strongly this input drives the answer when{" "}
                <em>everything</em>{" "}varies at once. Negative on the discount
                rate because the model discounts cost flows, so a higher rate
                yields a smaller gap.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
