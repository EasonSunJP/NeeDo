import { BookingRepository } from "../src/repositories/booking.repository";
import type { MerchantOrderEditConflictError } from "../src/repositories/booking.repository";

const transactionClient = (overrides: Record<string, unknown> = {}) => ({
  $queryRaw: jest.fn()
    .mockResolvedValueOnce([{ id: 700 }])
    .mockResolvedValueOnce([{ id: 31 }]),
  bookingOrder: {
    findFirst: jest.fn(),
    updateMany: jest.fn()
  },
  technicianShopAffiliation: { findFirst: jest.fn() },
  exchangeMatchParticipant: { findFirst: jest.fn() },
  walletHold: { findFirst: jest.fn().mockResolvedValue(null) },
  orderFinancial: { findFirst: jest.fn().mockResolvedValue(null) },
  orderCheckout: { findFirst: jest.fn().mockResolvedValue(null) },
  servicePrepayment: { findFirst: jest.fn().mockResolvedValue(null) },
  ...overrides
});

const repositoryWith = (transaction: ReturnType<typeof transactionClient>) => new BookingRepository({
  $transaction: jest.fn(async (callback: (client: typeof transaction) => unknown) => callback(transaction))
} as never);

describe("merchant booking mutations", () => {
  it("rejects price changes after prepayment evidence exists", async () => {
    const transaction = transactionClient();
    transaction.bookingOrder.findFirst.mockResolvedValue({
      id: 700,
      status: "CONFIRMED",
      priceAmount: 10_000,
      paymentMethod: "ONSITE",
      paymentStatus: "PENDING",
      paymentConfirmedAt: null,
      paymentReference: null,
      note: null,
      updatedAt: new Date("2026-09-20T10:00:00.000Z")
    });
    transaction.servicePrepayment.findFirst.mockResolvedValue({ id: 99 });

    await expect(repositoryWith(transaction).editMerchantOrder({
      orderId: 700,
      shopId: 16,
      actorUserId: 7,
      priceAmountJpy: 13_000
    })).rejects.toMatchObject<Partial<MerchantOrderEditConflictError>>({ reason: "financial_locked" });
    expect(transaction.bookingOrder.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a concurrent merchant edit through the status, payment, and version CAS", async () => {
    const transaction = transactionClient();
    transaction.bookingOrder.findFirst.mockResolvedValue({
      id: 700,
      status: "PENDING",
      priceAmount: 10_000,
      paymentMethod: "ONSITE",
      paymentStatus: "PENDING",
      paymentConfirmedAt: null,
      paymentReference: null,
      note: null,
      updatedAt: new Date("2026-09-20T10:00:00.000Z")
    });
    transaction.bookingOrder.updateMany.mockResolvedValue({ count: 0 });

    await expect(repositoryWith(transaction).editMerchantOrder({
      orderId: 700,
      shopId: 16,
      actorUserId: 7,
      note: "updated"
    })).rejects.toMatchObject<Partial<MerchantOrderEditConflictError>>({ reason: "concurrent_change" });
    expect(transaction.bookingOrder.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: "PENDING", paymentStatus: "PENDING" })
    }));
  });

  it("locks the target order and technician, then rejects Exchange reservation overlap", async () => {
    const transaction = transactionClient();
    transaction.bookingOrder.findFirst.mockResolvedValue({
      id: 700,
      technicianProfileId: null,
      startsAt: new Date("2026-09-21T01:00:00.000Z"),
      endsAt: new Date("2026-09-21T02:00:00.000Z"),
      status: "CONFIRMED"
    });
    transaction.technicianShopAffiliation.findFirst.mockResolvedValue({ id: 88 });
    transaction.exchangeMatchParticipant.findFirst.mockResolvedValue({ id: 90 });

    await expect(repositoryWith(transaction).assignTechnician({
      orderId: 700,
      shopId: 16,
      technicianProfileId: 31,
      actorUserId: 7
    })).resolves.toEqual({ outcome: "technician_unavailable" });
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(2);
    expect(transaction.bookingOrder.updateMany).not.toHaveBeenCalled();
  });

  it("enforces a strict dispatch end boundary", async () => {
    const transaction = {
      shopAutoDispatchRule: { findFirst: jest.fn().mockResolvedValue({
        allowStore: true,
        allowHome: true,
        startMinute: 600,
        endMinute: 660,
        strictWindow: true,
        travelMinutesPerKm: 3
      }) },
      technicianShopAffiliation: { findMany: jest.fn() }
    };
    const repository = new BookingRepository({} as never) as unknown as {
      resolveAutomaticDispatchTechnician(client: unknown, input: Record<string, unknown>): Promise<number | null>;
    };

    await expect(repository.resolveAutomaticDispatchTechnician(transaction, {
      shopId: 16,
      slotTechnicianProfileId: null,
      startsAt: new Date("2026-09-21T01:30:00.000Z"),
      endsAt: new Date("2026-09-21T02:30:00.000Z"),
      fulfillmentMode: "store",
      travelDistanceMeters: null
    })).resolves.toBeNull();
    expect(transaction.technicianShopAffiliation.findMany).not.toHaveBeenCalled();
  });

  it("uses travel buffer, ignores cancelled daily work, and implements longest-idle ordering", async () => {
    const affiliations = [
      { technicianProfile: { id: 31, reviewSummary: null, performanceSummary: null, bookingOrders: [] } },
      { technicianProfile: { id: 32, reviewSummary: null, performanceSummary: null, bookingOrders: [] } }
    ];
    const transaction = {
      shopAutoDispatchRule: { findFirst: jest.fn().mockResolvedValue({
        allowStore: true,
        allowHome: true,
        startMinute: 0,
        endMinute: 1439,
        strictWindow: false,
        travelMinutesPerKm: 3,
        preferredTechnicianIdsJson: [],
        minimumRating: null,
        minimumAcceptanceRate: null,
        maximumCancellationRate: null,
        dailyTechnicianLimit: null,
        strategy: "longest_idle"
      }) },
      technicianShopAffiliation: { findMany: jest.fn().mockResolvedValue(affiliations) },
      bookingOrder: { findMany: jest.fn().mockResolvedValue([
        { technicianProfileId: 31, endsAt: new Date("2026-09-21T00:20:00.000Z") },
        { technicianProfileId: 32, endsAt: new Date("2026-09-20T23:00:00.000Z") }
      ]) }
    };
    const repository = new BookingRepository({} as never) as unknown as {
      resolveAutomaticDispatchTechnician(client: unknown, input: Record<string, unknown>): Promise<number | null>;
    };

    await expect(repository.resolveAutomaticDispatchTechnician(transaction, {
      shopId: 16,
      slotTechnicianProfileId: null,
      startsAt: new Date("2026-09-21T01:00:00.000Z"),
      endsAt: new Date("2026-09-21T02:00:00.000Z"),
      fulfillmentMode: "home",
      travelDistanceMeters: 1_000
    })).resolves.toBe(32);
    expect(transaction.technicianShopAffiliation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        technicianProfile: expect.objectContaining({
          is: expect.objectContaining({
            availabilities: expect.objectContaining({
              some: expect.objectContaining({ startsAt: { lte: new Date("2026-09-21T00:57:00.000Z") } })
            })
          })
        })
      }),
      select: expect.objectContaining({
        technicianProfile: expect.objectContaining({
          select: expect.objectContaining({
            bookingOrders: expect.objectContaining({ where: expect.objectContaining({ status: { not: "CANCELLED" } }) })
          })
        })
      })
    }));
  });
});
