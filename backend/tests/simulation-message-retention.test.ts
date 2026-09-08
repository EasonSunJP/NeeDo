import { resolveSimulationMessageExpiresAt } from "../src/simulation/simulation-message-retention";

describe("simulation message retention", () => {
  const seededAt = new Date("2026-09-08T12:00:00.000Z");

  it("starts a historical fixture's retention window when the fixture is seeded", () => {
    expect(
      resolveSimulationMessageExpiresAt({
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        seededAt,
        retentionSeconds: 30 * 24 * 60 * 60
      })
    ).toEqual(new Date("2026-10-08T12:00:00.000Z"));
  });

  it("keeps a future fixture anchored to its authored timestamp", () => {
    expect(
      resolveSimulationMessageExpiresAt({
        createdAt: new Date("2026-09-10T12:00:00.000Z"),
        seededAt,
        retentionSeconds: 60
      })
    ).toEqual(new Date("2026-09-10T12:01:00.000Z"));
  });

  it("preserves an unlimited retention policy", () => {
    expect(
      resolveSimulationMessageExpiresAt({
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        seededAt,
        retentionSeconds: null
      })
    ).toBeNull();
  });
});
