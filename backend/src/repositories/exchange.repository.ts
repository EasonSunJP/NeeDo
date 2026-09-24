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
import { CONTENT_LOCALES, type ContentLocaleCode } from "../constants/content-locales";
import { prisma } from "../prisma/client";
import { calculateTechnicianPlatformRating } from "../domain/technician-rating";
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
  ExchangeIntelligencePayload,
  ExchangeIntelligencePublisherCardPayload,
  ExchangeIntelligenceServiceCardPayload,
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
import type {
  ExchangeIntelligencePublicationServiceResolution,
  ExchangeIntelligenceServiceRef
} from "../types/exchange-intelligence-booking.types";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import { toAuditLogCreateData } from "./audit-log.repository";
import { AppError } from "../utils/app-error";
import { ERROR_CODES } from "../constants/error-codes";
import { projectExchangeRequestAddress } from "../domain/exchange-address-privacy";
import { ShopVisibilityRepository, type ShopVisibilityViewer } from "./shop-visibility.repository";

function readPostTranslations(value: Prisma.JsonValue | null): ExchangePostPayload["contentTranslations"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const result: ExchangePostPayload["contentTranslations"] = {};
  for (const locale of CONTENT_LOCALES) {
    const entry = source[locale];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const { title, detail } = entry as Record<string, unknown>;
    if (typeof title === "string" && title.trim() && typeof detail === "string" && detail.trim()) {
      result[locale] = { title, detail };
    }
  }
  return result;
}

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

const intelligenceCardMedia = {
  where: { deletedAt: null, isActive: true },
  orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }],
  select: { url: true, usageType: true, sortOrder: true }
};

const commentAuthorInclude = {
  authorIdentity: {
    select: {
      id: true, userId: true, type: true, scopeType: true, scopeId: true,
      isActive: true, deletedAt: true,
      merchantIdentityProfile: { select: { id: true, deletedAt: true } },
      user: { select: { technicianProfile: { select: { id: true, deletedAt: true } } } }
    }
  }
} satisfies Prisma.ExchangeCommentInclude;

type CommentWithAuthor = Prisma.ExchangeCommentGetPayload<{ include: typeof commentAuthorInclude }>;

const intelligenceShopInclude = {
  _count: {
    select: {
      bookingOrders: { where: { status: "COMPLETED" as const, deletedAt: null } },
      entityFavorites: { where: { deletedAt: null } },
      entityShareEvents: { where: { deletedAt: null } }
    }
  },
  publicIdentifier: {
    select: { publicId: true, kind: true, status: true, deletedAt: true }
  },
  entitySuspensions: {
    where: { activeKey: { not: null }, status: "active" as const, deletedAt: null },
    select: { id: true }
  },
  mediaAssets: intelligenceCardMedia,
  reviewSummary: {
    select: { ratingAverage: true, reviewCount: true, deletedAt: true }
  }
};

