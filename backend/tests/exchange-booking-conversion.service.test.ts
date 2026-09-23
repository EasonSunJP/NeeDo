import { logger } from "../src/config/logger";
import { ERROR_CODES } from "../src/constants/error-codes";
import type {
  ExchangeBookingConversionRepositoryResult,
  ExchangeCommittedNotification
} from "../src/types/exchange-booking-conversion.types";
import type { ExchangeBookingOwnerContext } from "../src/repositories/exchange-booking-conversion.repository";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import { sha256StableJson } from "../src/utils/stable-json";
import { ExchangeBookingConversionService } from "../src/services/exchange-booking-conversion.service";

const now = new Date("2026-09-03T01:02:03.000Z");
const access: AuthenticatedAccessContext = {
  userId: 41,
  email: "owner@example.com",
  accessTokenJti: "access-jti",
  accessTokenExpiresAt: 1_800_000_000,
  currentIdentityId: 410,
  currentIdentityType: "customer",
  roles: ["customer"],
  permissions: ["exchange:matching:book-own"]
};
const context = { ip: "127.0.0.1", userAgent: "exchange-test" };
const payload = {
  exchangePostId: 42,
  matchingVersion: 8,
  bookedAt: now.toISOString(),
  orders: [
    {
      exchangeClaimId: 101,
      orderId: 501,
      orderNo: "ND501",
      status: "pending" as const,
      providerPublicId: "u0000000101",
      quoteAmountJpy: 12_000,
      startsAt: "2026-09-04T01:00:00.000Z",
      endsAt: "2026-09-04T02:00:00.000Z"
    }
  ]
};
const notifications: ExchangeCommittedNotification[] = [
  {
    id: 701,
    recipientUserId: 51,
    recipientIdentityId: 510,
    actorUserId: 41,
    actorIdentityId: 410,
    type: "orderStatus",
    title: "exchange.booking.created",
    body: "ND501",
    payload: { orderId: 501 },
    readAt: null,
    createdAt: now
  }
];

function fixture(
  result: ExchangeBookingConversionRepositoryResult = {
    outcome: "created",
    payload,
    notifications
  }
) {
  const transactionClient = { marker: "task4-transaction" };
  const affiliate = { invalidateCancelledBooking: jest.fn(async () => undefined) };
  const repository = {
    findOwnerContext: jest.fn(
      async (): Promise<ExchangeBookingOwnerContext | null> => ({
        ownerUserId: 41,
        ownerIdentityId: 410,
        serviceMode: "home" as const
      })
    ),
    convert: jest.fn(async (_input, options) => {
      if (options.invalidateSupersededAffiliate) {
        await options.invalidateSupersededAffiliate({
          transactionClient,
          bookingOrderId: 601,
          actorUserId: 41
        });
      }
      return result.outcome === "created" ? { ...result, committedOrderIds: [601, 501] } : result;
    })
  };
  const policy = { assertServiceEkyc: jest.fn(async () => undefined) };
  const realtime = { publishCommittedNotifications: jest.fn(async () => undefined) };
  const audit = {
    createInput: jest.fn((input) => ({
      actorId: input.actor.userId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      ip: input.context.ip,
      userAgent: input.context.userAgent,
      metadata: input.metadata
    }))
  };
  const live = { publishCommittedOrderChanges: jest.fn(async () => undefined) };
  const automation = { processBooking: jest.fn(async () => undefined) };
  const service = new ExchangeBookingConversionService(
    repository as never, audit as never, affiliate as never, policy as never,
    realtime as never, () => now, live, automation
  );
  return { affiliate, audit, policy, realtime, repository, service, transactionClient, live, automation };
}

const create = (service: ExchangeBookingConversionService) =>
  service.createBookings(access, 42, { expectedVersion: 7 }, "idem-key-0000001", context);

