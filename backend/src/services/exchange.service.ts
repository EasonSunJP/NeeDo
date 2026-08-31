import { ERROR_CODES } from "../constants/error-codes";
import type { AuditLogCreateInput } from "../repositories/audit-log.repository";
import type { AuthenticatedAccessContext } from "./auth.service";
import type { PersonalIdentityScopeService } from "./personal-identity-scope.service";
import type {
  ExchangeCommentPage,
  ExchangeCommentPayload,
  ExchangeCustomerMembershipLevel,
  ExchangeInteractionCounts,
  ExchangePostPage,
  ExchangePostPayload,
  ExchangePostType,
  ExchangePublisherCapacity,
  ExchangeRequestPublicationContextPayload
} from "../types/exchange.types";
import { AppError } from "../utils/app-error";
import type { PaginationInput } from "../utils/pagination";
import type {
  CreateExchangeCommentBody,
  PublishExchangePostBody
} from "../validators/exchange.validators";
import { exchangeIdempotencyKeySchema } from "../validators/exchange.validators";
import { resolveEffectiveCustomerMembershipLevel } from "./customer-membership.service";
import type { ExchangeRequestFeeService } from "./exchange-request-fee.service";
import type { LedgerService } from "./ledger.service";
import { sha256StableJson } from "../utils/stable-json";

export interface ExchangeActorLookup {
  userId: number;
  identityId: number;
  identityType: string;
  scopeType: string | null;
  scopeId: number | null;
  publicId: string;
}

export interface ExchangeActorRecord extends ExchangeActorLookup {
  displayName: string;
  avatarUrl: string | null;
  isTestAccount: boolean;
  customerMembership: {
    profileId: number;
    membershipLevel: string;
    membershipGrantMode: string;
    membershipStartsAt: Date | null;
    membershipExpiresAt: Date | null;
  } | null;
  shopScope: { shopId: number; status: string } | null;
  ownerIdentityId?: number;
}

export interface ExchangeFeedListInput {
  type: ExchangePostType;
  page: number;
  pageSize: number;
}

export type ExchangeMutationResult<TValue> =
  | { kind: "success" | "replayed"; value: TValue }
  | { kind: "not_found" | "forbidden" | "unavailable" };

interface ExchangeMutationBase {
  actor: ExchangeActorRecord;
  postId: number;
  idempotencyKey: string;
  audit: AuditLogCreateInput;
  now: Date;
}

export interface ExchangePublishRepositoryInput {
  actor: ExchangeActorRecord;
  input: PublishExchangePostBody;
  capacity?: ExchangePublisherCapacity;
  idempotencyKey: string;
  payloadFingerprint: string;
  now: Date;
}

export interface ExchangePublicationRecord {
  ownerIdentityId: number;
  payloadFingerprint: string | null;
  value: ExchangePostPayload;
}

export interface ExchangeTerminalPostRecord {
  id: number;
  authorUserId: number;
  ownerIdentityId: number;
  type: ExchangePostType;
  status: "published" | "withdrawn" | "expired";
  expiresAt: Date;
  requestFinancial: { state: "held" | "captured" | "released" } | null;
}

interface ExchangeRequestFeePublicationPort {
  resolveCurrent: ExchangeRequestFeeService["resolveCurrent"];
  withTransactionClient(
    transactionClient: unknown
  ): Pick<ExchangeRequestFeeService, "resolveCurrent" | "recordPublicationCalculation">;
}

interface ExchangeRequestLedgerPublicationPort {
  freezeExchangeRequestPublication(
    input: Parameters<LedgerService["freezeExchangeRequestPublication"]>[0],
    options: Parameters<LedgerService["freezeExchangeRequestPublication"]>[1]
  ): Promise<unknown>;
  captureExchangeRequestPublication(
    input: { exchangePostId: number; actorUserId: number; occurredAt: Date },
    options: Parameters<LedgerService["captureExchangeRequestPublication"]>[1]
  ): Promise<unknown>;
  releaseExchangeRequestPublication(
    input: { exchangePostId: number; actorUserId: number; occurredAt: Date },
    options: Parameters<LedgerService["releaseExchangeRequestPublication"]>[1]
  ): Promise<unknown>;
}

