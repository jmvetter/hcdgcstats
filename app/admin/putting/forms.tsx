"use client";

import { useActionState, useState } from "react";
import type { PuttingCard, PuttingNight } from "@/lib/putting";
import type { PuttingConfig } from "@/lib/putting-config";
import { SettingsForm } from "../league-nights/forms";
import type { FormState } from "../league-nights/actions";
import {
  addPuttingCardAction,
  createPuttingNightAction,
  deletePuttingNightAction,
  removePuttingCardAction,
  savePuttingNightAction,
  setPuttingDivisionAction,
  setPuttingPaidAction,
  setPuttingPaidOutAction,
} from "./actions";

const input =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const smallInput =
  "rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const button =
  "rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200";
const quietButton =
  "rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900";

function Status({ state }: { state: FormState }) {
  if (state.error) return <p className="text-sm text-red-600">{state.error}</p>;
  if (state.message) return <p className="text-sm text-green-700 dark:text-green-400">{state.message}</p>;
  return null;
}

// Local date, so a night created in the evening isn't dated tomorrow (UTC).
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function NewPuttingNightForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createPuttingNightAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-end">
        <label className="flex flex-col gap-1 text-sm">
          Date
          <input type="date" name="date" defaultValue={today()} required className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input name="name" placeholder="Putting league, week 3" className={input} />
        </label>
        <button disabled={pending} className={button}>
          {pending ? "Creating…" : "Start a putting night"}
        </button>
      </div>
      <Status state={state} />
    </form>
  );
}

// Night details, money and payout settings, with the payout formula's preview.
export function PuttingSettings({
  night,
  config,
  fields,
}: {
  night: PuttingNight;
  config: PuttingConfig;
  fields: { division: string; paid: number }[];
}) {
  return (
    <SettingsForm
      night={night}
      fields={fields}
      action={savePuttingNightAction}
      extraFields={
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              Week
              <input name="week" inputMode="numeric" defaultValue={night.week ?? ""} className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Scorekeeper
              <input name="scorekeeper" defaultValue={night.scorekeeper ?? ""} className={input} />
            </label>
          </div>
          <fieldset className="grid min-w-0 gap-3 sm:grid-cols-3">
            <legend className="mb-2 text-sm font-medium">Distances (feet, optional)</legend>
            {config.distances.map((d, i) => (
              <label key={d.label} className="flex flex-col gap-1 text-sm">
                {d.label} ({d.name.toLowerCase()})
                <input
                  name={`distance:${i}`}
                  inputMode="numeric"
                  defaultValue={night.distancesFt[i] ?? ""}
                  className={input}
                />
              </label>
            ))}
          </fieldset>
        </>
      }
    />
  );
}

export function AddPlayerForm({ nightId }: { nightId: number }) {
  const [name, setName] = useState("");
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await addPuttingCardAction(prev, formData);
    if (!result.error) setName("");
    return result;
  }, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="nightId" value={nightId} />
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
        <label className="flex flex-col gap-1 text-sm">
          Player
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            placeholder="Full name"
            required
            className={input}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Division
          <input name="division" placeholder="optional" className={`${input} uppercase`} />
        </label>
        <button disabled={pending} className={button}>
          {pending ? "Adding…" : "Add a scorecard"}
        </button>
      </div>
      <p className="text-xs text-zinc-500">
        Matches an existing player by exact name, or adds a new player (not a club member). People at the venue pick
        from the existing list themselves.
      </p>
      <Status state={state} />
    </form>
  );
}

