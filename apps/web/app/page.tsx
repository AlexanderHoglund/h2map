import type { Metadata } from "next";
import { getServerComponentSupabase } from "@/lib/supabase/server";
import LandingClient from "@/components/landing/LandingClient";

export const metadata: Metadata = {
  title: "Thaduberg — Green corridor & hydrogen cost platform",
  description:
    "Sign in to the Thaduberg platform: the green-corridor cost model and the global LCOH map.",
};

/**
 * Public landing page: the only ungated page. Shows sign-in / request-access
 * when anonymous, and an "enter platform" card when a session cookie is
 * present. The session read here is optimistic display state — real access
 * control lives in the proxy + requireAccess() (PR 3) and the API routes.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; authError?: string }>;
}) {
  const params = await searchParams;
  const supabase = await getServerComponentSupabase();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  let isAdmin = false;
  if (claims) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", claims.sub)
      .maybeSingle();
    isAdmin = profile?.is_admin === true;
  }

  return (
    <LandingClient
      initialEmail={claims ? ((claims.email as string) ?? null) : null}
      isAdmin={isAdmin}
      nextPath={params.next ?? null}
      authError={params.authError ?? null}
    />
  );
}
