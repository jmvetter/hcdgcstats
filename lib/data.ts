// Sample data for now. Swap these arrays for a database or spreadsheet import later;
// the helper functions below are what the pages use, so they won't need to change.

export type Division = "MPO" | "FPO" | "MA1" | "MA2" | "FA1" | "MA40";

export type Player = {
  id: string;
  name: string;
  pdgaNumber?: number;
  division: Division;
  joined: string; // ISO date
};

export type EventType = "League" | "Tournament";

export type ClubEvent = {
  id: string;
  name: string;
  date: string; // ISO date
  course: string;
  type: EventType;
  par: number;
};

export type Result = {
  playerId: string;
  eventId: string;
  division: Division;
  score: number; // total strokes
  place: number; // finish within division
};

export const players: Player[] = [
  { id: "alex-rivera", name: "Alex Rivera", pdgaNumber: 112233, division: "MPO", joined: "2023-03-12" },
  { id: "sam-chen", name: "Sam Chen", pdgaNumber: 145678, division: "MA1", joined: "2024-04-02" },
  { id: "jordan-lee", name: "Jordan Lee", division: "MA1", joined: "2024-05-20" },
  { id: "taylor-brooks", name: "Taylor Brooks", pdgaNumber: 98765, division: "FPO", joined: "2022-08-15" },
  { id: "casey-nguyen", name: "Casey Nguyen", division: "FA1", joined: "2025-03-01" },
  { id: "morgan-patel", name: "Morgan Patel", pdgaNumber: 201345, division: "MA40", joined: "2023-06-10" },
];

export const events: ClubEvent[] = [
  { id: "2026-league-wk1", name: "Summer League Week 1", date: "2026-06-04", course: "Home Course", type: "League", par: 54 },
  { id: "2026-league-wk2", name: "Summer League Week 2", date: "2026-06-11", course: "Home Course", type: "League", par: 54 },
  { id: "2026-league-wk3", name: "Summer League Week 3", date: "2026-06-18", course: "Home Course", type: "League", par: 54 },
  { id: "2026-club-open", name: "Club Open", date: "2026-07-18", course: "Home Course", type: "Tournament", par: 60 },
  { id: "2026-league-wk4", name: "Summer League Week 4", date: "2026-07-23", course: "Home Course", type: "League", par: 54 },
];

export const results: Result[] = [
  { playerId: "alex-rivera", eventId: "2026-league-wk1", division: "MPO", score: 48, place: 1 },
  { playerId: "sam-chen", eventId: "2026-league-wk1", division: "MA1", score: 52, place: 1 },
  { playerId: "jordan-lee", eventId: "2026-league-wk1", division: "MA1", score: 55, place: 2 },
  { playerId: "taylor-brooks", eventId: "2026-league-wk1", division: "FPO", score: 53, place: 1 },
  { playerId: "morgan-patel", eventId: "2026-league-wk1", division: "MA40", score: 54, place: 1 },

  { playerId: "alex-rivera", eventId: "2026-league-wk2", division: "MPO", score: 50, place: 1 },
  { playerId: "sam-chen", eventId: "2026-league-wk2", division: "MA1", score: 53, place: 2 },
  { playerId: "jordan-lee", eventId: "2026-league-wk2", division: "MA1", score: 51, place: 1 },
  { playerId: "casey-nguyen", eventId: "2026-league-wk2", division: "FA1", score: 61, place: 1 },

  { playerId: "alex-rivera", eventId: "2026-league-wk3", division: "MPO", score: 47, place: 1 },
  { playerId: "sam-chen", eventId: "2026-league-wk3", division: "MA1", score: 50, place: 1 },
  { playerId: "taylor-brooks", eventId: "2026-league-wk3", division: "FPO", score: 51, place: 1 },
  { playerId: "casey-nguyen", eventId: "2026-league-wk3", division: "FA1", score: 59, place: 1 },
  { playerId: "morgan-patel", eventId: "2026-league-wk3", division: "MA40", score: 52, place: 1 },

  { playerId: "alex-rivera", eventId: "2026-club-open", division: "MPO", score: 56, place: 2 },
  { playerId: "sam-chen", eventId: "2026-club-open", division: "MA1", score: 58, place: 1 },
  { playerId: "jordan-lee", eventId: "2026-club-open", division: "MA1", score: 61, place: 3 },
  { playerId: "taylor-brooks", eventId: "2026-club-open", division: "FPO", score: 60, place: 1 },
  { playerId: "morgan-patel", eventId: "2026-club-open", division: "MA40", score: 59, place: 2 },

  { playerId: "alex-rivera", eventId: "2026-league-wk4", division: "MPO", score: 49, place: 1 },
  { playerId: "jordan-lee", eventId: "2026-league-wk4", division: "MA1", score: 50, place: 1 },
  { playerId: "casey-nguyen", eventId: "2026-league-wk4", division: "FA1", score: 57, place: 1 },
  { playerId: "morgan-patel", eventId: "2026-league-wk4", division: "MA40", score: 53, place: 1 },
];

export type PlayerResult = Result & { event: ClubEvent; toPar: number };

export type PlayerStats = {
  rounds: number;
  wins: number;
  podiums: number;
  avgToPar: number | null;
  bestToPar: number | null;
};

export function getPlayers(): Player[] {
  return [...players].sort((a, b) => a.name.localeCompare(b.name));
}

export function getPlayer(id: string): Player | undefined {
  return players.find((p) => p.id === id);
}

export function getPlayerResults(playerId: string): PlayerResult[] {
  return results
    .filter((r) => r.playerId === playerId)
    .map((r) => {
      const event = events.find((e) => e.id === r.eventId)!;
      return { ...r, event, toPar: r.score - event.par };
    })
    .sort((a, b) => b.event.date.localeCompare(a.event.date));
}

export function getPlayerStats(playerId: string): PlayerStats {
  const rs = getPlayerResults(playerId);
  if (rs.length === 0) {
    return { rounds: 0, wins: 0, podiums: 0, avgToPar: null, bestToPar: null };
  }
  const toPars = rs.map((r) => r.toPar);
  return {
    rounds: rs.length,
    wins: rs.filter((r) => r.place === 1).length,
    podiums: rs.filter((r) => r.place <= 3).length,
    avgToPar: toPars.reduce((sum, n) => sum + n, 0) / toPars.length,
    bestToPar: Math.min(...toPars),
  };
}

export function formatToPar(n: number | null, digits = 0): string {
  if (n === null) return "—";
  const rounded = Number(n.toFixed(digits));
  if (rounded === 0) return "E";
  return rounded > 0 ? `+${n.toFixed(digits)}` : n.toFixed(digits);
}

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
