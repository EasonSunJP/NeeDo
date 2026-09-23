import { ERROR_CODES } from "../constants/error-codes";
import type { AuditLogCreateInput } from "../repositories/audit-log.repository";
import type {
  ExchangeClaimCreateRepositoryInput,
  ExchangeClaimLockedOption,
  ExchangeClaimLockedRecord,
  ExchangeClaimOptionListInput,
  ExchangeClaimProviderScope,
  ExchangeClaimRequestRecord
} from "../repositories/exchange-claim.repository";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import type { ExchangeActorLookup, ExchangeActorRecord } from "./exchange.service";
import type {
  ExchangeClaimOptionPage,
  ExchangeClaimPage,
  ExchangeClaimPayload,
  ExchangeClaimServiceRef
} from "../types/exchange-claim.types";
import { AppError } from "../utils/app-error";
import { sha256StableJson } from "../utils/stable-json";
import type {
  CreateExchangeClaimBody,
  ExchangeClaimListQuery,
  ExchangeClaimOptionListQuery
} from "../validators/exchange-claim.validators";
import { exchangeIdempotencyKeySchema } from "../validators/exchange.validators";
import { requireMerchantShopId } from "./merchant-shop-scope";
import {
  ExchangeQuickMatchingService,
  type ExchangeQuickMatchingRepositoryPort,
  type ExchangeQuickMatchingServicePort
} from "./exchange-quick-matching.service";

export interface ExchangeClaimRepositoryPort extends ExchangeQuickMatchingRepositoryPort {
  runInTransaction<T>(handler: (repository: ExchangeClaimRepositoryPort) => Promise<T>): Promise<T>;
  listOptions(input: ExchangeClaimOptionListInput): Promise<ExchangeClaimOptionPage>;
  findRequest(postId: number): Promise<ExchangeClaimRequestRecord | null>;
  findOptionCandidate(
    scheduleSlotId: number,
    scope: ExchangeClaimProviderScope
  ): Promise<{ technicianProfileId: number } | null>;
  lockRequest(postId: number): Promise<ExchangeClaimRequestRecord | null>;
  lockMatching(postId: number): Promise<{
    id: number;
    status: "open" | "matched" | "closed";
    version: number;
    effectiveTargetProviderCount: number;
    effectiveBudgetMaxJpy: number;
  } | null>;
  advanceMatchingForClaimEvent(input: {
    matchingId: number;
    exchangePostId: number;
    claimId: number;
    type: "claim_added" | "claim_withdrawn";
    actorUserId: number;
    actorIdentityId: number;
    versionBefore: number;
    at: Date;
  }): Promise<boolean>;
  lockTechnician(technicianProfileId: number): Promise<boolean>;
  lockOption(
    scheduleSlotId: number,
    scope: ExchangeClaimProviderScope,
    now?: Date,
    serviceRef?: ExchangeClaimServiceRef
  ): Promise<ExchangeClaimLockedOption | null>;
  hasActiveClaimForRequestTechnician(
    exchangePostId: number,
    technicianProfileId: number
  ): Promise<boolean>;
  hasOverlappingActiveClaim(
    technicianProfileId: number,
    startsAt: Date,
    endsAt: Date
  ): Promise<boolean>;
  hasOverlappingMatchParticipant(
    technicianProfileId: number,
    startsAt: Date,
    endsAt: Date
  ): Promise<boolean>;
  hasConflictingBooking(
    technicianProfileId: number,
    startsAt: Date,
    endsAt: Date
  ): Promise<boolean>;
  findIdempotent(
    idempotencyKey: string
  ): Promise<{ claim: ExchangeClaimPayload; fingerprint: string } | null>;
  findMine(
    exchangePostId: number,
    claimantIdentityId: number
  ): Promise<ExchangeClaimPayload | null>;
  findMineById(claimId: number, claimantIdentityId: number): Promise<ExchangeClaimPayload | null>;
  listReceived(
    exchangePostId: number,
    ownerIdentityId: number,
    input: { page: number; pageSize: number }
  ): Promise<ExchangeClaimPage>;
  lockClaim(claimId: number): Promise<ExchangeClaimLockedRecord | null>;
  create(input: ExchangeClaimCreateRepositoryInput): Promise<ExchangeClaimPayload>;
  withdraw(
    claimId: number,
    claimantIdentityId: number,
    now: Date,
    withdrawalIdempotencyKey: string,
    withdrawalPayloadFingerprint: string
  ): Promise<ExchangeClaimPayload | null>;
  createAudit(input: AuditLogCreateInput): Promise<void>;
}

interface ExchangeClaimActorResolverPort {
  resolveActor(input: ExchangeActorLookup): Promise<ExchangeActorRecord | null>;
}

