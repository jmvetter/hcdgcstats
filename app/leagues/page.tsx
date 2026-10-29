import { notFound, redirect } from "next/navigation";
import { getLeagueYears } from "@/lib/recap";

// /leagues opens the most recent season's recap.
export default async function LeaguesPage() {
  const [latest] = await getLeagueYears();
  if (!latest) notFound();
  redirect(`/leagues/${latest}`);
}
