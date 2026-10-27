import type { Metadata } from "next";
import Link from "next/link";
import { getPlayerStats, getPlayers } from "@/lib/data";
import { formatToPar } from "@/lib/format";

export const metadata: Metadata = {
  title: "Players",
};

export default async function PlayersPage({ searchParams }: PageProps<"/players">) {
  // Club members by default; ?all=1 also shows players from outside tournaments.
  const showAll = (await searchParams).all === "1";
  const players = await getPlayers({ membersOnly: !showAll });
  const rows = await Promise.all(
    players.map(async (player) => ({ player, stats: await getPlayerStats(player.id) })),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{showAll ? "All players" : "Club members"}</h1>
        <Link href={showAll ? "/players" : "/players?all=1"} className="text-sm text-zinc-500 hover:underline">
          {showAll ? "Show club members only" : "Show all players"}
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-zinc-500">
          No {showAll ? "players" : "club members"} yet. Add them on the{" "}
          <Link href="/admin" className="underline">admin page</Link>.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
              <tr>
                <th className="px-4 py-3 font-medium">Player</th>
                <th className="px-4 py-3 font-medium">Division</th>
                <th className="px-4 py-3 text-right font-medium">Rating</th>
                <th className="px-4 py-3 text-right font-medium">Events</th>
                <th className="px-4 py-3 text-right font-medium">Wins</th>
                <th className="px-4 py-3 text-right font-medium">Avg to par</th>
                <th className="px-4 py-3 text-right font-medium">Best</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {rows.map(({ player, stats }) => (
                <tr key={player.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900">
                  <td className="px-4 py-3">
                    <Link href={`/players/${player.id}`} className="font-medium hover:underline">
                      {player.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{player.division ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{player.rating ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{stats.events}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{stats.wins}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatToPar(stats.avgToPar, 1)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatToPar(stats.bestToPar)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
