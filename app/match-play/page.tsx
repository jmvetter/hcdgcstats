import type { Metadata } from "next";
import Link from "next/link";
import { getPlayers } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { RoundScores } from "@/app/components/round-scores";
import { groupByRound, matchStatus, statusHeadline, teamTotals } from "@/lib/match-status";
import { listScoringEvents, type ScoringEvent, type ScoringMatch } from "@/lib/scoring";
import {
  formatPoints,
  MATCH_PLAY_EVENTS,
  matchStandings,
  TEAM_MATCH_PLAY_EVENTS,
  teamStandings,
  type Match,
  type MatchPlayEvent,
  type MatchRound,
  type TeamMatch,
  type TeamMatchPlayEvent,
} from "@/lib/match-play";

export const metadata: Metadata = {
  title: "Match Play",
};

type Names = Map<string, string>;

export default async function MatchPlayPage() {
  const names: Names = new Map((await getPlayers()).map((p) => [p.id, p.name]));
  // Events scored live on the Scoring tab, newest first.
  const scored = listScoringEvents().filter((e) => e.matches.length > 0);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Match Play</h1>
        <p className="text-zinc-600 dark:text-zinc-400">This year&apos;s match play events, and who beat who.</p>
      </div>
      {scored.map((event) => (
        <ScoredEventSection key={`scored-${event.id}`} event={event} />
      ))}
      {TEAM_MATCH_PLAY_EVENTS.map((event) => (
        <TeamEventSection key={event.id} event={event} />
      ))}
      {MATCH_PLAY_EVENTS.map((event) => (
        <EventSection key={event.id} event={event} names={names} />
      ))}
    </div>
  );
}

