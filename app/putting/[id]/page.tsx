import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AutoRefresh } from "@/app/components/auto-refresh";
import { isAdmin } from "@/lib/auth";
import { listCheckInPlayers } from "@/lib/league-nights";
import { getPuttingNight, listPuttingCards } from "@/lib/putting";
import { getPuttingConfig } from "@/lib/putting-config";
import { PuttingNightScreen } from "./putting-night";

export async function generateMetadata({ params }: PageProps<"/putting/[id]">): Promise<Metadata> {
  const night = getPuttingNight(Number((await params).id));
  return { title: night ? `${night.name} · Putting` : "Putting night not found" };
}

export default async function PuttingNightPage({ params }: PageProps<"/putting/[id]">) {
  await connection();
  const night = getPuttingNight(Number((await params).id));
  if (!night) notFound();
  const admin = await isAdmin();
  const cards = listPuttingCards(night);
  const players = listCheckInPlayers();

  // Quick picks for the division: ones used tonight, then players' most common ones.
  const counts = new Map<string, number>();
  for (const c of cards) if (c.division) counts.set(c.division, (counts.get(c.division) ?? 0) + 3);
  for (const p of players) if (p.division) counts.set(p.division, (counts.get(p.division) ?? 0) + 1);
  const divisions = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([d]) => d);

  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh seconds={30} />
      <Link href="/putting" className="-mb-3 text-sm text-zinc-500 hover:underline">
        ← Putting nights
      </Link>
      <PuttingNightScreen
        night={{
          id: night.id,
          name: night.name,
          date: night.date,
          week: night.week,
          scorekeeper: night.scorekeeper,
          distancesFt: night.distancesFt,
          stations: night.stations,
          paidOutAt: night.paidOutAt,
        }}
        config={getPuttingConfig(night.configVersion)}
        cards={cards.map((c) => ({
          playerId: c.playerId,
          name: c.name,
          division: c.division,
          putts: c.putts,
          stationOrder: c.stationOrder,
        }))}
        players={players}
        divisions={divisions}
        admin={admin}
      />
    </div>
  );
}
