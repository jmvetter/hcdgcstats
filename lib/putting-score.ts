import { payFinishers } from "./payout";
import { getPuttingConfig, type DistanceRule, type PuttingConfig } from "./putting-config";

// Scores putting league cards. The raw putts are what's stored; scores are
// always worked out from them plus the rules the night was played under.
//
// Plain TypeScript with no server imports, so the scorecards can show live
// totals with the same code that checks them on the server.

// null is a putt that hasn't been entered yet, which is not the same as a miss.
export type Putt = "make" | "miss" | null;
// [station][distance][putt]
export type Putts = Putt[][][];

export type DistanceScore = {
  makes: number;
  bonus: number;
  score: number;
  entered: number; // putts entered (made or missed)
};
export type StationScore = { distances: DistanceScore[]; total: number };
export type CardScore = {
  stations: StationScore[];
  total: number;
  entered: number;
  blanks: number; // putts not entered yet
  complete: boolean;
};

export function emptyPutts(config: PuttingConfig = getPuttingConfig()): Putts {
  return Array.from({ length: config.stations }, () =>
    config.distances.map(() => Array<Putt>(config.puttsPerDistance).fill(null)),
  );
}

// Reads stored putts (JSON from the database or a form) into the shape the
// rules ask for: anything missing or unrecognized is a blank putt.
export function normalizePutts(raw: unknown, config: PuttingConfig = getPuttingConfig()): Putts {
  const out = emptyPutts(config);
  if (!Array.isArray(raw)) return out;
  for (let s = 0; s < config.stations; s++) {
    for (let d = 0; d < config.distances.length; d++) {
      const row = (raw as unknown[][][])[s]?.[d];
      if (!Array.isArray(row)) continue;
      for (let p = 0; p < config.puttsPerDistance; p++) {
        const v = row[p];
        out[s][d][p] = v === "make" || v === "miss" ? v : null;
      }
    }
  }
  return out;
}

export function scoreDistance(putts: Putt[], rule: DistanceRule, puttsPerDistance = putts.length): DistanceScore {
  const makes = putts.filter((p) => p === "make").length;
  const entered = putts.filter((p) => p !== null).length;
  let bonus = 0;
  if (putts[0] === "make") bonus += rule.firstPuttBonus;
  if (putts[puttsPerDistance - 1] === "make") bonus += rule.lastPuttBonus;
  if (makes === puttsPerDistance) bonus += rule.allMadeBonus;
  return { makes, bonus, score: makes * rule.pointsPerMake + bonus, entered };
}

export function scoreCard(putts: Putts, config: PuttingConfig = getPuttingConfig()): CardScore {
  const stations = Array.from({ length: config.stations }, (_, s): StationScore => {
    const distances = config.distances.map((rule, d) =>
      scoreDistance(normalizeRow(putts[s]?.[d], config.puttsPerDistance), rule, config.puttsPerDistance),
    );
    return { distances, total: distances.reduce((sum, x) => sum + x.score, 0) };
  });
  const entered = stations.reduce((sum, st) => sum + st.distances.reduce((a, x) => a + x.entered, 0), 0);
  const all = totalPutts(config);
  return {
    stations,
    total: stations.reduce((sum, st) => sum + st.total, 0),
    entered,
    blanks: all - entered,
    complete: entered === all,
  };
}

function normalizeRow(row: Putt[] | undefined, length: number): Putt[] {
  return Array.from({ length }, (_, i) => row?.[i] ?? null);
}

export function totalPutts(config: PuttingConfig = getPuttingConfig()): number {
  return config.stations * config.distances.length * config.puttsPerDistance;
}

export function maxDistanceScore(rule: DistanceRule, puttsPerDistance: number): number {
  return puttsPerDistance * rule.pointsPerMake + rule.firstPuttBonus + rule.lastPuttBonus + rule.allMadeBonus;
}

export function maxStationScore(config: PuttingConfig = getPuttingConfig()): number {
  return config.distances.reduce((sum, rule) => sum + maxDistanceScore(rule, config.puttsPerDistance), 0);
}

export function maxRoundScore(config: PuttingConfig = getPuttingConfig()): number {
  return config.stations * maxStationScore(config);
}

// A card's place among the cards it's ranked with, highest total first. Equal
// totals share a place (1, 2, 2, 4), and share the money for the places they fill.
export type Ranked<T> = { card: T; place: number; tied: boolean; total: number; payout: number };

export function rankCards<T extends { score: Pick<CardScore, "total"> }>(cards: T[], payouts: number[] = []): Ranked<T>[] {
  // payFinishers ranks the lowest score first, so totals go in negated.
  const { finishers } = payFinishers(
    cards.map((card) => ({ card, score: -card.score.total })),
    payouts,
  );
  return finishers.map((f) => ({ card: f.card, place: f.place, tied: f.tied, total: -f.score, payout: f.payout }));
}

// Stations. A night names its stations (inside circle, outside circle,
// elevated, ...). Players start on different ones, so each card's rows are in
// the order that player played them, and the card records which of the night's
// stations each row was.

// The night's station names, one per station; "" for one not named yet.
export function stationNames(raw: unknown, config: PuttingConfig = getPuttingConfig()): string[] {
  const list = Array.isArray(raw) ? raw : [];
  return Array.from({ length: config.stations }, (_, i) => (typeof list[i] === "string" ? list[i].trim() : ""));
}

export function stationLabel(names: string[], station: number): string {
  return names[station] || `Station ${station + 1}`;
}

export function isStationOrder(raw: unknown, config: PuttingConfig = getPuttingConfig()): raw is number[] {
  return (
    Array.isArray(raw) &&
    raw.length === config.stations &&
    raw.every((n) => Number.isInteger(n) && n >= 0 && n < config.stations) &&
    new Set(raw).size === config.stations
  );
}

// The stations in the order a card played them, as indexes into the night's
// stations. A card with no valid order plays them in the night's order.
export function normalizeOrder(raw: unknown, config: PuttingConfig = getPuttingConfig()): number[] {
  return isStationOrder(raw, config) ? [...raw] : Array.from({ length: config.stations }, (_, i) => i);
}

// Starting on a station and carrying on through the others in the night's
// order, wrapping around: starting on the 3rd of 4 plays 3, 4, 1, 2.
export function orderFrom(start: number, config: PuttingConfig = getPuttingConfig()): number[] {
  const first = Number.isInteger(start) && start >= 0 && start < config.stations ? start : 0;
  return Array.from({ length: config.stations }, (_, i) => (first + i) % config.stations);
}

// Says which station a row was. A station can only be one row, so the row that
// had it takes the station this row had (the two swap).
export function moveStation(order: number[], row: number, station: number): number[] {
  const out = [...order];
  const other = out.indexOf(station);
  if (other === -1 || row < 0 || row >= out.length) return out;
  out[other] = out[row];
  out[row] = station;
  return out;
}
