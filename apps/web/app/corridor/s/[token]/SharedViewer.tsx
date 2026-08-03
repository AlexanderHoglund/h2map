"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  migrateScenarioInput,
  resolveScenario,
  type ResolvedScenario,
  type ScenarioInput,
  type ScenarioResult,
} from "@h2map/corridor-schema";
import { CORRIDOR_ENGINE_VERSION, evaluateScenario } from "@h2map/corridor-engine";
import { Button } from "@/components/ui/Button";
import { DEFAULT_BUNDLE, DRAFT_KEY } from "@/components/corridor/state";

/**
 * Read-only shared-scenario view (restored with the login build): the link
 * carries only the token; payload + stored results come from the DB row.
 * "Open as draft" copies the payload into the local draft and enters the
 * corridor tool (which is auth-gated — anonymous readers are sent to the
 * landing page on that jump, with the draft waiting for them after sign-in).
 */
const ResultsPanel = dynamic(() => import("@/components/corridor/ResultsPanel"), {
  ssr: false,
});

interface SharedBody {
  name: string;
  payload: unknown;
  results: unknown;
  engineVersion: string | null;
  refBundleVersion: string | null;
  updatedAt: string;
}

export default function SharedViewer({ token }: { token: string }) {
  const t = useTranslations("corridor.shared");
  const router = useRouter();
  const [recomputed, setRecomputed] = useState<ScenarioResult | null>(null);
  const [state, setState] = useState<
    | { phase: "loading" }
    | { phase: "error" }
    | { phase: "ready"; body: SharedBody; scenario: ScenarioInput }
  >({ phase: "loading" });

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`/api/v1/corridor/s/${token}`);
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as SharedBody;
        const scenario = migrateScenarioInput(body.payload).input;
        if (alive) setState({ phase: "ready", body, scenario });
      } catch {
        if (alive) setState({ phase: "error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  if (state.phase === "loading") {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-sm text-neutral-500">…</main>
    );
  }
  if (state.phase === "error") {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-sm text-neutral-500">
        {t("notFound")}
      </main>
    );
  }

  const { body, scenario } = state;
  // Version pinning surfaced (4.2): a scenario saved under an older engine or
  // reference bundle shows an explicit recompute affordance WITH a preview of
  // what would change; the stored view is never silently replaced.
  const stale =
    (body.engineVersion !== null && body.engineVersion !== CORRIDOR_ENGINE_VERSION) ||
    (body.refBundleVersion !== null && body.refBundleVersion !== DEFAULT_BUNDLE.bundleId);
  let resolved: ResolvedScenario | null = null;
  try {
    resolved = resolveScenario(scenario, DEFAULT_BUNDLE);
  } catch {
    resolved = null; // per-tab result cards degrade gracefully
  }
  let previewGap: { stored: number; current: number } | null = null;
  if (stale && !recomputed && resolved) {
    try {
      const storedGap = (body.results as ScenarioResult | null)?.summary.gapPvUsdM;
      const currentGap = evaluateScenario(resolved).summary.gapPvUsdM;
      if (typeof storedGap === "number") {
        previewGap = { stored: storedGap, current: currentGap };
      }
    } catch {
      previewGap = null;
    }
  }
  return (
    <main className="mx-auto max-w-375 px-4 py-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">{body.name}</h1>
          <p className="text-[11px] text-neutral-500">
            {t("meta", {
              engine: body.engineVersion ?? "?",
              bundle: body.refBundleVersion ?? "?",
            })}
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          onClick={() => {
            localStorage.setItem(DRAFT_KEY, JSON.stringify(scenario));
            router.push("/corridor");
          }}
        >
          {t("openAsDraft")}
        </Button>
      </div>
      {stale && !recomputed && (
        <div className="mb-3 border border-amber-300 bg-amber-500/10 p-3 text-xs leading-snug text-amber-800">
          <p>
            {t("staleBanner", {
              engine: body.engineVersion ?? "?",
              bundle: body.refBundleVersion ?? "?",
              currentEngine: CORRIDOR_ENGINE_VERSION,
              currentBundle: DEFAULT_BUNDLE.bundleId,
            })}
          </p>
          {previewGap && (
            <p className="mt-1 tabular-nums">
              {t("stalePreview", {
                stored: previewGap.stored.toFixed(2),
                current: previewGap.current.toFixed(2),
                delta: (previewGap.current - previewGap.stored).toFixed(2),
              })}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              try {
                if (resolved) setRecomputed(evaluateScenario(resolved));
              } catch {
                /* payload cannot evaluate under current data — keep stored view */
              }
            }}
            className="mt-2 border border-amber-400 px-2.5 py-1 font-medium hover:bg-amber-500/20"
          >
            {t("recompute")}
          </button>
        </div>
      )}
      {recomputed && (
        <p className="mb-2 text-[11px] text-neutral-500">{t("recomputedNote")}</p>
      )}
      {/* Stored results are shown as saved unless the user opts into a
          recompute; never a silent swap. */}
      <ResultsPanel
        result={(recomputed ?? body.results) as never}
        scenario={scenario}
        resolved={resolved}
        error={(recomputed ?? body.results) ? null : t("noResults")}
      />
    </main>
  );
}
