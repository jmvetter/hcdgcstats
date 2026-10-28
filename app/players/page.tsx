import type { Metadata } from "next";
import Link from "next/link";
import { DivisionFilter } from "@/app/components/division-filter";
import { TypeFilter } from "@/app/components/type-filter";
import {
  getDivisions,
  getPlayerStats,
  getPlayers,
  parseTypeFilter,
  type EventType,
  type Player,
  type PlayerStats,
} from "@/lib/data";

export const metadata: Metadata = {
  title: "Players",
};

type Row = { player: Player; stats: PlayerStats };
type Dir = "asc" | "desc";

// Each sortable column: how to read its value, and which direction a first
// click sorts in (best first: low places, high ratings and counts).
const COLUMNS = {
  name: { label: "Player", align: "left", firstDir: "asc", value: (r: Row) => r.player.name.toLowerCase() },
  division: { label: "Division", align: "left", firstDir: "asc", value: (r: Row) => r.player.division },
  rating: { label: "Rating", align: "right", firstDir: "desc", value: (r: Row) => r.player.rating },
  finishes: { label: "Finishes", align: "right", firstDir: "desc", value: (r: Row) => r.stats.finishes },
  wins: { label: "Wins", align: "right", firstDir: "desc", value: (r: Row) => r.stats.wins },
  avgPlace: { label: "Avg place", align: "right", firstDir: "asc", value: (r: Row) => r.stats.avgPlace },
  avgRating: { label: "Avg round rating", align: "right", firstDir: "desc", value: (r: Row) => r.stats.avgRating },
} satisfies Record<
  string,
  { label: string; align: "left" | "right"; firstDir: Dir; value: (r: Row) => string | number | null }
>;

type SortKey = keyof typeof COLUMNS;

function sortRows(rows: Row[], key: SortKey, dir: Dir): Row[] {
  const value = COLUMNS[key].value;
  return [...rows].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    // Missing values always go last, whichever way the column is sorted.
    if (va === null && vb === null) return a.player.name.localeCompare(b.player.name);
    if (va === null) return 1;
    if (vb === null) return -1;
    const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
    return (dir === "asc" ? cmp : -cmp) || a.player.name.localeCompare(b.player.name);
  });
}

export default async function PlayersPage({ searchParams }: PageProps<"/players">) {
  const query = await searchParams;
  // Club members by default; ?all=1 also shows players from outside tournaments.
  const showAll = query.all === "1";
  const sort: SortKey = typeof query.sort === "string" && query.sort in COLUMNS ? (query.sort as SortKey) : "name";
  const dir: Dir = query.dir === "asc" || query.dir === "desc" ? query.dir : COLUMNS[sort].firstDir;
  // ?type=league or ?type=tournament limits every stat to that kind of event.
  const type = parseTypeFilter(query.type);
  // ?division=MA2 limits the grid to finishes played in that division. With a
  // division or type filter on, only players with matching finishes are listed.
  const divisions = await getDivisions();
  const division = typeof query.division === "string" && divisions.includes(query.division) ? query.division : undefined;

  const players = await getPlayers({ membersOnly: !showAll });
  const allRows = await Promise.all(
    players.map(async (player) => ({ player, stats: await getPlayerStats(player.id, { type, division }) })),
  );
  const filtered = Boolean(division || type);
  const rows = sortRows(filtered ? allRows.filter((r) => r.stats.finishes > 0) : allRows, sort, dir);

  const href = (changes: {
    all?: boolean;
    sort?: SortKey;
    dir?: Dir;
    type?: EventType | null;
    division?: string | null;
  }) => {
    const qs = new URLSearchParams();
    if (changes.all ?? showAll) qs.set("all", "1");
    const t = changes.type === undefined ? type : changes.type;
    if (t) qs.set("type", t.toLowerCase());
    const dv = changes.division === undefined ? division : changes.division;
    if (dv) qs.set("division", dv);
    const s = changes.sort ?? sort;
    const d = changes.dir ?? dir;
    if (s !== "name" || d !== "asc") {
      qs.set("sort", s);
      qs.set("dir", d);
    }
    const str = qs.toString();
    return `/players${str ? `?${str}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{showAll ? "All players" : "Club members"}</h1>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <DivisionFilter
            value={division ?? ""}
            options={[
              { label: "All divisions", value: "", href: href({ division: null }) },
              ...divisions.map((d) => ({ label: d, value: d, href: href({ division: d }) })),
            ]}
          />
          <TypeFilter type={type} href={(t) => href({ type: t })} />
          <Link href={href({ all: !showAll })} className="text-zinc-500 hover:underline">
            {showAll ? "Show club members only" : "Show all players"}
          </Link>
        </div>
      </div>
      <p className="-mt-3 text-sm text-zinc-500">
        Each league round (week) counts as a finish; tournaments count their final place.
      </p>

      {rows.length === 0 ? (
        <p className="text-zinc-500">
          {filtered ? (
            <>
              No {showAll ? "players" : "club members"} with {type ? `${type.toLowerCase()} ` : ""}finishes
              {division ? ` in ${division}` : ""}.
            </>
          ) : (
            <>
              No {showAll ? "players" : "club members"} yet. Add them on the{" "}
              <Link href="/admin" className="underline">admin page</Link>.
            </>
          )}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
              <tr>
                {(Object.keys(COLUMNS) as SortKey[]).map((key) => {
                  const col = COLUMNS[key];
                  const active = key === sort;
                  // Clicking the active column flips it; another column starts at its usual direction.
                  const nextDir: Dir = active ? (dir === "asc" ? "desc" : "asc") : col.firstDir;
                  return (
                    <th
                      key={key}
                      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
                      className={`px-4 py-3 font-medium ${col.align === "right" ? "text-right" : ""}`}
                    >
                      <Link
                        href={href({ sort: key, dir: nextDir })}
                        scroll={false}
                        className={`inline-flex items-center gap-1 hover:text-black dark:hover:text-white ${
                          active ? "text-black dark:text-white" : ""
                        }`}
                      >
                        {col.label}
                        <span aria-hidden className={active ? "" : "invisible"}>
                          {dir === "asc" ? "▲" : "▼"}
                        </span>
                      </Link>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
              {rows.map(({ player, stats }) => (
                <tr key={player.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900">
                  <td className="px-4 py-3">
                    <Link href={`/players/${player.id}`} className="font-medium hover:underline">
                      {player.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{division ?? player.division ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{player.rating ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{stats.finishes}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{stats.wins}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{stats.avgPlace?.toFixed(1) ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {stats.avgRating !== null ? Math.round(stats.avgRating) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
