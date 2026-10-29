import Link from "next/link";
import type { HoleStat } from "@/lib/data";
import { formatToPar } from "@/lib/format";

const pct = (n: number) => `${Math.round(n * 100)}%`;
const avgToPar = (h: HoleStat) => (h.avg !== null && h.par !== null ? h.avg - h.par : null);

// Tints from the diverging scoring palette (see scoring-breakdown.tsx): blue for
// holes that play under par, red for over. The vs-par number is always printed,
// so the tint never carries the meaning alone.
function tint(vsPar: number | null): string {
  if (vsPar === null || Math.abs(vsPar) < 0.1) return "";
  if (vsPar <= -0.3) return "bg-[#6da7ec]/45 dark:bg-[#256abf]/60";
  if (vsPar < 0) return "bg-[#6da7ec]/20 dark:bg-[#256abf]/30";
  if (vsPar >= 0.3) return "bg-[#e36b6a]/45 dark:bg-[#c23a3a]/60";
  return "bg-[#e36b6a]/20 dark:bg-[#c23a3a]/30";
}

const sum = (ns: (number | null)[]) => (ns.every((n) => n !== null) ? ns.reduce<number>((a, n) => a + n!, 0) : null);

// The field's average on each hole, laid out like a scorecard: front and back
// halves, each with a subtotal, and the average round at the end.
export function HoleAverageScorecard({ holes, holeHref }: { holes: HoleStat[]; holeHref: (hole: number) => string }) {
  if (!holes.some((h) => h.rounds > 0)) return null;
  const half = holes.length > 12 ? Math.ceil(holes.length / 2) : holes.length;
  const parts = [holes.slice(0, half), holes.slice(half)].filter((p) => p.length);
  const total = { par: sum(holes.map((h) => h.par)), avg: sum(holes.map((h) => h.avg)) };
  const cell = "px-2 py-1.5 text-center";

  return (
    <div className="flex flex-col gap-3">
      {parts.map((part, i) => {
        const sub = { par: sum(part.map((h) => h.par)), avg: sum(part.map((h) => h.avg)) };
        const last = i === parts.length - 1;
        return (
          <div
            key={i}
            className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
          >
            <table className="w-full text-sm tabular-nums">
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                <tr className="text-zinc-500">
                  <th scope="row" className="w-16 px-3 py-1.5 text-left font-medium">Hole</th>
                  {part.map((h) => (
                    <th key={h.hole} className={`${cell} font-medium`}>
                      <Link
                        href={holeHref(h.hole)}
                        className="text-black underline decoration-zinc-300 underline-offset-2 hover:decoration-current dark:text-white dark:decoration-zinc-600"
                      >
                        {h.label}
                      </Link>
                    </th>
                  ))}
                  {parts.length > 1 && <th className={`${cell} font-medium`}>{i === 0 ? "Out" : "In"}</th>}
                  {last && <th className={`${cell} font-medium`}>Total</th>}
                </tr>
                <tr className="text-zinc-500">
                  <th scope="row" className="px-3 py-1.5 text-left font-medium">Par</th>
                  {part.map((h) => (
                    <td key={h.hole} className={cell}>{h.par ?? "—"}</td>
                  ))}
                  {parts.length > 1 && <td className={cell}>{sub.par ?? "—"}</td>}
                  {last && <td className={cell}>{total.par ?? "—"}</td>}
                </tr>
                <tr>
                  <th scope="row" className="px-3 py-1.5 text-left font-medium">Avg</th>
                  {part.map((h) => {
                    const vs = avgToPar(h);
                    return (
                      <td
                        key={h.hole}
                        className={`${cell} font-semibold ${tint(vs)}`}
                        title={`Hole ${h.label}: ${h.avg?.toFixed(2) ?? "—"} (${formatToPar(vs, 2)}) over ${h.rounds} rounds`}
                      >
                        {h.avg?.toFixed(2) ?? "—"}
                      </td>
                    );
                  })}
                  {parts.length > 1 && <td className={`${cell} font-semibold`}>{sub.avg?.toFixed(1) ?? "—"}</td>}
                  {last && <td className={`${cell} font-semibold`}>{total.avg?.toFixed(1) ?? "—"}</td>}
                </tr>
                <tr className="text-xs text-zinc-500">
                  <th scope="row" className="whitespace-nowrap px-3 py-1.5 text-left font-medium">vs par</th>
                  {part.map((h) => (
                    <td key={h.hole} className={cell}>{formatToPar(avgToPar(h), 2)}</td>
                  ))}
                  {parts.length > 1 && (
                    <td className={cell}>
                      {formatToPar(sub.avg !== null && sub.par !== null ? sub.avg - sub.par : null, 1)}
                    </td>
                  )}
                  {last && (
                    <td className={cell}>
                      {formatToPar(total.avg !== null && total.par !== null ? total.avg - total.par : null, 1)}
                    </td>
                  )}
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

// How each hole of a layout plays for the field: average, scoring rates and a
// difficulty rank (1 = hardest relative to par).
export function HoleDifficultyTable({
  holes,
  unit,
  holeHref,
}: {
  holes: HoleStat[];
  unit: string;
  holeHref: (hole: number) => string;
}) {
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
              <td className="px-3 py-2 font-medium">
                <Link href={holeHref(h.hole)} className="hover:underline">
                  {h.label}
                </Link>
              </td>
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
