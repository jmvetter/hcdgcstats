"use client";

import Link from "next/link";
import { useOffline } from "next/offline";
import { useOptimistic, useState, useTransition } from "react";
import { checkInAction, removeCheckInAction, updateCheckInAction } from "@/app/admin/league-nights/actions";
import { formatDate } from "@/lib/format";
import type { CheckIn, CheckInPlayer } from "@/lib/league-nights";

type Night = { id: number; name: string; date: string; entryFee: number };
type Row = CheckIn & { saving?: boolean };
type Change =
  | { type: "add"; row: Row }
  | { type: "paid"; playerId: string; paid: boolean }
  | { type: "remove"; playerId: string };
// Who's being checked in: a known player, or a new one by name.
type Selected = { player: CheckInPlayer | null; name: string };

function apply(rows: Row[], change: Change): Row[] {
  switch (change.type) {
    case "add":
      return [...rows.filter((r) => r.name.toLowerCase() !== change.row.name.toLowerCase()), change.row];
    case "paid":
      return rows.map((r) => (r.playerId === change.playerId ? { ...r, paid: change.paid, saving: true } : r));
    case "remove":
      return rows.filter((r) => r.playerId !== change.playerId);
  }
}

const field =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-3 text-base dark:border-zinc-700 dark:bg-zinc-900";

