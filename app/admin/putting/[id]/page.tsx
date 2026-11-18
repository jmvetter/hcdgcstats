import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { isAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { placesPaid } from "@/lib/payout";
import { getPuttingPayout, getPuttingNight, listPuttingCards, type DivisionPayout } from "@/lib/putting";
import { getPuttingConfig, type PuttingConfig } from "@/lib/putting-config";
import { maxRoundScore } from "@/lib/putting-score";
import { AddPlayerForm, CardList, DeletePuttingNightButton, PaidOutControls, PuttingSettings } from "../forms";

export const metadata: Metadata = {
  title: "Putting night",
  robots: { index: false },
};

export default async function PuttingNightAdminPage({ params }: PageProps<"/admin/putting/[id]">) {
  await connection();
  if (!(await isAdmin())) redirect("/admin");
  const night = getPuttingNight(Number((await params).id));
  if (!night) notFound();

  const config = getPuttingConfig(night.configVersion);
  const cards = listPuttingCards(night);
  const payout = getPuttingPayout(night, cards);
  const { totals } = payout;
  const unpaid = cards.length - totals.paid;
  const warnings = [
    ...(unpaid > 0 ? [`${unpaid} scorecard${unpaid === 1 ? " isn't" : "s aren't"} marked paid, so they're not in the payout.`] : []),
    ...payout.divisions.flatMap((d) => (d.incomplete.length ? [`${d.division || "No division"}: ${d.incomplete.join(", ")} still ha${d.incomplete.length === 1 ? "s" : "ve"} blank putts.`] : [])),
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <Link href="/admin/putting" className="text-sm text-zinc-500 hover:underline">
          ← Putting nights
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {night.name}
            {night.paidOutAt && (
              <span className="ml-3 rounded-full bg-green-100 px-2.5 py-0.5 align-middle text-xs font-medium text-green-800 dark:bg-green-950 dark:text-green-300">
                Paid out
              </span>
            )}
          </h1>
          <DeletePuttingNightButton nightId={night.id} name={night.name} />
        </div>
        <p className="text-zinc-600 dark:text-zinc-400">
          {formatDate(night.date)}
          {night.week !== null && ` · Week ${night.week}`} · ${night.entryFee} entry: ${night.poolPerPlayer} to the payout, $
          {night.entryFee - night.poolPerPlayer} league fee ·{" "}
          <Link href={`/putting/${night.id}`} className="underline">
            Open the scorecards
          </Link>
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Scorecards" value={cards.length} />
        <Stat label="Paid" value={totals.paid} note={unpaid > 0 ? `${unpaid} not paid` : undefined} warn={unpaid > 0} />
        <Stat label="Collected" value={`$${totals.collected}`} note={`$${totals.leagueFee} league fee`} />
        <Stat label="Payouts" value={`$${totals.pool}`} note={totals.added ? `incl. $${totals.added} added` : undefined} />
      </dl>

      <Section
        title="Scorecards"
        description="Anyone can start and edit scorecards at /putting until the night is locked. Mark who's paid here: only paid players are in the payout."
      >
        <AddPlayerForm nightId={night.id} />
        <CardList nightId={night.id} cards={cards} />
      </Section>

      <Section
        title="Payouts"
        description="Paid players in each division, ranked by round score (highest wins). Tied players split the payouts for the places they cover."
      >
        {payout.divisions.length === 0 ? (
          <p className="text-sm text-zinc-500">Add scorecards to see payouts.</p>
        ) : (
          <div className="flex flex-col gap-6">
            {payout.divisions.map((d) => (
              <DivisionTable key={d.division} d={d} percentPaid={night.settings.percentPaid} config={config} />
            ))}
            <p className="text-sm font-medium">
              Total paid out: ${totals.paidOut} of ${totals.pool}
            </p>
          </div>
        )}
      </Section>

      <Section
        title="Paid out"
        description="Locking stops anyone but an admin from adding scorecards or changing putts."
      >
        <PaidOutControls nightId={night.id} paidOutAt={night.paidOutAt} warnings={warnings} />
      </Section>

      <Section
        title="Night details and payout settings"
        description="Changes apply to this night only; new nights start from the last night's settings."
      >
        <PuttingSettings
          key={JSON.stringify([night.name, night.date, night.week, night.scorekeeper, night.distancesFt, night.stations, night.entryFee, night.poolPerPlayer, night.addedCash, night.settings])}
          night={night}
          config={config}
          fields={payout.divisions.map((d) => ({ division: d.division, paid: d.paid }))}
        />
      </Section>
    </div>
  );
}

function DivisionTable({ d, percentPaid, config }: { d: DivisionPayout; percentPaid: number; config: PuttingConfig }) {
  const places = placesPaid(d.paid, percentPaid);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">{d.division || "No division"}</h3>
        <span className="text-sm text-zinc-500">
          {d.paid} paid · ${d.pool} pool{d.added ? ` (incl. $${d.added} added)` : ""} · {places}{" "}
          {places === 1 ? "place" : "places"} paid: {d.places.map((p) => `$${p}`).join(", ") || "—"}
        </span>
      </div>
      {d.finishers.length === 0 ? (
        <p className="text-sm text-zinc-500">No paid scorecards in this division yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm tabular-nums">
            <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="w-16 px-3 py-2 font-medium">Place</th>
                <th className="px-3 py-2 font-medium">Player</th>
                <th className="px-3 py-2 text-right font-medium">Score</th>
                <th className="w-24 px-3 py-2 text-right font-medium">Payout</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {d.finishers.map((f) => (
                <tr key={f.card.playerId} className={f.payout > 0 ? "font-medium" : "text-zinc-500"}>
                  <td className="px-3 py-1.5">
                    {f.tied ? "T" : ""}
                    {f.place}
                  </td>
                  <td className="px-3 py-1.5">
                    <Link href={`/players/${f.card.playerId}`} className="hover:underline">
                      {f.card.name}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {f.total}
                    <span className="ml-1 text-zinc-500">/ {maxRoundScore(config)}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right">{f.payout > 0 ? `$${f.payout}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ul className="flex flex-col gap-0.5 text-sm text-zinc-500">
        {d.leftover > 0 && (
          <li>${d.leftover} left over (rounding, ties splitting into odd dollars, or paid places nobody filled).</li>
        )}
        {d.incomplete.length > 0 && (
          <li className="text-amber-700 dark:text-amber-400">Paid but the card has blank putts: {d.incomplete.join(", ")}.</li>
        )}
        {d.unpaid.length > 0 && (
          <li className="text-amber-700 dark:text-amber-400">Has a scorecard but isn&apos;t paid: {d.unpaid.join(", ")}.</li>
        )}
      </ul>
    </div>
  );
}

function Stat({ label, value, note, warn }: { label: string; value: React.ReactNode; note?: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
      {note && <dd className={`text-xs ${warn ? "text-amber-700 dark:text-amber-400" : "text-zinc-500"}`}>{note}</dd>}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
      </div>
      {children}
    </section>
  );
}
