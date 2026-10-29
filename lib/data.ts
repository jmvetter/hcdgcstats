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
  team: boolean; // a doubles team entry rather than an individual
};

// League: every round counts as a finish. Tournament and Doubles: the final
// place counts. Doubles entries are teams, kept apart from individual players.
export type EventType = "League" | "Tournament" | "Doubles";

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
  team: number;
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
    team: r.team === 1,
  };
}

// Individual players by default; doubles team entries only when asked for.
export async function getPlayers({
  membersOnly = false,
  teams = "exclude",
}: { membersOnly?: boolean; teams?: "exclude" | "only" | "include" } = {}): Promise<Player[]> {
  await connection();
  const where = [
    membersOnly && "member = 1",
    teams === "exclude" && "team = 0",
    teams === "only" && "team = 1",
  ].filter(Boolean);
  const rows = db
    .prepare(`SELECT * FROM players ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY name COLLATE NOCASE`)
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
// placed within that round's division; tournaments and doubles count their
// final place.
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
         AND (e.type <> 'League' OR NOT EXISTS (
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
  return value === "league"
    ? "League"
    : value === "tournament"
      ? "Tournament"
      : value === "doubles"
        ? "Doubles"
        : undefined;
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
       -- Doubles team rounds aren't comparable with individual rounds.
       LEFT JOIN rounds r ON r.layout_id = l.id AND r.player_id NOT IN (SELECT id FROM players WHERE team = 1)
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
  pdgaNumber: number | null;
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
      `SELECT p.id, p.name, p.pdga_number, p.member, COUNT(*) AS rounds, AVG(r.score) AS avg_score,
              AVG(r.to_par) AS avg_to_par, MIN(r.score) AS best
       FROM rounds r JOIN players p ON p.id = r.player_id
       WHERE r.layout_id = ? AND p.team = 0 ${membersOnly ? "AND p.member = 1" : ""}
       GROUP BY p.id
       HAVING COUNT(*) >= ?
       ORDER BY avg_score, best, p.name COLLATE NOCASE`,
    )
    .all(layoutId, minRounds) as {
    id: string;
    name: string;
    pdga_number: number | null;
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
      pdgaNumber: r.pdga_number,
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

// ---- Hole-by-hole stats ----------------------------------------------------
// Worked out from each round's stored hole scores against its layout's hole
// pars. Rounds without hole scores (e.g. UDisc imports) or whose hole count
// doesn't match the layout are left out.

export type ScoreBand = "eagle" | "birdie" | "par" | "bogey" | "double";

export const SCORE_BANDS: { band: ScoreBand; label: string }[] = [
  { band: "eagle", label: "Eagle or better" },
  { band: "birdie", label: "Birdie" },
  { band: "par", label: "Par" },
  { band: "bogey", label: "Bogey" },
  { band: "double", label: "Double bogey+" },
];

export function scoreBand(strokes: number, par: number): ScoreBand {
  const d = strokes - par;
  return d <= -2 ? "eagle" : d === -1 ? "birdie" : d === 0 ? "par" : d === 1 ? "bogey" : "double";
}

type HoleRound = {
  player_id: string;
  layout_id: string;
  hole_scores: string;
  hole_details: string;
};

// Pairs of [strokes, par] for each hole of each matching round.
function holesOf(r: HoleRound): { strokes: number; par: number }[] | null {
  const scores = JSON.parse(r.hole_scores) as number[];
  const holes = JSON.parse(r.hole_details) as { par: number | null }[];
  if (scores.length !== holes.length || holes.some((h) => h.par === null)) return null;
  return scores.map((strokes, i) => ({ strokes, par: holes[i].par! }));
}

export type ScoringBreakdown = { holes: number; counts: Record<ScoreBand, number> };

// How often a player makes eagle, birdie, par, bogey or worse.
export async function getPlayerScoring(playerId: string, filter: FinishFilter = {}): Promise<ScoringBreakdown> {
  await connection();
  const { sql, args } = filterSql(filter, "res");
  const rows = db
    .prepare(
      `SELECT rd.player_id, rd.layout_id, rd.hole_scores, l.hole_details
       FROM rounds rd
       JOIN layouts l ON l.id = rd.layout_id
       JOIN events e ON e.id = rd.event_id
       LEFT JOIN results res ON res.player_id = rd.player_id AND res.event_id = rd.event_id
       WHERE rd.player_id = ? AND rd.hole_scores IS NOT NULL AND l.hole_details IS NOT NULL ${sql}`,
    )
    .all(playerId, ...args) as HoleRound[];

  const counts: Record<ScoreBand, number> = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0 };
  let holes = 0;
  for (const r of rows) {
    for (const h of holesOf(r) ?? []) {
      counts[scoreBand(h.strokes, h.par)]++;
      holes++;
    }
  }
  return { holes, counts };
}

export type HoleStat = {
  hole: number; // 1-based position on the layout
  label: string;
  par: number | null;
  length: number | null;
  rounds: number;
  avg: number | null; // average strokes
  birdieOrBetter: number; // share of rounds, 0-1
  atPar: number;
  bogeyOrWorse: number;
  difficultyRank: number | null; // 1 = hardest (highest average over par)
};

function holeStats(layoutId: string, rows: HoleRound[]): HoleStat[] {
  const layout = db.prepare("SELECT hole_details FROM layouts WHERE id = ?").get(layoutId) as
    | { hole_details: string | null }
    | undefined;
  const details = layout?.hole_details
    ? (JSON.parse(layout.hole_details) as { label: string; par: number | null; length: number | null }[])
    : [];

  const totals = details.map(() => ({ rounds: 0, strokes: 0, under: 0, even: 0, over: 0 }));
  for (const r of rows) {
    const holes = holesOf(r);
    if (!holes || holes.length !== details.length) continue;
    holes.forEach((h, i) => {
      const t = totals[i];
      t.rounds++;
      t.strokes += h.strokes;
      if (h.strokes < h.par) t.under++;
      else if (h.strokes === h.par) t.even++;
      else t.over++;
    });
  }

  const stats: HoleStat[] = details.map((d, i) => {
    const t = totals[i];
    return {
      hole: i + 1,
      label: d.label,
      par: d.par,
      length: d.length,
      rounds: t.rounds,
      avg: t.rounds ? t.strokes / t.rounds : null,
      birdieOrBetter: t.rounds ? t.under / t.rounds : 0,
      atPar: t.rounds ? t.even / t.rounds : 0,
      bogeyOrWorse: t.rounds ? t.over / t.rounds : 0,
      difficultyRank: null,
    };
  });

  // Rank by average relative to par, so a par 4 isn't "harder" just for being a par 4.
  const ranked = stats
    .filter((s) => s.avg !== null && s.par !== null)
    .sort((a, b) => b.avg! - b.par! - (a.avg! - a.par!));
  ranked.forEach((s, i) => (s.difficultyRank = i + 1));
  return stats;
}

// How hard each hole of a layout plays, across everyone (or club members).
export async function getLayoutHoleStats(layoutId: string, { membersOnly = false } = {}): Promise<HoleStat[]> {
  await connection();
  const rows = db
    .prepare(
      `SELECT rd.player_id, rd.layout_id, rd.hole_scores, l.hole_details
       FROM rounds rd
       JOIN layouts l ON l.id = rd.layout_id
       JOIN players p ON p.id = rd.player_id
       WHERE rd.layout_id = ? AND rd.hole_scores IS NOT NULL AND p.team = 0 ${membersOnly ? "AND p.member = 1" : ""}`,
    )
    .all(layoutId) as HoleRound[];
  return holeStats(layoutId, rows);
}

export type HoleScore = { strokes: number; eventId: string; eventName: string; round: number; date: string | null };

export type HolePlayer = {
  playerId: string;
  name: string;
  pdgaNumber: number | null;
  member: boolean;
  avg: number;
  best: number;
  counts: Record<ScoreBand, number>;
  scores: HoleScore[]; // oldest first
};

// Every player's scores on one hole of a layout (hole is 1-based), best average first.
export async function getLayoutHolePlayers(
  layoutId: string,
  hole: number,
  { membersOnly = false } = {},
): Promise<{ field: ScoringBreakdown; players: HolePlayer[] }> {
  await connection();
  const layout = db.prepare("SELECT hole_details FROM layouts WHERE id = ?").get(layoutId) as
    | { hole_details: string | null }
    | undefined;
  const details = layout?.hole_details ? (JSON.parse(layout.hole_details) as { par: number | null }[]) : [];
  const par = details[hole - 1]?.par ?? null;
  const empty = (): Record<ScoreBand, number> => ({ eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0 });
  const field: ScoringBreakdown = { holes: 0, counts: empty() };
  if (par === null) return { field, players: [] };

  const rows = db
    .prepare(
      `SELECT p.id, p.name, p.pdga_number, p.member, rd.hole_scores, rd.round,
              COALESCE(rd.date, e.date) AS date, e.id AS event_id, e.name AS event_name
       FROM rounds rd
       JOIN players p ON p.id = rd.player_id
       JOIN events e ON e.id = rd.event_id
       WHERE rd.layout_id = ? AND rd.hole_scores IS NOT NULL AND p.team = 0 ${membersOnly ? "AND p.member = 1" : ""}
       ORDER BY date, e.id, rd.round`,
    )
    .all(layoutId) as {
    id: string;
    name: string;
    pdga_number: number | null;
    member: number;
    hole_scores: string;
    round: number;
    date: string | null;
    event_id: string;
    event_name: string;
  }[];

  const byPlayer = new Map<string, HolePlayer>();
  for (const r of rows) {
    const scores = JSON.parse(r.hole_scores) as number[];
    if (scores.length !== details.length) continue;
    const strokes = scores[hole - 1];
    let p = byPlayer.get(r.id);
    if (!p) {
      p = {
        playerId: r.id,
        name: r.name,
        pdgaNumber: r.pdga_number,
        member: r.member === 1,
        avg: 0,
        best: strokes,
        counts: empty(),
        scores: [],
      };
      byPlayer.set(r.id, p);
    }
    const band = scoreBand(strokes, par);
    p.counts[band]++;
    field.counts[band]++;
    field.holes++;
    p.best = Math.min(p.best, strokes);
    p.scores.push({ strokes, eventId: r.event_id, eventName: r.event_name, round: r.round, date: r.date });
  }

  const players = [...byPlayer.values()];
  for (const p of players) p.avg = p.scores.reduce((a, s) => a + s.strokes, 0) / p.scores.length;
  players.sort((a, b) => a.avg - b.avg || b.scores.length - a.scores.length || a.name.localeCompare(b.name));
  return { field, players };
}

// One player's hole-by-hole averages on each layout they've played.
export async function getPlayerHoleStats(playerId: string): Promise<{ layout: Layout; holes: HoleStat[] }[]> {
  await connection();
  const rows = db
    .prepare(
      `SELECT rd.player_id, rd.layout_id, rd.hole_scores, l.hole_details
       FROM rounds rd JOIN layouts l ON l.id = rd.layout_id
       WHERE rd.player_id = ? AND rd.hole_scores IS NOT NULL AND l.hole_details IS NOT NULL`,
    )
    .all(playerId) as HoleRound[];

  const byLayout = new Map<string, HoleRound[]>();
  for (const r of rows) byLayout.set(r.layout_id, [...(byLayout.get(r.layout_id) ?? []), r]);

  const out: { layout: Layout; holes: HoleStat[] }[] = [];
  for (const [layoutId, layoutRows] of byLayout) {
    const layout = db.prepare("SELECT * FROM layouts WHERE id = ?").get(layoutId) as LayoutRow | undefined;
    if (!layout) continue;
    const holes = holeStats(layoutId, layoutRows);
    if (holes.some((h) => h.rounds > 0)) out.push({ layout: toLayout(layout), holes });
  }
  return out.sort((a, b) => (b.holes[0]?.rounds ?? 0) - (a.holes[0]?.rounds ?? 0));
}

// Each player's main division: the one they've played the most rounds in, with
// ties going to the more recent. Results imported without round data count as
// one round. Follows the type filter, so it can be a player's main league or
// tournament division.
export async function getMainDivisions(filter: Pick<FinishFilter, "type"> = {}): Promise<Map<string, string>> {
  await connection();
  const typeSql = filter.type ? "AND e.type = ?" : "";
  const args = filter.type ? [filter.type, filter.type] : [];
  const rows = db
    .prepare(
      `SELECT player_id, division, COUNT(*) AS rounds, MAX(played) AS last_played FROM (
         SELECT rd.player_id, res.division, COALESCE(rd.date, e.date) AS played
         FROM rounds rd
         JOIN results res ON res.player_id = rd.player_id AND res.event_id = rd.event_id
         JOIN events e ON e.id = rd.event_id
         WHERE 1 = 1 ${typeSql}
         UNION ALL
         SELECT r.player_id, r.division, e.date AS played
         FROM results r JOIN events e ON e.id = r.event_id
         WHERE NOT EXISTS (SELECT 1 FROM rounds rd WHERE rd.player_id = r.player_id AND rd.event_id = r.event_id)
           ${typeSql}
       )
       WHERE division IS NOT NULL
       GROUP BY player_id, division
       ORDER BY player_id, rounds DESC, last_played DESC`,
    )
    .all(...args) as { player_id: string; division: string }[];

  // Rows come sorted best-first within each player, so the first one wins.
  const main = new Map<string, string>();
  for (const r of rows) if (!main.has(r.player_id)) main.set(r.player_id, r.division);
  return main;
}
