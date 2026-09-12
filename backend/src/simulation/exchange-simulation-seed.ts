import {
  ContentLocale,
  ExchangeMatchEventType,
  ExchangeMatchingStatus,
  ExchangePostStatus,
  ExchangePostType,
  ExchangePublisherCapacitySource,
  ExchangeServiceMode,
  type Prisma,
  type PrismaClient
} from "@prisma/client";
import type {
  ExchangeSimulationActor,
  ExchangeSimulationPlan,
  ExchangeSimulationPost,
  ExchangeSimulationServiceBinding
} from "./exchange-simulation-plan";
import {
  EXCHANGE_SIMULATION_NAMESPACE,
  LEGACY_EXCHANGE_SIMULATION_NAMESPACES
} from "./exchange-simulation.constants";

const ELIGIBLE_IDENTITY_TYPES = [
  "customer",
  "technician",
  "merchant",
  "merchant_owner",
  "merchant_staff"
] as const;

const localeToDatabase = {
  "zh-CN": ContentLocale.ZH_CN,
  "zh-TW": ContentLocale.ZH_TW,
  en: ContentLocale.EN,
  ja: ContentLocale.JA,
  ko: ContentLocale.KO
} as const;

const typeToDatabase = {
  demand: ExchangePostType.DEMAND,
  intelligence: ExchangePostType.INTELLIGENCE
} as const;

const serviceModeToDatabase = {
  store: ExchangeServiceMode.STORE,
  onsite: ExchangeServiceMode.ONSITE,
  flexible: ExchangeServiceMode.FLEXIBLE
} as const;

export interface ExchangeSimulationSeedSummary {
  actors: number;
  posts: number;
  demands: number;
  intelligences: number;
  comments: number;
  likes: number;
  shares: number;
  legacyPostsRemoved: number;
}

