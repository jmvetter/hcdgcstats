import "server-only";
import { connection } from "next/server";
import { db } from "./db";

// Read-side queries used by the pages. Each one waits for a request so pages
// always show the latest imported data instead of a build-time snapshot.

export type Player = {
  id: string;
  name: string;
  pdgaNumber: number | null;
  division: string | null;
  joined: string; // ISO date
  rating: number | null;
  ratingDate: string | null;
  classification: string | null;
  city: string | null;
  stateProv: string | null;
  membershipStatus: string | null;
  pdgaUpdatedAt: string | null;
  member: boolean;
};

export type EventType = "League" | "Tournament";

export type ClubEvent = {
  id: string;
  name: string;
  date: string; // ISO date
  course: string | null;
  type: EventType;
  par: number | null;
};

export type PlayerResult = {
  eventId: string;
  division: string | null;
  place: number | null;
  score: number | null;
  toPar: number | null;
  event: ClubEvent;
};

export type PlayerStats = {
  events: number;
  wins: number;
  podiums: number;
  avgToPar: number | null;
  bestToPar: number | null;
};

type PlayerRow = {
  id: string;
  name: string;
  pdga_number: number | null;
  division: string | null;
  joined: string;
  rating: number | null;
  rating_date: string | null;
  classification: string | null;
  city: string | null;
  state_prov: string | null;
  membership_status: string | null;
  pdga_updated_at: string | null;
  member: number;
};

function toPlayer(r: PlayerRow): Player {
  return {
    id: r.id,
    name: r.name,
    pdgaNumber: r.pdga_number,
    division: r.division,
    joined: r.joined,
    rating: r.rating,
    ratingDate: r.rating_date,
    classification: r.classification,
    city: r.city,
    stateProv: r.state_prov,
    membershipStatus: r.membership_status,
    pdgaUpdatedAt: r.pdga_updated_at,
    member: r.member === 1,
  };
}

export async function getPlayers({ membersOnly = false } = {}): Promise<Player[]> {
  await connection();
  const rows = db
    .prepare(`SELECT * FROM players ${membersOnly ? "WHERE member = 1" : ""} ORDER BY name COLLATE NOCASE`)
    .all();
  return (rows as PlayerRow[]).map(toPlayer);
}

export async function getPlayer(id: string): Promise<Player | undefined> {
  await connection();
  const row = db.prepare("SELECT * FROM players WHERE id = ?").get(id);
  return row ? toPlayer(row as PlayerRow) : undefined;
}

export async function getEvents(): Promise<ClubEvent[]> {
  await connection();
  return db
    .prepare("SELECT id, name, date, course, type, par FROM events ORDER BY date DESC")
    .all() as ClubEvent[];
}

export async function getPlayerResults(playerId: string): Promise<PlayerResult[]> {
  await connection();
  const rows = db
    .prepare(
      `SELECT r.event_id, r.division, r.place, r.score, r.to_par,
              e.name, e.date, e.course, e.type, e.par
       FROM results r JOIN events e ON e.id = r.event_id
       WHERE r.player_id = ?
       ORDER BY e.date DESC`,
    )
    .all(playerId) as {
    event_id: string;
    division: string | null;
    place: number | null;
    score: number | null;
    to_par: number | null;
    name: string;
    date: string;
    course: string | null;
    type: EventType;
    par: number | null;
  }[];
  return rows.map((r) => ({
    eventId: r.event_id,
    division: r.division,
    place: r.place,
    score: r.score,
    toPar: r.to_par,
    event: { id: r.event_id, name: r.name, date: r.date, course: r.course, type: r.type, par: r.par },
  }));
}

export function computeStats(rs: PlayerResult[]): PlayerStats {
  const toPars = rs.map((r) => r.toPar).filter((n): n is number => n !== null);
  return {
    events: rs.length,
    wins: rs.filter((r) => r.place === 1).length,
    podiums: rs.filter((r) => r.place !== null && r.place <= 3).length,
    avgToPar: toPars.length ? toPars.reduce((sum, n) => sum + n, 0) / toPars.length : null,
    bestToPar: toPars.length ? Math.min(...toPars) : null,
  };
}

export async function getPlayerStats(playerId: string): Promise<PlayerStats> {
  return computeStats(await getPlayerResults(playerId));
}
