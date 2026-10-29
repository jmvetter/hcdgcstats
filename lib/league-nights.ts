import "server-only";
import { db, slugify, transaction } from "./db";
import {
  DEFAULT_PAYOUT_SETTINGS,
  parsePayoutSettings,
  payFinishers,
  payoutTable,
  type PaidFinisher,
  type PayoutSettings,
} from "./payout";

// League nights: check players in, record who paid, link the night to its
// imported round (PDGA or UDisc), and work out each division's payout.

export const DEFAULT_MONEY = { entryFee: 10, poolPerPlayer: 8, acePerPlayer: 1 };

export type LeagueNight = {
  id: number;
  date: string;
  name: string;
  eventId: string | null;
  eventName: string | null;
  round: number | null;
  entryFee: number;
  poolPerPlayer: number;
  acePerPlayer: number;
  addedCash: Record<string, number>;
  settings: PayoutSettings;
};

export type NightSummary = LeagueNight & { checkedIn: number; paid: number };

export type CheckIn = {
  playerId: string;
  name: string;
  pdgaNumber: number | null;
  division: string;
  paid: boolean;
};

type NightRow = {
  id: number;
  date: string;
  name: string;
  event_id: string | null;
  event_name: string | null;
  round: number | null;
  entry_fee: number;
  pool_per_player: number;
  ace_per_player: number;
  added_cash: string;
  settings: string;
};

function toNight(r: NightRow): LeagueNight {
  let addedCash: Record<string, number> = {};
  try {
    addedCash = JSON.parse(r.added_cash) ?? {};
  } catch {}
  return {
    id: r.id,
    date: r.date,
    name: r.name,
    eventId: r.event_id,
    eventName: r.event_name,
    round: r.round,
    entryFee: r.entry_fee,
    poolPerPlayer: r.pool_per_player,
    acePerPlayer: r.ace_per_player,
    addedCash,
    settings: parsePayoutSettings(r.settings),
  };
}

const NIGHT_SELECT = `SELECT n.*, e.name AS event_name FROM league_nights n LEFT JOIN events e ON e.id = n.event_id`;

export function listNights(): NightSummary[] {
  const rows = db
    .prepare(
      `SELECT n.*, e.name AS event_name,
              (SELECT COUNT(*) FROM checkins c WHERE c.night_id = n.id) AS checked_in,
              (SELECT COUNT(*) FROM checkins c WHERE c.night_id = n.id AND c.paid = 1) AS paid
       FROM league_nights n LEFT JOIN events e ON e.id = n.event_id
       ORDER BY n.date DESC, n.id DESC`,
    )
    .all() as (NightRow & { checked_in: number; paid: number })[];
  return rows.map((r) => ({ ...toNight(r), checkedIn: r.checked_in, paid: r.paid }));
}

export function getNight(id: number): LeagueNight | undefined {
  const row = db.prepare(`${NIGHT_SELECT} WHERE n.id = ?`).get(id) as NightRow | undefined;
  return row ? toNight(row) : undefined;
}

// A new night starts with the money and payout settings of the last one (or
// the defaults), and is linked to an imported league round on the same date if
// there is one.
export function createNight(date: string, name: string): number {
  const last = db.prepare(`${NIGHT_SELECT} ORDER BY n.date DESC, n.id DESC LIMIT 1`).get() as NightRow | undefined;
  const prev = last ? toNight(last) : null;
  const match = db
    .prepare(
      `SELECT rd.event_id, rd.round FROM rounds rd JOIN events e ON e.id = rd.event_id
       WHERE COALESCE(rd.date, e.date) = ? AND e.type = 'League'
       GROUP BY rd.event_id, rd.round ORDER BY COUNT(*) DESC LIMIT 1`,
    )
    .get(date) as { event_id: string; round: number } | undefined;
  const result = db
    .prepare(
      `INSERT INTO league_nights (date, name, event_id, round, entry_fee, pool_per_player, ace_per_player, added_cash, settings, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)`,
    )
    .run(
      date,
      name,
      match?.event_id ?? null,
      match?.round ?? null,
      prev?.entryFee ?? DEFAULT_MONEY.entryFee,
      prev?.poolPerPlayer ?? DEFAULT_MONEY.poolPerPlayer,
      prev?.acePerPlayer ?? DEFAULT_MONEY.acePerPlayer,
      JSON.stringify(prev?.settings ?? DEFAULT_PAYOUT_SETTINGS),
      new Date().toISOString(),
    );
  return Number(result.lastInsertRowid);
}

