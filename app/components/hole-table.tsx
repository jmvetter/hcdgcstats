import type { HoleStat } from "@/lib/data";
import { formatToPar } from "@/lib/format";

const pct = (n: number) => `${Math.round(n * 100)}%`;
const avgToPar = (h: HoleStat) => (h.avg !== null && h.par !== null ? h.avg - h.par : null);

// How each hole of a layout plays for the field: average, scoring rates and a
// difficulty rank (1 = hardest relative to par).
export function HoleDifficultyTable({ holes, unit }: { holes: HoleStat[]; unit: string }) {
  if (!holes.some((h) => h.rounds > 0)) {
    return <p className="text-sm text-zinc-500">No hole-by-hole scores for this layout yet.</p>;
  }
  const hasLength = holes.some((h) => h.length);
  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <table className="w-full text-left text-sm tabular-nums">
        <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
          <tr>
            <th className="px-3 py-2 font-medium">Hole</th>
            <th className="px-3 py-2 text-right font-medium">Par</th>
            {hasLength && <th className="px-3 py-2 text-right font-medium">Length ({unit})</th>}
            <th className="px-3 py-2 text-right font-medium">Avg</th>
            <th className="px-3 py-2 text-right font-medium">vs par</th>
            <th className="px-3 py-2 text-right font-medium">Birdie or better</th>
            <th className="px-3 py-2 text-right font-medium">Par</th>
            <th className="px-3 py-2 text-right font-medium">Bogey or worse</th>
            <th className="px-3 py-2 text-right font-medium" title="1 = hardest relative to par">
              Difficulty
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {holes.map((h) => (
            <tr key={h.hole}>
              <td className="px-3 py-2 font-medium">{h.label}</td>
              <td className="px-3 py-2 text-right">{h.par ?? "—"}</td>
              {hasLength && <td className="px-3 py-2 text-right">{h.length ?? "—"}</td>}
              <td className="px-3 py-2 text-right">{h.avg?.toFixed(2) ?? "—"}</td>
              <td className="px-3 py-2 text-right">{formatToPar(avgToPar(h), 2)}</td>
              <td className="px-3 py-2 text-right">{h.rounds ? pct(h.birdieOrBetter) : "—"}</td>
              <td className="px-3 py-2 text-right">{h.rounds ? pct(h.atPar) : "—"}</td>
              <td className="px-3 py-2 text-right">{h.rounds ? pct(h.bogeyOrWorse) : "—"}</td>
              <td className="px-3 py-2 text-right">
                {h.difficultyRank ? `${h.difficultyRank} of ${holes.length}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// One player's average on each hole of a layout, next to the field's.
export function PlayerHoleTable({ mine, field }: { mine: HoleStat[]; field: HoleStat[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm tabular-nums">
        <thead className="text-zinc-500">
          <tr>
            <th className="px-3 py-2 font-medium">Hole</th>
            <th className="px-3 py-2 text-right font-medium">Par</th>
            <th className="px-3 py-2 text-right font-medium">Rounds</th>
            <th className="px-3 py-2 text-right font-medium">Avg</th>
            <th className="px-3 py-2 text-right font-medium">vs par</th>
            <th className="px-3 py-2 text-right font-medium">Field avg</th>
            <th className="px-3 py-2 text-right font-medium" title="Strokes compared with the field's average on this hole">
              vs field
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {mine.map((h, i) => {
            const f = field[i];
            const vsField = h.avg !== null && f?.avg != null ? h.avg - f.avg : null;
            return (
              <tr key={h.hole}>
                <td className="px-3 py-1.5 font-medium">{h.label}</td>
                <td className="px-3 py-1.5 text-right">{h.par ?? "—"}</td>
                <td className="px-3 py-1.5 text-right">{h.rounds}</td>
                <td className="px-3 py-1.5 text-right">{h.avg?.toFixed(2) ?? "—"}</td>
                <td className="px-3 py-1.5 text-right">{formatToPar(avgToPar(h), 2)}</td>
                <td className="px-3 py-1.5 text-right text-zinc-500">{f?.avg?.toFixed(2) ?? "—"}</td>
                <td className="px-3 py-1.5 text-right">{formatToPar(vsField, 2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
