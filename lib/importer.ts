import "server-only";
import { db, slugify, transaction } from "./db";
import type { EventType } from "./data";
import { mergeDuplicateLayouts, upsertLayout, type LayoutInput } from "./layouts";

// One player's round, on the layout they played.
export type RoundInput = {
  round: number;
  layoutId: string | null; // our layouts.id
  score: number;
  toPar: number | null;
  rating: number | null; // PDGA round rating
  holeScores: number[] | null;
  date?: string | null; // YYYY-MM-DD, when the source gives one
};

// One player's result in an event, as read from an import source.
export type ImportRow = {
  name: string;
  division: string | null;
  place: number | null;
  pdgaNumber: number | null;
  score: number | null;
  toPar: number | null;
  rounds: RoundInput[];
};

export type EventInput = {
  name: string;
  date: string; // YYYY-MM-DD
  course: string | null;
  type: EventType;
  // Defaults to a slug of date + name. PDGA imports pass "pdga-<tournament id>".
  id?: string;
  source?: "udisc" | "pdga";
};

export type ImportOptions = {
  // Skip anyone who isn't a club member, e.g. for a big outside tournament.
  membersOnly?: boolean;
  // Mark everyone in this import as a club member. True for club events (UDisc
  // leagues); false for outside PDGA tournaments, where new players are added
  // as non-members and existing players keep their status.
  markMembers?: boolean;
};

export type ImportSummary = {
  eventId: string;
  results: number;
  rounds: number;
  newPlayers: string[];
  skipped: number;
};

type FoundPlayer = { id: string; pdga_number: number | null; member: number };

// Finds a player by PDGA number first, then by exact name.
function findPlayer(row: Pick<ImportRow, "name" | "pdgaNumber">): FoundPlayer | undefined {
  if (row.pdgaNumber !== null) {
    const byPdga = db
      .prepare("SELECT id, pdga_number, member FROM players WHERE pdga_number = ?")
      .get(row.pdgaNumber);
    if (byPdga) return byPdga as FoundPlayer;
  }
  return db
    .prepare("SELECT id, pdga_number, member FROM players WHERE name = ? COLLATE NOCASE")
    .get(row.name) as FoundPlayer | undefined;
}

// For previews: which rows are club members.
export function matchMembers(rows: ImportRow[]): boolean[] {
  return rows.map((r) => findPlayer(r)?.member === 1);
}

// Writes one event, its layouts, and each player's result and rounds.
// Re-importing the same event replaces its results and rounds, so an import can
// be safely repeated or corrected.
export function saveEventImport(
  event: EventInput,
  rows: ImportRow[],
  options: ImportOptions = {},
  layouts: LayoutInput[] = [],
): ImportSummary {
  const eventId = event.id ?? slugify(`${event.date} ${event.name}`);
  const par = mostCommon(
    rows.filter((r) => r.score !== null && r.toPar !== null).map((r) => r.score! - r.toPar!),
  );

  const idTaken = db.prepare("SELECT 1 FROM players WHERE id = ?");
  const insertPlayer = db.prepare(
    "INSERT INTO players (id, name, pdga_number, division, joined, member) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const setPdga = db.prepare("UPDATE players SET pdga_number = ? WHERE id = ?");
  const setMember = db.prepare("UPDATE players SET member = 1 WHERE id = ?");
  const insertResult = db.prepare(
    `INSERT INTO results (player_id, event_id, division, place, score, to_par)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (player_id, event_id) DO UPDATE SET
       division = excluded.division, place = excluded.place,
       score = excluded.score, to_par = excluded.to_par`,
  );
  const insertRound = db.prepare(
    `INSERT INTO rounds (player_id, event_id, round, layout_id, score, to_par, rating, hole_scores, place, date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (player_id, event_id, round) DO UPDATE SET
       layout_id = excluded.layout_id, score = excluded.score, to_par = excluded.to_par,
       rating = excluded.rating, hole_scores = excluded.hole_scores,
       place = excluded.place, date = excluded.date`,
  );
  // Ranked across every row, before any members-only filtering, so places
  // reflect the whole field.
  const roundPlaces = rankRounds(rows);

  return transaction(() => {
    for (const layout of layouts) upsertLayout(layout);

    db.prepare(
      `INSERT INTO events (id, name, date, course, type, par, source, imported_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         name = excluded.name, date = excluded.date, course = excluded.course,
         type = excluded.type, par = excluded.par, imported_at = excluded.imported_at`,
    ).run(
      eventId,
      event.name,
      event.date,
      event.course,
      event.type,
      par,
      event.source ?? "udisc",
      new Date().toISOString(),
    );
    db.prepare("DELETE FROM results WHERE event_id = ?").run(eventId);
    db.prepare("DELETE FROM rounds WHERE event_id = ?").run(eventId);

    const newPlayers: string[] = [];
    let saved = 0;
    let roundCount = 0;
    for (const row of rows) {
      const existing = findPlayer(row);
      if (options.membersOnly && existing?.member !== 1) continue;
      let playerId = existing?.id;
      if (existing && existing.pdga_number === null && row.pdgaNumber !== null) {
        setPdga.run(row.pdgaNumber, existing.id);
      }
      if (existing && options.markMembers && existing.member !== 1) setMember.run(existing.id);
      if (!playerId) {
        const base = slugify(row.name) || "player";
        playerId = base;
        for (let n = 2; idTaken.get(playerId); n++) playerId = `${base}-${n}`;
        insertPlayer.run(
          playerId,
          row.name,
          row.pdgaNumber,
          row.division,
          event.date,
          options.markMembers ? 1 : 0,
        );
        newPlayers.push(row.name);
      }
      insertResult.run(playerId, eventId, row.division, row.place, row.score, row.toPar);
      for (const r of row.rounds) {
        insertRound.run(
          playerId,
          eventId,
          r.round,
          r.layoutId,
          r.score,
          r.toPar,
          r.rating,
          r.holeScores ? JSON.stringify(r.holeScores) : null,
          roundPlaces.get(r) ?? null,
          r.date ?? null,
        );
        roundCount++;
      }
      saved++;
    }
    mergeDuplicateLayouts();
    return { eventId, results: saved, rounds: roundCount, newPlayers, skipped: rows.length - saved };
  });
}

// Each round's place within its division: lowest score first, equal scores
// share a place (1, 2, 2, 4).
function rankRounds(rows: ImportRow[]): Map<RoundInput, number> {
  const groups = new Map<string, RoundInput[]>();
  for (const row of rows) {
    for (const r of row.rounds) {
      const key = `${row.division ?? ""}|${r.round}`;
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
  }
  const places = new Map<RoundInput, number>();
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.score - b.score);
    sorted.forEach((r, i) => {
      places.set(r, i > 0 && r.score === sorted[i - 1].score ? places.get(sorted[i - 1])! : i + 1);
    });
  }
  return places;
}

function mostCommon(nums: number[]): number | null {
  const counts = new Map<number, number>();
  for (const n of nums) counts.set(n, (counts.get(n) ?? 0) + 1);
  let best: number | null = null;
  let bestCount = 0;
  for (const [n, c] of counts) {
    if (c > bestCount) {
      best = n;
      bestCount = c;
    }
  }
  return best;
}
