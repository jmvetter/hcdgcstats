"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  createMatch,
  createMatchup,
  createScoringEvent,
  deleteMatch,
  deleteMatchup,
  deleteScoringEvent,
  getMatchup,
  getScoringEventName,
  getScoringMatch,
  layoutExists,
  listPlayedPlayerNames,
  updateMatch,
} from "@/lib/scoring";

export type FormState = { message?: string; error?: string };

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim().replace(/\s+/g, " ");

function refresh() {
  revalidatePath("/admin/match-play");
  revalidatePath("/scoring", "layout");
  revalidatePath("/match-play");
}

export async function createEventAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const name = text(formData, "name");
  const date = text(formData, "date");
  if (!name) return { error: "Give the event a name." };
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick a valid date." };
  createScoringEvent(name, date || null);
  refresh();
  return { message: `Added ${name}.` };
}

export async function deleteEventAction(formData: FormData): Promise<void> {
  await requireAdmin();
  deleteScoringEvent(Number(formData.get("eventId")));
  refresh();
}

export async function createMatchupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const eventId = Number(formData.get("eventId"));
  const teamA = text(formData, "teamA");
  const teamB = text(formData, "teamB");
  if (!getScoringEventName(eventId)) return { error: "That event no longer exists." };
  if (!teamA || !teamB) return { error: "Enter both team names." };
  createMatchup(eventId, teamA, teamB);
  refresh();
  return { message: `Added ${teamA} vs ${teamB}.` };
}

export async function deleteMatchupAction(formData: FormData): Promise<void> {
  await requireAdmin();
  deleteMatchup(Number(formData.get("matchupId")));
  refresh();
}

export async function createMatchAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const eventId = Number(formData.get("eventId"));
  const matchupId = Number(formData.get("matchupId")) || null;
  const doubles = formData.get("format") === "doubles";
  const perSide = doubles ? 2 : 1;
  const pick = (side: "a" | "b") =>
    Array.from({ length: perSide }, (_, i) => text(formData, `${side}${i + 1}`));
  const playersA = pick("a");
  const playersB = pick("b");
  const holes = Number(formData.get("holes"));
  const round = Number(formData.get("round"));
  const layoutId = text(formData, "layoutId") || null;
  if (!getScoringEventName(eventId)) return { error: "That event no longer exists." };
  if (matchupId !== null && getMatchup(matchupId)?.eventId !== eventId) return { error: "Pick a matchup from this event." };
  const all = [...playersA, ...playersB];
  if (all.some((p) => !p)) return { error: doubles ? "Pick two players for each side." : "Pick a player for each side." };
  const known = new Set(listPlayedPlayerNames());
  if (all.some((p) => !known.has(p))) return { error: "Pick players from the list." };
  if (new Set(all).size !== all.length) return { error: "Each player can only be in the match once." };
  if (!Number.isInteger(holes) || holes < 1 || holes > 36) return { error: "Holes should be between 1 and 36." };
  if (!Number.isInteger(round) || round < 1 || round > 9) return { error: "Pick a round." };
  if (layoutId !== null && !layoutExists(layoutId)) return { error: "Pick a layout from the list." };
  const sideA = playersA.join(" & ");
  const sideB = playersB.join(" & ");
  const label = text(formData, "label") || (doubles ? "Doubles" : "Singles");
  createMatch({ eventId, matchupId, label, sideA, sideB, holes, round, layoutId });
  refresh();
  return { message: `Added ${sideA} vs ${sideB} to round ${round}.` };
}

// Moves a match to another round, team matchup or layout; its scores stay.
export async function updateMatchAction(
  matchId: number,
  matchupId: number | null,
  round: number,
  layoutId: string | null,
): Promise<{ error?: string }> {
  await requireAdmin();
  const match = getScoringMatch(matchId);
  if (!match) return { error: "That match no longer exists." };
  if (matchupId !== null && getMatchup(matchupId)?.eventId !== match.eventId) {
    return { error: "Pick a matchup from this event." };
  }
  if (!Number.isInteger(round) || round < 1 || round > 9) return { error: "Pick a round." };
  if (layoutId !== null && !layoutExists(layoutId)) return { error: "Pick a layout from the list." };
  updateMatch(matchId, { matchupId, round, layoutId });
  refresh();
  return {};
}

export async function deleteMatchAction(formData: FormData): Promise<void> {
  await requireAdmin();
  deleteMatch(Number(formData.get("matchId")));
  refresh();
}
