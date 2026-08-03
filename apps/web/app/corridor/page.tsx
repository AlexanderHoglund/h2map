import CorridorIsland from "./CorridorIsland";
import { requireAccess } from "@/lib/server/access";

export const metadata = {
  title: "Green Corridor — Thaduberg",
  description:
    "Evaluate a green shipping corridor: the NPV cost gap between green and fossil fuel with EU ETS, FuelEU Maritime, IRA 45Z and custom regulation.",
};

export default async function CorridorPage() {
  await requireAccess("/corridor");
  return <CorridorIsland />;
}
