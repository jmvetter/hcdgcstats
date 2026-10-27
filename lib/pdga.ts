import "server-only";
import { db } from "./db";

// Official PDGA API (https://www.pdga.com/dev/api/rest/v1/services/json).
// Requests need a logged-in session; set PDGA_USERNAME and PDGA_PASSWORD to an
// account PDGA has granted API access to.
const API = "https://api.pdga.com/services/json";

export type PdgaPlayer = {
  pdga_number: string;
  first_name: string;
  last_name: string;
  membership_status?: string;
  classification?: string;
  city?: string;
  state_prov?: string;
  rating?: string;
  rating_effective_date?: string;
};

export function pdgaConfigured(): boolean {
  return Boolean(process.env.PDGA_USERNAME && process.env.PDGA_PASSWORD);
}

async function login(): Promise<{ cookie: string }> {
  const res = await fetch(`${API}/user/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      username: process.env.PDGA_USERNAME,
      password: process.env.PDGA_PASSWORD,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    // PDGA answers a bad login with a JSON array like ["Wrong username or password."]
    const detail = await res.json().then((b) => (Array.isArray(b) ? b.join(" ") : ""), () => "");
    throw new Error(`PDGA login failed (HTTP ${res.status})${detail ? `: ${detail}` : "."}`);
  }
  const body = (await res.json()) as { session_name?: string; sessid?: string };
  if (!body.session_name || !body.sessid) throw new Error("PDGA login returned no session.");
  return { cookie: `${body.session_name}=${body.sessid}` };
}

async function fetchPlayer(cookie: string, pdgaNumber: number): Promise<PdgaPlayer | null> {
  const res = await fetch(`${API}/players?pdga_number=${pdgaNumber}`, {
    headers: { Cookie: cookie, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { players?: PdgaPlayer[] };
  return body.players?.[0] ?? null;
}

export async function lookupPdgaPlayer(pdgaNumber: number): Promise<PdgaPlayer | null> {
  const { cookie } = await login();
  return fetchPlayer(cookie, pdgaNumber);
}

export function pdgaPlayerName(p: PdgaPlayer): string {
  return `${p.first_name} ${p.last_name}`.trim();
}

// Saves PDGA details onto the player with this PDGA number.
export function savePdgaDetails(p: PdgaPlayer) {
  db.prepare(
    `UPDATE players SET rating = ?, rating_date = ?, classification = ?, city = ?,
       state_prov = ?, membership_status = ?, pdga_updated_at = ?
     WHERE pdga_number = ?`,
  ).run(
    p.rating ? Number(p.rating) : null,
    p.rating_effective_date ?? null,
    p.classification ?? null,
    p.city ?? null,
    p.state_prov ?? null,
    p.membership_status ?? null,
    new Date().toISOString(),
    Number(p.pdga_number),
  );
}

export type RefreshSummary = { updated: number; failed: { pdgaNumber: number; error: string }[] };

// Pulls rating, classification, location and membership status for every club
// member with a PDGA number.
export async function refreshPdgaPlayers(): Promise<RefreshSummary> {
  if (!pdgaConfigured()) throw new Error("Set PDGA_USERNAME and PDGA_PASSWORD to use the PDGA API.");
  const { cookie } = await login();

  const players = db
    .prepare("SELECT pdga_number FROM players WHERE pdga_number IS NOT NULL AND member = 1")
    .all() as { pdga_number: number }[];

  const summary: RefreshSummary = { updated: 0, failed: [] };
  for (const { pdga_number } of players) {
    try {
      const p = await fetchPlayer(cookie, pdga_number);
      if (!p) {
        summary.failed.push({ pdgaNumber: pdga_number, error: "Not found" });
        continue;
      }
      savePdgaDetails(p);
      summary.updated++;
    } catch (err) {
      summary.failed.push({ pdgaNumber: pdga_number, error: (err as Error).message });
    }
  }
  return summary;
}
