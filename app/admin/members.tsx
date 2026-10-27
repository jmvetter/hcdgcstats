"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { Player } from "@/lib/data";
import {
  addMemberAction,
  deletePlayerAction,
  updatePlayerAction,
  type MemberState,
} from "./actions";

const input =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const smallInput =
  "w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const button =
  "rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200";

export function AddMemberForm({ pdgaLookup }: { pdgaLookup: boolean }) {
  const [state, action, pending] = useActionState<MemberState, FormData>(addMemberAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
        <label className="flex flex-col gap-1 text-sm">
          Name{pdgaLookup && <span className="text-zinc-500"> (optional with a PDGA number)</span>}
          <input name="name" className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          PDGA number
          <input name="pdgaNumber" inputMode="numeric" className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Division
          <input name="division" placeholder="MA1" className={input} />
        </label>
        <button disabled={pending} className={button}>
          {pending ? "Adding…" : "Add member"}
        </button>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.message && <p className="text-sm text-green-700 dark:text-green-400">{state.message}</p>}
    </form>
  );
}

export function PlayerList({ players }: { players: Player[] }) {
  const [query, setQuery] = useState("");
  const [membersOnly, setMembersOnly] = useState(true);
  const q = query.trim().toLowerCase();
  const shown = players.filter(
    (p) =>
      (!membersOnly || p.member) &&
      (!q || p.name.toLowerCase().includes(q) || String(p.pdgaNumber ?? "").includes(q)),
  );
  const memberCount = players.filter((p) => p.member).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or PDGA #"
          className={`${input} w-full sm:w-64`}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={membersOnly} onChange={(e) => setMembersOnly(e.target.checked)} />
          Members only ({memberCount} of {players.length} players)
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-zinc-500">No players match.</p>
      ) : (
        <div className="max-h-[32rem] overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-zinc-50 text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="w-28 px-3 py-2 font-medium">PDGA #</th>
                <th className="w-24 px-3 py-2 font-medium">Division</th>
                <th className="w-20 px-3 py-2 font-medium">Member</th>
                <th className="w-40 px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {shown.map((p) => (
                // Keyed on the saved values so the inputs reset after a save.
                <PlayerRow key={`${p.id}|${p.name}|${p.pdgaNumber}|${p.division}|${p.member}`} player={p} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PlayerRow({ player }: { player: Player }) {
  const [state, action, pending] = useActionState<MemberState, FormData>(updatePlayerAction, {});
  const formId = `player-${player.id}`;
  return (
    <tr className="align-top">
      <td className="px-3 py-2">
        <form id={formId} action={action}>
          <input type="hidden" name="id" value={player.id} />
        </form>
        <input form={formId} name="name" defaultValue={player.name} required className={smallInput} />
        {state.error && <p className="mt-1 text-xs text-red-600">{state.error}</p>}
      </td>
      <td className="px-3 py-2">
        <input
          form={formId}
          name="pdgaNumber"
          inputMode="numeric"
          defaultValue={player.pdgaNumber ?? ""}
          className={smallInput}
        />
      </td>
      <td className="px-3 py-2">
        <input form={formId} name="division" defaultValue={player.division ?? ""} className={smallInput} />
      </td>
      <td className="px-3 py-2 text-center">
        <input form={formId} type="checkbox" name="member" defaultChecked={player.member} className="mt-2" />
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <button form={formId} disabled={pending} className="mr-3 text-sm font-medium hover:underline">
          {pending ? "Saving…" : "Save"}
        </button>
        <Link href={`/players/${player.id}`} className="mr-3 text-sm text-zinc-500 hover:underline">
          View
        </Link>
        <form
          action={deletePlayerAction}
          className="inline"
          onSubmit={(e) => {
            if (!confirm(`Remove ${player.name} and all of their results? This can't be undone.`)) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="id" value={player.id} />
          <button className="text-sm text-red-600 hover:underline">Remove</button>
        </form>
      </td>
    </tr>
  );
}
