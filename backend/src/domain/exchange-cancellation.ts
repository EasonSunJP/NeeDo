import { BookingOrderStatus, OrderType, ServicePaymentStatus } from "@prisma/client";

export type ExchangeCancellationParty = "customer" | "provider";
export type ExchangeCancellationAction = "request" | "accept" | "reject" | "withdraw";
export type ExchangeCancellationStatus = "pending" | "accepted" | "rejected" | "withdrawn";

/** Resolved from authenticated identity and current order/shop scope, never from request body. */
export interface ExchangeCancellationActor {
  userId: number;
  identityId: number;
  party: ExchangeCancellationParty;
}

export interface ExchangeCancellationRequest {
  orderId: number;
  initiatedBy: ExchangeCancellationActor;
  status: ExchangeCancellationStatus;
  version: number;
}

/** The command repository must read these facts again while holding the order lock. */
export interface ExchangeCancellationOrderFacts {
  id: number;
  participantBookingOrderId: number | null;
  orderType: OrderType;
  status: BookingOrderStatus;
  paymentStatus: ServicePaymentStatus;
  paymentConfirmedAt: Date | null;
  paymentRefundedAt: Date | null;
  serviceStartedAt: Date | null;
  deletedAt: Date | null;
}

export interface ExchangeCancellationInput {
  action: ExchangeCancellationAction;
  expectedVersion: number;
  actor: ExchangeCancellationActor | null;
  order: ExchangeCancellationOrderFacts;
  latestRequest: ExchangeCancellationRequest | null;
}

export type ExchangeCancellationFailure =
  | "not_allowed"
  | "order_not_eligible"
  | "request_order_mismatch"
  | "version_conflict"
  | "request_already_pending"
  | "request_not_pending";

export type ExchangeCancellationDecision =
  | {
      ok: true;
      status: Exclude<ExchangeCancellationStatus, "accepted">;
      version: number;
      effect: "none";
    }
  | { ok: true; status: "accepted"; version: number; effect: "cancel_order" }
  | { ok: false; reason: ExchangeCancellationFailure };

// Leave room for the next persisted signed-INT version.
export const EXCHANGE_CANCELLATION_MAX_EXPECTED_VERSION = 2_147_483_646;
export const EXCHANGE_CANCELLATION_MAX_REQUEST_VERSION =
  EXCHANGE_CANCELLATION_MAX_EXPECTED_VERSION - 1;

const invalid = (reason: ExchangeCancellationFailure): ExchangeCancellationDecision => ({
  ok: false,
  reason
});

const isVersion = (version: number, minimum: number): boolean =>
  Number.isInteger(version) &&
  version >= minimum &&
  version <= EXCHANGE_CANCELLATION_MAX_EXPECTED_VERSION;

const canCancelOrder = (order: ExchangeCancellationOrderFacts): boolean =>
  (order.status === BookingOrderStatus.PENDING || order.status === BookingOrderStatus.CONFIRMED) &&
  order.paymentStatus === ServicePaymentStatus.PENDING &&
  order.paymentConfirmedAt === null &&
  order.paymentRefundedAt === null &&
  order.serviceStartedAt === null;

/**
 * Pure decision only: success is not a committed cancellation. The transaction layer owns
 * idempotent replay, unique active requests, order/slot/ledger writes, audit and notifications.
 */
export const decideExchangeCancellation = (
  input: ExchangeCancellationInput
): ExchangeCancellationDecision => {
  const { actor, order, latestRequest, action, expectedVersion } = input;
  if (!actor) return invalid("not_allowed");
  if (
    order.deletedAt !== null ||
    order.orderType !== OrderType.REQUEST ||
    order.participantBookingOrderId !== order.id
  ) {
    return invalid("order_not_eligible");
  }
  if (latestRequest && latestRequest.orderId !== order.id) {
    return invalid("request_order_mismatch");
  }

  const version = latestRequest?.version ?? 0;
  if (
    !isVersion(expectedVersion, 0) ||
    !isVersion(version, latestRequest ? 1 : 0) ||
    expectedVersion !== version
  ) {
    return invalid("version_conflict");
  }

  if (action === "request") {
    if (version > EXCHANGE_CANCELLATION_MAX_REQUEST_VERSION) return invalid("version_conflict");
    if (latestRequest?.status === "pending") return invalid("request_already_pending");
    if (
      latestRequest &&
      latestRequest.status !== "rejected" &&
      latestRequest.status !== "withdrawn"
    ) {
      return invalid("request_not_pending");
    }
    if (!canCancelOrder(order)) return invalid("order_not_eligible");
    return { ok: true, status: "pending", version: version + 1, effect: "none" };
  }

  if (!latestRequest || latestRequest.status !== "pending") return invalid("request_not_pending");

  const initiator = latestRequest.initiatedBy;
  if (action === "withdraw") {
    if (
      actor.userId !== initiator.userId ||
      actor.identityId !== initiator.identityId ||
      actor.party !== initiator.party
    ) {
      return invalid("not_allowed");
    }
    return { ok: true, status: "withdrawn", version: version + 1, effect: "none" };
  }

  if (
    actor.party === initiator.party ||
    actor.userId === initiator.userId ||
    actor.identityId === initiator.identityId
  ) {
    return invalid("not_allowed");
  }
  if (action === "reject") {
    return { ok: true, status: "rejected", version: version + 1, effect: "none" };
  }
  if (action === "accept") {
    if (!canCancelOrder(order)) return invalid("order_not_eligible");
    return { ok: true, status: "accepted", version: version + 1, effect: "cancel_order" };
  }
  return invalid("not_allowed");
};
