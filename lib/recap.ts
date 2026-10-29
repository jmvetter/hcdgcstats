import "server-only";
import { connection } from "next/server";
import { db } from "./db";
import { scoreBand, type ScoreBand, type ScoringBreakdown } from "./data";

// A season recap of the league: totals, the score mix, each session, every ace
// and a few leaders. Computed from the stored rounds on each request, so it
// updates as soon as a session is re-imported. Doubles teams are left out.

export type RecapAce = {
  player: string;
  playerId: string;
  hole: string;
  length: number | null;
  units: string | null;
  course: string;
  date: string;
  session: string;
  week: number;
};

export type RecapBestRound = {
  player: string;
  playerId: string;
  score: number;
  toPar: number;
  rating: number | null;
  course: string;
  date: string;
};

export type RecapTotals = {
  players: number;
  members: number;
  rounds: number;
  throws: number;
  weeks: number;
  scoring: ScoringBreakdown;
  aces: number;
  eagles: number; // eagle or better, not counting aces
  avgToPar: number | null;
  best: RecapBestRound | null;
};

export type RecapSession = RecapTotals & {
  eventId: string;
  name: string; // "Session 1" when the event name has one, otherwise the full name
  firstDate: string;
  lastDate: string;
};

export type RecapLeader = { playerId: string; player: string; value: number };

export type LeagueRecap = {
  year: number;
  firstDate: string;
  lastDate: string;
  courses: string[];
  divisions: string[];
  totals: RecapTotals;
  sessions: RecapSession[];
  aces: RecapAce[];
  leaders: {
    birdies: RecapLeader[];
    rounds: RecapLeader[];
    wins: RecapLeader[]; // weekly division wins
  };
};

type Row = {
  event_id: string;
  event_name: string;
  round: number;
  date: string;
  score: number;
  to_par: number | null;
  rating: number | null;
  place: number | null;
  hole_scores: string | null;
  hole_details: string | null;
  units: string | null;
  course: string | null;
  player_id: string;
  player: string;
  member: number;
};

// Years with league rounds, newest first.
export async function getLeagueYears(): Promise<number[]> {
  await connection();
  const rows = db
    .prepare(
      `SELECT DISTINCT CAST(substr(COALESCE(rd.date, e.date), 1, 4) AS INTEGER) AS year
       FROM rounds rd JOIN events e ON e.id = rd.event_id
       WHERE e.type = 'League' ORDER BY year DESC`,
    )
    .all() as { year: number }[];
  return rows.map((r) => r.year);
}

