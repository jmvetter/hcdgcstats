"use client";

import { useOffline } from "next/offline";
import { useOptimistic, useState, useTransition } from "react";
import { formatDate } from "@/lib/format";
import type { CheckInPlayer } from "@/lib/league-nights";
import type { PuttingConfig } from "@/lib/putting-config";
import {
  maxDistanceScore,
  maxRoundScore,
  maxStationScore,
  rankCards,
  scoreCard,
  scoreDistance,
  totalPutts,
  type Putt,
  type Putts,
} from "@/lib/putting-score";
import {
  addCardAction,
  removeBlankCardAction,
  saveHeaderAction,
  setCardDivisionAction,
  setPuttAction,
  type PuttingResult,
} from "../actions";

type Night = {
  id: number;
  name: string;
  date: string;
  week: number | null;
  scorekeeper: string | null;
  distancesFt: (number | null)[];
  paidOutAt: string | null;
};
type Card = { playerId: string; name: string; division: string; putts: Putts };
type Change =
  | { type: "none" } // nothing on the cards changes; just saves
  | { type: "putt"; playerId: string; station: number; distance: number; putt: number; value: Putt }
  | { type: "add"; card: Card }
  | { type: "division"; playerId: string; division: string }
  | { type: "remove"; playerId: string };

function apply(cards: Card[], change: Change): Card[] {
  switch (change.type) {
    case "none":
      return cards;
    case "putt":
      return cards.map((c) =>
        c.playerId !== change.playerId
          ? c
          : {
              ...c,
              putts: c.putts.map((st, s) =>
                s !== change.station
                  ? st
                  : st.map((row, d) =>
                      d !== change.distance ? row : row.map((v, p) => (p === change.putt ? change.value : v)),
                    ),
              ),
            },
      );
    case "add":
      return [...cards.filter((c) => c.playerId !== change.card.playerId), change.card];
    case "division":
      return cards.map((c) => (c.playerId === change.playerId ? { ...c, division: change.division } : c));
    case "remove":
      return cards.filter((c) => c.playerId !== change.playerId);
  }
}

// blank → make → miss → blank
const NEXT: Record<string, Putt> = { blank: "make", make: "miss", miss: null };
const nextPutt = (v: Putt): Putt => NEXT[v ?? "blank"];

const field =
  "min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900";

