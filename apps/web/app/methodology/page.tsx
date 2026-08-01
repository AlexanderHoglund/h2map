import { redirect } from "next/navigation";

/**
 * The methodology now lives as Part 2 of the unified documentation page.
 * This route is kept only so old links and bookmarks resolve — it permanently
 * redirects into the methodology anchor on /docs.
 */
export default function MethodologyPage() {
  redirect("/docs#m-overview");
}
