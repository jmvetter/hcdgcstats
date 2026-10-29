import Image from "next/image";
import Link from "next/link";
import { getEvents, getPlayers } from "@/lib/data";
import { getLeagueYears } from "@/lib/recap";
import { PdgaLink } from "@/app/components/pdga-link";
import { formatDate, pdgaEventUrl } from "@/lib/format";

export default async function Home() {
  const [players, events, leagueYears] = await Promise.all([getPlayers(), getEvents(), getLeagueYears()]);
  const latest = events[0];

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
        {/* White artwork on transparent; inverted to black in light mode. */}
        <Image
          src="/logos/hcdgc-shield.png"
          alt="HCDGC club shield"
          width={769}
          height={869}
          priority
          unoptimized
          className="h-32 w-auto shrink-0 invert dark:invert-0"
        />
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">HCDGC Stats</h1>
          <p className="max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
            Player performance at HCDGC league events and tournaments.
          </p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Players" value={players.length} />
        <StatCard label="Events tracked" value={events.length} />
        <StatCard
          label="Latest event"
          value={
            latest ? (
              <>
                {latest.name}
                <PdgaLink href={pdgaEventUrl(latest.id)} label={latest.name} />
              </>
            ) : (
              "—"
            )
          }
          sub={latest ? formatDate(latest.date) : undefined}
        />
      </section>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/players"
          className="rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          View players →
        </Link>
        {leagueYears[0] && (
          <Link
            href={`/leagues/${leagueYears[0]}`}
            className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            {leagueYears[0]} league recap →
          </Link>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="text-sm text-zinc-500">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {sub && <div className="text-sm text-zinc-500">{sub}</div>}
    </div>
  );
}
