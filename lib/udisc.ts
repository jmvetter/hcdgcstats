import "server-only";
import ExcelJS from "exceljs";

// Parses the leaderboard export from UDisc (Event tools → Leaderboard → Actions → Export).
// UDisc has changed the file's format and column order before, so columns are found
// by header name rather than position, and the import page shows a preview first.

export type ImportRow = {
  name: string;
  division: string | null;
  place: number | null;
  pdgaNumber: number | null;
  score: number | null;
  toPar: number | null;
};

export type ImportField = keyof ImportRow;

export type ParsedExport = {
  headers: string[];
  mapping: Record<ImportField, string | null>;
  rows: ImportRow[];
  warnings: string[];
};

// Candidate header names per field, best match first, compared after normalizing
// to lowercase letters and digits only.
const HEADER_CANDIDATES: Record<ImportField, string[]> = {
  name: ["name", "playername", "player"],
  division: ["division", "div"],
  place: ["position", "place", "pos", "finish"],
  pdgaNumber: ["pdganumber", "pdga", "pdgano", "pdga#"],
  score: ["totalscore", "total", "score", "strokes"],
  toPar: ["totalrelativescore", "relativescore", "relative", "topar", "+/-", "total+/-"],
};

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9+/#-]/g, "");

export async function parseUdiscExport(file: File): Promise<ParsedExport> {
  const buf = Buffer.from(await file.arrayBuffer());
  const grid = file.name.toLowerCase().endsWith(".csv")
    ? parseCsv(buf.toString("utf8"))
    : await readXlsx(buf);
  return parseGrid(grid);
}

export function parseGrid(grid: string[][]): ParsedExport {
  const warnings: string[] = [];

  // The header row is the first row (within the first few) that has a name column.
  const headerIdx = grid
    .slice(0, 10)
    .findIndex((row) => row.some((c) => HEADER_CANDIDATES.name.includes(normalize(c))));
  if (headerIdx === -1) {
    throw new Error("Couldn't find a header row with a player name column.");
  }
  const headers = grid[headerIdx].map((h) => h.trim());
  const normalized = headers.map(normalize);

  const colIndex = {} as Record<ImportField, number>;
  const mapping = {} as Record<ImportField, string | null>;
  for (const field of Object.keys(HEADER_CANDIDATES) as ImportField[]) {
    let idx = -1;
    for (const cand of HEADER_CANDIDATES[field]) {
      idx = normalized.indexOf(normalize(cand));
      if (idx !== -1) break;
    }
    colIndex[field] = idx;
    mapping[field] = idx === -1 ? null : headers[idx];
  }
  if (mapping.score === null && mapping.toPar === null) {
    warnings.push("No total score or relative score column found; results will have no scores.");
  }
  if (mapping.place === null) {
    warnings.push("No position column found; places will be left blank.");
  }

  const cell = (row: string[], field: ImportField) =>
    colIndex[field] === -1 ? "" : (row[colIndex[field]] ?? "").trim();

  const rows: ImportRow[] = [];
  const seen = new Set<string>();
  for (const row of grid.slice(headerIdx + 1)) {
    const name = cell(row, "name");
    if (!name) continue;
    const division = cell(row, "division") || null;
    // Some exports repeat a player's row once per round; keep the first (it has the totals).
    const key = `${division ?? ""}|${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      name,
      division,
      place: parseIntLoose(cell(row, "place")),
      pdgaNumber: parseIntLoose(cell(row, "pdgaNumber")),
      score: parseIntLoose(cell(row, "score")),
      toPar: parseToPar(cell(row, "toPar")),
    });
  }
  if (rows.length === 0) warnings.push("No player rows found below the header.");

  return { headers, mapping, rows, warnings };
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

async function readXlsx(buf: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  // exceljs's types predate Node's generic Buffer type.
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error("The spreadsheet has no worksheets.");
  const grid: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    for (let c = 1; c <= row.cellCount; c++) values.push(row.getCell(c).text ?? "");
    grid.push(values);
  });
  return grid;
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
