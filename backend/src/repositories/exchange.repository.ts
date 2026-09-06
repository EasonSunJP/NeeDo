import {
  ContentLocale,
  ExchangeBudgetMode as DatabaseExchangeBudgetMode,
  ExchangeClaimStatus as DatabaseExchangeClaimStatus,
  ExchangeDemandServiceMode as DatabaseExchangeDemandServiceMode,
  ExchangeMatchEventType as DatabaseExchangeMatchEventType,
  ExchangeMatchMode as DatabaseExchangeMatchMode,
  ExchangeMatchingStatus as DatabaseExchangeMatchingStatus,
  ExchangePostStatus as DatabaseExchangePostStatus,
  ExchangePostType as DatabaseExchangePostType,
  ExchangePublisherCapacitySource as DatabaseExchangePublisherCapacitySource,
  ExchangeRequestFinancialState as DatabaseExchangeRequestFinancialState,
  ExchangeServiceMode as DatabaseExchangeServiceMode
} from "@prisma/client";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { ContentLocaleCode } from "../constants/content-locales";
import { prisma } from "../prisma/client";
import type {
  ExchangeActorLookup,
  ExchangeActorRecord,
  ExchangeCommentRepositoryInput,
  ExchangeLikeRepositoryInput,
  ExchangeMutationResult,
  ExchangePublicationRecord,
  ExchangePublishRepositoryInput,
  ExchangeRepositoryPort,
  ExchangeShareRepositoryInput,
  ExchangeTerminalPostRecord
} from "../services/exchange.service";
import type {
  ExchangeCommentPage,
  ExchangeCommentPayload,
  ExchangeBudgetMode,
  ExchangeCustomerMembershipLevel,
  ExchangeDemandServiceMode,
  ExchangeInteractionCounts,
  ExchangeListInput,
  ExchangeMatchMode,
  ExchangePostPage,
  ExchangePostPayload,
  ExchangePriorityPayload,
  ExchangePostStatus,
  ExchangePostType,
  ExchangePublisherCapacitySource,
  ExchangeServiceMode
} from "../types/exchange.types";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import { toAuditLogCreateData } from "./audit-log.repository";

const typeToDatabase: Record<ExchangePostType, DatabaseExchangePostType> = {
  demand: DatabaseExchangePostType.DEMAND,
  intelligence: DatabaseExchangePostType.INTELLIGENCE
};

const typeFromDatabase: Record<DatabaseExchangePostType, ExchangePostType> = {
  [DatabaseExchangePostType.DEMAND]: "demand",
  [DatabaseExchangePostType.INTELLIGENCE]: "intelligence"
};

const statusFromDatabase: Record<DatabaseExchangePostStatus, ExchangePostStatus> = {
  [DatabaseExchangePostStatus.PUBLISHED]: "published",
  [DatabaseExchangePostStatus.WITHDRAWN]: "withdrawn",
  [DatabaseExchangePostStatus.EXPIRED]: "expired",
  [DatabaseExchangePostStatus.MATCHED]: "matched",
  [DatabaseExchangePostStatus.CLOSED]: "closed"
};

const requestFinancialStateFromDatabase: Record<
  DatabaseExchangeRequestFinancialState,
  NonNullable<ExchangeTerminalPostRecord["requestFinancial"]>["state"]
> = {
  [DatabaseExchangeRequestFinancialState.HELD]: "held",
  [DatabaseExchangeRequestFinancialState.CAPTURED]: "captured",
  [DatabaseExchangeRequestFinancialState.RELEASED]: "released"
};

const serviceModeFromDatabase: Record<DatabaseExchangeServiceMode, ExchangeServiceMode> = {
  [DatabaseExchangeServiceMode.STORE]: "store",
  [DatabaseExchangeServiceMode.ONSITE]: "onsite",
  [DatabaseExchangeServiceMode.FLEXIBLE]: "flexible"
};

const demandServiceModeFromDatabase: Record<
  DatabaseExchangeDemandServiceMode,
  ExchangeDemandServiceMode
> = {
  [DatabaseExchangeDemandServiceMode.HOME]: "home",
  [DatabaseExchangeDemandServiceMode.STORE]: "store"
};

const localeFromDatabase: Record<ContentLocale, ContentLocaleCode> = {
  [ContentLocale.ZH_CN]: "zh-CN",
  [ContentLocale.ZH_TW]: "zh-TW",
  [ContentLocale.EN]: "en",
  [ContentLocale.JA]: "ja",
  [ContentLocale.KO]: "ko"
};

const localeToDatabase: Record<ContentLocaleCode, ContentLocale> = {
  "zh-CN": ContentLocale.ZH_CN,
  "zh-TW": ContentLocale.ZH_TW,
  en: ContentLocale.EN,
  ja: ContentLocale.JA,
  ko: ContentLocale.KO
};

const serviceModeToDatabase: Record<ExchangeServiceMode, DatabaseExchangeServiceMode> = {
  store: DatabaseExchangeServiceMode.STORE,
  onsite: DatabaseExchangeServiceMode.ONSITE,
  flexible: DatabaseExchangeServiceMode.FLEXIBLE
};

