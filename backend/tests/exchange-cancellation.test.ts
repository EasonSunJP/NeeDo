import { BookingOrderStatus, OrderType, ServicePaymentStatus } from "@prisma/client";
import {
  decideExchangeCancellation,
  type ExchangeCancellationActor,
  type ExchangeCancellationInput,
  type ExchangeCancellationRequest
} from "../src/domain/exchange-cancellation";

const customer: ExchangeCancellationActor = { userId: 10, identityId: 11, party: "customer" };
const provider: ExchangeCancellationActor = { userId: 20, identityId: 21, party: "provider" };
const pendingRequest: ExchangeCancellationRequest = {
  orderId: 40,
  initiatedBy: customer,
  status: "pending",
  version: 1
};
const input: ExchangeCancellationInput = {
  action: "request",
  expectedVersion: 0,
  actor: customer,
  latestRequest: null,
  order: {
    id: 40,
    participantBookingOrderId: 40,
    orderType: OrderType.REQUEST,
    status: BookingOrderStatus.PENDING,
    paymentStatus: ServicePaymentStatus.PENDING,
    paymentConfirmedAt: null,
    paymentRefundedAt: null,
    serviceStartedAt: null,
    deletedAt: null
  }
};
const responding: ExchangeCancellationInput = {
  ...input,
  action: "accept",
  expectedVersion: 1,
  actor: provider,
  latestRequest: pendingRequest
};

