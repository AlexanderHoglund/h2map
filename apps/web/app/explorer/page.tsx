import Hexplorer from "@/components/hexplorer/Hexplorer";

/**
 * Explorer: hexagon-choropleth world map of levelized hydrogen cost.
 * The page sits under the fixed 48px top bar (root layout pads with pt-12),
 * so the map container fills the remaining viewport height.
 */
export default function ExplorerPage() {
  return (
    <div className="relative h-[calc(100dvh-3rem)] w-full overflow-hidden">
      <Hexplorer />
    </div>
  );
}
