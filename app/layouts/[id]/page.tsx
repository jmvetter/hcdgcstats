import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HoleAverageScorecard, HoleDifficultyTable } from "@/app/components/hole-table";
import { getLayout, getLayoutHoleStats, getLayoutLeaderboard } from "@/lib/data";
import { PdgaLink } from "@/app/components/pdga-link";
import { formatToPar, pdgaPlayerUrl } from "@/lib/format";

export async function generateMetadata({
  params,
}: PageProps<"/layouts/[id]">): Promise<Metadata> {
  const { id } = await params;
  const layout = await getLayout(id);
  return { title: layout ? `${layout.course} – ${layout.name}` : "Layout not found" };
}

const MIN_ROUNDS_OPTIONS = [1, 2, 3, 5];

export default async function LayoutPage({ params, searchParams }: PageProps<"/layouts/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  const layout = await getLayout(id);
  if (!layout) notFound();

  // Club members by default; ?all=1 includes players from outside tournaments.
  const showAll = query.all === "1";
  const minRounds = MIN_ROUNDS_OPTIONS.includes(Number(query.min)) ? Number(query.min) : 1;
  const [standings, holes] = await Promise.all([
    getLayoutLeaderboard(layout.id, { membersOnly: !showAll, minRounds }),
    getLayoutHoleStats(layout.id, { membersOnly: !showAll }),
  ]);

  const href = (changes: { all?: boolean; min?: number }) => {
    const all = changes.all ?? showAll;
    const min = changes.min ?? minRounds;
    const qs = new URLSearchParams();
    if (all) qs.set("all", "1");
    if (min > 1) qs.set("min", String(min));
    const s = qs.toString();
    return `/layouts/${layout.id}${s ? `?${s}` : ""}`;
  };

  const unit = layout.units === "Meters" ? "m" : "ft";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <Link href="/layouts" className="text-sm text-zinc-500 hover:underline">
          ← All layouts
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{layout.name}</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          {[
            layout.course,
            layout.holes && `${layout.holes} holes`,
            layout.par && `par ${layout.par}`,
            layout.length && `${layout.length.toLocaleString()} ${unit}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      {layout.holeDetails && holes.some((h) => h.rounds > 0) && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Scoring average by hole</h2>
          <p className="-mt-2 text-sm text-zinc-500">
            Average strokes on each hole for {showAll ? "everyone" : "club members"}, over{" "}
            {Math.max(...holes.map((h) => h.rounds))} rounds. Blue holes play under par, red over.
          </p>
          <HoleAverageScorecard holes={holes} />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">Leaderboard</h2>
          <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-500">
            <span>
              Min rounds:{" "}
              {MIN_ROUNDS_OPTIONS.map((n) => (
                <Link
                  key={n}
                  href={href({ min: n })}
                  className={`ml-1 ${n === minRounds ? "font-semibold text-black dark:text-white" : "hover:underline"}`}
                >
                  {n}
                </Link>
              ))}
            </span>
            <Link href={href({ all: !showAll })} className="hover:underline">
              {showAll ? "Club members only" : "Include non-members"}
            </Link>
          </div>
        </div>
        <p className="text-sm text-zinc-500">
          Ranked by average score on this layout; ties go to the better best round.
        </p>

        {standings.length === 0 ? (
          <p className="text-zinc-500">
            No {showAll ? "players" : "club members"} with {minRounds}+ rounds on this layout yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
                <tr>
                  <th className="w-12 px-4 py-3 text-right font-medium">#</th>
                  <th className="px-4 py-3 font-medium">Player</th>
                  <th className="px-4 py-3 text-right font-medium">Rounds</th>
                  <th className="px-4 py-3 text-right font-medium">Avg score</th>
                  <th className="px-4 py-3 text-right font-medium">Avg to par</th>
                  <th className="px-4 py-3 text-right font-medium">Best</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                {standings.map((s) => (
                  <tr key={s.playerId}>
                    <td className="px-4 py-3 text-right tabular-nums">{s.rank}</td>
                    <td className="px-4 py-3">
                      <Link href={`/players/${s.playerId}`} className="font-medium hover:underline">
                        {s.name}
                      </Link>
                      <PdgaLink href={pdgaPlayerUrl(s.pdgaNumber)} label={s.name} />
                      {showAll && !s.member && <span className="ml-2 text-xs text-zinc-500">non-member</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{s.rounds}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{s.avgScore.toFixed(1)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatToPar(s.avgToPar, 1)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{s.best}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {layout.holeDetails && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Hole difficulty</h2>
          <p className="-mt-2 text-sm text-zinc-500">
            How each hole plays for {showAll ? "everyone" : "club members"} on this layout. Difficulty ranks holes by
            average score relative to par (1 = hardest).
          </p>
          <HoleDifficultyTable holes={holes} unit={unit} />
        </section>
      )}
    </div>
  );
}
