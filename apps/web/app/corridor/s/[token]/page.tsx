import SharedViewer from "./SharedViewer";

export const metadata = {
  title: "Shared corridor scenario — H2MAP",
};

export default async function SharedScenarioPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SharedViewer token={token} />;
}
