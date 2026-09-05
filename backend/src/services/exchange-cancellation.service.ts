import { logger } from "../config/logger";
import { ERROR_CODES } from "../constants/error-codes";
import type {
  ExchangeCancellationAction
} from "../domain/exchange-cancellation";
import type {
  ExchangeCancellationActorInput,
  ExchangeCancellationActorScope,
  ExchangeCancellationCommandInput,
  ExchangeCancellationPayload,
  ExchangeCancellationReadResult,
  ExchangeCancellationRepositoryResult,
  ExchangeCancellationSettlementOptions
} from "../types/exchange-cancellation.types";
import { AppError } from "../utils/app-error";
import { sha256StableJson } from "../utils/stable-json";
import type {
  ExchangeCancellationDecisionBody,
  ExchangeCancellationRequestBody
} from "../validators/exchange-cancellation.validators";
import { exchangeIdempotencyKeySchema } from "../validators/exchange.validators";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import type { ExchangeActorLookup, ExchangeActorRecord } from "./exchange.service";
import type { LedgerService } from "./ledger.service";
import { requireMerchantShopId } from "./merchant-shop-scope";

export interface ExchangeCancellationRepositoryPort {
  get(input: ExchangeCancellationActorInput & { orderId: number }): Promise<ExchangeCancellationReadResult>;
  command(
    input: ExchangeCancellationCommandInput,
    options: ExchangeCancellationSettlementOptions
  ): Promise<ExchangeCancellationRepositoryResult>;
}

interface ExchangeCancellationActorResolverPort {
  resolveActor(input: ExchangeActorLookup): Promise<ExchangeActorRecord | null>;
}

type ExchangeCancellationRealtimePort = {
  publishCommittedNotifications(notifications: unknown[]): Promise<void>;
};

const MERCHANT_IDENTITIES = new Set([
  "merchant",
  "merchant_owner",
  "merchant_staff",
  "merchant_organization",
  "business",
  "b",
  "owner",
  "o"
]);