export interface ExchangeCommentRepositoryInput extends ExchangeMutationBase {
  input: CreateExchangeCommentBody;
}

export interface ExchangeLikeRepositoryInput extends ExchangeMutationBase {
  liked: boolean;
}

export type ExchangeShareRepositoryInput = ExchangeMutationBase;

export interface ExchangeRepositoryPort {
  runInTransaction<T>(
    handler: (repository: ExchangeRepositoryPort, transactionClient?: unknown) => Promise<T>,
    transactionClient?: unknown
  ): Promise<T>;
  resolveActor(input: ExchangeActorLookup): Promise<ExchangeActorRecord | null>;
  listPosts(input: {
    type: ExchangePostType;
    page: number;
    pageSize: number;
    viewerIdentityId: number;
    authorIdentityId?: number;
    now: Date;
  }): Promise<ExchangePostPage>;
  findPostById(
    postId: number,
    viewerIdentityId: number,
    now: Date
  ): Promise<ExchangePostPayload | null>;
  listComments(
    postId: number,
    input: { page: number; pageSize: number }
  ): Promise<ExchangeCommentPage>;
  findPostByIdempotencyKey(
    idempotencyKey: string,
    ownerIdentityId: number,
    now: Date
  ): Promise<ExchangePublicationRecord | null>;
  createPost(input: ExchangePublishRepositoryInput): Promise<{ id: number }>;
  createAudit(input: AuditLogCreateInput): Promise<void>;
  findPostByIdOrThrow(
    postId: number,
    viewerIdentityId: number,
    now: Date
  ): Promise<ExchangePostPayload>;
  lockPostForMutation(postId: number): Promise<ExchangeTerminalPostRecord | null>;
  markWithdrawnIfPublished(postId: number, now: Date): Promise<boolean>;
  markExpiredIfPublished(postId: number, now: Date): Promise<boolean>;
  cancelActiveClaimsByPost(
    postId: number,
    status: "request_withdrawn" | "request_expired",
    now: Date
  ): Promise<number>;
  listDuePostIds(now: Date, batchSize: number): Promise<number[]>;
  createComment(
    input: ExchangeCommentRepositoryInput
  ): Promise<ExchangeMutationResult<ExchangeCommentPayload>>;
  setLike(
    input: ExchangeLikeRepositoryInput
  ): Promise<ExchangeMutationResult<ExchangeInteractionCounts>>;
  recordShare(
    input: ExchangeShareRepositoryInput
  ): Promise<ExchangeMutationResult<ExchangeInteractionCounts>>;
}

const INTELLIGENCE_PUBLISHER_IDENTITIES = new Set([
  "technician",
  "merchant",
  "merchant_owner",
  "merchant_staff"
]);

const PERSONAL_DEMAND_PUBLISHER_IDENTITIES = new Set([
  "customer",
  "user",
  "u",
  "scout",
  "affiliate",
  "alliance_marketing"
]);

const SHOP_DEMAND_PUBLISHER_IDENTITIES = new Set(["merchant", "merchant_owner", "merchant_staff"]);

const CUSTOMER_MEMBERSHIP_LIMITS: Record<ExchangeCustomerMembershipLevel, number> = {
  standard: 1,
  silver: 2,
  gold: 3,
  black: 20
};

const DEMAND_AUDIENCE_IDENTITIES = new Set([
  "technician",
  "merchant",
  "merchant_owner",
  "merchant_staff"
]);

const CLAIM_PROVIDER_IDENTITIES = new Set([
  ...DEMAND_AUDIENCE_IDENTITIES,
  "merchant_organization",
  "business",
  "b",
  "owner",
  "o"
]);

export class ExchangeService {
  public constructor(
    private readonly repository: ExchangeRepositoryPort,
    private readonly now: () => Date = () => new Date(),
    private readonly personalIdentityScopeService?: Pick<PersonalIdentityScopeService, "resolve">,
    private readonly exchangeRequestFeeService?: ExchangeRequestFeePublicationPort,
    private readonly ledgerService?: ExchangeRequestLedgerPublicationPort
  ) {}

