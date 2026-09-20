import {
  decodeDynamicAvailabilityId,
  encodeDynamicAvailabilityId,
  enumerateDynamicBookingStarts
} from "../src/domain/dynamic-booking-window";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("dynamic booking windows", () => {
  it("round-trips a virtual availability selector without persisting candidate slots", () => {
    const id = encodeDynamicAvailabilityId(321, 95);

    expect(id).toBeLessThan(0);
    expect(decodeDynamicAvailabilityId(id)).toEqual({ availabilityId: 321, offsetMinutes: 95 });
    expect(decodeDynamicAvailabilityId(1)).toBeNull();
  });

  it("round-trips selectors across a multi-month continuous availability window", () => {
    const id = encodeDynamicAvailabilityId(58_584, 54_720);

    expect(decodeDynamicAvailabilityId(id)).toEqual({
      availabilityId: 58_584,
      offsetMinutes: 54_720
    });
  });

  it("offers starts on the configured UI interval while keeping service and occupied ends separate", () => {
    const starts = enumerateDynamicBookingStarts({
      windowStartsAt: new Date("2026-09-21T08:00:00.000Z"),
      windowEndsAt: new Date("2026-09-21T16:00:00.000Z"),
      serviceDurationMinutes: 60,
      preBufferMinutes: 0,
      postBufferMinutes: 30,
      startIntervalMinutes: 5
    });

    expect(starts).toHaveLength(79);
    expect(starts[0]).toEqual({
      offsetMinutes: 0,
      startsAt: new Date("2026-09-21T08:00:00.000Z"),
      endsAt: new Date("2026-09-21T09:00:00.000Z"),
      occupiedStartsAt: new Date("2026-09-21T08:00:00.000Z"),
      occupiedEndsAt: new Date("2026-09-21T09:30:00.000Z")
    });
    expect(starts.at(-1)?.startsAt).toEqual(new Date("2026-09-21T14:30:00.000Z"));
    expect(starts.at(-1)?.endsAt).toEqual(new Date("2026-09-21T15:30:00.000Z"));
    expect(starts.at(-1)?.occupiedEndsAt).toEqual(new Date("2026-09-21T16:00:00.000Z"));
  });

  it("enumerates only the requested day inside a multi-month window", () => {
    const starts = enumerateDynamicBookingStarts({
      windowStartsAt: new Date("2026-09-20T15:00:00.000Z"),
      windowEndsAt: new Date("2026-12-20T15:00:00.000Z"),
      candidateStartsAt: new Date("2026-10-28T15:00:00.000Z"),
      candidateStartsBefore: new Date("2026-10-29T15:00:00.000Z"),
      serviceDurationMinutes: 30,
      preBufferMinutes: 0,
      postBufferMinutes: 30,
      startIntervalMinutes: 5
    });

    expect(starts).toHaveLength(288);
    expect(starts[0]?.startsAt).toEqual(new Date("2026-10-28T15:00:00.000Z"));
    expect(starts[0]?.offsetMinutes).toBe(54_720);
    expect(starts.at(-1)?.startsAt).toEqual(new Date("2026-10-29T14:55:00.000Z"));
  });

  it("persists service and occupied ranges separately for authoritative conflict checks", () => {
    const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
    const migration = readFileSync(
      resolve(process.cwd(), "prisma/migrations/20260921150000_schedule_slot_occupied_ranges/migration.sql"),
      "utf8"
    );

    expect(schema).toContain('occupiedStartsAt    DateTime?          @map("occupied_starts_at")');
    expect(schema).toContain('postBufferMinutes   Int                @default(0) @map("post_buffer_minutes")');
    expect(migration).toContain("UPDATE `schedule_slots`");
  });
});
