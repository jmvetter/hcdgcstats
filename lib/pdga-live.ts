import "server-only";
import type { ImportRow } from "./udisc";

// Tournament results from PDGA Live, the public JSON feed behind pdga.com's live
// scoring pages. It needs no login, but it's undocumented, so field names could
// change; the import page previews everything before saving.
const LIVE = "https://www.pdga.com/apps/tournament/live-api";

// PDGA uses 999 as the total for a player who didn't finish.
const DNF_TOTAL = 999;

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
  Rating: number | null;
  RunningPlace: number | null;
  GrandTotal: number | null;
  ToPar: number | null;
  Completed: number;
};

type LiveRound = {
  layouts?: { CourseName?: string }[];
  scores: LiveScore[];
};

export type PdgaTournament = {
  tournamentId: number;
  name: string;
  date: string; // start date, YYYY-MM-DD
  course: string | null;
  rows: ImportRow[];
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

export async function fetchTournament(tournamentId: number): Promise<PdgaTournament> {
  const event = await getJson<LiveEvent>(`${LIVE}/live_results_fetch_event?TournID=${tournamentId}`);
  if (!event.Divisions?.length) throw new Error("This tournament has no results on PDGA yet.");

  // A division's latest round carries each player's final running place and total.
  // Playoff rounds are numbered above the scheduled rounds and only list the players
  // in the playoff, so they're skipped.
  const rounds = await Promise.all(
    event.Divisions.map(async (div) => {
      const round = Math.min(div.LatestRound, event.Rounds);
      const data = await getJson<LiveRound>(
        `${LIVE}/live_results_fetch_round?TournID=${tournamentId}&Division=${encodeURIComponent(div.Division)}&Round=${round}`,
      );
      return { division: div.Division, data };
    }),
  );

  const rows: ImportRow[] = rounds.flatMap(({ division, data }) =>
    data.scores.map((s) => {
      const finished = s.GrandTotal !== null && s.GrandTotal < DNF_TOTAL && s.Completed === 1;
      return {
        name: s.Name.trim(),
        division,
        place: finished ? s.RunningPlace : null,
        pdgaNumber: s.PDGANum || null,
        score: finished ? s.GrandTotal : null,
        toPar: finished ? s.ToPar : null,
      };
    }),
  );

  const course = rounds.find((r) => r.data.layouts?.[0]?.CourseName)?.data.layouts?.[0]?.CourseName;

  return {
    tournamentId,
    name: event.SimpleName || event.Name,
    date: event.StartDate.slice(0, 10),
    course: course || event.LocationShort || null,
    rows,
  };
}
