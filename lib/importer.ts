import "server-only";
import { db, slugify, transaction } from "./db";
import type { EventType } from "./data";
import type { ImportRow } from "./udisc";

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
  newPlayers: string[];
  skipped: number;
};

type FoundPlayer = { id: string; pdga_number: number | null; member: number };

// Finds a player by PDGA number first, then by exact name.
function findPlayer(row: ImportRow): FoundPlayer | undefined {
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

// Writes one event and its results. Re-importing the same event replaces its
// results, so an import can be safely repeated or corrected.
export function saveEventImport(
  event: EventInput,
  rows: ImportRow[],
  options: ImportOptions = {},
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

  return transaction(() => {
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

    const newPlayers: string[] = [];
    let saved = 0;
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
      saved++;
    }
    return { eventId, results: saved, newPlayers, skipped: rows.length - saved };
  });
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
