// Match play status from hole results. Safe to use from client components, so
// the scoring screen can update the moment a hole is tapped.

export type HoleResult = "A" | "B" | "H"; // side A took it, side B took it, or halved

export type MatchStatus = {
  played: number;
  remaining: number;
  lead: number; // holes up for the leader; 0 is all square
  leader: "A" | "B" | null;
  finished: boolean; // clinched early, or every hole played
  dormie: boolean; // up by exactly the holes left
};

// Holes can be played in any order (shotgun starts), so only the count of
// holes played matters, not which ones.
export function matchStatus(results: (HoleResult | null)[]): MatchStatus {
  const played = results.filter(Boolean).length;
  const diff = results.filter((r) => r === "A").length - results.filter((r) => r === "B").length;
  const remaining = results.length - played;
  const lead = Math.abs(diff);
  return {
    played,
    remaining,
    lead,
    leader: diff > 0 ? "A" : diff < 0 ? "B" : null,
    finished: remaining === 0 || lead > remaining,
    dormie: remaining > 0 && lead === remaining,
  };
}

// "Team A 2 up", "All square", "Team A wins 3 & 2", "Match halved".
export function statusHeadline(s: MatchStatus, sideA: string, sideB: string): string {
  const leader = s.leader === "A" ? sideA : sideB;
  if (s.finished) {
    if (!s.leader) return "Match halved";
    return s.remaining > 0 ? `${leader} wins ${s.lead} & ${s.remaining}` : `${leader} wins ${s.lead} up`;
  }
  if (s.played === 0) return "Not started";
  return s.leader ? `${leader} ${s.lead} up` : "All square";
}

// "5 holes played, 13 to go", plus "dormie" when it applies.
export function statusDetail(s: MatchStatus): string {
  if (s.finished) return `Final after ${s.played} ${s.played === 1 ? "hole" : "holes"}`;
  if (s.played === 0) return `${s.remaining} holes to play`;
  return `${s.played} played, ${s.remaining} to go${s.dormie ? " · dormie" : ""}`;
}

// A finished match is worth a point: 1 to the winner, or ½ each when halved.
export function matchPoints(s: MatchStatus): { a: number; b: number } | null {
  if (!s.finished) return null;
  if (!s.leader) return { a: 0.5, b: 0.5 };
  return s.leader === "A" ? { a: 1, b: 0 } : { a: 0, b: 1 };
}

// A team matchup's points from its finished matches, and how many are still playing.
export function teamTotals(matches: { results: (HoleResult | null)[] }[]): { a: number; b: number; live: number } {
  let a = 0;
  let b = 0;
  let live = 0;
  for (const m of matches) {
    const points = matchPoints(matchStatus(m.results));
    if (points) {
      a += points.a;
      b += points.b;
    } else live++;
  }
  return { a, b, live };
}
