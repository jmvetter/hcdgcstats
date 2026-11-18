// Putting league scoring rules. Every point value, and the number of stations,
// distances and putts, comes from here so the rules can be tuned in one place.
//
// Rules are versioned. Each putting night records the version it was scored
// with, so changing the points means adding a new version below (and pointing
// CURRENT_PUTTING_CONFIG_VERSION at it); nights already played keep their
// scores. Never edit a version that has been used.
//
// Plain TypeScript with no server imports, so the scorecards can use it too.

export type DistanceRule = {
  label: string; // "D1"
  name: string; // "Short"
  pointsPerMake: number;
  firstPuttBonus: number; // putt 1 at this distance is made
  lastPuttBonus: number; // the last putt at this distance is made
  allMadeBonus: number; // every putt at this distance is made, on top of the other bonuses
};

export type PuttingConfig = {
  version: number;
  stations: number;
  puttsPerDistance: number;
  setSize: number; // putts are thrown in sets, e.g. 2 putts at a time
  distances: DistanceRule[];
};

export const PUTTING_CONFIGS: Record<number, PuttingConfig> = {
  1: {
    version: 1,
    stations: 4,
    puttsPerDistance: 6,
    setSize: 2,
    distances: [
      { label: "D1", name: "Short", pointsPerMake: 2, firstPuttBonus: 1, lastPuttBonus: 1, allMadeBonus: 6 },
      { label: "D2", name: "Mid", pointsPerMake: 3, firstPuttBonus: 2, lastPuttBonus: 2, allMadeBonus: 9 },
      { label: "D3", name: "Long", pointsPerMake: 4, firstPuttBonus: 3, lastPuttBonus: 3, allMadeBonus: 12 },
    ],
  },
};

export const CURRENT_PUTTING_CONFIG_VERSION = 1;

// The rules a night was scored with. An unknown version (a database from a
// newer copy of the site, say) falls back to the current rules.
export function getPuttingConfig(version: number = CURRENT_PUTTING_CONFIG_VERSION): PuttingConfig {
  return PUTTING_CONFIGS[version] ?? PUTTING_CONFIGS[CURRENT_PUTTING_CONFIG_VERSION];
}
