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
    `INSERT INTO layouts (id, pdga_layout_id, course, name, holes, par, length, units, hole_details)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       course = excluded.course, name = excluded.name,
       holes = COALESCE(excluded.holes, holes), par = COALESCE(excluded.par, par),
       length = COALESCE(excluded.length, length), units = COALESCE(excluded.units, units),
       hole_details = COALESCE(excluded.hole_details, hole_details)`,
  ).run(
    l.id,
    l.pdgaLayoutId,
    l.course,
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
