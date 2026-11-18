import "server-only";
import { db, slugify, transaction } from "./db";
import { CURRENT_PUTTING_CONFIG_VERSION, getPuttingConfig, STATION_SUGGESTIONS } from "./putting-config";
import {
  emptyPutts,
  isStationOrder,
  normalizeOrder,
  normalizePutts,
  orderFrom,
  rankCards,
  scoreCard,
  stationNames,
  type CardScore,
  type Putt,
  type Putts,
  type Ranked,
} from "./putting-score";
import {
  DEFAULT_PAYOUT_SETTINGS,
  parsePayoutSettings,
  payoutTable,
  type PayoutSettings,
} from "./payout";

// Putting league nights: scorecards for each player, a leaderboard by
// division, and the payout. Raw putts are stored; every score is worked out
// from them with the rules the night was played under (lib/putting-config.ts).

export const DEFAULT_PUTTING_MONEY = { entryFee: 5, poolPerPlayer: 4 };

export type PuttingNight = {
  id: number;
  date: string;
  week: number | null;
  name: string;
  scorekeeper: string | null;
  distancesFt: (number | null)[]; // one per distance, null when not given
  stations: string[]; // the night's station names, "" for one not named yet
  entryFee: number;
  poolPerPlayer: number;
  addedCash: Record<string, number>;
  settings: PayoutSettings;
  configVersion: number;
  paidOutAt: string | null;
};

export type PuttingNightSummary = PuttingNight & { cards: number; paid: number };

export type PuttingCard = {
  playerId: string;
  name: string;
  division: string;
  paid: boolean;
  putts: Putts; // rows in the order this player played the stations
  stationOrder: number[]; // which of the night's stations each row was
  score: CardScore;
};

type NightRow = {
  id: number;
  date: string;
  week: number | null;
  name: string;
  scorekeeper: string | null;
  distances_ft: string;
  stations: string;
  entry_fee: number;
  pool_per_player: number;
  added_cash: string;
  settings: string;
  config_version: number;
  paid_out_at: string | null;
};

