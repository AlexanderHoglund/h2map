import type { Metadata } from "next";
import TopBar from "@/components/shell/TopBar";
import { requireAdmin } from "@/lib/server/access";
import AdminClient from "@/components/admin/AdminClient";

export const metadata: Metadata = { title: "User administration — Thaduberg" };

/** Minimal user administration: admins only (others land on the home page). */
export default async function AdminPage() {
  await requireAdmin("/admin");
  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <AdminClient />
      </main>
    </>
  );
}
