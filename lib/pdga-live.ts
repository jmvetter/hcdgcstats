import "server-only";
import type { ImportRow, RoundInput } from "./importer";
import { pdgaLayoutKey, type LayoutInput } from "./layouts";

// Tournament results from PDGA Live, the public JSON feed behind pdga.com's live
// scoring pages. It needs no login, but it's undocumented, so field names could
// change; the import page previews everything before saving.
const LIVE = "https://www.pdga.com/apps/tournament/live-api";

// PDGA uses 999 as a score for a player who didn't finish.
const DNF_SCORE = 999;

type LiveDivision = { Division: string; LatestRound: number; Players: number };

type LiveEvent = {
  TournamentId: string;
  Name: string;
  SimpleName?: string;
  StartDate: string;
  EndDate: string;
  LocationShort?: string;
  Rounds: number;
  Divisions: LiveDivision[];
};

type LiveScore = {
  Name: string;
  PDGANum: number | null;
  RunningPlace: number | null;
  GrandTotal: number | null;
  ToPar: number | null;
  Completed: number;
  LayoutID: number | null;
  Holes: number | null;
  RoundScore: number | null;
  RoundtoPar: number | null;
  RoundRating: number | null;
  Scores: string | null; // "3,2,4,...,,," padded to 36 holes
};

type LiveLayout = {
  LayoutID: number;
  CourseName: string | null;
  Name: string | null;
  Holes: number | null;
  Par: number | null;
  Length: number | null;
  Units: string | null;
  Detail?: { Label: string; Par: number | null; Length: number | null }[];
};

type LiveRound = {
  layouts?: LiveLayout[];
  scores: LiveScore[];
};

export type PdgaTournament = {
  tournamentId: number;
  name: string;
  date: string; // start date, YYYY-MM-DD
  course: string | null;
  rows: ImportRow[];
  layouts: LayoutInput[];
};

// Accepts a bare ID or a pdga.com URL such as https://www.pdga.com/tour/event/88276
// or https://www.pdga.com/live/event/88276/MPO/scores
export function parseTournamentId(input: string): number | null {
  const s = input.trim();
  const m = s.match(/event\/(\d+)/i) ?? s.match(/TournID=(\d+)/i) ?? s.match(/^(\d+)$/);
  return m ? Number(m[1]) : null;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`PDGA returned HTTP ${res.status}.`);
  const body = (await res.json()) as { data?: T };
  if (!body.data) throw new Error("PDGA returned no data for this tournament.");
  return body.data;
}

// Runs tasks a few at a time so big events don't fire dozens of requests at once.
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

function toLayout(l: LiveLayout, fallbackCourse: string | null): LayoutInput {
  return {
    id: pdgaLayoutKey(l.LayoutID),
    pdgaLayoutId: l.LayoutID,
    course: l.CourseName || fallbackCourse || "Unknown course",
    name: l.Name || "Default layout",
    holes: l.Holes,
    par: l.Par,
    length: l.Length,
    units: l.Units,
    holeDetails: l.Detail?.length
      ? l.Detail.map((h) => ({ label: h.Label, par: h.Par, length: h.Length }))
      : null,
  };
}

function toRound(round: number, s: LiveScore): RoundInput | null {
  if (!s.RoundScore || s.RoundScore >= DNF_SCORE) return null;
  const holes = s.Holes ?? 18;
  const holeScores = (s.Scores ?? "")
    .split(",")
    .slice(0, holes)
    .map((v) => (v.trim() === "" ? NaN : Number(v)));
  return {
    round,
    layoutId: s.LayoutID ? pdgaLayoutKey(s.LayoutID) : null,
    score: s.RoundScore,
    toPar: s.RoundtoPar,
    rating: s.RoundRating || null,
    holeScores: holeScores.every((n) => Number.isFinite(n)) ? holeScores : null,
  };
}

export async function fetchTournament(tournamentId: number): Promise<PdgaTournament> {
  const event = await getJson<LiveEvent>(`${LIVE}/live_results_fetch_event?TournID=${tournamentId}`);
  if (!event.Divisions?.length) throw new Error("This tournament has no results on PDGA yet.");

  // Every scheduled round of every division. Playoff rounds are numbered above
  // the scheduled rounds and only list the players in the playoff, so they're skipped.
  const requests = event.Divisions.flatMap((div) =>
    Array.from({ length: Math.min(div.LatestRound, event.Rounds) }, (_, i) => ({
      division: div.Division,
      round: i + 1,
    })),
  );
  const responses = await mapLimit(requests, 6, async (req) => ({
    ...req,
    data: await getJson<LiveRound>(
      `${LIVE}/live_results_fetch_round?TournID=${tournamentId}&Division=${encodeURIComponent(req.division)}&Round=${req.round}`,
    ),
  }));

  const layouts = new Map<number, LayoutInput>();
  for (const { data } of responses) {
    for (const l of data.layouts ?? []) {
      if (!layouts.has(l.LayoutID)) layouts.set(l.LayoutID, toLayout(l, event.LocationShort ?? null));
    }
  }

  // Build one row per player per division. Final place and totals come from the
  // division's latest round; each round adds that round's score and layout.
  const latestRound = new Map(requests.map((r) => [r.division, 0]));
  for (const r of requests) latestRound.set(r.division, Math.max(latestRound.get(r.division)!, r.round));

  const rows = new Map<string, ImportRow>();
  for (const { division, round, data } of responses.sort((a, b) => b.round - a.round)) {
    for (const s of data.scores) {
      const key = `${division}|${s.PDGANum || s.Name.trim().toLowerCase()}`;
      let row = rows.get(key);
      if (!row) {
        // Rounds are visited latest first, so a player's first row normally comes from
        // their division's final round. Anyone missing from it withdrew, so their
        // running place and total from an earlier round aren't final.
        const finished =
          round === latestRound.get(division) &&
          s.GrandTotal !== null &&
          s.GrandTotal < DNF_SCORE &&
          s.Completed === 1;
        row = {
          name: s.Name.trim(),
          division,
          place: finished ? s.RunningPlace : null,
          pdgaNumber: s.PDGANum || null,
          score: finished ? s.GrandTotal : null,
          toPar: finished ? s.ToPar : null,
          rounds: [],
        };
        rows.set(key, row);
      }
      const r = toRound(round, s);
      if (r) row.rounds.push(r);
    }
  }
  const divisionOrder = event.Divisions.map((d) => d.Division);
  const sortedRows = [...rows.values()].sort(
    (a, b) =>
      divisionOrder.indexOf(a.division!) - divisionOrder.indexOf(b.division!) ||
      (a.place ?? Infinity) - (b.place ?? Infinity),
  );
  for (const row of sortedRows) row.rounds.sort((a, b) => a.round - b.round);

  const firstLayout = layouts.values().next().value;
  return {
    tournamentId,
    name: event.SimpleName || event.Name,
    date: event.StartDate.slice(0, 10),
    course: firstLayout?.course ?? event.LocationShort ?? null,
    rows: sortedRows,
    layouts: [...layouts.values()],
  };
}
