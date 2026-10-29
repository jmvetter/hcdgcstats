"use server";

import { revalidatePath } from "next/cache";
import { logIn, logOut, requireAdmin } from "@/lib/auth";
import type { EventType } from "@/lib/data";
import { matchMembers, saveEventImport, type ImportRow, type ImportSummary } from "@/lib/importer";
import { setEventType } from "@/lib/events";
import { createLayout, findLayout, type LayoutInput } from "@/lib/layouts";
import { addMember, deletePlayer, updatePlayer } from "@/lib/members";
import {
  lookupPdgaPlayer,
  pdgaConfigured,
  pdgaPlayerName,
  refreshPdgaPlayers,
  savePdgaDetails,
  type PdgaPlayer,
  type RefreshSummary,
} from "@/lib/pdga";
import { fetchTournament, parseTournamentId, type PdgaTournament } from "@/lib/pdga-live";
import { parseUdiscExport, type ParsedExport } from "@/lib/udisc";

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const ok = await logIn(String(formData.get("password") ?? ""));
  if (!ok) return { error: "Wrong password." };
  revalidatePath("/admin");
  return {};
}

export async function logoutAction(): Promise<void> {
  await logOut();
  revalidatePath("/admin");
}

export type PreviewState = { preview?: ParsedExport; fileName?: string; error?: string };

export async function previewUdiscAction(_prev: PreviewState, formData: FormData): Promise<PreviewState> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a UDisc export file." };
  try {
    return { preview: await parseUdiscExport(file), fileName: file.name };
  } catch (err) {
    return { error: `Couldn't read ${file.name}: ${(err as Error).message}` };
  }
}

export type ImportState = { summary?: ImportSummary; error?: string };

// Parses the rows a preview put in a hidden field.
function readRows(formData: FormData): ImportRow[] | null {
  try {
    const rows = JSON.parse(String(formData.get("rows") ?? "[]"));
    if (!Array.isArray(rows) || rows.some((r) => typeof r?.name !== "string" || !Array.isArray(r?.rounds))) {
      return null;
    }
    return rows;
  } catch {
    return null;
  }
}

const optionalInt = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return /^\d+$/.test(s) ? Number(s) : null;
};

function readEventType(formData: FormData, fallback: EventType): EventType {
  const t = formData.get("type");
  return t === "League" || t === "Tournament" || t === "Doubles" ? t : fallback;
}

export async function importUdiscAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  const type = readEventType(formData, "League");
  if (!name) return { error: "Event name is required." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Event date is required." };

  const rows = readRows(formData);
  if (!rows) return { error: "The preview data was invalid. Upload the file again." };

  // Every round in a UDisc import was played on the layout chosen on the form.
  let layoutId = String(formData.get("layoutId") ?? "");
  let course: string | null = null;
  if (layoutId === "new") {
    const layoutCourse = String(formData.get("layoutCourse") ?? "").trim();
    const layoutName = String(formData.get("layoutName") ?? "").trim();
    if (!layoutCourse || !layoutName) return { error: "Enter the new layout's course and name." };
    layoutId = createLayout({
      course: layoutCourse,
      name: layoutName,
      holes: optionalInt(formData.get("layoutHoles")),
      par: optionalInt(formData.get("layoutPar")),
    });
    course = layoutCourse;
  } else {
    const layout = findLayout(layoutId);
    if (!layout) return { error: "Choose the layout this event was played on." };
    course = layout.course;
  }
  for (const row of rows) for (const r of row.rounds) r.layoutId = layoutId;

  // Club events make everyone a member, except doubles, whose entries are teams.
  const doubles = type === "Doubles";
  const summary = saveEventImport({ name, date, course, type }, rows, { markMembers: !doubles, teams: doubles });
  revalidatePath("/", "layout");
  return { summary };
}

export type TournamentPreviewState = {
  tournament?: PdgaTournament;
  inClub?: boolean[];
  error?: string;
};

export async function previewPdgaTournamentAction(
  _prev: TournamentPreviewState,
  formData: FormData,
): Promise<TournamentPreviewState> {
  await requireAdmin();
  const id = parseTournamentId(String(formData.get("tournament") ?? ""));
  if (!id) return { error: "Enter a PDGA tournament ID or event URL." };
  try {
    const tournament = await fetchTournament(id);
    return { tournament, inClub: matchMembers(tournament.rows) };
  } catch (err) {
    return { error: `Couldn't load tournament ${id}: ${(err as Error).message}` };
  }
}