const MERCHANT_PROVIDER_IDENTITIES = new Set([
  "merchant",
  "merchant_owner",
  "merchant_staff",
  "merchant_organization",
  "business",
  "b",
  "owner",
  "o"
]);

export class ExchangeClaimService {
  public constructor(
    private readonly repository: ExchangeClaimRepositoryPort,
    private readonly actorResolver: ExchangeClaimActorResolverPort,
    private readonly now: () => Date = () => new Date(),
    private readonly quickMatchingService: ExchangeQuickMatchingServicePort =
      new ExchangeQuickMatchingService(now)
  ) {}

  public async listOptions(
    access: AuthenticatedAccessContext,
    postId: number,
    input: ExchangeClaimOptionListQuery
  ): Promise<ExchangeClaimOptionPage> {
    const actor = await this.resolveActor(access);
    const scope = this.providerScope(access, actor);
    const request = await this.repository.findRequest(postId);
    this.assertRequestClaimable(request, actor, this.now());
    return this.repository.listOptions({
      postId,
      scope,
      page: input.page,
      pageSize: input.page_size,
      now: this.now(),
      ...(input.shop_id ? { shopId: input.shop_id } : {}),
      ...(input.technician_profile_id ? { technicianProfileId: input.technician_profile_id } : {}),
      ...(input.service_ref ? { serviceRef: input.service_ref as ExchangeClaimServiceRef } : {})
    });
  }

  public async createClaim(
    access: AuthenticatedAccessContext,
    postId: number,
    input: CreateExchangeClaimBody,
    rawIdempotencyKey: string,
    context: AuthRequestContext,
    options: { suppressQuickMatching?: boolean; source?: "automatic" } = {}
  ): Promise<ExchangeClaimPayload> {
    const idempotencyKey = exchangeIdempotencyKeySchema.parse(rawIdempotencyKey);
    const at = this.now();
    const actor = await this.resolveActor(access);
    const scope = this.providerScope(access, actor);
    const fingerprint = sha256StableJson({
      actor: {
        userId: actor.userId,
        identityId: actor.identityId,
        scopeType: actor.scopeType,
        scopeId: actor.scopeId,
        providerScope: scope
      },
      postId,
      scheduleSlotId: input.scheduleSlotId,
      ...(input.serviceRef ? { serviceRef: input.serviceRef } : {}),
      quoteAmountJpy: input.quoteAmountJpy,
      message: input.message
    });

    try {
      return await this.repository.runInTransaction(async (repository) => {
        const replay = await repository.findIdempotent(idempotencyKey);
        if (replay) return this.unwrapReplay(replay, fingerprint);
        const request = await repository.lockRequest(postId);
        this.assertRequestClaimable(request, actor, at);
        const matching = await repository.lockMatching(postId);
        if (!matching || matching.status !== "open") throw this.invalidState();
        this.assertQuoteWithinBudget(request!, input.quoteAmountJpy);
        const candidate = await repository.findOptionCandidate(input.scheduleSlotId, scope);
        if (!candidate) throw this.optionNotFound();
        if (!(await repository.lockTechnician(candidate.technicianProfileId))) {
          throw this.scheduleUnavailable();
        }
        const option = await repository.lockOption(
          input.scheduleSlotId,
          scope,
          at,
          input.serviceRef as ExchangeClaimServiceRef | undefined
        );
        if (!option || option.technicianProfileId !== candidate.technicianProfileId) {
          throw this.scheduleUnavailable();
        }
        this.assertOptionWithinRequest(request!, option);
        if (
          await repository.hasActiveClaimForRequestTechnician(postId, option.technicianProfileId)
        ) {
          throw this.duplicate();
        }
        if (
          (await repository.hasOverlappingActiveClaim(
            option.technicianProfileId,
            option.startsAt,
            option.endsAt
          )) ||
          (await repository.hasOverlappingMatchParticipant(
            option.technicianProfileId,
            option.startsAt,
            option.endsAt
          )) ||
          (await repository.hasConflictingBooking(
            option.technicianProfileId,
            option.startsAt,
            option.endsAt
          ))
        ) {
          throw this.timeConflict();
        }
        const created = await repository.create({
          exchangePostId: postId,
          claimantUserId: actor.userId,
          claimantIdentityId: actor.identityId,
          shopId: option.shopId,
          technicianProfileId: option.technicianProfileId,
          serviceId: option.serviceId,
          technicianServiceId: option.technicianServiceId,
          scheduleSlotId: option.scheduleSlotId,
          quoteAmountJpy: input.quoteAmountJpy,
          source: options.source ?? (scope.kind === "merchant" ? "shop_dispatch" : "manual"),
          message: input.message,
          idempotencyKey,
          payloadFingerprint: fingerprint,
          now: at
        });
        if (
          !(await repository.advanceMatchingForClaimEvent({
            matchingId: matching.id,
            exchangePostId: postId,
            claimId: created.id,
            type: "claim_added",
            actorUserId: actor.userId,
            actorIdentityId: actor.identityId,
            versionBefore: matching.version,
            at
          }))
        ) {
          throw this.invalidState();
        }
        await repository.createAudit(
          this.audit(access, context, "exchange.claim.create", created.id, {
            exchangePostId: postId,
            claimantIdentityId: actor.identityId,
            shopId: option.shopId,
            technicianProfileId: option.technicianProfileId,
            scheduleSlotId: option.scheduleSlotId,
            quoteAmountJpy: input.quoteAmountJpy
          })
        );
        if (request!.demand.matchMode === "quick" && !options.suppressQuickMatching) {
          const result = await this.quickMatchingService.attemptAfterClaim(repository, {
            exchangePostId: postId,
            ownerUserId: request!.authorUserId,
            ownerIdentityId: request!.ownerIdentityId,
            matching: {
              id: matching.id,
              version: matching.version + 1,
              effectiveTargetProviderCount: matching.effectiveTargetProviderCount,
              effectiveBudgetMaxJpy: matching.effectiveBudgetMaxJpy
            },
            triggeringClaimId: created.id
          });
          if (result.kind === "matched") {
            const refreshed = await repository.findMineById(created.id, actor.identityId);
            if (!refreshed) throw this.invalidState();
            return refreshed;
          }
        }
        return created;
      });
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
      const replay = await this.repository.findIdempotent(idempotencyKey);
      if (replay) return this.unwrapReplay(replay, fingerprint);
      throw this.duplicate();
    }
  }

