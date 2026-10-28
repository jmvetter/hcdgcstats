"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { formatToPar } from "@/lib/format";
import type { LayoutSummary } from "@/lib/data";
import type { ImportRow } from "@/lib/importer";
import {
  importPdgaTournamentAction,
  importUdiscAction,
  loginAction,
  previewPdgaTournamentAction,
  previewUdiscAction,
  refreshPdgaAction,
  type ImportState,
  type LoginState,
  type PreviewState,
  type RefreshState,
  type TournamentPreviewState,
} from "./actions";

const input =
  "rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const button =
  "rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Password
        <input type="password" name="password" required autoFocus className={input} />
      </label>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending} className={`${button} self-start`}>
        {pending ? "Checking…" : "Log in"}
      </button>
    </form>
  );
}

const FIELD_LABELS = {
  name: "Name",
  division: "Division",
  place: "Place",
  pdgaNumber: "PDGA #",
  score: "Total score",
  toPar: "Relative score",
} as const;

export function UdiscImport({ layouts }: { layouts: LayoutSummary[] }) {
  const [preview, previewAction, previewing] = useActionState<PreviewState, FormData>(
    previewUdiscAction,
    {},
  );
  const [result, importAction, importing] = useActionState<ImportState, FormData>(
    importUdiscAction,
    {},
  );
  const parsed = preview.preview;

  return (
    <div className="flex flex-col gap-6">
      <form action={previewAction} className="flex flex-wrap items-center gap-3">
        <input type="file" name="file" accept=".xlsx,.csv" required className="text-sm" />
        <button disabled={previewing} className={button}>
          {previewing ? "Reading…" : "Preview"}
        </button>
      </form>
      {preview.error && <p className="text-sm text-red-600">{preview.error}</p>}

      {parsed && (
        <div className="flex flex-col gap-4">
          <div className="text-sm">
            <p className="font-medium">
              {preview.fileName}: {parsed.rows.length} players
              {parsed.roundCount > 1 && `, ${parsed.roundCount} rounds`}
            </p>
            <p className="text-zinc-600 dark:text-zinc-400">
              Columns used:{" "}
              {(Object.keys(FIELD_LABELS) as (keyof typeof FIELD_LABELS)[])
                .map((f) => `${FIELD_LABELS[f]} ← ${parsed.mapping[f] ?? "not found"}`)
                .join(" · ")}
            </p>
            {parsed.warnings.map((w) => (
              <p key={w} className="text-amber-700 dark:text-amber-400">
                {w}
              </p>
            ))}
          </div>

          <ResultsPreview rows={parsed.rows} />

          <form action={importAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="rows" value={JSON.stringify(parsed.rows)} />
            <label className="flex flex-col gap-1 text-sm">
              Event name
              <input name="name" required placeholder="Summer League Week 5" className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Date
              <input type="date" name="date" required className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Type
              <select name="type" className={input}>
                <option value="League">League (each round counts as a finish)</option>
                <option value="Tournament">Tournament (final place counts)</option>
              </select>
            </label>
            <LayoutPicker layouts={layouts} parGuess={parGuess(parsed.rows)} />
            <button disabled={importing || parsed.rows.length === 0} className={`${button} justify-self-start`}>
              {importing ? "Importing…" : `Import ${parsed.rows.length} results`}
            </button>
          </form>
        </div>
      )}

      <ImportResult state={result} />
    </div>
  );
}

export function PdgaTournamentImport() {
  const [preview, previewAction, previewing] = useActionState<TournamentPreviewState, FormData>(
    previewPdgaTournamentAction,
    {},
  );
  const [result, importAction, importing] = useActionState<ImportState, FormData>(
    importPdgaTournamentAction,
    {},
  );
  const t = preview.tournament;
  const clubCount = preview.inClub?.filter(Boolean).length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <form action={previewAction} className="flex flex-wrap items-center gap-3">
        <input
          name="tournament"
          required
          placeholder="Tournament ID or pdga.com/tour/event/… URL"
          className={`${input} w-full sm:w-96`}
        />
        <button disabled={previewing} className={button}>
          {previewing ? "Loading…" : "Preview"}
        </button>
      </form>
      {preview.error && <p className="text-sm text-red-600">{preview.error}</p>}

      {t && (
        // Keyed by tournament so the prefilled inputs reset when another one is loaded.
        <div key={t.tournamentId} className="flex flex-col gap-4">
          <p className="text-sm">
            <span className="font-medium">{t.name}</span>: {t.rows.length} players,{" "}
            {clubCount} club members
          </p>
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            Layouts:{" "}
            {t.layouts.length === 0
              ? "none listed on PDGA"
              : t.layouts
                  .map((l) =>
                    [`${l.course} – ${l.name}`, l.holes && `${l.holes} holes`, l.par && `par ${l.par}`, l.length && `${l.length.toLocaleString()} ${l.units?.toLowerCase() ?? ""}`.trim()]
                      .filter(Boolean)
                      .join(", "),
                  )
                  .join(" · ")}
          </div>

          <ResultsPreview rows={t.rows} inClub={preview.inClub} />

          <form action={importAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="tournamentId" value={t.tournamentId} />
            <input type="hidden" name="rows" value={JSON.stringify(t.rows)} />
            <input type="hidden" name="layouts" value={JSON.stringify(t.layouts)} />
            <label className="flex flex-col gap-1 text-sm">
              Event name
              <input name="name" required defaultValue={t.name} className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Date
              <input type="date" name="date" required defaultValue={t.date} className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Course
              <input name="course" defaultValue={t.course ?? ""} className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Type
              <select name="type" defaultValue={t.type} className={input}>
                <option value="Tournament">Tournament (final place counts)</option>
                <option value="League">League (each round counts as a finish)</option>
              </select>
            </label>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" name="membersOnly" defaultChecked={clubCount > 0} />
              Only import club members ({clubCount})
            </label>
            <button disabled={importing} className={`${button} justify-self-start`}>
              {importing ? "Importing…" : "Import tournament"}
            </button>
          </form>
        </div>
      )}

      <ImportResult state={result} />
    </div>
  );
}

function ResultsPreview({ rows, inClub }: { rows: ImportRow[]; inClub?: boolean[] }) {
  return (
    <div className="max-h-80 overflow-auto rounded-md border border-zinc-200 dark:border-zinc-800">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-zinc-50 text-zinc-500 dark:bg-zinc-900">
          <tr>
            <th className="px-3 py-2 font-medium">Div</th>
            <th className="px-3 py-2 text-right font-medium">Place</th>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">PDGA #</th>
            <th className="px-3 py-2 text-right font-medium">Score</th>
            <th className="px-3 py-2 text-right font-medium">To par</th>
            <th className="px-3 py-2 text-right font-medium">Rounds</th>
            {inClub && <th className="px-3 py-2 font-medium">Member</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
          {rows.map((r, i) => (
            <tr key={`${r.division}|${r.name}|${i}`}>
              <td className="px-3 py-1.5">{r.division ?? "—"}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{r.place ?? "—"}</td>
              <td className="px-3 py-1.5">{r.name}</td>
              <td className="px-3 py-1.5 tabular-nums">{r.pdgaNumber ?? "—"}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{r.score ?? "—"}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{formatToPar(r.toPar)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {r.rounds.map((rd) => rd.score).join(", ") || "—"}
              </td>
              {inClub && <td className="px-3 py-1.5">{inClub[i] ? "✓" : ""}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImportResult({ state }: { state: ImportState }) {
  if (state.error) return <p className="text-sm text-red-600">{state.error}</p>;
  if (!state.summary) return null;
  const { results, newPlayers, skipped } = state.summary;
  return (
    <p className="rounded-md bg-green-50 p-3 text-sm text-green-900 dark:bg-green-950 dark:text-green-200">
      Imported {results} results ({state.summary.rounds} rounds)
      {newPlayers.length > 0 &&
        ` and added ${newPlayers.length} new players` +
          (newPlayers.length <= 10 ? ` (${newPlayers.join(", ")})` : "")}
      {skipped > 0 && `; skipped ${skipped} non-members`}.{" "}
      <Link href="/players" className="underline">View players</Link>
    </p>
  );
}

export function PdgaRefresh() {
  const [state, action, pending] = useActionState<RefreshState>(refreshPdgaAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <button disabled={pending} className={`${button} self-start`}>
        {pending ? "Refreshing…" : "Refresh from PDGA"}
      </button>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.summary && (
        <div className="text-sm">
          <p>Updated {state.summary.updated} players.</p>
          {state.summary.failed.map((f) => (
            <p key={f.pdgaNumber} className="text-red-600">
              PDGA #{f.pdgaNumber}: {f.error}
            </p>
          ))}
        </div>
      )}
    </form>
  );
}

// Most common (score − relative score) across single rounds: the layout's par.
function parGuess(rows: ImportRow[]): number | null {
  const counts = new Map<number, number>();
  for (const r of rows) {
    for (const rd of r.rounds) {
      if (rd.toPar !== null) counts.set(rd.score - rd.toPar, (counts.get(rd.score - rd.toPar) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function LayoutPicker({ layouts, parGuess }: { layouts: LayoutSummary[]; parGuess: number | null }) {
  const [choice, setChoice] = useState(layouts.length ? layouts[0].id : "new");
  return (
    <div className="flex flex-col gap-3 sm:col-span-2">
      <label className="flex flex-col gap-1 text-sm">
        Layout played
        <select name="layoutId" value={choice} onChange={(e) => setChoice(e.target.value)} className={input}>
          {layouts.map((l) => (
            <option key={l.id} value={l.id}>
              {l.course} – {l.name}
              {l.par ? ` (par ${l.par}${l.holes ? `, ${l.holes} holes` : ""})` : ""}
            </option>
          ))}
          <option value="new">New layout…</option>
        </select>
      </label>
      {choice === "new" && (
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            Course
            <input name="layoutCourse" required className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            Layout name
            <input name="layoutName" required placeholder="Blue tees" className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Holes
            <input name="layoutHoles" inputMode="numeric" defaultValue="18" className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Par
            <input name="layoutPar" inputMode="numeric" defaultValue={parGuess ?? ""} className={input} />
          </label>
        </div>
      )}
    </div>
  );
}
