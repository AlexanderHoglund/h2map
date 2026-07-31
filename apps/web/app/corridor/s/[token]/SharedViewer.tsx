"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { parseScenarioInput, type ScenarioInput } from "@h2map/corridor-schema";

/**
 * Read-only shared-scenario view (build-plan 2.2/3.5): the link carries only
 * the token; payload + stored results come from the DB row. "Open as draft"
 * copies the payload into the local draft and enters the corridor tool.
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
        const scenario = parseScenarioInput(body.payload);
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
    return <main className="mx-auto max-w-2xl px-4 py-16 text-sm text-neutral-500">…</main>;
  }
  if (state.phase === "error") {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-sm text-neutral-500">
        {t("notFound")}
      </main>
    );
  }

  const { body, scenario } = state;
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
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
        <button
          type="button"
          onClick={() => {
            localStorage.setItem("corridor-draft-v1", JSON.stringify(scenario));
            router.push("/corridor");
          }}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
        >
          {t("openAsDraft")}
        </button>
      </div>
      {/* Stored results are shown as saved; the engine can re-derive them from
          the payload at any time (server recomputes on save). */}
      <ResultsPanel
        result={body.results as never}
        scenario={scenario}
        error={body.results ? null : t("noResults")}
      />
    </main>
  );
}
