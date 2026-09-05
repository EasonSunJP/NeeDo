import { logger } from "../src/config/logger";
import { ERROR_CODES } from "../src/constants/error-codes";
import type { ExchangeCancellationPayload } from "../src/types/exchange-cancellation.types";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import type { ExchangeActorRecord } from "../src/services/exchange.service";
import { ExchangeCancellationService } from "../src/services/exchange-cancellation.service";
import { sha256StableJson } from "../src/utils/stable-json";

const now = new Date("2026-09-05T03:00:00.000Z");
const context = { ip: "127.0.0.1", userAgent: "exchange-cancellation-test" };
const access: AuthenticatedAccessContext = {
  userId: 41,
  email: "customer@example.com",
  accessTokenJti: "access-jti",
  accessTokenExpiresAt: 1_800_000_000,
  currentIdentityId: 410,
  currentPublicId: "u0000000041",
  currentIdentityType: "customer",
  currentIdentityScopeType: "customer_profile",
  currentIdentityScopeId: 4100,
  roles: ["customer"],
  permissions: ["exchange:cancellation:read-own", "exchange:cancellation:write-own"]
};
const actor: ExchangeActorRecord = {
  userId: 41,
  identityId: 410,
  identityType: "customer",
  scopeType: "customer_profile",
  scopeId: 4100,
  publicId: "u0000000041",
  displayName: "Customer",
  avatarUrl: null,
  isTestAccount: true,
  customerMembership: null,
  shopScope: null
};
const payload: ExchangeCancellationPayload = {
  orderId: 501,
  orderStatus: "pending",
  viewerParty: "customer",
  allowedActions: ["request"],
  cancellation: null
};

function fixture(commandResult: unknown = { outcome: "created", payload, notifications: [] }) {
  const repository = {
    get: jest.fn(async () => ({ outcome: "found", payload })),
    command: jest.fn(async (_input, options) => {
      await options.capturePublicationFee({
        exchangePostId: 42,
        actorUserId: 41,
        transactionClient: { marker: "transaction" }
      });
      await options.releaseBookingHold({
        bookingOrderId: 501,
        shopId: 8,
        technicianProfileId: 9,
        serviceId: 10,
        serviceAmountJpy: 12_000,
        scheduledStartAt: now,
        customerUserId: 41,
        actorUserId: 41,
        transactionClient: { marker: "transaction" }
      });
      return commandResult;
    })
  };
  const actorResolver = { resolveActor: jest.fn(async () => actor) };
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
  const ledger = {
    captureExchangeRequestPublication: jest.fn(async () => undefined),
    releaseBookingHold: jest.fn(async () => undefined)
  };
  const realtime = { publishCommittedNotifications: jest.fn(async () => undefined) };
  const service = new ExchangeCancellationService(
    repository as never,
    actorResolver,
    audit as never,
    ledger as never,
    realtime,
    () => now
  );
  return { repository, actorResolver, audit, ledger, realtime, service };
}