export async function getLeagueRecap(year: number): Promise<LeagueRecap | null> {
  await connection();
  const rows = db
    .prepare(
      `SELECT e.id AS event_id, e.name AS event_name, rd.round, COALESCE(rd.date, e.date) AS date,
              rd.score, rd.to_par, rd.rating, rd.place, rd.hole_scores,
              l.hole_details, l.units, l.course, p.id AS player_id, p.name AS player, p.member
       FROM rounds rd
       JOIN events e ON e.id = rd.event_id
       JOIN players p ON p.id = rd.player_id
       LEFT JOIN layouts l ON l.id = rd.layout_id
       WHERE e.type = 'League' AND p.team = 0 AND substr(COALESCE(rd.date, e.date), 1, 4) = ?
       ORDER BY date, e.id, rd.round`,
    )
    .all(String(year)) as Row[];
  if (rows.length === 0) return null;

  const total = tally();
  const sessions = new Map<string, ReturnType<typeof tally> & { name: string; dates: string[] }>();
  const aces: RecapAce[] = [];
  const birdies = new Map<string, RecapLeader>();
  const rounds = new Map<string, RecapLeader>();
  const wins = new Map<string, RecapLeader>();
  const bump = (m: Map<string, RecapLeader>, r: Row, by = 1) => {
    const l = m.get(r.player_id) ?? { playerId: r.player_id, player: r.player, value: 0 };
    l.value += by;
    m.set(r.player_id, l);
  };

  for (const r of rows) {
    let s = sessions.get(r.event_id);
    if (!s) {
      s = { ...tally(), name: sessionName(r.event_name), dates: [] };
      sessions.set(r.event_id, s);
    }
    s.dates.push(r.date);
    bump(rounds, r);
    if (r.place === 1) bump(wins, r);

    const holes = holesOf(r);
    for (const t of [total, s]) {
      t.add(r);
      for (const h of holes) t.addHole(h.strokes, h.par);
    }
    for (const h of holes) {
      if (h.strokes === 1) {
        aces.push({
          player: r.player,
          playerId: r.player_id,
          hole: h.label,
          length: h.length,
          units: r.units,
          course: r.course ?? "",
          date: r.date,
          session: s.name,
          week: r.round,
        });
      }
      if (h.strokes === h.par - 1) bump(birdies, r);
    }
  }

  const top = (m: Map<string, RecapLeader>) =>
    [...m.values()].sort((a, b) => b.value - a.value || a.player.localeCompare(b.player)).slice(0, 3);
  const dates = rows.map((r) => r.date).sort();
  const divisions = db
    .prepare(
      `SELECT DISTINCT res.division FROM results res
       WHERE res.event_id IN (${[...sessions.keys()].map(() => "?").join(",")}) AND res.division IS NOT NULL
       ORDER BY res.division`,
    )
    .all(...sessions.keys()) as { division: string }[];

  return {
    year,
    firstDate: dates[0],
    lastDate: dates[dates.length - 1],
    courses: [...new Set(rows.map((r) => r.course).filter((c): c is string => !!c))].sort(),
    divisions: divisions.map((d) => d.division),
    totals: total.result(),
    sessions: [...sessions].map(([eventId, s]) => {
      const sorted = s.dates.sort();
      return { ...s.result(), eventId, name: s.name, firstDate: sorted[0], lastDate: sorted[sorted.length - 1] };
    }),
    aces,
    leaders: { birdies: top(birdies), rounds: top(rounds), wins: top(wins) },
  };
}

// "HCDGC Sanctioned League Session 2" → "Session 2"
function sessionName(eventName: string): string {
  return eventName.match(/session\s*\d+/i)?.[0].replace(/^s/, "S") ?? eventName;
}

function holesOf(r: Row): { strokes: number; par: number; label: string; length: number | null }[] {
  if (!r.hole_scores || !r.hole_details) return [];
  const scores = JSON.parse(r.hole_scores) as number[];
  const details = JSON.parse(r.hole_details) as { label: string; par: number | null; length: number | null }[];
  if (scores.length !== details.length || details.some((d) => d.par === null)) return [];
  return scores.map((strokes, i) => ({ strokes, par: details[i].par!, label: details[i].label, length: details[i].length }));
}

function tally() {
  const players = new Set<string>();
  const members = new Set<string>();
  const weeks = new Set<string>();
  const counts: Record<ScoreBand, number> = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0 };
  let rounds = 0;
  let throws = 0;
  let holes = 0;
  let aces = 0;
  let toParSum = 0;
  let toParRounds = 0;
  let best: RecapBestRound | null = null;

  return {
    add(r: Row) {
      players.add(r.player_id);
      if (r.member) members.add(r.player_id);
      weeks.add(`${r.event_id}|${r.round}`);
      rounds++;
      throws += r.score;
      if (r.to_par !== null) {
        toParSum += r.to_par;
        toParRounds++;
        // Lowest to par wins; a tie goes to the higher-rated round.
        if (!best || r.to_par < best.toPar || (r.to_par === best.toPar && (r.rating ?? 0) > (best.rating ?? 0))) {
          best = {
            player: r.player,
            playerId: r.player_id,
            score: r.score,
            toPar: r.to_par,
            rating: r.rating,
            course: r.course ?? "",
            date: r.date,
          };
        }
      }
    },
    addHole(strokes: number, par: number) {
      holes++;
      counts[scoreBand(strokes, par)]++;
      if (strokes === 1) aces++;
    },
    result(): RecapTotals {
      return {
        players: players.size,
        members: members.size,
        rounds,
        throws,
        weeks: weeks.size,
        scoring: { holes, counts },
        aces,
        // An ace on a par 3 or longer also lands in the eagle-or-better band.
        eagles: counts.eagle - aces,
        avgToPar: toParRounds ? toParSum / toParRounds : null,
        best,
      };
    },
  };
}
