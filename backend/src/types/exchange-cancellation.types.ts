import type { BookingOrderStatus } from "@prisma/client";
import type { NotificationPayload } from "../repositories/realtime.repository";
import type { LedgerTransactionClient } from "../services/ledger.service";
import type {
  ExchangeCancellationAction,
  ExchangeCancellationParty,
  ExchangeCancellationStatus
} from "../domain/exchange-cancellation";

export type ExchangeCancellationActorScope =
  | { kind: "customer" }
  | { kind: "technician"; technicianProfileId: number }
  | { kind: "merchant"; shopId: number };

export type ExchangeCancellationAllowedAction =
  | "request"
  | "accept"
  | "reject"
  | "withdraw";

export interface ExchangeCancellationPayload {
  orderId: number;
  orderStatus: Lowercase<BookingOrderStatus>;
  viewerParty: ExchangeCancellationParty;
  allowedActions: ExchangeCancellationAllowedAction[];
  cancellation: null | {
    id: number;
    status: ExchangeCancellationStatus;
    reason: string;
    initiatorParty: ExchangeCancellationParty;
    version: number;
    requestedAt: string;
    resolvedAt: string | null;
  };
}

export type ExchangeCancellationCommittedNotification = Pick<
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

export interface ExchangeCancellationActorInput {
  actorUserId: number;
  actorIdentityId: number;
  actorIdentityType: string;
  actorIdentityScopeType: string | null;
  actorIdentityScopeId: number | null;
  actorPublicId: string;
  actorScope: ExchangeCancellationActorScope;
}

export type ExchangeCancellationReadResult =
  | { outcome: "found"; payload: ExchangeCancellationPayload }
  | { outcome: "not_found" | "not_allowed" | "invalid_state" };

export interface ExchangeCancellationCommandInput extends ExchangeCancellationActorInput {
  orderId: number;
  action: ExchangeCancellationAction;
  expectedVersion: number;
  reason: string | null;
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

export interface ExchangeCancellationSettlementOptions {
  capturePublicationFee(input: {
    exchangePostId: number;
    actorUserId: number;
    transactionClient: LedgerTransactionClient;
  }): Promise<void>;
  releaseBookingHold(input: {
    bookingOrderId: number;
    shopId: number;
    technicianProfileId: number;
    serviceId?: number;
    serviceAmountJpy: number;
    scheduledStartAt: Date;
    customerUserId: number;
    actorUserId: number;
    transactionClient: LedgerTransactionClient;
  }): Promise<void>;
  releaseServicePrepayment(input: {
    bookingOrderId: number;
    actorUserId: number;
    transactionClient: LedgerTransactionClient;
  }): Promise<void>;
}

export type ExchangeCancellationRepositoryResult =
  | {
      outcome: "created" | "replayed";
      payload: ExchangeCancellationPayload;
      notifications: ExchangeCancellationCommittedNotification[];
    }
  | {
      outcome:
        | "not_found"
        | "not_allowed"
        | "invalid_state"
        | "version_conflict"
        | "pending_conflict"
        | "idempotency_conflict"
        | "slot_conflict";
      currentVersion?: number;
    };
