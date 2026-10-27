import Link from "next/link";
import { events, formatDate, getPlayers } from "@/lib/data";

export default function Home() {
  const playerCount = getPlayers().length;
  const latest = [...events].sort((a, b) => b.date.localeCompare(a.date))[0];

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">HCDGC Stats</h1>
        <p className="max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
          Player performance at HCDGC league events and tournaments.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Players" value={playerCount} />
        <StatCard label="Events tracked" value={events.length} />
        <StatCard
          label="Latest event"
          value={latest ? latest.name : "—"}
          sub={latest ? formatDate(latest.date) : undefined}
        />
      </section>

      <Link
        href="/players"
        className="self-start rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        View players →
      </Link>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
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