  public async getRequestPublicationContext(
    access: AuthenticatedAccessContext
  ): Promise<ExchangeRequestPublicationContextPayload> {
    const at = this.now();
    const actor = await this.resolveActor(access);
    this.assertCanPublish(actor.identityType, "demand");
    const capacity = this.resolvePublisherCapacity(actor, at);
    if (!this.exchangeRequestFeeService) {
      throw new AppError({
        code: ERROR_CODES.EXCHANGE_REQUEST_FEE_UNAVAILABLE,
        message: "error.exchange.request_fee_unavailable",
        statusCode: 503
      });
    }
    const fee = await this.exchangeRequestFeeService.resolveCurrent(at);
    return {
      canPublish: true,
      capacitySource: capacity.source,
      membershipLevel: capacity.membershipLevel,
      maxTargetProviderCount: capacity.targetProviderLimit,
      publicationFee: {
        amountNdp: fee.amountNdp,
        currency: capacity.currency,
        ruleSetVersion: fee.ruleSetVersion
      }
    };
  }

  public async listPosts(
    access: AuthenticatedAccessContext,
    input: ExchangeFeedListInput
  ): Promise<ExchangePostPage> {
    const actor = await this.resolveActor(access);
    const ownerIdentityId = actor.ownerIdentityId ?? actor.identityId;
    const privateAuthorIdentityId =
      input.type === "demand" && !DEMAND_AUDIENCE_IDENTITIES.has(actor.identityType)
        ? ownerIdentityId
        : undefined;
    const page = await this.repository.listPosts({
      ...input,
      viewerIdentityId: ownerIdentityId,
      ...(privateAuthorIdentityId ? { authorIdentityId: privateAuthorIdentityId } : {}),
      now: this.now()
    });
    return { ...page, list: page.list.map((post) => this.decorateClaimCapabilities(post, actor)) };
  }

  public async getPost(
    access: AuthenticatedAccessContext,
    postId: number
  ): Promise<ExchangePostPayload> {
    const actor = await this.resolveActor(access);
    const post = await this.repository.findPostById(
      postId,
      actor.ownerIdentityId ?? actor.identityId,
      this.now()
    );
    if (!post) throw this.postNotFound();
    this.assertCanReadPost(actor, post);
    return this.decorateClaimCapabilities(post, actor);
  }

