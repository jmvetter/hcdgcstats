import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PdgaLink } from "@/app/components/pdga-link";
import { getEvent, getEventEntries, type EventEntry, type EventRound } from "@/lib/data";
import { formatDate, formatToPar, pdgaEventUrl, pdgaPlayerUrl } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/events/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: (await getEvent(id))?.name ?? "Event not found" };
}

export default async function EventPage({ params, searchParams }: PageProps<"/events/[id]">) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) notFound();
  const entries = await getEventEntries(id);
  const allRounds = entries.flatMap((e) => e.rounds);

  // Leagues place players each week. One imported before round places were
  // stored falls through to the overall results, like the player page.
  const weeks =
    event.type === "League" ? [...new Set(allRounds.filter((r) => r.place !== null).map((r) => r.round))].sort((a, b) => a - b) : [];
  const requested = Number((await searchParams).week);
  const week = weeks.includes(requested) ? requested : weeks.at(-1);

  const dates = allRounds.flatMap((r) => (r.date ? [r.date] : [])).sort();
  const first = dates[0] ?? event.date;
  const last = dates.at(-1) ?? event.date;
  const layouts = uniqueLayouts(allRounds);
  const courses = [...new Set(layouts.map((l) => l.course))];
  const courseNames = courses.length ? courses : event.course ? [event.course] : [];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <Link href="/events" className="text-sm text-zinc-500 hover:underline">
          ← All events
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">
          {event.name}
          <PdgaLink href={pdgaEventUrl(event.id)} label={event.name} />
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          {[
            event.type,
            first === last ? formatDate(first) : `${formatDate(first)} – ${formatDate(last)}`,
            `${entries.length} ${entries.length === 1 ? "player" : "players"}`,
            ...courseNames,
          ].join(" · ")}
        </p>
      </div>

      {week !== undefined ? (
        <WeekResults eventId={event.id} entries={entries} weeks={weeks} week={week} />
      ) : (
        <FinalResults entries={entries} />
      )}
    </div>
  );
}

