// Match play events, entered by hand from the club's brackets. Results are
// outcomes only unless a match has a score. Players are referred to by seed.

export type Match = { a: number; b: number; winner: number; score?: string };

export type MatchRound = {
  name: string;
  matches: Match[];
};

export type MatchPlayEvent = {
  id: string;
  name: string;
  description: string;
  date: string | null; // ISO date, when known
  entrants: { seed: number; playerId: string }[];
  winners: MatchRound[];
  losers: MatchRound[];
  final: MatchRound[]; // a second match when the losers bracket player wins the first
};

const m = (a: number, b: number, winner: number): Match => ({ a, b, winner });

export const MATCH_PLAY_EVENTS: MatchPlayEvent[] = [
  {
    id: "club-challenge-singles",
    name: "Club Challenge Match Play",
    description: "Singles qualifier · 16 players · double elimination",
    date: null,
    entrants: [
      { seed: 1, playerId: "logan-hamsley" },
      { seed: 2, playerId: "kevin-lefeber" },
      { seed: 3, playerId: "mac-zambrano" },
      { seed: 4, playerId: "john-vetter" },
      { seed: 5, playerId: "clifford-rush-iii" },
      { seed: 6, playerId: "faisal-mutlaq" },
      { seed: 7, playerId: "joe-gutierrez" },
      { seed: 8, playerId: "tevin-jones" },
      { seed: 9, playerId: "mark-davis" },
      { seed: 10, playerId: "mit-doan" },
      { seed: 11, playerId: "trey-atwell" },
      { seed: 12, playerId: "ryan-kallenberger" },
      { seed: 13, playerId: "benjamin-rehmet" },
      { seed: 14, playerId: "dominic-rigsby" },
      { seed: 15, playerId: "brendan-byrnes" },
      { seed: 16, playerId: "keenan-criss" },
    ],
    winners: [
      {
        name: "Round 1",
        matches: [m(1, 16, 1), m(8, 9, 8), m(5, 12, 12), m(4, 13, 4), m(6, 11, 6), m(3, 14, 3), m(7, 10, 7), m(2, 15, 2)],
      },
      { name: "Quarterfinals", matches: [m(1, 8, 1), m(12, 4, 4), m(6, 3, 3), m(7, 2, 2)] },
      { name: "Semifinals", matches: [m(1, 4, 4), m(3, 2, 3)] },
      { name: "Winners bracket final", matches: [m(4, 3, 4)] },
    ],
    losers: [
      { name: "Round 1", matches: [m(16, 9, 9), m(5, 13, 5), m(11, 14, 11), m(10, 15, 10)] },
      { name: "Round 2", matches: [m(9, 7, 7), m(5, 6, 5), m(12, 11, 12), m(8, 10, 10)] },
      { name: "Round 3", matches: [m(7, 5, 7), m(12, 10, 12)] },
      { name: "Round 4", matches: [m(1, 7, 1), m(12, 2, 2)] },
      { name: "Round 5", matches: [m(1, 2, 1)] },
      { name: "Losers bracket final", matches: [m(3, 1, 1)] },
    ],
    final: [
      { name: "First match", matches: [m(1, 4, 1)] },
      { name: "Second match", matches: [m(1, 4, 1)] },
    ],
  },
];

const loser = (match: Match) => (match.winner === match.a ? match.b : match.a);

export type MatchStanding = { seed: number; playerId: string; place: number; tied: boolean; wins: number; losses: number };

// Final places: the final decides first and second, then everyone knocked out
// in the same losers bracket round ties, latest round first.
export function matchStandings(event: MatchPlayEvent): MatchStanding[] {
  const groups: number[][] = [];
  const lastFinal = event.final.at(-1)!.matches.at(-1)!;
  groups.push([lastFinal.winner], [loser(lastFinal)]);
  for (const round of [...event.losers].reverse()) groups.push(round.matches.map(loser));

  const matches = [...event.winners, ...event.losers, ...event.final].flatMap((r) => r.matches);
  const standings: MatchStanding[] = [];
  let place = 1;
  for (const seeds of groups) {
    for (const seed of [...seeds].sort((a, b) => a - b)) {
      const played = matches.filter((x) => x.a === seed || x.b === seed);
      const wins = played.filter((x) => x.winner === seed).length;
      standings.push({
        seed,
        playerId: event.entrants.find((e) => e.seed === seed)!.playerId,
        place,
        tied: seeds.length > 1,
        wins,
        losses: played.length - wins,
      });
    }
    place += seeds.length;
  }
  return standings;
}
