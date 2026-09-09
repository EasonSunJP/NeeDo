import { describe, expect, it } from "@jest/globals";
import {
  projectParticipantBusyRanges,
  rangesOverlap,
} from "../src/domain/calendar-participant-availability";

describe("calendar participant availability", () => {
  it("uses strict overlap so adjacent ranges remain available", () => {
    const busy = {
      startsAt: "2026-09-09T10:00:00.000Z",
      endsAt: "2026-09-09T11:00:00.000Z",
    };

    expect(rangesOverlap({ startsAt: "2026-09-09T10:30:00.000Z", endsAt: "2026-09-09T11:30:00.000Z" }, busy)).toBe(true);
    expect(rangesOverlap({ startsAt: "2026-09-09T09:00:00.000Z", endsAt: "2026-09-09T10:00:00.000Z" }, busy)).toBe(false);
    expect(rangesOverlap({ startsAt: "2026-09-09T11:00:00.000Z", endsAt: "2026-09-09T12:00:00.000Z" }, busy)).toBe(false);
  });

  it("projects valid rows to time-only locked ranges", () => {
    const result = projectParticipantBusyRanges([
      {
        participantIdentityId: 21,
        startsAt: new Date("2026-09-09T10:00:00.000Z"),
        endsAt: new Date("2026-09-09T11:00:00.000Z"),
        title: "Private medical appointment",
        location: "Private clinic",
        note: "Never disclose",
      },
      {
        participantIdentityId: 22,
        startsAt: new Date("2026-09-09T12:00:00.000Z"),
        endsAt: new Date("2026-09-09T12:00:00.000Z"),
        title: "Invalid zero-duration row",
      },
    ]);

    expect(result).toEqual([
      {
        participantIdentityId: 21,
        startsAt: "2026-09-09T10:00:00.000Z",
        endsAt: "2026-09-09T11:00:00.000Z",
        status: "locked",
      },
    ]);
    expect(Object.keys(result[0] ?? {}).sort()).toEqual([
      "endsAt",
      "participantIdentityId",
      "startsAt",
      "status",
    ]);
  });
});