describe("ExchangeBookingConversionService", () => {
  it("processes newly committed Request orders for technician auto acceptance, but never replays", async () => {
    const state = fixture();
    await create(state.service);
    expect(state.automation.processBooking).toHaveBeenCalledWith(501);
    expect(state.repository.convert.mock.invocationCallOrder[0]).toBeLessThan(state.automation.processBooking.mock.invocationCallOrder[0]!);
    const replay = fixture({ outcome: "replayed", payload, notifications: [] });
    await create(replay.service);
    expect(replay.automation.processBooking).not.toHaveBeenCalled();
  });
  it("publishes created and superseded orders only after a committed conversion, not replay", async () => {
    const state = fixture();
    await create(state.service);
    expect(state.live.publishCommittedOrderChanges).toHaveBeenCalledWith([601, 501]);
    expect(state.repository.convert.mock.invocationCallOrder[0]).toBeLessThan(state.live.publishCommittedOrderChanges.mock.invocationCallOrder[0]!);
    const replay = fixture({ outcome: "replayed", payload, notifications });
    await create(replay.service);
    expect(replay.live.publishCommittedOrderChanges).not.toHaveBeenCalled();
  });

  it("enforces owner identity/user and eKYC before one formal conversion", async () => {
    const state = fixture();

    await expect(create(state.service)).resolves.toEqual(payload);

    expect(state.repository.findOwnerContext).toHaveBeenCalledWith(42, 410);
    expect(state.policy.assertServiceEkyc).toHaveBeenCalledWith(41, "home", now);
    expect(state.policy.assertServiceEkyc.mock.invocationCallOrder[0]).toBeLessThan(
      state.repository.convert.mock.invocationCallOrder[0]
    );
    expect(state.repository.convert).toHaveBeenCalledWith(
      expect.objectContaining({
        exchangePostId: 42,
        actorUserId: 41,
        actorIdentityId: 410,
        expectedVersion: 7,
        idempotencyKey: "idem-key-0000001",
        payloadFingerprint: sha256StableJson({
          actorUserId: 41,
          actorIdentityId: 410,
          exchangePostId: 42,
          expectedVersion: 7
        }),
        occurredAt: now,
        audit: expect.objectContaining({
          action: "exchange.matching.bookings.create",
          targetType: "exchange_request_matching",
          metadata: { exchangePostId: 42, expectedVersion: 7 }
        })
      }),
      expect.objectContaining({ invalidateSupersededAffiliate: expect.any(Function) })
    );
    expect(state.affiliate.invalidateCancelledBooking).toHaveBeenCalledWith({
      transactionClient: state.transactionClient,
      bookingOrderId: 601,
      actorUserId: 41
    });
    expect(state.realtime.publishCommittedNotifications).toHaveBeenCalledWith(notifications);
  });

  it("rejects an authenticated account without an active identity before repository access", async () => {
    const state = fixture();
    await expect(
      state.service.createBookings(
        { ...access, currentIdentityId: undefined },
        42,
        { expectedVersion: 7 },
        "idem-key-0000001",
        context
      )
    ).rejects.toMatchObject({
      code: ERROR_CODES.EXCHANGE_MATCH_BOOKING_NOT_ALLOWED,
      message: "error.exchange.match_booking_not_allowed",
      statusCode: 403
    });
    expect(state.repository.findOwnerContext).not.toHaveBeenCalled();
    expect(state.repository.convert).not.toHaveBeenCalled();
  });

  it("does not allow a selected provider or a different user to create owner bookings", async () => {
    const state = fixture();
    state.repository.findOwnerContext.mockResolvedValueOnce({
      ownerUserId: 99,
      ownerIdentityId: 990,
      serviceMode: "store"
    });

    await expect(create(state.service)).rejects.toMatchObject({
      code: ERROR_CODES.EXCHANGE_MATCH_BOOKING_NOT_ALLOWED,
      message: "error.exchange.match_booking_not_allowed",
      statusCode: 403
    });
    expect(state.policy.assertServiceEkyc).not.toHaveBeenCalled();
    expect(state.repository.convert).not.toHaveBeenCalled();
  });

  it("returns not found when the matching is not visible", async () => {
    const state = fixture();
    state.repository.findOwnerContext.mockResolvedValueOnce(null);
    await expect(create(state.service)).rejects.toMatchObject({
      code: ERROR_CODES.EXCHANGE_MATCH_BOOKING_NOT_FOUND,
      message: "error.exchange.match_booking_not_found",
      statusCode: 404
    });
    expect(state.policy.assertServiceEkyc).not.toHaveBeenCalled();
    expect(state.repository.convert).not.toHaveBeenCalled();
  });

  it.each([
    [
      "not_found",
      ERROR_CODES.EXCHANGE_MATCH_BOOKING_NOT_FOUND,
      "error.exchange.match_booking_not_found",
      404
    ],
    [
      "not_allowed",
      ERROR_CODES.EXCHANGE_MATCH_BOOKING_NOT_ALLOWED,
      "error.exchange.match_booking_not_allowed",
      403
    ],
    [
      "invalid_state",
      ERROR_CODES.EXCHANGE_MATCH_BOOKING_INVALID_STATE,
      "error.exchange.match_booking_invalid_state",
      409
    ],
    [
      "version_conflict",
      ERROR_CODES.EXCHANGE_MATCH_BOOKING_VERSION_CONFLICT,
      "error.exchange.match_booking_version_conflict",
      409
    ],
    [
      "already_created",
      ERROR_CODES.EXCHANGE_MATCH_BOOKING_ALREADY_CREATED,
      "error.exchange.match_booking_already_created",
      409
    ],
    [
      "slot_unavailable",
      ERROR_CODES.EXCHANGE_MATCH_BOOKING_SLOT_UNAVAILABLE,
      "error.exchange.match_booking_slot_unavailable",
      409
    ],
    [
      "idempotency_conflict",
      ERROR_CODES.EXCHANGE_MATCH_BOOKING_IDEMPOTENCY_CONFLICT,
      "error.exchange.match_booking_idempotency_conflict",
      409
    ]
  ] as const)("maps %s to its stable public error", async (outcome, code, message, statusCode) => {
    const state = fixture({
      outcome,
      ...(outcome === "version_conflict" ? { currentVersion: 9 } : {})
    });

    await expect(create(state.service)).rejects.toMatchObject({
      code,
      message,
      statusCode,
      data: outcome === "version_conflict" ? { currentVersion: 9 } : null
    });
    expect(state.realtime.publishCommittedNotifications).not.toHaveBeenCalled();
  });

  it("returns committed creation when realtime publish fails and logs the transport failure", async () => {
    const state = fixture();
    const failure = new Error("gateway unavailable");
    state.realtime.publishCommittedNotifications.mockRejectedValueOnce(failure);
    const errorSpy = jest.spyOn(logger, "error").mockImplementation(() => undefined as never);

    await expect(create(state.service)).resolves.toEqual(payload);
    expect(state.repository.convert).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      { error: failure, exchangePostId: 42 },
      "Exchange booking realtime publish failed after commit"
    );
    errorSpy.mockRestore();
  });

  it("returns an idempotent replay without publishing duplicate realtime events", async () => {
    const state = fixture({ outcome: "replayed", payload, notifications });
    await expect(create(state.service)).resolves.toEqual(payload);
    expect(state.realtime.publishCommittedNotifications).not.toHaveBeenCalled();
  });
});
