import type { Metadata } from "next";
import Link from "next/link";
import { formatToPar, getPlayerStats, getPlayers } from "@/lib/data";

export const metadata: Metadata = {
  title: "Players",
};

export default function PlayersPage() {
  const rows = getPlayers().map((player) => ({
    player,
    stats: getPlayerStats(player.id),
  }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Players</h1>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
            <tr>
              <th className="px-4 py-3 font-medium">Player</th>
              <th className="px-4 py-3 font-medium">Division</th>
              <th className="px-4 py-3 text-right font-medium">Rounds</th>
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
                <td className="px-4 py-3">{player.division}</td>
                <td className="px-4 py-3 text-right tabular-nums">{stats.rounds}</td>
                <td className="px-4 py-3 text-right tabular-nums">{stats.wins}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatToPar(stats.avgToPar, 1)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{formatToPar(stats.bestToPar)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
