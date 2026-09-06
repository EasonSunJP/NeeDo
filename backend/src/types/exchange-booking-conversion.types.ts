import type { LedgerTransactionClient } from "../services/ledger.service";
import type { NotificationPayload } from "../repositories/realtime.repository";

export type ExchangeCommittedNotification = Pick<
  NotificationPayload,
  | "id"
  | "recipientUserId"
  | "recipientIdentityId"
  | "actorUserId"
  | "actorIdentityId"
  | "type"
  | "title"
  | "body"
  | "payload"
  | "readAt"
  | "createdAt"
>;

export interface ExchangeBookingConversionOrderPayload {
  exchangeClaimId: number;
  orderId: number;
  orderNo: string;
  status: "pending";
  providerPublicId: string;
  quoteAmountJpy: number;
  startsAt: string;
  endsAt: string;
}

export interface ExchangeBookingConversionPayload {
  exchangePostId: number;
  matchingVersion: number;
  bookedAt: string;
  orders: ExchangeBookingConversionOrderPayload[];
}

export interface ExchangeBookingConversionInput {
  exchangePostId: number;
  actorUserId: number;
  actorIdentityId: number;
  expectedVersion: number;
  idempotencyKey: string;
  payloadFingerprint: string;
  occurredAt: Date;
  audit: {
    actorId: number;
    action: string;
    targetType: string;
    targetId: number | null;
    ip: string;
    userAgent?: string;
    metadata?: unknown;
  };
}

export interface ExchangeBookingConversionRepositoryOptions {
  invalidateSupersededAffiliate?: (input: {
    transactionClient: LedgerTransactionClient;
    bookingOrderId: number;
    actorUserId: number;
  }) => Promise<void>;
}

export type ExchangeBookingConversionRepositoryResult =
  | {
      outcome: "created" | "replayed";
      payload: ExchangeBookingConversionPayload;
      notifications: ExchangeCommittedNotification[];
      committedOrderIds?: number[];
    }
  | {
      outcome:
        | "not_found"
        | "not_allowed"
        | "invalid_state"
        | "version_conflict"
        | "already_created"
        | "slot_unavailable"
        | "idempotency_conflict";
      currentVersion?: number;
    };
