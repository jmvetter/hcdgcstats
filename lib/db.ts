import "server-only";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// One SQLite file holds everything. Back it up by copying the file.
const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "hcdgc.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pdga_number INTEGER UNIQUE,
  division TEXT,
  joined TEXT NOT NULL,
  rating INTEGER,
  rating_date TEXT,
  classification TEXT,
  city TEXT,
  state_prov TEXT,
  membership_status TEXT,
  pdga_updated_at TEXT
  -- "member" (club member flag) is added by migrate()
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  course TEXT,
  type TEXT NOT NULL,
  par INTEGER,
  source TEXT NOT NULL,
  imported_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS results (
  player_id TEXT NOT NULL REFERENCES players(id),
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  division TEXT,
  place INTEGER,
  score INTEGER,
  to_par INTEGER,
  PRIMARY KEY (player_id, event_id)
);

-- A course layout. PDGA layouts keep PDGA's layout ID; others are created at
-- UDisc import time.
CREATE TABLE IF NOT EXISTS layouts (
  id TEXT PRIMARY KEY,
  pdga_layout_id INTEGER UNIQUE,
  course TEXT NOT NULL,
  name TEXT NOT NULL,
  holes INTEGER,
  par INTEGER,
  length INTEGER,
  units TEXT,
  hole_details TEXT -- JSON: [{ "label": "1", "par": 3, "length": 357 }, ...]
  -- "source_name" (the name as imported, before merging renames it) is added by migrate()
);

-- One player's score for one round of an event, on the layout they played.
CREATE TABLE IF NOT EXISTS rounds (
  player_id TEXT NOT NULL REFERENCES players(id),
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  round INTEGER NOT NULL,
  layout_id TEXT REFERENCES layouts(id),
  score INTEGER NOT NULL,
  to_par INTEGER,
  rating INTEGER, -- PDGA round rating, when the round has one
  hole_scores TEXT, -- JSON array of strokes per hole
  -- "place" (finish within the round's division) and "date" are added by migrate()
  PRIMARY KEY (player_id, event_id, round)
);
CREATE INDEX IF NOT EXISTS rounds_layout ON rounds(layout_id);
`;

function open(): DatabaseSync {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  // busy_timeout: wait for a moment rather than fail if the site and an import
  // script (scripts/import-pdga.ts) write at the same time.
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  return db;
}

// Creates any missing tables, then adds columns introduced after the first
// release (CREATE TABLE IF NOT EXISTS won't add them to an existing table).
function migrate(db: DatabaseSync) {
  db.exec(SCHEMA);
  const cols = (db.prepare("PRAGMA table_info(players)").all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("member")) {
    // Everyone in a database from before the flag existed was a club player.
    db.exec("ALTER TABLE players ADD COLUMN member INTEGER NOT NULL DEFAULT 0");
    db.exec("UPDATE players SET member = 1");
  }
  // Team entries from doubles events, kept apart from individual players.
  if (!cols.includes("team")) db.exec("ALTER TABLE players ADD COLUMN team INTEGER NOT NULL DEFAULT 0");
  const roundCols = (db.prepare("PRAGMA table_info(rounds)").all() as { name: string }[]).map((c) => c.name);
  // Place within the round's division, so each week of a league counts as a finish.
  // Rounds imported before this column existed get one when their event is re-imported.
  if (!roundCols.includes("place")) db.exec("ALTER TABLE rounds ADD COLUMN place INTEGER");
  if (!roundCols.includes("date")) db.exec("ALTER TABLE rounds ADD COLUMN date TEXT");
  const layoutCols = (db.prepare("PRAGMA table_info(layouts)").all() as { name: string }[]).map((c) => c.name);
  if (!layoutCols.includes("source_name")) {
    db.exec("ALTER TABLE layouts ADD COLUMN source_name TEXT");
    db.exec("UPDATE layouts SET source_name = name");
  }
}

// Reuse one connection across hot reloads in dev.
const globalForDb = globalThis as unknown as { hcdgcDb?: DatabaseSync };
export const db = globalForDb.hcdgcDb ?? open();
if (process.env.NODE_ENV !== "production") globalForDb.hcdgcDb = db;
// Runs on every module load (not just open) so a connection kept across hot
// reloads still picks up new tables and columns.
migrate(db);

export function transaction<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
