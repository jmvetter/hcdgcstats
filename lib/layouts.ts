import "server-only";
import { db, slugify } from "./db";

export type HoleDetail = { label: string; par: number | null; length: number | null };

export type LayoutInput = {
  id: string;
  pdgaLayoutId: number | null;
  course: string;
  name: string;
  holes: number | null;
  par: number | null;
  length: number | null;
  units: string | null;
  holeDetails: HoleDetail[] | null;
};

export function pdgaLayoutKey(pdgaLayoutId: number): string {
  return `pdga-${pdgaLayoutId}`;
}

// Inserts a layout or refreshes its details. Blank fields never overwrite known ones.
export function upsertLayout(l: LayoutInput) {
  db.prepare(
    `INSERT INTO layouts (id, pdga_layout_id, course, name, source_name, holes, par, length, units, hole_details)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       course = excluded.course, name = excluded.name, source_name = excluded.source_name,
       holes = COALESCE(excluded.holes, holes), par = COALESCE(excluded.par, par),
       length = COALESCE(excluded.length, length), units = COALESCE(excluded.units, units),
       hole_details = COALESCE(excluded.hole_details, hole_details)`,
  ).run(
    l.id,
    l.pdgaLayoutId,
    l.course,
    l.name,
    l.name,
    l.holes,
    l.par,
    l.length,
    l.units,
    l.holeDetails ? JSON.stringify(l.holeDetails) : null,
  );
}

// Creates a layout entered by hand (for UDisc imports) and returns its id.
// Reuses an existing layout with the same course and name.
export function createLayout(input: {
  course: string;
  name: string;
  holes: number | null;
  par: number | null;
}): string {
  const existing = db
    .prepare("SELECT id FROM layouts WHERE course = ? COLLATE NOCASE AND name = ? COLLATE NOCASE")
    .get(input.course, input.name) as { id: string } | undefined;
  if (existing) return existing.id;

  const base = slugify(`${input.course} ${input.name}`) || "layout";
  let id = base;
  for (let n = 2; db.prepare("SELECT 1 FROM layouts WHERE id = ?").get(id); n++) id = `${base}-${n}`;
  upsertLayout({
    id,
    pdgaLayoutId: null,
    course: input.course,
    name: input.name,
    holes: input.holes,
    par: input.par,
    length: null,
    units: null,
    holeDetails: null,
  });
  return id;
}

export function findLayout(id: string): { id: string; course: string } | undefined {
  return db.prepare("SELECT id, course FROM layouts WHERE id = ?").get(id) as
    | { id: string; course: string }
    | undefined;
}

// PDGA leagues often get a new layout every week ("Fort Blues Week 2",
// "Fort Blues Week 5"), even when nothing changed, which would split players'
// rounds across one-round layouts. This merges layouts that are truly the same:
// same course, same name apart from the week, and the same par and length on
// every hole. Weeks that really differed stay separate and are renamed by par
// and length so they can be told apart. Safe to run repeatedly.
const WEEK_SUFFIX = /[\s\-–—:(]*\b(?:week|wk|round|rd)\s*#?\s*\d+\)?\s*$/i;

type LayoutRow = {
  id: string;
  course: string;
  source_name: string;
  holes: number | null;
  par: number | null;
  length: number | null;
  units: string | null;
  hole_details: string | null;
};

export function mergeWeeklyLayouts() {
  const rows = db
    .prepare(
      `SELECT id, course, COALESCE(source_name, name) AS source_name, holes, par, length, units, hole_details
       FROM layouts ORDER BY rowid`,
    )
    .all() as LayoutRow[];
  const weekly = rows.filter((r) => WEEK_SUFFIX.test(r.source_name));

  // Group identical layouts; the first imported one survives.
  const identical = new Map<string, LayoutRow[]>();
  for (const r of weekly) {
    const holes: HoleDetail[] = r.hole_details ? JSON.parse(r.hole_details) : [];
    // Without per-hole detail there's no way to be sure two weeks match, so each stays on its own.
    const holeKey = holes.length ? holes.map((h) => `${h.par}/${h.length}`).join(",") : `id:${r.id}`;
    const key = [r.course.toLowerCase(), baseName(r).toLowerCase(), r.holes, holeKey].join("|");
    identical.set(key, [...(identical.get(key) ?? []), r]);
  }

  const moveRounds = db.prepare("UPDATE rounds SET layout_id = ? WHERE layout_id = ?");
  const remove = db.prepare("DELETE FROM layouts WHERE id = ?");
  const survivors: LayoutRow[] = [];
  for (const group of identical.values()) {
    const [keep, ...dupes] = group;
    for (const d of dupes) {
      moveRounds.run(keep.id, d.id);
      remove.run(d.id);
    }
    survivors.push(keep);
  }

  // Name survivors after their base name, adding par and length only when the
  // same course and name has more than one real variant.
  const rename = db.prepare("UPDATE layouts SET name = ? WHERE id = ?");
  const variants = new Map<string, LayoutRow[]>();
  for (const r of survivors) {
    const key = `${r.course.toLowerCase()}|${baseName(r).toLowerCase()}`;
    variants.set(key, [...(variants.get(key) ?? []), r]);
  }
  for (const group of variants.values()) {
    for (const r of group) {
      const unit = r.units === "Meters" ? "m" : "ft";
      const detail = [r.par && `par ${r.par}`, r.length && `${r.length.toLocaleString("en-US")} ${unit}`]
        .filter(Boolean)
        .join(", ");
      rename.run(group.length > 1 && detail ? `${baseName(r)} (${detail})` : baseName(r), r.id);
    }
  }
}

function baseName(r: { source_name: string }): string {
  return r.source_name.replace(WEEK_SUFFIX, "").trim() || r.source_name;
}
