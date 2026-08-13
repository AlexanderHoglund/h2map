import TopBar from "@/components/shell/TopBar";
import Footer from "@/components/shell/Footer";
import { requireAccess } from "@/lib/server/access";
import FuelEmissionsPanel from "@/components/fuelemissions/FuelEmissionsPanel";

export const metadata = {
  title: "Fuel Emissions Calculator — Thaduberg",
  description:
    "Avoided emissions of a candidate marine fuel against a fossil baseline on the energy-delivered functional unit, under FuelEU Maritime (Annex II) or the IMO LCA Guidelines — with the pilot-fuel floor and the ammonia N2O uncertainty made explicit.",
};

export default async function FuelEmissionsPage() {
  await requireAccess("/fuelemissionscalculator");
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Fuel Emissions Calculator
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-neutral-600">
          Avoided emissions of a candidate marine fuel against a fossil
          baseline, computed on the functional unit of{" "}
          <strong>energy delivered on board (MJ)</strong>{" "}— a tonne of green
          fuel does not replace a tonne of fossil fuel. Framework default
          values are never blended; every factor carries its citation; the
          methodology and full source list live in the{" "}
          <a href="/docs#fe-overview" className="text-brand underline">
            documentation
          </a>
          .
        </p>
        <div className="mt-6">
          <FuelEmissionsPanel />
        </div>
      </main>
      <Footer />
    </div>
  );
}
