/**
 * §29's tornado: the lead elasticity table, drawn as a picture.
 *
 * One horizontal signed bar per ±10%-family input on the frozen 500 nm
 * reference corridor, read from the SAME `referenceCorridor` block of the
 * elasticity artifact the lead table renders — same entries, same order —
 * so the picture and the table can never disagree. Bar length is |effect of
 * the input +10% on the CO₂ abatement cost|; direction is the sign, with a
 * bar reaching LEFT of the zero line meaning the input LOWERS the cost.
 * Coupled groups are one bar (their members are unranked detail and never
 * drawn); the ±1pp rate family renders in its own labeled sub-block because
 * the two nudge families never share an ordering.
 *
 * A SERVER COMPONENT: no hooks, no state, no interactivity — a pure
 * function of committed data, like the table above it.
 *
 * Bars are plain divs rather than a chart library. The scale is one shared
 * linear axis across both families, symmetric around zero, so bar LENGTH is
 * comparable everywhere on the figure even though the two families' RANKS
 * are not.
 */

import type { ElasticityBlock, ElasticityEntry } from "./DocsElasticityTable";
import { effectPercent } from "./format";

const TH = "px-3 py-2 font-medium";

/** The signed cell the bars visualize: effect of +10% (or +1pp) on the
 *  abatement cost, as a fraction (−0.092 renders as −9.2%). */
const effectOf = (e: ElasticityEntry) => e.perKpi.costPerTonneCo2Usd.effect;

function BarRows({
  entries,
  scale,
}: {
  entries: ElasticityEntry[];
  /** |effect| that spans half the track — the largest bar on the figure. */
  scale: number;
}) {
  return (
    <tbody className="tabular-nums">
      {entries.map((e) => {
        const effect = effectOf(e);
        // Half-track percentage: 50% is the zero line, 100% the scale max.
        const half = (Math.abs(effect) / scale) * 50;
        const c = e.perKpi.costPerTonneCo2Usd;
        // An effect the cell prints as 0.0% draws NO bar — a minimum
        // visible width would show a direction the printed number denies.
        const drawn = effectPercent(effect) !== "0.0%";
        return (
          <tr key={e.id} className="border-b border-neutral-200 last:border-0">
            <td className="whitespace-nowrap px-3 py-1.5">
              {e.label}
              {e.group && e.memberLabels && (
                <span className="ml-1.5 text-[11px] text-neutral-500">
                  (one bar: {e.memberLabels.join(", ").toLowerCase()} move
                  together)
                </span>
              )}
            </td>
            <td className="w-full min-w-50 px-3 py-1.5">
              <span className="relative block h-4 w-full bg-neutral-100">
                {/* The zero line: no effect. A bar grows left of it when the
                    nudged input LOWERS the abatement cost — the direction a
                    reader should see, not be told. */}
                <span className="absolute inset-y-0 left-1/2 w-px bg-neutral-400" />
                {drawn && (
                  <span
                    className="absolute inset-y-0.5 bg-brand"
                    style={
                      effect < 0
                        ? { right: "50%", width: `${Math.max(half, 0.5)}%` }
                        : { left: "50%", width: `${Math.max(half, 0.5)}%` }
                    }
                  />
                )}
              </span>
            </td>
            <td
              className="whitespace-nowrap px-3 py-1.5 text-right text-neutral-600"
              title={`elasticity ${c.value.toFixed(2)} (up ${c.up.toFixed(2)}, down ${c.down.toFixed(2)})`}
            >
              {c.nonlinear && (
                <span className="mr-0.5 text-neutral-500" aria-label="curved response">
                  ≈
                </span>
              )}
              {effectPercent(effect)}
            </td>
          </tr>
        );
      })}
    </tbody>
  );
}

function Head({ nudge }: { nudge: string }) {
  return (
    <thead>
      <tr className="border-b border-neutral-300 bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-500">
        <th className={TH}>Input</th>
        <th className={`${TH} w-full min-w-50`}>
          Effect of {nudge} on the abatement cost
        </th>
        <th className={`${TH} whitespace-nowrap text-right`}>Effect</th>
      </tr>
    </thead>
  );
}

export default function DocsTornado({ block }: { block: ElasticityBlock }) {
  // The artifact stores entries in the lead table's display order already;
  // the filters only split the nudge families and drop the unranked
  // group-member detail — exactly what DocsElasticityTable does.
  const relative = block.entries.filter(
    (e) => e.kind === "relative" && !e.detailOnly,
  );
  const rates = block.entries.filter(
    (e) => e.kind === "absolutePp" && !e.detailOnly,
  );
  const scale =
    Math.max(...[...relative, ...rates].map((e) => Math.abs(effectOf(e)))) || 1;

  return (
    <div className="my-4">
      <div className="overflow-x-auto">
        <table className="w-full border border-neutral-300 text-[13px]">
          <Head nudge="+10%" />
          <BarRows entries={relative} scale={scale} />
        </table>
      </div>
      <p className="mb-1 mt-3 text-xs font-medium text-neutral-700">
        Rates and fractions &mdash; nudged +1 percentage point, in their own
        block. The bars share the figure&apos;s scale, so lengths compare;
        the rankings never mix.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border border-neutral-300 text-[13px]">
          <Head nudge="+1pp" />
          <BarRows entries={rates} scale={scale} />
        </table>
      </div>
      <div className="mt-3 overflow-x-auto">
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
                Effect of +10% / +1pp
              </td>
              <td className="px-3 py-2">
                The bar: how the CO&#8322; abatement cost responds when the
                input is nudged up &mdash; the lead table&apos;s abatement
                column, drawn. The vertical rule is zero; a bar left of it
                means the nudge <em>lowers</em>{" "}the cost. One shared
                linear scale across the whole figure, so lengths compare
                between the blocks even though the rankings do not.
              </td>
            </tr>
            <tr className="border-b border-neutral-200 last:border-0">
              <td className="whitespace-nowrap px-3 py-2 font-medium">
                Effect
              </td>
              <td className="px-3 py-2">
                The same number, printed. <em>(one bar)</em>{" "}marks a
                coupling group whose members move together; &asymp; marks a
                curved response where the up- and down-nudges disagree and
                the figure is a central estimate (hover for both one-sided
                elasticities).
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
