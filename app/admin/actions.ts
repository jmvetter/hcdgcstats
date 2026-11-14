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
import { fetchUdiscEvent, parseUdiscEventUrl } from "@/lib/udisc-event";

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const ok = await logIn(String(formData.get("password") ?? ""));
  if (!ok) return { error: "Wrong password." };
  // The check-in screen has its own login, so refresh everything.
  revalidatePath("/", "layout");
  return {};
}

export async function logoutAction(): Promise<void> {
  await logOut();
  revalidatePath("/admin");
}

export type PreviewState = {
  preview?: ParsedExport;
  fileName?: string;
  // The layout UDisc's event page lists for each tab of the export, when a
  // link was given and the tab's divisions all played the same one.
  udiscLayouts?: (LayoutInput | null)[];
  error?: string;
};

export async function previewUdiscAction(_prev: PreviewState, formData: FormData): Promise<PreviewState> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a UDisc export file." };
  let preview: ParsedExport;
  try {
    preview = await parseUdiscExport(file);
  } catch (err) {
    return { error: `Couldn't read ${file.name}: ${(err as Error).message}` };
  }

  // The export has no layout details; the event's UDisc page does.
  const link = String(formData.get("eventUrl") ?? "").trim();
  if (!link) return { preview, fileName: file.name };
  const slug = parseUdiscEventUrl(link);
  if (!slug) {
    preview.warnings.push("That doesn't look like a udisc.com/events/… link, so no layouts were loaded.");
    return { preview, fileName: file.name };
  }
  try {
    const event = await fetchUdiscEvent(slug, [...new Set(preview.sheets.map((sh) => sh.round))]);
    preview.suggested = {
      name: event.name ?? preview.suggested.name,
      date: event.date ?? preview.suggested.date,
      doubles: event.teams || preview.suggested.doubles,
    };
    const udiscLayouts = preview.sheets.map((sh) => {
      const byDivision = event.layouts.get(sh.round) ?? {};
      const found = sh.divisions.map((d) => byDivision[d]);
      const ids = new Set(found.map((l) => l?.id));
      if (found.length > 0 && ids.size === 1 && found[0]) return found[0];
      preview.warnings.push(
        found.some(Boolean)
          ? `${sh.name}: its divisions played different layouts on UDisc, so choose one by hand.`
          : `${sh.name}: no layout found on UDisc for ${sh.divisions.join(", ") || "its entries"}.`,
      );
      return null;
    });
    return { preview, fileName: file.name, udiscLayouts };
  } catch (err) {
    preview.warnings.push(`Couldn't load layouts from UDisc: ${(err as Error).message}`);
    return { preview, fileName: file.name };
  }
}

// A layout the preview read from UDisc, sent back in a hidden field.
function readUdiscLayout(value: FormDataEntryValue | null): LayoutInput | null {
  try {
    const l = JSON.parse(String(value ?? ""));
    const ok =
      typeof l?.id === "string" && l.id.startsWith("udisc-") &&
      typeof l.course === "string" && l.course && typeof l.name === "string" && l.name &&
      Array.isArray(l.holeDetails);
    return ok ? { ...l, pdgaLayoutId: null } : null;
  } catch {
    return null;
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

  // The form has a layout picker per tab of the export (pools can play
  // different layouts), with fields suffixed by the tab's index. Everything is
  // checked before any new layout is created.
  const sheetCount = Math.max(0, ...rows.flatMap((row) => row.rounds.map((r) => r.sheet ?? 0))) + 1;
  type Choice = { id: string } | { create: Parameters<typeof createLayout>[0] } | { udisc: LayoutInput } | "same";
  const choices: Choice[] = [];
  for (let i = 0; i < sheetCount; i++) {
    const field = (name: string) => formData.get(`${name}.${i}`);
    const choice = String(field("layoutId") ?? "");
    if (choice === "same" && i > 0) {
      choices.push("same");
    } else if (choice === "udisc") {
      const udisc = readUdiscLayout(field("layoutUdisc"));
      if (!udisc) return { error: "The UDisc layout data was invalid. Upload the file again." };
      choices.push({ udisc });
    } else if (choice === "new") {
      const course = String(field("layoutCourse") ?? "").trim();
      const layoutName = String(field("layoutName") ?? "").trim();
      if (!course || !layoutName) return { error: "Enter each new layout's course and name." };
      choices.push({
        create: { course, name: layoutName, holes: optionalInt(field("layoutHoles")), par: optionalInt(field("layoutPar")) },
      });
    } else if (findLayout(choice)) {
      choices.push({ id: choice });
    } else {
      return { error: "Choose the layout each tab was played on." };
    }
  }
  // Layouts read from UDisc are saved along with the event.
  const udiscLayouts = new Map<string, LayoutInput>();
  const layoutIds: string[] = [];
  const courses = new Set<string | null>();
  for (const c of choices) {
    if (c === "same") {
      layoutIds.push(layoutIds[0]);
    } else if ("udisc" in c) {
      udiscLayouts.set(c.udisc.id, c.udisc);
      layoutIds.push(c.udisc.id);
      courses.add(c.udisc.course);
    } else {
      const id = "id" in c ? c.id : createLayout(c.create);
      layoutIds.push(id);
      courses.add(findLayout(id)?.course ?? null);
    }
  }
  for (const row of rows) for (const r of row.rounds) r.layoutId = layoutIds[r.sheet ?? 0];
  // With more than one course in play, the event isn't at any single one.
  const course = courses.size === 1 ? [...courses][0] : null;

  // Club events make everyone a member, except doubles, whose entries are teams.
  const doubles = type === "Doubles";
  const summary = saveEventImport(
    { name, date, course, type },
    rows,
    { markMembers: !doubles, teams: doubles },
    [...udiscLayouts.values()],
  );
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
