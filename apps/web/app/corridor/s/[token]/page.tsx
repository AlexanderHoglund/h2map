import type { Metadata } from "next";
import SharedViewer from "./SharedViewer";

export const metadata: Metadata = { title: "Shared corridor scenario — Thaduberg" };

/**
 * Anonymous read-only shared-scenario view. Deliberately PUBLIC (proxy
 * public list): the unguessable, revocable share token IS the capability —
 * gating it would defeat the point of share links.
 */
export default async function SharedScenarioPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SharedViewer token={token} />;
}
