"use server";

import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/auth";
import { getPuttingConfig } from "@/lib/putting-config";
import {
  addPuttingCard,
  getPuttingNight,
  listPuttingCards,
  removePuttingCard,
  setPutt,
  setPuttingCardDivision,
  updatePuttingNightHeader,
  type PuttingNight,
} from "@/lib/putting";
import type { Putt } from "@/lib/putting-score";

// Anyone can start and edit scorecards, with no code. Once a night is paid out
// they're locked, and only an admin can change them.
export type PuttingResult = { error?: string };

const LOCKED = "This night has been paid out, so its scorecards are locked. An admin can reopen it.";

async function editableNight(nightId: number): Promise<{ night: PuttingNight } | { error: string }> {
  const night = getPuttingNight(nightId);
  if (!night) return { error: "That putting night no longer exists." };
  if (night.paidOutAt && !(await isAdmin())) return { error: LOCKED };
  return { night };
}

function refresh(nightId: number) {
  revalidatePath(`/putting/${nightId}`);
  revalidatePath("/putting");
  revalidatePath(`/admin/putting/${nightId}`);
}

const cleanDivision = (division: string) => division.trim().toUpperCase().replace(/\s+/g, " ").slice(0, 12);

// Starts a blank scorecard for a player who's already in the player list.
export async function addCardAction(nightId: number, playerId: string, division: string): Promise<PuttingResult> {
  const found = await editableNight(nightId);
  if ("error" in found) return found;
  try {
    if (!addPuttingCard(found.night, { playerId }, cleanDivision(division))) {
      return { error: "That player already has a scorecard." };
    }
  } catch (err) {
    return { error: (err as Error).message };
  }
  refresh(nightId);
  return {};
}

// One tap on one putt: blank, make or miss.
export async function setPuttAction(
  nightId: number,
  playerId: string,
  station: number,
  distance: number,
  putt: number,
  value: Putt,
): Promise<PuttingResult> {
  const found = await editableNight(nightId);
  if ("error" in found) return found;
  const outcome = setPutt(found.night, playerId, { station, distance, putt }, value);
  if (!outcome.error) refresh(nightId);
  return outcome;
}

export async function setCardDivisionAction(nightId: number, playerId: string, division: string): Promise<PuttingResult> {
  const found = await editableNight(nightId);
  if ("error" in found) return found;
  setPuttingCardDivision(nightId, playerId, cleanDivision(division));
  refresh(nightId);
  return {};
}

// A scorecard made by mistake can be removed by anyone while it's still blank;
// once it has putts on it, removing it takes an admin.
export async function removeBlankCardAction(nightId: number, playerId: string): Promise<PuttingResult> {
  const found = await editableNight(nightId);
  if ("error" in found) return found;
  const card = listPuttingCards(found.night).find((c) => c.playerId === playerId);
  if (!card) return {};
  if (card.score.entered > 0 && !(await isAdmin())) {
    return { error: "This scorecard has putts on it. Ask an admin to remove it." };
  }
  removePuttingCard(nightId, playerId);
  refresh(nightId);
  return {};
}

export async function saveHeaderAction(
  nightId: number,
  scorekeeper: string,
  distancesFt: (number | null)[],
): Promise<PuttingResult> {
  const found = await editableNight(nightId);
  if ("error" in found) return found;
  const config = getPuttingConfig(found.night.configVersion);
  const feet = config.distances.map((_, i) => {
    const n = distancesFt[i];
    return typeof n === "number" && Number.isInteger(n) && n > 0 && n < 1000 ? n : null;
  });
  updatePuttingNightHeader(nightId, { scorekeeper: scorekeeper.trim().slice(0, 60) || null, distancesFt: feet });
  refresh(nightId);
  return {};
}
