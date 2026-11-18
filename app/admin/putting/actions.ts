"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { parsePayoutSettings } from "@/lib/payout";
import { getPuttingConfig } from "@/lib/putting-config";
import {
  addPuttingCard,
  createPuttingNight,
  deletePuttingNight,
  getPuttingNight,
  removePuttingCard,
  setPuttingCardDivision,
  setPuttingCardPaid,
  setPuttingPaidOut,
  updatePuttingNight,
} from "@/lib/putting";
import type { FormState } from "../league-nights/actions";

const BASE = "/admin/putting";
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const wholeNumber = (formData: FormData, key: string) => {
  const s = text(formData, key);
  return /^\d+$/.test(s) ? Number(s) : null;
};

function nightFrom(formData: FormData) {
  const night = getPuttingNight(Number(formData.get("nightId")));
  if (!night) throw new Error("That putting night no longer exists.");
  return night;
}

function refresh(nightId?: number) {
  revalidatePath(BASE);
  revalidatePath("/putting");
  if (nightId) {
    revalidatePath(`${BASE}/${nightId}`);
    revalidatePath(`/putting/${nightId}`);
  }
}

export async function createPuttingNightAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const date = text(formData, "date");
  const name = text(formData, "name") || "Putting league";
  if (!isDate(date)) return { error: "Pick the night's date." };
  const id = createPuttingNight({ date, name });
  refresh();
  redirect(`${BASE}/${id}`);
}

export async function savePuttingNightAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const night = nightFrom(formData);
  const config = getPuttingConfig(night.configVersion);
  const date = text(formData, "date");
  const name = text(formData, "name");
  const entryFee = wholeNumber(formData, "entryFee");
  const poolPerPlayer = wholeNumber(formData, "poolPerPlayer");
  if (!isDate(date)) return { error: "Pick the night's date." };
  if (!name) return { error: "Give the night a name." };
  if (entryFee === null || poolPerPlayer === null) return { error: "Entry fee and payout amounts should be whole dollars." };
  if (poolPerPlayer > entryFee) return { error: "The payout amount is more than the entry fee." };
  const percentPaid = Number(text(formData, "percentPaid"));
  if (!Number.isFinite(percentPaid) || percentPaid < 1 || percentPaid > 100) {
    return { error: "Percent of the field paid should be between 1 and 100." };
  }
  const weekText = text(formData, "week");
  if (weekText !== "" && !/^\d{1,3}$/.test(weekText)) return { error: "Week should be a number." };
  const distancesFt: (number | null)[] = [];
  for (let i = 0; i < config.distances.length; i++) {
    const s = text(formData, `distance:${i}`);
    if (s !== "" && !/^\d{1,3}$/.test(s)) return { error: `Distance for ${config.distances[i].label} should be whole feet.` };
    distancesFt.push(s === "" ? null : Number(s));
  }

  const addedCash: Record<string, number> = {};
  for (const [key, value] of formData.entries()) {
    const m = key.match(/^added:(.*)$/);
    if (!m) continue;
    const s = String(value).trim();
    if (s === "") continue;
    if (!/^\d+$/.test(s)) return { error: `Added cash for ${m[1] || "no division"} should be whole dollars.` };
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
  updatePuttingNight(night.id, {
    date,
    week: weekText === "" ? null : Number(weekText),
    name,
    scorekeeper: text(formData, "scorekeeper") || null,
    distancesFt,
    entryFee,
    poolPerPlayer,
    addedCash,
    settings,
  });
  refresh(night.id);
  return { message: "Saved." };
}

export async function addPuttingCardAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const night = nightFrom(formData);
  const name = text(formData, "name").replace(/\s+/g, " ");
  if (!name) return { error: "Enter the player's name." };
  const division = text(formData, "division").toUpperCase();
  const added = addPuttingCard(night, { newName: name }, division);
  refresh(night.id);
  return added ? { message: `Added ${name}.` } : { error: `${name} already has a scorecard.` };
}

export async function setPuttingPaidAction(nightId: number, playerId: string, paid: boolean): Promise<void> {
  await requireAdmin();
  setPuttingCardPaid(nightId, playerId, paid);
  refresh(nightId);
}

export async function setPuttingDivisionAction(nightId: number, playerId: string, division: string): Promise<void> {
  await requireAdmin();
  setPuttingCardDivision(nightId, playerId, division.trim().toUpperCase().slice(0, 12));
  refresh(nightId);
}

export async function removePuttingCardAction(nightId: number, playerId: string): Promise<void> {
  await requireAdmin();
  removePuttingCard(nightId, playerId);
  refresh(nightId);
}

// Paying out locks the night: scorecards can then only be changed by an admin.
export async function setPuttingPaidOutAction(nightId: number, paidOut: boolean): Promise<void> {
  await requireAdmin();
  if (!getPuttingNight(nightId)) return;
  setPuttingPaidOut(nightId, paidOut);
  refresh(nightId);
}

export async function deletePuttingNightAction(formData: FormData): Promise<void> {
  await requireAdmin();
  deletePuttingNight(Number(formData.get("nightId")));
  refresh();
  redirect(BASE);
}