export const discoverExchangeSimulationActors = async (
  client: PrismaClient
): Promise<ExchangeSimulationActor[]> => {
  const identities = await client.userIdentity.findMany({
    where: {
      type: { in: [...ELIGIBLE_IDENTITY_TYPES] },
      isActive: true,
      deletedAt: null,
      user: { is: { isActive: true, deletedAt: null } },
      publicIdentifier: { is: { status: "ACTIVE", deletedAt: null } }
    },
    orderBy: [{ userId: "asc" }, { id: "asc" }],
    select: {
      id: true,
      userId: true,
      type: true,
      scopeType: true,
      scopeId: true,
      displayName: true,
      user: { select: { username: true, avatarUrl: true } },
      publicIdentifier: { select: { publicId: true } }
    }
  });

  const shopScopeIds = identities.flatMap((identity) =>
    ["merchant", "merchant_owner", "merchant_staff"].includes(identity.type) &&
    identity.scopeType === "shop" &&
    identity.scopeId
      ? [identity.scopeId]
      : []
  );
  const technicianScopeIds = identities.flatMap((identity) =>
    identity.type === "technician" &&
    identity.scopeType === "technician_profile" &&
    identity.scopeId
      ? [identity.scopeId]
      : []
  );
  const now = new Date();
  const [shopServices, technicianServices, technicianShopAffiliations] = await Promise.all([
    client.service.findMany({
      where: {
        shopId: { in: shopScopeIds },
        status: "published",
        currency: "JPY",
        durationMinutes: { gt: 0 },
        priceAmount: { gt: 0 },
        deletedAt: null,
        category: { isActive: true, deletedAt: null },
        shop: {
          status: "published",
          deletedAt: null,
          publicIdentifier: { is: { kind: "SHOP", status: "ACTIVE", deletedAt: null } },
          entitySuspensions: {
            none: { activeKey: { not: null }, status: "active", deletedAt: null }
          }
        }
      },
      orderBy: { id: "asc" },
      select: {
        id: true,
        shopId: true,
        name: true,
        durationMinutes: true,
        priceAmount: true,
        serviceMode: true,
        shop: { select: { city: true, address: true } }
      }
    }),
    client.technicianService.findMany({
      where: {
        technicianId: { in: technicianScopeIds },
        isActive: true,
        isBookable: true,
        reviewStatus: "APPROVED",
        currency: "JPY",
        durationMinutes: { gt: 0 },
        priceAmount: { gt: 0 },
        deletedAt: null,
        category: { isActive: true, deletedAt: null },
        shop: {
          status: "published",
          deletedAt: null,
          publicIdentifier: { is: { kind: "SHOP", status: "ACTIVE", deletedAt: null } },
          entitySuspensions: {
            none: { activeKey: { not: null }, status: "active", deletedAt: null }
          }
        },
        technicianProfile: {
          status: "published",
          visibility: "public",
          deletedAt: null,
          user: { isActive: true, deletedAt: null }
        }
      },
      orderBy: { id: "asc" },
      select: {
        id: true,
        shopId: true,
        technicianId: true,
        name: true,
        durationMinutes: true,
        priceAmount: true,
        sourceShopService: { select: { serviceMode: true } },
        shop: { select: { city: true, address: true } },
        technicianProfile: { select: { serviceArea: true, serviceAreasJson: true } }
      }
    }),
    client.technicianShopAffiliation.findMany({
      where: {
        technicianProfileId: { in: technicianScopeIds },
        workStatus: "ACTIVE",
        activeKey: { not: null },
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        deletedAt: null
      },
      select: { technicianProfileId: true, shopId: true }
    })
  ]);
  const activeAffiliations = new Set(
    technicianShopAffiliations.map(
      (affiliation) => `${affiliation.technicianProfileId}:${affiliation.shopId}`
    )
  );
  const normalizeMode = (value: string): ExchangeSimulationServiceBinding["serviceMode"] | null =>
    value === "store" || value === "onsite" || value === "flexible" ? value : null;
  const normalizeAreas = (value: Prisma.JsonValue | null, fallback: string): string[] => {
    const areas = Array.isArray(value)
      ? [
          ...new Set(
            value
              .filter((item): item is string => typeof item === "string")
              .map((item) => item.trim())
              .filter(Boolean)
          )
        ]
      : [];
    return areas.length > 0 ? areas : [fallback];
  };
  const shopBindings = new Map<number, ExchangeSimulationServiceBinding>();
  for (const service of shopServices) {
    if (shopBindings.has(service.shopId)) continue;
    const catalogPriceJpy = Number(service.priceAmount.toString());
    const serviceMode = normalizeMode(service.serviceMode);
    if (!Number.isSafeInteger(catalogPriceJpy) || !serviceMode) continue;
    shopBindings.set(service.shopId, {
      serviceRef: `shop:${service.id}`,
      serviceId: service.id,
      technicianServiceId: null,
      serviceName: service.name,
      serviceDurationMinutes: service.durationMinutes,
      catalogPriceJpy,
      serviceMode,
      addressLabel: service.shop.address,
      serviceAreas: [service.shop.city]
    });
  }
  const technicianBindings = new Map<number, ExchangeSimulationServiceBinding>();
  for (const service of technicianServices) {
    if (service.shopId === null || service.shop === null) continue;
    if (
      technicianBindings.has(service.technicianId) ||
      !activeAffiliations.has(`${service.technicianId}:${service.shopId}`)
    ) {
      continue;
    }
    const serviceMode = normalizeMode(service.sourceShopService?.serviceMode ?? "store");
    if (!Number.isSafeInteger(service.priceAmount) || !serviceMode) continue;
    technicianBindings.set(service.technicianId, {
      serviceRef: `technician:${service.id}`,
      serviceId: null,
      technicianServiceId: service.id,
      serviceName: service.name,
      serviceDurationMinutes: service.durationMinutes,
      catalogPriceJpy: service.priceAmount,
      serviceMode,
      addressLabel: service.shop.address,
      serviceAreas: normalizeAreas(
        service.technicianProfile.serviceAreasJson,
        service.technicianProfile.serviceArea?.trim() || service.shop.city
      )
    });
  }

  return identities.flatMap((identity) =>
    identity.publicIdentifier &&
    (identity.type === "customer" ||
      (identity.scopeType === "shop" && identity.scopeId && shopBindings.has(identity.scopeId)) ||
      (identity.scopeType === "technician_profile" &&
        identity.scopeId &&
        technicianBindings.has(identity.scopeId)))
      ? [
          {
            userId: identity.userId,
            identityId: identity.id,
            identityType: identity.type,
            publicId: identity.publicIdentifier.publicId,
            displayName: identity.displayName ?? identity.user.username,
            avatarUrl: identity.user.avatarUrl,
            ...((
              identity.scopeType === "shop" && identity.scopeId
                ? shopBindings.get(identity.scopeId)
                : identity.scopeType === "technician_profile" && identity.scopeId
                  ? technicianBindings.get(identity.scopeId)
                  : undefined
            )
              ? {
                  intelligenceService:
                    identity.scopeType === "shop" && identity.scopeId
                      ? shopBindings.get(identity.scopeId)!
                      : technicianBindings.get(identity.scopeId!)!
                }
              : {})
          }
        ]
      : []
  );
};

