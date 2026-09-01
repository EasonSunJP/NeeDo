import { ERROR_CODES } from "../constants/error-codes";
import type { AuditLogCreateInput } from "../repositories/audit-log.repository";
import type {
  CompleteExchangeSelectionInput,
  ExchangeMatchingRecord,
  ExchangeMatchingSelectionClaim
} from "../repositories/exchange-matching.repository";
import type { ExchangeMatchingPayload } from "../types/exchange-matching.types";
import { AppError } from "../utils/app-error";
import { sha256StableJson } from "../utils/stable-json";
import type { SelectExchangeMatchBody } from "../validators/exchange-matching.validators";
import { exchangeIdempotencyKeySchema } from "../validators/exchange.validators";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";

export interface ExchangeMatchingRepositoryPort {
  runInTransaction<T>(
    handler: (repository: ExchangeMatchingRepositoryPort) => Promise<T>
  ): Promise<T>;
  findForViewer(
    exchangePostId: number,
    viewerIdentityId: number
  ): Promise<ExchangeMatchingRecord | null>;
  findIdempotentSelection(idempotencyKey: string): Promise<{
    payload: ExchangeMatchingPayload;
    payloadFingerprint: string;
  } | null>;
  lockMatching(exchangePostId: number): Promise<ExchangeMatchingRecord | null>;
  lockActiveClaims(exchangePostId: number): Promise<ExchangeMatchingSelectionClaim[]>;
  lockTechnicians(technicianProfileIds: number[]): Promise<boolean>;
  hasParticipantConflict(
    technicianProfileId: number,
    startsAt: Date,
    endsAt: Date
  ): Promise<boolean>;
  hasBookingConflict(
    technicianProfileId: number,
    startsAt: Date,
    endsAt: Date
  ): Promise<boolean>;
  completeSelection(input: CompleteExchangeSelectionInput): Promise<ExchangeMatchingPayload | null>;
}

