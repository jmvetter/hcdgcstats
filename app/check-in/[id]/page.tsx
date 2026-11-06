import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getCheckIns, getNight, listCheckInDivisions, listCheckInPlayers } from "@/lib/league-nights";
import { CheckInScreen } from "./check-in-screen";

export const metadata: Metadata = {
  title: "Check-in",
  robots: { index: false },
};

export default async function CheckInNightPage({ params }: PageProps<"/check-in/[id]">) {
  await connection();
  if (!(await isAdmin())) redirect("/check-in");
  const night = getNight(Number((await params).id));
  if (!night) notFound();
  const players = listCheckInPlayers();
  // Quick picks: divisions used at check-in before, then players' most common ones.
  const counts = new Map<string, number>();
  for (const p of players) if (p.division) counts.set(p.division, (counts.get(p.division) ?? 0) + 1);
  const common = [...counts].sort((a, b) => b[1] - a[1]).map(([d]) => d);
  const divisions = [...new Set([...listCheckInDivisions(), ...common.slice(0, 4)])].slice(0, 6);

  return (
    <CheckInScreen
      night={{ id: night.id, name: night.name, date: night.date, entryFee: night.entryFee }}
      checkIns={getCheckIns(night.id)}
      players={players}
      divisions={divisions}
    />
  );
}