  public async publish(
    access: AuthenticatedAccessContext,
    input: PublishExchangePostBody,
    key: string
  ): Promise<ExchangePostPayload> {
    const occurredAt = this.now();
    const idempotencyKey = exchangeIdempotencyKeySchema.parse(key);
    try {
      return await this.repository.runInTransaction(async (repository, transactionClient) => {
        const actor = await this.resolveActor(access, repository);
        this.assertCanPublish(actor.identityType, input.type);
        const capacity =
          input.type === "demand" ? this.resolvePublisherCapacity(actor, occurredAt) : undefined;
        if (capacity && input.type === "demand") {
          this.assertTargetWithinCapacity(input.targetProviderCount, capacity.targetProviderLimit);
        }
        const ownerIdentityId = actor.ownerIdentityId ?? actor.identityId;
        const payloadFingerprint = this.publicationFingerprint(actor, input);
        const replay = await repository.findPostByIdempotencyKey(
          idempotencyKey,
          ownerIdentityId,
          occurredAt
        );
        if (replay) return this.unwrapPublicationReplay(replay, payloadFingerprint);

        if (input.type === "demand") {
          if (!capacity || !this.exchangeRequestFeeService || !this.ledgerService) {
            throw this.requestFeeUnavailable();
          }
          const feeService =
            this.exchangeRequestFeeService.withTransactionClient(transactionClient);
          const fee = await feeService.resolveCurrent(occurredAt);
          const created = await repository.createPost({
            actor,
            input,
            capacity,
            idempotencyKey,
            payloadFingerprint,
            now: occurredAt
          });
          const feeCalculationLogId = await feeService.recordPublicationCalculation({
            exchangePostId: created.id,
            payerType: capacity.payerOwnerType,
            payerId: capacity.payerOwnerId,
            fee,
            calculatedAt: occurredAt
          });
          await this.ledgerService.freezeExchangeRequestPublication(
            {
              exchangePostId: created.id,
              actorUserId: actor.userId,
              payerType: capacity.payerOwnerType,
              payerId: capacity.payerOwnerId,
              walletOwnerType: capacity.payerOwnerType,
              walletOwnerId: capacity.payerOwnerId,
              currency: capacity.currency,
              fee,
              feeCalculationLogId,
              occurredAt
            },
            { transactionClient }
          );
          await repository.createAudit(
            this.audit(access, "exchange.post.publish", created.id, {
              identityId: actor.identityId,
              identityType: actor.identityType,
              postType: input.type,
              capacitySource: capacity.source,
              targetProviderLimit: capacity.targetProviderLimit,
              payerOwnerType: capacity.payerOwnerType,
              payerOwnerId: capacity.payerOwnerId,
              publicationFeeAmountNdp: fee.amountNdp,
              publicationFeeCurrency: capacity.currency,
              publicationFeeRuleSetVersion: fee.ruleSetVersion
            })
          );
          return repository.findPostByIdOrThrow(created.id, ownerIdentityId, occurredAt);
        }

        const created = await repository.createPost({
          actor,
          input,
          idempotencyKey,
          payloadFingerprint,
          now: occurredAt
        });
        await repository.createAudit(
          this.audit(access, "exchange.post.publish", created.id, {
            identityId: actor.identityId,
            identityType: actor.identityType,
            postType: input.type
          })
        );
        return repository.findPostByIdOrThrow(created.id, ownerIdentityId, occurredAt);
      });
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
      const actor = await this.resolveActor(access);
      this.assertCanPublish(actor.identityType, input.type);
      const ownerIdentityId = actor.ownerIdentityId ?? actor.identityId;
      const replay = await this.repository.findPostByIdempotencyKey(
        idempotencyKey,
        ownerIdentityId,
        occurredAt
      );
      if (!replay) throw this.idempotencyConflict();
      return this.unwrapPublicationReplay(replay, this.publicationFingerprint(actor, input));
    }
  }

  public async withdraw(
    access: AuthenticatedAccessContext,
    postId: number,
    key: string
  ): Promise<ExchangePostPayload> {
    exchangeIdempotencyKeySchema.parse(key);
    const occurredAt = this.now();
    return this.repository.runInTransaction(async (repository, transactionClient) => {
      const actor = await this.resolveActor(access, repository);
      const ownerIdentityId = actor.ownerIdentityId ?? actor.identityId;
      const locked = await repository.lockPostForMutation(postId);
      if (!locked) throw this.postNotFound();
      if (locked.ownerIdentityId !== ownerIdentityId) throw this.authorRequired();
      if (locked.status === "withdrawn") {
        return repository.findPostByIdOrThrow(postId, ownerIdentityId, occurredAt);
      }
      if (locked.status !== "published") throw this.exchangeFinancialStateConflict();
      if (locked.expiresAt.getTime() <= occurredAt.getTime()) throw this.postUnavailable();

      const settlesRequestFinancial = locked.type === "demand" && locked.requestFinancial !== null;
      const ledgerService = this.ledgerService;
      if (settlesRequestFinancial) {
        if (locked.requestFinancial?.state !== "held") {
          throw this.exchangeFinancialStateConflict();
        }
        if (!ledgerService) throw this.requestFeeUnavailable();
      }
      const cancelledClaimCount =
        locked.type === "demand"
          ? await repository.cancelActiveClaimsByPost(
              locked.id,
              "request_withdrawn",
              occurredAt
            )
          : 0;
      if (cancelledClaimCount > 0) {
        await repository.createAudit({
          actorId: actor.userId,
          action: "exchange.claim.request_withdrawn",
          targetType: "ExchangePost",
          targetId: locked.id,
          metadata: {
            exchangePostId: locked.id,
            cancelledClaimCount,
            terminalAt: occurredAt.toISOString()
          }
        });
      }
      if (settlesRequestFinancial) {
        await ledgerService!.captureExchangeRequestPublication(
          {
            exchangePostId: locked.id,
            actorUserId: actor.userId,
            occurredAt
          },
          { transactionClient }
        );
      }
      if (!(await repository.markWithdrawnIfPublished(locked.id, occurredAt))) {
        throw this.exchangeFinancialStateConflict();
      }
      await repository.createAudit(
        this.audit(access, "exchange.post.withdraw", locked.id, {
          identityId: actor.identityId,
          previousStatus: "published",
          nextStatus: "withdrawn",
          publicationFeeOutcome: settlesRequestFinancial ? "captured" : "legacy_not_applicable"
        })
      );
      return repository.findPostByIdOrThrow(locked.id, ownerIdentityId, occurredAt);
    });
  }

