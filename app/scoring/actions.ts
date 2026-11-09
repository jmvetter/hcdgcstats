"use server";

import { revalidatePath } from "next/cache";
import type { HoleResult } from "@/lib/match-status";
import { canScoreMatch, rememberMatchCode, setHole, setStartHole } from "@/lib/scoring";

export type UnlockState = { error?: string };

function refresh(matchId: number) {
  revalidatePath(`/scoring/${matchId}`);
  revalidatePath("/scoring");
  revalidatePath("/match-play");
  revalidatePath("/admin/match-play");
}

export async function unlockMatchAction(_prev: UnlockState, formData: FormData): Promise<UnlockState> {
  const matchId = Number(formData.get("matchId"));
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  if (!(await rememberMatchCode(matchId, code))) return { error: "That code doesn't match. Check with the organizer." };
  revalidatePath(`/scoring/${matchId}`);
  return {};
}

export async function setHoleAction(matchId: number, hole: number, result: HoleResult | null): Promise<{ error?: string }> {
  if (result !== null && !["A", "B", "H"].includes(result)) return { error: "Unknown result." };
  if (!(await canScoreMatch(matchId))) return { error: "Enter the match code to keep score." };
  const outcome = setHole(matchId, hole, result);
  if (!outcome.error) refresh(matchId);
  return outcome;
}

// The card picks the hole they start on (or clears it, with null) before scoring.
export async function setStartHoleAction(matchId: number, startHole: number | null): Promise<{ error?: string }> {
  if (!(await canScoreMatch(matchId))) return { error: "Enter the match code to keep score." };
  const outcome = setStartHole(matchId, startHole);
  if (!outcome.error) refresh(matchId);
  return outcome;
}
