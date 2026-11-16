import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLeagueYears } from "@/lib/recap";
import LeagueRecapPage from "./[year]/page";

export async function generateMetadata(): Promise<Metadata> {
  const [latest] = await getLeagueYears();
  return { title: latest ? `${latest} League Recap` : "League" };
}

// /leagues shows the most recent season's recap. It renders the season page
// itself rather than redirecting to it: a redirect finishing a moment after
// the page appeared would cancel a header link clicked in between.
export default async function LeaguesPage() {
  const [latest] = await getLeagueYears();
  if (!latest) notFound();
  return (
    <LeagueRecapPage
      params={Promise.resolve({ year: String(latest) })}
      searchParams={Promise.resolve({})}
    />
  );
}