  public async listComments(
    access: AuthenticatedAccessContext,
    postId: number,
    input: PaginationInput
  ): Promise<ExchangeCommentPage> {
    const actor = await this.resolveActor(access);
    await this.assertPostReadable(actor, postId);
    return this.repository.listComments(postId, {
      page: input.page ?? 1,
      pageSize: input.pageSize ?? 20
    });
  }

  public async comment(
    access: AuthenticatedAccessContext,
    postId: number,
    input: CreateExchangeCommentBody,
    key: string
  ): Promise<ExchangeCommentPayload> {
    const actor = await this.resolveActor(access);
    await this.assertPostReadable(actor, postId);
    const result = await this.repository.createComment({
      actor,
      postId,
      input,
      idempotencyKey: exchangeIdempotencyKeySchema.parse(key),
      now: this.now(),
      audit: this.audit(access, "exchange.post.comment", postId, {
        identityId: actor.identityId
      })
    });
    return this.unwrapMutation(result);
  }

  public like(
    access: AuthenticatedAccessContext,
    postId: number,
    key: string
  ): Promise<ExchangeInteractionCounts> {
    return this.setLike(access, postId, key, true);
  }

  public unlike(
    access: AuthenticatedAccessContext,
    postId: number,
    key: string
  ): Promise<ExchangeInteractionCounts> {
    return this.setLike(access, postId, key, false);
  }

  public async share(
    access: AuthenticatedAccessContext,
    postId: number,
    key: string
  ): Promise<ExchangeInteractionCounts> {
    const actor = await this.resolveActor(access);
    await this.assertPostReadable(actor, postId);
    const result = await this.repository.recordShare({
      actor,
      postId,
      idempotencyKey: exchangeIdempotencyKeySchema.parse(key),
      now: this.now(),
      audit: this.audit(access, "exchange.post.share", postId, {
        identityId: actor.identityId
      })
    });
    return this.unwrapMutation(result);
  }

  public async expirePost(postId: number, now: Date): Promise<boolean> {
    return this.repository.runInTransaction(async (repository, transactionClient) => {
      const locked = await repository.lockPostForMutation(postId);
      if (!locked || locked.status === "expired") return false;
      if (locked.status !== "published") throw this.exchangeFinancialStateConflict();
      if (locked.expiresAt.getTime() > now.getTime()) return false;

      const settlesRequestFinancial = locked.type === "demand" && locked.requestFinancial !== null;
      const ledgerService = this.ledgerService;
      if (settlesRequestFinancial) {
        if (locked.requestFinancial?.state !== "held") {
          throw this.exchangeFinancialStateConflict();
        }
        if (!ledgerService) throw this.requestFeeUnavailable();
      }
      const cancelledClaimCount =
        locked.type === "demand"
          ? await repository.cancelActiveClaimsByPost(
              locked.id,
              "request_expired",
              now
            )
          : 0;
      if (cancelledClaimCount > 0) {
        await repository.createAudit({
          actorId: null,
          action: "exchange.claim.request_expired",
          targetType: "ExchangePost",
          targetId: locked.id,
          metadata: {
            exchangePostId: locked.id,
            cancelledClaimCount,
            terminalAt: now.toISOString()
          }
        });
      }
      if (settlesRequestFinancial) {
        await ledgerService!.releaseExchangeRequestPublication(
          {
            exchangePostId: locked.id,
            actorUserId: locked.authorUserId,
            occurredAt: now
          },
          { transactionClient }
        );
      }
      if (!(await repository.markExpiredIfPublished(locked.id, now))) {
        throw this.exchangeFinancialStateConflict();
      }
      await repository.createAudit({
        actorId: null,
        action: "exchange.post.expire",
        targetType: "ExchangePost",
        targetId: locked.id,
        metadata: {
          expiredAt: now.toISOString(),
          previousStatus: "published",
          nextStatus: "expired",
          publicationFeeOutcome: settlesRequestFinancial ? "released" : "legacy_not_applicable"
        }
      });
      return true;
    });
  }

