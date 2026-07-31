import { redirect } from "next/navigation";

/**
 * The Explorer is no longer a separate surface — its full functionality
 * (map, layers, cell drawer, evaluate split) lives inside the integrated
 * corridor workspace. Old links land there.
 */
export default function ExplorerPage() {
  redirect("/corridor");
}
