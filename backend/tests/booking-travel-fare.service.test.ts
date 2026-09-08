import { BookingService } from "../src/services/booking.service";
import { fulfillmentAddressSnapshotFromRouteAddress } from "../src/repositories/booking.repository";

const actor = {
  userId: 9, roles: ["customer"], currentIdentityId: 90, currentIdentityType: "customer",
  currentIdentityScopeType: "user", currentIdentityScopeId: 9
};
const address = { countryCode: "JP" as const, postalCode: "160-0022", prefecture: "東京都", city: "新宿区", addressLine1: "新宿1-2-3" };
const base = { expectedPriceAmountJpy: 8_800, serviceId: 21, scheduleSlotId: 31, fulfillmentMode: "home" as const, paymentMethod: "onsite" as const, note: "" };
const order = { id: 51, orderNo: "46493" };
const home = { ...base, serviceLocation: { countryCode: "JP" as const, admin1Code: "13", admin2Code: "13104" } };

describe("BookingService travel estimate binding", () => {
  it("maps the normalized home destination into the authorized order-detail snapshot", () => {
    expect(fulfillmentAddressSnapshotFromRouteAddress({ ...address, addressLine2: "西口", building: "NeeDo 301" })).toEqual({
      line1: "〒160-0022 東京都新宿区新宿1-2-3",
      line2: "西口",
      line3: "NeeDo 301"
    });
  });

  it("requires a structured address and estimate for home bookings and passes both to the repository", async () => {
    const repository = { createBooking: jest.fn(async () => order), findScheduleSlotShopId: jest.fn(async () => 11) };
    const service = new BookingService(repository as never);
    await expect(service.createBooking(actor, { ...home, fulfillmentAddress: address, travelEstimatePublicId: "estimate-1" })).resolves.toBe(order);
    expect(repository.createBooking).toHaveBeenCalledWith(expect.objectContaining({ customerUserId: 9, fulfillmentAddress: address, travelEstimatePublicId: "estimate-1" }));

    await expect(service.createBooking(actor, home)).rejects.toMatchObject({ message: "error.travel.estimate_required", statusCode: 422 });
  });

  it("rejects estimate or address injection for store bookings", async () => {
    const repository = { createBooking: jest.fn(async () => order), findScheduleSlotShopId: jest.fn(async () => 11) };
    const service = new BookingService(repository as never);
    await expect(service.createBooking(actor, { ...base, fulfillmentMode: "store", fulfillmentAddress: address, travelEstimatePublicId: "estimate-1" })).rejects.toMatchObject({ message: "error.travel.estimate_not_allowed", statusCode: 400 });
    expect(repository.createBooking).not.toHaveBeenCalled();
  });

  it.each([
    ["expired", "error.travel.estimate_expired", 409],
    ["consumed", "error.travel.estimate_consumed", 409],
    ["mismatch", "error.travel.estimate_mismatch", 422],
    ["invalid", "error.travel.estimate_invalid", 422]
  ] as const)("maps %s transactional consumption failures without returning an order", async (travelEstimateError, message, statusCode) => {
    const repository = { createBooking: jest.fn(async () => ({ travelEstimateError })), findScheduleSlotShopId: jest.fn(async () => 11) };
    const service = new BookingService(repository as never);
    await expect(service.createBooking(actor, { ...home, fulfillmentAddress: address, travelEstimatePublicId: "estimate-1" })).rejects.toMatchObject({ message, statusCode });
  });
});
