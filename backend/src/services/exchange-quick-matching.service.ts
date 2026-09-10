import { ERROR_CODES } from "../constants/error-codes";
import type {
  CompleteExchangeMatchInput,
  ExchangeMatchingSelectionClaim,
  NotifyQuickBudgetDecisionRequiredInput
} from "../repositories/exchange-matching.repository";
import type { ExchangeMatchingPayload } from "../types/exchange-matching.types";
import { AppError } from "../utils/app-error";
import { sha256StableJson } from "../utils/stable-json";

export interface ExchangeQuickMatchingRepositoryPort {
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
  notifyQuickBudgetDecisionRequired(input: NotifyQuickBudgetDecisionRequiredInput): Promise<void>;
  completeMatch(input: CompleteExchangeMatchInput): Promise<ExchangeMatchingPayload | null>;
}

export interface AttemptQuickMatchingInput {
  exchangePostId: number;
  ownerUserId: number;
  ownerIdentityId: number;
  matching: {
    id: number;
    version: number;
    effectiveTargetProviderCount: number;
    effectiveBudgetMaxJpy: number;
  };
  triggeringClaimId: number;
}

export type ExchangeQuickMatchingResult =
  | { kind: "waiting" }
  | { kind: "budget_decision_required"; selectedQuoteTotalJpy: number }
  | { kind: "matched"; matching: ExchangeMatchingPayload };

export interface ExchangeQuickMatchingServicePort {
  attemptAfterClaim(
    repository: ExchangeQuickMatchingRepositoryPort,
    input: AttemptQuickMatchingInput
  ): Promise<ExchangeQuickMatchingResult>;
}

export class ExchangeQuickMatchingService implements ExchangeQuickMatchingServicePort {
  public constructor(private readonly now: () => Date = () => new Date()) {}

  public async attemptAfterClaim(
    repository: ExchangeQuickMatchingRepositoryPort,
    input: AttemptQuickMatchingInput
  ): Promise<ExchangeQuickMatchingResult> {
    const activeClaims = (await repository.lockActiveClaims(input.exchangePostId)).sort(
      (left, right) => left.id - right.id
    );
    const target = input.matching.effectiveTargetProviderCount;
    if (activeClaims.length < target) return { kind: "waiting" };
    if (activeClaims.length !== target) throw this.capacityReached();

    const selectedQuoteTotalJpy = activeClaims.reduce(
      (total, claim) => total + claim.quoteAmountJpy,
      0
    );
    if (selectedQuoteTotalJpy > input.matching.effectiveBudgetMaxJpy) {
      await repository.notifyQuickBudgetDecisionRequired({
        matchingId: input.matching.id,
        exchangePostId: input.exchangePostId,
        ownerUserId: input.ownerUserId,
        ownerIdentityId: input.ownerIdentityId,
        activeClaimCount: activeClaims.length,
        effectiveBudgetMaxJpy: input.matching.effectiveBudgetMaxJpy,
        requiredBudgetMaxJpy: selectedQuoteTotalJpy,
        requiredBudgetIncreaseJpy:
          selectedQuoteTotalJpy - input.matching.effectiveBudgetMaxJpy,
        at: this.now()
      });
      return { kind: "budget_decision_required", selectedQuoteTotalJpy };
    }

    const technicianProfileIds = activeClaims
      .map((claim) => claim.technicianProfileId)
      .sort((left, right) => left - right);
    if (
      new Set(technicianProfileIds).size !== technicianProfileIds.length ||
      !(await repository.lockTechnicians(technicianProfileIds))
    ) {
      throw this.timeConflict();
    }
    for (const claim of activeClaims) {
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

    const at = this.now();
    const selectedClaimIds = activeClaims.map((claim) => claim.id);
    const idempotencyKey = `quick-auto:claim:${input.triggeringClaimId}`;
    const payloadFingerprint = sha256StableJson({
      exchangePostId: input.exchangePostId,
      matchingId: input.matching.id,
      versionBefore: input.matching.version,
      selectedClaimIds,
      selectedQuoteTotalJpy,
      effectiveTargetProviderCount: target,
      effectiveBudgetMaxJpy: input.matching.effectiveBudgetMaxJpy
    });
    const completed = await repository.completeMatch({
      matchingId: input.matching.id,
      exchangePostId: input.exchangePostId,
      selectedClaims: activeClaims,
      selectedClaimIds,
      unselectedClaims: [],
      unselectedClaimIds: [],
      selectedQuoteTotalJpy,
      effectiveTargetProviderCountAfter: target,
      effectiveBudgetMaxJpyAfter: input.matching.effectiveBudgetMaxJpy,
      adjustments: [],
      versionBefore: input.matching.version,
      versionAfter: input.matching.version + 1,
      actorUserId: null,
      actorIdentityId: null,
      viewerIdentityId: input.ownerIdentityId,
      matchEventType: "quick_matched",
      idempotencyKey,
      payloadFingerprint,
      at,
      audit: {
        actorId: null,
        action: "exchange.matching.quick.auto_match",
        targetType: "exchange_request_matching",
        targetId: input.matching.id,
        metadata: {
          exchangePostId: input.exchangePostId,
          selectedClaimIds,
          selectedQuoteTotalJpy,
          matchingVersionBefore: input.matching.version,
          matchingVersionAfter: input.matching.version + 1
        }
      }
    });
    if (!completed) throw this.invalidState();
    return { kind: "matched", matching: completed };
  }

  private capacityReached(): AppError {
    return new AppError({
      code: ERROR_CODES.EXCHANGE_CLAIM_INVALID_STATE,
      message: "error.exchange.claim_invalid_state",
      statusCode: 409
    });
  }

  private invalidState(): AppError {
    return new AppError({
      code: ERROR_CODES.EXCHANGE_CLAIM_INVALID_STATE,
      message: "error.exchange.claim_invalid_state",
      statusCode: 409
    });
  }

  private timeConflict(): AppError {
    return new AppError({
      code: ERROR_CODES.EXCHANGE_CLAIM_TIME_CONFLICT,
      message: "error.exchange.claim_time_conflict",
      statusCode: 409
    });
  }
}