function parseJson<T>(json: string, fallback: T): T {
  try {
    return (JSON.parse(json) as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function toNight(r: NightRow): PuttingNight {
  const config = getPuttingConfig(r.config_version);
  const feet = parseJson<unknown[]>(r.distances_ft, []);
  return {
    id: r.id,
    date: r.date,
    week: r.week,
    name: r.name,
    scorekeeper: r.scorekeeper,
    distancesFt: config.distances.map((_, i) => (typeof feet[i] === "number" ? (feet[i] as number) : null)),
    stations: stationNames(parseJson<unknown>(r.stations, []), config),
    entryFee: r.entry_fee,
    poolPerPlayer: r.pool_per_player,
    addedCash: parseJson<Record<string, number>>(r.added_cash, {}),
    settings: parsePayoutSettings(r.settings),
    configVersion: r.config_version,
    paidOutAt: r.paid_out_at,
  };
}

export function listPuttingNights(): PuttingNightSummary[] {
  const rows = db
    .prepare(
      `SELECT n.*,
              (SELECT COUNT(*) FROM putting_cards c WHERE c.night_id = n.id) AS cards,
              (SELECT COUNT(*) FROM putting_cards c WHERE c.night_id = n.id AND c.paid = 1) AS paid
       FROM putting_nights n ORDER BY n.date DESC, n.id DESC`,
    )
    .all() as (NightRow & { cards: number; paid: number })[];
  return rows.map((r) => ({ ...toNight(r), cards: r.cards, paid: r.paid }));
}

export function getPuttingNight(id: number): PuttingNight | undefined {
  const row = db.prepare("SELECT * FROM putting_nights WHERE id = ?").get(id) as NightRow | undefined;
  return row ? toNight(row) : undefined;
}

// The stations a new night starts with: the first two are usually the same
// every week (inside and outside the circle) and the other two change, so
// those are left to be named.
export function suggestedStations(): string[] {
  const config = getPuttingConfig();
  const last = listPuttingNights()[0];
  return Array.from({ length: config.stations }, (_, i) =>
    i < 2 ? last?.stations[i] || STATION_SUGGESTIONS[i] || "" : "",
  );
}

// A new night starts with the money and payout settings of the last one (or
// the defaults), and the week after it.
export function createPuttingNight(input: {
  date: string;
  name: string;
  stations: string[];
  scorekeeper?: string | null;
}): number {
  const last = listPuttingNights()[0];
  const result = db
    .prepare(
      `INSERT INTO putting_nights (date, week, name, scorekeeper, distances_ft, stations, entry_fee, pool_per_player,
                                   added_cash, settings, config_version, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?)`,
    )
    .run(
      input.date,
      last?.week != null ? last.week + 1 : 1,
      input.name,
      input.scorekeeper ?? null,
      JSON.stringify(last?.distancesFt ?? []),
      JSON.stringify(input.stations),
      last?.entryFee ?? DEFAULT_PUTTING_MONEY.entryFee,
      last?.poolPerPlayer ?? DEFAULT_PUTTING_MONEY.poolPerPlayer,
      JSON.stringify(last?.settings ?? DEFAULT_PAYOUT_SETTINGS),
      CURRENT_PUTTING_CONFIG_VERSION,
      new Date().toISOString(),
    );
  return Number(result.lastInsertRowid);
}

export function updatePuttingNight(
  id: number,
  input: Pick<
    PuttingNight,
    | "date"
    | "week"
    | "name"
    | "scorekeeper"
    | "distancesFt"
    | "stations"
    | "entryFee"
    | "poolPerPlayer"
    | "addedCash"
    | "settings"
  >,
) {
  db.prepare(
    `UPDATE putting_nights SET date = ?, week = ?, name = ?, scorekeeper = ?, distances_ft = ?, stations = ?,
       entry_fee = ?, pool_per_player = ?, added_cash = ?, settings = ? WHERE id = ?`,
  ).run(
    input.date,
    input.week,
    input.name,
    input.scorekeeper,
    JSON.stringify(input.distancesFt),
    JSON.stringify(input.stations),
    input.entryFee,
    input.poolPerPlayer,
    JSON.stringify(input.addedCash),
    JSON.stringify(input.settings),
    id,
  );
}

// The scorekeeper and distances can be filled in on the night's own screen,
// where anyone can edit them until the night is paid out.
export function updatePuttingNightHeader(
  id: number,
  input: { scorekeeper: string | null; distancesFt: (number | null)[] },
) {
  db.prepare("UPDATE putting_nights SET scorekeeper = ?, distances_ft = ? WHERE id = ?").run(
    input.scorekeeper,
    JSON.stringify(input.distancesFt),
    id,
  );
}

export function deletePuttingNight(id: number) {
  db.prepare("DELETE FROM putting_nights WHERE id = ?").run(id);
}

// Paying out locks the night: its cards then only change for an admin.
export function setPuttingPaidOut(id: number, paidOut: boolean) {
  db.prepare("UPDATE putting_nights SET paid_out_at = ? WHERE id = ?").run(
    paidOut ? new Date().toISOString() : null,
    id,
  );
}

type CardRow = {
  player_id: string;
  name: string;
  division: string;
  paid: number;
  putts: string;
  station_order: string;
};

function toCard(r: CardRow, configVersion: number): PuttingCard {
  const config = getPuttingConfig(configVersion);
  const putts = normalizePutts(parseJson<unknown>(r.putts, null), config);
  return {
    playerId: r.player_id,
    name: r.name,
    division: r.division,
    paid: r.paid === 1,
    putts,
    stationOrder: normalizeOrder(parseJson<unknown>(r.station_order, []), config),
    score: scoreCard(putts, config),
  };
}

export function listPuttingCards(night: Pick<PuttingNight, "id" | "configVersion">): PuttingCard[] {
  const rows = db
    .prepare(
      `SELECT c.player_id, p.name, c.division, c.paid, c.putts, c.station_order
       FROM putting_cards c JOIN players p ON p.id = c.player_id
       WHERE c.night_id = ? ORDER BY c.division, p.name COLLATE NOCASE`,
    )
    .all(night.id) as CardRow[];
  return rows.map((r) => toCard(r, night.configVersion));
}

// Finds a player by exact name, or adds them (not as a club member), the same
// way league check-in does.
function findOrCreatePlayer(name: string, division: string): string {
  const found = db.prepare("SELECT id FROM players WHERE team = 0 AND name = ? COLLATE NOCASE").get(name) as
    | { id: string }
    | undefined;
  if (found) return found.id;
  const base = slugify(name) || "player";
  let id = base;
  for (let n = 2; db.prepare("SELECT 1 FROM players WHERE id = ?").get(id); n++) id = `${base}-${n}`;
  db.prepare("INSERT INTO players (id, name, pdga_number, division, joined, member) VALUES (?, ?, NULL, ?, ?, 0)").run(
    id,
    name,
    division || null,
    new Date().toISOString().slice(0, 10),
  );
  return id;
}

// Starts a blank scorecard for a player who begins on `startStation` (an index
// into the night's stations) and plays the rest in the night's order. Returns
// false when they already have one.
export function addPuttingCard(
  night: Pick<PuttingNight, "id" | "configVersion">,
  input: { playerId: string } | { newName: string },
  division: string,
  startStation = 0,
): boolean {
  const config = getPuttingConfig(night.configVersion);
  return transaction(() => {
    const playerId = "playerId" in input ? input.playerId : findOrCreatePlayer(input.newName, division);
    if (!db.prepare("SELECT 1 FROM players WHERE id = ? AND team = 0").get(playerId)) {
      throw new Error("That player no longer exists.");
    }
    const now = new Date().toISOString();
    const result = db
      .prepare(
        `INSERT OR IGNORE INTO putting_cards (night_id, player_id, division, paid, putts, station_order, created_at, updated_at)
         VALUES (?, ?, ?, 0, ?, ?, ?, ?)`,
      )
      .run(
        night.id,
        playerId,
        division,
        JSON.stringify(emptyPutts(config)),
        JSON.stringify(orderFrom(startStation, config)),
        now,
        now,
      );
    return Number(result.changes) > 0;
  });
}

// Sets one putt. Only that putt changes, so two phones scoring the same card
// don't overwrite each other's taps.
export function setPutt(
  night: Pick<PuttingNight, "id" | "configVersion">,
  playerId: string,
  at: { station: number; distance: number; putt: number },
  value: Putt,
): { error?: string } {
  const config = getPuttingConfig(night.configVersion);
  if (
    !Number.isInteger(at.station) || at.station < 0 || at.station >= config.stations ||
    !Number.isInteger(at.distance) || at.distance < 0 || at.distance >= config.distances.length ||
    !Number.isInteger(at.putt) || at.putt < 0 || at.putt >= config.puttsPerDistance ||
    (value !== null && value !== "make" && value !== "miss")
  ) {
    return { error: "That putt doesn't exist." };
  }
  return transaction(() => {
    const row = db
      .prepare("SELECT putts FROM putting_cards WHERE night_id = ? AND player_id = ?")
      .get(night.id, playerId) as { putts: string } | undefined;
    if (!row) return { error: "That scorecard no longer exists." };
    const putts = normalizePutts(parseJson<unknown>(row.putts, null), config);
    putts[at.station][at.distance][at.putt] = value;
    db.prepare("UPDATE putting_cards SET putts = ?, updated_at = ? WHERE night_id = ? AND player_id = ?").run(
      JSON.stringify(putts),
      new Date().toISOString(),
      night.id,
      playerId,
    );
    return {};
  });
}

// Says which of the night's stations each row of a card was. Returns false for
// an order that doesn't use each station exactly once.
export function setPuttingCardStationOrder(
  night: Pick<PuttingNight, "id" | "configVersion">,
  playerId: string,
  order: unknown,
): boolean {
  if (!isStationOrder(order, getPuttingConfig(night.configVersion))) return false;
  db.prepare("UPDATE putting_cards SET station_order = ?, updated_at = ? WHERE night_id = ? AND player_id = ?").run(
    JSON.stringify(order),
    new Date().toISOString(),
    night.id,
    playerId,
  );
  return true;
}

export function setPuttingCardDivision(nightId: number, playerId: string, division: string) {
  db.prepare("UPDATE putting_cards SET division = ?, updated_at = ? WHERE night_id = ? AND player_id = ?").run(
    division,
    new Date().toISOString(),
    nightId,
    playerId,
  );
}

export function setPuttingCardPaid(nightId: number, playerId: string, paid: boolean) {
  db.prepare("UPDATE putting_cards SET paid = ? WHERE night_id = ? AND player_id = ?").run(
    paid ? 1 : 0,
    nightId,
    playerId,
  );
}

export function removePuttingCard(nightId: number, playerId: string) {
  db.prepare("DELETE FROM putting_cards WHERE night_id = ? AND player_id = ?").run(nightId, playerId);
}

export type RankedCard = Ranked<PuttingCard>;

export type DivisionBoard = { division: string; cards: RankedCard[] };

export function leaderboard(cards: PuttingCard[]): DivisionBoard[] {
  const byDivision = new Map<string, PuttingCard[]>();
  for (const c of cards) byDivision.set(c.division, [...(byDivision.get(c.division) ?? []), c]);
  return [...byDivision.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([division, list]) => ({ division, cards: rankCards(list) }));
}

export type DivisionPayout = {
  division: string;
  paid: number;
  pool: number;
  added: number;
  places: number[]; // payout table for this field
  finishers: RankedCard[];
  leftover: number; // pool not paid out: rounding to $5, odd dollars from ties, or places nobody filled
  unpaid: string[]; // has a card but isn't marked paid, so isn't in the payout
  incomplete: string[]; // paid, but the card still has blank putts
};

export type PuttingPayout = {
  divisions: DivisionPayout[];
  totals: { paid: number; collected: number; pool: number; added: number; leagueFee: number; paidOut: number };
};

// The payout for a night: the paid cards in each division, highest score first,
// paid from the division's pool.
export function getPuttingPayout(night: PuttingNight, cards: PuttingCard[]): PuttingPayout {
  const byDivision = new Map<string, PuttingCard[]>();
  for (const c of cards) byDivision.set(c.division, [...(byDivision.get(c.division) ?? []), c]);
  for (const d of Object.keys(night.addedCash)) if (night.addedCash[d] > 0 && !byDivision.has(d)) byDivision.set(d, []);

  const divisions = [...byDivision.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([division, list]): DivisionPayout => {
      const paid = list.filter((c) => c.paid);
      const added = night.addedCash[division] ?? 0;
      const pool = paid.length * night.poolPerPlayer + added;
      const table = payoutTable(paid.length, pool, night.settings);
      const ranked = rankCards(paid, table.places);
      const paidOut = ranked.reduce((a, f) => a + f.payout, 0);
      return {
        division,
        paid: paid.length,
        pool,
        added,
        places: table.places,
        finishers: ranked,
        leftover: pool - paidOut,
        unpaid: list.filter((c) => !c.paid).map((c) => c.name),
        incomplete: paid.filter((c) => !c.score.complete).map((c) => c.name),
      };
    });

  const paidCount = cards.filter((c) => c.paid).length;
  const added = Object.values(night.addedCash).reduce((a, b) => a + (b > 0 ? b : 0), 0);
  return {
    divisions,
    totals: {
      paid: paidCount,
      collected: paidCount * night.entryFee,
      pool: paidCount * night.poolPerPlayer + added,
      added,
      leagueFee: paidCount * (night.entryFee - night.poolPerPlayer),
      paidOut: divisions.reduce((a, d) => a + d.finishers.reduce((s, f) => s + f.payout, 0), 0),
    },
  };
}
