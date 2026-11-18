import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { isAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { listPuttingNights } from "@/lib/putting";
import { NewPuttingNightForm } from "./forms";

export const metadata: Metadata = {
  title: "Putting league nights",
  robots: { index: false },
};

export default async function PuttingNightsPage() {
  await connection();
  if (!(await isAdmin())) redirect("/admin");
  const nights = listPuttingNights();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <Link href="/admin" className="text-sm text-zinc-500 hover:underline">
          ← Admin
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Putting league nights</h1>
        <p className="max-w-2xl text-zinc-600 dark:text-zinc-400">
          Start a night, then anyone can open its scorecards at{" "}
          <Link href="/putting" className="underline">
            /putting
          </Link>{" "}
          and score. Mark who&apos;s paid here, get each division&apos;s payout, and lock the night once everyone is paid.
        </p>
      </div>

      <section className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-lg font-semibold">New putting night</h2>
        <NewPuttingNightForm />
        <p className="text-xs text-zinc-500">
          A new night starts with the last night&apos;s entry fee, distances and payout settings, and the next week number.
        </p>
      </section>

      {nights.length === 0 ? (
        <p className="text-zinc-500">No putting nights yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Night</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Scorecards</th>
                <th className="px-4 py-3 text-right font-medium">Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {nights.map((n) => (
                <tr key={n.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900">
                  <td className="whitespace-nowrap px-4 py-3">{formatDate(n.date)}</td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/putting/${n.id}`} className="font-medium hover:underline">
                      {n.name}
                    </Link>
                    {n.week !== null && <span className="ml-2 text-zinc-500">Week {n.week}</span>}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">{n.paidOutAt ? "Paid out, locked" : "Open"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{n.cards}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {n.paid}
                    {n.paid < n.cards && (
                      <span className="ml-2 text-xs text-amber-700 dark:text-amber-400">{n.cards - n.paid} unpaid</span>
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
