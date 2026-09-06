import { logger } from "../config/logger";
import { ERROR_CODES } from "../constants/error-codes";
import type { ExchangeBookingOwnerContext } from "../repositories/exchange-booking-conversion.repository";
import type {
  ExchangeBookingConversionInput,
  ExchangeBookingConversionPayload,
  ExchangeBookingConversionRepositoryOptions,
  ExchangeBookingConversionRepositoryResult,
  ExchangeCommittedNotification
} from "../types/exchange-booking-conversion.types";
import { AppError } from "../utils/app-error";
import { sha256StableJson } from "../utils/stable-json";
import type { ExchangeBookingConversionBody } from "../validators/exchange-booking-conversion.validators";
import { exchangeIdempotencyKeySchema } from "../validators/exchange.validators";
import type { AffiliateCheckoutService } from "./affiliate-checkout.service";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import type { UserPolicyEnforcementService } from "./user-policy-enforcement.service";
import type { LiveDashboardOrderChangePublisher } from "./live-dashboard-order-change.publisher";

export interface ExchangeBookingConversionRepositoryPort {
  findOwnerContext(
    exchangePostId: number,
    viewerIdentityId: number
  ): Promise<ExchangeBookingOwnerContext | null>;
  convert(
    input: ExchangeBookingConversionInput,
    options?: ExchangeBookingConversionRepositoryOptions
  ): Promise<ExchangeBookingConversionRepositoryResult>;
}

type RealtimeCommittedNotificationPort = {
  publishCommittedNotifications(notifications: ExchangeCommittedNotification[]): Promise<void>;
};

export class ExchangeBookingConversionService {
  public constructor(
    private readonly repository: ExchangeBookingConversionRepositoryPort,
    private readonly audit: Pick<AuditLogService, "createInput">,
    private readonly affiliate: Pick<AffiliateCheckoutService, "invalidateCancelledBooking">,
    private readonly policy: Pick<UserPolicyEnforcementService, "assertServiceEkyc">,
    private readonly realtime?: RealtimeCommittedNotificationPort,
    private readonly now: () => Date = () => new Date(),
    private readonly liveDashboard?: Pick<LiveDashboardOrderChangePublisher, "publishCommittedOrderChanges">
  ) {}

  public async createBookings(
    access: AuthenticatedAccessContext,
    exchangePostId: number,
    input: ExchangeBookingConversionBody,
    rawIdempotencyKey: string,
    context: AuthRequestContext
  ): Promise<ExchangeBookingConversionPayload> {
    const actorIdentityId = access.currentIdentityId;
    if (!actorIdentityId) throw this.notAllowed();

    const owner = await this.repository.findOwnerContext(exchangePostId, actorIdentityId);
    if (!owner) throw this.notFound();
    if (owner.ownerIdentityId !== actorIdentityId || owner.ownerUserId !== access.userId) {
      throw this.notAllowed();
    }

    const occurredAt = this.now();
    await this.policy.assertServiceEkyc(access.userId, owner.serviceMode, occurredAt);
    const idempotencyKey = exchangeIdempotencyKeySchema.parse(rawIdempotencyKey);
    const payloadFingerprint = sha256StableJson({
      actorUserId: access.userId,
      actorIdentityId,
      exchangePostId,
      expectedVersion: input.expectedVersion
    });
    const audit = this.audit.createInput({
      actor: access,
      action: "exchange.matching.bookings.create",
      targetType: "exchange_request_matching",
      context,
      metadata: { exchangePostId, expectedVersion: input.expectedVersion }
    });
    const result = await this.repository.convert(
      {
        exchangePostId,
        actorUserId: access.userId,
        actorIdentityId,
        expectedVersion: input.expectedVersion,
        idempotencyKey,
        payloadFingerprint,
        occurredAt,
        audit: {
          ...audit,
          actorId: access.userId,
          targetId: audit.targetId ?? null,
          ip: context.ip,
          userAgent: audit.userAgent ?? undefined
        }
      },
      {
        invalidateSupersededAffiliate: (value) => this.affiliate.invalidateCancelledBooking(value)
      }
    );

    if (!("payload" in result)) {
      throw this.mapOutcome(result);
    }
    if (result.outcome === "created" && this.liveDashboard) {
      try {
        await this.liveDashboard.publishCommittedOrderChanges(result.committedOrderIds ?? result.payload.orders.map((order) => order.orderId));
      } catch (error) {
        logger.error({ error, exchangePostId }, "Exchange live dashboard publish failed after commit");
      }
    }
    if (result.outcome === "created" && this.realtime) {
      try {
        await this.realtime.publishCommittedNotifications(result.notifications);
      } catch (error) {
        logger.error(
          { error, exchangePostId },
          "Exchange booking realtime publish failed after commit"
        );
      }
    }
    return result.payload;
  }

  private mapOutcome(
    result: Exclude<ExchangeBookingConversionRepositoryResult, { outcome: "created" | "replayed" }>
  ): AppError {
    const errors = {
      not_found: [
        ERROR_CODES.EXCHANGE_MATCH_BOOKING_NOT_FOUND,
        "error.exchange.match_booking_not_found",
        404
      ],
      not_allowed: [
        ERROR_CODES.EXCHANGE_MATCH_BOOKING_NOT_ALLOWED,
        "error.exchange.match_booking_not_allowed",
        403
      ],
      invalid_state: [
        ERROR_CODES.EXCHANGE_MATCH_BOOKING_INVALID_STATE,
        "error.exchange.match_booking_invalid_state",
        409
      ],
      version_conflict: [
        ERROR_CODES.EXCHANGE_MATCH_BOOKING_VERSION_CONFLICT,
        "error.exchange.match_booking_version_conflict",
        409
      ],
      already_created: [
        ERROR_CODES.EXCHANGE_MATCH_BOOKING_ALREADY_CREATED,
        "error.exchange.match_booking_already_created",
        409
      ],
      slot_unavailable: [
        ERROR_CODES.EXCHANGE_MATCH_BOOKING_SLOT_UNAVAILABLE,
        "error.exchange.match_booking_slot_unavailable",
        409
      ],
      idempotency_conflict: [
        ERROR_CODES.EXCHANGE_MATCH_BOOKING_IDEMPOTENCY_CONFLICT,
        "error.exchange.match_booking_idempotency_conflict",
        409
      ]
    } as const;
    const [code, message, statusCode] = errors[result.outcome];
    return new AppError({
      code,
      message,
      statusCode,
      ...(result.outcome === "version_conflict"
        ? { data: { currentVersion: result.currentVersion } }
        : {})
    });
  }

  private notFound(): AppError {
    return new AppError({
      code: ERROR_CODES.EXCHANGE_MATCH_BOOKING_NOT_FOUND,
      message: "error.exchange.match_booking_not_found",
      statusCode: 404
    });
  }

  private notAllowed(): AppError {
    return new AppError({
      code: ERROR_CODES.EXCHANGE_MATCH_BOOKING_NOT_ALLOWED,
      message: "error.exchange.match_booking_not_allowed",
      statusCode: 403
    });
  }
}
