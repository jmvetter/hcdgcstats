import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { formatDate } from "@/lib/format";
import { listPuttingNights } from "@/lib/putting";

export const metadata: Metadata = {
  title: "Putting league",
};

export default async function PuttingPage() {
  await connection();
  const nights = listPuttingNights();
  // Open nights first: that's where people are scoring.
  const sorted = [...nights.filter((n) => !n.paidOutAt), ...nights.filter((n) => n.paidOutAt)];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Putting league</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Pick the night, find your name and score your card. You can fix a card until the night is paid out.
        </p>
      </div>

      {sorted.length === 0 ? (
        <p className="text-zinc-500">No putting nights yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {sorted.map((n) => (
            <li key={n.id}>
              <Link
                href={`/putting/${n.id}`}
                className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border border-zinc-200 bg-white px-4 py-3 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
              >
                <span className="flex flex-col">
                  <span className="font-medium">
                    {n.name}
                    {n.week !== null && <span className="font-normal text-zinc-500"> · Week {n.week}</span>}
                  </span>
                  <span className="text-sm text-zinc-500">{formatDate(n.date)}</span>
                </span>
                <span className="flex items-center gap-3 text-sm text-zinc-500">
                  {n.cards} {n.cards === 1 ? "card" : "cards"}
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      n.paidOutAt
                        ? "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                        : "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                    }`}
                  >
                    {n.paidOutAt ? "Paid out" : "Open"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