  public async expireDue(now: Date, batchSize: number): Promise<number> {
    const ids = await this.repository.listDuePostIds(now, batchSize);
    let expired = 0;
    for (const postId of ids) {
      try {
        if (await this.expirePost(postId, now)) expired += 1;
      } catch (error) {
        if (
          error instanceof AppError &&
          error.code === ERROR_CODES.EXCHANGE_REQUEST_FINANCIAL_STATE_CONFLICT
        ) {
          const current = await this.repository.runInTransaction((repository) =>
            repository.lockPostForMutation(postId)
          );
          if (!current || current.status === "withdrawn" || current.status === "expired") {
            continue;
          }
        }
        throw error;
      }
    }
    return expired;
  }

  private async setLike(
    access: AuthenticatedAccessContext,
    postId: number,
    key: string,
    liked: boolean
  ): Promise<ExchangeInteractionCounts> {
    const actor = await this.resolveActor(access);
    await this.assertPostReadable(actor, postId);
    const result = await this.repository.setLike({
      actor,
      postId,
      liked,
      idempotencyKey: exchangeIdempotencyKeySchema.parse(key),
      now: this.now(),
      audit: this.audit(access, `exchange.post.${liked ? "like" : "unlike"}`, postId, {
        identityId: actor.identityId
      })
    });
    return this.unwrapMutation(result);
  }

  private async resolveActor(
    access: AuthenticatedAccessContext,
    repository: ExchangeRepositoryPort = this.repository
  ): Promise<ExchangeActorRecord> {
    if (!access.currentIdentityId || !access.currentIdentityType || !access.currentPublicId) {
      throw this.identityForbidden();
    }
    const lookup: ExchangeActorLookup = {
      userId: access.userId,
      identityId: access.currentIdentityId,
      identityType: access.currentIdentityType,
      scopeType: access.currentIdentityScopeType ?? null,
      scopeId: access.currentIdentityScopeId ?? null,
      publicId: access.currentPublicId
    };
    const actor = await repository.resolveActor(lookup);
    if (
      !actor ||
      actor.userId !== lookup.userId ||
      actor.identityId !== lookup.identityId ||
      actor.identityType !== lookup.identityType ||
      actor.scopeType !== lookup.scopeType ||
      actor.scopeId !== lookup.scopeId ||
      actor.publicId !== lookup.publicId
    ) {
      throw this.identityForbidden();
    }
    if (!this.personalIdentityScopeService) return actor;
    const scope = await this.personalIdentityScopeService.resolve(access);
    return { ...actor, ownerIdentityId: scope.identityId };
  }

