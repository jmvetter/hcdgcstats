"use client";

import Link from "next/link";
import { useOffline } from "next/offline";
import { useActionState, useOptimistic, useState, useTransition } from "react";
import { matchStatus, shortSide, statusDetail, statusHeadline, type HoleResult } from "@/lib/match-status";
import type { ScoringMatch } from "@/lib/scoring";
import { setHoleAction, unlockMatchAction, type UnlockState } from "../actions";

// Side A is blue and side B orange throughout, so a glance at the holes shows who's winning.
const SIDE = {
  A: { text: "text-blue-700 dark:text-blue-400", fill: "bg-blue-600 text-white", ring: "border-blue-600" },
  B: { text: "text-orange-700 dark:text-orange-400", fill: "bg-orange-500 text-white", ring: "border-orange-500" },
};

type Change = { hole: number; result: HoleResult | null };

// The next hole without a result, starting after `from` and wrapping around
// (cards on a shotgun start begin partway through).
function nextOpenHole(results: (HoleResult | null)[], from: number | null): number | null {
  const n = results.length;
  for (let i = 1; i <= n; i++) {
    const hole = (((from ?? 0) + i - 1) % n) + 1;
    if (results[hole - 1] === null) return hole;
  }
  return null;
}

export function Scorecard({
  match,
  eventName,
  teams,
  canScore,
}: {
  match: ScoringMatch;
  eventName: string;
  teams: { a: string; b: string } | null;
  canScore: boolean;
}) {
  const [results, change] = useOptimistic<(HoleResult | null)[], Change>(match.results, (current, c) =>
    current.map((r, i) => (i === c.hole - 1 ? c.result : r)),
  );
  const [, startTransition] = useTransition();
  const offline = useOffline();
  const [selected, setSelected] = useState<number | null>(() => nextOpenHole(match.results, match.lastHole));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(0);

  const status = matchStatus(results);
  const headline = statusHeadline(status, match.sideA, match.sideB);
  const current = selected !== null ? results[selected - 1] : null;
  // A decided match can still have its holes corrected, but no new ones.
  const locked = status.finished && current === null;

  const record = (hole: number, result: HoleResult | null) => {
    const after = results.map((r, i) => (i === hole - 1 ? result : r));
    setError(null);
    setSaving((n) => n + 1);
    startTransition(async () => {
      change({ hole, result });
      const outcome = await setHoleAction(match.id, hole, result);
      setSaving((n) => n - 1);
      if (outcome.error) setError(outcome.error);
    });
    setSelected(result === null ? hole : (nextOpenHole(after, hole) ?? hole));
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/scoring" className="text-sm text-zinc-500 hover:underline">
          ← All matches
        </Link>
        <p className="text-sm text-zinc-500">
          {[eventName, teams && `${teams.a} vs ${teams.b}`, match.label].filter(Boolean).join(" · ")}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          <span className={SIDE.A.text}>{match.sideA}</span>
          <span className="px-2 text-zinc-400">vs</span>
          <span className={SIDE.B.text}>{match.sideB}</span>
        </h1>
      </div>

      <div
        role="status"
        className={`rounded-lg border-2 px-4 py-4 text-center ${
          status.leader ? SIDE[status.leader].ring : "border-zinc-300 dark:border-zinc-700"
        }`}
      >
        <p className={`text-3xl font-bold ${status.leader ? SIDE[status.leader].text : ""}`}>{headline}</p>
        <p className="mt-1 text-sm text-zinc-500">{statusDetail(status)}</p>
      </div>

      {offline && saving > 0 && (
        <p className="rounded-lg bg-amber-100 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          No signal. Your holes are held on this screen and send when you&apos;re back online. Keep it open until
          they&apos;ve saved.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-zinc-500">Holes</h2>
        <ol className="grid grid-cols-6 gap-1.5 sm:grid-cols-9">
          {results.map((r, i) => {
            const hole = i + 1;
            const isSelected = canScore && hole === selected;
            return (
              <li key={hole}>
                <button
                  type="button"
                  disabled={!canScore}
                  onClick={() => setSelected(hole)}
                  aria-label={`Hole ${hole}: ${r === "A" ? match.sideA : r === "B" ? match.sideB : r === "H" ? "push" : "not played"}`}
                  aria-pressed={isSelected}
                  className={`flex h-12 w-full flex-col items-center justify-center rounded-md border text-sm tabular-nums ${
                    r === "A" || r === "B"
                      ? `${SIDE[r].fill} border-transparent`
                      : r === "H"
                        ? "border-zinc-300 bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800"
                        : "border-zinc-300 dark:border-zinc-700"
                  } ${isSelected ? "ring-2 ring-black ring-offset-2 dark:ring-white dark:ring-offset-black" : ""}`}
                >
                  <span className="font-semibold">{hole}</span>
                  <span className="text-[10px] leading-none">{r === "A" ? "A" : r === "B" ? "B" : r === "H" ? "push" : ""}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {canScore ? (
        selected !== null && (
          <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-center text-lg font-semibold">
              Hole {selected}
              {current && <span className="text-sm font-normal text-zinc-500"> · tap to change</span>}
            </p>
            {locked ? (
              <p className="text-center text-sm text-zinc-500">
                The match is decided, so no more holes are needed. Tap a played hole to correct it.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <ResultButton label={shortSide(match.sideA)} sub="took it" active={current === "A"} tone={SIDE.A.fill} onClick={() => record(selected, "A")} />
                <ResultButton label="Push" sub="halved" active={current === "H"} tone="bg-zinc-600 text-white" onClick={() => record(selected, "H")} />
                <ResultButton label={shortSide(match.sideB)} sub="took it" active={current === "B"} tone={SIDE.B.fill} onClick={() => record(selected, "B")} />
              </div>
            )}
            {current && (
              <button type="button" onClick={() => record(selected, null)} className="self-center text-sm text-zinc-500 hover:underline">
                Clear hole {selected}
              </button>
            )}
            {error && <p className="text-center text-sm text-red-600">{error}</p>}
          </div>
        )
      ) : (
        <UnlockForm matchId={match.id} />
      )}
    </div>
  );
}

function ResultButton({
  label,
  sub,
  active,
  tone,
  onClick,
}: {
  label: string;
  sub: string;
  active: boolean;
  tone: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-20 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-3 text-center ${tone} ${
        active ? "ring-4 ring-black/30 dark:ring-white/40" : ""
      }`}
    >
      <span className="break-words text-base font-bold leading-tight">{label}</span>
      <span className="text-xs opacity-80">{sub}</span>
    </button>
  );
}

function UnlockForm({ matchId }: { matchId: number }) {
  const [state, action, pending] = useActionState<UnlockState, FormData>(unlockMatchAction, {});
  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <input type="hidden" name="matchId" value={matchId} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        Keeping score? Enter the match code
        <input
          name="code"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          required
          className="rounded-lg border border-zinc-300 bg-white px-3 py-3 text-center font-mono text-2xl tracking-[0.5em] dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        disabled={pending}
        className="rounded-lg bg-black px-4 py-3 text-base font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {pending ? "Checking…" : "Start scoring"}
      </button>
    </form>
  );
}
