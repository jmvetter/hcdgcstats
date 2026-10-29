import "server-only";
import ExcelJS from "exceljs";
import type { ImportRow, RoundInput } from "./importer";

// Parses the leaderboard export from UDisc (Event tools → Leaderboard → Actions → Export).
// The XLSX export has one sheet per pool and round ("Pool A - Round 1",
// "Pool B - Round 1", ...) with snake_case columns (event_total_score,
// round_relative_score, hole_1, ...). Columns are found by header name rather
// than position, older CSV exports with different names still work, and the
// import page shows a preview first.

export type ImportField = Exclude<keyof ImportRow, "rounds">;

export type ParsedExport = {
  headers: string[];
  mapping: Record<ImportField, string | null>;
  sheets: { name: string; round: number; entries: number }[];
  roundCount: number;
  holeCount: number | null; // holes in the hole-by-hole columns, when present
  rows: ImportRow[];
  warnings: string[];
};

type Sheet = { name: string; grid: string[][] };

// Candidate header names per field, best match first, compared after normalizing
// to lowercase letters and digits only ("event_total_score" → "eventtotalscore").
const HEADER_CANDIDATES: Record<ImportField, string[]> = {
  name: ["name", "playername", "player"],
  division: ["division", "div"],
  place: ["position", "place", "pos", "finish"],
  pdgaNumber: ["pdganumber", "pdga", "pdgano", "pdga#"],
  score: ["eventtotalscore", "totalscore", "total", "score", "strokes"],
  toPar: ["eventrelativescore", "totalrelativescore", "relativescore", "relative", "topar", "+/-", "total+/-"],
};
const ROUND_SCORE = ["roundtotalscore", "roundscore"];
const ROUND_TO_PAR = ["roundrelativescore", "roundtopar"];
const HOLE = /^hole(\d+)$/;
// Older flat exports with every round on one row: "Round 1 Total Score", "Round 2 Relative Score".
const FLAT_ROUND_SCORE = /^(?:round|rd)(\d+)(?:total)?score$/;
const FLAT_ROUND_RELATIVE = /^(?:round|rd)(\d+)(?:total)?relative(?:score)?$/;

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9+/#-]/g, "");

export async function parseUdiscExport(file: File): Promise<ParsedExport> {
  const buf = Buffer.from(await file.arrayBuffer());
  const sheets = file.name.toLowerCase().endsWith(".csv")
    ? [{ name: "", grid: parseCsv(buf.toString("utf8")) }]
    : await readXlsx(buf);
  return parseSheets(sheets);
}

