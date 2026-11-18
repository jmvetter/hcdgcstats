import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getPuttingConfig, PUTTING_CONFIGS, type PuttingConfig } from "./putting-config";
import {
  emptyPutts,
  maxDistanceScore,
  maxRoundScore,
  maxStationScore,
  normalizePutts,
  rankCards,
  scoreCard,
  scoreDistance,
  type Putt,
  type Putts,
} from "./putting-score";

const config = getPuttingConfig(1);
const [d1, d2, d3] = config.distances;

// Putts made at the given 1-based positions out of 6; everything else a miss.
const made = (...positions: number[]): Putt[] =>
  Array.from({ length: 6 }, (_, i) => (positions.includes(i + 1) ? "make" : "miss"));
const all = (value: Putt): Putt[] => Array(6).fill(value);
const round = (fill: (station: number, distance: number) => Putt[]): Putts =>
  Array.from({ length: config.stations }, (_, s) => config.distances.map((_, d) => fill(s, d)));

describe("putting scoring", () => {
  it("scores a perfect round as 372", () => {
    assert.equal(scoreCard(round(() => all("make")), config).total, 372);
  });

  it("scores a round of all misses as 0", () => {
    const score = scoreCard(round(() => all("miss")), config);
    assert.equal(score.total, 0);
    assert.equal(score.complete, true);
  });

  it("scores D1 with putts 1, 3, 4 and 6 made as 10", () => {
    assert.equal(scoreDistance(made(1, 3, 4, 6), d1).score, 4 * 2 + 1 + 1);
  });

  it("scores D3 with all six made as 42", () => {
    assert.equal(scoreDistance(all("make"), d3).score, 24 + 3 + 3 + 12);
  });

  it("scores D2 with putts 2 to 5 made as 12, with no bonuses", () => {
    const s = scoreDistance(made(2, 3, 4, 5), d2);
    assert.equal(s.score, 12);
    assert.equal(s.bonus, 0);
  });

  it("scores a station with D1 all made, D2 none and D3 only putt 6 as 27", () => {
    const putts = emptyPutts(config);
    putts[0] = [all("make"), all("miss"), made(6)];
    assert.equal(scoreCard(putts, config).stations[0].total, 20 + 0 + (4 + 3));
  });

  it("matches the maximums: D1 20, D2 31, D3 42, station 93, round 372", () => {
    assert.deepEqual(
      config.distances.map((r) => maxDistanceScore(r, config.puttsPerDistance)),
      [20, 31, 42],
    );
    assert.equal(maxStationScore(config), 93);
    assert.equal(maxRoundScore(config), 372);
  });

  it("treats a blank putt differently from a miss", () => {
    const putts = emptyPutts(config);
    putts[0][0] = ["make", null, "make", "make", null, "make"];
    const s = scoreCard(putts, config);
    assert.equal(s.stations[0].distances[0].score, 4 * 2 + 1 + 1); // no all-six bonus
    assert.equal(s.entered, 4);
    assert.equal(s.blanks, 72 - 4);
    assert.equal(s.complete, false);
    // Marking the blanks as misses scores the same but completes the distance.
    putts[0][0] = ["make", "miss", "make", "make", "miss", "make"];
    assert.equal(scoreCard(putts, config).stations[0].distances[0].score, 10);
  });

  it("does not give the last-putt or all-six bonus for a blank last putt", () => {
    assert.equal(scoreDistance(["make", "make", "make", "make", "make", null], d1).score, 5 * 2 + 1);
  });

  it("scores a night with the rules it was played under after the points change", () => {
    const later: PuttingConfig = {
      ...config,
      version: 2,
      distances: config.distances.map((r) => ({ ...r, pointsPerMake: r.pointsPerMake + 1 })),
    };
    PUTTING_CONFIGS[2] = later;
    try {
      const putts = round(() => all("make"));
      assert.equal(scoreCard(putts, getPuttingConfig(1)).total, 372);
      assert.ok(scoreCard(putts, getPuttingConfig(2)).total > 372);
    } finally {
      delete PUTTING_CONFIGS[2];
    }
  });

  it("reads stored putts, treating anything unrecognized as blank", () => {
    const putts = normalizePutts([[["make", "miss", "nope", 1]]], config);
    assert.deepEqual(putts[0][0], ["make", "miss", null, null, null, null]);
    assert.equal(putts.length, 4);
    assert.equal(normalizePutts("garbage", config)[3][2].length, 6);
  });

  it("ranks the highest total first, with ties sharing a place and the money for it", () => {
    const cards = [
      { name: "a", score: { total: 10 } },
      { name: "b", score: { total: 30 } },
      { name: "c", score: { total: 30 } },
    ];
    const ranked = rankCards(cards, [10, 6]);
    assert.deepEqual(
      ranked.map((r) => [r.card.name, r.place, r.tied, r.total, r.payout]),
      [
        ["b", 1, true, 30, 8],
        ["c", 1, true, 30, 8],
        ["a", 3, false, 10, 0],
      ],
    );
  });
});