export class ExchangeMatchingService {
  public constructor(
    private readonly repository: ExchangeMatchingRepositoryPort,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async getMatching(
    access: AuthenticatedAccessContext,
    exchangePostId: number
  ): Promise<ExchangeMatchingPayload> {
    const identityId = this.requireIdentityId(access);
    const record = await this.repository.findForViewer(
      exchangePostId,
      identityId
    );
    if (!record) throw this.notFound();
    return record.payload;
  }

  public async selectMatching(
    access: AuthenticatedAccessContext,
    exchangePostId: number,
    input: SelectExchangeMatchBody,
    rawIdempotencyKey: string,
    context: AuthRequestContext
  ): Promise<ExchangeMatchingPayload> {
    const identityId = this.requireIdentityId(access);
    const idempotencyKey = exchangeIdempotencyKeySchema.parse(rawIdempotencyKey);
    const selectedClaimIds = [...input.selectedClaimIds].sort((left, right) => left - right);
    const payloadFingerprint = sha256StableJson({
      actorUserId: access.userId,
      actorIdentityId: identityId,
      exchangePostId,
      selectedClaimIds,
      expectedVersion: input.expectedVersion
    });

    try {
      return await this.repository.runInTransaction(async (repository) => {
        const replay = await repository.findIdempotentSelection(idempotencyKey);
        if (replay) return this.unwrapReplay(replay, payloadFingerprint);

        const matching = await repository.lockMatching(exchangePostId);
        this.assertSelectable(matching, access, input.expectedVersion, this.now());
        if (selectedClaimIds.length !== matching!.effectiveTargetProviderCount) {
          throw this.countMismatch();
        }

        const activeClaims = await repository.lockActiveClaims(exchangePostId);
        const activeById = new Map(activeClaims.map((claim) => [claim.id, claim]));
        const selectedClaims = selectedClaimIds.map((claimId) => activeById.get(claimId));
        if (selectedClaims.some((claim) => !claim)) throw this.claimSetInvalid();
        const exactClaims = selectedClaims as ExchangeMatchingSelectionClaim[];
        if (new Set(exactClaims.map((claim) => claim.technicianProfileId)).size !== exactClaims.length) {
          throw this.claimSetInvalid();
        }

        const selectedQuoteTotalJpy = exactClaims.reduce(
          (total, claim) => total + claim.quoteAmountJpy,
          0
        );
        if (selectedQuoteTotalJpy > matching!.effectiveBudgetMaxJpy) {
          throw this.budgetExceeded();
        }

        const technicianProfileIds = exactClaims
          .map((claim) => claim.technicianProfileId)
          .sort((left, right) => left - right);
        if (!(await repository.lockTechnicians(technicianProfileIds))) {
          throw this.timeConflict();
        }
        for (const claim of exactClaims) {
          if (
            (await repository.hasParticipantConflict(
              claim.technicianProfileId,
              claim.estimatedStartsAt,
              claim.estimatedEndsAt
            )) ||
            (await repository.hasBookingConflict(
              claim.technicianProfileId,
              claim.estimatedStartsAt,
              claim.estimatedEndsAt
            ))
          ) {
            throw this.timeConflict();
          }
        }

        const unselectedClaimIds = activeClaims
          .map((claim) => claim.id)
          .filter((claimId) => !selectedClaimIds.includes(claimId));
        const versionAfter = matching!.version + 1;
        const completed = await repository.completeSelection({
          matchingId: matching!.id,
          exchangePostId,
          selectedClaims: exactClaims,
          selectedClaimIds,
          unselectedClaimIds,
          selectedQuoteTotalJpy,
          versionBefore: matching!.version,
          versionAfter,
          actorUserId: access.userId,
          actorIdentityId: identityId,
          idempotencyKey,
          payloadFingerprint,
          at: this.now(),
          audit: this.audit(
            access,
            identityId,
            context,
            matching!,
            selectedClaimIds,
            selectedQuoteTotalJpy
          )
        });
        if (!completed) throw this.versionConflict();
        return completed;
      });
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
      const replay = await this.repository.findIdempotentSelection(idempotencyKey);
      if (replay) return this.unwrapReplay(replay, payloadFingerprint);
      throw this.timeConflict();
    }
  }

  private assertSelectable(
    matching: ExchangeMatchingRecord | null,
    access: AuthenticatedAccessContext,
    expectedVersion: number,
    at: Date
  ): asserts matching is ExchangeMatchingRecord {
    if (!matching) throw this.notFound();
    if (matching.ownerIdentityId !== access.currentIdentityId) throw this.notAllowed();
    if (
      matching.postType !== "demand" ||
      matching.postStatus !== "published" ||
      matching.matchMode !== "selective" ||
      matching.status !== "open" ||
      matching.expiresAt <= at
    ) {
      throw this.invalidState();
    }
    if (matching.version !== expectedVersion) {
      throw new AppError({
        code: ERROR_CODES.EXCHANGE_MATCH_VERSION_CONFLICT,
        message: "error.exchange.match_version_conflict",
        statusCode: 409,
        data: {
          currentVersion: matching.version,
          effectiveTargetProviderCount: matching.effectiveTargetProviderCount,
          effectiveBudgetMaxJpy: matching.effectiveBudgetMaxJpy
        }
      });
    }
  }

  private unwrapReplay(
    replay: { payload: ExchangeMatchingPayload; payloadFingerprint: string },
    payloadFingerprint: string
  ): ExchangeMatchingPayload {
    if (replay.payloadFingerprint !== payloadFingerprint) throw this.idempotencyConflict();
    return replay.payload;
  }

  private audit(
    access: AuthenticatedAccessContext,
    identityId: number,
    context: AuthRequestContext,
    matching: ExchangeMatchingRecord,
    selectedClaimIds: number[],
    selectedQuoteTotalJpy: number
  ): AuditLogCreateInput {
    return {
      actorId: access.userId,
      action: "exchange.matching.select",
      targetType: "exchange_request_matching",
      targetId: matching.id,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata: {
        exchangePostId: matching.exchangePostId,
        actorIdentityId: identityId,
        selectedClaimIds,
        selectedCount: selectedClaimIds.length,
        selectedQuoteTotalJpy,
        versionBefore: matching.version,
        versionAfter: matching.version + 1
      }
    };
  }

  private isUniqueConflict(error: unknown): boolean {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
  }

  private requireIdentityId(access: AuthenticatedAccessContext): number {
    if (!access.currentIdentityId) throw this.notAllowed();
    return access.currentIdentityId;
  }

  private notAllowed(): AppError {
    return new AppError({
      code: ERROR_CODES.EXCHANGE_MATCH_NOT_ALLOWED,
      message: "error.exchange.match_not_allowed",
      statusCode: 403
    });
  }

  private notFound(): AppError {
    return new AppError({
      code: ERROR_CODES.EXCHANGE_MATCH_NOT_FOUND,
      message: "error.exchange.match_not_found",
      statusCode: 404
    });
  }

  private invalidState(): AppError {
    return new AppError({
      code: ERROR_CODES.EXCHANGE_MATCH_INVALID_STATE,
      message: "error.exchange.match_invalid_state",
      statusCode: 409
    });
  }

  private versionConflict(): AppError {
    return new AppError({
      code: ERROR_CODES.EXCHANGE_MATCH_VERSION_CONFLICT,
      message: "error.exchange.match_version_conflict",
      statusCode: 409
    });
  }

  private claimSetInvalid(): AppError {
    return new AppError({
      code: ERROR_CODES.EXCHANGE_MATCH_CLAIM_SET_INVALID,
      message: "error.exchange.match_claim_set_invalid",
      statusCode: 409
    });
  }

  private countMismatch(): AppError {
    return new AppError({
      code: ERROR_CODES.EXCHANGE_MATCH_COUNT_MISMATCH,
      message: "error.exchange.match_count_mismatch",
      statusCode: 409
    });
  }

  private budgetExceeded(): AppError {
    return new AppError({
      code: ERROR_CODES.EXCHANGE_MATCH_BUDGET_EXCEEDED,
      message: "error.exchange.match_budget_exceeded",
      statusCode: 409
    });
  }

  private timeConflict(): AppError {
    return new AppError({
      code: ERROR_CODES.EXCHANGE_MATCH_TIME_CONFLICT,
      message: "error.exchange.match_time_conflict",
      statusCode: 409
    });
  }

  private idempotencyConflict(): AppError {
    return new AppError({
      code: ERROR_CODES.EXCHANGE_MATCH_IDEMPOTENCY_CONFLICT,
      message: "error.exchange.match_idempotency_conflict",
      statusCode: 409
    });
  }
}
