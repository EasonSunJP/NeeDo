import type { BookingGroupPayload, BookingRepositoryPort } from "../src/repositories/booking.repository";
import { BookingService } from "../src/services/booking.service";

const input = {
  shopId: 5,
  startsAt: "2026-10-02T01:00:00.000Z",
  guests: [{ label: "A", assignments: [{ technicianProfileId: 11, serviceIds: [101], scheduleSlotIds: [201], expectedPriceAmountJpy: 8_500 }] }],
  paymentMethod: "onsite" as const
};

describe("BookingService group booking", () => {
  it("requires the customer identity and an idempotency key before repository writes", async () => {
    const createGroupBooking = jest.fn();
    const service = new BookingService({ createGroupBooking } as unknown as BookingRepositoryPort);
    await expect(service.createGroupBooking({ userId: 7, roles: ["technician"], currentIdentityType: "technician" }, input, "group-booking-key-0001")).rejects.toThrow();
    await expect(service.createGroupBooking({ userId: 7, roles: ["customer"], currentIdentityType: "customer" }, input, "short")).rejects.toThrow();
    expect(createGroupBooking).not.toHaveBeenCalled();
  });

  it("scopes a technician's group view to that technician's order", async () => {
    const group = {
      id: 1, publicId: "713382d3-7d99-44f7-a54e-a1745fca4848", customerUserId: 7,
      shopId: 5, startsAt: new Date("2026-10-02T01:00:00.000Z"), totalPriceAmountJpy: 17_000,
      guests: [
        { id: 1, position: 0, label: "A", orders: [{ id: 11, customerUserId: 7, shopId: 5, technicianProfileId: 21, priceAmount: "8000.00" }] },
        { id: 2, position: 1, label: "B", orders: [{ id: 12, customerUserId: 7, shopId: 5, technicianProfileId: 22, priceAmount: "9000.00" }] }
      ]
    } as unknown as BookingGroupPayload;
    const service = new BookingService({ findGroupBooking: jest.fn().mockResolvedValue(group) } as unknown as BookingRepositoryPort);
    const view = await service.getGroupBooking({ userId: 8, roles: ["technician"], currentIdentityType: "technician", currentIdentityScopeType: "technician_profile", currentIdentityScopeId: 21 }, group.publicId);
    expect(view.guests.map((guest) => guest.label)).toEqual(["A"]);
    expect(view.totalPriceAmountJpy).toBe(8_000);
    await expect(service.getGroupBooking({ userId: 8, roles: ["merchant_owner"], currentIdentityType: "merchant_owner", currentIdentityScopeType: "shop", currentIdentityScopeId: 5 }, group.publicId)).resolves.toMatchObject({ totalPriceAmountJpy: 17_000 });
    await expect(service.getGroupBooking({ userId: 8, roles: ["operator"], currentIdentityType: "platform", currentIdentityScopeType: "global" }, group.publicId)).resolves.toMatchObject({ totalPriceAmountJpy: 17_000 });
    await expect(service.getGroupBooking({ userId: 9, roles: ["technician"], currentIdentityType: "technician", currentIdentityScopeType: "technician_profile", currentIdentityScopeId: 99 }, group.publicId)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.getGroupBooking({ userId: 10, roles: ["customer"], currentIdentityType: "customer" }, group.publicId)).rejects.toMatchObject({ statusCode: 404 });
  });
});
