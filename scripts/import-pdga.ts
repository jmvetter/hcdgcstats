// Imports a PDGA tournament or league from the command line, the same way the
// admin page does. Handy on the server over SSH, where there's no browser:
//   pnpm import:pdga 108113              # everyone in the event
//   pnpm import:pdga 108113 --members    # club members only
//   pnpm import:pdga 108113 --type=league
// Uses DATABASE_PATH if set, otherwise data/hcdgc.db.
import { saveEventImport } from "../lib/importer";
import { fetchTournament, parseTournamentId } from "../lib/pdga-live";

async function main() {
  const args = process.argv.slice(2);
  const id = parseTournamentId(args.find((a) => !a.startsWith("--")) ?? "");
  if (!id) {
    console.error("usage: pnpm import:pdga <tournament id or pdga.com URL> [--members] [--type=league|tournament]");
    process.exit(1);
  }
  const typeArg = args.find((a) => a.startsWith("--type="))?.split("=")[1];
  const membersOnly = args.includes("--members");

  const t = await fetchTournament(id);
  const type = typeArg === "league" ? "League" : typeArg === "tournament" ? "Tournament" : t.type;
  const summary = saveEventImport(
    { id: `pdga-${id}`, source: "pdga", name: t.name, date: t.date, course: t.course, type },
    t.rows,
    { membersOnly, markMembers: false },
    t.layouts,
  );
  console.log(
    `${t.name} (${type}): imported ${summary.results} results, ${summary.rounds} rounds` +
      (summary.newPlayers.length ? `, ${summary.newPlayers.length} new players` : "") +
      (summary.skipped ? `, skipped ${summary.skipped} non-members` : ""),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
