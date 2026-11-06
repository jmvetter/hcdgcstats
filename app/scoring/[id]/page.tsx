import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AutoRefresh } from "@/app/components/auto-refresh";
import { canScoreMatch, getMatchup, getScoringEventName, getScoringMatch } from "@/lib/scoring";
import { Scorecard } from "./scorecard";

export const metadata: Metadata = {
  title: "Match scoring",
  robots: { index: false },
};

export default async function ScoringMatchPage({ params }: PageProps<"/scoring/[id]">) {
  await connection();
  const match = getScoringMatch(Number((await params).id));
  if (!match) notFound();
  const matchup = match.matchupId !== null ? getMatchup(match.matchupId) : undefined;

  return (
    <>
      <AutoRefresh seconds={15} />
      <Scorecard
        match={match}
        eventName={getScoringEventName(match.eventId) ?? ""}
        teams={matchup ? { a: matchup.teamA, b: matchup.teamB } : null}
        canScore={await canScoreMatch(match.id)}
      />
    </>
  );
}