const postInclude = (viewerIdentityId: number, participantIdentityId = viewerIdentityId) =>
  ({
    demand: {
      where: { deletedAt: null },
      include: { coverMediaAsset: { select: { url: true } } }
    },
    servicePrepayment: {
      select: { percent: true, paymentMethod: true, status: true, deletedAt: true }
    },
    authorIdentity: {
      select: {
        type: true,
        scopeType: true,
        scopeId: true,
        isActive: true,
        deletedAt: true
      }
    },
    intelligence: {
      where: { deletedAt: null },
      include: {
        service: {
          include: {
            category: { select: { name: true, isActive: true, deletedAt: true } },
            mediaAssets: intelligenceCardMedia,
            reviewSummary: {
              select: { ratingAverage: true, reviewCount: true, deletedAt: true }
            },
            shop: { include: intelligenceShopInclude }
          }
        },
        technicianService: {
          include: {
            category: { select: { name: true, isActive: true, deletedAt: true } },
            sourceShopService: { select: { serviceMode: true } },
            shop: { include: intelligenceShopInclude },
            technicianProfile: {
              include: {
                mediaAssets: intelligenceCardMedia,
                reviewSummary: {
                  select: { ratingAverage: true, reviewCount: true, deletedAt: true }
                },
                performanceSummary: {
                  select: {
                    completedOrderCount: true,
                    acceptanceRateBps: true,
                    deletedAt: true
                  }
                },
                technicianShopAffiliations: {
                  where: { deletedAt: null },
                  select: {
                    shopId: true,
                    workStatus: true,
                    activeKey: true,
                    startsAt: true,
                    endsAt: true,
                    deletedAt: true
                  }
                },
                user: {
                  select: {
                    isActive: true,
                    deletedAt: true,
                    identities: {
                      where: {
                        isActive: true,
                        deletedAt: null,
                        type: { in: ["technician", "service", "s"] },
                        publicIdentifier: {
                          is: { kind: "S", status: "ACTIVE", deletedAt: null }
                        }
                      },
                      select: {
                        type: true,
                        isActive: true,
                        deletedAt: true,
                        publicIdentifier: {
                          select: { publicId: true, kind: true, status: true, deletedAt: true }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    likes: {
      where: { actorIdentityId: viewerIdentityId, deletedAt: null },
      select: { id: true },
      take: 1
    },
    matchParticipants: {
      where: {
        participantIdentityId,
        deletedAt: null,
        matching: {
          is: { status: DatabaseExchangeMatchingStatus.MATCHED, deletedAt: null }
        }
      },
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

type ExchangeIntelligenceRecord = NonNullable<ExchangePostRecord["intelligence"]>;
type ExchangeShopServiceRecord = NonNullable<ExchangeIntelligenceRecord["service"]>;
type ExchangeTechnicianServiceRecord = NonNullable<
  ExchangeIntelligenceRecord["technicianService"]
>;
type ExchangeIntelligenceShopRecord =
  | ExchangeShopServiceRecord["shop"]
  | NonNullable<ExchangeTechnicianServiceRecord["shop"]>;

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
  public constructor(
    private readonly client: ExchangePrismaClient = prisma,
    private readonly shopVisibility: Pick<ShopVisibilityRepository, "buildVisibilityWhere"> = new ShopVisibilityRepository(client as PrismaClient)
  ) {}

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
    let avatarUrl: string | null = PERSONAL_DEMAND_IDENTITIES.has(identity.type) ? identity.user.avatarUrl : null;
    if (identity.type === "technician") {
      avatarUrl = null;
      if (identity.scopeType === "technician_profile" && identity.scopeId) {
        const profile = await this.client.technicianProfile.findFirst({
          where: { id: identity.scopeId, userId: identity.userId, deletedAt: null },
          select: { id: true }
        });
        if (profile) {
          const avatar = await this.client.mediaAsset.findFirst({
            where: { technicianProfileId: profile.id, usageType: "avatar", isActive: true, deletedAt: null },
            orderBy: { id: "desc" },
            select: { url: true }
          });
          avatarUrl = avatar?.url ?? null;
        }
      }
    } else if (SHOP_MERCHANT_IDENTITIES.has(identity.type)) {
      avatarUrl = null;
      const profile = await this.client.merchantIdentityProfile.findFirst({
        where: { identityId: identity.id, userId: identity.userId, deletedAt: null },
        select: { id: true }
      });
      if (profile) {
        const avatar = await this.client.mediaAsset.findFirst({
          where: { entityType: "merchant_identity_profile", entityId: profile.id, ownerIdentityId: identity.id, ownerUserId: identity.userId, usageType: "avatar", isActive: true, deletedAt: null },
          orderBy: { id: "desc" },
          select: { url: true }
        });
        avatarUrl = avatar?.url ?? null;
      }
    }
    return {
      userId: identity.userId,
      identityId: identity.id,
      identityType: identity.type,
      scopeType: identity.scopeType,
      scopeId: identity.scopeId,
      publicId: effectivePublicId,
      displayName: identity.displayName ?? identity.user.username,
      avatarUrl,
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
      ...(input.type === "intelligence" ? await this.intelligenceVisibilityWhere(input.shopViewer) : {}),
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
            include: postInclude(input.viewerIdentityId, input.participantIdentityId)
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
      include: postInclude(input.viewerIdentityId, input.participantIdentityId)
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
    claimProviderUserId?: number,
    participantIdentityId = viewerIdentityId,
    shopViewer?: ShopVisibilityViewer
  ): Promise<ExchangePostPayload | null> {
    const row = await this.client.exchangePost.findFirst({
      where: {
        id: postId,
        deletedAt: null,
        OR: [
          { type: DatabaseExchangePostType.DEMAND },
          { type: DatabaseExchangePostType.INTELLIGENCE, ...await this.intelligenceVisibilityWhere(shopViewer) }
        ]
      },
      include: postInclude(viewerIdentityId, participantIdentityId)
    });

    return row ? this.mapPost(row, viewerIdentityId, now, undefined, claimProviderUserId) : null;
  }

  private async intelligenceVisibilityWhere(viewer?: ShopVisibilityViewer): Promise<Prisma.ExchangePostWhereInput> {
    const shopWhere: Prisma.ShopWhereInput = {
      ...(await this.shopVisibility.buildVisibilityWhere(viewer) as Prisma.ShopWhereInput),
      status: "published",
      deletedAt: null,
      publicIdentifier: { is: { kind: "SHOP", status: "ACTIVE", deletedAt: null } }
    };
    return {
      intelligence: {
        is: {
          OR: [
            { service: { is: { shop: { is: shopWhere } } } },
            { technicianService: { is: { shop: { is: shopWhere } } } }
          ]
        }
      }
    };
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
        take: pagination.take,
        include: commentAuthorInclude
      }),
      this.client.exchangeComment.count({ where })
    ]);

    return buildPaginatedResponse(await this.mapComments(rows, this.client), total, pagination);
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

  public async resolveIntelligencePublicationService(input: {
    actor: ExchangeActorRecord;
    serviceRef: ExchangeIntelligenceServiceRef;
    now: Date;
  }): Promise<ExchangeIntelligencePublicationServiceResolution> {
    const parsed = /^(shop|technician):([1-9]\d*)$/u.exec(input.serviceRef);
    if (!parsed) return { kind: "not_found" };
    const id = Number(parsed[2]);
    if (!Number.isSafeInteger(id)) return { kind: "not_found" };

    if (parsed[1] === "shop") {
      if (
        !SHOP_MERCHANT_IDENTITIES.has(input.actor.identityType) ||
        input.actor.scopeType !== "shop" ||
        !input.actor.scopeId ||
        input.actor.shopScope?.shopId !== input.actor.scopeId
      ) {
        return { kind: "forbidden" };
      }
      const service = await this.client.service.findUnique({
        where: { id },
        include: {
          category: { select: { isActive: true, deletedAt: true } },
          shop: {
            include: {
              publicIdentifier: true,
              mediaAssets: intelligenceCardMedia,
              entitySuspensions: {
                where: { activeKey: { not: null }, status: "active", deletedAt: null },
                select: { id: true }
              }
            }
          }
        }
      });
      if (!service) return { kind: "not_found" };
      if (service.shopId !== input.actor.scopeId) return { kind: "forbidden" };
      if (
        service.deletedAt ||
        service.status !== "published" ||
        !service.category.isActive ||
        service.category.deletedAt ||
        !this.shopAvailable(service.shop) ||
        service.currency !== "JPY"
      ) {
        return { kind: "unavailable" };
      }
      const serviceMode = this.intelligenceServiceMode(service.serviceMode);
      const catalogPriceJpy = this.jpyInteger(service.priceAmount.toString());
      if (!serviceMode || catalogPriceJpy === null || service.durationMinutes <= 0) {
        return { kind: "unavailable" };
      }
      return {
        kind: "success",
        value: {
          serviceRef: input.serviceRef,
          serviceId: service.id,
          technicianServiceId: null,
          serviceName: service.name,
          serviceDurationMinutes: service.durationMinutes,
          catalogPriceJpy,
          serviceMode,
          areaLabel: service.shop.city,
          addressLabel: service.shop.address,
          serviceAreas: [service.shop.city],
          publisher: {
            publicId: service.shop.publicIdentifier!.publicId,
            identityType: "shop",
            displayName: service.shop.name,
            avatarUrl: this.mediaUrlByUsage(service.shop.mediaAssets, "avatar")
          }
        }
      };
    }

    if (
      input.actor.identityType !== "technician" ||
      input.actor.scopeType !== "technician_profile" ||
      !input.actor.scopeId
    ) {
      return { kind: "forbidden" };
    }
    const service = await this.client.technicianService.findUnique({
      where: { id },
      include: {
        category: { select: { isActive: true, deletedAt: true } },
        sourceShopService: { select: { serviceMode: true } },
        shop: {
          include: {
            publicIdentifier: true,
            entitySuspensions: {
              where: { activeKey: { not: null }, status: "active", deletedAt: null },
              select: { id: true }
            }
          }
        },
        technicianProfile: {
          select: {
            status: true,
            visibility: true,
            deletedAt: true,
            serviceArea: true,
            serviceAreasJson: true,
            user: { select: { isActive: true, deletedAt: true } }
          }
        }
      }
    });
    if (!service) return { kind: "not_found" };
    if (service.technicianId !== input.actor.scopeId) return { kind: "forbidden" };
    if (service.shopId === null || service.shop === null) {
      return { kind: "unavailable" };
    }
    const affiliation = await this.client.technicianShopAffiliation.findFirst({
      where: {
        technicianProfileId: input.actor.scopeId,
        shopId: service.shopId,
        workStatus: "ACTIVE",
        activeKey: { not: null },
        startsAt: { lte: input.now },
        OR: [{ endsAt: null }, { endsAt: { gt: input.now } }],
        deletedAt: null
      },
      select: { id: true }
    });
    if (
      !affiliation ||
      service.deletedAt ||
      !service.isActive ||
      !service.isBookable ||
      service.reviewStatus !== "APPROVED" ||
      !service.category.isActive ||
      service.category.deletedAt ||
      !this.shopAvailable(service.shop) ||
      service.technicianProfile.status !== "published" ||
      service.technicianProfile.visibility !== "public" ||
      service.technicianProfile.deletedAt ||
      !service.technicianProfile.user.isActive ||
      service.technicianProfile.user.deletedAt ||
      service.currency !== "JPY" ||
      service.durationMinutes <= 0
    ) {
      return { kind: "unavailable" };
    }
    const catalogPriceJpy = this.jpyInteger(service.priceAmount);
    const serviceMode = this.intelligenceServiceMode(
      service.sourceShopService?.serviceMode ?? "store"
    );
    if (catalogPriceJpy === null || !serviceMode) return { kind: "unavailable" };
    const serviceAreas = this.serviceAreas(
      service.technicianProfile.serviceAreasJson,
      service.technicianProfile.serviceArea,
      service.shop.city
    );
    return {
      kind: "success",
      value: {
        serviceRef: input.serviceRef,
        serviceId: null,
        technicianServiceId: service.id,
        serviceName: service.name,
        serviceDurationMinutes: service.durationMinutes,
        catalogPriceJpy,
        serviceMode,
        areaLabel: serviceAreas[0] ?? service.shop.city,
        addressLabel: service.shop.address,
        serviceAreas,
        publisher: {
          publicId: input.actor.publicId,
          identityType: input.actor.identityType,
          displayName: input.actor.displayName,
          avatarUrl: input.actor.avatarUrl
        }
      }
    };
  }

  public async assertDemandTaxonomy(categoryId: number, businessKeywordIds: number[]): Promise<void> {
    const keywords = await this.client.businessKeyword.findMany({
      where: {
        id: { in: businessKeywordIds },
        categoryId,
        isActive: true,
        deletedAt: null,
        category: { isActive: true, deletedAt: null }
      },
      select: { id: true }
    });
    if (keywords.length !== businessKeywordIds.length) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.exchange.request_tags_unavailable",
        statusCode: 400
      });
    }
  }

  public async createPost(input: ExchangePublishRepositoryInput): Promise<{ id: number }> {
    const ownerIdentityId = input.actor.ownerIdentityId ?? input.actor.identityId;
    const capacity = input.capacity;
    if (input.input.type === "demand" && !capacity) {
      throw new Error("error.exchange.request_capacity_missing");
    }
    const intelligenceService = input.intelligenceService;
    if (input.input.type === "intelligence" && !intelligenceService) {
      throw new Error("error.exchange.intelligence_service_required");
    }
    const publisher =
      input.input.type === "intelligence" ? intelligenceService!.publisher : input.actor;
    const coverPublicId = input.input.type === "demand" ? input.input.coverMediaAssetPublicId : undefined;
    const pendingCoverWhere: Prisma.MediaAssetWhereInput = {
      checksumSha256: coverPublicId,
      ownerUserId: input.actor.userId,
      ownerIdentityId: input.actor.identityId,
      entityType: "exchange_demand_cover_pending",
      usageType: "exchange_demand_cover_pending",
      isActive: true,
      deletedAt: null,
      purgedAt: null,
      exchangeDemandCover: null,
      mimeType: { in: ["image/jpeg", "image/png", "image/webp"] }
    };
    const coverMediaAsset = coverPublicId
      ? await this.client.mediaAsset.findFirst({
          where: pendingCoverWhere,
          select: { id: true }
        })
      : null;
    // Claim before creating the demand. Cleanup's conditional retirement competes
    // for this row lock, which the publication transaction holds until commit.
    const coverClaimed = coverMediaAsset ? await this.client.mediaAsset.updateMany({
      where: { ...pendingCoverWhere, id: coverMediaAsset.id },
      data: { entityType: "exchange_demand", purgeAt: null, updatedAt: input.now }
    }) : null;
    if (coverPublicId && coverClaimed?.count !== 1) {
      throw new AppError({
        code: ERROR_CODES.FORBIDDEN,
        message: "error.exchange.demand_cover_not_owned",
        statusCode: 403
      });
    }
    const created = await this.client.exchangePost.create({
      data: {
        authorUserId: input.actor.userId,
        authorIdentityId: input.actor.identityId,
        ownerIdentityId,
        publisherPublicId: publisher.publicId,
        publisherIdentityType: publisher.identityType,
        publisherDisplayName: publisher.displayName,
        publisherAvatarUrl: publisher.avatarUrl,
        type: typeToDatabase[input.input.type],
        status: DatabaseExchangePostStatus.PUBLISHED,
        title: input.input.title,
        detail: input.input.detail,
        contentLocale: localeToDatabase[input.input.contentLocale],
        contentTranslationsJson: input.input.contentTranslations ?? Prisma.JsonNull,
        areaLabel:
          input.input.type === "demand"
            ? input.input.addressLine1
            : intelligenceService!.areaLabel,
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
                  coverMediaAssetId: coverMediaAsset?.id ?? null,
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
                  serviceMode: demandServiceModeToDatabase[input.input.serviceMode],
                  categoryId: input.input.categoryId,
                  businessKeywordIdsJson: input.input.businessKeywordIds
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
                  serviceId: intelligenceService!.serviceId,
                  technicianServiceId: intelligenceService!.technicianServiceId,
                  serviceNameSnapshot: intelligenceService!.serviceName,
                  serviceDurationSnapshot: intelligenceService!.serviceDurationMinutes,
                  serviceMode: serviceModeToDatabase[intelligenceService!.serviceMode],
                  addressLabel: intelligenceService!.addressLabel,
                  serviceAreas: intelligenceService!.serviceAreas,
                  originalPriceJpy: intelligenceService!.catalogPriceJpy,
                  campaignPriceJpy: input.input.campaignPriceJpy
                }
              }
            })
      },
      select: { id: true, demand: { select: { id: true } } }
    });

    if (coverMediaAsset) {
      await this.client.mediaAsset.update({
        where: { id: coverMediaAsset.id },
        data: {
          entityType: "exchange_demand",
          entityId: created.demand!.id,
          purgeAt: null,
          updatedAt: input.now
        }
      });
    }
    return { id: created.id };
  }

  private shopAvailable(shop: {
    status: string;
    deletedAt: Date | null;
    publicIdentifier: { kind: string; status: string; deletedAt: Date | null } | null;
    entitySuspensions: Array<{ id: number }>;
  }): boolean {
    return (
      shop.status === "published" &&
      shop.deletedAt === null &&
      shop.publicIdentifier?.kind === "SHOP" &&
      shop.publicIdentifier.status === "ACTIVE" &&
      shop.publicIdentifier.deletedAt === null &&
      shop.entitySuspensions.length === 0
    );
  }

  private intelligenceServiceMode(value: string): ExchangeServiceMode | null {
    if (value === "store") return "store";
    if (value === "home" || value === "onsite") return "onsite";
    if (value === "flexible") return "flexible";
    return null;
  }

  private jpyInteger(value: number | string): number | null {
    const amount = Number(value);
    return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
  }

  private serviceAreas(
    value: Prisma.JsonValue | null,
    fallback: string | null,
    city: string
  ): string[] {
    if (Array.isArray(value)) {
      const areas = value.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0
      );
      if (areas.length > 0) return [...new Set(areas.map((item) => item.trim()))];
    }
    if (fallback?.trim()) return [fallback.trim()];
    return [city];
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
          where: { idempotencyKey: input.idempotencyKey }, include: commentAuthorInclude
        });
        if (existing) return { kind: "replayed", value: (await this.mapComments([existing], transaction))[0] };
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
        return { kind: "success", value: this.mapComment(created, input.actor.avatarUrl, this.commentProfilePath(input.actor.userId, input.actor.identityId)) };
      });
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
      const existing = await this.client.exchangeComment.findUnique({
        where: { idempotencyKey: input.idempotencyKey }, include: commentAuthorInclude
      });
      if (!existing) throw error;
      return { kind: "replayed", value: (await this.mapComments([existing], this.client))[0] };
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

  private mapIntelligence(
    row: ExchangePostRecord,
    status: ExchangePostStatus,
    now: Date,
    ownerView: boolean
  ): ExchangeIntelligencePayload | null {
    const record = row.intelligence;
    if (!record) return null;
    if (!isServiceAreaList(record.serviceAreas)) {
      throw new Error("error.exchange.invalid_service_areas");
    }

    const serviceMode = serviceModeFromDatabase[record.serviceMode];
    const serviceWindow = {
      startsAt: row.serviceStartAt.toISOString(),
      endsAt: row.serviceEndAt.toISOString()
    };
    const legacyUnbound =
      record.serviceId === null &&
      record.technicianServiceId === null &&
      record.serviceNameSnapshot === null &&
      record.serviceDurationSnapshot === null;
    if (legacyUnbound) {
      return {
        serviceMode,
        addressLabel: record.addressLabel,
        serviceAreas: record.serviceAreas,
        originalPriceJpy: record.originalPriceJpy,
        campaignPriceJpy: record.campaignPriceJpy,
        booking: {
          available: false,
          unavailableReason: "legacy_unbound",
          target: null,
          catalogPriceJpy: null,
          campaignPriceJpy: record.campaignPriceJpy,
          serviceName: null,
          durationMinutes: null,
          serviceMode,
          serviceWindow
        },
        publisherCard: null,
        serviceCard: null
      };
    }

    const snapshotValid =
      Boolean(record.serviceNameSnapshot?.trim()) &&
      record.serviceDurationSnapshot !== null &&
      record.serviceDurationSnapshot > 0 &&
      record.originalPriceJpy !== null &&
      record.originalPriceJpy >= 0 &&
      record.campaignPriceJpy >= 0 &&
      record.campaignPriceJpy <= record.originalPriceJpy;
    const postAvailable =
      status === "published" &&
      row.expiresAt.getTime() > now.getTime() &&
      row.serviceStartAt.getTime() < row.serviceEndAt.getTime() &&
      row.serviceEndAt.getTime() > now.getTime();

    const shopBinding =
      record.serviceId !== null &&
      record.technicianServiceId === null &&
      record.service?.id === record.serviceId;
    const technicianBinding =
      record.serviceId === null &&
      record.technicianServiceId !== null &&
      record.technicianService?.id === record.technicianServiceId;
    const target = shopBinding
      ? ({ type: "shop_service", id: record.serviceId! } as const)
      : technicianBinding
        ? ({ type: "technician_service", id: record.technicianServiceId! } as const)
        : null;

    let publisherAvailable = false;
    let serviceAvailable = false;
    let publisherCard: ExchangeIntelligencePublisherCardPayload | null = null;
    let serviceCard: ExchangeIntelligenceServiceCardPayload | null = null;

    if (shopBinding && record.service) {
      const service = record.service;
      const shopPublicId = this.publicShopId(service.shop);
      publisherAvailable =
        SHOP_MERCHANT_IDENTITIES.has(row.authorIdentity.type) &&
        row.authorIdentity.scopeType === "shop" &&
        row.authorIdentity.scopeId === service.shopId &&
        row.authorIdentity.isActive &&
        row.authorIdentity.deletedAt === null &&
        this.shopAvailable(service.shop) &&
        (service.shop.visibility !== "privateAll" || ownerView) &&
        shopPublicId !== null;
      serviceAvailable =
        snapshotValid &&
        service.shop.pricingMode === "MERCHANT" &&
        service.deletedAt === null &&
        service.status === "published" &&
        service.category.isActive &&
        service.category.deletedAt === null &&
        service.currency === "JPY" &&
        this.jpyInteger(service.priceAmount.toString()) !== null &&
        service.durationMinutes > 0 &&
        service.publicId.trim().length > 0;
      if (publisherAvailable && shopPublicId) {
        publisherCard = this.mapShopPublisherCard(
          service.shop,
          shopPublicId,
          serviceMode,
          serviceAvailable
        );
      }
      if (publisherAvailable && serviceAvailable && shopPublicId) {
        serviceCard = this.mapShopServiceCard(
          service,
          shopPublicId,
          record.serviceNameSnapshot!,
          record.serviceDurationSnapshot!,
          record.originalPriceJpy!,
          record.campaignPriceJpy,
          serviceMode
        );
      }
    } else if (technicianBinding && record.technicianService) {
      const service = record.technicianService;
      const profile = service.technicianProfile;
      const shop = service.shop;
      const shopPublicId = shop ? this.publicShopId(shop) : null;
      const technicianPublicId = this.publicTechnicianId(profile);
      const affiliationActive = service.shopId !== null && profile.technicianShopAffiliations.some(
        (affiliation) =>
          affiliation.shopId === service.shopId &&
          affiliation.workStatus === "ACTIVE" &&
          affiliation.activeKey !== null &&
          affiliation.deletedAt === null &&
          affiliation.startsAt.getTime() <= now.getTime() &&
          (affiliation.endsAt === null || affiliation.endsAt.getTime() > now.getTime())
      );
      publisherAvailable =
        row.authorIdentity.type === "technician" &&
        row.authorIdentity.scopeType === "technician_profile" &&
        row.authorIdentity.scopeId === service.technicianId &&
        row.authorIdentity.isActive &&
        row.authorIdentity.deletedAt === null &&
        profile.id === service.technicianId &&
        profile.status === "published" &&
        profile.visibility === "public" &&
        profile.deletedAt === null &&
        profile.user.isActive &&
        profile.user.deletedAt === null &&
        affiliationActive &&
        shop !== null &&
        this.shopAvailable(shop) &&
        shopPublicId !== null &&
        technicianPublicId !== null;
      serviceAvailable =
        snapshotValid &&
        shop?.pricingMode === "TECHNICIAN" &&
        service.deletedAt === null &&
        service.isActive &&
        service.isBookable &&
        service.reviewStatus === "APPROVED" &&
        service.category.isActive &&
        service.category.deletedAt === null &&
        service.currency === "JPY" &&
        this.jpyInteger(service.priceAmount) !== null &&
        service.durationMinutes > 0 &&
        service.publicId.trim().length > 0;
      if (publisherAvailable && shop && shopPublicId && technicianPublicId) {
        publisherCard = this.mapTechnicianPublisherCard(
          service,
          shop,
          shopPublicId,
          technicianPublicId,
          serviceAvailable
        );
      }
      if (publisherAvailable && serviceAvailable && shop && shopPublicId && technicianPublicId) {
        serviceCard = this.mapTechnicianServiceCard(
          service,
          shop,
          shopPublicId,
          technicianPublicId,
          record.serviceNameSnapshot!,
          record.serviceDurationSnapshot!,
          record.originalPriceJpy!,
          record.campaignPriceJpy,
          serviceMode
        );
      }
    }

    const unavailableReason = !target || !snapshotValid
      ? "service_unavailable"
      : !postAvailable
        ? "post_unavailable"
        : !publisherAvailable
          ? "publisher_unavailable"
          : !serviceAvailable
            ? "service_unavailable"
            : null;

    return {
      serviceMode,
      addressLabel: record.addressLabel,
      serviceAreas: record.serviceAreas,
      originalPriceJpy: record.originalPriceJpy,
      campaignPriceJpy: record.campaignPriceJpy,
      booking: {
        available: unavailableReason === null,
        unavailableReason,
        target,
        catalogPriceJpy: snapshotValid ? record.originalPriceJpy : null,
        campaignPriceJpy: record.campaignPriceJpy,
        serviceName: snapshotValid ? record.serviceNameSnapshot : null,
        durationMinutes: snapshotValid ? record.serviceDurationSnapshot : null,
        serviceMode,
        serviceWindow
      },
      publisherCard,
      serviceCard
    };
  }

  private mapShopPublisherCard(
    shop: ExchangeIntelligenceShopRecord,
    publicId: string,
    serviceMode: ExchangeServiceMode,
    isBookable: boolean
  ): ExchangeIntelligencePublisherCardPayload {
    const imageUrls = this.mediaUrls(shop.mediaAssets);
    const rating = this.publicRating(shop.reviewSummary);
    return {
      type: "shop",
      publicId,
      name: shop.name,
      avatarUrl: this.mediaUrlByUsage(shop.mediaAssets, "avatar"),
      coverUrl: this.mediaUrlByUsage(shop.mediaAssets, "cover"),
      imageUrls,
      status: shop.status,
      isBookable,
      ratingAverage: rating.ratingAverage,
      reviewCount: rating.reviewCount,
      completedOrderCount: shop._count.bookingOrders,
      favoriteCount: shop._count.entityFavorites,
      shareCount: shop._count.entityShareEvents,
      address: shop.address,
      serviceMode,
      detailPath: `/profiles/shop/${publicId}`
    };
  }

  private mapTechnicianPublisherCard(
    service: ExchangeTechnicianServiceRecord,
    shop: ExchangeIntelligenceShopRecord,
    shopPublicId: string,
    publicId: string,
    isBookable: boolean
  ): ExchangeIntelligencePublisherCardPayload {
    const profile = service.technicianProfile;
    const rating = this.technicianPublicRating(profile.reviewSummary);
    const summary =
      profile.performanceSummary?.deletedAt === null ? profile.performanceSummary : null;
    const acceptanceRatePercent =
      summary && summary.acceptanceRateBps >= 0 && summary.acceptanceRateBps <= 10_000
        ? summary.acceptanceRateBps / 100
        : null;
    return {
      type: "technician",
      publicId,
      displayName: profile.displayName,
      avatarUrl: this.mediaUrlByUsage(profile.mediaAssets, "avatar"),
      shop: { publicId: shopPublicId, name: shop.name },
      status: profile.status,
      isBookable,
      yearsExperience: profile.yearsExperience,
      completedOrderCount: summary?.completedOrderCount ?? null,
      acceptanceRatePercent,
      ratingAverage: rating.ratingAverage,
      reviewCount: rating.reviewCount,
      serviceAreas: this.serviceAreas(
        profile.serviceAreasJson,
        profile.serviceArea,
        profile.city
      ),
      languages: this.stringList(profile.languages),
      detailPath: `/profiles/technician/${publicId}`,
      servicesPath: `/stores/${shopPublicId}/technicians/${publicId}/services`
    };
  }

  private mapShopServiceCard(
    service: ExchangeShopServiceRecord,
    shopPublicId: string,
    serviceName: string,
    durationMinutes: number,
    catalogPriceJpy: number,
    campaignPriceJpy: number,
    serviceMode: ExchangeServiceMode
  ): ExchangeIntelligenceServiceCardPayload {
    const imageUrls = this.mediaUrls(service.mediaAssets);
    return {
      targetType: "shop_service",
      publicId: service.publicId,
      name: serviceName,
      description: service.description,
      coverUrl: this.mediaUrlByUsage(service.mediaAssets, "cover"),
      imageUrls,
      tags: this.uniqueStrings([service.category.name]),
      catalogPriceJpy,
      campaignPriceJpy,
      currency: "JPY",
      durationMinutes,
      serviceMode,
      shopPublicId,
      shopAddress: service.shop.address,
      detailPath: `/services/${service.publicId}`
    };
  }

  private mapTechnicianServiceCard(
    service: ExchangeTechnicianServiceRecord,
    shop: ExchangeIntelligenceShopRecord,
    shopPublicId: string,
    technicianPublicId: string,
    serviceName: string,
    durationMinutes: number,
    catalogPriceJpy: number,
    campaignPriceJpy: number,
    serviceMode: ExchangeServiceMode
  ): ExchangeIntelligenceServiceCardPayload {
    const imageUrls = this.uniqueStrings([
      service.coverImageUrl,
      ...this.stringList(service.imagesJson)
    ]);
    const tags = this.stringList(service.tagsJson);
    return {
      targetType: "technician_service",
      publicId: service.publicId,
      name: serviceName,
      description: service.description,
      coverUrl: service.coverImageUrl?.trim() || imageUrls[0] || null,
      imageUrls,
      tags: tags.length > 0 ? tags : this.uniqueStrings([service.category.name]),
      catalogPriceJpy,
      campaignPriceJpy,
      currency: "JPY",
      durationMinutes,
      serviceMode,
      shopPublicId,
      shopAddress: shop.address,
      detailPath: `/stores/${shopPublicId}/technicians/${technicianPublicId}/services`
    };
  }

  private publicShopId(shop: ExchangeIntelligenceShopRecord): string | null {
    const identifier = shop.publicIdentifier;
    return identifier?.kind === "SHOP" &&
      identifier.status === "ACTIVE" &&
      identifier.deletedAt === null &&
      /^shop\d{10}$/u.test(identifier.publicId)
      ? identifier.publicId
      : null;
  }

  private publicTechnicianId(
    profile: ExchangeTechnicianServiceRecord["technicianProfile"]
  ): string | null {
    const identifier = profile.user.identities.find(
      (identity) =>
        identity.isActive &&
        identity.deletedAt === null &&
        identity.publicIdentifier?.kind === "S" &&
        identity.publicIdentifier.status === "ACTIVE" &&
        identity.publicIdentifier.deletedAt === null &&
        /^s\d{10}$/u.test(identity.publicIdentifier.publicId)
    )?.publicIdentifier;
    return identifier?.publicId ?? null;
  }

  private publicRating(
    summary: { ratingAverage: Prisma.Decimal; reviewCount: number; deletedAt: Date | null } | null
  ): { ratingAverage: string | null; reviewCount: number } {
    if (!summary || summary.deletedAt !== null || summary.reviewCount <= 0) {
      return { ratingAverage: null, reviewCount: 0 };
    }
    return {
      ratingAverage: summary.ratingAverage.toString(),
      reviewCount: summary.reviewCount
    };
  }

  private technicianPublicRating(
    summary: { ratingAverage: Prisma.Decimal; reviewCount: number; deletedAt: Date | null } | null
  ): { ratingAverage: string; reviewCount: number } {
    const review = summary?.deletedAt === null ? summary : null;
    const reviewCount = review?.reviewCount ?? 0;
    return {
      ratingAverage: calculateTechnicianPlatformRating(
        review ? Number(review.ratingAverage) : 0,
        reviewCount
      ).toFixed(2),
      reviewCount
    };
  }

  private mediaUrls(media: Array<{ url: string }>): string[] {
    return this.uniqueStrings(media.map(({ url }) => url));
  }

  private mediaUrlByUsage(
    media: Array<{ url: string; usageType: string }>,
    usageType: string
  ): string | null {
    return media.find((asset) => asset.usageType === usageType)?.url.trim() || null;
  }

  private stringList(value: Prisma.JsonValue | null): string[] {
    return Array.isArray(value)
      ? this.uniqueStrings(value.filter((item): item is string => typeof item === "string"))
      : [];
  }

  private numberList(value: Prisma.JsonValue | null): number[] {
    return Array.isArray(value)
      ? value.filter((item): item is number => typeof item === "number" && Number.isSafeInteger(item) && item > 0)
      : [];
  }

  private uniqueStrings(values: Array<string | null | undefined>): string[] {
    return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
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
    const matchedParticipantView =
      row.status === DatabaseExchangePostStatus.MATCHED &&
      row.matching?.status === DatabaseExchangeMatchingStatus.MATCHED &&
      row.matching.deletedAt === null &&
      row.matchParticipants.length > 0;
    const claimableByProviderUser =
      claimProviderUserId !== undefined && row.authorUserId !== claimProviderUserId;
    const selfPublishedByProviderUser =
      claimProviderUserId !== undefined && row.authorUserId === claimProviderUserId;
    const matchingOpen =
      row.matching?.status === DatabaseExchangeMatchingStatus.OPEN &&
      row.matching.deletedAt === null;
    const activeClaimCount = row._count.claims ?? 0;
    const matchingHasCapacity =
      row.demand?.matchMode === DatabaseExchangeMatchMode.SELECTIVE ||
      (row.demand?.matchMode === DatabaseExchangeMatchMode.QUICK &&
        Boolean(row.matching) &&
        activeClaimCount < row.matching!.effectiveTargetProviderCount);
    const intelligence = this.mapIntelligence(row, status, now, ownerView);
    const publisher =
      row.type === DatabaseExchangePostType.INTELLIGENCE &&
      SHOP_MERCHANT_IDENTITIES.has(row.authorIdentity.type)
        ? intelligence?.publisherCard?.type === "shop"
          ? {
              publicId: intelligence.publisherCard.publicId,
              identityType: "shop",
              displayName: intelligence.publisherCard.name,
              avatarUrl: intelligence.publisherCard.avatarUrl
            }
          : null
        : {
            publicId: row.publisherPublicId,
            identityType: row.publisherIdentityType,
            displayName: row.publisherDisplayName,
            avatarUrl: row.publisherAvatarUrl
          };

    const requestAddressDisclosure = ownerView
      ? ("owner" as const)
      : matchedParticipantView
        ? ("matched_participant" as const)
        : ("general" as const);
    const projectedRequestAddress = row.demand
      ? projectExchangeRequestAddress({
          areaLabel: row.areaLabel,
          address: {
            line1: row.demand.addressLine1,
            line2: row.demand.addressLine2,
            line3: row.demand.addressLine3,
            line2GenerallyVisible: row.demand.addressLine2Public,
            line3GenerallyVisible: row.demand.addressLine3Public,
            disclosure: requestAddressDisclosure
          }
        })
      : null;
    const demand = row.demand
      ? {
          cover: row.demand.coverMediaAsset
            ? { url: row.demand.coverMediaAsset.url, isDefault: false }
            : { url: "/images/exchange-demand-default-cover.svg", isDefault: true },
          serviceMode: demandServiceModeFromDatabase[row.demand.serviceMode],
          categoryId: row.demand.categoryId,
          businessKeywordIds: this.numberList(row.demand.businessKeywordIdsJson),
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
          payment: {
            prepaidPercent: row.servicePrepayment && row.servicePrepayment.deletedAt === null &&
              ["CONFIRMED", "CAPTURED", "REFUND_PENDING"].includes(row.servicePrepayment.status)
              ? row.servicePrepayment.percent
              : 0,
            selectedMethod: row.servicePrepayment && row.servicePrepayment.deletedAt === null &&
              !["RELEASED", "REFUNDED"].includes(row.servicePrepayment.status)
              ? row.servicePrepayment.paymentMethod.toLowerCase() as "onsite" | "bank_transfer" | "cash" | "ndp" | "other"
              : null
          },
          address: projectedRequestAddress!.address
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
      contentTranslations: readPostTranslations(row.contentTranslationsJson),
      areaLabel: projectedRequestAddress?.areaLabel ?? row.areaLabel,
      serviceStartAt: row.serviceStartAt.toISOString(),
      serviceEndAt: row.serviceEndAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      publishedAt: row.createdAt.toISOString(),
      publisher: showPublisher ? publisher : null,
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
        canViewMatching: ownerView || matchedParticipantView,
        claimUnavailableReason:
          selfPublishedByProviderUser &&
          status === "published" &&
          Boolean(row.demand) &&
          matchingOpen &&
          matchingHasCapacity
            ? "self_published"
            : null
      },
      ...(priority ? { priority } : {}),
      demand,
      intelligence
    };
  }

  private commentProfilePath(userId: number, identityId: number): string {
    return `/moments/users/${userId}?identityId=${identityId}`;
  }

  private async mapComments(rows: CommentWithAuthor[], client: ExchangePrismaClient): Promise<ExchangeCommentPayload[]> {
    const scopes = rows.flatMap<Prisma.MediaAssetWhereInput>((row) => {
      const identity = row.authorIdentity;
      if (!identity || !identity.isActive || identity.deletedAt || identity.userId !== row.authorUserId || identity.type !== row.authorIdentityType) return [];
      if (identity.type === "technician" && identity.scopeType === "technician_profile" && identity.scopeId === identity.user.technicianProfile?.id && identity.user.technicianProfile.deletedAt === null) {
        return [{ technicianProfileId: identity.scopeId }];
      }
      const merchantProfile = identity.merchantIdentityProfile;
      if (SHOP_MERCHANT_IDENTITIES.has(identity.type) && merchantProfile?.deletedAt === null) {
        return [{ entityType: "merchant_identity_profile", entityId: merchantProfile.id, ownerIdentityId: identity.id, ownerUserId: identity.userId }];
      }
      return [];
    });
    const assets = scopes.length ? await client.mediaAsset.findMany({
      where: { OR: scopes, usageType: "avatar", isActive: true, deletedAt: null },
      orderBy: { id: "desc" },
      select: { url: true, technicianProfileId: true, entityType: true, entityId: true, ownerIdentityId: true, ownerUserId: true }
    }) : [];
    return rows.map((row) => {
      const identity = row.authorIdentity;
      const active = identity?.isActive && identity.deletedAt === null && identity.userId === row.authorUserId && identity.type === row.authorIdentityType;
      let avatarUrl: string | null = PERSONAL_DEMAND_IDENTITIES.has(row.authorIdentityType) ? row.authorAvatarUrl : null;
      if (row.authorIdentityType === "technician") {
        avatarUrl = active && identity.scopeType === "technician_profile" && identity.scopeId === identity.user.technicianProfile?.id && identity.user.technicianProfile.deletedAt === null
          ? assets.find((asset) => asset.technicianProfileId === identity.scopeId)?.url ?? null : null;
      } else if (SHOP_MERCHANT_IDENTITIES.has(row.authorIdentityType)) {
        const profileId = active && identity.merchantIdentityProfile?.deletedAt === null ? identity.merchantIdentityProfile.id : null;
        avatarUrl = profileId ? assets.find((asset) => asset.entityType === "merchant_identity_profile" && asset.entityId === profileId && asset.ownerIdentityId === identity.id && asset.ownerUserId === identity.userId)?.url ?? null : null;
      }
      return this.mapComment(row, avatarUrl, active ? this.commentProfilePath(row.authorUserId, row.authorIdentityId) : null);
    });
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
  }, avatarUrl: string | null, authorProfilePath: string | null): ExchangeCommentPayload {
    return {
      id: row.id,
      postId: row.postId,
      author: {
        publicId: row.authorPublicId,
        identityType: row.authorIdentityType,
        displayName: row.authorDisplayName,
        avatarUrl
      },
      authorProfilePath,
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