  private publicationFingerprint(
    actor: ExchangeActorRecord,
    input: PublishExchangePostBody
  ): string {
    const authority = {
      userId: actor.userId,
      identityId: actor.identityId,
      scopeType: actor.scopeType,
      scopeId: actor.scopeId
    };
    const common = {
      type: input.type,
      title: input.title,
      detail: input.detail,
      contentLocale: input.contentLocale,
      serviceStartAt: input.serviceStartAt.toISOString(),
      serviceEndAt: input.serviceEndAt.toISOString(),
      expiresAt: input.expiresAt.toISOString()
    };
    const payload =
      input.type === "demand"
        ? {
            ...common,
            targetProviderCount: input.targetProviderCount,
            matchMode: input.matchMode,
            budgetMode: input.budgetMode,
            budgetMinJpy: input.budgetMinJpy ?? null,
            budgetMaxJpy: input.budgetMaxJpy,
            addressLine1: input.addressLine1,
            addressLine2: input.addressLine2 ?? null,
            addressLine3: input.addressLine3 ?? null,
            addressLine2Public: input.addressLine2Public,
            addressLine3Public: input.addressLine3Public,
            publisherIdentityPublic: input.publisherIdentityPublic
          }
        : {
            ...common,
            areaLabel: input.areaLabel,
            serviceMode: input.serviceMode,
            addressLabel: input.addressLabel ?? null,
            serviceAreas: input.serviceAreas,
            originalPriceJpy: input.originalPriceJpy ?? null,
            campaignPriceJpy: input.campaignPriceJpy
          };

    return sha256StableJson({ authority, payload });
  }

  private unwrapPublicationReplay(
    replay: ExchangePublicationRecord,
    payloadFingerprint: string
  ): ExchangePostPayload {
    if (replay.payloadFingerprint !== payloadFingerprint) {
      throw this.idempotencyConflict();
    }
    return replay.value;
  }

  private isUniqueConflict(error: unknown): boolean {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
  }

  private idempotencyConflict(): AppError {
    return new AppError({
      code: ERROR_CODES.EXCHANGE_REQUEST_IDEMPOTENCY_CONFLICT,
      message: "error.exchange.idempotency_conflict",
      statusCode: 409
    });
  }

  private requestFeeUnavailable(): AppError {
    return new AppError({
      code: ERROR_CODES.EXCHANGE_REQUEST_FEE_UNAVAILABLE,
      message: "error.exchange.request_fee_unavailable",
      statusCode: 503
    });
  }

  private exchangeFinancialStateConflict(): AppError {
    return new AppError({
      code: ERROR_CODES.EXCHANGE_REQUEST_FINANCIAL_STATE_CONFLICT,
      message: "error.exchange.request_financial_state_conflict",
      statusCode: 409
    });
  }

  private assertCanPublish(identityType: string, postType: ExchangePostType): void {
    const allowed =
      ((PERSONAL_DEMAND_PUBLISHER_IDENTITIES.has(identityType) ||
        SHOP_DEMAND_PUBLISHER_IDENTITIES.has(identityType)) &&
        postType === "demand") ||
      (INTELLIGENCE_PUBLISHER_IDENTITIES.has(identityType) && postType === "intelligence");
    if (!allowed) throw this.identityForbidden();
  }

  private resolvePublisherCapacity(
    actor: ExchangeActorRecord,
    at: Date
  ): ExchangePublisherCapacity {
    const currency = actor.isTestAccount ? "TEST_NDP" : "NDP";
    if (PERSONAL_DEMAND_PUBLISHER_IDENTITIES.has(actor.identityType)) {
      const membership = actor.customerMembership;
      if (!membership) throw this.identityForbidden();
      if (
        ["customer", "user", "u"].includes(actor.identityType) &&
        (actor.scopeType !== "customer_profile" || actor.scopeId !== membership.profileId)
      ) {
        throw this.identityForbidden();
      }
      const effectiveMembership = resolveEffectiveCustomerMembershipLevel(membership, at)
        .trim()
        .toLowerCase();
      if (!this.isCustomerMembershipLevel(effectiveMembership)) throw this.identityForbidden();
      return {
        source: "customer_membership",
        membershipLevel: effectiveMembership,
        targetProviderLimit: CUSTOMER_MEMBERSHIP_LIMITS[effectiveMembership],
        payerOwnerType: "user",
        payerOwnerId: actor.userId,
        currency
      };
    }
    if (SHOP_DEMAND_PUBLISHER_IDENTITIES.has(actor.identityType)) {
      if (
        actor.scopeType !== "shop" ||
        !actor.scopeId ||
        !actor.shopScope ||
        actor.shopScope.shopId !== actor.scopeId ||
        actor.shopScope.status !== "published"
      ) {
        throw this.identityForbidden();
      }
      return {
        source: "shop_merchant",
        membershipLevel: null,
        targetProviderLimit: 20,
        payerOwnerType: "shop",
        payerOwnerId: actor.shopScope.shopId,
        currency
      };
    }
    throw this.identityForbidden();
  }