export const applyExchangeSimulationPlan = async (
  client: PrismaClient,
  plan: ExchangeSimulationPlan
): Promise<ExchangeSimulationSeedSummary> => {
  if (plan.namespace !== EXCHANGE_SIMULATION_NAMESPACE) {
    throw new Error(`Unexpected Exchange simulation namespace: ${plan.namespace}`);
  }

  return client.$transaction(
    async (transaction) => {
      const legacyPosts = await transaction.exchangePost.findMany({
        where: {
          OR: LEGACY_EXCHANGE_SIMULATION_NAMESPACES.map((namespace) => ({
            idempotencyKey: { startsWith: namespace }
          }))
        },
        select: { id: true }
      });
      const legacyPostIds = legacyPosts.map(({ id }) => id);
      await transaction.exchangeComment.deleteMany({
        where: {
          OR: LEGACY_EXCHANGE_SIMULATION_NAMESPACES.map((namespace) => ({
            idempotencyKey: { startsWith: namespace }
          }))
        }
      });
      await transaction.exchangeShare.deleteMany({
        where: {
          OR: LEGACY_EXCHANGE_SIMULATION_NAMESPACES.map((namespace) => ({
            idempotencyKey: { startsWith: namespace }
          }))
        }
      });

      const plannedPostKeys = plan.posts.map((post) => post.idempotencyKey);
      const obsoletePosts = await transaction.exchangePost.findMany({
        where: {
          idempotencyKey: {
            startsWith: EXCHANGE_SIMULATION_NAMESPACE,
            notIn: plannedPostKeys
          }
        },
        select: { id: true }
      });
      const plannedExistingPosts = await transaction.exchangePost.findMany({
        where: { idempotencyKey: { in: plannedPostKeys } },
        select: { id: true }
      });
      await assertSimulationPostGraphsResettable(
        transaction,
        [...legacyPostIds, ...obsoletePosts.map(({ id }) => id)],
        true
      );
      await assertSimulationPostGraphsResettable(
        transaction,
        plannedExistingPosts.map(({ id }) => id),
        false
      );
      await hardDeletePostGraph(transaction, legacyPostIds);
      await hardDeletePostGraph(
        transaction,
        obsoletePosts.map(({ id }) => id)
      );

      for (const post of plan.posts) {
        await upsertSimulationPost(transaction, post);
      }

      return {
        actors: new Set(
          plan.posts.flatMap((post) => [
            post.author.userId,
            ...post.comments.map((comment) => comment.actor.userId),
            ...post.likes.map((like) => like.actor.userId),
            ...post.shares.map((share) => share.actor.userId)
          ])
        ).size,
        posts: plan.posts.length,
        demands: plan.posts.filter((post) => post.type === "demand").length,
        intelligences: plan.posts.filter((post) => post.type === "intelligence").length,
        comments: plan.posts.reduce((total, post) => total + post.comments.length, 0),
        likes: plan.posts.reduce((total, post) => total + post.likes.length, 0),
        shares: plan.posts.reduce((total, post) => total + post.shares.length, 0),
        legacyPostsRemoved: legacyPostIds.length
      };
    },
    { maxWait: 20_000, timeout: 180_000 }
  );
};

