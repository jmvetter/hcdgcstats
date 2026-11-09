"use client";

import { startTransition, useActionState, useRef, useState, useTransition } from "react";
import type { MatchLayout, ScoringMatchup } from "@/lib/scoring";
import { createEventAction, createMatchAction, createMatchupAction, updateMatchAction, type FormState } from "./actions";

const input =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const button =
  "rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200";

function Status({ state }: { state: FormState }) {
  if (state.error) return <p className="text-sm text-red-600">{state.error}</p>;
  if (state.message) return <p className="text-sm text-green-700 dark:text-green-400">{state.message}</p>;
  return null;
}

// Runs the action, and clears the form's fields only when it worked (or calls
// onSuccess instead, for forms that keep some choices). Submitting through
// onSubmit (not the form's action prop) stops React from clearing the fields
// after an error, so a typo doesn't wipe every pick.
function useResettingAction(
  action: (prev: FormState, formData: FormData) => Promise<FormState>,
  onSuccess?: () => void,
) {
  const form = useRef<HTMLFormElement>(null);
  const [state, run, pending] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await action(prev, formData);
    if (!result.error) {
      if (onSuccess) onSuccess();
      else form.current?.reset();
    }
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

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="inline-flex self-start rounded-full border border-zinc-300 p-0.5 dark:border-zinc-700">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          aria-label={`${label}: ${o.label}`}
          onClick={() => onChange(o.value)}
          className={`min-w-10 rounded-full px-4 py-1.5 text-sm ${
            value === o.value
              ? "bg-black text-white dark:bg-white dark:text-black"
              : "text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
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
  lastRound,
  layouts,
  lastLayoutId,
}: {
  eventId: number;
  matchups: ScoringMatchup[];
  players: string[];
  // Highest round that already has matches; new matches start there.
  lastRound: number;
  layouts: MatchLayout[];
  // The layout of the event's latest match, so the next one defaults to it.
  lastLayoutId: string | null;
}) {
  // After a match is added only the players and label clear (by remounting
  // them); the matchup, round, format and holes stay for the next match.
  const [cleared, setCleared] = useState(0);
  const { form, state, onSubmit, pending } = useResettingAction(createMatchAction, () => setCleared((n) => n + 1));
  const [format, setFormat] = useState<"singles" | "doubles">("singles");
  const [round, setRound] = useState(Math.max(1, lastRound));
  const roundChoices = Array.from({ length: Math.max(3, lastRound) }, (_, i) => i + 1);
  const perSide = format === "doubles" ? 2 : 1;
  return (
    <form ref={form} onSubmit={onSubmit} className="flex flex-col gap-2">
      <input type="hidden" name="eventId" value={eventId} />
      <div className="grid gap-2 sm:grid-cols-2">
        {matchups.length > 0 && (
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            Team matchup
            <select name="matchupId" defaultValue={matchups[0].id} className={input}>
              <option value="">None (not part of a team score)</option>
              {matchups.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.teamA} vs {m.teamB}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Layout
          <select name="layoutId" defaultValue={lastLayoutId ?? ""} className={input}>
            <option value="">No layout (holes numbered 1, 2, 3…)</option>
            {layouts.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.holes} holes)
              </option>
            ))}
          </select>
        </label>
        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="mb-1">Round</legend>
          <input type="hidden" name="round" value={round} />
          <Segmented
            options={roundChoices.map((r) => ({ value: r, label: String(r) }))}
            value={round}
            onChange={setRound}
            label="Round"
          />
        </fieldset>
        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="mb-1">Format</legend>
          <input type="hidden" name="format" value={format} />
          <Segmented
            options={[
              { value: "singles", label: "Singles" },
              { value: "doubles", label: "Doubles" },
            ]}
            value={format}
            onChange={setFormat}
            label="Format"
          />
        </fieldset>
        <SidePicker key={`a${cleared}`} side="a" title="Side A" count={perSide} players={players} />
        <SidePicker key={`b${cleared}`} side="b" title="Side B" count={perSide} players={players} />
        <label className="flex flex-col gap-1 text-sm">
          Label <span className="sr-only">(optional)</span>
          <input
            key={`label${cleared}`}
            name="label"             placeholder={`Optional, e.g. ${format === "doubles" ? "Doubles" : "Singles"} 1`}
            className={input}
          />
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

// Inline round and team-matchup pickers on a match in the admin list, so a
// match set up in the wrong place can be moved without losing its scores.
export function MatchPlacement({
  matchId,
  matchupId,
  round,
  layoutId,
  matchups,
  rounds,
  layouts,
}: {
  matchId: number;
  matchupId: number | null;
  round: number;
  layoutId: string | null;
  matchups: ScoringMatchup[];
  rounds: number;
  layouts: MatchLayout[];
}) {
  const [value, setValue] = useState({ matchupId, round, layoutId });
  const [error, setError] = useState<string | null>(null);
  const [pending, startSaving] = useTransition();
  const save = (next: typeof value) => {
    setValue(next);
    setError(null);
    startSaving(async () => {
      const result = await updateMatchAction(matchId, next.matchupId, next.round, next.layoutId);
      if (result.error) setError(result.error);
    });
  };
  const small =
    "rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-900";
  return (
    <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
      <select
        aria-label="Round"
        value={value.round}
        onChange={(e) => save({ ...value, round: Number(e.target.value) })}
        className={small}
      >
        {Array.from({ length: Math.max(3, rounds, value.round) }, (_, i) => i + 1).map((r) => (
          <option key={r} value={r}>
            Round {r}
          </option>
        ))}
      </select>
      {matchups.length > 0 && (
        <select
          aria-label="Team matchup"
          value={value.matchupId ?? ""}
          onChange={(e) => save({ ...value, matchupId: e.target.value ? Number(e.target.value) : null })}
          className={`${small} ${value.matchupId === null ? "border-amber-500 text-amber-700 dark:text-amber-400" : ""}`}
        >
          <option value="">No team matchup</option>
          {matchups.map((m) => (
            <option key={m.id} value={m.id}>
              {m.teamA} vs {m.teamB}
            </option>
          ))}
        </select>
      )}
      <select
        aria-label="Layout"
        value={value.layoutId ?? ""}
        onChange={(e) => save({ ...value, layoutId: e.target.value || null })}
        className={`${small} max-w-full`}
      >
        <option value="">No layout</option>
        {layouts.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name} ({l.holes})
          </option>
        ))}
      </select>
      {pending && <span>Saving…</span>}
      {error && <span className="text-red-600">{error}</span>}
    </span>
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