const demandServiceModeToDatabase: Record<
  ExchangeDemandServiceMode,
  DatabaseExchangeDemandServiceMode
> = {
  home: DatabaseExchangeDemandServiceMode.HOME,
  store: DatabaseExchangeDemandServiceMode.STORE
};

const matchModeFromDatabase: Record<DatabaseExchangeMatchMode, ExchangeMatchMode> = {
  [DatabaseExchangeMatchMode.QUICK]: "quick",
  [DatabaseExchangeMatchMode.SELECTIVE]: "selective"
};

const matchModeToDatabase: Record<ExchangeMatchMode, DatabaseExchangeMatchMode> = {
  quick: DatabaseExchangeMatchMode.QUICK,
  selective: DatabaseExchangeMatchMode.SELECTIVE
};

const budgetModeFromDatabase: Record<DatabaseExchangeBudgetMode, ExchangeBudgetMode> = {
  [DatabaseExchangeBudgetMode.TOTAL]: "total",
  [DatabaseExchangeBudgetMode.PER_PROVIDER]: "per_provider"
};

const budgetModeToDatabase: Record<ExchangeBudgetMode, DatabaseExchangeBudgetMode> = {
  total: DatabaseExchangeBudgetMode.TOTAL,
  per_provider: DatabaseExchangeBudgetMode.PER_PROVIDER
};

const capacitySourceFromDatabase: Record<
  DatabaseExchangePublisherCapacitySource,
  ExchangePublisherCapacitySource
> = {
  [DatabaseExchangePublisherCapacitySource.CUSTOMER_MEMBERSHIP]: "customer_membership",
  [DatabaseExchangePublisherCapacitySource.SHOP_MERCHANT]: "shop_merchant"
};

const capacitySourceToDatabase: Record<
  ExchangePublisherCapacitySource,
  DatabaseExchangePublisherCapacitySource
> = {
  customer_membership: DatabaseExchangePublisherCapacitySource.CUSTOMER_MEMBERSHIP,
  shop_merchant: DatabaseExchangePublisherCapacitySource.SHOP_MERCHANT
};

const PERSONAL_DEMAND_IDENTITIES = new Set([
  "customer",
  "user",
  "u",
  "scout",
  "affiliate",
  "alliance_marketing"
]);

const SHOP_MERCHANT_IDENTITIES = new Set(["merchant", "merchant_owner", "merchant_staff"]);

const membershipLevelSnapshotFromDatabase = (
  value: string | null
): ExchangeCustomerMembershipLevel | null => {
  if (value === null) return null;
  if (value === "standard" || value === "silver" || value === "gold" || value === "black") {
    return value;
  }
  throw new Error("error.exchange.invalid_membership_snapshot");
};

const postInclude = (viewerIdentityId: number) =>
  ({
    demand: { where: { deletedAt: null } },
    intelligence: { where: { deletedAt: null } },
    likes: {
      where: { actorIdentityId: viewerIdentityId, deletedAt: null },
      select: { id: true },
      take: 1
    },
    matchParticipants: {
      where: { participantIdentityId: viewerIdentityId, deletedAt: null },
      select: { id: true },
      take: 1
    },
    matching: {
      select: {
        status: true,
        effectiveTargetProviderCount: true,
        deletedAt: true
      }
    },
    _count: {
      select: {
        comments: { where: { deletedAt: null } },
        likes: { where: { deletedAt: null } },
        shares: { where: { deletedAt: null } },
        claims: {
          where: { status: "ACTIVE", deletedAt: null }
        }
      }
    }
  }) satisfies Prisma.ExchangePostInclude;

type ExchangePostRecord = Prisma.ExchangePostGetPayload<{
  include: ReturnType<typeof postInclude>;
}>;

type PrioritizedDemandRow = {
  id: number | bigint;
  priorityActive: boolean | number | bigint;
  tierRank: number | bigint;
  tierCode: string | null;
};

const platformTierCodes = new Set(["free", "silver", "gold", "black_diamond"]);

const toPriorityPayload = (row: PrioritizedDemandRow): ExchangePriorityPayload => {
  const tierCode = row.tierCode ?? "free";
  if (!platformTierCodes.has(tierCode)) {
    throw new Error("error.exchange.invalid_priority_tier");
  }
  return {
    active: Number(row.priorityActive) === 1,
    tierCode: tierCode as ExchangePriorityPayload["tierCode"]
  };
};

const isServiceAreaList = (value: Prisma.JsonValue): value is string[] =>
  Array.isArray(value) && value.every((area) => typeof area === "string");

type ExchangePrismaClient = PrismaClient | Prisma.TransactionClient;

export class ExchangePostRepository implements ExchangeRepositoryPort {
  public constructor(private readonly client: ExchangePrismaClient = prisma) {}

  public runInTransaction<T>(
    handler: (repository: ExchangeRepositoryPort, transactionClient?: unknown) => Promise<T>,
    transactionClient?: unknown
  ): Promise<T> {
    return this.withClientTransaction(
      (transaction) => handler(new ExchangePostRepository(transaction), transaction),
      transactionClient as ExchangePrismaClient | undefined
    );
  }