export function CardList({ nightId, cards }: { nightId: number; cards: PuttingCard[] }) {
  if (cards.length === 0) return <p className="text-sm text-zinc-500">No scorecards yet.</p>;
  return (
    <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900">
          <tr>
            <th className="px-3 py-2 font-medium">Player</th>
            <th className="w-28 px-3 py-2 font-medium">Division</th>
            <th className="px-3 py-2 text-right font-medium">Score</th>
            <th className="px-3 py-2 font-medium">Card</th>
            <th className="w-16 px-3 py-2 text-center font-medium">Paid</th>
            <th className="w-20 px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {cards.map((c) => (
            <CardRow key={`${c.playerId}|${c.division}|${c.paid}`} nightId={nightId} card={c} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CardRow({ nightId, card: c }: { nightId: number; card: PuttingCard }) {
  const [pending, setPending] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setPending(true);
    try {
      await fn();
    } finally {
      setPending(false);
    }
  };
  return (
    <tr className={c.paid ? "" : "bg-amber-50/60 dark:bg-amber-950/20"}>
      <td className="px-3 py-1.5 font-medium">{c.name}</td>
      <td className="px-3 py-1.5">
        <input
          defaultValue={c.division}
          aria-label={`Division for ${c.name}`}
          onBlur={(e) => {
            const v = e.currentTarget.value.trim().toUpperCase();
            if (v !== c.division) run(() => setPuttingDivisionAction(nightId, c.playerId, v));
          }}
          className={`${smallInput} w-20 uppercase`}
        />
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums">{c.score.total}</td>
      <td className="px-3 py-1.5 text-xs">
        {c.score.complete ? (
          <span className="text-zinc-500">Complete</span>
        ) : (
          <span className="text-amber-700 dark:text-amber-400">{c.score.blanks} putts blank</span>
        )}
      </td>
      <td className="px-3 py-1.5 text-center">
        <input
          type="checkbox"
          defaultChecked={c.paid}
          disabled={pending}
          onChange={(e) => {
            const paid = e.currentTarget.checked;
            run(() => setPuttingPaidAction(nightId, c.playerId, paid));
          }}
          aria-label={`${c.name} paid`}
          className="size-4"
        />
      </td>
      <td className="px-3 py-1.5 text-right">
        <button
          disabled={pending}
          onClick={() => {
            if (!c.score.entered || confirm(`Remove ${c.name}'s scorecard and its ${c.score.entered} putts?`)) {
              run(() => removePuttingCardAction(nightId, c.playerId));
            }
          }}
          className="text-sm text-red-600 hover:underline disabled:opacity-50"
        >
          Remove
        </button>
      </td>
    </tr>
  );
}

// Paying out locks the night's scorecards against everyone but admins.
export function PaidOutControls({ nightId, paidOutAt, warnings }: { nightId: number; paidOutAt: string | null; warnings: string[] }) {
  const [pending, setPending] = useState(false);
  const toggle = async (paidOut: boolean) => {
    if (paidOut && warnings.length > 0 && !confirm(`${warnings.join("\n")}\n\nMark paid out and lock the scorecards anyway?`)) {
      return;
    }
    setPending(true);
    try {
      await setPuttingPaidOutAction(nightId, paidOut);
    } finally {
      setPending(false);
    }
  };
  return paidOutAt ? (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-green-700 dark:text-green-400">
        Paid out on {new Date(paidOutAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}. The
        scorecards are locked; only an admin can change them.
      </p>
      <button disabled={pending} onClick={() => toggle(false)} className={`${quietButton} self-start`}>
        {pending ? "Reopening…" : "Reopen scorecards"}
      </button>
    </div>
  ) : (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Once everyone has been paid, lock the night. After that nobody can add scorecards or change putts without admin
        rights, so the payout can&apos;t move.
      </p>
      <button disabled={pending} onClick={() => toggle(true)} className={`${button} self-start`}>
        {pending ? "Locking…" : "Mark paid out and lock"}
      </button>
    </div>
  );
}

export function DeletePuttingNightButton({ nightId, name }: { nightId: number; name: string }) {
  return (
    <form
      action={deletePuttingNightAction}
      onSubmit={(e) => {
        if (!confirm(`Delete "${name}" and all of its scorecards? This can't be undone.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="nightId" value={nightId} />
      <button className="text-sm text-red-600 hover:underline">Delete night</button>
    </form>
  );
}
