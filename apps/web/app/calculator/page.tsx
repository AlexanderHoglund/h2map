import { Suspense } from "react";
import type { Metadata } from "next";
import CalculatorClient from "@/components/calculator/CalculatorClient";

export const metadata: Metadata = {
  title: "LCOH Calculator — H2MAP",
  description:
    "Compute the levelized cost of green hydrogen for any location from local solar, wind, and grid supply.",
};

/**
 * Calculator view. The client component reads useSearchParams (?c= share
 * links and ?lat=&lon= Explorer handoff), so it must sit under Suspense.
 */
export default function CalculatorPage() {
  return (
    <Suspense>
      <CalculatorClient />
    </Suspense>
  );
}