export async function importPdgaTournamentAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  await requireAdmin();
  const tournamentId = Number(formData.get("tournamentId"));
  const name = String(formData.get("name") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  const course = String(formData.get("course") ?? "").trim() || null;
  if (!Number.isInteger(tournamentId) || tournamentId <= 0) return { error: "Missing tournament ID." };
  if (!name) return { error: "Event name is required." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Event date is required." };

  const rows = readRows(formData);
  let layouts: LayoutInput[];
  try {
    layouts = JSON.parse(String(formData.get("layouts") ?? "[]"));
    if (!Array.isArray(layouts)) throw new Error();
  } catch {
    layouts = [];
  }
  if (!rows) return { error: "The preview data was invalid. Load the tournament again." };

  const summary = saveEventImport(
    {
      id: `pdga-${tournamentId}`,
      source: "pdga",
      name,
      date,
      course,
      type: readEventType(formData, "Tournament"),
    },
    rows,
    {
      membersOnly: formData.get("membersOnly") === "on" && readEventType(formData, "Tournament") !== "Doubles",
      markMembers: false,
      teams: readEventType(formData, "Tournament") === "Doubles",
    },
    layouts,
  );
  revalidatePath("/", "layout");
  return { summary };
}

export type RefreshState = { summary?: RefreshSummary; error?: string };

export async function refreshPdgaAction(): Promise<RefreshState> {
  await requireAdmin();
  try {
    const summary = await refreshPdgaPlayers();
    revalidatePath("/", "layout");
    return { summary };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export type MemberState = { message?: string; error?: string };

function readMemberForm(formData: FormData) {
  const pdgaRaw = String(formData.get("pdgaNumber") ?? "").trim().replace(/^#/, "");
  return {
    name: String(formData.get("name") ?? "").trim(),
    pdgaNumber: /^\d+$/.test(pdgaRaw) ? Number(pdgaRaw) : null,
    pdgaInvalid: pdgaRaw !== "" && !/^\d+$/.test(pdgaRaw),
    division: String(formData.get("division") ?? "").trim().toUpperCase() || null,
  };
}

export async function addMemberAction(_prev: MemberState, formData: FormData): Promise<MemberState> {
  await requireAdmin();
  const input = readMemberForm(formData);
  if (input.pdgaInvalid) return { error: "PDGA number should be digits only." };

  // Fill in the name and details from PDGA when the API is set up.
  let pdgaPlayer: PdgaPlayer | null = null;
  let lookupNote = "";
  if (input.pdgaNumber !== null && pdgaConfigured()) {
    try {
      pdgaPlayer = await lookupPdgaPlayer(input.pdgaNumber);
      if (!pdgaPlayer) lookupNote = ` PDGA has no player #${input.pdgaNumber}.`;
    } catch (err) {
      lookupNote = ` Couldn't look them up on PDGA: ${(err as Error).message}`;
    }
  }
  const name = input.name || (pdgaPlayer ? pdgaPlayerName(pdgaPlayer) : "");
  if (!name) {
    return {
      error:
        (pdgaConfigured()
          ? "Enter a name or a valid PDGA number."
          : "Enter a name. (PDGA lookup by number needs PDGA_USERNAME and PDGA_PASSWORD.)") + lookupNote,
    };
  }

  const { created } = addMember({ ...input, name });
  if (pdgaPlayer) savePdgaDetails(pdgaPlayer);
  revalidatePath("/", "layout");
  return {
    message:
      (created ? `Added ${name} as a club member.` : `${name} was already in the database and is now a club member.`) +
      (pdgaPlayer ? " Rating and location filled in from PDGA." : "") +
      lookupNote,
  };
}

export async function updatePlayerAction(_prev: MemberState, formData: FormData): Promise<MemberState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const input = readMemberForm(formData);
  if (!id) return { error: "Missing player." };
  if (!input.name) return { error: "Name can't be blank." };
  if (input.pdgaInvalid) return { error: "PDGA number should be digits only." };
  try {
    updatePlayer(id, { ...input, member: formData.get("member") === "on" });
  } catch (err) {
    return { error: (err as Error).message };
  }
  revalidatePath("/", "layout");
  return { message: "Saved." };
}

export async function deletePlayerAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (id) deletePlayer(id);
  revalidatePath("/", "layout");
}

export async function setEventTypeAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const type = readEventType(formData, "Tournament");
  if (id) setEventType(id, type);
  revalidatePath("/", "layout");
}
