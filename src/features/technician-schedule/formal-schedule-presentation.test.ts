import { describe, expect, it } from "vitest";
import type { BookingOrder, BookingScheduleSlot } from "../booking/api";
import { buildFormalTechnicianCalendar } from "./formal-schedule-presentation";

const slot = (input: Partial<BookingScheduleSlot> = {}): BookingScheduleSlot => ({
  id: 17,
  serviceId: null,
  technicianServiceId: 102,
  shopId: 11,
  technicianProfileId: 31,
  startsAt: "2026-09-01T10:00:00+09:00",
  endsAt: "2026-09-01T11:00:00+09:00",
  capacity: 1,
  bookedCount: 0,
  status: "available",
  serviceName: "Aroma 60",
  shopName: "正式店铺",
  technicianName: "正式技师",
  priceAmount: "10000.00",
  currency: "JPY",
  durationMinutes: 60,
  ...input
});

const order = (input: Partial<BookingOrder> = {}): BookingOrder => ({
  id: 29,
  orderNo: "ND202608280029",
  orderType: "booking",
  status: "confirmed",
  paymentMethod: "onsite",
  paymentStatus: "pending",
  paymentAmountJpy: 10000,
  paymentConfirmedById: null,
  paymentConfirmedAt: null,
  paymentReference: null,
  paymentNote: null,
  paymentRefundedById: null,
  paymentRefundedAt: null,
  paymentRefundReference: null,
  paymentRefundReason: null,
  customerUserId: 71,
  serviceId: null,
  technicianServiceId: 102,
  shopId: 11,
  technicianProfileId: 31,
  scheduleSlotId: 18,
  fulfillmentMode: "store",
  serviceName: "Aroma 60",
  shopName: "正式店铺",
  technicianName: "正式技师",
  priceAmount: "10000.00",
  currency: "JPY",
  startsAt: "2026-09-01T13:00:00+09:00",
  endsAt: "2026-09-01T14:00:00+09:00",
  note: "请准备无香精用品",
  cancelReason: null,
  createdAt: "2026-08-28T01:00:00+09:00",
  updatedAt: "2026-08-28T01:00:00+09:00",
  statusHistory: [],
  ...input
});

describe("formal technician schedule presentation", () => {
  it("maps persisted slots and orders into the approved calendar model", () => {
    const presentation = buildFormalTechnicianCalendar(
      [
        slot(),
        slot({ id: 18, status: "booked", bookedCount: 1, startsAt: "2026-09-01T13:00:00+09:00", endsAt: "2026-09-01T14:00:00+09:00" }),
        slot({ id: 19, status: "blocked", startsAt: "2026-09-02T15:00:00+09:00", endsAt: "2026-09-02T17:00:00+09:00" })
      ],
      [order()],
      "2026-09-01"
    );

    expect(presentation.items).toHaveLength(3);
    expect(presentation.dayItems.map((item) => item.id)).toEqual([
      "formal-slot-17",
      "formal-order-29"
    ]);
    expect(presentation.dayItems[0]).toMatchObject({ kind: "availability", readOnly: false });
    expect(presentation.dayItems[1]).toMatchObject({ kind: "booked", orderId: "29", amount: 10000 });
    expect(presentation.items.find((item) => item.id === "formal-slot-18")).toBeUndefined();
    expect(presentation.items.find((item) => item.id === "formal-slot-19")).toMatchObject({ kind: "locked" });
    expect(presentation.summary).toEqual({
      bookedHours: 1,
      confirmedHours: 2,
      freeHours: 1,
      tentativeHours: 2
    });
    expect(presentation.brief).toEqual({
      estimatedRevenue: 10000,
      hasConflict: false,
      orderCount: 1
    });
  });

  it("excludes cancelled orders and never invents customer or schedule records", () => {
    const presentation = buildFormalTechnicianCalendar(
      [],
      [order({ status: "cancelled" })],
      "2026-09-01"
    );

    expect(presentation.items).toEqual([]);
    expect(presentation.dayItems).toEqual([]);
    expect(presentation.brief).toEqual({ estimatedRevenue: null, hasConflict: false, orderCount: 0 });
  });

  it("detects overlapping persisted work items for the selected day", () => {
    const presentation = buildFormalTechnicianCalendar(
      [slot({ status: "blocked", endsAt: "2026-09-01T14:30:00+09:00" })],
      [order({ startsAt: "2026-09-01T14:00:00+09:00", endsAt: "2026-09-01T15:00:00+09:00" })],
      "2026-09-01"
    );

    expect(presentation.brief.hasConflict).toBe(true);
  });
});
