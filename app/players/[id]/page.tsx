import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TypeFilter } from "@/app/components/type-filter";
import {
  computeStats,
  getPlayer,
  getPlayerFinishes,
  getPlayerLayouts,
  getPlayerRoundRatings,
  parseTypeFilter,
} from "@/lib/data";
import { formatDate, formatToPar } from "@/lib/format";

export async function generateMetadata({
  params,
}: PageProps<"/players/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: (await getPlayer(id))?.name ?? "Player not found" };
}

export default async function PlayerPage({ params, searchParams }: PageProps<"/players/[id]">) {
  const { id } = await params;
  const type = parseTypeFilter((await searchParams).type);
  const player = await getPlayer(id);
  if (!player) notFound();

  const [finishes, layouts, ratings] = await Promise.all([
    getPlayerFinishes(player.id, { type }),
    getPlayerLayouts(player.id),
    getPlayerRoundRatings(player.id, { type }),
  ]);
  const stats = computeStats(finishes, ratings);
  const location = [player.city, player.stateProv].filter(Boolean).join(", ");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <Link href="/players" className="text-sm text-zinc-500 hover:underline">
          ← All players
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{player.name}</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          {[
            player.division,
            player.pdgaNumber && `PDGA #${player.pdgaNumber}`,
            location,
            `Member since ${formatDate(player.joined)}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          Each league round (week) counts as a finish; tournaments count their final place.
        </p>
        <TypeFilter
          type={type}
          href={(t) => `/players/${player.id}${t ? `?type=${t.toLowerCase()}` : ""}`}
        />
      </div>

      <dl className="-mt-4 grid grid-cols-2 gap-4 sm:grid-cols-6">
        <Stat
          label="PDGA rating"
          value={player.rating ?? "—"}
          sub={player.ratingDate ? `as of ${formatDate(player.ratingDate)}` : undefined}
        />
        <Stat label="Finishes" value={stats.finishes} />
        <Stat label="Wins" value={stats.wins} />
        <Stat label="Podiums" value={stats.podiums} />
        <Stat label="Avg place" value={stats.avgPlace?.toFixed(1) ?? "—"} />
        <Stat
          label="Avg round rating"
          value={stats.avgRating !== null ? Math.round(stats.avgRating) : "—"}
          sub={stats.ratedRounds ? `${stats.ratedRounds} rated rounds` : undefined}
        />
      </dl>

      {layouts.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Layouts</h2>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
                <tr>
                  <th className="px-4 py-3 font-medium">Layout</th>
                  <th className="px-4 py-3 text-right font-medium">Rounds</th>
                  <th className="px-4 py-3 text-right font-medium">Avg score</th>
                  <th className="px-4 py-3 text-right font-medium">Best</th>
                  <th className="px-4 py-3 text-right font-medium">Club rank</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                {layouts.map((l) => (
                  <tr key={l.layout.id}>
                    <td className="px-4 py-3">
                      <Link href={`/layouts/${l.layout.id}`} className="font-medium hover:underline">
                        {l.layout.course} – {l.layout.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{l.rounds}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{l.avgScore.toFixed(1)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{l.best}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {l.clubRank ? `${l.clubRank} of ${l.clubPlayers}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Finishes</h2>
        {finishes.length === 0 ? (
          <p className="text-zinc-500">No {type ? `${type.toLowerCase()} ` : ""}finishes yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Event</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Div</th>
                  <th className="px-4 py-3 text-right font-medium">Place</th>
                  <th className="px-4 py-3 text-right font-medium">Score</th>
                  <th className="px-4 py-3 text-right font-medium">To par</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                {finishes.map((r) => (
                  <tr key={`${r.eventId}|${r.round ?? "final"}`}>
                    <td className="whitespace-nowrap px-4 py-3">{formatDate(r.date)}</td>
                    <td className="px-4 py-3">
                      {r.event.name}
                      {r.round !== null && <span className="text-zinc-500"> · Week {r.round}</span>}
                    </td>
                    <td className="px-4 py-3">{r.event.type}</td>
                    <td className="px-4 py-3">{r.division ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.place ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.score ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatToPar(r.toPar)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
      {sub && <dd className="text-xs text-zinc-500">{sub}</dd>}
    </div>
  );
}
