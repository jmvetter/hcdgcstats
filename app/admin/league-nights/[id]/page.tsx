import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { isAdmin } from "@/lib/auth";
import { formatDate, formatToPar } from "@/lib/format";
import {
  getCheckIns,
  getNight,
  getNightPayout,
  listCheckInPlayers,
  listNights,
  listResultRounds,
  type DivisionPayout,
} from "@/lib/league-nights";
import { placesPaid } from "@/lib/payout";
import { resolveResultPlayerAction } from "../actions";
import {
  CheckInForm,
  CheckInList,
  CopyCheckInsForm,
  DeleteNightButton,
  PdgaResultsForm,
  ResultsPicker,
  SettingsForm,
} from "../forms";

export const metadata: Metadata = {
  title: "League night",
  robots: { index: false },
};

export default async function LeagueNightPage({ params }: PageProps<"/admin/league-nights/[id]">) {
  await connection();
  if (!(await isAdmin())) redirect("/admin");
  const night = getNight(Number((await params).id));
  if (!night) notFound();

  const checkIns = getCheckIns(night.id);
  const payout = getNightPayout(night, checkIns);
  const others = listNights()
    .filter((n) => n.id !== night.id && n.checkedIn > 0)
    .map((n) => ({ id: n.id, label: `${formatDate(n.date)} · ${n.name} (${n.checkedIn})` }));
  const { totals } = payout;
  const unpaid = checkIns.length - totals.paid;
  const pdgaId = night.eventId?.match(/^pdga-(\d+)$/)?.[1] ?? "";
  // Checked-in players with no score, who might be listed under another name in the results.
  const noScore = payout.divisions.flatMap((d) =>
    checkIns.filter((c) => c.division === d.division && d.noScore.includes(c.name)),
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <Link href="/admin/league-nights" className="text-sm text-zinc-500 hover:underline">
          ← League nights
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{night.name}</h1>
          <DeleteNightButton nightId={night.id} name={night.name} />
        </div>
        <p className="text-zinc-600 dark:text-zinc-400">
          {formatDate(night.date)} · ${night.entryFee} entry: ${night.poolPerPlayer} to the payout, $
          {night.acePerPlayer} to the ace pot, ${night.entryFee - night.poolPerPlayer - night.acePerPlayer} league fee
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Checked in" value={checkIns.length} />
        <Stat label="Paid" value={totals.paid} note={unpaid > 0 ? `${unpaid} not paid` : undefined} warn={unpaid > 0} />
        <Stat label="Collected" value={`$${totals.collected}`} />
        <Stat label="Payouts" value={`$${totals.pool}`} note={totals.added ? `incl. $${totals.added} added` : undefined} />
        <Stat label="Ace pot" value={`$${totals.acePot}`} />
        <Stat label="League fee" value={`$${totals.leagueFee}`} />
      </dl>

      <Section title="Check-in" description="Type a name to find a player; their PDGA number and usual division fill in. New players are added to the database (not as club members).">
        <CheckInForm nightId={night.id} players={listCheckInPlayers()} />
        <CopyCheckInsForm nightId={night.id} nights={others} />
        <CheckInList nightId={night.id} checkIns={checkIns} />
      </Section>

      <Section
        title="Results"
        description="Pull the round from PDGA Live, or import a UDisc export on the admin page and pick its round here. Payouts use each player's score for that round."
      >
        <PdgaResultsForm nightId={night.id} tournamentId={pdgaId} />
        <p className="text-sm text-zinc-500">
          Played in UDisc?{" "}
          <Link href="/admin" className="underline">
            Import the export on the admin page
          </Link>{" "}
          (type League), then pick it below.
        </p>
        <ResultsPicker night={night} rounds={listResultRounds()} />

        {payout.notCheckedIn.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">
              In the results but not checked in ({payout.notCheckedIn.length})
            </h3>
            <p className="text-sm text-zinc-500">
              They aren&apos;t in any payout until they&apos;re checked in and marked paid. If someone checked in under a
              different name, match them up here.
            </p>
            <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200 dark:divide-zinc-900 dark:border-zinc-800">
              {payout.notCheckedIn.map((p) => (
                <li key={p.playerId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 text-sm">
                  <span className="min-w-40 flex-1 font-medium">
                    {p.name} <span className="font-normal text-zinc-500">· {p.division ?? "no division"} · {p.score}</span>
                  </span>
                  <form action={resolveResultPlayerAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="nightId" value={night.id} />
                    <input type="hidden" name="playerId" value={p.playerId} />
                    <input
                      name="division"
                      defaultValue={p.division ?? ""}
                      aria-label={`Division for ${p.name}`}
                      className="w-20 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm uppercase dark:border-zinc-700 dark:bg-zinc-900"
                    />
                    <select
                      name="resolve"
                      aria-label={`What to do with ${p.name}`}
                      className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    >
                      <option value="paid">Check in as paid</option>
                      <option value="unpaid">Check in, not paid</option>
                      {noScore.map((c) => (
                        <option key={c.playerId} value={`relink:${c.playerId}`}>
                          Same person as {c.name}
                        </option>
                      ))}
                    </select>
                    <button className="font-medium hover:underline">Apply</button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section title="Payouts" description="Paid players in each division, ranked by their score for the round. Tied players split the payouts for the places they cover.">
        {payout.divisions.length === 0 ? (
          <p className="text-sm text-zinc-500">Check players in to see payouts.</p>
        ) : (
          <div className="flex flex-col gap-6">
            {payout.divisions.map((d) => (
              <DivisionTable key={d.division} d={d} percentPaid={night.settings.percentPaid} linked={!!night.eventId} />
            ))}
            <p className="text-sm font-medium">
              Total paid out: ${totals.paidOut} of ${totals.pool}
            </p>
          </div>
        )}
      </Section>

      <Section title="Payout settings" description="Defaults to the club's settings: top 40% paid, the calculator's normal curve, whole dollars. Changes apply to this night only; new nights start from the last night's settings.">
        <SettingsForm
          night={night}
          fields={payout.divisions.map((d) => ({ division: d.division, paid: d.paid }))}
        />
      </Section>
    </div>
  );
}

function DivisionTable({ d, percentPaid, linked }: { d: DivisionPayout; percentPaid: number; linked: boolean }) {
  const places = placesPaid(d.paid, percentPaid);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">{d.division}</h3>
        <span className="text-sm text-zinc-500">
          {d.paid} paid · ${d.pool} pool{d.added ? ` (incl. $${d.added} added)` : ""} · {places}{" "}
          {places === 1 ? "place" : "places"} paid: {d.places.map((p) => `$${p}`).join(", ") || "—"}
        </span>
      </div>
      {d.finishers.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {linked ? "No scores for this division's paid players in the linked round." : "Link the night's results to rank players."}
        </p>
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
                <tr key={f.playerId} className={f.payout > 0 ? "font-medium" : "text-zinc-500"}>
                  <td className="px-3 py-1.5">
                    {f.tied ? "T" : ""}
                    {f.place}
                  </td>
                  <td className="px-3 py-1.5">
                    <Link href={`/players/${f.playerId}`} className="hover:underline">
                      {f.name}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {f.score}
                    {f.toPar !== null && <span className="ml-1 text-zinc-500">({formatToPar(f.toPar)})</span>}
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
          <li>
            ${d.leftover} left over (rounding, ties splitting into odd dollars, or paid places nobody filled).
          </li>
        )}
        {linked && d.noScore.length > 0 && <li>Paid but no score: {d.noScore.join(", ")}.</li>}
        {d.unpaid.length > 0 && (
          <li className="text-amber-700 dark:text-amber-400">Checked in but not paid: {d.unpaid.join(", ")}.</li>
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
