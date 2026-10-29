import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PdgaLink } from "@/app/components/pdga-link";
import { ScoringBreakdownBar } from "@/app/components/scoring-breakdown";
import { formatDate, formatToPar, pdgaEventUrl } from "@/lib/format";
import { getLeagueRecap, getLeagueYears, type RecapLeader, type RecapSession } from "@/lib/recap";

export async function generateMetadata({ params }: PageProps<"/leagues/[year]">): Promise<Metadata> {
  const { year } = await params;
  return { title: `${year} League Recap` };
}

const fmt = (n: number) => n.toLocaleString("en-US");
const shortDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const longDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric" });
const plural = (n: number, word: string) => `${fmt(n)} ${word}${n === 1 ? "" : "s"}`;
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const inWords = (n: number) => WORDS[n] ?? fmt(n);
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
// Drops the "Memorial Disc Golf Course" style suffix for compact labels.
const shortCourse = (course: string) => course.replace(/\s+(Memorial\s+)?Disc Golf Course$/i, "");

// Same blue the scoring bar uses for under par.
const BIRDIE_TEXT = "text-[#1c5cab] dark:text-[#6da7ec]";

export default async function LeagueRecapPage({ params }: PageProps<"/leagues/[year]">) {
  const { year: yearParam } = await params;
  const year = Number(yearParam);
  const [recap, years] = await Promise.all([
    Number.isInteger(year) ? getLeagueRecap(year) : null,
    getLeagueYears(),
  ]);
  if (!recap) notFound();
  const { totals, sessions } = recap;

  return (
    <div className="flex flex-col gap-12">
      <header className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        <div className="grid size-24 shrink-0 place-items-center rounded-2xl bg-[#1f5a3a]">
          {/* White artwork on transparent, so it sits on the club green in both themes. */}
          <Image src="/logos/hcdgc-shield.png" alt="HCDGC club shield" width={769} height={869} unoptimized className="h-16 w-auto" />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Hendricks County Disc Golf Club · Sanctioned League
          </span>
          <h1 className="text-4xl font-black uppercase tracking-tight text-balance sm:text-5xl">
            The {recap.year} League <span className="text-[#1f5a3a] dark:text-[#4fae7a]">Season</span>
          </h1>
          <p className="max-w-2xl text-zinc-600 dark:text-zinc-400">
            {capitalize(inWords(sessions.length))} session{sessions.length === 1 ? "" : "s"} and {totals.weeks} weekly
            rounds, from {longDate(recap.firstDate)} to {longDate(recap.lastDate)}, at{" "}
            {recap.courses.map((c) => c.replace(/\s+Disc Golf Course$/i, "")).join(" and ")}.
          </p>
        </div>
      </header>

      <section className="flex flex-col gap-3" aria-labelledby="totals">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="totals" className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Season totals
          </h2>
          <span className="text-xs text-zinc-500">Updated through {formatDate(recap.lastDate)}</span>
        </div>
        <div className="grid grid-cols-2 overflow-hidden rounded-lg border-2 border-zinc-900 bg-white sm:grid-cols-5 dark:border-zinc-200 dark:bg-zinc-950">
          <Total at={0} label="Players" value={fmt(totals.players)} note={`${totals.members} of them club members`} />
          <Total at={1} label="Rounds" value={fmt(totals.rounds)} note={`${fmt(totals.scoring.holes)} holes played`} />
          <Total at={2} label="Throws" value={fmt(totals.throws)} note={`${(totals.throws / totals.rounds).toFixed(1)} per round`} />
          <Total
            at={3}
            label="Birdies"
            value={fmt(totals.scoring.counts.birdie)}
            note={birdieShare(totals.scoring.counts.birdie, totals.scoring.holes)}
            valueClass={BIRDIE_TEXT}
          />
          <Total
            at={4}
            label="Aces"
            value={fmt(totals.aces)}
            note={totals.aces ? `about one per ${fmt(Math.round(totals.scoring.holes / totals.aces / 100) * 100)} holes` : "none yet"}
            valueClass="text-amber-600 dark:text-amber-400"
            cellClass="bg-amber-50 dark:bg-amber-950/40"
          />
        </div>
        <p className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-500">
          <span><b className="font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">{totals.weeks}</b> league weeks</span>
          <span>
            <b className="font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">{fmt(totals.eagles)}</b> eagles
            {totals.aces > 0 && ` (plus the ${plural(totals.aces, "ace")})`}
          </span>
          <span><b className="font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">{fmt(totals.scoring.counts.par)}</b> pars</span>
          {recap.divisions.length > 0 && (
            <span>
              Divisions <b className="font-semibold text-zinc-900 dark:text-zinc-100">{recap.divisions.join(" · ")}</b>
            </span>
          )}
        </p>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="mix">
        <h2 id="mix" className="text-2xl font-black uppercase tracking-tight">Every hole, scored</h2>
        <p className="-mt-1 text-zinc-600 dark:text-zinc-400">
          How all {fmt(totals.scoring.holes)} holes played this season went, relative to par.
        </p>
        <ScoringBreakdownBar data={totals.scoring} />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="sessions">
        <h2 id="sessions" className="text-2xl font-black uppercase tracking-tight">Session by session</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {sessions.map((s) => (
            <SessionCard key={s.eventId} session={s} all={sessions} />
          ))}
        </div>
        <p className="text-xs text-zinc-500">
          Bars compare the sessions; the longest bar is the season high. Average to par is per round, on whichever
          layouts that session played.
        </p>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="aces">
        <h2 id="aces" className="text-2xl font-black uppercase tracking-tight">The ace wall</h2>
        {recap.aces.length === 0 ? (
          <p className="text-zinc-500">No aces yet this season.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {recap.aces.map((a, i) => (
              <article
                key={i}
                className="flex flex-col gap-1.5 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40"
              >
                <span className="text-4xl font-black leading-none text-amber-600 tabular-nums dark:text-amber-400">
                  #{a.hole}
                  {a.length && (
                    <span className="ml-2 text-base font-bold text-zinc-500">
                      {a.length} {a.units === "Meters" ? "m" : "ft"}
                    </span>
                  )}
                </span>
                <Link href={`/players/${a.playerId}`} className="font-semibold hover:underline">
                  {a.player}
                </Link>
                <span className="text-sm text-zinc-500">
                  {shortCourse(a.course)} · {a.session}, week {a.week} · {shortDate(a.date)}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="leaders">
        <h2 id="leaders" className="text-2xl font-black uppercase tracking-tight">Season leaders</h2>
        <div className="grid grid-cols-2 border-t-2 border-zinc-900 lg:grid-cols-4 dark:border-zinc-200">
          {totals.best && (
            <Leader
              label="Best round"
              value={formatToPar(totals.best.toPar)}
              who={{ playerId: totals.best.playerId, player: totals.best.player }}
              context={`${totals.best.score} at ${shortCourse(totals.best.course)}${
                totals.best.rating ? `, rated ${totals.best.rating}` : ""
              } · ${shortDate(totals.best.date)}`}
            />
          )}
          <TopLeader label="Most birdies" leaders={recap.leaders.birdies} />
          <TopLeader
            label="Iron player"
            leaders={recap.leaders.rounds}
            context={() => `rounds out of ${totals.weeks} weeks`}
          />
          <TopLeader label="Weekly division wins" leaders={recap.leaders.wins} />
        </div>
      </section>

      {years.length > 1 && (
        <nav className="flex flex-wrap gap-3 text-sm text-zinc-500">
          Other seasons:
          {years
            .filter((y) => y !== recap.year)
            .map((y) => (
              <Link key={y} href={`/leagues/${y}`} className="font-medium text-zinc-900 hover:underline dark:text-zinc-100">
                {y}
              </Link>
            ))}
        </nav>
      )}
    </div>
  );
}

function birdieShare(birdies: number, holes: number): string {
  if (!holes) return "";
  const share = birdies / holes;
  const oneIn = Math.round(1 / share);
  return share > 0 ? `about one hole in ${inWords(oneIn)}` : "";
}

// Cell borders by position: on phones the first total spans the row and the
// other four sit two by two; from sm up all five share one row.
const TOTAL_CELL = [
  "col-span-2 sm:col-span-1",
  "border-t sm:border-t-0 sm:border-l",
  "border-t border-l sm:border-t-0",
  "border-t sm:border-t-0 sm:border-l",
  "border-t border-l sm:border-t-0",
];

function Total({
  at,
  label,
  value,
  note,
  valueClass = "",
  cellClass = "",
}: {
  at: number;
  label: string;
  value: string;
  note: string;
  valueClass?: string;
  cellClass?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 border-zinc-200 p-4 dark:border-zinc-800 ${TOTAL_CELL[at]} ${cellClass}`}>
      <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{label}</span>
      <span className={`text-4xl font-black leading-none tabular-nums sm:text-[2.6rem] ${valueClass}`}>{value}</span>
      <span className="text-sm text-zinc-500">{note}</span>
    </div>
  );
}

function SessionCard({ session: s, all }: { session: RecapSession; all: RecapSession[] }) {
  const max = (pick: (x: RecapSession) => number) => Math.max(...all.map(pick));
  const rows: { label: string; value: string; bar?: number; blue?: boolean }[] = [
    { label: "Players", value: fmt(s.players), bar: s.players / max((x) => x.players) },
    { label: "Rounds", value: fmt(s.rounds), bar: s.rounds / max((x) => x.rounds) },
    { label: "Throws", value: fmt(s.throws), bar: s.throws / max((x) => x.throws) },
    {
      label: "Birdies",
      value: fmt(s.scoring.counts.birdie),
      bar: s.scoring.counts.birdie / max((x) => x.scoring.counts.birdie),
      blue: true,
    },
    {
      label: "Birdie rate",
      value: s.scoring.holes ? `${((s.scoring.counts.birdie / s.scoring.holes) * 100).toFixed(1)}%` : "—",
    },
    { label: "Avg to par", value: formatToPar(s.avgToPar, 1) },
    { label: "Aces", value: fmt(s.aces) },
  ];
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <header className="flex flex-col gap-0.5 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{plural(s.weeks, "week")}</span>
        <h3 className="text-xl font-black uppercase leading-tight">
          {s.name}
          <PdgaLink href={pdgaEventUrl(s.eventId)} label={s.name} />
        </h3>
        <span className="text-sm text-zinc-500">
          {shortDate(s.firstDate)} – {shortDate(s.lastDate)}
        </span>
      </header>
      <dl className="flex flex-col gap-2 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-col gap-1">
            <div className="flex justify-between gap-2">
              <dt className="text-zinc-500">{r.label}</dt>
              <dd className="font-semibold tabular-nums">{r.value}</dd>
            </div>
            {r.bar !== undefined && (
              <div className="h-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800" aria-hidden>
                <div
                  className={`h-full rounded-full ${r.blue ? "bg-[#1c5cab] dark:bg-[#6da7ec]" : "bg-[#1f5a3a] dark:bg-[#4fae7a]"}`}
                  style={{ width: `${r.bar * 100}%` }}
                />
              </div>
            )}
          </div>
        ))}
        {s.best && (
          <div className="flex justify-between gap-2">
            <dt className="whitespace-nowrap text-zinc-500">Best round</dt>
            <dd className="text-right font-semibold">
              <Link href={`/players/${s.best.playerId}`} className="hover:underline">
                {s.best.player}
              </Link>{" "}
              <span className="tabular-nums">{formatToPar(s.best.toPar)}</span>
            </dd>
          </div>
        )}
      </dl>
    </article>
  );
}

function TopLeader({
  label,
  leaders,
  context,
}: {
  label: string;
  leaders: RecapLeader[];
  context?: (leader: RecapLeader) => string;
}) {
  const [first, second] = leaders;
  if (!first) return null;
  return (
    <Leader
      label={label}
      value={fmt(first.value)}
      who={first}
      context={context ? context(first) : second ? `${second.player} next with ${fmt(second.value)}` : ""}
    />
  );
}

function Leader({
  label,
  value,
  who,
  context,
}: {
  label: string;
  value: string;
  who: { playerId: string; player: string };
  context: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 border-zinc-200 py-4 pr-4 even:border-l even:pl-4 lg:not-first:border-l lg:not-first:pl-4 dark:border-zinc-800">
      <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500">{label}</span>
      <span className="text-4xl font-black leading-none tabular-nums">{value}</span>
      <Link href={`/players/${who.playerId}`} className="font-semibold hover:underline">
        {who.player}
      </Link>
      <span className="text-sm text-zinc-500">{context}</span>
    </div>
  );
}
