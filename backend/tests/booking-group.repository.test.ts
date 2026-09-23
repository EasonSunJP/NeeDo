import type { PrismaClient } from "@prisma/client";
import { BookingRepository } from "../src/repositories/booking.repository";

describe("BookingRepository.createGroupBooking", () => {
  it("rejects two guests without a current black-diamond entitlement before reserving a slot", async () => {
    const slotUpdate = jest.fn();
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 7 }]),
      bookingGroup: { findUnique: jest.fn().mockResolvedValue(null) },
      userMembershipAdjustment: { findFirst: jest.fn().mockResolvedValue(null) },
      platformMembershipEntitlement: { findFirst: jest.fn().mockResolvedValue(null) },
      scheduleSlot: { updateMany: slotUpdate }
    };
    const client = {
      $transaction: (run: (transaction: typeof tx) => Promise<unknown>) => run(tx)
    } as unknown as PrismaClient;
    const repository = new BookingRepository(client);

    await expect(repository.createGroupBooking({
      customerUserId: 7,
      shopId: 5,
      startsAt: new Date("2026-10-02T01:00:00.000Z"),
      guests: [
        { label: "A", assignments: [{ technicianProfileId: 11, serviceIds: [101], scheduleSlotIds: [201], expectedPriceAmountJpy: 8_500 }] },
        { label: "B", assignments: [{ technicianProfileId: 12, serviceIds: [102], scheduleSlotIds: [202], expectedPriceAmountJpy: 8_500 }] }
      ],
      idempotencyKey: "group-booking-test-key-0001",
      paymentMethod: "onsite"
    })).rejects.toThrow("membership_limit");
    expect(slotUpdate).not.toHaveBeenCalled();
  });
});