const assertSimulationPostGraphsResettable = async (
  transaction: Prisma.TransactionClient,
  postIds: number[],
  rejectsIntelligenceBookings: boolean
): Promise<void> => {
  const uniquePostIds = [...new Set(postIds)];
  if (uniquePostIds.length === 0) return;
  const [requestFinancial, walletHold, feeCalculationLog, bookedParticipant, intelligenceBooking] =
    await Promise.all([
      transaction.exchangeRequestFinancial.findFirst({
        where: { exchangePostId: { in: uniquePostIds } },
        select: { exchangePostId: true }
      }),
      transaction.walletHold.findFirst({
        where: { exchangePostId: { in: uniquePostIds } },
        select: { exchangePostId: true }
      }),
      transaction.feeCalculationLog.findFirst({
        where: { exchangePostId: { in: uniquePostIds } },
        select: { exchangePostId: true }
      }),
      transaction.exchangeMatchParticipant.findFirst({
        where: { exchangePostId: { in: uniquePostIds }, bookingOrderId: { not: null } },
        select: { exchangePostId: true }
      }),
      rejectsIntelligenceBookings
        ? transaction.bookingOrder.findFirst({
            where: { exchangeIntelligencePostId: { in: uniquePostIds } },
            select: { exchangeIntelligencePostId: true }
          })
        : Promise.resolve(null)
    ]);
  const protectedPostId =
    requestFinancial?.exchangePostId ??
    walletHold?.exchangePostId ??
    feeCalculationLog?.exchangePostId ??
    bookedParticipant?.exchangePostId ??
    intelligenceBooking?.exchangeIntelligencePostId;
  if (protectedPostId !== undefined && protectedPostId !== null) {
    throw new Error(
      `Exchange simulation post ${protectedPostId} has financial or booked state and cannot be reset.`
    );
  }
};

const hardDeletePostGraph = async (
  transaction: Prisma.TransactionClient,
  postIds: number[]
): Promise<void> => {
  if (postIds.length === 0) return;
  const matchings = await transaction.exchangeRequestMatching.findMany({
    where: { exchangePostId: { in: postIds } },
    select: { id: true }
  });
  const matchingIds = matchings.map(({ id }) => id);
  await transaction.exchangeMatchParticipant.deleteMany({
    where: { exchangePostId: { in: postIds } }
  });
  await transaction.exchangeClaim.deleteMany({ where: { exchangePostId: { in: postIds } } });
  if (matchingIds.length > 0) {
    await transaction.exchangeMatchEvent.deleteMany({ where: { matchingId: { in: matchingIds } } });
  }
  await transaction.exchangeRequestMatching.deleteMany({
    where: { exchangePostId: { in: postIds } }
  });
  await transaction.exchangeComment.deleteMany({ where: { postId: { in: postIds } } });
  await transaction.exchangeLike.deleteMany({ where: { postId: { in: postIds } } });
  await transaction.exchangeShare.deleteMany({ where: { postId: { in: postIds } } });
  await transaction.exchangeDemand.deleteMany({ where: { postId: { in: postIds } } });
  await transaction.exchangeIntelligence.deleteMany({ where: { postId: { in: postIds } } });
  await transaction.exchangePost.deleteMany({ where: { id: { in: postIds } } });
};

