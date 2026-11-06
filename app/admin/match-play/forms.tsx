"use client";

import { useActionState, useRef } from "react";
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

// Runs the action, and clears the form's fields only when it worked.
function useResettingAction(action: (prev: FormState, formData: FormData) => Promise<FormState>) {
  const form = useRef<HTMLFormElement>(null);
  const [state, run, pending] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await action(prev, formData);
    if (!result.error) form.current?.reset();
    return result;
  }, {});
  return { form, state, run, pending };
}

export function NewEventForm() {
  const { form, state, run, pending } = useResettingAction(createEventAction);
  return (
    <form ref={form} action={run} className="flex flex-col gap-3">
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
  const { form, state, run, pending } = useResettingAction(createMatchupAction);
  return (
    <form ref={form} action={run} className="flex flex-col gap-2">
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

export function NewMatchForm({ eventId, matchups }: { eventId: number; matchups: ScoringMatchup[] }) {
  const { form, state, run, pending } = useResettingAction(createMatchAction);
  return (
    <form ref={form} action={run} className="flex flex-col gap-2">
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
        <label className="flex flex-col gap-1 text-sm">
          Side A (player or team)
          <input name="sideA" required placeholder="Logan H" className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Side B (player or team)
          <input name="sideB" required placeholder="Kevin L" className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Label <span className="sr-only">(optional)</span>
          <input name="label" placeholder="Optional, e.g. Singles 1" className={input} />
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
