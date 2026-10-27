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
`;

function open(): DatabaseSync {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  return db;
}

// Columns added after the first release. CREATE TABLE IF NOT EXISTS won't add
// them to an existing database, so add any that are missing.
function migrate(db: DatabaseSync) {
  const cols = (db.prepare("PRAGMA table_info(players)").all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes("member")) {
    // Everyone in a database from before the flag existed was a club player.
    db.exec("ALTER TABLE players ADD COLUMN member INTEGER NOT NULL DEFAULT 0");
    db.exec("UPDATE players SET member = 1");
  }
}

// Reuse one connection across hot reloads in dev.
const globalForDb = globalThis as unknown as { hcdgcDb?: DatabaseSync };
export const db = globalForDb.hcdgcDb ?? open();
if (process.env.NODE_ENV !== "production") globalForDb.hcdgcDb = db;
// Runs on every module load (not just open) so a connection kept across hot
// reloads still picks up new migrations.
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