describe("Exchange per-order bilateral cancellation policy", () => {
  it.each([customer, provider])(
    "allows either party to initiate without cancelling the order: %j",
    (actor) => {
      expect(decideExchangeCancellation({ ...input, actor })).toEqual({
        ok: true,
        status: "pending",
        version: 1,
        effect: "none"
      });
    }
  );

  it.each([BookingOrderStatus.PENDING, BookingOrderStatus.CONFIRMED])(
    "allows the opposite party to accept a currently unpaid %s order",
    (status) => {
      for (const [initiatedBy, actor] of [
        [customer, provider],
        [provider, customer]
      ]) {
        expect(
          decideExchangeCancellation({
            ...responding,
            actor,
            latestRequest: { ...pendingRequest, initiatedBy },
            order: { ...input.order, status }
          })
        ).toEqual({ ok: true, status: "accepted", version: 2, effect: "cancel_order" });
      }
    }
  );

  it.each(["accept", "reject"] as const)(
    "rejects %s from the initiating party or account",
    (action) => {
      for (const actor of [
        customer,
        { ...customer, userId: 30, identityId: 31 },
        { ...provider, userId: customer.userId },
        { ...provider, identityId: customer.identityId }
      ]) {
        expect(decideExchangeCancellation({ ...responding, action, actor })).toEqual({
          ok: false,
          reason: "not_allowed"
        });
      }
    }
  );

  it("does not mistake another provider employee for the opposing party", () => {
    expect(
      decideExchangeCancellation({
        ...responding,
        latestRequest: { ...pendingRequest, initiatedBy: provider },
        actor: { userId: 30, identityId: 31, party: "provider" }
      })
    ).toEqual({ ok: false, reason: "not_allowed" });
  });

  it("only lets the original account and identity withdraw", () => {
    expect(
      decideExchangeCancellation({ ...responding, action: "withdraw", actor: customer })
    ).toEqual({ ok: true, status: "withdrawn", version: 2, effect: "none" });
    for (const actor of [provider, { ...customer, identityId: 31 }, { ...customer, userId: 30 }]) {
      expect(decideExchangeCancellation({ ...responding, action: "withdraw", actor })).toEqual({
        ok: false,
        reason: "not_allowed"
      });
    }
  });

  it.each(["request", "accept", "reject", "withdraw"] as const)(
    "rejects %s without a resolved actor",
    (action) => {
      expect(decideExchangeCancellation({ ...responding, action, actor: null })).toEqual({
        ok: false,
        reason: "not_allowed"
      });
    }
  );

  it.each(["request", "accept", "reject", "withdraw"] as const)(
    "rejects %s for an unrelated or deleted order",
    (action) => {
      for (const patch of [
        { participantBookingOrderId: null },
        { participantBookingOrderId: 41 },
        { orderType: OrderType.BOOKING },
        { deletedAt: new Date("2026-09-05T00:00:00Z") }
      ]) {
        expect(
          decideExchangeCancellation({ ...responding, action, order: { ...input.order, ...patch } })
        ).toEqual({ ok: false, reason: "order_not_eligible" });
      }
    }
  );

  it("rejects a request snapshot from a different order", () => {
    expect(
      decideExchangeCancellation({
        ...responding,
        latestRequest: { ...pendingRequest, orderId: 41 }
      })
    ).toEqual({ ok: false, reason: "request_order_mismatch" });
  });

  it.each([-1, 0, 2, 1.5, NaN, Infinity, 2_147_483_647])(
    "rejects stale or invalid response version %s",
    (expectedVersion) => {
      expect(decideExchangeCancellation({ ...responding, expectedVersion })).toEqual({
        ok: false,
        reason: "version_conflict"
      });
    }
  );

  it.each([0, -1, 1.5, NaN, Infinity, 2_147_483_647])(
    "rejects invalid persisted request version %s",
    (version) => {
      expect(
        decideExchangeCancellation({
          ...responding,
          expectedVersion: version,
          latestRequest: { ...pendingRequest, version }
        })
      ).toEqual({ ok: false, reason: "version_conflict" });
    }
  );

  it("rejects a second active request, even from the opposite party", () => {
    expect(decideExchangeCancellation({ ...responding, action: "request" })).toEqual({
      ok: false,
      reason: "request_already_pending"
    });
  });

  it("reserves version capacity for responding before opening a new request", () => {
    expect(
      decideExchangeCancellation({
        ...input,
        expectedVersion: 2_147_483_646,
        latestRequest: { ...pendingRequest, status: "rejected", version: 2_147_483_646 }
      })
    ).toEqual({ ok: false, reason: "version_conflict" });
  });

  it("allows the final resolvable request and its response at the integer boundary", () => {
    expect(
      decideExchangeCancellation({
        ...input,
        expectedVersion: 2_147_483_645,
        latestRequest: { ...pendingRequest, status: "withdrawn", version: 2_147_483_645 }
      })
    ).toEqual({ ok: true, status: "pending", version: 2_147_483_646, effect: "none" });
    expect(
      decideExchangeCancellation({
        ...responding,
        expectedVersion: 2_147_483_646,
        latestRequest: { ...pendingRequest, version: 2_147_483_646 }
      })
    ).toEqual({ ok: true, status: "accepted", version: 2_147_483_647, effect: "cancel_order" });
  });

  it.each(["rejected", "withdrawn"] as const)(
    "allows a new request after %s with a monotonic version",
    (status) => {
      expect(
        decideExchangeCancellation({
          ...input,
          expectedVersion: 2,
          latestRequest: { ...pendingRequest, status, version: 2 }
        })
      ).toEqual({ ok: true, status: "pending", version: 3, effect: "none" });
    }
  );

  it.each(["request", "accept", "reject", "withdraw"] as const)(
    "never reopens or repeats an accepted request with %s",
    (action) => {
      expect(
        decideExchangeCancellation({
          ...responding,
          action,
          latestRequest: { ...pendingRequest, status: "accepted" }
        })
      ).toEqual({ ok: false, reason: "request_not_pending" });
    }
  );

  it.each(["accept", "reject", "withdraw"] as const)(
    "requires a pending request for %s",
    (action) => {
      for (const latestRequest of [
        null,
        { ...pendingRequest, status: "rejected" as const },
        { ...pendingRequest, status: "withdrawn" as const }
      ]) {
        expect(
          decideExchangeCancellation({
            ...responding,
            action,
            latestRequest,
            expectedVersion: latestRequest?.version ?? 0
          })
        ).toEqual({ ok: false, reason: "request_not_pending" });
      }
    }
  );

  it.each(
    Object.values(BookingOrderStatus).filter(
      (status) => status !== BookingOrderStatus.PENDING && status !== BookingOrderStatus.CONFIRMED
    )
  )("does not initiate or accept for progressed order %s", (status) => {
    for (const base of [input, responding]) {
      expect(decideExchangeCancellation({ ...base, order: { ...input.order, status } })).toEqual({
        ok: false,
        reason: "order_not_eligible"
      });
    }
  });

  it.each(
    Object.values(ServicePaymentStatus).filter((status) => status !== ServicePaymentStatus.PENDING)
  )("does not initiate or accept for payment status %s", (paymentStatus) => {
    for (const base of [input, responding]) {
      expect(
        decideExchangeCancellation({ ...base, order: { ...input.order, paymentStatus } })
      ).toEqual({ ok: false, reason: "order_not_eligible" });
    }
  });

  it.each(["paymentConfirmedAt", "paymentRefundedAt", "serviceStartedAt"] as const)(
    "rechecks %s rather than relying only on order status",
    (field) => {
      for (const base of [input, responding]) {
        expect(
          decideExchangeCancellation({
            ...base,
            order: { ...input.order, [field]: new Date("2026-09-05T00:00:00Z") }
          })
        ).toEqual({ ok: false, reason: "order_not_eligible" });
      }
    }
  );

  it.each([BookingOrderStatus.IN_SERVICE, BookingOrderStatus.COMPLETED])(
    "allows closing an old request after %s without cancelling the order",
    (status) => {
      const order = { ...input.order, status, paymentStatus: ServicePaymentStatus.CONFIRMED };
      expect(decideExchangeCancellation({ ...responding, order, action: "reject" })).toEqual({
        ok: true,
        status: "rejected",
        version: 2,
        effect: "none"
      });
      expect(
        decideExchangeCancellation({ ...responding, order, action: "withdraw", actor: customer })
      ).toEqual({ ok: true, status: "withdrawn", version: 2, effect: "none" });
    }
  );

  it.each(["request", "accept", "reject", "withdraw"] as const)(
    "does not mutate the input facts when evaluating %s",
    (action) => {
      const base = action === "request" ? input : responding;
      const frozen = Object.freeze({
        ...base,
        action,
        actor: Object.freeze(action === "withdraw" ? customer : base.actor!),
        order: Object.freeze({ ...input.order }),
        latestRequest: base.latestRequest
          ? Object.freeze({ ...pendingRequest, initiatedBy: Object.freeze(customer) })
          : null
      });
      const before = JSON.stringify(frozen);
      const result = decideExchangeCancellation(frozen);
      expect(result.ok).toBe(true);
      expect(result).toEqual(decideExchangeCancellation(frozen));
      expect(JSON.stringify(frozen)).toBe(before);
    }
  );
});