export function deleteNight(id: number) {
  db.prepare("DELETE FROM league_nights WHERE id = ?").run(id);
}

export function updateNightDetails(
  id: number,
  input: Pick<LeagueNight, "date" | "name" | "entryFee" | "poolPerPlayer" | "acePerPlayer" | "addedCash" | "settings">,
) {
  db.prepare(
    `UPDATE league_nights SET date = ?, name = ?, entry_fee = ?, pool_per_player = ?, ace_per_player = ?,
       added_cash = ?, settings = ? WHERE id = ?`,
  ).run(
    input.date,
    input.name,
    input.entryFee,
    input.poolPerPlayer,
    input.acePerPlayer,
    JSON.stringify(input.addedCash),
    JSON.stringify(input.settings),
    id,
  );
}

export function linkNightResults(id: number, eventId: string | null, round: number | null) {
  db.prepare("UPDATE league_nights SET event_id = ?, round = ? WHERE id = ?").run(eventId, round, id);
}

// Rounds that a night can take its results from, newest first.
export type ResultRound = { eventId: string; eventName: string; round: number; date: string; players: number };

export function listResultRounds(): ResultRound[] {
  return (
    db
      .prepare(
        `SELECT rd.event_id, e.name AS event_name, rd.round, MIN(COALESCE(rd.date, e.date)) AS date, COUNT(*) AS players
         FROM rounds rd JOIN events e ON e.id = rd.event_id
         GROUP BY rd.event_id, rd.round
         ORDER BY date DESC, e.name, rd.round DESC`,
      )
      .all() as { event_id: string; event_name: string; round: number; date: string; players: number }[]
  ).map((r) => ({ eventId: r.event_id, eventName: r.event_name, round: r.round, date: r.date, players: r.players }));
}

// The round of an event played on a date, if any.
export function roundOnDate(eventId: string, date: string): number | null {
  const row = db
    .prepare(
      `SELECT rd.round FROM rounds rd JOIN events e ON e.id = rd.event_id
       WHERE rd.event_id = ? AND COALESCE(rd.date, e.date) = ?
       GROUP BY rd.round ORDER BY COUNT(*) DESC LIMIT 1`,
    )
    .get(eventId, date) as { round: number } | undefined;
  return row?.round ?? null;
}

export function getCheckIns(nightId: number): CheckIn[] {
  const rows = db
    .prepare(
      `SELECT c.player_id, p.name, p.pdga_number, c.division, c.paid
       FROM checkins c JOIN players p ON p.id = c.player_id
       WHERE c.night_id = ? ORDER BY c.division, p.name COLLATE NOCASE`,
    )
    .all(nightId) as { player_id: string; name: string; pdga_number: number | null; division: string; paid: number }[];
  return rows.map((r) => ({
    playerId: r.player_id,
    name: r.name,
    pdgaNumber: r.pdga_number,
    division: r.division,
    paid: r.paid === 1,
  }));
}

// Players to suggest at check-in, with the division they last played league in.
export type CheckInPlayer = { id: string; name: string; pdgaNumber: number | null; division: string | null };

export function listCheckInPlayers(): CheckInPlayer[] {
  const rows = db
    .prepare(
      `SELECT p.id, p.name, p.pdga_number,
              COALESCE((SELECT r.division FROM results r JOIN events e ON e.id = r.event_id
                        WHERE r.player_id = p.id AND r.division IS NOT NULL
                        ORDER BY (e.type = 'League') DESC, e.date DESC LIMIT 1), p.division) AS division
       FROM players p WHERE p.team = 0 ORDER BY p.member DESC, p.name COLLATE NOCASE`,
    )
    .all() as { id: string; name: string; pdga_number: number | null; division: string | null }[];
  return rows.map((r) => ({ id: r.id, name: r.name, pdgaNumber: r.pdga_number, division: r.division }));
}

