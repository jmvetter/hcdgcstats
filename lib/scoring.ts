import "server-only";
import { randomInt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { isAdmin } from "./auth";
import { db } from "./db";
import { matchStatus, type HoleResult } from "./match-status";

// Live match play scoring: events, team matchups and matches set up on the
// admin page, scored hole by hole on the Scoring tab.

export type ScoringMatch = {
  id: number;
  eventId: number;
  matchupId: number | null;
  label: string | null;
  sideA: string;
  sideB: string;
  holes: number;
  round: number;
  results: (HoleResult | null)[]; // index 0 is hole 1
  lastHole: number | null; // the hole most recently entered
};

export type ScoringMatchup = { id: number; eventId: number; teamA: string; teamB: string };

export type ScoringEvent = {
  id: number;
  name: string;
  date: string | null;
  matchups: ScoringMatchup[];
  matches: ScoringMatch[];
};

type MatchRow = {
  id: number;
  event_id: number;
  matchup_id: number | null;
  label: string | null;
  side_a: string;
  side_b: string;
  holes: number;
  round: number;
};

function withResults(rows: MatchRow[]): ScoringMatch[] {
  if (rows.length === 0) return [];
  const holes = db
    .prepare(
      `SELECT match_id, hole, result, updated_at FROM mp_holes
       WHERE match_id IN (${rows.map(() => "?").join(",")}) ORDER BY updated_at`,
    )
    .all(...rows.map((r) => r.id)) as { match_id: number; hole: number; result: HoleResult }[];
  return rows.map((r) => {
    const results: (HoleResult | null)[] = Array.from({ length: r.holes }, () => null);
    let lastHole: number | null = null;
    for (const h of holes) {
      if (h.match_id !== r.id || h.hole < 1 || h.hole > r.holes) continue;
      results[h.hole - 1] = h.result;
      lastHole = h.hole;
    }
    return {
      id: r.id,
      eventId: r.event_id,
      matchupId: r.matchup_id,
      label: r.label,
      sideA: r.side_a,
      sideB: r.side_b,
      holes: r.holes,
      round: r.round,
      results,
      lastHole,
    };
  });
}

const MATCH_COLS = "id, event_id, matchup_id, label, side_a, side_b, holes, round";

// Every event with its matchups and matches, newest first.
export function listScoringEvents(): ScoringEvent[] {
  const events = db
    .prepare("SELECT id, name, date FROM mp_events ORDER BY COALESCE(date, created_at) DESC, id DESC")
    .all() as { id: number; name: string; date: string | null }[];
  const matchups = db
    .prepare("SELECT id, event_id, team_a, team_b FROM mp_matchups ORDER BY id")
    .all() as { id: number; event_id: number; team_a: string; team_b: string }[];
  const matches = withResults(db.prepare(`SELECT ${MATCH_COLS} FROM mp_matches ORDER BY round, id`).all() as MatchRow[]);
  return events.map((e) => ({
    ...e,
    matchups: matchups
      .filter((m) => m.event_id === e.id)
      .map((m) => ({ id: m.id, eventId: m.event_id, teamA: m.team_a, teamB: m.team_b })),
    matches: matches.filter((m) => m.eventId === e.id),
  }));
}

export function getScoringMatch(id: number): ScoringMatch | undefined {
  return withResults(db.prepare(`SELECT ${MATCH_COLS} FROM mp_matches WHERE id = ?`).all(id) as MatchRow[])[0];
}

export function getMatchCode(id: number): string | undefined {
  return (db.prepare("SELECT code FROM mp_matches WHERE id = ?").get(id) as { code: string } | undefined)?.code;
}

export function listMatchCodes(): Map<number, string> {
  const rows = db.prepare("SELECT id, code FROM mp_matches").all() as { id: number; code: string }[];
  return new Map(rows.map((r) => [r.id, r.code]));
}

export function getMatchup(id: number): ScoringMatchup | undefined {
  const r = db.prepare("SELECT id, event_id, team_a, team_b FROM mp_matchups WHERE id = ?").get(id) as
    | { id: number; event_id: number; team_a: string; team_b: string }
    | undefined;
  return r && { id: r.id, eventId: r.event_id, teamA: r.team_a, teamB: r.team_b };
}

export function getScoringEventName(id: number): string | undefined {
  return (db.prepare("SELECT name FROM mp_events WHERE id = ?").get(id) as { name: string } | undefined)?.name;
}

export function createScoringEvent(name: string, date: string | null): number {
  const r = db
    .prepare("INSERT INTO mp_events (name, date, created_at) VALUES (?, ?, ?)")
    .run(name, date, new Date().toISOString());
  return Number(r.lastInsertRowid);
}

export function deleteScoringEvent(id: number) {
  db.prepare("DELETE FROM mp_events WHERE id = ?").run(id);
}

// Individual players (not doubles team entries) with at least one club result,
// for the match setup pickers.
export function listPlayedPlayerNames(): string[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT p.name FROM players p
       WHERE p.team = 0 AND EXISTS (SELECT 1 FROM results r WHERE r.player_id = p.id)
       ORDER BY p.name COLLATE NOCASE`,
    )
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

export function createMatchup(eventId: number, teamA: string, teamB: string) {
  db.prepare("INSERT INTO mp_matchups (event_id, team_a, team_b) VALUES (?, ?, ?)").run(eventId, teamA, teamB);
}

export function deleteMatchup(id: number) {
  db.prepare("DELETE FROM mp_matchups WHERE id = ?").run(id);
}

export function createMatch(input: {
  eventId: number;
  matchupId: number | null;
  label: string | null;
  sideA: string;
  sideB: string;
  holes: number;
  round: number;
}): number {
  const code = String(randomInt(0, 10000)).padStart(4, "0");
  const r = db
    .prepare(
      `INSERT INTO mp_matches (event_id, matchup_id, label, side_a, side_b, holes, round, code, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.eventId,
      input.matchupId,
      input.label,
      input.sideA,
      input.sideB,
      input.holes,
      input.round,
      code,
      new Date().toISOString(),
    );
  return Number(r.lastInsertRowid);
}

export function deleteMatch(id: number) {
  db.prepare("DELETE FROM mp_matches WHERE id = ?").run(id);
}

// Records who took a hole, or clears it (null). A match that's already decided
// can have its holes corrected but not new holes added.
export function setHole(matchId: number, hole: number, result: HoleResult | null): { error?: string } {
  const match = getScoringMatch(matchId);
  if (!match) return { error: "That match no longer exists." };
  if (!Number.isInteger(hole) || hole < 1 || hole > match.holes) return { error: "That hole isn't part of this match." };
  if (result === null) {
    db.prepare("DELETE FROM mp_holes WHERE match_id = ? AND hole = ?").run(matchId, hole);
    return {};
  }
  if (match.results[hole - 1] === null && matchStatus(match.results).finished) {
    return { error: "This match is already decided." };
  }
  db.prepare(
    `INSERT INTO mp_holes (match_id, hole, result, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (match_id, hole) DO UPDATE SET result = excluded.result, updated_at = excluded.updated_at`,
  ).run(matchId, hole, result, new Date().toISOString());
  return {};
}

// Scoring a match takes its code, remembered in a cookie on the card's phone
// once entered. Admins can score any match.
const codeCookie = (matchId: number) => `mp_code_${matchId}`;

function sameCode(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function canScoreMatch(matchId: number): Promise<boolean> {
  if (await isAdmin()) return true;
  const code = getMatchCode(matchId);
  const entered = (await cookies()).get(codeCookie(matchId))?.value;
  return Boolean(code && entered && sameCode(entered, code));
}

export async function rememberMatchCode(matchId: number, entered: string): Promise<boolean> {
  const code = getMatchCode(matchId);
  if (!code || !sameCode(entered, code)) return false;
  (await cookies()).set(codeCookie(matchId), code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 3,
  });
  return true;
}