describe("ExchangeCancellationService", () => {
  it("verifies the exact authenticated actor and reads only its server scope", async () => {
    const state = fixture();
    await expect(state.service.getCancellation(access, 501)).resolves.toEqual(payload);
    expect(state.actorResolver.resolveActor).toHaveBeenCalledWith({
      userId: 41,
      identityId: 410,
      identityType: "customer",
      scopeType: "customer_profile",
      scopeId: 4100,
      publicId: "u0000000041"
    });
    expect(state.repository.get).toHaveBeenCalledWith({
      orderId: 501,
      actorUserId: 41,
      actorIdentityId: 410,
      actorIdentityType: "customer",
      actorIdentityScopeType: "customer_profile",
      actorIdentityScopeId: 4100,
      actorPublicId: "u0000000041",
      actorScope: { kind: "customer" }
    });
  });

  it("derives technician and selected merchant provider scope without trusting the body", async () => {
    const technician = fixture();
    technician.actorResolver.resolveActor.mockResolvedValueOnce({
      ...actor,
      identityType: "technician",
      scopeType: "technician_profile",
      scopeId: 99
    });
    await technician.service.getCancellation(
      {
        ...access,
        currentIdentityType: "technician",
        currentIdentityScopeType: "technician_profile",
        currentIdentityScopeId: 99
      },
      501
    );
    expect(technician.repository.get).toHaveBeenCalledWith(
      expect.objectContaining({ actorScope: { kind: "technician", technicianProfileId: 99 } })
    );

    const merchant = fixture();
    merchant.actorResolver.resolveActor.mockResolvedValueOnce({
      ...actor,
      identityType: "merchant_owner",
      scopeType: "merchant_account",
      scopeId: 77
    });
    await merchant.service.getCancellation(
      {
        ...access,
        currentIdentityType: "merchant_owner",
        currentIdentityScopeType: "merchant_account",
        currentIdentityScopeId: 77,
        selectedMerchantShopId: 8
      },
      501
    );
    expect(merchant.repository.get).toHaveBeenCalledWith(
      expect.objectContaining({ actorScope: { kind: "merchant", shopId: 8 } })
    );
  });

  it("rejects missing, changed, malformed, or read-only preview identities before repository access", async () => {
    for (const badAccess of [
      { ...access, currentIdentityId: undefined },
      { ...access, currentPublicId: null },
      { ...access, isReadOnlyMerchantPreview: true, currentIdentityType: "merchant_owner" }
    ]) {
      const state = fixture();
      if (badAccess.currentIdentityId && badAccess.currentPublicId) {
        state.actorResolver.resolveActor.mockResolvedValueOnce({ ...actor, userId: 99 });
      }
      await expect(state.service.getCancellation(badAccess, 501)).rejects.toMatchObject({
        code: ERROR_CODES.EXCHANGE_CANCELLATION_NOT_ALLOWED,
        statusCode: 403
      });
      expect(state.repository.get).not.toHaveBeenCalled();
    }
  });

  it("fingerprints and forwards a request with same-transaction formal ledger callbacks", async () => {
    const state = fixture();
    await expect(
      state.service.requestCancellation(
        access,
        501,
        { expectedVersion: 0, reason: "time conflict" },
        "idem-cancel-000001",
        context
      )
    ).resolves.toEqual(payload);

    expect(state.repository.command).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 501,
        action: "request",
        actorUserId: 41,
        actorIdentityId: 410,
        actorScope: { kind: "customer" },
        expectedVersion: 0,
        reason: "time conflict",
        idempotencyKey: "idem-cancel-000001",
        payloadFingerprint: sha256StableJson({
          actorUserId: 41,
          actorIdentityId: 410,
          actorIdentityType: "customer",
          actorIdentityScopeType: "customer_profile",
          actorIdentityScopeId: 4100,
          actorPublicId: "u0000000041",
          actorScope: { kind: "customer" },
          orderId: 501,
          action: "request",
          expectedVersion: 0,
          reason: "time conflict"
        }),
        occurredAt: now,
        audit: expect.objectContaining({
          action: "exchange.cancellation.request",
          targetType: "booking_order",
          targetId: 501
        })
      }),
      expect.objectContaining({
        capturePublicationFee: expect.any(Function),
        releaseBookingHold: expect.any(Function)
      })
    );
    expect(state.ledger.captureExchangeRequestPublication).toHaveBeenCalledWith(
      { exchangePostId: 42, actorUserId: 41 },
      { transactionClient: { marker: "transaction" } }
    );
    expect(state.ledger.releaseBookingHold).toHaveBeenCalledWith(
      expect.objectContaining({ bookingOrderId: 501, orderType: "request" }),
      { transactionClient: { marker: "transaction" } }
    );
  });

  it("maps repository failures and publishes realtime only for a new commit", async () => {
    const conflict = fixture({ outcome: "version_conflict", currentVersion: 3 });
    await expect(
      conflict.service.decideCancellation(
        access,
        501,
        "accept",
        { expectedVersion: 1 },
        "idem-cancel-000002",
        context
      )
    ).rejects.toMatchObject({
      code: ERROR_CODES.EXCHANGE_CANCELLATION_VERSION_CONFLICT,
      message: "error.exchange.cancellation_version_conflict",
      statusCode: 409,
      data: { currentVersion: 3 }
    });
    expect(conflict.realtime.publishCommittedNotifications).not.toHaveBeenCalled();

    const notifications = [{ id: 7 }];
    const committed = fixture({ outcome: "created", payload, notifications });
    await committed.service.decideCancellation(
      access,
      501,
      "reject",
      { expectedVersion: 1 },
      "idem-cancel-000003",
      context
    );
    expect(committed.realtime.publishCommittedNotifications).toHaveBeenCalledWith(notifications);

    const replayed = fixture({ outcome: "replayed", payload, notifications });
    await replayed.service.decideCancellation(
      access,
      501,
      "withdraw",
      { expectedVersion: 1 },
      "idem-cancel-000004",
      context
    );
    expect(replayed.realtime.publishCommittedNotifications).not.toHaveBeenCalled();
  });

  it("does not roll back a committed command when realtime transport fails", async () => {
    const state = fixture({ outcome: "created", payload, notifications: [{ id: 7 }] });
    const failure = new Error("gateway unavailable");
    state.realtime.publishCommittedNotifications.mockRejectedValueOnce(failure);
    const errorSpy = jest.spyOn(logger, "error").mockImplementation(() => undefined as never);
    await expect(
      state.service.decideCancellation(
        access,
        501,
        "accept",
        { expectedVersion: 1 },
        "idem-cancel-000005",
        context
      )
    ).resolves.toEqual(payload);
    expect(errorSpy).toHaveBeenCalledWith(
      { error: failure, orderId: 501 },
      "Exchange cancellation realtime publish failed after commit"
    );
    errorSpy.mockRestore();
  });
});
