// Payout formula from the Northside Chain Gang calculator
// (northsidechaingang.org/payout.aspx). Their page computes on the server, so
// this was reconstructed from its output and matches every result it returned
// for 2–20 players across every setting, with whole-dollar rounding. "Round to
// $5" matches most of the time but can differ by one $5 step between two places.
//
// With P places paid, place i gets a share of the pool proportional to
//   1 / (i − flatten·(P+1)) + 2·higher/(P+1) − (lower/100)·(4/(P+1))·max(0, i/(P+1) − 0.7)
// (or (P+1−i)/P for the straight-line curve), and the pool is split into whole
// dollars (or $5 steps) by largest remainder. With the defaults this is simply
// 1, ½, ⅓, ¼… of the pool.
//
// Plain TypeScript with no server imports, so the settings form can preview it.

export type PayoutSettings = {
  percentPaid: number; // share of the field that gets paid, e.g. 40
  curve: "hyperbola" | "straight";
  flatten: number; // their "Flatten Yield Curve" (0 = Normal, down to −2 = Flat)
  higher: number; // their "Payout to Lower Finishers" (−0.2 … 1)
  lower: number; // their "Payout to Lower Finishers (2)" (0 … 100)
  roundTo5: boolean;
};

// The calculator's own defaults, except the club pays the top 40%.
export const DEFAULT_PAYOUT_SETTINGS: PayoutSettings = {
  percentPaid: 40,
  curve: "hyperbola",
  flatten: 0,
  higher: 0,
  lower: 0,
  roundTo5: false,
};

// Option lists use the calculator's labels and values.
export const FLATTEN_OPTIONS = [
  { value: 0, label: "Normal" },
  { value: -0.1, label: "Flat+7" },
  { value: -0.2, label: "Flat+6" },
  { value: -0.3, label: "Flat+5" },
  { value: -0.4, label: "Flat+4" },
  { value: -0.5, label: "Flat+3" },
  { value: -0.75, label: "Flat+2" },
  { value: -1, label: "Flat+1" },
  { value: -2, label: "Flat" },
];

export const HIGHER_OPTIONS = [
  { value: 1, label: "Higher+5" },
  { value: 0.6, label: "Higher+4" },
  { value: 0.4, label: "Higher+3" },
  { value: 0.3, label: "Higher+2" },
  { value: 0.2, label: "Higher+1" },
  { value: 0.1, label: "Higher" },
  { value: 0, label: "Normal" },
  { value: -0.1, label: "Lower" },
  { value: -0.2, label: "Lower+1" },
];

export const LOWER_OPTIONS = [
  { value: 0, label: "Normal" },
  { value: 15, label: "Lower" },
  { value: 30, label: "Lower+1" },
  { value: 45, label: "Lower+2" },
  { value: 60, label: "Lower+3" },
  { value: 75, label: "Lower+4" },
  { value: 85, label: "Lower+5" },
  { value: 100, label: "Lower+6" },
];

// Reads settings saved as JSON, falling back to the defaults for anything missing.
export function parsePayoutSettings(json: string | null | undefined): PayoutSettings {
  let raw: Partial<PayoutSettings> = {};
  try {
    raw = json ? JSON.parse(json) : {};
  } catch {}
  const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  const d = DEFAULT_PAYOUT_SETTINGS;
  return {
    percentPaid: Math.min(100, Math.max(1, num(raw.percentPaid, d.percentPaid))),
    curve: raw.curve === "straight" ? "straight" : "hyperbola",
    flatten: num(raw.flatten, d.flatten),
    higher: num(raw.higher, d.higher),
    lower: num(raw.lower, d.lower),
    roundTo5: raw.roundTo5 === true,
  };
}

// How many places get paid: the share of the field, rounded half up, at least one.
export function placesPaid(players: number, percentPaid: number): number {
  if (players <= 0) return 0;
  return Math.min(players, Math.max(1, Math.round((players * percentPaid) / 100)));
}

function weights(places: number, s: PayoutSettings): number[] {
  const P = places;
  return Array.from({ length: P }, (_, j) => {
    const i = j + 1;
    if (s.curve === "straight") return (P + 1 - i) / P;
    const w =
      1 / (i - s.flatten * (P + 1)) +
      (2 * s.higher) / (P + 1) -
      (s.lower / 100) * (4 / (P + 1)) * Math.max(0, i / (P + 1) - 0.7);
    return Math.max(0, w);
  });
}

// Splits a whole number of units in proportion to the weights: everyone gets
// the whole units of their share, then the units left over go to the largest
// fractions.
function largestRemainder(units: number, w: number[]): number[] {
  const total = w.reduce((a, b) => a + b, 0);
  if (total <= 0 || units <= 0) return w.map(() => 0);
  const exact = w.map((x) => (x / total) * units);
  const out = exact.map(Math.floor);
  const left = units - out.reduce((a, b) => a + b, 0);
  exact
    .map((x, i) => ({ frac: x - Math.floor(x), i }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
    .slice(0, left)
    .forEach(({ i }) => out[i]++);
  return out;
}

export type PayoutTable = {
  places: number[]; // dollars for 1st, 2nd, …
  leftover: number; // pool not paid out (only when rounding to $5)
};

// The payout for each place, for a field of `players` and a pool of `pool` dollars.
export function payoutTable(players: number, pool: number, s: PayoutSettings): PayoutTable {
  const P = placesPaid(players, s.percentPaid);
  if (P === 0 || pool <= 0) return { places: Array(P).fill(0), leftover: Math.max(0, pool) };
  const unit = s.roundTo5 ? 5 : 1;
  const places = largestRemainder(Math.floor(pool / unit), weights(P, s)).map((u) => u * unit);
  return { places, leftover: pool - places.reduce((a, b) => a + b, 0) };
}

export type Finisher<T> = T & { score: number };
export type PaidFinisher<T> = Finisher<T> & { place: number; tied: boolean; payout: number };

// Ranks finishers by score (lowest first) and pays them from the table. Tied
// players share the payouts for the places they occupy, including unpaid
// places, as the PDGA does; a share that doesn't split into whole dollars is
// rounded down and the odd dollars go to the leftover.
export function payFinishers<T>(
  finishers: Finisher<T>[],
  table: number[],
): { finishers: PaidFinisher<T>[]; tieLeftover: number } {
  const sorted = [...finishers].sort((a, b) => a.score - b.score);
  const out: PaidFinisher<T>[] = [];
  let tieLeftover = 0;
  for (let start = 0; start < sorted.length; ) {
    let end = start;
    while (end + 1 < sorted.length && sorted[end + 1].score === sorted[start].score) end++;
    const count = end - start + 1;
    const purse = table.slice(start, end + 1).reduce((a, b) => a + b, 0);
    const share = Math.floor(purse / count);
    tieLeftover += purse - share * count;
    for (let i = start; i <= end; i++) {
      out.push({ ...sorted[i], place: start + 1, tied: count > 1, payout: share });
    }
    start = end + 1;
  }
  return { finishers: out, tieLeftover };
}
