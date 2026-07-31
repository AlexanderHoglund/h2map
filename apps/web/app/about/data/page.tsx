import Footer from "@/components/shell/Footer";

export const metadata = { title: "About the data — Thaduberg" };

export default function AboutDataPage() {
  return (
    <>
      <main className="mx-auto max-w-3xl px-4 py-10 text-sm leading-6">
        <h1 className="text-2xl font-semibold tracking-tight">About the data</h1>

        <h2 className="mt-8 text-lg font-medium">Methodology</h2>
        <p className="mt-2">
          Thaduberg re-implements the published Chilean LCOH methodology — «Motor
          de Cálculo LCOH: Principales características», Ministerio de Energía
          de Chile / Centro de Energía FCFM U. de Chile / USACH / PUC, April
          2024 — as an open, global calculation engine. With all reference
          flags at their defaults the engine reproduces the source
          methodology literally; the cost decomposition sums exactly to the
          headline LCOH by construction. Validation includes closed-form
          analytical cases and a 47-project parity check against the
          published Chilean results (Spearman ρ 0.85).
        </p>

        <h2 className="mt-8 text-lg font-medium">Resource data</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5">
          <li>
            <strong>Solar PV:</strong> PVGIS © European Commission, Joint
            Research Centre — hourly PV output from the PVGIS model
            (mounting geometry, temperature losses; 14 % system loss,
            1 kWp normalization).
          </li>
          <li>
            <strong>Wind:</strong> Weather data by{" "}
            <a href="https://open-meteo.com/" className="text-brand underline underline-offset-2 decoration-brand/30 hover:decoration-brand">
              Open-Meteo.com
            </a>{" "}
            (CC BY 4.0), based on ERA5 (Copernicus Climate Change Service).
            Two-height shear extrapolation to hub height and a generic
            5.6 MW turbine curve (profile shape only).
          </li>
          <li>
            <strong>Fallbacks:</strong> NASA POWER (NASA Langley Research
            Center) for wind; a labeled low-fidelity GHI proxy for PV.
            Responses always name the provider and dataset behind a result.
          </li>
        </ul>
        <p className="mt-2">
          Hourly profiles are typical meteorological years built with
          Finkelstein–Schafer month selection over roughly a decade of data,
          cached per 0.1° cell. The Explorer&apos;s hexagons show a reference
          configuration (100 MW electrolyzer, best PV/wind mix of a 200 MW
          renewable total, LCOE-priced at 30 USD/MWh) computed with the same
          engine.
        </p>

        <h2 className="mt-8 text-lg font-medium">Basemap</h2>
        <p className="mt-2">
          Basemap tiles © CARTO, map data ©{" "}
          <a href="https://www.openstreetmap.org/copyright" className="text-brand underline underline-offset-2 decoration-brand/30 hover:decoration-brand">
            OpenStreetMap
          </a>{" "}
          contributors. Non-commercial use.
        </p>
      </main>
      <Footer />
    </>
  );
}