  public async resolveActor(input: ExchangeActorLookup): Promise<ExchangeActorRecord | null> {
    const identity = await this.client.userIdentity.findFirst({
      where: {
        id: input.identityId,
        userId: input.userId,
        type: input.identityType,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        isActive: true,
        deletedAt: null,
        user: { is: { isActive: true, deletedAt: null } }
      },
      select: {
        id: true,
        userId: true,
        type: true,
        scopeType: true,
        scopeId: true,
        displayName: true,
        publicIdentifier: { select: { publicId: true, status: true, deletedAt: true } },
        user: {
          select: {
            username: true,
            avatarUrl: true,
            needoId: true,
            isTestAccount: true,
            customerProfile: {
              select: {
                id: true,
                membershipLevel: true,
                membershipGrantMode: true,
                membershipStartsAt: true,
                membershipExpiresAt: true,
                deletedAt: true
              }
            }
          }
        }
      }
    });
    if (!identity) return null;
    const customerProfile = identity.user.customerProfile;
    if (
      PERSONAL_DEMAND_IDENTITIES.has(identity.type) &&
      (!customerProfile || customerProfile.deletedAt !== null)
    ) {
      return null;
    }
    if (
      ["customer", "user", "u"].includes(identity.type) &&
      (identity.scopeType !== "customer_profile" || identity.scopeId !== customerProfile?.id)
    ) {
      return null;
    }
    let shopScope: ExchangeActorRecord["shopScope"] = null;
    if (SHOP_MERCHANT_IDENTITIES.has(identity.type) && identity.scopeType === "shop") {
      if (!identity.scopeId) return null;
      const shop = await this.client.shop.findFirst({
        where: { id: identity.scopeId, status: "published", deletedAt: null },
        select: { id: true, status: true }
      });
      if (!shop) return null;
      shopScope = { shopId: shop.id, status: shop.status };
    }
    const directPublicId =
      identity.publicIdentifier?.status === "ACTIVE" && identity.publicIdentifier.deletedAt === null
        ? identity.publicIdentifier.publicId
        : null;
    const effectivePublicId =
      directPublicId ??
      (["customer", "user", "u"].includes(identity.type) ? identity.user.needoId : null);
    if (effectivePublicId !== input.publicId) return null;
    return {
      userId: identity.userId,
      identityId: identity.id,
      identityType: identity.type,
      scopeType: identity.scopeType,
      scopeId: identity.scopeId,
      publicId: effectivePublicId,
      displayName: identity.displayName ?? identity.user.username,
      avatarUrl: identity.user.avatarUrl,
      isTestAccount: identity.user.isTestAccount,
      customerMembership:
        customerProfile && customerProfile.deletedAt === null
          ? {
              profileId: customerProfile.id,
              membershipLevel: customerProfile.membershipLevel,
              membershipGrantMode: customerProfile.membershipGrantMode,
              membershipStartsAt: customerProfile.membershipStartsAt,
              membershipExpiresAt: customerProfile.membershipExpiresAt
            }
          : null,
      shopScope
    };
  }

  public async listPosts(input: ExchangeListInput): Promise<ExchangePostPage> {
    const pagination = toPrismaPagination({ page: input.page, pageSize: input.pageSize });
    const where = {
      type: typeToDatabase[input.type],
      status: DatabaseExchangePostStatus.PUBLISHED,
      expiresAt: { gt: input.now },
      ...(input.authorIdentityId ? { ownerIdentityId: input.authorIdentityId } : {}),
      deletedAt: null
    } satisfies Prisma.ExchangePostWhereInput;

    const publicDemandMarketplace = input.type === "demand" && input.authorIdentityId === undefined;
    const rowsPromise: Promise<
      Array<{ record: ExchangePostRecord; priority?: ExchangePriorityPayload }>
    > = publicDemandMarketplace
      ? this.listPrioritizedDemandRows(input, pagination.skip, pagination.take)
      : this.client.exchangePost
          .findMany({
            where,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip: pagination.skip,
            take: pagination.take,
            include: postInclude(input.viewerIdentityId)
          })
          .then((records) => records.map((record) => ({ record })));
    const [rows, total] = await Promise.all([
      rowsPromise,
      this.client.exchangePost.count({ where })
    ]);

    return buildPaginatedResponse(
      rows.map((row) =>
        this.mapPost(
          row.record,
          input.viewerIdentityId,
          input.now,
          row.priority,
          input.claimProviderUserId
        )
      ),
      total,
      pagination
    );
  }