function ScoredEventSection({ event }: { event: ScoringEvent }) {
  const done = (m: ScoringMatch) => matchStatus(m.results).finished;
  const live = event.matches.filter((m) => !done(m)).length;
  const groups = [
    ...event.matchups.map((mu) => ({
      key: `mu-${mu.id}`,
      matchup: mu,
      matches: event.matches.filter((m) => m.matchupId === mu.id),
    })),
    { key: "loose", matchup: null, matches: event.matches.filter((m) => m.matchupId === null) },
  ].filter((g) => g.matches.length > 0);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{event.name}</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {[event.date && formatDate(event.date), `${event.matches.length} matches`].filter(Boolean).join(" · ")}
        </p>
        {live > 0 && (
          <p className="text-sm">
            {live} {live === 1 ? "match is" : "matches are"} still being played.{" "}
            <Link href="/scoring" className="font-medium underline">
              Follow live on the Scoring tab →
            </Link>
          </p>
        )}
      </div>

      {groups.map(({ key, matchup, matches }) => {
        const finished = matches.filter(done);
        const totals = teamTotals(matches);
        return (
          <div key={key} className="flex flex-col gap-2">
            {matchup && (
              <>
                <h3 className="text-base font-semibold">
                  {matchup.teamA} {formatPoints(totals.a)} – {formatPoints(totals.b)} {matchup.teamB}
                  <span className="ml-2 text-sm font-normal text-zinc-500">{totals.live ? "so far" : "final"}</span>
                </h3>
                <RoundScores teamA={matchup.teamA} teamB={matchup.teamB} matches={matches} />
              </>
            )}
            {groupByRound(finished).map(({ round, matches: roundMatches }) => (
              <div key={round} className="flex flex-col gap-1.5">
                <h4 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">Round {round}</h4>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {roundMatches.map((m) => (
                    <li
                      key={m.id}
                      className="flex flex-col rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                    >
                      <span className="font-semibold">{statusHeadline(matchStatus(m.results), m.sideA, m.sideB)}</span>
                      <span className="text-zinc-500">
                        {[`${m.sideA} vs ${m.sideB}`, m.label].filter(Boolean).join(" · ")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        );
      })}
    </section>
  );
}

function TeamEventSection({ event }: { event: TeamMatchPlayEvent }) {
  const standings = teamStandings(event);
  const ours = standings.find((s) => s.team === event.ourTeam);
  const sections = [
    { name: "Final", matches: [event.final] },
    { name: "Third place", matches: [event.thirdPlace] },
    ...[...event.rounds].reverse(),
  ];

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{event.name}</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {[event.description, event.date && formatDate(event.date)].filter(Boolean).join(" · ")}
        </p>
        <p className="mt-2 text-lg">
          Champions: <span className="font-semibold">{standings[0].team}</span>
        </p>
        {ours && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {ours.team} went {ours.wins}–{ours.losses}, winning {formatPoints(ours.pointsFor)} points to{" "}
            {formatPoints(ours.pointsAgainst)}.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-base font-semibold">Results</h3>
        {sections.map((round) => (
          <div key={round.name} className="flex flex-col gap-2">
            <h4 className="text-sm text-zinc-500">{round.name}</h4>
            <ul className="grid gap-2 sm:grid-cols-2">
              {round.matches.map((match) => (
                <TeamMatchCard key={`${match.a}-${match.b}`} match={match} ourTeam={event.ourTeam} />
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-base font-semibold">Final standings</h3>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
              <tr>
                <th className="w-16 px-4 py-3 text-right font-medium">Place</th>
                <th className="px-4 py-3 font-medium">Team</th>
                <th className="w-14 px-4 py-3 text-right font-medium">W</th>
                <th className="w-14 px-4 py-3 text-right font-medium">L</th>
                <th className="w-20 px-4 py-3 text-right font-medium">Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {standings.map((s) => (
                <tr key={s.team} className={s.team === event.ourTeam ? "font-semibold" : undefined}>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {s.tied ? "T" : ""}
                    {s.place}
                  </td>
                  <td className="px-4 py-3">{s.team}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.wins}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.losses}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatPoints(s.pointsFor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function TeamMatchCard({ match, ourTeam }: { match: TeamMatch; ourTeam: string }) {
  const ours = match.a === ourTeam || match.b === ourTeam;
  const rows = [
    { team: match.a, points: match.aPoints, won: match.aPoints > match.bPoints },
    { team: match.b, points: match.bPoints, won: match.bPoints > match.aPoints },
  ].sort((x, y) => y.points - x.points);
  return (
    <li
      className={`flex flex-col rounded-md border bg-white px-3 py-2 text-sm dark:bg-zinc-950 ${
        ours ? "border-emerald-600 dark:border-emerald-500" : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      {rows.map((r) => (
        <span key={r.team} className={`flex items-baseline gap-2 ${r.won ? "font-semibold" : "text-zinc-500"}`}>
          {r.team}
          <span className="ml-auto tabular-nums">{formatPoints(r.points)}</span>
        </span>
      ))}
    </li>
  );
}

function EventSection({ event, names }: { event: MatchPlayEvent; names: Names }) {
  const standings = matchStandings(event);
  const champion = standings[0];
  const entrant = (seed: number) => {
    const playerId = event.entrants.find((e) => e.seed === seed)!.playerId;
    return { seed, playerId, name: names.get(playerId) ?? playerId };
  };

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{event.name}</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {[event.description, event.date && formatDate(event.date)].filter(Boolean).join(" · ")}
        </p>
        <p className="mt-2 text-lg">
          Champion:{" "}
          <Link href={`/players/${champion.playerId}`} className="font-semibold hover:underline">
            {entrant(champion.seed).name}
          </Link>
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-base font-semibold">Final standings</h3>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
              <tr>
                <th className="w-16 px-4 py-3 text-right font-medium">Place</th>
                <th className="px-4 py-3 font-medium">Player</th>
                <th className="w-16 px-4 py-3 text-right font-medium">Seed</th>
                <th className="w-14 px-4 py-3 text-right font-medium">W</th>
                <th className="w-14 px-4 py-3 text-right font-medium">L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {standings.map((s) => (
                <tr key={s.seed}>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {s.tied ? "T" : ""}
                    {s.place}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/players/${s.playerId}`} className="font-medium hover:underline">
                      {entrant(s.seed).name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-500">{s.seed}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.wins}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.losses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Bracket title="Final" rounds={event.final} entrant={entrant} />
      <Bracket title="Winners bracket" rounds={event.winners} entrant={entrant} />
      <Bracket title="Losers bracket" rounds={event.losers} entrant={entrant} />
    </section>
  );
}

type Entrant = (seed: number) => { seed: number; playerId: string; name: string };

function Bracket({ title, rounds, entrant }: { title: string; rounds: MatchRound[]; entrant: Entrant }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-base font-semibold">{title}</h3>
      {rounds.map((round) => (
        <div key={round.name} className="flex flex-col gap-2">
          <h4 className="text-sm text-zinc-500">{round.name}</h4>
          <ul className="grid gap-2 sm:grid-cols-2">
            {round.matches.map((match) => (
              <MatchCard key={`${match.a}-${match.b}`} match={match} entrant={entrant} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function MatchCard({ match, entrant }: { match: Match; entrant: Entrant }) {
  const winner = entrant(match.winner);
  const beaten = entrant(match.winner === match.a ? match.b : match.a);
  return (
    <li className="flex flex-col rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950">
      <span className="flex items-baseline gap-2">
        <span className="w-5 text-right text-xs tabular-nums text-zinc-500">{winner.seed}</span>
        <Link href={`/players/${winner.playerId}`} className="font-semibold hover:underline">
          {winner.name}
        </Link>
        <span className="ml-auto text-xs text-zinc-500">{match.score ?? "Won"}</span>
      </span>
      <span className="flex items-baseline gap-2 text-zinc-500">
        <span className="w-5 text-right text-xs tabular-nums">{beaten.seed}</span>
        <Link href={`/players/${beaten.playerId}`} className="hover:underline">
          {beaten.name}
        </Link>
      </span>
    </li>
  );
}
