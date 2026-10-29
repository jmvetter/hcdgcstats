"use client";

import { useActionState, useId, useState } from "react";
import type { CheckIn, CheckInPlayer, LeagueNight, ResultRound } from "@/lib/league-nights";
import {
  FLATTEN_OPTIONS,
  HIGHER_OPTIONS,
  LOWER_OPTIONS,
  payoutTable,
  placesPaid,
  type PayoutSettings,
} from "@/lib/payout";
import { formatDate } from "@/lib/format";
import {
  checkInAction,
  copyCheckInsAction,
  createNightAction,
  deleteNightAction,
  importPdgaForNightAction,
  linkResultsAction,
  removeCheckInAction,
  saveNightAction,
  updateCheckInAction,
  type FormState,
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

export function NewNightForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createNightAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-end">
        <label className="flex flex-col gap-1 text-sm">
          Date
          <input type="date" name="date" defaultValue={today()} required className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input name="name" placeholder="Session 5, week 1" className={input} />
        </label>
        <button disabled={pending} className={button}>
          {pending ? "Creating…" : "Start a league night"}
        </button>
      </div>
      <Status state={state} />
    </form>
  );
}

export function CheckInForm({ nightId, players }: { nightId: number; players: CheckInPlayer[] }) {
  const listId = useId();
  const [name, setName] = useState("");
  const [pdga, setPdga] = useState("");
  const [division, setDivision] = useState("");
  const [paid, setPaid] = useState(true);
  // Clears the player after a successful check-in; the division stays for the next one.
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, formData) => {
    const result = await checkInAction(prev, formData);
    if (!result.error) {
      setName("");
      setPdga("");
      setPaid(true);
    }
    return result;
  }, {});
  const byName = new Map(players.map((p) => [p.name.toLowerCase(), p]));

  // Picking a known player fills in their PDGA number and usual division.
  const onName = (value: string) => {
    setName(value);
    const p = byName.get(value.trim().toLowerCase());
    if (p) {
      setPdga(p.pdgaNumber ? String(p.pdgaNumber) : "");
      if (p.division) setDivision(p.division);
    }
  };

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="nightId" value={nightId} />
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto_auto] sm:items-end">
        <label className="flex flex-col gap-1 text-sm">
          Player
          <input
            name="name"
            list={listId}
            value={name}
            onChange={(e) => onName(e.target.value)}
            autoComplete="off"
            placeholder="Start typing a name"
            required
            className={input}
          />
          <datalist id={listId}>
            {players.map((p) => (
              <option key={p.id} value={p.name}>
                {[p.division, p.pdgaNumber && `#${p.pdgaNumber}`].filter(Boolean).join(" · ")}
              </option>
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          PDGA # <span className="sr-only">(optional)</span>
          <input
            name="pdgaNumber"
            inputMode="numeric"
            value={pdga}
            onChange={(e) => setPdga(e.target.value)}
            placeholder="optional"
            className={input}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Division
          <input
            name="division"
            value={division}
            onChange={(e) => setDivision(e.target.value.toUpperCase())}
            placeholder="MA3"
            required
            className={input}
          />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="paid" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
          Paid
        </label>
        <button disabled={pending} className={button}>
          {pending ? "Checking in…" : "Check in"}
        </button>
      </div>
      <Status state={state} />
    </form>
  );
}

export function CopyCheckInsForm({ nightId, nights }: { nightId: number; nights: { id: number; label: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(copyCheckInsAction, {});
  if (nights.length === 0) return null;
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="nightId" value={nightId} />
      <span className="text-zinc-500">Check in everyone from</span>
      <select name="fromNightId" aria-label="Night to copy check-ins from" className={smallInput}>
        {nights.map((n) => (
          <option key={n.id} value={n.id}>
            {n.label}
          </option>
        ))}
      </select>
      <button disabled={pending} className="font-medium hover:underline disabled:opacity-50">
        {pending ? "Copying…" : "Copy (as not paid)"}
      </button>
      <Status state={state} />
    </form>
  );
}

export function CheckInList({ nightId, checkIns }: { nightId: number; checkIns: CheckIn[] }) {
  if (checkIns.length === 0) return <p className="text-sm text-zinc-500">Nobody&apos;s checked in yet.</p>;
  return (
    <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900">
          <tr>
            <th className="px-3 py-2 font-medium">Player</th>
            <th className="w-28 px-3 py-2 font-medium">Division</th>
            <th className="w-20 px-3 py-2 text-center font-medium">Paid</th>
            <th className="w-20 px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {checkIns.map((c) => (
            // Keyed on the saved values so the controls reset after each save.
            <CheckInRow key={`${c.playerId}|${c.division}|${c.paid}`} nightId={nightId} checkIn={c} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CheckInRow({ nightId, checkIn: c }: { nightId: number; checkIn: CheckIn }) {
  const formId = `checkin-${c.playerId}`;
  const submit = (e: React.SyntheticEvent<HTMLInputElement>) => e.currentTarget.form?.requestSubmit();
  return (
    <tr className={c.paid ? "" : "bg-amber-50/60 dark:bg-amber-950/20"}>
      <td className="px-3 py-1.5">
        <form id={formId} action={updateCheckInAction}>
          <input type="hidden" name="nightId" value={nightId} />
          <input type="hidden" name="playerId" value={c.playerId} />
        </form>
        <span className="font-medium">{c.name}</span>
        {c.pdgaNumber && <span className="ml-2 text-xs text-zinc-500">#{c.pdgaNumber}</span>}
      </td>
      <td className="px-3 py-1.5">
        <input
          form={formId}
          name="division"
          defaultValue={c.division}
          aria-label={`Division for ${c.name}`}
          onBlur={(e) => e.currentTarget.value.trim().toUpperCase() !== c.division && submit(e)}
          className={`${smallInput} w-20 uppercase`}
        />
      </td>
      <td className="px-3 py-1.5 text-center">
        <input
          form={formId}
          type="checkbox"
          name="paid"
          defaultChecked={c.paid}
          onChange={submit}
          aria-label={`${c.name} paid`}
          className="size-4"
        />
      </td>
      <td className="px-3 py-1.5 text-right">
        <form action={removeCheckInAction}>
          <input type="hidden" name="nightId" value={nightId} />
          <input type="hidden" name="playerId" value={c.playerId} />
          <button className="text-sm text-red-600 hover:underline">Remove</button>
        </form>
      </td>
    </tr>
  );
}

export function ResultsPicker({ night, rounds }: { night: LeagueNight; rounds: ResultRound[] }) {
  const value = night.eventId && night.round !== null ? `${night.eventId}|${night.round}` : "";
  return (
    <form action={linkResultsAction} className="flex flex-col gap-1 text-sm">
      <input type="hidden" name="nightId" value={night.id} />
      <label className="flex flex-col gap-1">
        Results for this night
        <select
          name="results"
          defaultValue={value}
          key={value}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className={input}
        >
          <option value="">Not linked yet</option>
          {rounds.map((r) => (
            <option key={`${r.eventId}|${r.round}`} value={`${r.eventId}|${r.round}`}>
              {formatDate(r.date)} · {r.eventName} · round {r.round} ({r.players} players)
            </option>
          ))}
        </select>
      </label>
    </form>
  );
}

export function PdgaResultsForm({ nightId, tournamentId }: { nightId: number; tournamentId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(importPdgaForNightAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="nightId" value={nightId} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          PDGA event ID or URL
          <input name="tournament" defaultValue={tournamentId} placeholder="108113" required className={input} />
        </label>
        <button disabled={pending} className={quietButton}>
          {pending ? "Getting results…" : "Get results from PDGA"}
        </button>
      </div>
      <Status state={state} />
    </form>
  );
}

// Money and payout settings, with a live preview of each division's payout.
export function SettingsForm({ night, fields }: { night: LeagueNight; fields: { division: string; paid: number }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveNightAction, {});
  const [settings, setSettings] = useState<PayoutSettings>(night.settings);
  const [pool, setPool] = useState(String(night.poolPerPlayer));
  const [added, setAdded] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.division, night.addedCash[f.division] ? String(night.addedCash[f.division]) : ""])),
  );
  const set = <K extends keyof PayoutSettings>(key: K, value: PayoutSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));
  const hyper = settings.curve === "hyperbola";

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="nightId" value={night.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input name="name" defaultValue={night.name} required className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Date
          <input type="date" name="date" defaultValue={night.date} required className={input} />
        </label>
      </div>

      <fieldset className="grid min-w-0 gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-medium">Money per player</legend>
        <label className="flex flex-col gap-1 text-sm">
          Entry fee ($)
          <input name="entryFee" inputMode="numeric" defaultValue={night.entryFee} required className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          To the payout ($)
          <input
            name="poolPerPlayer"
            inputMode="numeric"
            value={pool}
            onChange={(e) => setPool(e.target.value)}
            required
            className={input}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          To the ace pot ($)
          <input name="acePerPlayer" inputMode="numeric" defaultValue={night.acePerPlayer} required className={input} />
          <span className="text-xs text-zinc-500">The rest of the entry is the league fee.</span>
        </label>
      </fieldset>

      <fieldset className="grid min-w-0 gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-medium">Payout formula</legend>
        <label className="flex flex-col gap-1 text-sm">
          Percent of the field paid
          <input
            name="percentPaid"
            inputMode="numeric"
            value={settings.percentPaid}
            onChange={(e) => set("percentPaid", Number(e.target.value) || 0)}
            className={input}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Curve
          <select
            name="curve"
            value={settings.curve}
            onChange={(e) => set("curve", e.target.value as PayoutSettings["curve"])}
            className={input}
          >
            <option value="hyperbola">Hyperbola (1st, ½, ⅓, …)</option>
            <option value="straight">Straight line</option>
          </select>
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            name="roundTo5"
            checked={settings.roundTo5}
            onChange={(e) => set("roundTo5", e.target.checked)}
          />
          Round to $5
        </label>
        <SettingSelect
          name="flatten"
          label="Flatten the curve"
          options={FLATTEN_OPTIONS}
          value={settings.flatten}
          dim={!hyper}
          onChange={(v) => set("flatten", v)}
        />
        <SettingSelect
          name="higher"
          label="Payout to lower finishers"
          options={HIGHER_OPTIONS}
          value={settings.higher}
          dim={!hyper}
          onChange={(v) => set("higher", v)}
        />
        <SettingSelect
          name="lower"
          label="Payout to lower finishers (2)"
          options={LOWER_OPTIONS}
          value={settings.lower}
          dim={!hyper}
          onChange={(v) => set("lower", v)}
        />
      </fieldset>
      <p className="-mt-2 text-xs text-zinc-500">
        Same settings as the{" "}
        <a
          href="https://northsidechaingang.org/payout.aspx?MenuItemID=6&MenuGroup=Menu"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Northside Chain Gang payout calculator
        </a>
        , with the same results. &ldquo;Higher&rdquo; pays the lower places more, &ldquo;Lower&rdquo; pays them less.
      </p>

      {fields.length > 0 && (
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Preview by division</legend>
          <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm tabular-nums">
              <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th className="px-3 py-2 font-medium">Division</th>
                  <th className="px-3 py-2 text-right font-medium">Paid in</th>
                  <th className="w-28 px-3 py-2 font-medium">Added cash ($)</th>
                  <th className="px-3 py-2 text-right font-medium">Pool</th>
                  <th className="px-3 py-2 font-medium">Payouts by place</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                {fields.map((f) => {
                  const extra = Number(added[f.division]) || 0;
                  const total = f.paid * (Number(pool) || 0) + extra;
                  const table = payoutTable(f.paid, total, settings);
                  return (
                    <tr key={f.division}>
                      <td className="px-3 py-1.5 font-medium">{f.division}</td>
                      <td className="px-3 py-1.5 text-right">{f.paid}</td>
                      <td className="px-3 py-1.5">
                        <input
                          name={`added:${f.division}`}
                          inputMode="numeric"
                          value={added[f.division] ?? ""}
                          onChange={(e) => setAdded((a) => ({ ...a, [f.division]: e.target.value }))}
                          aria-label={`Added cash for ${f.division}`}
                          placeholder="0"
                          className={`${smallInput} w-20`}
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right">${total}</td>
                      <td className="px-3 py-1.5">
                        {table.places.length === 0
                          ? "—"
                          : `${placesPaid(f.paid, settings.percentPaid)} paid: ${table.places.map((p) => `$${p}`).join(", ")}`}
                        {table.leftover > 0 && <span className="text-zinc-500"> · ${table.leftover} left over</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </fieldset>
      )}

      <div className="flex items-center gap-3">
        <button disabled={pending} className={`${button} self-start`}>
          {pending ? "Saving…" : "Save settings"}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

function SettingSelect({
  name,
  label,
  options,
  value,
  dim,
  onChange,
}: {
  name: string;
  label: string;
  options: { value: number; label: string }[];
  value: number;
  dim: boolean; // hyperbola-only settings, which the straight line ignores; still saved
  onChange: (value: number) => void;
}) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${dim ? "opacity-50" : ""}`}>
      <span>
        {label}
        {dim && <span className="text-xs text-zinc-500"> (hyperbola only)</span>}
      </span>
      <select name={name} value={value} onChange={(e) => onChange(Number(e.target.value))} className={input}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DeleteNightButton({ nightId, name }: { nightId: number; name: string }) {
  return (
    <form
      action={deleteNightAction}
      onSubmit={(e) => {
        if (!confirm(`Delete ${name} and its check-ins? Imported results aren't affected.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="nightId" value={nightId} />
      <button className="text-sm text-red-600 hover:underline">Delete night</button>
    </form>
  );
}
