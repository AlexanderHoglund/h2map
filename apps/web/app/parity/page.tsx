import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

interface Dataset {
  meta: { source: string; published_column_means: Record<string, number> };
  sites: Record<string, { name: string; lat: number; lon: number }>;
  projects: {
    project_name: string;
    region_hint: string;
    site: string | null;
    lcoh_2022: number;
    lcoh_2030: number;
    lcoh_2040: number;
    lcoh_2050: number;
  }[];
}

interface Results {
  generatedAt: string;
  method: { scenario: string; sweep: string; caveat: string };
  summary: {
    projectsTotal: number;
    projectsComputed: number;
    meanPublished2022: number;
    meanComputed2022: number;
    meanDelta: number;
    spearmanRho: number;
    kendallTauB?: number;
    kendallTauB_ci95?: [number, number];
    precisionAt5?: number;
    precisionAt10?: number;
    topDecileRetention?: number;
  };
  sites: Record<
    string,
    { bestPvMw: number; bestWindMw: number; lcohUsdPerKg: number }
  >;
  projects: {
    project_name: string;
    site: string | null;
    published_2022: number;
    computed_2022: number | null;
    delta: number | null;
  }[];
}

/** data/ lives at the repo root; dev cwd is apps/web, prod may differ. */
function dataDir(): string {
  for (const candidate of [
    path.resolve(process.cwd(), "data/chile-parity"),
    path.resolve(process.cwd(), "../../data/chile-parity"),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("data/chile-parity not found relative to cwd");
}

function loadJson<T>(file: string): T | null {
  const p = path.join(dataDir(), file);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as T;
}

export default function ParityPage() {
  const dataset = loadJson<Dataset>("chile-47-projects-lcoh.json");
  const results = loadJson<Results>("results.json");

  if (!dataset) {
    return (
      <main className="mx-auto max-w-4xl p-8">
        <h1 className="text-2xl font-semibold">Chilean 47-project parity</h1>
        <p className="mt-4 text-red-600">
          data/chile-parity/chile-47-projects-lcoh.json is missing.
        </p>
      </main>
    );
  }

  const computedBySite = results?.sites ?? {};
  const resultByName = new Map(
    (results?.projects ?? []).map((p) => [p.project_name, p]),
  );

  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="text-2xl font-semibold">Chilean 47-project parity</h1>
      <p className="mt-2 max-w-3xl text-sm text-neutral-600 dark:text-neutral-400">
        Published LCOH (Tabla 3-1, Motor de Cálculo LCOH, April 2024) vs. this
        engine with doc-literal 2022 defaults and TMY profiles from the H2MAP
        profile service. Coordinates are inferred from region hints — the PDF
        publishes none — so this is a methodology parity check, not a
        site-exact reproduction.
      </p>
      <p className="mt-2 max-w-3xl text-sm text-neutral-600 dark:text-neutral-400">
        This is <strong>validation</strong> (do the assumptions match reality?),
        distinct from <strong>verification</strong> (does the code compute the
        method? — analytical cases at 1e-6, golden files at 1e-12, in the test
        suite). For a screening tool, shortlist fidelity matters more than a
        single global correlation.
      </p>

      {results ? (
        <>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat
              label="Projects computed"
              value={`${results.summary.projectsComputed}/${results.summary.projectsTotal}`}
            />
            <Stat
              label="Mean 2022 (published, computed subset)"
              value={results.summary.meanPublished2022.toFixed(2)}
            />
            <Stat
              label="Mean 2022 (H2MAP)"
              value={results.summary.meanComputed2022.toFixed(2)}
            />
            <Stat
              label="Spearman ρ"
              value={results.summary.spearmanRho.toFixed(3)}
            />
          </div>
          {results.summary.precisionAt5 != null && (
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat
                label="Precision@5 (cheapest sites)"
                value={results.summary.precisionAt5.toFixed(2)}
              />
              <Stat
                label="Precision@10"
                value={results.summary.precisionAt10!.toFixed(2)}
              />
              <Stat
                label="Top-decile retention"
                value={results.summary.topDecileRetention!.toFixed(2)}
              />
              <Stat
                label="Kendall τ_b (95% CI)"
                value={
                  results.summary.kendallTauB_ci95
                    ? `${results.summary.kendallTauB!.toFixed(2)} [${results.summary.kendallTauB_ci95[0].toFixed(2)}, ${results.summary.kendallTauB_ci95[1].toFixed(2)}]`
                    : results.summary.kendallTauB!.toFixed(2)
                }
              />
            </div>
          )}
          <p className="mt-2 text-xs text-neutral-500">
            {results.method.scenario} · {results.method.sweep} · generated{" "}
            {results.generatedAt}
          </p>
        </>
      ) : (
        <p className="mt-6 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          No computed results yet — run <code>npm run parity:run</code> at the
          repo root, then reload.
        </p>
      )}

      <div className="mt-8 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-300 text-left dark:border-neutral-700">
              <th className="py-2 pr-3">Project</th>
              <th className="py-2 pr-3">Region hint</th>
              <th className="py-2 pr-3">Site</th>
              <th className="py-2 pr-3 text-right">Published 2022</th>
              <th className="py-2 pr-3 text-right">H2MAP 2022</th>
              <th className="py-2 pr-3 text-right">Δ</th>
              <th className="py-2 pr-3 text-right">2030</th>
              <th className="py-2 pr-3 text-right">2040</th>
              <th className="py-2 text-right">2050</th>
            </tr>
          </thead>
          <tbody>
            {dataset.projects.map((p) => {
              const r = resultByName.get(p.project_name);
              return (
                <tr
                  key={p.project_name}
                  className="border-b border-neutral-100 dark:border-neutral-800"
                >
                  <td className="py-1.5 pr-3">{p.project_name}</td>
                  <td className="py-1.5 pr-3 text-neutral-500">
                    {p.region_hint || "—"}
                  </td>
                  <td className="py-1.5 pr-3 text-neutral-500">
                    {p.site ?? "—"}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {p.lcoh_2022.toFixed(2)}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {r?.computed_2022?.toFixed(2) ?? "—"}
                  </td>
                  <td
                    className={`py-1.5 pr-3 text-right tabular-nums ${deltaColor(r?.delta ?? null)}`}
                  >
                    {r?.delta != null
                      ? `${r.delta >= 0 ? "+" : ""}${r.delta.toFixed(2)}`
                      : "—"}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-neutral-500">
                    {p.lcoh_2030.toFixed(2)}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-neutral-500">
                    {p.lcoh_2040.toFixed(2)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-neutral-500">
                    {p.lcoh_2050.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {results && (
        <div className="mt-8">
          <h2 className="text-lg font-medium">Sites (best mix, 200 MW total)</h2>
          <table className="mt-3 w-full max-w-2xl border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-300 text-left dark:border-neutral-700">
                <th className="py-2 pr-3">Site</th>
                <th className="py-2 pr-3 text-right">PV MW</th>
                <th className="py-2 pr-3 text-right">Wind MW</th>
                <th className="py-2 text-right">LCOH USD/kg</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(computedBySite).map(([key, s]) => (
                <tr
                  key={key}
                  className="border-b border-neutral-100 dark:border-neutral-800"
                >
                  <td className="py-1.5 pr-3">
                    {dataset.sites[key]?.name ?? key}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {s.bestPvMw}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {s.bestWindMw}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {s.lcohUsdPerKg.toFixed(3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-8 text-xs text-neutral-500">
        Source: {dataset.meta.source}. Published column mean 2022 (all 47):{" "}
        {dataset.meta.published_column_means["2022"]?.toFixed(2)} USD/kg.
      </p>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function deltaColor(delta: number | null): string {
  if (delta === null) return "";
  return Math.abs(delta) <= 0.5
    ? "text-emerald-600"
    : Math.abs(delta) <= 1
      ? "text-amber-600"
      : "text-red-600";
}