  private async listPrioritizedDemandRows(
    input: ExchangeListInput,
    skip: number,
    take: number
  ): Promise<Array<{ record: ExchangePostRecord; priority?: ExchangePriorityPayload }>> {
    const ranked = await this.client.$queryRaw<PrioritizedDemandRow[]>(Prisma.sql`
      WITH active_membership AS (
        SELECT
          entitlement.user_id AS userId,
          entitlement.tier_version_id AS tierVersionId,
          tier.code AS tierCode,
          tier.sort_order AS tierRank,
          ROW_NUMBER() OVER (
            PARTITION BY entitlement.user_id
            ORDER BY entitlement.starts_at DESC, entitlement.id DESC
          ) AS membershipRow
        FROM platform_membership_entitlements AS entitlement
        INNER JOIN platform_membership_tier_versions AS tierVersion
          ON tierVersion.id = entitlement.tier_version_id
          AND tierVersion.status IN ('published', 'archived')
          AND tierVersion.deleted_at IS NULL
        INNER JOIN platform_membership_tiers AS tier
          ON tier.id = tierVersion.tier_id
          AND tier.deleted_at IS NULL
        WHERE entitlement.starts_at <= ${input.now}
          AND (entitlement.expires_at IS NULL OR entitlement.expires_at > ${input.now})
          AND entitlement.superseded_at IS NULL
          AND entitlement.deleted_at IS NULL
      ),
      free_membership AS (
        SELECT
          tierVersion.id AS tierVersionId,
          tier.code AS tierCode,
          tier.sort_order AS tierRank,
          ROW_NUMBER() OVER (
            ORDER BY tierVersion.effective_from DESC, tierVersion.version DESC, tierVersion.id DESC
          ) AS membershipRow
        FROM platform_membership_tier_versions AS tierVersion
        INNER JOIN platform_membership_tiers AS tier
          ON tier.id = tierVersion.tier_id
          AND tier.code = 'free'
          AND tier.deleted_at IS NULL
        WHERE tierVersion.status = 'published'
          AND tierVersion.effective_from <= ${input.now}
          AND (tierVersion.effective_to IS NULL OR tierVersion.effective_to > ${input.now})
          AND tierVersion.deleted_at IS NULL
      )
      SELECT
        post.id AS id,
        CASE
          WHEN benefit.is_globally_enabled = TRUE AND tierBenefit.is_enabled = TRUE THEN 1
          ELSE 0
        END AS priorityActive,
        COALESCE(active.tierRank, free.tierRank, 0) AS tierRank,
        COALESCE(active.tierCode, free.tierCode, 'free') AS tierCode
      FROM exchange_posts AS post
      LEFT JOIN active_membership AS active
        ON active.userId = post.author_user_id
        AND active.membershipRow = 1
      LEFT JOIN free_membership AS free
        ON free.membershipRow = 1
      LEFT JOIN platform_membership_benefits AS benefit
        ON benefit.code = ${"priority_request"}
        AND benefit.deleted_at IS NULL
      LEFT JOIN platform_membership_tier_benefits AS tierBenefit
        ON tierBenefit.tier_version_id = COALESCE(active.tierVersionId, free.tierVersionId)
        AND tierBenefit.benefit_id = benefit.id
        AND tierBenefit.deleted_at IS NULL
      WHERE post.type = 'demand'
        AND post.status = 'published'
        AND post.expires_at > ${input.now}
        AND post.deleted_at IS NULL
      ORDER BY
        priorityActive DESC,
        CASE WHEN priorityActive = 1 THEN COALESCE(active.tierRank, free.tierRank, 0) ELSE 0 END DESC,
        post.created_at ASC,
        post.id ASC
      LIMIT ${take} OFFSET ${skip}
    `);
    const ids = ranked.map((row) => Number(row.id));
    if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
      throw new Error("error.exchange.invalid_priority_post_id");
    }
    if (ids.length === 0) return [];

