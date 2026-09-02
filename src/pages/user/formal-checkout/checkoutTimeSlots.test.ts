import { describe, expect, it } from "vitest";
import type { BookingScheduleSlot } from "../../../features/booking/api";
import {
  getTokyoDayWindow,
  isCheckoutSlotBookable,
  resolveInitialCheckoutSlotId,
  slotsForCheckoutDate
} from "./checkoutTimeSlots";

const slot = (id: number, startsAt: string, status: BookingScheduleSlot["status"], bookedCount = 0): BookingScheduleSlot => ({
  id,
  serviceId: 12,
  technicianServiceId: null,
  shopId: 7,
  technicianProfileId: 9,
  startsAt,
  endsAt: new Date(new Date(startsAt).getTime() + 3_600_000).toISOString(),
  capacity: 1,
  bookedCount,
  status,
  serviceName: "肩颈调理",
  shopName: "GINZA Calm Body Lab",
  technicianName: "Misaki",
  priceAmount: "8800.00",
  currency: "JPY",
  durationMinutes: 60
});

const slots = [
  slot(1, "2026-09-02T23:00:00.000Z", "available"), // JST 09/03 08:00
  slot(2, "2026-09-03T01:00:00.000Z", "booked", 1), // JST 09/03 10:00
  slot(3, "2026-09-03T05:00:00.000Z", "available", 1), // JST 09/03 14:00 full
  slot(4, "2026-09-03T23:00:00.000Z", "available"), // JST 09/04 08:00
  slot(5, "2026-09-04T01:00:00.000Z", "blocked") // JST 09/04 10:00
];

describe("checkout time slots", () => {
  it("builds the exact Tokyo calendar-day window", () => {
    expect(getTokyoDayWindow("2026-09-03")).toEqual({
      from: "2026-09-02T15:00:00.000Z",
      to: "2026-09-03T15:00:00.000Z"
    });
  });

  it("rejects impossible Tokyo calendar dates instead of normalizing them", () => {
    expect(getTokyoDayWindow("2026-02-30")).toBeNull();
    expect(getTokyoDayWindow("2025-02-29")).toBeNull();
    expect(getTokyoDayWindow("2024-02-29")).toEqual({
      from: "2024-02-28T15:00:00.000Z",
      to: "2024-02-29T15:00:00.000Z"
    });
  });

  it("keeps unavailable same-day rows but never selects them", () => {
    expect(slotsForCheckoutDate(slots, "2026-09-03").map((item) => item.id)).toEqual([1, 2, 3]);
    expect(isCheckoutSlotBookable(slots[0]!)).toBe(true);
    expect(isCheckoutSlotBookable(slots[1]!)).toBe(false);
    expect(isCheckoutSlotBookable(slots[2]!)).toBe(false);
    expect(isCheckoutSlotBookable(slots[4]!)).toBe(false);
    expect(resolveInitialCheckoutSlotId(slots, "2026-09-03", "10:00")).toBe(1);
    expect(resolveInitialCheckoutSlotId(slots, "2026-09-04", "08:00")).toBe(4);
  });

  it("returns null for a selected day with no bookable rows even when a later day is bookable", () => {
    const unavailableDayThenAvailableDay = [
      slot(10, "2026-09-02T23:00:00.000Z", "blocked"),
      slot(11, "2026-09-03T01:00:00.000Z", "booked", 1),
      slot(12, "2026-09-03T23:00:00.000Z", "available")
    ];

    expect(resolveInitialCheckoutSlotId(unavailableDayThenAvailableDay, "2026-09-03", "08:00")).toBeNull();
  });
});
