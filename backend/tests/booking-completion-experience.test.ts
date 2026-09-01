import type {
  BookingOrderPayload,
  BookingRepositoryPort,
  OrderTransitionRepositoryOptions
} from "../src/repositories/booking.repository";
import { BookingService } from "../src/services/booking.service";
import type { UserExperienceService } from "../src/services/user-experience.service";

const completedAt = new Date("2026-09-01T09:30:00.000Z");
const actor = {
  userId: 30,
  roles: ["technician"],
  currentIdentityScopeType: "technician_profile",
  currentIdentityScopeId: 31
};

const order = (status: BookingOrderPayload["status"]): BookingOrderPayload => ({
  id: 7,
  orderNo: "ND202609010007",
  orderType: "booking",
  status,
  paymentMethod: "onsite",
  paymentStatus: "confirmed",
  paymentAmountJpy: 10_000,
  paymentConfirmedById: 20,
  paymentConfirmedAt: completedAt,
  paymentReference: null,
  paymentNote: null,
  paymentRefundedById: null,
  paymentRefundedAt: null,
  paymentRefundReference: null,
  paymentRefundReason: null,
  customerUserId: 10,
  serviceId: 4,
  technicianServiceId: null,
  shopId: 2,
  technicianProfileId: 31,
  scheduleSlotId: 9,
  fulfillmentMode: "store",
  serviceName: "Aroma 60",
  pricingModeSnapshot: "merchant",
  serviceOwnerType: "shop",
  serviceOwnerId: 2,
  serviceNameSnapshot: "Aroma 60",
  servicePriceSnapshot: "10000.00",
  serviceDurationSnapshot: 60,
  serviceSnapshot: null,
  shopName: "Aoyama Studio",
  technicianName: "Mika",
  priceAmount: "10000.00",
  currency: "JPY",
  startsAt: new Date("2026-09-01T08:00:00.000Z"),
  endsAt: new Date("2026-09-01T09:00:00.000Z"),
  note: null,
  cancelReason: null,
  affiliate: null,
  createdAt: new Date("2026-08-20T00:00:00.000Z"),
  updatedAt: completedAt,
  statusHistory: [],
  performanceAssessment: null,
  timelineEvents: []
});

const createRepository = (initialStatus: BookingOrderPayload["status"]) => {
  let persisted = order(initialStatus);
  const transactionClient = { marker: "booking-transaction" };
  const repository = {
    listAvailableSlots: jest.fn(),
    createBooking: jest.fn(),
    listOrders: jest.fn(),
    findOrderById: jest.fn(async () => persisted),
    findScheduleSlotById: jest.fn(),
    transitionOrder: jest.fn(
      async (
        input: Parameters<BookingRepositoryPort["transitionOrder"]>[0],
        options?: OrderTransitionRepositoryOptions
      ) => {
        const previous = persisted;
        try {
          await options?.settle?.({ transactionClient, order: previous });
          persisted = { ...previous, status: input.toStatus };
          return persisted;
        } catch (error) {
          persisted = previous;
          throw error;
        }
      }
    )
  } as unknown as jest.Mocked<BookingRepositoryPort>;
  return { repository, transactionClient, current: () => persisted };
};

const createExperienceService = () => ({
  recordEvent: jest.fn(async () => ({
    status: "awarded" as const,
    account: {
      publicId: "experience-account-10",
      userId: 10,
      totalUnits: 100_000n,
      currentLevel: 1,
      lockVersion: 2
    },
    entry: null
  }))
});

describe("booking completion experience", () => {
  it("awards the customer inside the completion transaction using the completion snapshot", async () => {
    const { repository, transactionClient } = createRepository("inService");
    const experienceService = createExperienceService();
    const service = new BookingService(
      repository,
      undefined,
      undefined,
      undefined,
      undefined,
      experienceService as Pick<UserExperienceService, "recordEvent">,
      () => completedAt
    );

    await expect(service.transitionOrder(actor, 7, "complete")).resolves.toMatchObject({
      status: "completed"
    });
    expect(experienceService.recordEvent).toHaveBeenCalledWith(
      {
        userId: 10,
        eventType: "service_completed",
        sourceType: "booking_order",
        sourcePublicId: "ND202609010007",
        idempotencyKey: "service-completed:ND202609010007",
        baseUnits: 100_000n,
        occurredAt: completedAt
      },
      { transactionClient }
    );
  });

  it("does not award cancellation and rejects replay after completion", async () => {
    const cancellation = createRepository("confirmed");
    const cancellationExperience = createExperienceService();
    const cancellationService = new BookingService(
      cancellation.repository,
      undefined,
      undefined,
      undefined,
      undefined,
      cancellationExperience as Pick<UserExperienceService, "recordEvent">
    );
    await cancellationService.transitionOrder(actor, 7, "cancel");
    expect(cancellationExperience.recordEvent).not.toHaveBeenCalled();

    const completed = createRepository("completed");
    const completedExperience = createExperienceService();
    const completedService = new BookingService(
      completed.repository,
      undefined,
      undefined,
      undefined,
      undefined,
      completedExperience as Pick<UserExperienceService, "recordEvent">
    );
    await expect(completedService.transitionOrder(actor, 7, "complete")).rejects.toMatchObject({
      statusCode: 409
    });
    expect(completedExperience.recordEvent).not.toHaveBeenCalled();
  });

  it("rolls back completion when experience persistence fails", async () => {
    const { repository, current } = createRepository("inService");
    const experienceService = {
      recordEvent: jest.fn(async () => {
        throw new Error("experience write failed");
      })
    };
    const service = new BookingService(
      repository,
      undefined,
      undefined,
      undefined,
      undefined,
      experienceService
    );

    await expect(service.transitionOrder(actor, 7, "complete")).rejects.toThrow(
      "experience write failed"
    );
    expect(current().status).toBe("inService");
  });
});