// Phone-first check-in. Changes show at once and save in the background; with
// no signal they wait (experimental.useOffline) and send when it comes back.
export function CheckInScreen({
  night,
  checkIns,
  players,
  divisions,
}: {
  night: Night;
  checkIns: CheckIn[];
  players: CheckInPlayer[];
  divisions: string[];
}) {
  const [rows, change] = useOptimistic<Row[], Change>(checkIns, apply);
  const [, startTransition] = useTransition();
  const offline = useOffline();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Selected | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);

  const save = (optimistic: Change, send: () => Promise<{ error?: string; message?: string } | void>) =>
    startTransition(async () => {
      setNotice(null);
      change(optimistic);
      const result = await send();
      if (result?.error) setNotice({ text: result.error, error: true });
    });

  const checkedIn = new Map(rows.map((r) => [r.playerId, r]));
  const q = query.trim().toLowerCase();
  const matches = q ? players.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8) : [];
  const exact = players.some((p) => p.name.toLowerCase() === q);
  const paid = rows.filter((r) => r.paid).length;
  // Not Map.groupBy, which older iPhones don't have.
  const byDivision = new Map<string, Row[]>();
  for (const r of [...rows].sort((a, b) => a.name.localeCompare(b.name))) {
    byDivision.set(r.division, [...(byDivision.get(r.division) ?? []), r]);
  }

  const submit = (s: Selected, division: string, isPaid: boolean, pdga: string) => {
    const name = s.player?.name ?? s.name.trim().replace(/\s+/g, " ");
    const fd = new FormData();
    fd.set("nightId", String(night.id));
    fd.set("name", name);
    fd.set("pdgaNumber", s.player?.pdgaNumber ? String(s.player.pdgaNumber) : pdga);
    fd.set("division", division);
    if (isPaid) fd.set("paid", "on");
    save(
      {
        type: "add",
        row: {
          playerId: s.player?.id ?? `new:${name}`,
          name,
          pdgaNumber: s.player?.pdgaNumber ?? null,
          division,
          paid: isPaid,
          saving: true,
        },
      },
      () => checkInAction({}, fd),
    );
    // After save() clears the last one.
    setNotice({ text: `${name} checked in (${division})${isPaid ? ", paid" : ", not paid yet"}.` });
    setSelected(null);
    setQuery("");
  };

  const togglePaid = (r: Row) => {
    const fd = new FormData();
    fd.set("nightId", String(night.id));
    fd.set("playerId", r.playerId);
    fd.set("division", r.division);
    if (!r.paid) fd.set("paid", "on");
    save({ type: "paid", playerId: r.playerId, paid: !r.paid }, () => updateCheckInAction(fd));
  };

  const remove = (r: Row) => {
    if (!confirm(`Remove ${r.name} from tonight?`)) return;
    const fd = new FormData();
    fd.set("nightId", String(night.id));
    fd.set("playerId", r.playerId);
    save({ type: "remove", playerId: r.playerId }, () => removeCheckInAction(fd));
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/check-in" className="text-sm text-zinc-500 hover:underline">
          ← League nights
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{night.name}</h1>
        <p className="text-sm text-zinc-500">{formatDate(night.date)}</p>
      </div>

      {offline && (
        <p role="status" className="rounded-lg bg-amber-100 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          No signal. Keep checking people in; changes are held on this screen and send when you&apos;re back online.
          Don&apos;t close the app until they&apos;ve saved.
        </p>
      )}

      <dl className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Checked in" value={rows.length} />
        <Stat label="Paid" value={paid} warn={paid < rows.length} />
        <Stat label="Collected" value={`$${paid * night.entryFee}`} />
      </dl>

      {selected ? (
        <CheckInPanel
          key={selected.player?.id ?? selected.name}
          selected={selected}
          divisions={divisions}
          already={selected.player ? checkedIn.get(selected.player.id) : undefined}
          onCancel={() => setSelected(null)}
          onSubmit={submit}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setNotice(null);
            }}
            placeholder="Find a player"
            aria-label="Find a player"
            autoComplete="off"
            className={field}
          />
          {(matches.length > 0 || (q && !exact)) && (
            <ul className="flex flex-col divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:divide-zinc-900 dark:border-zinc-800 dark:bg-zinc-950">
              {matches.map((p) => {
                const row = checkedIn.get(p.id);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelected({ player: p, name: p.name })}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900"
                    >
                      <span className="text-base font-medium">{p.name}</span>
                      <span className="text-sm text-zinc-500">
                        {row ? `In · ${row.division}${row.paid ? "" : " · not paid"}` : p.division}
                      </span>
                    </button>
                  </li>
                );
              })}
              {q && !exact && (
                <li>
                  <button
                    type="button"
                    onClick={() => setSelected({ player: null, name: query })}
                    className="w-full px-4 py-3 text-left text-base hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  >
                    Add new player <span className="font-medium">&ldquo;{query.trim()}&rdquo;</span>
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      {notice && (
        <p className={`text-sm ${notice.error ? "text-red-600" : "text-green-700 dark:text-green-400"}`}>{notice.text}</p>
      )}

      <section className="flex flex-col gap-4">
        {rows.length === 0 && <p className="text-sm text-zinc-500">Nobody&apos;s checked in yet.</p>}
        {[...byDivision.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([division, list]) => (
            <div key={division} className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-zinc-500">
                {division} · {list.length}
              </h2>
              <ul className="flex flex-col divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-900 dark:border-zinc-800 dark:bg-zinc-950">
                {list.map((r) => (
                  <li key={r.playerId} className="flex items-center gap-3 px-4 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-medium">{r.name}</span>
                      {r.saving && (
                        <span className="text-xs text-zinc-500">{offline ? "Waiting for signal…" : "Saving…"}</span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => togglePaid(r)}
                      disabled={r.saving}
                      aria-label={`${r.name}: ${r.paid ? "paid, tap to mark not paid" : "not paid, tap to mark paid"}`}
                      className={`min-w-24 rounded-full px-4 py-2 text-sm font-semibold ${
                        r.paid
                          ? "bg-green-700 text-white dark:bg-green-600"
                          : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                      }`}
                    >
                      {r.paid ? "Paid" : "Not paid"}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(r)}
                      disabled={r.saving}
                      aria-label={`Remove ${r.name}`}
                      className="px-1 py-2 text-xl leading-none text-zinc-400 hover:text-red-600"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </section>

      <Link href={`/admin/league-nights/${night.id}`} className="text-sm text-zinc-500 hover:underline">
        Results, payouts and division changes →
      </Link>
    </div>
  );
}

function CheckInPanel({
  selected,
  divisions,
  already,
  onCancel,
  onSubmit,
}: {
  selected: Selected;
  divisions: string[];
  already?: Row;
  onCancel: () => void;
  onSubmit: (s: Selected, division: string, paid: boolean, pdga: string) => void;
}) {
  const usual = already?.division ?? selected.player?.division ?? "";
  const [division, setDivision] = useState(usual);
  const [paid, setPaid] = useState(already?.paid ?? true);
  const [pdga, setPdga] = useState("");
  const options = [...new Set([usual, ...divisions].filter(Boolean))];
  const name = selected.player?.name ?? selected.name.trim();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (division.trim()) onSubmit(selected, division.trim().toUpperCase(), paid, pdga.replace(/\D/g, ""));
      }}
      className="flex flex-col gap-4 rounded-lg border border-zinc-300 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-950"
    >
      <div>
        <p className="text-lg font-semibold">{name}</p>
        <p className="text-sm text-zinc-500">
          {selected.player
            ? already
              ? "Already checked in. Saving updates their division and payment."
              : selected.player.pdgaNumber
                ? `PDGA #${selected.player.pdgaNumber}`
                : "No PDGA number on file"
            : "New player, added to the database (not as a club member)"}
        </p>
      </div>

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Division</legend>
        <div className="flex flex-wrap gap-2">
          {options.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDivision(d)}
              aria-pressed={division === d}
              className={`rounded-full border px-4 py-2 text-base font-medium ${
                division === d
                  ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                  : "border-zinc-300 dark:border-zinc-700"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
        <input
          value={options.includes(division) ? "" : division}
          onChange={(e) => setDivision(e.target.value.toUpperCase())}
          placeholder="Other division"
          aria-label="Other division"
          className={field}
        />
      </fieldset>

      {!selected.player && (
        <label className="flex flex-col gap-1 text-sm font-medium">
          PDGA # (optional)
          <input value={pdga} onChange={(e) => setPdga(e.target.value)} inputMode="numeric" className={field} />
        </label>
      )}

      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Payment">
        {[true, false].map((v) => (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={paid === v}
            onClick={() => setPaid(v)}
            className={`rounded-lg border px-4 py-3 text-base font-semibold ${
              paid === v
                ? v
                  ? "border-green-700 bg-green-700 text-white dark:border-green-600 dark:bg-green-600"
                  : "border-amber-500 bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                : "border-zinc-300 text-zinc-500 dark:border-zinc-700"
            }`}
          >
            {v ? "Paid" : "Not paid"}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!division.trim()}
          className="flex-1 rounded-lg bg-black px-4 py-3 text-base font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {already ? "Save" : "Check in"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-zinc-300 px-4 py-3 text-base dark:border-zinc-700">
          Cancel
        </button>
      </div>
    </form>
  );
}

function Stat({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className={`text-xl font-semibold tabular-nums ${warn ? "text-amber-700 dark:text-amber-400" : ""}`}>{value}</dd>
    </div>
  );
}
