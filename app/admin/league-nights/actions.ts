"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveEventImport } from "@/lib/importer";
import {
  checkIn,
  checkInExisting,
  copyCheckIns,
  createNight,
  deleteNight,
  getNight,
  linkNightResults,
  relinkCheckIn,
  removeCheckIn,
  roundOnDate,
  updateCheckIn,
  updateNightDetails,
} from "@/lib/league-nights";
import { parsePayoutSettings } from "@/lib/payout";
import { fetchTournament, parseTournamentId } from "@/lib/pdga-live";

export type FormState = { message?: string; error?: string };

const BASE = "/admin/league-nights";
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const division = (formData: FormData) => text(formData, "division").toUpperCase();
const wholeDollars = (formData: FormData, key: string) => {
  const s = text(formData, key);
  return /^\d+$/.test(s) ? Number(s) : null;
};

function nightIdFrom(formData: FormData): number {
  const id = Number(formData.get("nightId"));
  if (!Number.isInteger(id) || !getNight(id)) throw new Error("That league night no longer exists.");
  return id;
}

function refresh(nightId?: number) {
  revalidatePath(BASE);
  if (nightId) revalidatePath(`${BASE}/${nightId}`);
}

export async function createNightAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const date = text(formData, "date");
  const name = text(formData, "name") || "League night";
  if (!isDate(date)) return { error: "Pick the night's date." };
  const id = createNight(date, name);
  refresh();
  redirect(`${BASE}/${id}`);
}

export async function deleteNightAction(formData: FormData): Promise<void> {
  await requireAdmin();
  deleteNight(nightIdFrom(formData));
  refresh();
  redirect(BASE);
}

export async function saveNightAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const nightId = nightIdFrom(formData);
  const date = text(formData, "date");
  const name = text(formData, "name");
  const entryFee = wholeDollars(formData, "entryFee");
  const poolPerPlayer = wholeDollars(formData, "poolPerPlayer");
  const acePerPlayer = wholeDollars(formData, "acePerPlayer");
  if (!isDate(date)) return { error: "Pick the night's date." };
  if (!name) return { error: "Give the night a name." };
  if (entryFee === null || poolPerPlayer === null || acePerPlayer === null) {
    return { error: "Entry fee, payout and ace pot amounts should be whole dollars." };
  }
  if (poolPerPlayer + acePerPlayer > entryFee) {
    return { error: "The payout and ace pot amounts add up to more than the entry fee." };
  }
  const percentPaid = Number(text(formData, "percentPaid"));
  if (!Number.isFinite(percentPaid) || percentPaid < 1 || percentPaid > 100) {
    return { error: "Percent of the field paid should be between 1 and 100." };
  }

  const addedCash: Record<string, number> = {};
  for (const [key, value] of formData.entries()) {
    const m = key.match(/^added:(.+)$/);
    if (!m) continue;
    const s = String(value).trim();
    if (s === "") continue;
    if (!/^\d+$/.test(s)) return { error: `Added cash for ${m[1]} should be whole dollars.` };
    if (Number(s) > 0) addedCash[m[1]] = Number(s);
  }

  const settings = parsePayoutSettings(
    JSON.stringify({
      percentPaid,
      curve: text(formData, "curve"),
      flatten: Number(text(formData, "flatten")),
      higher: Number(text(formData, "higher")),
      lower: Number(text(formData, "lower")),
      roundTo5: formData.get("roundTo5") === "on",
    }),
  );
  updateNightDetails(nightId, { date, name, entryFee, poolPerPlayer, acePerPlayer, addedCash, settings });
  refresh(nightId);
  return { message: "Saved." };
}

export async function checkInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const nightId = nightIdFrom(formData);
  const name = text(formData, "name").replace(/\s+/g, " ");
  const pdgaRaw = text(formData, "pdgaNumber").replace(/^#/, "");
  const div = division(formData);
  if (!name) return { error: "Enter the player's name." };
  if (pdgaRaw && !/^\d+$/.test(pdgaRaw)) return { error: "PDGA number should be digits only." };
  if (!div) return { error: "Enter the division they're playing." };
  const paid = formData.get("paid") === "on";
  const { name: saved, created } = checkIn(nightId, {
    name,
    pdgaNumber: pdgaRaw ? Number(pdgaRaw) : null,
    division: div,
    paid,
  });
  refresh(nightId);
  return {
    message: `Checked in ${saved} (${div})${paid ? ", paid" : ", not paid yet"}.${created ? " New player added." : ""}`,
  };
}

export async function updateCheckInAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const nightId = nightIdFrom(formData);
  const div = division(formData);
  if (!div) return;
  updateCheckIn(nightId, text(formData, "playerId"), { division: div, paid: formData.get("paid") === "on" });
  refresh(nightId);
}

export async function removeCheckInAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const nightId = nightIdFrom(formData);
  removeCheckIn(nightId, text(formData, "playerId"));
  refresh(nightId);
}

export async function copyCheckInsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const nightId = nightIdFrom(formData);
  const from = Number(formData.get("fromNightId"));
  if (!Number.isInteger(from) || !getNight(from)) return { error: "Pick a night to copy from." };
  const added = copyCheckIns(nightId, from);
  refresh(nightId);
  return { message: added ? `Checked in ${added} players from that night, not paid yet.` : "Everyone from that night is already checked in." };
}

// Checks in someone who's in the results but wasn't checked in, or points a
// check-in at their record in the results when the names didn't match.
export async function resolveResultPlayerAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const nightId = nightIdFrom(formData);
  const playerId = text(formData, "playerId");
  const choice = text(formData, "resolve");
  if (!playerId || !choice) return;
  if (choice.startsWith("relink:")) {
    relinkCheckIn(nightId, choice.slice("relink:".length), playerId);
  } else {
    const div = division(formData);
    if (!div) return;
    checkInExisting(nightId, playerId, div, choice === "paid");
  }
  refresh(nightId);
}

export async function linkResultsAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const nightId = nightIdFrom(formData);
  const [eventId, round] = text(formData, "results").split("|");
  linkNightResults(nightId, eventId || null, eventId && round ? Number(round) : null);
  refresh(nightId);
}

// Imports (or re-imports) a PDGA league from PDGA Live and links this night to
// the round played on the night's date.
export async function importPdgaForNightAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const nightId = nightIdFrom(formData);
  const night = getNight(nightId)!;
  const id = parseTournamentId(text(formData, "tournament"));
  if (!id) return { error: "Enter the PDGA event ID or its pdga.com URL." };
  let tournament;
  try {
    tournament = await fetchTournament(id);
  } catch (err) {
    return { error: `Couldn't load PDGA event ${id}: ${(err as Error).message}` };
  }
  const eventId = `pdga-${id}`;
  // Keep the type it was given on the admin page if it's been imported before.
  const existing = db.prepare("SELECT type FROM events WHERE id = ?").get(eventId) as { type: string } | undefined;
  const type = existing?.type === "League" || existing?.type === "Tournament" ? existing.type : tournament.type;
  saveEventImport(
    { id: eventId, source: "pdga", name: tournament.name, date: tournament.date, course: tournament.course, type },
    tournament.rows,
    { markMembers: false },
    tournament.layouts,
  );
  const round = roundOnDate(eventId, night.date);
  linkNightResults(nightId, eventId, round);
  revalidatePath("/", "layout");
  return round !== null
    ? { message: `Imported ${tournament.name} and linked round ${round} (played ${night.date}).` }
    : {
        error: `Imported ${tournament.name}, but it has no round on ${night.date} yet. If tonight's scores aren't posted, try again later, or pick the round below.`,
      };
}