// Checks a player in, adding them to the database if they're new. Someone new
// with no PDGA number is matched by exact name, the same way imports match.
export function checkIn(
  nightId: number,
  input: { name: string; pdgaNumber: number | null; division: string; paid: boolean },
): { name: string; created: boolean } {
  return transaction(() => {
    type Found = { id: string; name: string; pdga_number: number | null };
    let player =
      (input.pdgaNumber !== null
        ? (db.prepare("SELECT id, name, pdga_number FROM players WHERE pdga_number = ?").get(input.pdgaNumber) as
            | Found
            | undefined)
        : undefined) ??
      (db.prepare("SELECT id, name, pdga_number FROM players WHERE team = 0 AND name = ? COLLATE NOCASE").get(input.name) as
        | Found
        | undefined);
    let created = false;
    if (!player) {
      const base = slugify(input.name) || "player";
      let id = base;
      for (let n = 2; db.prepare("SELECT 1 FROM players WHERE id = ?").get(id); n++) id = `${base}-${n}`;
      db.prepare(
        "INSERT INTO players (id, name, pdga_number, division, joined, member) VALUES (?, ?, ?, ?, ?, 0)",
      ).run(id, input.name, input.pdgaNumber, input.division, new Date().toISOString().slice(0, 10));
      player = { id, name: input.name, pdga_number: input.pdgaNumber };
      created = true;
    } else if (input.pdgaNumber !== null && player.pdga_number === null) {
      db.prepare("UPDATE players SET pdga_number = ? WHERE id = ?").run(input.pdgaNumber, player.id);
    }
    db.prepare(
      `INSERT INTO checkins (night_id, player_id, division, paid, checked_in_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (night_id, player_id) DO UPDATE SET division = excluded.division, paid = excluded.paid`,
    ).run(nightId, player.id, input.division, input.paid ? 1 : 0, new Date().toISOString());
    return { name: player.name, created };
  });
}

// Checks in a player already in the database, e.g. someone found in the results.
export function checkInExisting(nightId: number, playerId: string, division: string, paid: boolean) {
  db.prepare(
    `INSERT INTO checkins (night_id, player_id, division, paid, checked_in_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (night_id, player_id) DO UPDATE SET division = excluded.division, paid = excluded.paid`,
  ).run(nightId, playerId, division, paid ? 1 : 0, new Date().toISOString());
}

export function updateCheckIn(nightId: number, playerId: string, input: { division: string; paid: boolean }) {
  db.prepare("UPDATE checkins SET division = ?, paid = ? WHERE night_id = ? AND player_id = ?").run(
    input.division,
    input.paid ? 1 : 0,
    nightId,
    playerId,
  );
}

export function removeCheckIn(nightId: number, playerId: string) {
  db.prepare("DELETE FROM checkins WHERE night_id = ? AND player_id = ?").run(nightId, playerId);
}

// Moves a check-in to another player record, for when someone checked in under
// a different name than the one in the results.
export function relinkCheckIn(nightId: number, fromPlayerId: string, toPlayerId: string) {
  const taken = db.prepare("SELECT 1 FROM checkins WHERE night_id = ? AND player_id = ?").get(nightId, toPlayerId);
  if (taken) throw new Error("That player is already checked in.");
  db.prepare("UPDATE checkins SET player_id = ? WHERE night_id = ? AND player_id = ?").run(
    toPlayerId,
    nightId,
    fromPlayerId,
  );
}