export function parseSheets(sheets: Sheet[]): ParsedExport {
  const warnings: string[] = [];
  const entries = new Map<string, ImportRow & { latestRound: number }>();
  const sheetInfo: ParsedExport["sheets"] = [];
  let firstHeaders: string[] | null = null;
  let firstMapping: ParsedExport["mapping"] | null = null;
  let holeCount: number | null = null;

  for (const sheet of sheets) {
    const headerIdx = sheet.grid
      .slice(0, 10)
      .findIndex((row) => row.some((c) => HEADER_CANDIDATES.name.includes(normalize(c))));
    if (headerIdx === -1) continue;
    const headers = sheet.grid[headerIdx].map((h) => h.trim());
    const normalized = headers.map(normalize);
    const find = (cands: string[]) => {
      for (const c of cands) {
        const i = normalized.indexOf(normalize(c));
        if (i !== -1) return i;
      }
      return -1;
    };

    const col = {} as Record<ImportField, number>;
    const mapping = {} as Record<ImportField, string | null>;
    for (const field of Object.keys(HEADER_CANDIDATES) as ImportField[]) {
      col[field] = find(HEADER_CANDIDATES[field]);
      mapping[field] = col[field] === -1 ? null : headers[col[field]];
    }
    firstHeaders ??= headers;
    firstMapping ??= mapping;

    const roundScoreCol = find(ROUND_SCORE);
    const roundToParCol = find(ROUND_TO_PAR);
    const holeCols = normalized
      .map((h, i) => ({ n: Number(h.match(HOLE)?.[1]), i }))
      .filter((h) => h.n > 0)
      .sort((a, b) => a.n - b.n)
      .map((h) => h.i);
    if (holeCols.length) holeCount = Math.max(holeCount ?? 0, holeCols.length);

    const flatRounds = new Map<number, { score?: number; relative?: number }>();
    normalized.forEach((h, i) => {
      const s = h.match(FLAT_ROUND_SCORE);
      const r = h.match(FLAT_ROUND_RELATIVE);
      if (s) flatRounds.set(Number(s[1]), { ...flatRounds.get(Number(s[1])), score: i });
      if (r) flatRounds.set(Number(r[1]), { ...flatRounds.get(Number(r[1])), relative: i });
    });

    // "Pool A - Round 2" → round 2. A sheet without a round number is round 1.
    const round = Number(sheet.name.match(/round\s*(\d+)/i)?.[1] ?? 1);
    let count = 0;

    for (const row of sheet.grid.slice(headerIdx + 1)) {
      const at = (i: number) => (i === -1 ? "" : (row[i] ?? "").trim());
      const name = at(col.name).replace(/\s+/g, " ");
      if (!name) continue;
      count++;
      const division = at(col.division) || null;
      const key = `${division ?? ""}|${name.toLowerCase()}`;
      const score = parseIntLoose(at(col.score));
      const toPar = parseToPar(at(col.toPar));

      let entry = entries.get(key);
      if (!entry) {
        entry = { name, division, place: null, pdgaNumber: null, score: null, toPar: null, rounds: [], latestRound: 0 };
        entries.set(key, entry);
      }
      entry.pdgaNumber ??= parseIntLoose(at(col.pdgaNumber));
      // Event totals and position are running totals; the latest round's are final.
      if (round >= entry.latestRound) {
        entry.latestRound = round;
        entry.place = parseIntLoose(at(col.place));
        entry.score = score;
        entry.toPar = toPar;
      }

      // UDisc's round_rating is its own scale (around 150–250), not a PDGA
      // rating, so it's deliberately not stored.
      const holeScores = holeCols.map((i) => parseIntLoose(at(i)));
      const holes = holeScores.length && holeScores.every((n) => n !== null) ? (holeScores as number[]) : null;
      if (flatRounds.size) {
        for (const [n, c] of [...flatRounds].sort((a, b) => a[0] - b[0])) {
          const s = parseIntLoose(at(c.score ?? -1));
          if (s !== null) addRound(entry, { round: n, layoutId: null, score: s, toPar: parseToPar(at(c.relative ?? -1)), rating: null, holeScores: null });
        }
      } else {
        const s = roundScoreCol !== -1 ? parseIntLoose(at(roundScoreCol)) : score;
        const tp = roundToParCol !== -1 ? parseToPar(at(roundToParCol)) : toPar;
        if (s !== null) addRound(entry, { round, layoutId: null, score: s, toPar: tp, rating: null, holeScores: holes });
      }
    }
    sheetInfo.push({ name: sheet.name || "Leaderboard", round, entries: count });
  }

  if (!firstHeaders || !firstMapping) {
    throw new Error("Couldn't find a header row with a player name column.");
  }
  if (firstMapping.score === null && firstMapping.toPar === null) {
    warnings.push("No total score or relative score column found; results will have no scores.");
  }
  if (firstMapping.place === null) warnings.push("No position column found; places will be left blank.");

  const rows: ImportRow[] = [...entries.values()].map((e) => ({
    name: e.name,
    division: e.division,
    place: e.place,
    pdgaNumber: e.pdgaNumber,
    score: e.score,
    toPar: e.toPar,
    rounds: e.rounds.sort((a, b) => a.round - b.round),
  }));
  if (rows.length === 0) warnings.push("No player rows found below the header.");
  const roundCount = new Set(rows.flatMap((r) => r.rounds.map((x) => x.round))).size || 1;

  return { headers: firstHeaders, mapping: firstMapping, sheets: sheetInfo, roundCount, holeCount, rows, warnings };
}

function addRound(entry: ImportRow, r: RoundInput) {
  if (!entry.rounds.some((x) => x.round === r.round)) entry.rounds.push(r);
}

// "T3" → 3, "12" → 12, "DNF" → null
function parseIntLoose(s: string): number | null {
  const m = s.match(/-?\d+/);
  return m ? Number(m[0]) : null;
}

// "+3" → 3, "-2" → -2, "E" → 0
function parseToPar(s: string): number | null {
  if (/^e(ven)?$/i.test(s)) return 0;
  return parseIntLoose(s);
}

async function readXlsx(buf: Buffer): Promise<Sheet[]> {
  const wb = new ExcelJS.Workbook();
  // exceljs's types predate Node's generic Buffer type.
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  if (!wb.worksheets.length) throw new Error("The spreadsheet has no worksheets.");
  return wb.worksheets.map((sheet) => {
    const grid: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values: string[] = [];
      for (let c = 1; c <= row.cellCount; c++) values.push(row.getCell(c).text ?? "");
      grid.push(values);
    });
    return { name: sheet.name, grid };
  });
}

// Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF).
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
