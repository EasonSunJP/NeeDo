import { ERROR_CODES } from "../src/constants/error-codes";
import type { BookingRepositoryPort, ScheduleListInput, ScheduleSlotCreateInput, ScheduleSlotDeleteInput, ScheduleSlotPayload, ScheduleSlotUpdateInput } from "../src/repositories/booking.repository";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import { BookingService } from "../src/services/booking.service";

const now = new Date("2026-08-25T00:00:00.000Z");
const slot: ScheduleSlotPayload = {
  id: 10,
  serviceId: 20,
  technicianServiceId: null,
  shopId: 11,
  technicianProfileId: 31,
  startsAt: new Date("2026-08-26T01:00:00.000Z"),
  endsAt: new Date("2026-08-26T02:00:00.000Z"),
  capacity: 1,
  bookedCount: 0,
  status: "available",
  serviceName: "Aroma 60",
  shopName: "Aoyama Studio",
  technicianName: "Mika",
  priceAmount: "12000.00",
  currency: "JPY",
  durationMinutes: 60
};

const actor = (overrides: Partial<AuthenticatedAccessContext>): AuthenticatedAccessContext => ({
  userId: 1,
  email: "actor@example.com",
  accessTokenJti: "jti",
  accessTokenExpiresAt: Math.floor(now.getTime() / 1000) + 900,
  roles: [],
  permissions: [],
  ...overrides
});

const repository = (result: "ok" | "conflict" = "ok") => ({
  listAvailableSlots: jest.fn(),
  createBooking: jest.fn(),
  listOrders: jest.fn(),
  findOrderById: jest.fn(),
  findScheduleSlotById: jest.fn(),
  transitionOrder: jest.fn(),
  confirmManualPayment: jest.fn(),
  refundManualPayment: jest.fn(),
  listScheduleSlots: jest.fn(async (input: ScheduleListInput) => { void input; return { list: [slot], total: 1, page: 1, page_size: 20 }; }),
  createScheduleSlot: jest.fn(async (input: ScheduleSlotCreateInput) => { void input; return result === "ok" ? { outcome: "ok" as const, slot } : { outcome: "conflict" as const }; }),
  updateScheduleSlot: jest.fn(async (input: ScheduleSlotUpdateInput) => { void input; return { outcome: "ok" as const, slot }; }),
  deleteScheduleSlot: jest.fn(async (input: ScheduleSlotDeleteInput) => { void input; return { outcome: "ok" as const, slot }; })
}) satisfies jest.Mocked<BookingRepositoryPort>;

const audit = { record: jest.fn(async () => undefined) };
const context = { ip: "127.0.0.1", userAgent: "schedule-test" };

describe("BookingService schedule scope", () => {
  it("derives merchant shop scope and records schedule mutations", async () => {
    const repo = repository();
    const service = new BookingService(repo, undefined, undefined, audit);
    const merchant = actor({
      currentIdentityType: "merchant_owner",
      currentIdentityScopeType: "shop",
      currentIdentityScopeId: 11,
      roles: ["merchant_owner"]
    });

    await service.createScheduleSlot(merchant, {
      serviceId: 20,
      technicianProfileId: 31,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      capacity: 1
    }, context);

    expect(repo.createScheduleSlot).toHaveBeenCalledWith(expect.objectContaining({ scope: "merchant", shopId: 11, technicianProfileId: 31 }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "merchant_admin.schedule_slot.create", targetId: 10 }));
  });

  it("derives technician profile scope instead of trusting request data", async () => {
    const repo = repository();
    const service = new BookingService(repo, undefined, undefined, audit);
    const technician = actor({ currentIdentityScopeType: "technician_profile", currentIdentityScopeId: 31, roles: ["technician"] });

    await service.listScheduleSlots(technician, { from: slot.startsAt, to: slot.endsAt, page: 1, pageSize: 20 });
    await service.createScheduleSlot(technician, {
      serviceId: 20,
      technicianProfileId: 999,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      capacity: 1
    }, context);

    expect(repo.listScheduleSlots).toHaveBeenCalledWith(expect.objectContaining({ scope: "technician", technicianProfileId: 31 }));
    expect(repo.createScheduleSlot).toHaveBeenCalledWith(expect.objectContaining({ scope: "technician", technicianProfileId: 31 }));
    expect(repo.createScheduleSlot).not.toHaveBeenCalledWith(expect.objectContaining({ technicianProfileId: 999 }));
  });

  it("fails closed for missing identity scope and overlapping slots", async () => {
    const unscoped = actor({ roles: ["merchant_owner"] });
    await expect(new BookingService(repository(), undefined, undefined, audit).listScheduleSlots(unscoped, { from: slot.startsAt, to: slot.endsAt, page: 1, pageSize: 20 })).rejects.toMatchObject({ code: ERROR_CODES.IDENTITY_FORBIDDEN });

    const merchant = actor({
      currentIdentityType: "merchant_owner",
      currentIdentityScopeType: "shop",
      currentIdentityScopeId: 11,
      roles: ["merchant_owner"]
    });
    await expect(new BookingService(repository("conflict"), undefined, undefined, audit).createScheduleSlot(merchant, {
      serviceId: 20,
      technicianProfileId: 31,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      capacity: 1
    }, context)).rejects.toMatchObject({ code: ERROR_CODES.SCHEDULE_CONFLICT, message: "error.schedule.conflict" });
  });
});