// Checks in everyone from another night with the same divisions, as not paid yet.
export function copyCheckIns(nightId: number, fromNightId: number): number {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO checkins (night_id, player_id, division, paid, checked_in_at)
       SELECT ?, player_id, division, 0, ? FROM checkins WHERE night_id = ?`,
    )
    .run(nightId, new Date().toISOString(), fromNightId);
  return Number(result.changes);
}

export type PayoutPlayer = { playerId: string; name: string; toPar: number | null };

export type DivisionPayout = {
  division: string;
  paid: number;
  pool: number;
  added: number;
  places: number[]; // payout table for this field
  finishers: PaidFinisher<PayoutPlayer>[];
  leftover: number; // pool not paid out: rounding to $5, odd dollars from ties, or places nobody filled
  noScore: string[]; // paid but no score in the linked round
  unpaid: string[]; // checked in but not marked paid
};

export type NightPayout = {
  divisions: DivisionPayout[];
  totals: { paid: number; collected: number; pool: number; added: number; acePot: number; leagueFee: number; paidOut: number };
  // People in the linked round who aren't checked in.
  notCheckedIn: { playerId: string; name: string; division: string | null; score: number }[];
};

export function getNightPayout(night: LeagueNight, checkIns: CheckIn[]): NightPayout {
  const scores = new Map<string, { score: number; toPar: number | null }>();
  const roundPlayers: { playerId: string; name: string; division: string | null; score: number }[] = [];
  if (night.eventId && night.round !== null) {
    const rows = db
      .prepare(
        `SELECT rd.player_id, p.name, rd.score, rd.to_par, r.division
         FROM rounds rd JOIN players p ON p.id = rd.player_id
         LEFT JOIN results r ON r.player_id = rd.player_id AND r.event_id = rd.event_id
         WHERE rd.event_id = ? AND rd.round = ?`,
      )
      .all(night.eventId, night.round) as {
      player_id: string;
      name: string;
      score: number;
      to_par: number | null;
      division: string | null;
    }[];
    for (const r of rows) {
      scores.set(r.player_id, { score: r.score, toPar: r.to_par });
      roundPlayers.push({ playerId: r.player_id, name: r.name, division: r.division, score: r.score });
    }
  }

  const byDivision = new Map<string, CheckIn[]>();
  for (const c of checkIns) byDivision.set(c.division, [...(byDivision.get(c.division) ?? []), c]);
  for (const d of Object.keys(night.addedCash)) if (night.addedCash[d] > 0 && !byDivision.has(d)) byDivision.set(d, []);

  const divisions = [...byDivision.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([division, list]): DivisionPayout => {
      const paid = list.filter((c) => c.paid);
      const added = night.addedCash[division] ?? 0;
      const pool = paid.length * night.poolPerPlayer + added;
      const table = payoutTable(paid.length, pool, night.settings);
      const scored = paid.filter((c) => scores.has(c.playerId));
      const { finishers } = payFinishers(
        scored.map((c) => ({ playerId: c.playerId, name: c.name, ...scores.get(c.playerId)! })),
        table.places,
      );
      const paidOut = finishers.reduce((a, f) => a + f.payout, 0);
      return {
        division,
        paid: paid.length,
        pool,
        added,
        places: table.places,
        finishers,
        leftover: pool - paidOut,
        noScore: paid.filter((c) => !scores.has(c.playerId)).map((c) => c.name),
        unpaid: list.filter((c) => !c.paid).map((c) => c.name),
      };
    });

  const paidCount = checkIns.filter((c) => c.paid).length;
  const added = Object.values(night.addedCash).reduce((a, b) => a + (b > 0 ? b : 0), 0);
  const checkedIn = new Set(checkIns.map((c) => c.playerId));
  return {
    divisions,
    totals: {
      paid: paidCount,
      collected: paidCount * night.entryFee,
      pool: paidCount * night.poolPerPlayer + added,
      added,
      acePot: paidCount * night.acePerPlayer,
      leagueFee: paidCount * (night.entryFee - night.poolPerPlayer - night.acePerPlayer),
      paidOut: divisions.reduce((a, d) => a + d.finishers.reduce((s, f) => s + f.payout, 0), 0),
    },
    notCheckedIn: roundPlayers
      .filter((p) => !checkedIn.has(p.playerId))
      .sort((a, b) => (a.division ?? "").localeCompare(b.division ?? "") || a.score - b.score),
  };
}
