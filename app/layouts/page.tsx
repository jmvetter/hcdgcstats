import type { Metadata } from "next";
import Link from "next/link";
import { getLayouts } from "@/lib/data";

export const metadata: Metadata = {
  title: "Layouts",
};

export default async function LayoutsPage() {
  const layouts = (await getLayouts()).filter((l) => l.rounds > 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Layouts</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Players are ranked against each other on each layout, using only rounds played there.
        </p>
      </div>

      {layouts.length === 0 ? (
        <p className="text-zinc-500">
          No rounds with a layout yet. Import results on the{" "}
          <Link href="/admin" className="underline">admin page</Link>.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
              <tr>
                <th className="px-4 py-3 font-medium">Course</th>
                <th className="px-4 py-3 font-medium">Layout</th>
                <th className="px-4 py-3 text-right font-medium">Holes</th>
                <th className="px-4 py-3 text-right font-medium">Par</th>
                <th className="px-4 py-3 text-right font-medium">Length</th>
                <th className="px-4 py-3 text-right font-medium">Members</th>
                <th className="px-4 py-3 text-right font-medium">Rounds</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {layouts.map((l) => (
                <tr key={l.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900">
                  <td className="px-4 py-3">{l.course}</td>
                  <td className="px-4 py-3">
                    <Link href={`/layouts/${l.id}`} className="font-medium hover:underline">
                      {l.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{l.holes ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{l.par ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {l.length ? `${l.length.toLocaleString()} ${l.units === "Meters" ? "m" : "ft"}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{l.members}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{l.rounds}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