const upsertSimulationPost = async (
  transaction: Prisma.TransactionClient,
  post: ExchangeSimulationPost
): Promise<void> => {
  const createdAt = new Date(post.createdAt);
  const commonData = {
    authorUserId: post.author.userId,
    authorIdentityId: post.author.identityId,
    ownerIdentityId: post.author.identityId,
    publisherPublicId: post.author.publicId,
    publisherIdentityType: post.author.identityType,
    publisherDisplayName: post.author.displayName,
    publisherAvatarUrl: post.author.avatarUrl,
    type: typeToDatabase[post.type],
    status: ExchangePostStatus.PUBLISHED,
    title: post.title,
    detail: post.detail,
    contentLocale: localeToDatabase[post.contentLocale],
    areaLabel: post.areaLabel,
    serviceStartAt: new Date(post.serviceStartAt),
    serviceEndAt: new Date(post.serviceEndAt),
    expiresAt: new Date(post.expiresAt),
    withdrawnAt: null,
    payloadFingerprint: null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null
  };
  const record = await transaction.exchangePost.upsert({
    where: { idempotencyKey: post.idempotencyKey },
    create: { ...commonData, idempotencyKey: post.idempotencyKey },
    update: commonData,
    select: { id: true }
  });

  if (post.demand) {
    await transaction.exchangeIntelligence.deleteMany({ where: { postId: record.id } });
    const demandData = {
      targetProviderCount: 1,
      targetProviderLimitSnapshot: 1,
      publisherCapacitySource: ExchangePublisherCapacitySource.CUSTOMER_MEMBERSHIP,
      membershipLevelSnapshot: null,
      matchMode: "QUICK" as const,
      budgetMode: "TOTAL" as const,
      ...post.demand,
      addressLine1: post.areaLabel,
      addressLine2: null,
      addressLine3: null,
      addressLine2Public: false,
      addressLine3Public: false,
      publisherIdentityPublic: false,
      serviceMode: "STORE" as const
    };
    await transaction.exchangeDemand.upsert({
      where: { postId: record.id },
      create: {
        postId: record.id,
        ...demandData,
        createdAt,
        updatedAt: createdAt
      },
      update: {
        ...demandData,
        deletedAt: null,
        updatedAt: createdAt
      }
    });
    await resetSimulationRequestMatching(transaction, record.id, demandData, createdAt);
  } else if (post.intelligence) {
    await clearSimulationRequestLifecycle(transaction, record.id);
    await transaction.exchangeDemand.deleteMany({ where: { postId: record.id } });
    const intelligence = {
      serviceId: post.intelligence.serviceId,
      technicianServiceId: post.intelligence.technicianServiceId,
      serviceNameSnapshot: post.intelligence.serviceName,
      serviceDurationSnapshot: post.intelligence.serviceDurationMinutes,
      serviceMode: serviceModeToDatabase[post.intelligence.serviceMode],
      addressLabel: post.intelligence.addressLabel,
      serviceAreas: post.intelligence.serviceAreas as Prisma.InputJsonValue,
      originalPriceJpy: post.intelligence.originalPriceJpy,
      campaignPriceJpy: post.intelligence.campaignPriceJpy
    };
    await transaction.exchangeIntelligence.upsert({
      where: { postId: record.id },
      create: { postId: record.id, ...intelligence, createdAt, updatedAt: createdAt },
      update: { ...intelligence, deletedAt: null, updatedAt: createdAt }
    });
  } else {
    throw new Error(`Simulation subtype payload is missing for ${post.key}.`);
  }

  const commentIds: number[] = [];
  for (const comment of post.comments) {
    const commentAt = new Date(comment.createdAt);
    const saved = await transaction.exchangeComment.upsert({
      where: { idempotencyKey: comment.idempotencyKey },
      create: {
        postId: record.id,
        authorUserId: comment.actor.userId,
        authorIdentityId: comment.actor.identityId,
        authorPublicId: comment.actor.publicId,
        authorIdentityType: comment.actor.identityType,
        authorDisplayName: comment.actor.displayName,
        authorAvatarUrl: comment.actor.avatarUrl,
        content: comment.content,
        idempotencyKey: comment.idempotencyKey,
        createdAt: commentAt,
        updatedAt: commentAt
      },
      update: {
        postId: record.id,
        authorUserId: comment.actor.userId,
        authorIdentityId: comment.actor.identityId,
        authorPublicId: comment.actor.publicId,
        authorIdentityType: comment.actor.identityType,
        authorDisplayName: comment.actor.displayName,
        authorAvatarUrl: comment.actor.avatarUrl,
        content: comment.content,
        createdAt: commentAt,
        updatedAt: commentAt,
        deletedAt: null
      },
      select: { id: true }
    });
    commentIds.push(saved.id);
  }
  await transaction.exchangeComment.deleteMany({
    where: { postId: record.id, id: { notIn: commentIds } }
  });

  const likeIds: number[] = [];
  for (const like of post.likes) {
    const likeAt = new Date(like.createdAt);
    const saved = await transaction.exchangeLike.upsert({
      where: {
        postId_actorIdentityId: { postId: record.id, actorIdentityId: like.actor.identityId }
      },
      create: {
        postId: record.id,
        actorUserId: like.actor.userId,
        actorIdentityId: like.actor.identityId,
        createdAt: likeAt,
        updatedAt: likeAt
      },
      update: {
        actorIdentityId: like.actor.identityId,
        createdAt: likeAt,
        updatedAt: likeAt,
        deletedAt: null
      },
      select: { id: true }
    });
    likeIds.push(saved.id);
  }
  await transaction.exchangeLike.deleteMany({
    where: { postId: record.id, id: { notIn: likeIds } }
  });

  const shareIds: number[] = [];
  for (const share of post.shares) {
    const shareAt = new Date(share.createdAt);
    const saved = await transaction.exchangeShare.upsert({
      where: { idempotencyKey: share.idempotencyKey },
      create: {
        postId: record.id,
        actorUserId: share.actor.userId,
        actorIdentityId: share.actor.identityId,
        idempotencyKey: share.idempotencyKey,
        createdAt: shareAt,
        updatedAt: shareAt
      },
      update: {
        postId: record.id,
        actorUserId: share.actor.userId,
        actorIdentityId: share.actor.identityId,
        idempotencyKey: share.idempotencyKey,
        createdAt: shareAt,
        updatedAt: shareAt,
        deletedAt: null
      },
      select: { id: true }
    });
    shareIds.push(saved.id);
  }
  await transaction.exchangeShare.deleteMany({
    where: { postId: record.id, id: { notIn: shareIds } }
  });
};