  public async getMine(
    access: AuthenticatedAccessContext,
    postId: number
  ): Promise<ExchangeClaimPayload | null> {
    const actor = await this.resolveActor(access);
    this.providerScope(access, actor);
    return this.repository.findMine(postId, actor.identityId);
  }

  public async listReceived(
    access: AuthenticatedAccessContext,
    postId: number,
    input: ExchangeClaimListQuery
  ): Promise<ExchangeClaimPage> {
    const actor = await this.resolveActor(access);
    return this.repository.listReceived(postId, actor.ownerIdentityId ?? actor.identityId, {
      page: input.page,
      pageSize: input.page_size
    });
  }

  public async withdrawClaim(
    access: AuthenticatedAccessContext,
    claimId: number,
    rawIdempotencyKey: string,
    context: AuthRequestContext
  ): Promise<ExchangeClaimPayload> {
    const idempotencyKey = exchangeIdempotencyKeySchema.parse(rawIdempotencyKey);
    const actor = await this.resolveActor(access);
    this.providerScope(access, actor);
    const mine = await this.repository.findMineById(claimId, actor.identityId);
    if (!mine) throw this.claimNotFound();
    const at = this.now();
    const fingerprint = sha256StableJson({
      actor: { userId: actor.userId, identityId: actor.identityId },
      claimId
    });
    try {
      return await this.repository.runInTransaction(async (repository) => {
        const request = await repository.lockRequest(mine.exchangePostId);
        const matching = await repository.lockMatching(mine.exchangePostId);
        const locked = await repository.lockClaim(claimId);
        if (!locked || locked.claimantIdentityId !== actor.identityId) {
          throw this.claimNotFound();
        }
        if (locked.status === "withdrawn" && locked.withdrawalIdempotencyKey === idempotencyKey) {
          if (locked.withdrawalPayloadFingerprint !== fingerprint) {
            throw this.idempotencyConflict();
          }
          return locked.claim;
        }
        if (
          !request ||
          !matching ||
          matching.status !== "open" ||
          request.type !== "demand" ||
          request.status !== "published" ||
          request.expiresAt <= at ||
          locked.status !== "active"
        ) {
          throw this.invalidState();
        }
        const withdrawn = await repository.withdraw(
          claimId,
          actor.identityId,
          at,
          idempotencyKey,
          fingerprint
        );
        if (!withdrawn) throw this.invalidState();
        if (
          !(await repository.advanceMatchingForClaimEvent({
            matchingId: matching.id,
            exchangePostId: mine.exchangePostId,
            claimId,
            type: "claim_withdrawn",
            actorUserId: actor.userId,
            actorIdentityId: actor.identityId,
            versionBefore: matching.version,
            at
          }))
        ) {
          throw this.invalidState();
        }
        await repository.createAudit(
          this.audit(access, context, "exchange.claim.withdraw", claimId, {
            exchangePostId: locked.exchangePostId,
            claimantIdentityId: actor.identityId,
            technicianProfileId: locked.claim.technician.profileId,
            scheduleSlotId: locked.claim.scheduleSlotId
          })
        );
        return withdrawn;
      });
    } catch (error) {
      if (this.isUniqueConflict(error)) throw this.idempotencyConflict();
      throw error;
    }
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

  private providerScope(
    access: AuthenticatedAccessContext,
    actor: ExchangeActorRecord
  ): ExchangeClaimProviderScope {
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
    if (MERCHANT_PROVIDER_IDENTITIES.has(actor.identityType)) {
      try {
        return { kind: "merchant", shopId: requireMerchantShopId(access) };
      } catch {
        throw this.notAllowed();
      }
    }
    throw this.notAllowed();
  }

  private assertRequestClaimable(
    request: ExchangeClaimRequestRecord | null,
    actor: ExchangeActorRecord,
    at: Date
  ): asserts request is ExchangeClaimRequestRecord & {
    demand: NonNullable<ExchangeClaimRequestRecord["demand"]>;
  } {
    if (!request || request.type !== "demand" || !request.demand) {
      throw this.claimNotFound();
    }
    if (request.authorUserId === actor.userId || request.ownerIdentityId === actor.identityId) {
      throw this.notAllowed();
    }
    if (request.status !== "published" || request.expiresAt <= at) {
      throw this.invalidState();
    }
  }

  private assertQuoteWithinBudget(
    request: ExchangeClaimRequestRecord & {
      demand: NonNullable<ExchangeClaimRequestRecord["demand"]>;
    },
    quoteAmountJpy: number
  ): void {
    if (request.demand.budgetMinJpy !== null && quoteAmountJpy < request.demand.budgetMinJpy) {
      throw this.quoteBelowBudget();
    }
    if (quoteAmountJpy > request.demand.budgetMaxJpy) throw this.quoteAboveBudget();
  }

  private assertOptionWithinRequest(
    request: ExchangeClaimRequestRecord,
    option: ExchangeClaimLockedOption
  ): void {
    if (option.technicianUserId === request.authorUserId) throw this.notAllowed();
    if (
      option.startsAt < request.serviceStartAt ||
      option.endsAt > request.serviceEndAt ||
      option.endsAt <= option.startsAt
    ) {
      throw this.scheduleUnavailable();
    }
  }

  private unwrapReplay(
    replay: { claim: ExchangeClaimPayload; fingerprint: string },
    fingerprint: string
  ): ExchangeClaimPayload {
    if (replay.fingerprint !== fingerprint) throw this.idempotencyConflict();
    return replay.claim;
  }

  private audit(
    access: AuthenticatedAccessContext,
    context: AuthRequestContext,
    action: string,
    targetId: number,
    metadata: Record<string, unknown>
  ): AuditLogCreateInput {
    return {
      actorId: access.userId,
      action,
      targetType: "exchange_claim",
      targetId,
      ip: context.ip,
      userAgent: context.userAgent,
      metadata
    };
  }

  private isUniqueConflict(error: unknown): boolean {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
  }

  private notAllowed(): AppError {
    return new AppError({
      code: ERROR_CODES.EXCHANGE_CLAIM_NOT_ALLOWED,
      message: "error.exchange.claim_not_allowed",
      statusCode: 403
    });
  }

  private optionNotFound(): AppError {
    return new AppError({
      code: ERROR_CODES.EXCHANGE_CLAIM_OPTION_NOT_FOUND,
      message: "error.exchange.claim_option_not_found",
      statusCode: 404
    });
  }

  private claimNotFound(): AppError {
    return new AppError({
      code: ERROR_CODES.EXCHANGE_CLAIM_NOT_FOUND,
      message: "error.exchange.claim_not_found",
      statusCode: 404
    });
  }

  private quoteBelowBudget(): AppError {
    return new AppError({
      code: ERROR_CODES.EXCHANGE_CLAIM_QUOTE_BELOW_BUDGET,
      message: "error.exchange.claim_quote_below_budget",
      statusCode: 409
    });
  }

  private quoteAboveBudget(): AppError {
    return new AppError({
      code: ERROR_CODES.EXCHANGE_CLAIM_QUOTE_ABOVE_BUDGET,
      message: "error.exchange.claim_quote_above_budget",
      statusCode: 409
    });
  }

  private scheduleUnavailable(): AppError {
    return new AppError({
      code: ERROR_CODES.EXCHANGE_CLAIM_SCHEDULE_UNAVAILABLE,
      message: "error.exchange.claim_schedule_unavailable",
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

  private duplicate(): AppError {
    return new AppError({
      code: ERROR_CODES.EXCHANGE_CLAIM_DUPLICATE,
      message: "error.exchange.claim_duplicate",
      statusCode: 409
    });
  }

  private idempotencyConflict(): AppError {
    return new AppError({
      code: ERROR_CODES.EXCHANGE_CLAIM_IDEMPOTENCY_CONFLICT,
      message: "error.exchange.claim_idempotency_conflict",
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
}
