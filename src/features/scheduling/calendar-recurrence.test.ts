import { describe, expect, it } from "vitest";
import { expandCalendarEventIntervals } from "./calendar-recurrence";

describe("calendar recurrence projection", () => {
  it("keeps weekly occurrences anchored to the same Tokyo weekday and time", () => {
    const intervals = expandCalendarEventIntervals({
      startsAt: new Date("2026-09-20T01:45:00.000Z"),
      endsAt: new Date("2026-09-20T02:45:00.000Z"),
      repeatRule: "weekly",
      from: new Date("2026-09-26T15:00:00.000Z"),
      to: new Date("2026-10-11T15:00:00.000Z"),
    });

    expect(intervals.map((interval) => interval.startsAt.toISOString())).toEqual([
      "2026-09-27T01:45:00.000Z",
      "2026-10-04T01:45:00.000Z",
      "2026-10-11T01:45:00.000Z",
    ]);
  });

  it("does not roll a leap-day yearly event into a different date", () => {
    const intervals = expandCalendarEventIntervals({
      startsAt: new Date("2024-02-29T01:00:00.000Z"),
      endsAt: new Date("2024-02-29T02:00:00.000Z"),
      repeatRule: "yearly",
      from: new Date("2025-01-01T00:00:00.000Z"),
      to: new Date("2029-01-01T00:00:00.000Z"),
    });

    expect(intervals.map((interval) => interval.startsAt.toISOString())).toEqual([
      "2028-02-29T01:00:00.000Z",
    ]);
  });
});
