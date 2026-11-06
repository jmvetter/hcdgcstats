"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import type { ScoringMatchup } from "@/lib/scoring";
import { createEventAction, createMatchAction, createMatchupAction, type FormState } from "./actions";

const input =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const button =
  "rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200";

function Status({ state }: { state: FormState }) {
  if (state.error) return <p className="text-sm text-red-600">{state.error}</p>;
  if (state.message) return <p className="text-sm text-green-700 dark:text-green-400">{state.message}</p>;
  return null;
}

// Runs the action, and clears the form's fields only when it worked. Submitting
// through onSubmit (not the form's action prop) stops React from clearing the
// fields after an error, so a typo doesn't wipe every pick.
function useResettingAction(action: (prev: FormState, formData: FormData) => Promise<FormState>) {
  const form = useRef<HTMLFormElement>(null);
  const [state, run, pending] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await action(prev, formData);
    if (!result.error) form.current?.reset();
    return result;
  }, {});
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => run(formData));
  };
  return { form, state, onSubmit, pending };
}

export function NewEventForm() {
  const { form, state, onSubmit, pending } = useResettingAction(createEventAction);
  return (
    <form ref={form} onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <label className="flex flex-col gap-1 text-sm">
          Event name
          <input name="name" required placeholder="2027 Club Challenge" className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Date
          <input type="date" name="date" className={input} />
        </label>
        <button disabled={pending} className={button}>
          {pending ? "Adding…" : "Add event"}
        </button>
      </div>
      <Status state={state} />
    </form>
  );
}

export function NewMatchupForm({ eventId }: { eventId: number }) {
  const { form, state, onSubmit, pending } = useResettingAction(createMatchupAction);
  return (
    <form ref={form} onSubmit={onSubmit} className="flex flex-col gap-2">
      <input type="hidden" name="eventId" value={eventId} />
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="flex flex-col gap-1 text-sm">
          Team A
          <input name="teamA" required placeholder="Hendricks Co" className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Team B
          <input name="teamB" required placeholder="Henry Co" className={input} />
        </label>
        <button disabled={pending} className={button}>
          {pending ? "Adding…" : "Add team matchup"}
        </button>
      </div>
      <Status state={state} />
    </form>
  );
}

function SidePicker({
  side,
  title,
  count,
  players,
}: {
  side: "a" | "b";
  title: string;
  count: number;
  players: string[];
}) {
  return (
    <fieldset className="flex flex-col gap-2 text-sm">
      <legend className="mb-1">{count > 1 ? `${title} players` : `${title} player`}</legend>
      {Array.from({ length: count }, (_, i) => (
        <select
          key={i}
          name={`${side}${i + 1}`}
          required
          defaultValue=""
          aria-label={`${title} player ${i + 1}`}
          className={input}
        >
          <option value="" disabled>
            {count > 1 ? `Pick player ${i + 1}…` : "Pick a player…"}
          </option>
          {players.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      ))}
    </fieldset>
  );
}

export function NewMatchForm({
  eventId,
  matchups,
  players,
}: {
  eventId: number;
  matchups: ScoringMatchup[];
  players: string[];
}) {
  const { form, state, onSubmit, pending } = useResettingAction(createMatchAction);
  const [format, setFormat] = useState<"singles" | "doubles">("singles");
  const perSide = format === "doubles" ? 2 : 1;
  return (
    <form ref={form} onSubmit={onSubmit} className="flex flex-col gap-2">
      <input type="hidden" name="eventId" value={eventId} />
      <div className="grid gap-2 sm:grid-cols-2">
        {matchups.length > 0 && (
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            Team matchup
            <select name="matchupId" className={input}>
              <option value="">None (not part of a team score)</option>
              {matchups.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.teamA} vs {m.teamB}
                </option>
              ))}
            </select>
          </label>
        )}
        <fieldset className="flex flex-col gap-1 text-sm sm:col-span-2">
          <legend className="mb-1">Format</legend>
          <input type="hidden" name="format" value={format} />
          <div className="inline-flex self-start rounded-full border border-zinc-300 p-0.5 dark:border-zinc-700">
            {(["singles", "doubles"] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={format === f}
                onClick={() => setFormat(f)}
                className={`rounded-full px-4 py-1.5 text-sm capitalize ${
                  format === f
                    ? "bg-black text-white dark:bg-white dark:text-black"
                    : "text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </fieldset>
        <SidePicker side="a" title="Side A" count={perSide} players={players} />
        <SidePicker side="b" title="Side B" count={perSide} players={players} />
        <label className="flex flex-col gap-1 text-sm">
          Label <span className="sr-only">(optional)</span>
          <input name="label" placeholder={`Optional, e.g. ${format === "doubles" ? "Doubles" : "Singles"} 1`} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Holes
          <input name="holes" type="number" min={1} max={36} defaultValue={18} required className={input} />
        </label>
      </div>
      <button disabled={pending} className={`${button} self-start`}>
        {pending ? "Adding…" : "Add match"}
      </button>
      <Status state={state} />
    </form>
  );
}

export function ConfirmButton({ message, children }: { message: string; children: React.ReactNode }) {
  return (
    <button
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
      className="text-sm text-red-600 hover:underline"
    >
      {children}
    </button>
  );
}
