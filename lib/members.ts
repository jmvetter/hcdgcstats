import "server-only";
import { db, slugify, transaction } from "./db";

export type MemberInput = {
  name: string;
  pdgaNumber: number | null;
  division: string | null;
};

export type AddMemberResult = { id: string; created: boolean };

// Adds a club member. If the player is already in the database (same PDGA
// number, or same name with no PDGA number on file), they're marked as a member
// instead of being duplicated, and any blank details are filled in.
export function addMember(input: MemberInput): AddMemberResult {
  return transaction(() => {
    const existing = (
      input.pdgaNumber !== null
        ? db.prepare("SELECT id FROM players WHERE pdga_number = ?").get(input.pdgaNumber)
        : undefined
    ) ??
      db.prepare("SELECT id FROM players WHERE name = ? COLLATE NOCASE").get(input.name);

    if (existing) {
      const { id } = existing as { id: string };
      db.prepare(
        `UPDATE players SET member = 1,
           pdga_number = COALESCE(pdga_number, ?),
           division = COALESCE(division, ?)
         WHERE id = ?`,
      ).run(input.pdgaNumber, input.division, id);
      return { id, created: false };
    }

    const base = slugify(input.name) || "player";
    let id = base;
    for (let n = 2; db.prepare("SELECT 1 FROM players WHERE id = ?").get(id); n++) id = `${base}-${n}`;
    db.prepare(
      "INSERT INTO players (id, name, pdga_number, division, joined, member) VALUES (?, ?, ?, ?, ?, 1)",
    ).run(id, input.name, input.pdgaNumber, input.division, new Date().toISOString().slice(0, 10));
    return { id, created: true };
  });
}

export function updatePlayer(id: string, input: MemberInput & { member: boolean }) {
  if (input.pdgaNumber !== null) {
    const clash = db
      .prepare("SELECT name FROM players WHERE pdga_number = ? AND id != ?")
      .get(input.pdgaNumber, id) as { name: string } | undefined;
    if (clash) throw new Error(`${clash.name} already has PDGA #${input.pdgaNumber}.`);
  }
  db.prepare(
    "UPDATE players SET name = ?, pdga_number = ?, division = ?, member = ? WHERE id = ?",
  ).run(input.name, input.pdgaNumber, input.division, input.member ? 1 : 0, id);
}

// Removes a player and all of their results.
export function deletePlayer(id: string) {
  transaction(() => {
    db.prepare("DELETE FROM results WHERE player_id = ?").run(id);
    db.prepare("DELETE FROM rounds WHERE player_id = ?").run(id);
    db.prepare("DELETE FROM players WHERE id = ?").run(id);
  });
}
