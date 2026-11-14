import "server-only";
import { createHash } from "node:crypto";
import type { LayoutInput } from "./layouts";

// Reads an event's layouts from its public UDisc page. The leaderboard export
// has scores but nothing about the layout, while the event page knows the
// layout each division played, hole by hole (par and distance). Divisions can
// share one UDisc layout and still differ on a hole (a different tee, say), so
// layouts here are told apart by their holes, not by UDisc's layout id.
//
// UDisc has no public API for this. The data is read from the page's embedded
// loader data, which can change without notice, so callers treat a failure as
// "no layouts found" and fall back to choosing layouts by hand.

export type UdiscEvent = {
  name: string | null;
  date: string | null; // YYYY-MM-DD
  course: string | null;
  teams: boolean;
  // Per round number, the layout each division played.
  layouts: Map<number, Record<string, LayoutInput>>;
};

const FEET_PER_METER = 3.28084;

// "https://udisc.com/events/2026-byop-glowing-gibbs-doubles-Tmkl4T/leaderboard?round=1" → the slug.
export function parseUdiscEventUrl(input: string): string | null {
  return input.trim().match(/udisc\.com\/events\/([A-Za-z0-9-]+)/)?.[1] ?? null;
}

export async function fetchUdiscEvent(slug: string, rounds: number[]): Promise<UdiscEvent> {
  const event: UdiscEvent = { name: null, date: null, course: null, teams: false, layouts: new Map() };
  for (const round of rounds.length ? rounds : [1]) {
    const url = `https://udisc.com/events/${slug}/leaderboard?round=${round}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`UDisc returned ${res.status} for ${url}`);
    const data = readLoaderData(await res.text());
    const page = data["routes/events/$slug"];
    const leaderboard = data["routes/events/$slug/leaderboard"];
    const listing = leaderboard?.eventListing ?? page?.eventListing;
    const course = page?.courses?.[0]?.name ?? null;
    event.name ??= listing?.name ?? null;
    event.date ??= /^\d{4}-\d{2}-\d{2}$/.test(listing?.startDate ?? "") ? listing.startDate : null;
    event.course ??= course;
    event.teams ||= listing?.scoring?.playFormat === "teams";

    const lookup = leaderboard?.divisionLayoutLookup;
    if (!lookup || typeof lookup !== "object") continue;
    const byDivision: Record<string, LayoutInput> = {};
    for (const [division, layout] of Object.entries(lookup)) {
      const parsed = toLayout(layout, course);
      if (parsed) byDivision[division] = parsed;
    }
    event.layouts.set(round, byDivision);
  }
  if (event.layouts.size === 0 || [...event.layouts.values()].every((l) => Object.keys(l).length === 0)) {
    throw new Error("No layouts found on the UDisc event page.");
  }
  return event;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toLayout(layout: any, course: string | null): LayoutInput | null {
  if (!course || !Array.isArray(layout?.holes) || layout.holes.length === 0) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const holeDetails = layout.holes.map((h: any, i: number) => ({
    label: String(h?.name ?? i + 1),
    par: typeof h?.par === "number" ? h.par : null,
    length: typeof h?.distance === "number" ? Math.round(h.distance * FEET_PER_METER) : null,
  }));
  const total = (key: "par" | "length") =>
    holeDetails.every((h: { par: number | null; length: number | null }) => h[key] !== null)
      ? holeDetails.reduce((sum: number, h: { par: number | null; length: number | null }) => sum + h[key]!, 0)
      : null;
  // The same holes always get the same id, so importing again reuses the layout.
  const holeKey = holeDetails.map((h: { par: number | null; length: number | null }) => `${h.par}/${h.length}`).join(",");
  const hash = createHash("sha1").update(holeKey).digest("hex").slice(0, 8);
  return {
    id: `udisc-${layout.layoutId ?? "layout"}-${hash}`,
    pdgaLayoutId: null,
    course,
    name: String(layout.name ?? "").trim() || "UDisc layout",
    holes: holeDetails.length,
    par: total("par"),
    length: total("length"),
    units: "Feet",
    holeDetails,
  };
}

// The page streams its loader data as `streamController.enqueue("<json string>")`
// script chunks. The first line of that stream is one flat JSON array in which
// objects and arrays refer to their keys and values by index.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readLoaderData(html: string): Record<string, any> {
  let stream = "";
  for (const m of html.matchAll(/streamController\.enqueue\(("(?:[^"\\]|\\.)*")\)/g)) {
    stream += JSON.parse(m[1]);
  }
  const firstLine = stream.split("\n")[0];
  if (!firstLine) throw new Error("Couldn't find the event data on the UDisc page.");
  const flat: unknown[] = JSON.parse(firstLine);
  const seen = new Map<number, unknown>();
  const decode = (i: number): unknown => {
    if (i < 0) return null; // undefined, null, NaN and friends
    if (seen.has(i)) return seen.get(i);
    const v = flat[i];
    if (Array.isArray(v)) {
      // ["D", 1792798282372] and similar are dates, promises, etc.: not needed.
      if (typeof v[0] === "string") return null;
      const out: unknown[] = [];
      seen.set(i, out);
      for (const x of v) out.push(decode(x as number));
      return out;
    }
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      seen.set(i, out);
      for (const [k, x] of Object.entries(v)) out[String(flat[Number(k.slice(1))])] = decode(x as number);
      return out;
    }
    return v;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const root = decode(0) as any;
  if (!root?.loaderData) throw new Error("Couldn't read the event data on the UDisc page.");
  return root.loaderData;
}
