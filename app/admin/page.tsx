import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { adminConfigured, isAdmin } from "@/lib/auth";
import { getEvents, getLayouts, getPlayers } from "@/lib/data";
import { pdgaConfigured } from "@/lib/pdga";
import { logoutAction } from "./actions";
import { LoginForm, PdgaRefresh, PdgaTournamentImport, UdiscImport } from "./forms";
import { EventList } from "./events";
import { AddMemberForm, PlayerList } from "./members";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false },
};

export default async function AdminPage() {
  // Env vars are read per request, so the page reflects the host's settings.
  await connection();
  if (!adminConfigured()) {
    return (
      <Notice>
        Set <code>ADMIN_PASSWORD</code> in <code>.env.local</code> (or your host&apos;s environment
        variables) and restart the server to enable the import page.
      </Notice>
    );
  }

  if (!(await isAdmin())) {
    return (
      <div className="flex max-w-sm flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Admin login</h1>
        <LoginForm />
      </div>
    );
  }

  const [players, layouts, events] = await Promise.all([getPlayers({ teams: "include" }), getLayouts(), getEvents()]);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <form action={logoutAction}>
          <button className="text-sm text-zinc-500 hover:underline">Log out</button>
        </form>
      </div>

      <Section
        title="League nights"
        description="Check players in and track who's paid, pull in the night's results from PDGA or UDisc, and get each division's payout (top 40% by default)."
      >
        <Link
          href="/admin/league-nights"
          className="self-start rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          Open league nights →
        </Link>
      </Section>

      <Section
        title="Club members"
        description={
          pdgaConfigured()
            ? "Add a member by name or PDGA number. With a PDGA number, their name, rating and location are filled in from PDGA. Players from UDisc club events become members automatically; players from outside PDGA tournaments don't."
            : "Add a member by name, with their PDGA number if they have one. Players from UDisc club events become members automatically; players from outside PDGA tournaments don't."
        }
      >
        <AddMemberForm pdgaLookup={pdgaConfigured()} />
        <PlayerList players={players} />
      </Section>

      <Section
        title="Events"
        description="A League counts each round (each week) as a separate finish; a Tournament counts only the final place. Change an event's type here at any time. Events imported before round places were tracked need to be imported again for their weekly places to appear."
      >
        <EventList events={events} />
      </Section>

      <Section
        title="UDisc results"
        description="In UDisc, open the event and go to Event tools → Leaderboard → Actions → Export. Upload that file here (XLSX or CSV) and pick the layout that was played. You'll see a preview before anything is saved. Importing the same event again replaces its results."
      >
        <UdiscImport layouts={layouts} />
      </Section>

      <Section
        title="PDGA tournament"
        description="Imports final results for every division of a PDGA-sanctioned tournament from PDGA Live (no login needed). Paste the tournament ID or its pdga.com event URL. For outside events, tick “only import club members” to skip everyone else. Players added from a tournament aren't marked as club members. Importing the same tournament again replaces its results."
      >
        <PdgaTournamentImport />
      </Section>

      <Section
        title="PDGA player info"
        description="Updates rating, classification, location and membership status for every club member with a PDGA number, using the official PDGA API."
      >
        {pdgaConfigured() ? (
          <PdgaRefresh />
        ) : (
          <Notice>
            Set <code>PDGA_USERNAME</code> and <code>PDGA_PASSWORD</code> to a PDGA account with API
            access to enable this.
          </Notice>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      {children}
    </p>
  );
}
