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
  const sideA = text(formData, "sideA");
  const sideB = text(formData, "sideB");
  const holes = Number(formData.get("holes"));
  if (!getScoringEventName(eventId)) return { error: "That event no longer exists." };
  if (matchupId !== null && getMatchup(matchupId)?.eventId !== eventId) return { error: "Pick a matchup from this event." };
  if (!sideA || !sideB) return { error: "Enter both sides of the match." };
  if (!Number.isInteger(holes) || holes < 1 || holes > 36) return { error: "Holes should be between 1 and 36." };
  createMatch({ eventId, matchupId, label: text(formData, "label") || null, sideA, sideB, holes });
  refresh();
  return { message: `Added ${sideA} vs ${sideB}.` };
}

export async function deleteMatchAction(formData: FormData): Promise<void> {
  await requireAdmin();
  deleteMatch(Number(formData.get("matchId")));
  refresh();
}
