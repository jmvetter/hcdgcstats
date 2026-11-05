import type { Metadata } from "next";
import Link from "next/link";
import { TypeFilter } from "@/app/components/type-filter";
import { getEventSummaries, parseTypeFilter } from "@/lib/data";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Events",
};

export default async function EventsPage({ searchParams }: PageProps<"/events">) {
  const type = parseTypeFilter((await searchParams).type);
  const events = await getEventSummaries({ type });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Click an event to see its results by division. Leagues show each week&apos;s results.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <TypeFilter type={type} href={(t) => (t ? `/events?type=${t}` : "/events")} />
        <Link href="/match-play" className="font-medium hover:underline">
          Match play →
        </Link>
      </div>

      {events.length === 0 ? (
        <p className="text-zinc-500">No events here yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Event</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 text-right font-medium">Rounds</th>
                <th className="px-4 py-3 text-right font-medium">Players</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {events.map((e) => (
                <tr key={e.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900">
                  <td className="whitespace-nowrap px-4 py-3">{formatDate(e.firstDate)}</td>
                  <td className="px-4 py-3">
                    <Link href={`/events/${e.id}`} className="font-medium hover:underline">
                      {e.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{e.type}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{e.rounds || "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{e.players}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
