import { formatPoints } from "@/lib/match-play";
import { groupByRound, teamTotals, type HoleResult } from "@/lib/match-status";

type Match = { round: number; results: (HoleResult | null)[] };

// A team matchup's points round by round, plus the total, laid out like a
// scorecard: one row per team, one column per round.
export function RoundScores({ teamA, teamB, matches }: { teamA: string; teamB: string; matches: Match[] }) {
  const rounds = groupByRound(matches).map(({ round, matches }) => ({
    round,
    ...teamTotals(matches),
  }));
  const total = teamTotals(matches);
  const cell = "px-2 py-1.5 text-center tabular-nums sm:px-3";
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900">
          <tr>
            <th className="px-3 py-1.5 text-left font-medium">
              <span className="sr-only">Team</span>
            </th>
            {rounds.map((r) => (
              <th key={r.round} className={`${cell} font-medium`}>
                <span className="block whitespace-nowrap">Round {r.round}</span>
                <span className="block font-normal">{r.live ? "playing" : "final"}</span>
              </th>
            ))}
            <th className={`${cell} font-semibold text-zinc-700 dark:text-zinc-300`}>Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-900 dark:bg-zinc-950">
          {[
            { name: teamA, side: "a" as const },
            { name: teamB, side: "b" as const },
          ].map(({ name, side }) => (
            <tr key={side}>
              <th scope="row" className="px-3 py-1.5 text-left font-medium">
                {name}
              </th>
              {rounds.map((r) => (
                <td key={r.round} className={cell}>
                  {formatPoints(r[side])}
                </td>
              ))}
              <td className={`${cell} font-semibold`}>{formatPoints(total[side])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