const clearSimulationRequestLifecycle = async (
  transaction: Prisma.TransactionClient,
  postId: number
): Promise<number | null> => {
  const matching = await transaction.exchangeRequestMatching.findUnique({
    where: { exchangePostId: postId },
    select: { id: true }
  });
  await transaction.exchangeMatchParticipant.deleteMany({ where: { exchangePostId: postId } });
  await transaction.exchangeClaim.deleteMany({ where: { exchangePostId: postId } });
  if (matching) {
    await transaction.exchangeMatchEvent.deleteMany({ where: { matchingId: matching.id } });
  }
  return matching?.id ?? null;
};

const resetSimulationRequestMatching = async (
  transaction: Prisma.TransactionClient,
  postId: number,
  demand: { targetProviderCount: number; budgetMaxJpy: number },
  createdAt: Date
): Promise<void> => {
  const existingMatchingId = await clearSimulationRequestLifecycle(transaction, postId);
  const matchingData = {
    status: ExchangeMatchingStatus.OPEN,
    effectiveTargetProviderCount: demand.targetProviderCount,
    effectiveBudgetMaxJpy: demand.budgetMaxJpy,
    selectedQuoteTotalJpy: 0,
    version: 1,
    matchedAt: null,
    closedAt: null,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null
  };
  const matching = existingMatchingId
    ? await transaction.exchangeRequestMatching.update({
        where: { id: existingMatchingId },
        data: matchingData,
        select: { id: true }
      })
    : await transaction.exchangeRequestMatching.create({
        data: { exchangePostId: postId, ...matchingData },
        select: { id: true }
      });
  await transaction.exchangeMatchEvent.create({
    data: {
      matchingId: matching.id,
      sequence: 1,
      type: ExchangeMatchEventType.OPENED,
      actorUserId: null,
      actorIdentityId: null,
      versionBefore: 0,
      versionAfter: 1,
      payload: {
        exchangePostId: postId,
        effectiveTargetProviderCount: demand.targetProviderCount,
        effectiveBudgetMaxJpy: demand.budgetMaxJpy
      },
      createdAt,
      updatedAt: createdAt
    }
  });
};
