import "server-only";
import { db } from "./db";
import { MATCH_PLAY_EVENTS, type Match } from "./match-play";
import { matchStatus, shortSide, type HoleResult } from "./match-status";
import { listScoringEvents } from "./scoring";

// A player's match play history, from live-scored matches (Scoring tab) and
// the hand-entered brackets on the Match Play page.

export type MatchOutcome = "W" | "L" | "H";

export type PlayerMatch = {
  key: string;
  eventName: string;
  date: string | null;
  stage: string; // "Round 2", "Winners bracket · Quarterfinals"
  team: string | null; // the player's team, for team matchups
  format: string; // "Singles", "Best Shot", …
  partner: string | null; // doubles partner
  opponent: string;
  outcome: MatchOutcome | null; // null while the match is still being played
  score: string | null; // "3 & 2", "1 up", "2 down thru 7"; null for bracket results with no score
  holes: { won: number; lost: number; halved: number } | null; // live-scored matches only
  href: string;
};

export type PlayerMatchPlay = {
  matches: PlayerMatch[];
  wins: number;
  losses: number;
  halves: number;
  points: number; // 1 a win, ½ a halved match
  live: number; // matches still being played
  holes: { won: number; lost: number; halved: number } | null; // across live-scored matches
};

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// The player's score in a live match, from their side's point of view.
function liveScore(results: (HoleResult | null)[], side: "A" | "B"): { outcome: MatchOutcome | null; score: string } {
  const s = matchStatus(results);
  const ahead = s.leader === side;
  if (s.finished) {
    if (!s.leader) return { outcome: "H", score: "Halved" };
    const margin = s.remaining > 0 ? `${s.lead} & ${s.remaining}` : `${s.lead} up`;
    return { outcome: ahead ? "W" : "L", score: margin };
  }
  if (s.played === 0) return { outcome: null, score: "Not started" };
  const where = s.leader ? `${s.lead} ${ahead ? "up" : "down"}` : "All square";
  return { outcome: null, score: `${where} thru ${s.played}` };
}

function liveMatches(name: string): PlayerMatch[] {
  const out: PlayerMatch[] = [];
  for (const event of listScoringEvents()) {
    for (const m of event.matches) {
      const sideA = m.sideA.split(" & ");
      const sideB = m.sideB.split(" & ");
      const side = sideA.some((p) => same(p, name)) ? "A" : sideB.some((p) => same(p, name)) ? "B" : null;
      if (!side) continue;
      const mine = side === "A" ? sideA : sideB;
      const theirs = side === "A" ? m.sideB : m.sideA;
      const matchup = event.matchups.find((x) => x.id === m.matchupId);
      const { outcome, score } = liveScore(m.results, side);
      const other = side === "A" ? "B" : "A";
      out.push({
        key: `live-${m.id}`,
        eventName: event.name,
        date: event.date,
        stage: `Round ${m.round}`,
        team: matchup ? (side === "A" ? matchup.teamA : matchup.teamB) : null,
        format: m.label ?? (mine.length > 1 ? "Doubles" : "Singles"),
        partner: mine.filter((p) => !same(p, name)).join(" & ") || null,
        opponent: shortSide(theirs),
        outcome,
        score,
        holes: {
          won: m.results.filter((r) => r === side).length,
          lost: m.results.filter((r) => r === other).length,
          halved: m.results.filter((r) => r === "H").length,
        },
        href: `/scoring/${m.id}`,
      });
    }
  }
  return out; // events newest first, rounds in order
}

function bracketMatches(playerId: string): PlayerMatch[] {
  const out: PlayerMatch[] = [];
  for (const event of MATCH_PLAY_EVENTS) {
    const seed = event.entrants.find((e) => e.playerId === playerId)?.seed;
    if (seed === undefined) continue;
    const ids = event.entrants.map((e) => e.playerId);
    const names = new Map(
      (
        db.prepare(`SELECT id, name FROM players WHERE id IN (${ids.map(() => "?").join(",")})`).all(...ids) as {
          id: string;
          name: string;
        }[]
      ).map((r) => [r.id, r.name]),
    );
    const nameOf = (s: number) => {
      const id = event.entrants.find((e) => e.seed === s)?.playerId;
      return (id && names.get(id)) ?? `Seed ${s}`;
    };
    const brackets: [string, { name: string; matches: Match[] }[]][] = [
      ["Winners bracket", event.winners],
      ["Losers bracket", event.losers],
      ["Final", event.final],
    ];
    let n = 0;
    for (const [bracket, rounds] of brackets) {
      for (const round of rounds) {
        for (const m of round.matches) {
          n++;
          if (m.a !== seed && m.b !== seed) continue;
          out.push({
            key: `${event.id}-${n}`,
            eventName: event.name,
            date: event.date,
            stage: round.name.toLowerCase().startsWith(bracket.toLowerCase()) ? round.name : `${bracket} · ${round.name}`,
            team: null,
            format: "Singles",
            partner: null,
            opponent: nameOf(m.a === seed ? m.b : m.a),
            outcome: m.winner === seed ? "W" : "L",
            score: m.score ?? null,
            holes: null,
            href: "/match-play",
          });
        }
      }
    }
  }
  return out;
}

export function getPlayerMatchPlay(player: { id: string; name: string }): PlayerMatchPlay {
  const live = liveMatches(player.name);
  const matches = [...live, ...bracketMatches(player.id)];
  const count = (o: MatchOutcome) => matches.filter((m) => m.outcome === o).length;
  const wins = count("W");
  const halves = count("H");
  const scored = live.filter((m) => m.holes);
  return {
    matches,
    wins,
    losses: count("L"),
    halves,
    points: wins + halves / 2,
    live: matches.filter((m) => m.outcome === null).length,
    holes: scored.length
      ? {
          won: scored.reduce((t, m) => t + m.holes!.won, 0),
          lost: scored.reduce((t, m) => t + m.holes!.lost, 0),
          halved: scored.reduce((t, m) => t + m.holes!.halved, 0),
        }
      : null,
  };
}