// The putting scorecards, laid out like the paper sheet. Taps show at once and
// save in the background; with no signal they wait (experimental.useOffline)
// and send when it comes back.
export function PuttingNightScreen({
  night,
  config,
  cards: initial,
  players,
  divisions,
  admin,
}: {
  night: Night;
  config: PuttingConfig;
  cards: Card[];
  players: CheckInPlayer[];
  divisions: string[];
  admin: boolean;
}) {
  const [cards, change] = useOptimistic<Card[], Change>(initial, apply);
  const [, startTransition] = useTransition();
  const offline = useOffline();
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(0);
  // Paid out: only an admin can still change anything.
  const locked = night.paidOutAt !== null && !admin;

  const save = (optimistic: Change, send: () => Promise<PuttingResult>) =>
    startTransition(async () => {
      setError(null);
      setSaving((n) => n + 1);
      change(optimistic);
      try {
        const result = await send();
        if (result.error) setError(result.error);
      } finally {
        setSaving((n) => n - 1);
      }
    });

  const scored = cards.map((c) => ({ ...c, score: scoreCard(c.putts, config) }));
  const byDivision = new Map<string, typeof scored>();
  for (const c of scored) byDivision.set(c.division, [...(byDivision.get(c.division) ?? []), c]);
  const standings = [...byDivision].sort(([a], [b]) => a.localeCompare(b)).map(([division, list]) => ({ division, ranked: rankCards(list) }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{night.name}</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          {formatDate(night.date)}
          {night.week !== null && ` · Week ${night.week}`}
        </p>
      </div>

      {night.paidOutAt && (
        <p className="rounded-lg bg-zinc-100 px-4 py-3 text-sm dark:bg-zinc-900" role="status">
          {admin
            ? "This night is paid out and locked. You can still edit because you're logged in as an admin."
            : "This night has been paid out, so its scorecards are locked. Ask an admin if something needs fixing."}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}
      {offline && saving > 0 && (
        <p role="status" className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          No signal. Your taps are saved on this phone and will send when it&apos;s back.
        </p>
      )}

      <Header key={`${night.scorekeeper}|${night.distancesFt.join(",")}`} night={night} config={config} locked={locked} save={save} />

      {!locked && (
        <AddCard
          nightId={night.id}
          players={players}
          divisions={divisions}
          taken={new Set(cards.map((c) => c.playerId))}
          onAdd={(player, division) => {
            setOpenId(player.id);
            save(
              { type: "add", card: { playerId: player.id, name: player.name, division, putts: emptyFor(config) } },
              () => addCardAction(night.id, player.id, division),
            );
          }}
        />
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Scorecards ({cards.length})</h2>
        {scored.length === 0 && <p className="text-zinc-500">No scorecards yet.{!locked && " Find your name above to start one."}</p>}
        {[...scored]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((c) => (
            <CardView
              key={c.playerId}
              card={c}
              config={config}
              open={openId === c.playerId}
              locked={locked}
              admin={admin}
              onToggle={() => setOpenId(openId === c.playerId ? null : c.playerId)}
              onPutt={(station, distance, putt, value) =>
                save({ type: "putt", playerId: c.playerId, station, distance, putt, value }, () =>
                  setPuttAction(night.id, c.playerId, station, distance, putt, value),
                )
              }
              onDivision={(division) =>
                save({ type: "division", playerId: c.playerId, division }, () =>
                  setCardDivisionAction(night.id, c.playerId, division),
                )
              }
              onRemove={() =>
                save({ type: "remove", playerId: c.playerId }, () => removeBlankCardAction(night.id, c.playerId))
              }
            />
          ))}
      </section>

      {standings.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Standings</h2>
          {standings.map(({ division, ranked }) => (
            <div key={division} className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
              <h3 className="border-b border-zinc-200 px-4 py-2 text-sm font-semibold dark:border-zinc-800">
                {division || "No division"}
              </h3>
              <ol className="divide-y divide-zinc-100 dark:divide-zinc-900">
                {ranked.map((r) => (
                  <li key={r.card.playerId} className="flex min-h-11 items-center gap-3 px-4 py-2 text-sm">
                    <span className="w-8 tabular-nums text-zinc-500">
                      {r.tied ? "T" : ""}
                      {r.place}
                    </span>
                    <span className="flex-1 font-medium">{r.card.name}</span>
                    {!r.card.score.complete && (
                      <span className="text-xs text-amber-700 dark:text-amber-400">{r.card.score.blanks} blank</span>
                    )}
                    <span className="tabular-nums font-semibold">{r.total}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      )}

      <ScoringKey config={config} />
    </div>
  );
}

function emptyFor(config: PuttingConfig): Putts {
  return Array.from({ length: config.stations }, () =>
    config.distances.map(() => Array<Putt>(config.puttsPerDistance).fill(null)),
  );
}

// Scorekeeper and distances, filled in on the night's own screen.
function Header({
  night,
  config,
  locked,
  save,
}: {
  night: Night;
  config: PuttingConfig;
  locked: boolean;
  save: (optimistic: Change, send: () => Promise<PuttingResult>) => void;
}) {
  const [scorekeeper, setScorekeeper] = useState(night.scorekeeper ?? "");
  const [feet, setFeet] = useState(night.distancesFt.map((f) => (f === null ? "" : String(f))));
  const send = (sk: string, ft: string[]) =>
    save({ type: "none" }, () =>
      saveHeaderAction(night.id, sk, ft.map((f) => (/^\d+$/.test(f) ? Number(f) : null))),
    );
  const unchanged = (sk: string, ft: string[]) =>
    sk.trim() === (night.scorekeeper ?? "") && ft.join(",") === night.distancesFt.map((f) => f ?? "").join(",");

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <label className="flex flex-col gap-1 text-sm">
        Scorekeeper
        <input
          value={scorekeeper}
          disabled={locked}
          onChange={(e) => setScorekeeper(e.target.value)}
          onBlur={() => !unchanged(scorekeeper, feet) && send(scorekeeper, feet)}
          placeholder="Who's keeping score"
          className={field}
        />
      </label>
      <fieldset className="grid grid-cols-3 gap-3" disabled={locked}>
        <legend className="mb-1 text-sm">Distance in feet (optional)</legend>
        {config.distances.map((d, i) => (
          <label key={d.label} className="flex flex-col gap-1 text-xs text-zinc-500">
            {d.label}
            <input
              value={feet[i] ?? ""}
              inputMode="numeric"
              aria-label={`${d.label} distance in feet`}
              onChange={(e) => setFeet((f) => f.map((v, j) => (j === i ? e.target.value.replace(/\D/g, "") : v)))}
              onBlur={() => !unchanged(scorekeeper, feet) && send(scorekeeper, feet)}
              className={field}
            />
          </label>
        ))}
      </fieldset>
    </section>
  );
}

// Find a player in the existing list, then pick their division and start the card.
function AddCard({
  nightId,
  players,
  divisions,
  taken,
  onAdd,
}: {
  nightId: number;
  players: CheckInPlayer[];
  divisions: string[];
  taken: Set<string>;
  onAdd: (player: CheckInPlayer, division: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<CheckInPlayer | null>(null);
  const [division, setDivision] = useState("");
  const q = query.trim().toLowerCase();
  const matches = q ? players.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8) : [];

  if (picked) {
    return (
      <section className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="font-medium">{picked.name}</p>
        <label className="flex flex-col gap-1 text-sm">
          Division (optional)
          <input
            value={division}
            onChange={(e) => setDivision(e.target.value.toUpperCase())}
            placeholder="MA3"
            maxLength={12}
            className={field}
          />
        </label>
        {divisions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {divisions.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDivision(d)}
                className={`min-h-11 min-w-11 rounded-lg border px-3 text-sm font-medium ${
                  division === d
                    ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                    : "border-zinc-300 dark:border-zinc-700"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              onAdd(picked, division.trim());
              setPicked(null);
              setQuery("");
            }}
            className="min-h-11 flex-1 rounded-lg bg-black px-4 font-medium text-white dark:bg-white dark:text-black"
          >
            Start scorecard
          </button>
          <button
            type="button"
            onClick={() => setPicked(null)}
            className="min-h-11 rounded-lg border border-zinc-300 px-4 dark:border-zinc-700"
          >
            Cancel
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950" data-night={nightId}>
      <label className="flex flex-col gap-1 text-sm">
        Find your name to start a scorecard
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Start typing a name"
          autoComplete="off"
          className={field}
        />
      </label>
      {q && matches.length === 0 && (
        <p className="text-sm text-zinc-500">No one by that name. Ask an admin to add you to the player list.</p>
      )}
      {matches.length > 0 && (
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200 dark:divide-zinc-900 dark:border-zinc-800">
          {matches.map((p) => {
            const has = taken.has(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={has}
                  onClick={() => {
                    setPicked(p);
                    setDivision(p.division ?? "");
                  }}
                  className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left disabled:text-zinc-400"
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="text-sm text-zinc-500">{has ? "Has a card" : (p.division ?? "")}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

type Scored = Card & { score: ReturnType<typeof scoreCard> };

function CardView({
  card,
  config,
  open,
  locked,
  admin,
  onToggle,
  onPutt,
  onDivision,
  onRemove,
}: {
  card: Scored;
  config: PuttingConfig;
  open: boolean;
  locked: boolean;
  admin: boolean;
  onToggle: () => void;
  onPutt: (station: number, distance: number, putt: number, value: Putt) => void;
  onDivision: (division: string) => void;
  onRemove: () => void;
}) {
  const { score } = card;
  const all = totalPutts(config);
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">
            {card.name}
            {card.division && <span className="ml-2 text-sm font-normal text-zinc-500">{card.division}</span>}
          </span>
          {score.complete ? (
            <span className="text-xs text-zinc-500">Complete</span>
          ) : (
            <span className="text-xs text-amber-700 dark:text-amber-400">
              Incomplete · {score.entered} of {all} putts entered
            </span>
          )}
        </span>
        <span className="text-right">
          <span className="block text-xl font-semibold tabular-nums">{score.total}</span>
          <span className="block text-xs text-zinc-500">of {maxRoundScore(config)}</span>
        </span>
        <span aria-hidden className="text-zinc-400">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-4 border-t border-zinc-200 p-3 dark:border-zinc-800">
          {config.stations > 0 &&
            score.stations.map((st, s) => (
              <div key={s} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold">Station {s + 1}</h3>
                  <span className="text-sm tabular-nums">
                    <span className="text-zinc-500">station total </span>
                    <span className="font-semibold">{st.total}</span>
                    <span className="text-zinc-500"> / {maxStationScore(config)}</span>
                  </span>
                </div>
                {config.distances.map((rule, d) => {
                  const row = card.putts[s][d];
                  const ds = scoreDistance(row, rule, config.puttsPerDistance);
                  return (
                    <div key={d} className="flex flex-col gap-1">
                      <div className="flex items-baseline justify-between text-xs text-zinc-500">
                        <span>
                          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{rule.label}</span> · {rule.pointsPerMake} pts
                          per make
                        </span>
                        <span className="tabular-nums">
                          makes {ds.makes} · bonus {ds.bonus} ·{" "}
                          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{ds.score}</span>
                          <span> / {maxDistanceScore(rule, config.puttsPerDistance)}</span>
                        </span>
                      </div>
                      <PuttRow
                        label={`Station ${s + 1} ${rule.label}`}
                        row={row}
                        setSize={config.setSize}
                        disabled={locked}
                        onPutt={(p, value) => onPutt(s, d, p, value)}
                      />
                    </div>
                  );
                })}
              </div>
            ))}

          <div className="flex items-baseline justify-between border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <span className="font-semibold">Round total</span>
            <span className="text-xl font-semibold tabular-nums">
              {score.total} <span className="text-sm font-normal text-zinc-500">/ {maxRoundScore(config)}</span>
            </span>
          </div>

          {!locked && (
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs text-zinc-500">
                Division
                <input
                  defaultValue={card.division}
                  maxLength={12}
                  onBlur={(e) => {
                    const v = e.currentTarget.value.trim().toUpperCase();
                    if (v !== card.division) onDivision(v);
                  }}
                  className={`${field} w-28 uppercase`}
                />
              </label>
              {(score.entered === 0 || admin) && (
                <button
                  type="button"
                  onClick={() => {
                    if (score.entered === 0 || confirm(`Remove ${card.name}'s scorecard and its ${score.entered} putts?`)) onRemove();
                  }}
                  className="min-h-11 rounded-lg border border-red-300 px-4 text-sm text-red-700 dark:border-red-900 dark:text-red-400"
                >
                  Remove this card
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Six putts in sets of two. Putts 1 and 6 carry bonuses, so they're shaded and starred.
function PuttRow({
  label,
  row,
  setSize,
  disabled,
  onPutt,
}: {
  label: string;
  row: Putt[];
  setSize: number;
  disabled: boolean;
  onPutt: (putt: number, value: Putt) => void;
}) {
  const sets = Math.ceil(row.length / setSize);
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: sets }, (_, set) => (
        <div key={set} className="flex flex-1 gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900">
          {row.slice(set * setSize, (set + 1) * setSize).map((value, i) => {
            const p = set * setSize + i;
            const bonus = p === 0 || p === row.length - 1;
            return (
              <button
                key={p}
                type="button"
                disabled={disabled}
                onClick={() => onPutt(p, nextPutt(value))}
                aria-label={`${label} putt ${p + 1}${bonus ? " (bonus putt)" : ""}: ${value ?? "not entered"}`}
                className={`relative h-11 min-w-11 flex-1 rounded-md border text-lg font-semibold ${
                  value === "make"
                    ? "border-emerald-700 bg-emerald-600 text-white"
                    : value === "miss"
                      ? "border-zinc-400 bg-zinc-300 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200"
                      : bonus
                        ? "border-amber-400 bg-amber-100 text-transparent dark:border-amber-700 dark:bg-amber-950"
                        : "border-zinc-300 bg-white text-transparent dark:border-zinc-700 dark:bg-zinc-950"
                } disabled:opacity-60`}
              >
                {value === "make" ? "✓" : value === "miss" ? "–" : "·"}
                {bonus && (
                  <span aria-hidden className="absolute left-1 top-0 text-[10px] leading-4 text-amber-600 dark:text-amber-400">
                    ★
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function ScoringKey({ config }: { config: PuttingConfig }) {
  return (
    <details className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-medium">Scoring key</summary>
      <div className="flex flex-col gap-3 border-t border-zinc-200 p-4 text-sm dark:border-zinc-800">
        <p className="text-zinc-600 dark:text-zinc-400">
          {config.stations} stations, each with {config.distances.length} distances. At each distance you throw{" "}
          {config.puttsPerDistance} putts, {config.setSize} at a time. Starred putts earn a bonus.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[20rem] text-left tabular-nums">
            <thead className="text-zinc-500">
              <tr>
                <th className="py-1 pr-2 font-medium">Distance</th>
                <th className="px-2 py-1 text-right font-medium">Per make</th>
                <th className="px-2 py-1 text-right font-medium">1st putt</th>
                <th className="px-2 py-1 text-right font-medium">Last putt</th>
                <th className="px-2 py-1 text-right font-medium">All {config.puttsPerDistance}</th>
                <th className="py-1 pl-2 text-right font-medium">Max</th>
              </tr>
            </thead>
            <tbody>
              {config.distances.map((d) => (
                <tr key={d.label} className="border-t border-zinc-100 dark:border-zinc-900">
                  <td className="py-1 pr-2 font-medium">
                    {d.label} <span className="font-normal text-zinc-500">{d.name.toLowerCase()}</span>
                  </td>
                  <td className="px-2 py-1 text-right">{d.pointsPerMake}</td>
                  <td className="px-2 py-1 text-right">+{d.firstPuttBonus}</td>
                  <td className="px-2 py-1 text-right">+{d.lastPuttBonus}</td>
                  <td className="px-2 py-1 text-right">+{d.allMadeBonus}</td>
                  <td className="py-1 pl-2 text-right">{maxDistanceScore(d, config.puttsPerDistance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-zinc-600 dark:text-zinc-400">
          The all-{config.puttsPerDistance} bonus is on top of the first and last putt bonuses. A station is at most{" "}
          {maxStationScore(config)}; a perfect round is {maxRoundScore(config)}. A blank putt (not entered) scores nothing,
          the same as a miss, but leaves the card marked incomplete.
        </p>
      </div>
    </details>
  );
}