export class ExchangeCancellationService {
  public constructor(
    private readonly repository: ExchangeCancellationRepositoryPort,
    private readonly actorResolver: ExchangeCancellationActorResolverPort,
    private readonly audit: Pick<AuditLogService, "createInput">,
    private readonly ledger: Pick<
      LedgerService,
      "captureExchangeRequestPublication" | "releaseBookingHold"
    >,
    private readonly realtime?: ExchangeCancellationRealtimePort,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async getCancellation(
    access: AuthenticatedAccessContext,
    orderId: number
  ): Promise<ExchangeCancellationPayload> {
    const actor = await this.resolveActor(access);
    const result = await this.repository.get({
      orderId,
      actorUserId: actor.userId,
      actorIdentityId: actor.identityId,
      actorIdentityType: actor.identityType,
      actorIdentityScopeType: actor.scopeType,
      actorIdentityScopeId: actor.scopeId,
      actorPublicId: actor.publicId,
      actorScope: this.resolveActorScope(access, actor)
    });
    if (result.outcome !== "found") throw this.mapReadOutcome(result.outcome);
    return result.payload;
  }

  public requestCancellation(
    access: AuthenticatedAccessContext,
    orderId: number,
    input: ExchangeCancellationRequestBody,
    idempotencyKey: string,
    context: AuthRequestContext
  ): Promise<ExchangeCancellationPayload> {
    return this.executeCommand(access, orderId, "request", input, idempotencyKey, context);
  }

  public decideCancellation(
    access: AuthenticatedAccessContext,
    orderId: number,
    action: Exclude<ExchangeCancellationAction, "request">,
    input: ExchangeCancellationDecisionBody,
    idempotencyKey: string,
    context: AuthRequestContext
  ): Promise<ExchangeCancellationPayload> {
    return this.executeCommand(access, orderId, action, input, idempotencyKey, context);
  }

  private async executeCommand(
    access: AuthenticatedAccessContext,
    orderId: number,
    action: ExchangeCancellationAction,
    input: ExchangeCancellationRequestBody | ExchangeCancellationDecisionBody,
    rawIdempotencyKey: string,
    context: AuthRequestContext
  ): Promise<ExchangeCancellationPayload> {
    const actor = await this.resolveActor(access);
    const actorScope = this.resolveActorScope(access, actor);
    const idempotencyKey = exchangeIdempotencyKeySchema.parse(rawIdempotencyKey);
    const reason = action === "request" ? (input as ExchangeCancellationRequestBody).reason : null;
    const occurredAt = this.now();
    const payloadFingerprint = sha256StableJson({
      actorUserId: actor.userId,
      actorIdentityId: actor.identityId,
      actorIdentityType: actor.identityType,
      actorIdentityScopeType: actor.scopeType,
      actorIdentityScopeId: actor.scopeId,
      actorPublicId: actor.publicId,
      actorScope,
      orderId,
      action,
      expectedVersion: input.expectedVersion,
      reason
    });
    const audit = this.audit.createInput({
      actor: access,
      action: `exchange.cancellation.${action}`,
      targetType: "booking_order",
      targetId: orderId,
      context,
      metadata: { orderId, action, expectedVersion: input.expectedVersion }
    });
    const result = await this.repository.command(
      {
        orderId,
        action,
        actorUserId: actor.userId,
        actorIdentityId: actor.identityId,
        actorIdentityType: actor.identityType,
        actorIdentityScopeType: actor.scopeType,
        actorIdentityScopeId: actor.scopeId,
        actorPublicId: actor.publicId,
        actorScope,
        expectedVersion: input.expectedVersion,
        reason,
        idempotencyKey,
        payloadFingerprint,
        occurredAt,
        audit: {
          ...audit,
          actorId: actor.userId,
          targetId: audit.targetId ?? orderId,
          ip: context.ip,
          userAgent: audit.userAgent ?? undefined
        }
      },
      this.settlementOptions()
    );
    if (!("payload" in result)) throw this.mapCommandOutcome(result);
    if (result.outcome === "created" && this.realtime && result.notifications.length > 0) {
      try {
        await this.realtime.publishCommittedNotifications(result.notifications);
      } catch (error) {
        logger.error(
          { error, orderId },
          "Exchange cancellation realtime publish failed after commit"
        );
      }
    }
    return result.payload;
  }

  private settlementOptions(): ExchangeCancellationSettlementOptions {
    return {
      capturePublicationFee: async (input) => {
        await this.ledger.captureExchangeRequestPublication(
          { exchangePostId: input.exchangePostId, actorUserId: input.actorUserId },
          { transactionClient: input.transactionClient }
        );
      },
      releaseBookingHold: async (input) => {
        await this.ledger.releaseBookingHold(
          {
            bookingOrderId: input.bookingOrderId,
            orderType: "request",
            shopId: input.shopId,
            technicianProfileId: input.technicianProfileId,
            serviceId: input.serviceId,
            serviceAmountJpy: input.serviceAmountJpy,
            scheduledStartAt: input.scheduledStartAt,
            customerUserId: input.customerUserId,
            actorUserId: input.actorUserId
          },
          { transactionClient: input.transactionClient }
        );
      }
    };
  }

  private async resolveActor(access: AuthenticatedAccessContext): Promise<ExchangeActorRecord> {
    if (!access.currentIdentityId || !access.currentIdentityType || !access.currentPublicId) {
      throw this.notAllowed();
    }
    const lookup: ExchangeActorLookup = {
      userId: access.userId,
      identityId: access.currentIdentityId,
      identityType: access.currentIdentityType,
      scopeType: access.currentIdentityScopeType ?? null,
      scopeId: access.currentIdentityScopeId ?? null,
      publicId: access.currentPublicId
    };
    const actor = await this.actorResolver.resolveActor(lookup);
    if (
      !actor ||
      actor.userId !== lookup.userId ||
      actor.identityId !== lookup.identityId ||
      actor.identityType !== lookup.identityType ||
      actor.scopeType !== lookup.scopeType ||
      actor.scopeId !== lookup.scopeId ||
      actor.publicId !== lookup.publicId
    ) {
      throw this.notAllowed();
    }
    return actor;
  }

  private resolveActorScope(
    access: AuthenticatedAccessContext,
    actor: ExchangeActorRecord
  ): ExchangeCancellationActorScope {
    if (access.isReadOnlyMerchantPreview) throw this.notAllowed();
    if (actor.identityType === "technician") {
      if (
        actor.scopeType !== "technician_profile" ||
        !actor.scopeId ||
        !Number.isSafeInteger(actor.scopeId)
      ) {
        throw this.notAllowed();
      }
      return { kind: "technician", technicianProfileId: actor.scopeId };
    }
    if (MERCHANT_IDENTITIES.has(actor.identityType)) {
      try {
        return { kind: "merchant", shopId: requireMerchantShopId(access) };
      } catch {
        throw this.notAllowed();
      }
    }
    return { kind: "customer" };
  }

  private mapReadOutcome(outcome: Exclude<ExchangeCancellationReadResult["outcome"], "found">): AppError {
    if (outcome === "not_allowed") return this.notAllowed();
    if (outcome === "invalid_state") return this.invalidState();
    return this.notFound();
  }

  private mapCommandOutcome(
    result: Exclude<ExchangeCancellationRepositoryResult, { outcome: "created" | "replayed" }>
  ): AppError {
    const errors = {
      not_found: [ERROR_CODES.EXCHANGE_CANCELLATION_NOT_FOUND, "error.exchange.cancellation_not_found", 404],
      not_allowed: [ERROR_CODES.EXCHANGE_CANCELLATION_NOT_ALLOWED, "error.exchange.cancellation_not_allowed", 403],
      invalid_state: [ERROR_CODES.EXCHANGE_CANCELLATION_INVALID_STATE, "error.exchange.cancellation_invalid_state", 409],
      version_conflict: [ERROR_CODES.EXCHANGE_CANCELLATION_VERSION_CONFLICT, "error.exchange.cancellation_version_conflict", 409],
      pending_conflict: [ERROR_CODES.EXCHANGE_CANCELLATION_PENDING_CONFLICT, "error.exchange.cancellation_pending_conflict", 409],
      idempotency_conflict: [ERROR_CODES.EXCHANGE_CANCELLATION_IDEMPOTENCY_CONFLICT, "error.exchange.cancellation_idempotency_conflict", 409],
      slot_conflict: [ERROR_CODES.EXCHANGE_CANCELLATION_SLOT_CONFLICT, "error.exchange.cancellation_slot_conflict", 409]
    } as const;
    const [code, message, statusCode] = errors[result.outcome];
    return new AppError({
      code,
      message,
      statusCode,
      ...(result.outcome === "version_conflict"
        ? { data: { currentVersion: result.currentVersion ?? null } }
        : {})
    });
  }

  private notAllowed(): AppError {
    return new AppError({
      code: ERROR_CODES.EXCHANGE_CANCELLATION_NOT_ALLOWED,
      message: "error.exchange.cancellation_not_allowed",
      statusCode: 403
    });
  }

  private notFound(): AppError {
    return new AppError({
      code: ERROR_CODES.EXCHANGE_CANCELLATION_NOT_FOUND,
      message: "error.exchange.cancellation_not_found",
      statusCode: 404
    });
  }

  private invalidState(): AppError {
    return new AppError({
      code: ERROR_CODES.EXCHANGE_CANCELLATION_INVALID_STATE,
      message: "error.exchange.cancellation_invalid_state",
      statusCode: 409
    });
  }
}
