import { resolveDashboardWindow } from "../src/domain/dashboard-period";

const now = new Date("2026-08-31T03:00:00.000Z");

describe("dashboard reporting windows", () => {
  it.each([
    ["today", "hour", "2026-08-31", "2026-08-31", 24],
    ["last7days", "day", "2026-08-25", "2026-08-31", 7],
    ["last30days", "day", "2026-08-02", "2026-08-31", 30],
    ["week", "day", "2026-08-31", "2026-09-06", 7],
    ["month", "day", "2026-08-01", "2026-08-31", 31],
    ["year", "month", "2026-01-01", "2026-12-31", 12]
  ] as const)("resolves %s in Tokyo", (period, granularity, from, to, buckets) => {
    const result = resolveDashboardWindow({ period }, now);

    expect(result).toMatchObject({ period, granularity, fromDate: from, toDate: to });
    expect(result.buckets).toHaveLength(buckets);
  });

  it("starts weeks on Monday in Tokyo", () => {
    const result = resolveDashboardWindow({ period: "week" }, new Date("2026-09-02T03:00:00.000Z"));

    expect(result).toMatchObject({ fromDate: "2026-08-31", toDate: "2026-09-06" });
  });

  it("retains leap day in an inclusive custom window", () => {
    const result = resolveDashboardWindow(
      { period: "custom", from: "2024-02-28", to: "2024-03-01" },
      now
    );

    expect(result).toMatchObject({
      fromDate: "2024-02-28",
      toDate: "2024-03-01",
      fromInclusive: new Date("2024-02-27T15:00:00.000Z"),
      toExclusive: new Date("2024-03-01T15:00:00.000Z")
    });
    expect(result.buckets.map((bucket) => bucket.key)).toEqual([
      "2024-02-28",
      "2024-02-29",
      "2024-03-01"
    ]);
  });

  it("uses a matching-duration previous window", () => {
    const result = resolveDashboardWindow({ period: "last7days" }, now);

    expect(result).toMatchObject({
      previousFromDate: "2026-08-18",
      previousToDate: "2026-08-24",
      previousFromInclusive: new Date("2026-08-17T15:00:00.000Z"),
      previousToExclusive: new Date("2026-08-24T15:00:00.000Z")
    });
  });

  it("uses monthly buckets for custom windows longer than 92 days", () => {
    const result = resolveDashboardWindow(
      { period: "custom", from: "2026-01-01", to: "2026-04-03" },
      now
    );

    expect(result.granularity).toBe("month");
    expect(result.buckets.map((bucket) => bucket.key)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04"
    ]);
  });
});
