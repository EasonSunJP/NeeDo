import {
  affiliateRiskEventWhere,
  assertExactBaselinePrefix,
  assertTimestampOrder,
  assertTimestampWithinRace
} from "../scripts/lib/affiliate-expiry-race-evidence";

describe("affiliate expiry race evidence", () => {
  const startedAt = new Date("2026-08-26T01:00:00.100Z");
  const settledAt = new Date("2026-08-26T01:00:00.900Z");

  it("rejects missing or out-of-bound winner timestamps", () => {
    expect(() =>
      assertTimestampWithinRace(startedAt, startedAt, settledAt, "lower bound")
    ).not.toThrow();
    expect(() =>
      assertTimestampWithinRace(settledAt, startedAt, settledAt, "upper bound")
    ).not.toThrow();
    expect(() => assertTimestampWithinRace(null, startedAt, settledAt, "missing")).toThrow(
      "missing timestamp is missing"
    );
    expect(() =>
      assertTimestampWithinRace(
        new Date("2026-08-26T01:00:00.099Z"),
        startedAt,
        settledAt,
        "before"
      )
    ).toThrow("before timestamp is outside race bounds");
    expect(() =>
      assertTimestampWithinRace(new Date("2026-08-26T01:00:00.901Z"), startedAt, settledAt, "after")
    ).toThrow("after timestamp is outside race bounds");
  });

  it("rejects reversed timestamp ordering", () => {
    expect(() => assertTimestampOrder(startedAt, settledAt, "ordered")).not.toThrow();
    expect(() => assertTimestampOrder(settledAt, startedAt, "reversed")).toThrow(
      "reversed timestamps are out of order"
    );
  });

  it("rejects a mutated or replaced exact baseline prefix", () => {
    const baseline = [
      { id: 10, amount: 100, metadata: { scope: "booking" } },
      { id: 11, amount: 500, metadata: { scope: "affiliate" } }
    ];
    expect(() =>
      assertExactBaselinePrefix(baseline, [...baseline, { id: 12, amount: 1 }], "preserved")
    ).not.toThrow();
    expect(() =>
      assertExactBaselinePrefix(baseline, [baseline[0], { ...baseline[1], amount: 501 }], "mutated")
    ).toThrow("mutated baseline prefix changed");
    expect(() =>
      assertExactBaselinePrefix(baseline, [{ ...baseline[0], id: 99 }, baseline[1]], "replaced")
    ).toThrow("replaced baseline prefix changed");
  });

  it("rejects a malformed baseline before comparing an exact prefix", () => {
    expect(() =>
      assertExactBaselinePrefix(null as unknown as readonly { id: number }[], [], "timeline")
    ).toThrow("timeline baseline is not an array");
  });

  it("includes a reward-only risk event in the database snapshot scope", () => {
    expect(
      affiliateRiskEventWhere({
        taskId: 21,
        claimId: 22,
        attributionId: 23,
        rewardIds: [24, 25]
      })
    ).toEqual({
      OR: [{ taskId: 21 }, { claimId: 22 }, { attributionId: 23 }, { rewardId: { in: [24, 25] } }]
    });
  });
});