function WeekResults({
  eventId,
  entries,
  weeks,
  week,
}: {
  eventId: string;
  entries: EventEntry[];
  weeks: number[];
  week: number;
}) {
  const played = entries.flatMap((e) => {
    const round = e.rounds.find((r) => r.round === week);
    return round ? [{ entry: e, round }] : [];
  });
  const date = played.find((p) => p.round.date)?.round.date;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <nav aria-label="Week" className="flex flex-wrap gap-1.5 text-sm">
          {weeks.map((w) => (
            <Link
              key={w}
              href={`/events/${eventId}?week=${w}`}
              scroll={false}
              aria-current={w === week ? "page" : undefined}
              className={`rounded-full border px-3 py-1 ${
                w === week
                  ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                  : "border-zinc-200 text-zinc-600 hover:text-black dark:border-zinc-800 dark:text-zinc-400 dark:hover:text-white"
              }`}
            >
              Week {w}
            </Link>
          ))}
        </nav>
        <p className="text-sm text-zinc-500">
          {date && `${formatDate(date)} · `}
          {played.length} {played.length === 1 ? "player" : "players"}
        </p>
      </div>

      {groupByDivision(played, (p) => p.entry.division).map(([division, rows]) => {
        const sorted = [...rows].sort(
          (a, b) => (a.round.place ?? Infinity) - (b.round.place ?? Infinity) || a.round.score - b.round.score,
        );
        const rated = rows.some((r) => r.round.rating !== null);
        return (
          <div key={division} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <h2 className="text-lg font-semibold">{division}</h2>
              <LayoutLinks layouts={uniqueLayouts(rows.map((r) => r.round))} />
            </div>
            <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
                  <tr>
                    <th className="w-12 sm:w-16 px-2.5 py-3 sm:px-4 text-right font-medium">Place</th>
                    <th className="px-2.5 py-3 sm:px-4 font-medium">Player</th>
                    <th className="w-14 sm:w-20 px-2.5 py-3 sm:px-4 text-right font-medium">Score</th>
                    <th className="w-14 sm:w-20 px-2.5 py-3 sm:px-4 text-right font-medium">To par</th>
                    {rated && <th className="w-14 sm:w-20 px-2.5 py-3 sm:px-4 text-right font-medium">Rating</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                  {sorted.map(({ entry, round }) => (
                    <tr key={entry.playerId}>
                      <td className="px-2.5 py-3 sm:px-4 text-right tabular-nums">
                        {placeLabel(round.place, rows.map((r) => r.round.place))}
                      </td>
                      <td className="px-2.5 py-3 sm:px-4">
                        <PlayerLink entry={entry} />
                      </td>
                      <td className="px-2.5 py-3 sm:px-4 text-right tabular-nums">{round.score}</td>
                      <td className="px-2.5 py-3 sm:px-4 text-right tabular-nums">{formatToPar(round.toPar)}</td>
                      {rated && <td className="px-2.5 py-3 sm:px-4 text-right tabular-nums">{round.rating ?? "—"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function FinalResults({ entries }: { entries: EventEntry[] }) {
  if (entries.length === 0) return <p className="text-zinc-500">No results for this event yet.</p>;
  const layouts = uniqueLayouts(entries.flatMap((e) => e.rounds));

  return (
    <section className="flex flex-col gap-6">
      {layouts.length > 0 && <LayoutLinks layouts={layouts} />}
      {groupByDivision(entries, (e) => e.division).map(([division, rows]) => {
        // Players who didn't finish have no place, and go last.
        const sorted = [...rows].sort(
          (a, b) => (a.place ?? Infinity) - (b.place ?? Infinity) || (a.score ?? Infinity) - (b.score ?? Infinity),
        );
        const rounds = [...new Set(rows.flatMap((e) => e.rounds.map((r) => r.round)))].sort((a, b) => a - b);
        return (
          <div key={division} className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{division}</h2>
            <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
                  <tr>
                    <th className="w-12 sm:w-16 px-2.5 py-3 sm:px-4 text-right font-medium">Place</th>
                    <th className="px-2.5 py-3 sm:px-4 font-medium">Player</th>
                    {rounds.map((n) => (
                      <th key={n} className="w-14 px-2 py-3 sm:px-3 text-right font-medium">
                        R{n}
                      </th>
                    ))}
                    <th className="w-14 sm:w-20 px-2.5 py-3 sm:px-4 text-right font-medium">Total</th>
                    <th className="w-14 sm:w-20 px-2.5 py-3 sm:px-4 text-right font-medium">To par</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                  {sorted.map((e) => (
                    <tr key={e.playerId}>
                      <td className="px-2.5 py-3 sm:px-4 text-right tabular-nums">
                        {placeLabel(e.place, rows.map((r) => r.place))}
                      </td>
                      <td className="px-2.5 py-3 sm:px-4">
                        <PlayerLink entry={e} />
                      </td>
                      {rounds.map((n) => (
                        <td key={n} className="px-2 py-3 sm:px-3 text-right tabular-nums text-zinc-500">
                          {e.rounds.find((r) => r.round === n)?.score ?? "—"}
                        </td>
                      ))}
                      <td className="px-2.5 py-3 sm:px-4 text-right font-medium tabular-nums">{e.score ?? "—"}</td>
                      <td className="px-2.5 py-3 sm:px-4 text-right tabular-nums">{formatToPar(e.toPar)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function PlayerLink({ entry }: { entry: EventEntry }) {
  return (
    <>
      <Link href={`/players/${entry.playerId}`} className="font-medium hover:underline">
        {entry.name}
      </Link>
      <PdgaLink href={pdgaPlayerUrl(entry.pdgaNumber)} label={entry.name} />
    </>
  );
}

function LayoutLinks({ layouts }: { layouts: { id: string; name: string; course: string }[] }) {
  return (
    <p className="text-sm text-zinc-500">
      {layouts.map((l, i) => (
        <span key={l.id}>
          {i > 0 && " · "}
          <Link href={`/layouts/${l.id}`} className="hover:underline">
            {l.name}
          </Link>
        </span>
      ))}
    </p>
  );
}

function uniqueLayouts(rounds: EventRound[]) {
  const layouts = new Map<string, { id: string; name: string; course: string }>();
  for (const r of rounds) {
    if (r.layoutId && r.layoutName && r.course) {
      layouts.set(r.layoutId, { id: r.layoutId, name: r.layoutName, course: r.course });
    }
  }
  return [...layouts.values()];
}

function groupByDivision<T>(rows: T[], division: (row: T) => string | null): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const name = division(row) ?? "No division";
    groups.set(name, [...(groups.get(name) ?? []), row]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

// "T2" when others in the division share the place.
function placeLabel(place: number | null, places: (number | null)[]): string {
  if (place === null) return "—";
  return places.filter((p) => p === place).length > 1 ? `T${place}` : String(place);
}