  private assertTargetWithinCapacity(target: number, limit: number): void {
    if (Number.isSafeInteger(target) && target >= 1 && target <= limit) return;
    throw new AppError({
      code: ERROR_CODES.EXCHANGE_REQUEST_TARGET_LIMIT,
      message: "error.exchange.request_target_limit",
      statusCode: 409
    });
  }

  private isCustomerMembershipLevel(value: string): value is ExchangeCustomerMembershipLevel {
    return Object.prototype.hasOwnProperty.call(CUSTOMER_MEMBERSHIP_LIMITS, value);
  }

  private async assertPostReadable(actor: ExchangeActorRecord, postId: number): Promise<void> {
    const post = await this.repository.findPostById(
      postId,
      actor.ownerIdentityId ?? actor.identityId,
      this.now()
    );
    if (!post) throw this.postNotFound();
    this.assertCanReadPost(actor, post);
  }

  private assertCanReadPost(actor: ExchangeActorRecord, post: ExchangePostPayload): void {
    if (post.type !== "demand") return;
    if (post.viewer.canWithdraw || DEMAND_AUDIENCE_IDENTITIES.has(actor.identityType)) return;
    throw this.postNotFound();
  }

  private decorateClaimCapabilities(
    post: ExchangePostPayload,
    actor: ExchangeActorRecord
  ): ExchangePostPayload {
    const selectiveLiveDemand =
      post.type === "demand" &&
      post.status === "published" &&
      post.demand?.matchMode === "selective";
    const ownerView = post.viewer.canWithdraw;
    return {
      ...post,
      viewer: {
        ...post.viewer,
        canClaim:
          selectiveLiveDemand && CLAIM_PROVIDER_IDENTITIES.has(actor.identityType) && !ownerView,
        canViewClaims: selectiveLiveDemand && ownerView
      }
    };
  }

  private unwrapMutation<TValue>(result: ExchangeMutationResult<TValue>): TValue {
    if (result.kind === "success" || result.kind === "replayed") return result.value;
    if (result.kind === "not_found") throw this.postNotFound();
    if (result.kind === "forbidden") {
      throw new AppError({
        code: ERROR_CODES.FORBIDDEN,
        message: "error.exchange.author_required",
        statusCode: 403
      });
    }
    throw new AppError({
      code: ERROR_CODES.ORDER_INVALID_TRANSITION,
      message: "error.exchange.post_unavailable",
      statusCode: 409
    });
  }

  private audit(
    access: AuthenticatedAccessContext,
    action: string,
    targetId: number | null,
    metadata: Record<string, unknown>
  ): AuditLogCreateInput {
    return {
      actorId: access.userId,
      action,
      targetType: "ExchangePost",
      targetId,
      metadata
    };
  }

  private identityForbidden(): AppError {
    return new AppError({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.identity.forbidden",
      statusCode: 403
    });
  }

  private postNotFound(): AppError {
    return new AppError({
      code: ERROR_CODES.NOT_FOUND,
      message: "error.exchange.post_not_found",
      statusCode: 404
    });
  }

  private authorRequired(): AppError {
    return new AppError({
      code: ERROR_CODES.FORBIDDEN,
      message: "error.exchange.author_required",
      statusCode: 403
    });
  }

  private postUnavailable(): AppError {
    return new AppError({
      code: ERROR_CODES.ORDER_INVALID_TRANSITION,
      message: "error.exchange.post_unavailable",
      statusCode: 409
    });
  }
}
