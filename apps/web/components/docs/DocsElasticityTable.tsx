/**
 * §29's lead table: every input the model can nudge, ranked by how hard it
 * moves the CO₂ abatement cost on the frozen 500 nm reference corridor.
 *
 * Server-rendered from the `referenceCorridor` block of the committed
 * elasticity artifact — the block is produced by the SAME live module the
 * in-app "What moves this corridor" panel runs, so the docs table and the
 * app can never disagree. No tabs and no interaction: one simple signed
 * number per input per column ("the effect of +10%"), both columns always
 * visible. The raw elasticity (the % per 1% figure) rides in the cell's
 * title attribute for readers who want the derivative itself.
 *
 * The two nudge families never share an ordering: rates and fractions move
 * ±1 percentage point, not ±10% of themselves, and render in their own
 * labeled block. Coupling groups rank as ONE row (their members are the
 * artifact's unranked detail); a `≈` marks a curved response where the up-
 * and down-nudges disagree and the single number is a central estimate.
 */

import { effectPercent } from "./format";

interface EffectCell {
  value: number;
  up: number;
  down: number;
  nonlinear: boolean;
  effect: number;
}

export interface ElasticityEntry {
  id: string;
  label: string;
  kind: "relative" | "absolutePp";
  group: boolean;
  memberLabels?: string[];
  detailOnly: boolean;
  fraction: number;
  perKpi: {
    gapPvUsdM: EffectCell;
    costPerTonneCo2Usd: EffectCell;
  };
}

export interface ElasticityBlock {
  base: { gapPvUsdM: number; costPerTonneCo2Usd: number };
  entries: ElasticityEntry[];
  skipped: { id: string; label: string; reason: string }[];
}

/** "elasticity −0.92 (up −0.89, down −0.96)" — the derivative, on hover. */
const cellTitle = (c: EffectCell): string =>
  `elasticity ${c.value.toFixed(2)} (up ${c.up.toFixed(2)}, down ${c.down.toFixed(2)})`;

function Cell({ c }: { c: EffectCell }) {
  return (
    <td className="px-3 py-1.5 text-right" title={cellTitle(c)}>
      {c.nonlinear && (
        <span className="mr-0.5 text-neutral-500" aria-label="curved response">
          ≈
        </span>
      )}
      {effectPercent(c.effect)}
    </td>
  );
}

function Rows({ entries }: { entries: ElasticityEntry[] }) {
  return (
    <tbody className="tabular-nums">
      {entries.map((e, i) => (
        <tr key={e.id} className="border-b border-neutral-200 last:border-0">
          <td className="px-3 py-1.5 text-neutral-500">{i + 1}</td>
          <td className="px-3 py-1.5">
            {e.label}
            {e.group && e.memberLabels && (
              <span className="ml-1.5 text-[11px] text-neutral-500">
                — one row: {e.memberLabels.join(", ").toLowerCase()} move
                together
              </span>
            )}
          </td>
          <Cell c={e.perKpi.costPerTonneCo2Usd} />
          <Cell c={e.perKpi.gapPvUsdM} />
        </tr>
      ))}
    </tbody>
  );
}

function Head({ nudge }: { nudge: string }) {
  return (
    <thead>
      <tr className="border-b border-neutral-300 bg-neutral-50 text-left text-[11px] uppercase tracking-wider text-neutral-500">
        <th className="px-3 py-2 font-medium">#</th>
        <th className="px-3 py-2 font-medium">Input</th>
        <th className="px-3 py-2 text-right font-medium">
          Effect of {nudge} on CO&#8322; abatement cost
        </th>
        <th className="px-3 py-2 text-right font-medium">
          &hellip;on cost gap
        </th>
      </tr>
    </thead>
  );
}

export default function DocsElasticityTable({ block }: { block: ElasticityBlock }) {
  // The artifact stores entries in display order already (ranked by
  // |abatement effect| within each family); the filters only split families
  // and drop the unranked group-member detail.
  const relative = block.entries.filter(
    (e) => e.kind === "relative" && !e.detailOnly,
  );
  const rates = block.entries.filter(
    (e) => e.kind === "absolutePp" && !e.detailOnly,
  );
  const moduleOff = block.skipped.filter((s) => s.reason === "absent").length;
  const atZero = block.skipped.filter((s) => s.reason === "zero").length;

  return (
    <div className="my-3">
      <div className="overflow-x-auto">
        <table className="w-full border border-neutral-300 text-[13px]">
          <Head nudge="+10%" />
          <Rows entries={relative} />
        </table>
      </div>
      <p className="mb-1 mt-3 text-xs font-medium text-neutral-700">
        Rates and fractions &mdash; moved &plusmn;1 percentage point, in their
        own ranking. A 1-point move on a small rate is a large relative
        change, so these never share an ordering with the &plusmn;10% rows.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border border-neutral-300 text-[13px]">
          <Head nudge="+1pp" />
          <Rows entries={rates} />
        </table>
      </div>
      <p className="mt-1.5 text-xs text-neutral-500">
        &asymp; marks a curved response: the up- and down-nudges disagree by
        more than 20%, so the printed number is a central estimate (hover a
        cell for both one-sided figures). A 0.0% row is a measurement, not a
        gap &mdash; the input was nudged and the output did not move.
        {" "}
        {moduleOff + atZero} further inputs cannot be measured on this
        corridor: {moduleOff} belong to modules the reference corridor
        switches off (financing, self-designed support, IMO, emission
        overrides) and {atZero} sit at zero, where a proportional nudge
        cannot move them &mdash; &sect;38 lists every field with its reason.
      </p>
    </div>
  );
}
