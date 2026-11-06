import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { isAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { matchStatus, statusHeadline } from "@/lib/match-status";
import { listMatchCodes, listPlayedPlayerNames, listScoringEvents, type ScoringEvent } from "@/lib/scoring";
import { deleteEventAction, deleteMatchAction, deleteMatchupAction } from "./actions";
import { ConfirmButton, MatchPlacement, NewEventForm, NewMatchForm, NewMatchupForm } from "./forms";

export const metadata: Metadata = {
  title: "Match play scoring",
  robots: { index: false },
};

export default async function AdminMatchPlayPage() {
  await connection();
  if (!(await isAdmin())) redirect("/admin");
  const events = listScoringEvents();
  const codes = listMatchCodes();
  const players = listPlayedPlayerNames();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <Link href="/admin" className="text-sm text-zinc-500 hover:underline">
          ← Admin
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Match play scoring</h1>
        <p className="max-w-2xl text-zinc-600 dark:text-zinc-400">
          Set up an event&apos;s matches, then give each card its match code. They open the{" "}
          <Link href="/scoring" className="underline">
            Scoring tab
          </Link>
          , pick their match, enter the code and record who took each hole. For team events, add the team matchups
          first; each match is worth a point toward its matchup, or half a point each when halved.
        </p>
      </div>

      <section className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-lg font-semibold">New event</h2>
        <NewEventForm />
      </section>

      {events.map((event) => (
        <EventSection key={event.id} event={event} codes={codes} players={players} />
      ))}
    </div>
  );
}

function EventSection({
  event,
  codes,
  players,
}: {
  event: ScoringEvent;
  codes: Map<number, string>;
  players: string[];
}) {
  const lastRound = Math.max(1, ...event.matches.map((m) => m.round));

  return (
    <section className="flex flex-col gap-5 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{event.name}</h2>
          {event.date && <p className="text-sm text-zinc-500">{formatDate(event.date)}</p>}
        </div>
        <form action={deleteEventAction}>
          <input type="hidden" name="eventId" value={event.id} />
          <ConfirmButton message={`Delete ${event.name} and all its matches and scores?`}>Delete event</ConfirmButton>
        </form>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Team matchups</h3>
        {event.matchups.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm">
            {event.matchups.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3">
                <span>
                  {m.teamA} vs {m.teamB}
                </span>
                <form action={deleteMatchupAction}>
                  <input type="hidden" name="matchupId" value={m.id} />
                  <ConfirmButton message={`Delete ${m.teamA} vs ${m.teamB} and its matches?`}>Delete</ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        )}
        <NewMatchupForm eventId={event.id} />
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Matches</h3>
        {event.matches.length === 0 ? (
          <p className="text-sm text-zinc-500">No matches yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th className="px-3 py-2 font-medium">Match</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Code</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                {event.matches.map((m) => (
                  <tr key={m.id}>
                    <td className="px-3 py-2">
                      <Link href={`/scoring/${m.id}`} className="font-medium hover:underline">
                        {m.sideA} vs {m.sideB}
                      </Link>
                      <span className="block text-xs text-zinc-500">
                        {[m.label, `${m.holes} holes`].filter(Boolean).join(" · ")}
                      </span>
                      <MatchPlacement
                        key={`${m.id}-${m.round}-${m.matchupId}`}
                        matchId={m.id}
                        matchupId={m.matchupId}
                        round={m.round}
                        matchups={event.matchups}
                        rounds={lastRound}
                      />
                    </td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                      {statusHeadline(matchStatus(m.results), m.sideA, m.sideB)}
                    </td>
                    <td className="px-3 py-2 font-mono text-base tracking-widest">{codes.get(m.id)}</td>
                    <td className="px-3 py-2 text-right">
                      <form action={deleteMatchAction}>
                        <input type="hidden" name="matchId" value={m.id} />
                        <ConfirmButton message={`Delete ${m.sideA} vs ${m.sideB} and its scores?`}>Delete</ConfirmButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-2 rounded-md border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
          <h4 className="mb-3 text-sm font-semibold">Add a match</h4>
          <NewMatchForm
            eventId={event.id}
            matchups={event.matchups}
            players={players}
            lastRound={lastRound}
          />
        </div>
      </div>
    </section>
  );
}
