import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PdgaLink } from "@/app/components/pdga-link";
import { BAND_COLOR, ScoringBreakdownBar } from "@/app/components/scoring-breakdown";
import {
  getLayout,
  getLayoutHolePlayers,
  getLayoutHoleStats,
  SCORE_BANDS,
  scoreBand,
  type ScoreBand,
} from "@/lib/data";
import { formatDate, formatToPar, pdgaPlayerUrl } from "@/lib/format";

// Ink that reads on each band's fill, in each mode.
const CHIP_TEXT: Record<ScoreBand, string> = {
  eagle: "text-white dark:text-black",
  birdie: "text-black dark:text-white",
  par: "text-black dark:text-white",
  bogey: "text-black dark:text-white",
  double: "text-white dark:text-black",
};

export async function generateMetadata({ params }: PageProps<"/layouts/[id]/holes/[hole]">): Promise<Metadata> {
  const { id, hole } = await params;
  const layout = await getLayout(id);
  const label = layout?.holeDetails?.[Number(hole) - 1]?.label;
  return { title: layout && label ? `Hole ${label} – ${layout.name}` : "Hole not found" };
}

export default async function HolePage({ params, searchParams }: PageProps<"/layouts/[id]/holes/[hole]">) {
  const { id, hole: holeParam } = await params;
  const layout = await getLayout(id);
  const hole = Number(holeParam);
  const detail = Number.isInteger(hole) ? layout?.holeDetails?.[hole - 1] : undefined;
  if (!layout || !detail) notFound();

  // Club members by default, like the layout page; ?all=1 includes everyone.
  const showAll = (await searchParams).all === "1";
  const [{ field, players }, holeStats] = await Promise.all([
    getLayoutHolePlayers(layout.id, hole, { membersOnly: !showAll }),
    getLayoutHoleStats(layout.id, { membersOnly: !showAll }),
  ]);
  const stat = holeStats[hole - 1];
  const count = layout.holeDetails!.length;
  const unit = layout.units === "Meters" ? "m" : "ft";
  const qs = showAll ? "?all=1" : "";
  const holeHref = (n: number) => `/layouts/${layout.id}/holes/${n}${qs}`;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <Link href={`/layouts/${layout.id}${qs}`} className="text-sm text-zinc-500 hover:underline">
          ← {layout.name}
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">Hole {detail.label}</h1>
          <nav className="flex gap-4 text-sm">
            {hole > 1 ? (
              <Link href={holeHref(hole - 1)} className="hover:underline">← Hole {layout.holeDetails![hole - 2].label}</Link>
            ) : (
              <span />
            )}
            {hole < count && (
              <Link href={holeHref(hole + 1)} className="hover:underline">Hole {layout.holeDetails![hole].label} →</Link>
            )}
          </nav>
        </div>
        <p className="text-zinc-600 dark:text-zinc-400">
          {[
            layout.course,
            detail.par && `par ${detail.par}`,
            detail.length && `${detail.length.toLocaleString()} ${unit}`,
            stat?.avg != null && `average ${stat.avg.toFixed(2)} (${formatToPar(stat.avg - (detail.par ?? 0), 2)})`,
            stat?.difficultyRank && `${stat.difficultyRank} of ${count} hardest`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">How it plays</h2>
        <ScoringBreakdownBar data={field} noun="scores on this hole" />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">Players</h2>
          <Link href={`/layouts/${layout.id}/holes/${hole}${showAll ? "" : "?all=1"}`} className="text-sm text-zinc-500 hover:underline">
            {showAll ? "Club members only" : "Include non-members"}
          </Link>
        </div>
        <p className="-mt-2 text-sm text-zinc-500">
          Every score on this hole, oldest first. Ranked by average; hover a score for the event.
        </p>

        {players.length === 0 ? (
          <p className="text-zinc-500">No {showAll ? "players" : "club members"} have hole-by-hole scores here yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <table className="w-full text-left text-sm tabular-nums">
              <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
                <tr>
                  <th className="w-12 px-4 py-3 text-right font-medium">#</th>
                  <th className="px-4 py-3 font-medium">Player</th>
                  <th className="px-4 py-3 text-right font-medium">Rounds</th>
                  <th className="px-4 py-3 text-right font-medium">Avg</th>
                  <th className="px-4 py-3 text-right font-medium">vs par</th>
                  <th className="px-4 py-3 text-right font-medium">Best</th>
                  <th className="px-4 py-3 font-medium">Scores</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                {players.map((p, i) => {
                  const tied = i > 0 && players[i - 1].avg === p.avg;
                  const rank = tied ? players.findIndex((q) => q.avg === p.avg) + 1 : i + 1;
                  return (
                    <tr key={p.playerId} className="align-top">
                      <td className="px-4 py-3 text-right">{rank}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Link href={`/players/${p.playerId}`} className="font-medium hover:underline">
                          {p.name}
                        </Link>
                        <PdgaLink href={pdgaPlayerUrl(p.pdgaNumber)} label={p.name} />
                        {showAll && !p.member && <span className="ml-2 text-xs text-zinc-500">non-member</span>}
                      </td>
                      <td className="px-4 py-3 text-right">{p.scores.length}</td>
                      <td className="px-4 py-3 text-right">{p.avg.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">{formatToPar(p.avg - detail.par!, 2)}</td>
                      <td className="px-4 py-3 text-right">{p.best}</td>
                      <td className="px-4 py-2.5">
                        <ul className="flex min-w-48 flex-wrap gap-1" aria-label={`${p.name}'s scores`}>
                          {p.scores.map((s, j) => {
                            const b = scoreBand(s.strokes, detail.par!);
                            const label = SCORE_BANDS.find((x) => x.band === b)!.label;
                            return (
                              <li
                                key={j}
                                className={`grid size-6 place-items-center rounded text-xs font-semibold ${BAND_COLOR[b]} ${CHIP_TEXT[b]}`}
                                title={`${s.strokes} (${label}) · ${s.eventName}, round ${s.round}${s.date ? ` · ${formatDate(s.date)}` : ""}`}
                              >
                                {s.strokes}
                              </li>
                            );
                          })}
                        </ul>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
