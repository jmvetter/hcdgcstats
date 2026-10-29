// Display helpers, safe to use from both server and client components.

export function formatToPar(n: number | null, digits = 0): string {
  if (n === null) return "—";
  const rounded = Number(n.toFixed(digits));
  if (rounded === 0) return "E";
  return rounded > 0 ? `+${n.toFixed(digits)}` : n.toFixed(digits);
}

export function formatDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Links to pdga.com, which PDGA requires wherever its player and event data is shown.
export function pdgaPlayerUrl(pdgaNumber: number | null): string | null {
  return pdgaNumber ? `https://www.pdga.com/player/${pdgaNumber}` : null;
}

// Only events imported from PDGA (ids like "pdga-88276") have a pdga.com page.
export function pdgaEventUrl(eventId: string): string | null {
  const m = eventId.match(/^pdga-(\d+)$/);
  return m ? `https://www.pdga.com/tour/event/${m[1]}` : null;
}
