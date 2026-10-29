import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { isAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { listNights } from "@/lib/league-nights";
import { NewNightForm } from "./forms";

export const metadata: Metadata = {
  title: "League nights",
  robots: { index: false },
};

export default async function LeagueNightsPage() {
  await connection();
  if (!(await isAdmin())) redirect("/admin");
  const nights = listNights();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <Link href="/admin" className="text-sm text-zinc-500 hover:underline">
          ← Admin
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">League nights</h1>
        <p className="max-w-2xl text-zinc-600 dark:text-zinc-400">
          Check players in and mark who&apos;s paid, pull in the round&apos;s results from PDGA or UDisc, and get each
          division&apos;s payout.
        </p>
      </div>

      <section className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-lg font-semibold">New league night</h2>
        <NewNightForm />
        <p className="text-xs text-zinc-500">
          A new night starts with the last night&apos;s entry fee and payout settings.
        </p>
      </section>

      {nights.length === 0 ? (
        <p className="text-zinc-500">No league nights yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Night</th>
                <th className="px-4 py-3 font-medium">Results</th>
                <th className="px-4 py-3 text-right font-medium">Checked in</th>
                <th className="px-4 py-3 text-right font-medium">Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {nights.map((n) => (
                <tr key={n.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900">
                  <td className="whitespace-nowrap px-4 py-3">{formatDate(n.date)}</td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/league-nights/${n.id}`} className="font-medium hover:underline">
                      {n.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {n.eventName ? `${n.eventName}, round ${n.round}` : "Not linked yet"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{n.checkedIn}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {n.paid}
                    {n.paid < n.checkedIn && (
                      <span className="ml-2 text-xs text-amber-700 dark:text-amber-400">
                        {n.checkedIn - n.paid} unpaid
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