    const records = await this.client.exchangePost.findMany({
      where: { id: { in: ids }, deletedAt: null },
      include: postInclude(input.viewerIdentityId)
    });
    const recordsById = new Map(records.map((record) => [record.id, record]));
    return ranked.flatMap((row) => {
      const record = recordsById.get(Number(row.id));
      return record ? [{ record, priority: toPriorityPayload(row) }] : [];
    });
  }

  public async findPostById(
    postId: number,
    viewerIdentityId: number,
    now: Date,
    claimProviderUserId?: number
  ): Promise<ExchangePostPayload | null> {
    const row = await this.client.exchangePost.findFirst({
      where: { id: postId, deletedAt: null },
      include: postInclude(viewerIdentityId)
    });

    return row ? this.mapPost(row, viewerIdentityId, now, undefined, claimProviderUserId) : null;
  }

  public async listComments(
    postId: number,
    input: { page: number; pageSize: number }
  ): Promise<ExchangeCommentPage> {
    const pagination = toPrismaPagination(input);
    const where = { postId, deletedAt: null } satisfies Prisma.ExchangeCommentWhereInput;
    const [rows, total] = await Promise.all([
      this.client.exchangeComment.findMany({
        where,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.client.exchangeComment.count({ where })
    ]);

    return buildPaginatedResponse(
      rows.map((row) => this.mapComment(row)),
      total,
      pagination
    );
  }

  public async findPostByIdempotencyKey(
    idempotencyKey: string,
    ownerIdentityId: number,
    now: Date
  ): Promise<ExchangePublicationRecord | null> {
    const existing = await this.client.exchangePost.findFirst({
      where: { idempotencyKey, ownerIdentityId, deletedAt: null },
      include: postInclude(ownerIdentityId)
    });
    if (!existing) return null;

    return {
      ownerIdentityId: existing.ownerIdentityId,
      payloadFingerprint: existing.payloadFingerprint,
      value: this.mapPost(existing, ownerIdentityId, now)
    };
  }

  public async createPost(input: ExchangePublishRepositoryInput): Promise<{ id: number }> {
    const ownerIdentityId = input.actor.ownerIdentityId ?? input.actor.identityId;
    const capacity = input.capacity;
    if (input.input.type === "demand" && !capacity) {
      throw new Error("error.exchange.request_capacity_missing");
    }
    const created = await this.client.exchangePost.create({
      data: {
        authorUserId: input.actor.userId,
        authorIdentityId: input.actor.identityId,
        ownerIdentityId,
        publisherPublicId: input.actor.publicId,
        publisherIdentityType: input.actor.identityType,
        publisherDisplayName: input.actor.displayName,
        publisherAvatarUrl: input.actor.avatarUrl,
        type: typeToDatabase[input.input.type],
        status: DatabaseExchangePostStatus.PUBLISHED,
        title: input.input.title,
        detail: input.input.detail,
        contentLocale: localeToDatabase[input.input.contentLocale],
        areaLabel: input.input.type === "demand" ? input.input.addressLine1 : input.input.areaLabel,
        serviceStartAt: input.input.serviceStartAt,
        serviceEndAt: input.input.serviceEndAt,
        expiresAt: input.input.expiresAt,
        idempotencyKey: input.idempotencyKey,
        payloadFingerprint: input.payloadFingerprint,
        createdAt: input.now,
        updatedAt: input.now,
        ...(input.input.type === "demand"
          ? {
              demand: {
                create: {
                  targetProviderCount: input.input.targetProviderCount,
                  targetProviderLimitSnapshot: capacity!.targetProviderLimit,
                  publisherCapacitySource: capacitySourceToDatabase[capacity!.source],
                  membershipLevelSnapshot: capacity!.membershipLevel,
                  matchMode: matchModeToDatabase[input.input.matchMode],
                  budgetMode: budgetModeToDatabase[input.input.budgetMode],
                  budgetMinJpy: input.input.budgetMinJpy,
                  budgetMaxJpy: input.input.budgetMaxJpy,
                  addressLine1: input.input.addressLine1,
                  addressLine2: input.input.addressLine2,
                  addressLine3: input.input.addressLine3,
                  addressLine2Public: input.input.addressLine2Public,
                  addressLine3Public: input.input.addressLine3Public,
                  publisherIdentityPublic: input.input.publisherIdentityPublic,
                  serviceMode: demandServiceModeToDatabase[input.input.serviceMode]
                }
              },
              matching: {
                create: {
                  status: DatabaseExchangeMatchingStatus.OPEN,
                  effectiveTargetProviderCount: input.input.targetProviderCount,
                  effectiveBudgetMaxJpy:
                    input.input.budgetMode === "per_provider"
                      ? input.input.budgetMaxJpy * input.input.targetProviderCount
                      : input.input.budgetMaxJpy,
                  selectedQuoteTotalJpy: 0,
                  version: 1,
                  createdAt: input.now,
                  updatedAt: input.now,
                  events: {
                    create: {
                      sequence: 1,
                      type: DatabaseExchangeMatchEventType.OPENED,
                      versionBefore: 0,
                      versionAfter: 1,
                      payload: {
                        effectiveTargetProviderCount: input.input.targetProviderCount,
                        effectiveBudgetMaxJpy:
                          input.input.budgetMode === "per_provider"
                            ? input.input.budgetMaxJpy * input.input.targetProviderCount
                            : input.input.budgetMaxJpy
                      },
                      createdAt: input.now,
                      updatedAt: input.now
                    }
                  }
                }
              }
            }
          : {
              intelligence: {
                create: {
                  serviceMode: serviceModeToDatabase[input.input.serviceMode],
                  addressLabel: input.input.addressLabel,
                  serviceAreas: input.input.serviceAreas,
                  originalPriceJpy: input.input.originalPriceJpy,
                  campaignPriceJpy: input.input.campaignPriceJpy
                }
              }
            })
      },
      select: { id: true }
    });

    return created;
  }

  public async createAudit(
    input: Parameters<ExchangeRepositoryPort["createAudit"]>[0]
  ): Promise<void> {
    await this.client.auditLog.create({ data: toAuditLogCreateData(input) });
  }

  public async findPostByIdOrThrow(
    postId: number,
    viewerIdentityId: number,
    now: Date
  ): Promise<ExchangePostPayload> {
    const row = await this.client.exchangePost.findFirstOrThrow({
      where: { id: postId, deletedAt: null },
      include: postInclude(viewerIdentityId)
    });

    return this.mapPost(row, viewerIdentityId, now);
  }

  public async lockPostForMutation(postId: number): Promise<ExchangeTerminalPostRecord | null> {
    const locked = await this.client.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT id
        FROM exchange_posts
        WHERE id = ${postId}
          AND deleted_at IS NULL
        FOR UPDATE`
    );
    if (!locked[0]) return null;
    const post = await this.client.exchangePost.findFirst({
      where: { id: postId, deletedAt: null },
      select: {
        id: true,
        authorUserId: true,
        ownerIdentityId: true,
        type: true,
        status: true,
        expiresAt: true,
        requestFinancial: { select: { state: true } }
      }
    });
    if (!post) return null;
    return {
      id: post.id,
      authorUserId: post.authorUserId,
      ownerIdentityId: post.ownerIdentityId,
      type: typeFromDatabase[post.type],
      status: statusFromDatabase[post.status],
      expiresAt: post.expiresAt,
      requestFinancial: post.requestFinancial
        ? { state: requestFinancialStateFromDatabase[post.requestFinancial.state] }
        : null
    };
  }

  public async markWithdrawnIfPublished(postId: number, now: Date): Promise<boolean> {
    const updated = await this.client.exchangePost.updateMany({
      where: { id: postId, status: DatabaseExchangePostStatus.PUBLISHED, deletedAt: null },
      data: {
        status: DatabaseExchangePostStatus.WITHDRAWN,
        withdrawnAt: now,
        updatedAt: now
      }
    });
    return updated.count === 1;
  }

  public async markExpiredIfPublished(postId: number, now: Date): Promise<boolean> {
    const updated = await this.client.exchangePost.updateMany({
      where: {
        id: postId,
        status: DatabaseExchangePostStatus.PUBLISHED,
        expiresAt: { lte: now },
        deletedAt: null
      },
      data: { status: DatabaseExchangePostStatus.EXPIRED, updatedAt: now }
    });
    return updated.count === 1;
  }

  public async cancelActiveClaimsByPost(
    postId: number,
    status: "request_withdrawn" | "request_expired",
    now: Date
  ): Promise<number> {
    const updated = await this.client.exchangeClaim.updateMany({
      where: {
        exchangePostId: postId,
        status: DatabaseExchangeClaimStatus.ACTIVE,
        deletedAt: null
      },
      data: {
        status:
          status === "request_withdrawn"
            ? DatabaseExchangeClaimStatus.REQUEST_WITHDRAWN
            : DatabaseExchangeClaimStatus.REQUEST_EXPIRED,
        activeKey: null,
        terminalAt: now,
        updatedAt: now
      }
    });
    return updated.count;
  }

  public async closeOpenMatchingForTerminalPost(input: {
    exchangePostId: number;
    reason: "request_withdrawn" | "request_expired";
    actorUserId: number | null;
    actorIdentityId: number | null;
    at: Date;
  }): Promise<boolean> {
    const locked = await this.client.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT id
      FROM \`exchange_request_matchings\`
      WHERE exchange_post_id = ${input.exchangePostId}
        AND deleted_at IS NULL
      FOR UPDATE
    `);
    if (!locked[0]) return false;
    const matching = await this.client.exchangeRequestMatching.findUnique({
      where: { exchangePostId: input.exchangePostId },
      select: { id: true, status: true, version: true }
    });
    if (!matching || matching.status !== DatabaseExchangeMatchingStatus.OPEN) return false;
    const versionAfter = matching.version + 1;
    const updated = await this.client.exchangeRequestMatching.updateMany({
      where: {
        id: matching.id,
        exchangePostId: input.exchangePostId,
        status: DatabaseExchangeMatchingStatus.OPEN,
        version: matching.version,
        deletedAt: null
      },
      data: {
        status: DatabaseExchangeMatchingStatus.CLOSED,
        version: versionAfter,
        closedAt: input.at,
        updatedAt: input.at
      }
    });
    if (updated.count !== 1) return false;
    await this.client.exchangeMatchEvent.create({
      data: {
        matchingId: matching.id,
        sequence: versionAfter,
        type: DatabaseExchangeMatchEventType.CLOSED,
        actorUserId: input.actorUserId,
        actorIdentityId: input.actorIdentityId,
        versionBefore: matching.version,
        versionAfter,
        payload: { exchangePostId: input.exchangePostId, reason: input.reason },
        createdAt: input.at,
        updatedAt: input.at
      }
    });
    return true;
  }

  public async createComment(
    input: ExchangeCommentRepositoryInput
  ): Promise<ExchangeMutationResult<ExchangeCommentPayload>> {
    try {
      return await this.withClientTransaction(async (transaction) => {
        const existing = await transaction.exchangeComment.findUnique({
          where: { idempotencyKey: input.idempotencyKey }
        });
        if (existing) return { kind: "replayed", value: this.mapComment(existing) };
        const availability = await this.postAvailability(transaction, input.postId, input.now);
        if (availability !== "available") return { kind: availability };
        const created = await transaction.exchangeComment.create({
          data: {
            postId: input.postId,
            authorUserId: input.actor.userId,
            authorIdentityId: input.actor.identityId,
            authorPublicId: input.actor.publicId,
            authorIdentityType: input.actor.identityType,
            authorDisplayName: input.actor.displayName,
            authorAvatarUrl: input.actor.avatarUrl,
            content: input.input.content,
            idempotencyKey: input.idempotencyKey,
            createdAt: input.now,
            updatedAt: input.now
          }
        });
        await transaction.auditLog.create({
          data: toAuditLogCreateData({ ...input.audit, targetId: input.postId })
        });
        return { kind: "success", value: this.mapComment(created) };
      });
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
      const existing = await this.client.exchangeComment.findUnique({
        where: { idempotencyKey: input.idempotencyKey }
      });
      if (!existing) throw error;
      return { kind: "replayed", value: this.mapComment(existing) };
    }
  }

  public setLike(
    input: ExchangeLikeRepositoryInput
  ): Promise<ExchangeMutationResult<ExchangeInteractionCounts>> {
    const ownerIdentityId = input.actor.ownerIdentityId ?? input.actor.identityId;
    return this.withClientTransaction(async (transaction) => {
      const availability = await this.postAvailability(transaction, input.postId, input.now);
      if (availability !== "available") return { kind: availability };
      const existing = await transaction.exchangeLike.findUnique({
        where: {
          postId_actorIdentityId: { postId: input.postId, actorIdentityId: ownerIdentityId }
        }
      });
      let changed = false;
      if (input.liked && !existing) {
        await transaction.exchangeLike.create({
          data: {
            postId: input.postId,
            actorUserId: input.actor.userId,
            actorIdentityId: ownerIdentityId,
            createdAt: input.now,
            updatedAt: input.now
          }
        });
        changed = true;
      } else if (input.liked && existing?.deletedAt) {
        await transaction.exchangeLike.update({
          where: { id: existing.id },
          data: {
            actorIdentityId: ownerIdentityId,
            deletedAt: null,
            updatedAt: input.now
          }
        });
        changed = true;
      } else if (!input.liked && existing && !existing.deletedAt) {
        await transaction.exchangeLike.update({
          where: { id: existing.id },
          data: { deletedAt: input.now, updatedAt: input.now }
        });
        changed = true;
      }
      if (changed) {
        await transaction.auditLog.create({
          data: toAuditLogCreateData({ ...input.audit, targetId: input.postId })
        });
      }
      return {
        kind: changed ? "success" : "replayed",
        value: await this.countInteractions(transaction, input.postId)
      };
    });
  }

  public async recordShare(
    input: ExchangeShareRepositoryInput
  ): Promise<ExchangeMutationResult<ExchangeInteractionCounts>> {
    const ownerIdentityId = input.actor.ownerIdentityId ?? input.actor.identityId;
    try {
      return await this.withClientTransaction(async (transaction) => {
        const replay = await transaction.exchangeShare.findFirst({
          where: {
            OR: [
              { idempotencyKey: input.idempotencyKey },
              { postId: input.postId, actorIdentityId: ownerIdentityId }
            ],
            deletedAt: null
          },
          select: { id: true }
        });
        if (replay) {
          return {
            kind: "replayed",
            value: await this.countInteractions(transaction, input.postId)
          };
        }
        const availability = await this.postAvailability(transaction, input.postId, input.now);
        if (availability !== "available") return { kind: availability };
        await transaction.exchangeShare.create({
          data: {
            postId: input.postId,
            actorUserId: input.actor.userId,
            actorIdentityId: ownerIdentityId,
            idempotencyKey: input.idempotencyKey,
            createdAt: input.now,
            updatedAt: input.now
          }
        });
        await transaction.auditLog.create({
          data: toAuditLogCreateData({ ...input.audit, targetId: input.postId })
        });
        return {
          kind: "success",
          value: await this.countInteractions(transaction, input.postId)
        };
      });
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
      return this.withClientTransaction(async (transaction) => ({
        kind: "replayed" as const,
        value: await this.countInteractions(transaction, input.postId)
      }));
    }
  }

  public async listDuePostIds(now: Date, batchSize: number): Promise<number[]> {
    const due = await this.client.exchangePost.findMany({
      where: {
        status: DatabaseExchangePostStatus.PUBLISHED,
        expiresAt: { lte: now },
        deletedAt: null
      },
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      take: Math.max(1, Math.floor(batchSize)),
      select: { id: true }
    });
    return due.map(({ id }) => id);
  }

  private mapPost(
    row: ExchangePostRecord,
    viewerIdentityId: number,
    now: Date,
    priority?: ExchangePriorityPayload,
    claimProviderUserId?: number
  ): ExchangePostPayload {
    const expired =
      row.status === DatabaseExchangePostStatus.PUBLISHED &&
      row.expiresAt.getTime() <= now.getTime();
    const status = expired ? "expired" : statusFromDatabase[row.status];
    const ownerView = row.ownerIdentityId === viewerIdentityId;
    const matchedParticipantView = row.matchParticipants.length > 0;
    const claimableByProviderUser =
      claimProviderUserId !== undefined && row.authorUserId !== claimProviderUserId;
    const matchingOpen =
      row.matching?.status === DatabaseExchangeMatchingStatus.OPEN &&
      row.matching.deletedAt === null;
    const activeClaimCount = row._count.claims ?? 0;
    const matchingHasCapacity =
      row.demand?.matchMode === DatabaseExchangeMatchMode.SELECTIVE ||
      (row.demand?.matchMode === DatabaseExchangeMatchMode.QUICK &&
        Boolean(row.matching) &&
        activeClaimCount < row.matching!.effectiveTargetProviderCount);
    const intelligence = row.intelligence
      ? (() => {
          if (!isServiceAreaList(row.intelligence.serviceAreas)) {
            throw new Error("error.exchange.invalid_service_areas");
          }
          return {
            serviceMode: serviceModeFromDatabase[row.intelligence.serviceMode],
            addressLabel: row.intelligence.addressLabel,
            serviceAreas: row.intelligence.serviceAreas,
            originalPriceJpy: row.intelligence.originalPriceJpy,
            campaignPriceJpy: row.intelligence.campaignPriceJpy
          };
        })()
      : null;

    const demand = row.demand
      ? {
          serviceMode: demandServiceModeFromDatabase[row.demand.serviceMode],
          targetProviderCount: row.demand.targetProviderCount,
          targetProviderLimitSnapshot: row.demand.targetProviderLimitSnapshot,
          publisherCapacitySource: capacitySourceFromDatabase[row.demand.publisherCapacitySource],
          membershipLevelSnapshot: membershipLevelSnapshotFromDatabase(
            row.demand.membershipLevelSnapshot
          ),
          matchMode: matchModeFromDatabase[row.demand.matchMode],
          budgetMode: budgetModeFromDatabase[row.demand.budgetMode],
          budgetMinJpy: row.demand.budgetMinJpy,
          budgetMaxJpy: row.demand.budgetMaxJpy,
          address: {
            line1: row.demand.addressLine1,
            line2:
              ownerView || matchedParticipantView || row.demand.addressLine2Public
                ? row.demand.addressLine2
                : null,
            line3:
              ownerView || matchedParticipantView || row.demand.addressLine3Public
                ? row.demand.addressLine3
                : null,
            line2GenerallyVisible: row.demand.addressLine2Public,
            line3GenerallyVisible: row.demand.addressLine3Public,
            disclosure: ownerView
              ? ("owner" as const)
              : matchedParticipantView
                ? ("matched_participant" as const)
                : ("general" as const)
          }
        }
      : null;
    const showPublisher =
      !row.demand || ownerView || matchedParticipantView || row.demand.publisherIdentityPublic;

    return {
      id: row.id,
      type: typeFromDatabase[row.type],
      status,
      title: row.title,
      detail: row.detail,
      contentLocale: localeFromDatabase[row.contentLocale],
      areaLabel: row.areaLabel,
      serviceStartAt: row.serviceStartAt.toISOString(),
      serviceEndAt: row.serviceEndAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      publishedAt: row.createdAt.toISOString(),
      publisher: showPublisher
        ? {
            publicId: row.publisherPublicId,
            identityType: row.publisherIdentityType,
            displayName: row.publisherDisplayName,
            avatarUrl: row.publisherAvatarUrl
          }
        : null,
      counts: {
        comments: row._count.comments,
        likes: row._count.likes,
        shares: row._count.shares
      },
      viewer: {
        liked: row.likes.length > 0,
        canWithdraw: ownerView && status === "published",
        canClaim:
          claimableByProviderUser &&
          status === "published" &&
          Boolean(row.demand) &&
          matchingOpen &&
          matchingHasCapacity,
        canViewClaims:
          ownerView &&
          status !== "withdrawn" &&
          status !== "expired" &&
          Boolean(row.demand),
        canViewMatching: ownerView || matchedParticipantView
      },
      ...(priority ? { priority } : {}),
      demand,
      intelligence
    };
  }

  private mapComment(row: {
    id: number;
    postId: number;
    authorPublicId: string;
    authorIdentityType: string;
    authorDisplayName: string;
    authorAvatarUrl: string | null;
    content: string;
    createdAt: Date;
  }): ExchangeCommentPayload {
    return {
      id: row.id,
      postId: row.postId,
      author: {
        publicId: row.authorPublicId,
        identityType: row.authorIdentityType,
        displayName: row.authorDisplayName,
        avatarUrl: row.authorAvatarUrl
      },
      content: row.content,
      createdAt: row.createdAt.toISOString()
    };
  }

  private async postAvailability(
    transaction: ExchangePrismaClient,
    postId: number,
    now: Date
  ): Promise<"available" | "not_found" | "unavailable"> {
    const live = await transaction.exchangePost.findFirst({
      where: {
        id: postId,
        status: DatabaseExchangePostStatus.PUBLISHED,
        expiresAt: { gt: now },
        deletedAt: null
      },
      select: { id: true }
    });
    if (live) return "available";
    const exists = await transaction.exchangePost.findFirst({
      where: { id: postId, deletedAt: null },
      select: { id: true }
    });
    return exists ? "unavailable" : "not_found";
  }

  private async countInteractions(
    transaction: ExchangePrismaClient,
    postId: number
  ): Promise<ExchangeInteractionCounts> {
    const where = { postId, deletedAt: null };
    const [comments, likes, shares] = await Promise.all([
      transaction.exchangeComment.count({ where }),
      transaction.exchangeLike.count({ where }),
      transaction.exchangeShare.count({ where })
    ]);
    return { comments, likes, shares };
  }

  private withClientTransaction<T>(
    handler: (transaction: ExchangePrismaClient) => Promise<T>,
    transactionClient?: ExchangePrismaClient
  ): Promise<T> {
    if (transactionClient) return handler(transactionClient);
    if (this.canStartTransaction(this.client)) {
      return this.client.$transaction((transaction) => handler(transaction));
    }
    return handler(this.client);
  }

  private canStartTransaction(client: ExchangePrismaClient): client is PrismaClient {
    return "$transaction" in client && typeof client.$transaction === "function";
  }

  private isUniqueConflict(error: unknown): boolean {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
  }
}
