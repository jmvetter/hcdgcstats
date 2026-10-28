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

// One finish: a tournament's final result, or one round (week) of a league.
export type Finish = {
  eventId: string;
  event: ClubEvent;
  round: number | null; // league round; null for a tournament's final result
  date: string; // the round's date when known, else the event's
  division: string | null;
  place: number | null;
  score: number | null;
  toPar: number | null;
};

export type PlayerStats = {
  finishes: number;
  wins: number;
  podiums: number;
  avgPlace: number | null; // over finishes with a place
  avgRating: number | null; // average PDGA round rating
  ratedRounds: number;
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
  const rows = db
    .prepare("SELECT id, name, date, course, type, par FROM events ORDER BY date DESC")
    .all() as ClubEvent[];
  // SQLite rows have a null prototype, which can't be passed to client components.
  return rows.map((r) => ({ ...r }));
}

// Limits which finishes count. `division` is the division the finish was
// played in, which can differ from event to event for the same player.
export type FinishFilter = { type?: EventType; division?: string };

// SQL conditions for a FinishFilter. `results` is the alias of the results
// table in the query, which holds the division played.
function filterSql({ type, division }: FinishFilter, results: string) {
  return {
    sql: `${type ? "AND e.type = ?" : ""} ${division ? `AND ${results}.division = ?` : ""}`,
    args: [...(type ? [type] : []), ...(division ? [division] : [])],
  };
}

type EventCols = {
  event_id: string;
  name: string;
  event_date: string;
  course: string | null;
  type: EventType;
  par: number | null;
};

const toEvent = (r: EventCols): ClubEvent => ({
  id: r.event_id,
  name: r.name,
  date: r.event_date,
  course: r.course,
  type: r.type,
  par: r.par,
});

// A player's finishes, newest first. Leagues count each round as a finish,
// placed within that round's division; tournaments count their final place.
// League events imported before round places were stored fall back to the
// overall result.
export async function getPlayerFinishes(playerId: string, filter: FinishFilter = {}): Promise<Finish[]> {
  await connection();
  const resultsFilter = filterSql(filter, "r");
  const roundsFilter = filterSql(filter, "res");
  const eventResults = db
    .prepare(
      `SELECT r.event_id, r.division, r.place, r.score, r.to_par,
              e.name, e.date AS event_date, e.course, e.type, e.par
       FROM results r JOIN events e ON e.id = r.event_id
       WHERE r.player_id = ? ${resultsFilter.sql}
         AND (e.type = 'Tournament' OR NOT EXISTS (
           SELECT 1 FROM rounds rd
           WHERE rd.player_id = r.player_id AND rd.event_id = r.event_id AND rd.place IS NOT NULL))`,
    )
    .all(playerId, ...resultsFilter.args) as (EventCols & {
    division: string | null;
    place: number | null;
    score: number | null;
    to_par: number | null;
  })[];

  const leagueRounds = db
    .prepare(
      `SELECT rd.event_id, rd.round, rd.place, rd.score, rd.to_par, rd.date, res.division,
              e.name, e.date AS event_date, e.course, e.type, e.par
       FROM rounds rd
       JOIN events e ON e.id = rd.event_id
       LEFT JOIN results res ON res.player_id = rd.player_id AND res.event_id = rd.event_id
       WHERE rd.player_id = ? AND e.type = 'League' AND rd.place IS NOT NULL ${roundsFilter.sql}`,
    )
    .all(playerId, ...roundsFilter.args) as (EventCols & {
    round: number;
    place: number;
    score: number;
    to_par: number | null;
    date: string | null;
    division: string | null;
  })[];

  const finishes: Finish[] = [
    ...eventResults.map((r) => ({
      eventId: r.event_id,
      event: toEvent(r),
      round: null,
      date: r.event_date,
      division: r.division,
      place: r.place,
      score: r.score,
      toPar: r.to_par,
    })),
    ...leagueRounds.map((r) => ({
      eventId: r.event_id,
      event: toEvent(r),
      round: r.round,
      date: r.date ?? r.event_date,
      division: r.division,
      place: r.place,
      score: r.score,
      toPar: r.to_par,
    })),
  ];
  return finishes.sort((a, b) => b.date.localeCompare(a.date) || (b.round ?? 0) - (a.round ?? 0));
}

const average = (nums: number[]) => (nums.length ? nums.reduce((sum, n) => sum + n, 0) / nums.length : null);

export function computeStats(finishes: Finish[], roundRatings: number[]): PlayerStats {
  const places = finishes.map((f) => f.place).filter((n): n is number => n !== null);
  return {
    finishes: finishes.length,
    wins: places.filter((p) => p === 1).length,
    podiums: places.filter((p) => p <= 3).length,
    avgPlace: average(places),
    avgRating: average(roundRatings),
    ratedRounds: roundRatings.length,
  };
}

// PDGA round ratings for every rated round the player has played. UDisc league
// rounds usually have none.
export async function getPlayerRoundRatings(playerId: string, filter: FinishFilter = {}): Promise<number[]> {
  await connection();
  const { sql, args } = filterSql(filter, "res");
  const rows = db
    .prepare(
      `SELECT rd.rating FROM rounds rd
       JOIN events e ON e.id = rd.event_id
       LEFT JOIN results res ON res.player_id = rd.player_id AND res.event_id = rd.event_id
       WHERE rd.player_id = ? AND rd.rating IS NOT NULL ${sql}`,
    )
    .all(playerId, ...args) as { rating: number }[];
  return rows.map((r) => r.rating);
}

export async function getPlayerStats(playerId: string, filter: FinishFilter = {}): Promise<PlayerStats> {
  const [finishes, ratings] = await Promise.all([
    getPlayerFinishes(playerId, filter),
    getPlayerRoundRatings(playerId, filter),
  ]);
  return computeStats(finishes, ratings);
}

// Every division anyone has played in, for the division filter.
export async function getDivisions(): Promise<string[]> {
  await connection();
  const rows = db
    .prepare("SELECT DISTINCT division FROM results WHERE division IS NOT NULL ORDER BY division")
    .all() as { division: string }[];
  return rows.map((r) => r.division);
}

// Reads the ?type= filter shared by the players list and profiles.
export function parseTypeFilter(value: string | string[] | undefined): EventType | undefined {
  return value === "league" ? "League" : value === "tournament" ? "Tournament" : undefined;
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
