import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AutoRefresh } from "@/app/components/auto-refresh";
import { formatDate } from "@/lib/format";
import { RoundScores } from "@/app/components/round-scores";
import { groupByRound, matchStatus, statusDetail, statusHeadline, teamTotals } from "@/lib/match-status";
import { formatPoints } from "@/lib/match-play";
import { listScoringEvents, type ScoringMatch, type ScoringMatchup } from "@/lib/scoring";

export const metadata: Metadata = {
  title: "Scoring",
};

export default async function ScoringPage() {
  await connection();
  const events = listScoringEvents().filter((e) => e.matches.length > 0);

  return (
    <div className="flex flex-col gap-8">
      <AutoRefresh seconds={20} />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Scoring</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Live match play scores. Pick your match to keep score; you&apos;ll need the code from the organizer.
        </p>
      </div>

      {events.length === 0 && <p className="text-zinc-500">No matches are set up yet.</p>}

      {events.map((event) => {
        const loose = event.matches.filter((m) => m.matchupId === null);
        return (
          <section key={event.id} className="flex flex-col gap-4">
            <div>
              <h2 className="text-xl font-semibold">{event.name}</h2>
              {event.date && <p className="text-sm text-zinc-500">{formatDate(event.date)}</p>}
            </div>
            {event.matchups.map((mu) => (
              <MatchupBlock key={mu.id} matchup={mu} matches={event.matches.filter((m) => m.matchupId === mu.id)} />
            ))}
            {loose.length > 0 && <RoundGroups matches={loose} />}
          </section>
        );
      })}
    </div>
  );
}

function MatchupBlock({ matchup, matches }: { matchup: ScoringMatchup; matches: ScoringMatch[] }) {
  const { a, b, live } = teamTotals(matches);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-lg bg-zinc-100 px-4 py-3 dark:bg-zinc-900">
        <p className="text-lg font-semibold">
          {matchup.teamA} <span className="tabular-nums">{formatPoints(a)}</span>
          <span className="px-2 text-zinc-400">–</span>
          <span className="tabular-nums">{formatPoints(b)}</span> {matchup.teamB}
        </p>
        <p className="text-sm text-zinc-500">
          {matches.length === 0 ? "No matches yet" : live ? `${live} of ${matches.length} matches still playing` : "Final"}
        </p>
      </div>
      {matches.length > 0 && (
        <>
          <RoundScores teamA={matchup.teamA} teamB={matchup.teamB} matches={matches} />
          <RoundGroups matches={matches} matchup={matchup} />
        </>
      )}
    </div>
  );
}

// Matches under a heading per round, with that round's team score when the
// matches belong to a team matchup.
function RoundGroups({ matches, matchup }: { matches: ScoringMatch[]; matchup?: ScoringMatchup }) {
  return (
    <div className="flex flex-col gap-3">
      {groupByRound(matches).map(({ round, matches }) => {
        const t = teamTotals(matches);
        return (
          <div key={round} className="flex flex-col gap-1.5">
            <h3 className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
              <span className="font-semibold">Round {round}</span>
              {matchup && (
                <span className="text-zinc-500">
                  {matchup.teamA} {formatPoints(t.a)} – {formatPoints(t.b)} {matchup.teamB}
                  {t.live ? " · playing" : " · final"}
                </span>
              )}
            </h3>
            <MatchList matches={matches} />
          </div>
        );
      })}
    </div>
  );
}

function MatchList({ matches }: { matches: ScoringMatch[] }) {
  return (
    <ul className="flex flex-col divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-900 dark:border-zinc-800 dark:bg-zinc-950">
      {matches.map((m) => {
        const s = matchStatus(m.results);
        return (
          <li key={m.id}>
            <Link
              href={`/scoring/${m.id}`}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900"
            >
              <span className="flex flex-col">
                <span className="text-base font-medium">
                  {m.sideA} vs {m.sideB}
                </span>
                {m.label && <span className="text-xs text-zinc-500">{m.label}</span>}
              </span>
              <span className="flex flex-col text-right">
                <span className={`text-sm font-semibold ${s.finished ? "" : "text-zinc-700 dark:text-zinc-300"}`}>
                  {statusHeadline(s, m.sideA, m.sideB)}
                </span>
                <span className="text-xs text-zinc-500">{statusDetail(s)}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
