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

export type Layout = {
  id: string;
  pdgaLayoutId: number | null;
  course: string;
  name: string;
  holes: number | null;
  par: number | null;
  length: number | null;
  units: string | null;
  holeDetails: { label: string; par: number | null; length: number | null }[] | null;
};

export type LayoutSummary = Layout & { rounds: number; players: number; members: number };

type LayoutRow = {
  id: string;
  pdga_layout_id: number | null;
  course: string;
  name: string;
  holes: number | null;
  par: number | null;
  length: number | null;
  units: string | null;
  hole_details: string | null;
};

function toLayout(r: LayoutRow): Layout {
  return {
    id: r.id,
    pdgaLayoutId: r.pdga_layout_id,
    course: r.course,
    name: r.name,
    holes: r.holes,
    par: r.par,
    length: r.length,
    units: r.units,
    holeDetails: r.hole_details ? JSON.parse(r.hole_details) : null,
  };
}

export async function getLayouts(): Promise<LayoutSummary[]> {
  await connection();
  const rows = db
    .prepare(
      `SELECT l.*, COUNT(r.score) AS rounds, COUNT(DISTINCT r.player_id) AS players,
              COUNT(DISTINCT CASE WHEN p.member = 1 THEN r.player_id END) AS members
       FROM layouts l
       LEFT JOIN rounds r ON r.layout_id = l.id
       LEFT JOIN players p ON p.id = r.player_id
       GROUP BY l.id
       ORDER BY l.course COLLATE NOCASE, l.name COLLATE NOCASE`,
    )
    .all() as (LayoutRow & { rounds: number; players: number; members: number })[];
  return rows.map((r) => ({ ...toLayout(r), rounds: r.rounds, players: r.players, members: r.members }));
}

export async function getLayout(id: string): Promise<Layout | undefined> {
  await connection();
  const row = db.prepare("SELECT * FROM layouts WHERE id = ?").get(id);
  return row ? toLayout(row as LayoutRow) : undefined;
}

export type LayoutStanding = {
  rank: number;
  playerId: string;
  name: string;
  member: boolean;
  rounds: number;
  avgScore: number;
  avgToPar: number | null;
  best: number;
};

// Players ranked by average score on one layout (lower is better; ties broken
// by best round). Only rounds on this exact layout count, so scores compare fairly.
export async function getLayoutLeaderboard(
  layoutId: string,
  { membersOnly = false, minRounds = 1 } = {},
): Promise<LayoutStanding[]> {
  await connection();
  return layoutLeaderboard(layoutId, membersOnly, minRounds);
}

function layoutLeaderboard(layoutId: string, membersOnly: boolean, minRounds: number): LayoutStanding[] {
  const rows = db
    .prepare(
      `SELECT p.id, p.name, p.member, COUNT(*) AS rounds, AVG(r.score) AS avg_score,
              AVG(r.to_par) AS avg_to_par, MIN(r.score) AS best
       FROM rounds r JOIN players p ON p.id = r.player_id
       WHERE r.layout_id = ? ${membersOnly ? "AND p.member = 1" : ""}
       GROUP BY p.id
       HAVING COUNT(*) >= ?
       ORDER BY avg_score, best, p.name COLLATE NOCASE`,
    )
    .all(layoutId, minRounds) as {
    id: string;
    name: string;
    member: number;
    rounds: number;
    avg_score: number;
    avg_to_par: number | null;
    best: number;
  }[];

  // Standard competition ranking (1, 2, 2, 4): players share a rank only when
  // both their average and their best round are equal.
  let rank = 0;
  return rows.map((r, i) => {
    const prev = rows[i - 1];
    if (i === 0 || r.avg_score !== prev.avg_score || r.best !== prev.best) rank = i + 1;
    return {
      rank,
      playerId: r.id,
      name: r.name,
      member: r.member === 1,
      rounds: r.rounds,
      avgScore: r.avg_score,
      avgToPar: r.avg_to_par,
      best: r.best,
    };
  });
}

export type PlayerLayoutStanding = {
  layout: Layout;
  rounds: number;
  avgScore: number;
  best: number;
  clubRank: number | null; // among club members on this layout; null for non-members
  clubPlayers: number;
};

// A player's average and best on each layout they've played, with their rank
// among club members there.
export async function getPlayerLayouts(playerId: string): Promise<PlayerLayoutStanding[]> {
  await connection();
  const layoutIds = db
    .prepare("SELECT DISTINCT layout_id FROM rounds WHERE player_id = ? AND layout_id IS NOT NULL")
    .all(playerId) as { layout_id: string }[];

  const out: PlayerLayoutStanding[] = [];
  for (const { layout_id } of layoutIds) {
    const layout = db.prepare("SELECT * FROM layouts WHERE id = ?").get(layout_id) as LayoutRow | undefined;
    if (!layout) continue;
    const all = layoutLeaderboard(layout_id, false, 1);
    const mine = all.find((s) => s.playerId === playerId);
    if (!mine) continue;
    const club = layoutLeaderboard(layout_id, true, 1);
    out.push({
      layout: toLayout(layout),
      rounds: mine.rounds,
      avgScore: mine.avgScore,
      best: mine.best,
      clubRank: club.find((s) => s.playerId === playerId)?.rank ?? null,
      clubPlayers: club.length,
    });
  }
  return out.sort((a, b) => b.rounds - a.rounds);
}
