import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { LoginForm } from "@/app/admin/forms";
import { NewNightForm } from "@/app/admin/league-nights/forms";
import { adminConfigured, isAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { listNights } from "@/lib/league-nights";

export const metadata: Metadata = {
  title: "Check-in",
  robots: { index: false },
};

// The installed app opens here: pick tonight's league night, or start it.
export default async function CheckInHome() {
  await connection();
  if (!adminConfigured()) return <p className="text-zinc-500">Admin isn&apos;t set up on this server.</p>;
  if (!(await isAdmin())) {
    return (
      <div className="flex max-w-sm flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">League night check-in</h1>
        <p className="text-zinc-600 dark:text-zinc-400">Log in with the admin password. You&apos;ll stay logged in on this phone for 30 days.</p>
        <LoginForm />
      </div>
    );
  }

  const nights = listNights().slice(0, 6);
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold tracking-tight">League night check-in</h1>

      {nights.length > 0 && (
        <ul className="flex flex-col gap-2">
          {nights.map((n) => (
            <li key={n.id}>
              <Link
                href={`/check-in/${n.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-4 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
              >
                <span className="flex flex-col">
                  <span className="text-base font-semibold">{n.name}</span>
                  <span className="text-sm text-zinc-500">{formatDate(n.date)}</span>
                </span>
                <span className="text-right text-sm tabular-nums text-zinc-500">
                  {n.checkedIn} in · {n.paid} paid
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-lg font-semibold">Start tonight&apos;s league night</h2>
        <NewNightForm from="check-in" />
      </section>

      <Link href="/admin/league-nights" className="text-sm text-zinc-500 hover:underline">
        Results and payouts are on the full league nights page →
      </Link>
    </div>
  );
}
