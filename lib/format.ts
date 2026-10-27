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
