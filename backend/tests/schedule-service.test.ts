import { ERROR_CODES } from "../src/constants/error-codes";
import type {
  AvailabilityWindowCreateInput,
  AvailabilityWindowListInput,
  AvailabilityWindowUpdateInput,
  BookingRepositoryPort,
  ScheduleListInput,
  ScheduleSlotCreateInput,
  ScheduleSlotDeleteInput,
  ScheduleSlotPayload,
  ScheduleSlotUpdateInput
} from "../src/repositories/booking.repository";
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
const availabilityWindow = {
  id: 88,
  shopId: 11,
  technicianProfileId: 31,
  sourceType: "technician" as const,
  visibility: "affiliated_shops" as const,
  startsAt: new Date("2026-08-26T09:00:00.000Z"),
  endsAt: new Date("2026-08-26T15:00:00.000Z"),
  capacity: 1,
  isActive: true,
  shopName: "Aoyama Studio",
  createdAt: now,
  updatedAt: now
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

const repository = (result: "ok" | "conflict" = "ok") =>
  ({
    listAvailableSlots: jest.fn(),
    listAvailabilityWindows: jest.fn(async (input: AvailabilityWindowListInput) => {
      void input;
      return { list: [availabilityWindow], total: 1, page: 1, page_size: 20 };
    }),
    createAvailabilityWindow: jest.fn(async (input: AvailabilityWindowCreateInput) => {
      void input;
      return result === "ok" ? { outcome: "ok" as const, window: availabilityWindow } : { outcome: "shop_control_conflict" as const };
    }),
    updateAvailabilityWindow: jest.fn(async (input: AvailabilityWindowUpdateInput) => {
      void input;
      return { outcome: "ok" as const, window: availabilityWindow };
    }),
    deleteAvailabilityWindow: jest.fn(async (input) => {
      void input;
      return { outcome: "ok" as const, window: availabilityWindow };
    }),
    createBooking: jest.fn(),
    listOrders: jest.fn(),
    findOrderById: jest.fn(),
    findScheduleSlotById: jest.fn(),
    transitionOrder: jest.fn(),
    confirmManualPayment: jest.fn(),
    refundManualPayment: jest.fn(),
    getServiceVerificationCode: jest.fn(),
    startService: jest.fn(),
    createOrderAddOn: jest.fn(),
    decideOrderAddOn: jest.fn(),
    endService: jest.fn(),
    resolveOverdueAppointment: jest.fn(),
    getOrCreateCheckout: jest.fn(),
    selectCheckoutPaymentMethod: jest.fn(),
    payCheckoutWithNdp: jest.fn(),
    confirmCheckoutReceipt: jest.fn(),
    createOrderReview: jest.fn(),
    findOwnOrderReview: jest.fn(),
    listScheduleSlots: jest.fn(async (input: ScheduleListInput) => {
      void input;
      return { list: [slot], total: 1, page: 1, page_size: 20 };
    }),
    createScheduleSlot: jest.fn(async (input: ScheduleSlotCreateInput) => {
      void input;
      return result === "ok" ? { outcome: "ok" as const, slot } : { outcome: "conflict" as const };
    }),
    updateScheduleSlot: jest.fn(async (input: ScheduleSlotUpdateInput) => {
      void input;
      return { outcome: "ok" as const, slot };
    }),
    deleteScheduleSlot: jest.fn(async (input: ScheduleSlotDeleteInput) => {
      void input;
      return { outcome: "ok" as const, slot };
    })
  }) satisfies jest.Mocked<BookingRepositoryPort>;

const audit = { record: jest.fn(async () => undefined) };
const context = { ip: "127.0.0.1", userAgent: "schedule-test" };

describe("BookingService schedule scope", () => {
  it("creates an independent six-hour free availability window without service-duration or booking exclusion", async () => {
    const repo = repository();
    const service = new BookingService(repo, undefined, undefined, audit);
    const technician = actor({
      currentIdentityType: "technician",
      currentIdentityScopeType: "technician_profile",
      currentIdentityScopeId: 31,
      roles: ["technician"]
    });

    await expect(service.createAvailabilityWindow(technician, {
      startsAt: availabilityWindow.startsAt,
      endsAt: availabilityWindow.endsAt,
      capacity: 1
    }, context)).resolves.toBe(availabilityWindow);

    expect(repo.createAvailabilityWindow).toHaveBeenCalledWith(expect.objectContaining({
      scope: "technician",
      technicianProfileId: 31,
      startsAt: availabilityWindow.startsAt,
      endsAt: availabilityWindow.endsAt
    }));
    expect(repo.findOrderById).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      action: "technician.availability_window.create",
      targetType: "Availability"
    }));
  });

  it("reports the controlling shop conflict instead of trimming an overlapping free window", async () => {
    const technician = actor({
      currentIdentityType: "technician",
      currentIdentityScopeType: "technician_profile",
      currentIdentityScopeId: 31,
      roles: ["technician"]
    });
    await expect(new BookingService(repository("conflict"), undefined, undefined, audit)
      .createAvailabilityWindow(technician, {
        startsAt: availabilityWindow.startsAt,
        endsAt: availabilityWindow.endsAt,
        capacity: 1
      }, context)).rejects.toMatchObject({
        code: ERROR_CODES.SCHEDULE_CONFLICT,
        message: "error.availability.shop_control_conflict"
      });
  });

  it("derives merchant shop scope and records schedule mutations", async () => {
    const repo = repository();
    const service = new BookingService(repo, undefined, undefined, audit);
    const merchant = actor({
      currentIdentityType: "merchant_owner",
      currentIdentityScopeType: "shop",
      currentIdentityScopeId: 11,
      roles: ["merchant_owner"]
    });

    await service.createScheduleSlot(
      merchant,
      {
        serviceId: 20,
        technicianProfileId: 31,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        capacity: 1
      },
      context
    );

    expect(repo.createScheduleSlot).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "merchant", shopId: 11, technicianProfileId: 31 })
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "merchant_admin.schedule_slot.create", targetId: 10 })
    );
  });

  it("derives technician profile scope instead of trusting request data", async () => {
    const repo = repository();
    const service = new BookingService(repo, undefined, undefined, audit);
    const technician = actor({
      currentIdentityScopeType: "technician_profile",
      currentIdentityScopeId: 31,
      roles: ["technician"]
    });

    await service.listScheduleSlots(technician, {
      from: slot.startsAt,
      to: slot.endsAt,
      page: 1,
      pageSize: 20
    });
    await service.createScheduleSlot(
      technician,
      {
        serviceId: 20,
        technicianProfileId: 999,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        capacity: 1
      },
      context
    );

    expect(repo.listScheduleSlots).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "technician", technicianProfileId: 31 })
    );
    expect(repo.createScheduleSlot).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "technician", technicianProfileId: 31 })
    );
    expect(repo.createScheduleSlot).not.toHaveBeenCalledWith(
      expect.objectContaining({ technicianProfileId: 999 })
    );
  });

  it("fails closed for missing identity scope and overlapping slots", async () => {
    const unscoped = actor({ roles: ["merchant_owner"] });
    await expect(
      new BookingService(repository(), undefined, undefined, audit).listScheduleSlots(unscoped, {
        from: slot.startsAt,
        to: slot.endsAt,
        page: 1,
        pageSize: 20
      })
    ).rejects.toMatchObject({ code: ERROR_CODES.IDENTITY_FORBIDDEN });

    const merchant = actor({
      currentIdentityType: "merchant_owner",
      currentIdentityScopeType: "shop",
      currentIdentityScopeId: 11,
      roles: ["merchant_owner"]
    });
    await expect(
      new BookingService(repository("conflict"), undefined, undefined, audit).createScheduleSlot(
        merchant,
        {
          serviceId: 20,
          technicianProfileId: 31,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          capacity: 1
        },
        context
      )
    ).rejects.toMatchObject({
      code: ERROR_CODES.SCHEDULE_CONFLICT,
      message: "error.schedule.conflict"
    });
  });
});
