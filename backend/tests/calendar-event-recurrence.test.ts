import { describe, expect, it } from "@jest/globals";
import { expandCalendarEventIntervals } from "../src/domain/calendar-event-recurrence";

describe("calendar event recurrence", () => {
  it("preserves the Tokyo wall-clock time for daily occurrences", () => {
    const intervals = expandCalendarEventIntervals({
      startsAt: new Date("2026-09-20T01:45:00.000Z"),
      endsAt: new Date("2026-09-20T02:45:00.000Z"),
      repeatRule: "daily",
      from: new Date("2026-09-20T15:00:00.000Z"),
      to: new Date("2026-09-22T15:00:00.000Z"),
    });

    expect(intervals).toEqual([
      {
        startsAt: new Date("2026-09-21T01:45:00.000Z"),
        endsAt: new Date("2026-09-21T02:45:00.000Z"),
      },
      {
        startsAt: new Date("2026-09-22T01:45:00.000Z"),
        endsAt: new Date("2026-09-22T02:45:00.000Z"),
      },
    ]);
  });

  it("skips a month that does not contain the anchored Tokyo calendar day", () => {
    const intervals = expandCalendarEventIntervals({
      startsAt: new Date("2026-08-30T15:30:00.000Z"),
      endsAt: new Date("2026-08-30T16:30:00.000Z"),
      repeatRule: "monthly",
      from: new Date("2026-08-31T15:00:00.000Z"),
      to: new Date("2026-11-01T15:00:00.000Z"),
    });

    expect(intervals.map((interval) => interval.startsAt.toISOString())).toEqual([
      "2026-10-30T15:30:00.000Z",
    ]);
  });
});
