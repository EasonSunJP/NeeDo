import {
  ExchangePostStatus,
  ExchangePostType,
  type PrismaClient,
  type PublicIdentifierStatus
} from "@prisma/client";
import {
  EXCHANGE_SIMULATION_COUNTS,
  EXCHANGE_SIMULATION_NAMESPACE,
  LEGACY_EXCHANGE_SIMULATION_NAMESPACES
} from "./exchange-simulation.constants";

export interface ExchangeSimulationCheckSummary {
  posts: number;
  demands: number;
  intelligences: number;
  comments: number;
  likes: number;
  shares: number;
  actors: number;
  legacyResidue: number;
  status: "ok";
}

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

const assertIdentity = (
  identity: {
    id: number;
    userId: number;
    type: string;
    isActive: boolean;
    deletedAt: Date | null;
    publicIdentifier: {
      publicId: string;
      status: PublicIdentifierStatus;
      deletedAt: Date | null;
    } | null;
  },
  expectedUserId: number,
  label: string
): void => {
  assert(identity.userId === expectedUserId, `${label} identity ownership mismatch.`);
  assert(identity.isActive && !identity.deletedAt, `${label} identity is inactive.`);
  assert(identity.publicIdentifier, `${label} public NeeDo ID is missing.`);
  assert(
    identity.publicIdentifier.status === "ACTIVE" && !identity.publicIdentifier.deletedAt,
    `${label} public NeeDo ID is inactive.`
  );
};

export const checkFormalExchangeSimulation = async (
  client: PrismaClient,
  checkedAt = new Date()
): Promise<ExchangeSimulationCheckSummary> => {
  const actorIdentitySelect = {
    id: true,
    userId: true,
    type: true,
    scopeType: true,
    scopeId: true,
    isActive: true,
    deletedAt: true,
    publicIdentifier: {
      select: { publicId: true, status: true, deletedAt: true }
    }
  } as const;
  const [posts, legacyPosts, legacyComments, legacyShares] = await Promise.all([
    client.exchangePost.findMany({
      where: { idempotencyKey: { startsWith: EXCHANGE_SIMULATION_NAMESPACE } },
      orderBy: { idempotencyKey: "asc" },
      include: {
        author: { select: { id: true, isActive: true, deletedAt: true } },
        authorIdentity: { select: actorIdentitySelect },
        demand: true,
        intelligence: {
          include: {
            service: {
              include: {
                category: { select: { isActive: true, deletedAt: true } },
                shop: {
                  include: {
                    publicIdentifier: true,
                    entitySuspensions: {
                      where: { activeKey: { not: null }, status: "active", deletedAt: null },
                      select: { id: true }
                    }
                  }
                }
              }
            },
            technicianService: {
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
                  include: {
                    user: { select: { isActive: true, deletedAt: true } },
                    technicianShopAffiliations: {
                      where: { deletedAt: null },
                      select: {
                        shopId: true,
                        workStatus: true,
                        activeKey: true,
                        startsAt: true,
                        endsAt: true
                      }
                    }
                  }
                }
              }
            }
          }
        },
        comments: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          include: {
            author: { select: { id: true, isActive: true, deletedAt: true } },
            authorIdentity: { select: actorIdentitySelect }
          }
        },
        likes: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          include: {
            actor: { select: { id: true, isActive: true, deletedAt: true } },
            actorIdentity: { select: actorIdentitySelect }
          }
        },
        shares: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          include: {
            actor: { select: { id: true, isActive: true, deletedAt: true } },
            actorIdentity: { select: actorIdentitySelect }
          }
        }
      }
    }),
    client.exchangePost.count({
      where: {
        OR: LEGACY_EXCHANGE_SIMULATION_NAMESPACES.map((namespace) => ({
          idempotencyKey: { startsWith: namespace }
        }))
      }
    }),
    client.exchangeComment.count({
      where: {
        OR: LEGACY_EXCHANGE_SIMULATION_NAMESPACES.map((namespace) => ({
          idempotencyKey: { startsWith: namespace }
        }))
      }
    }),
    client.exchangeShare.count({
      where: {
        OR: LEGACY_EXCHANGE_SIMULATION_NAMESPACES.map((namespace) => ({
          idempotencyKey: { startsWith: namespace }
        }))
      }
    })
  ]);
  const legacyResidue = legacyPosts + legacyComments + legacyShares;
  assert(legacyResidue === 0, `Legacy Exchange simulation residue found: ${legacyResidue}.`);
  assert(
    posts.length ===
      EXCHANGE_SIMULATION_COUNTS.demandPosts + EXCHANGE_SIMULATION_COUNTS.intelligencePosts,
    `Expected exactly 40 Exchange simulation posts, found ${posts.length}.`
  );

  let demands = 0;
  let intelligences = 0;
  let comments = 0;
  let likes = 0;
  let shares = 0;
  const actorIds = new Set<number>();

  for (const post of posts) {
    assert(!post.deletedAt, `Simulation post ${post.id} is soft-deleted.`);
    assert(post.status === ExchangePostStatus.PUBLISHED, `Simulation post ${post.id} is not live.`);
    assert(post.expiresAt.getTime() > checkedAt.getTime(), `Simulation post ${post.id} expired.`);
    assert(
      post.serviceStartAt.getTime() < post.serviceEndAt.getTime() &&
        post.serviceEndAt.getTime() <= post.expiresAt.getTime(),
      `Simulation post ${post.id} has an invalid service window.`
    );
    assert(
      post.title.trim().length > 0 && post.detail.trim().length > 0,
      `Post ${post.id} is blank.`
    );
    assert(post.author.id === post.authorUserId, `Post ${post.id} author relation mismatch.`);
    assert(post.author.isActive && !post.author.deletedAt, `Post ${post.id} author is inactive.`);
    assertIdentity(post.authorIdentity, post.authorUserId, `Post ${post.id} author`);
    assert(
      post.publisherPublicId === post.authorIdentity.publicIdentifier?.publicId,
      `Post ${post.id} public ID snapshot mismatch.`
    );
    assert(
      post.publisherIdentityType === post.authorIdentity.type,
      `Post ${post.id} identity snapshot mismatch.`
    );
    actorIds.add(post.authorUserId);

    if (post.type === ExchangePostType.DEMAND) {
      demands += 1;
      assert(
        post.authorIdentity.type === "customer",
        `Demand ${post.id} has a non-customer author.`
      );
      assert(post.demand && !post.demand.deletedAt, `Demand ${post.id} subtype is missing.`);
      assert(!post.intelligence, `Demand ${post.id} has mixed subtype data.`);
      assert(
        post.demand.budgetMinJpy === null || post.demand.budgetMinJpy <= post.demand.budgetMaxJpy,
        `Demand ${post.id} budget is invalid.`
      );
    } else {
      intelligences += 1;
      assert(
        ["technician", "merchant", "merchant_owner", "merchant_staff"].includes(
          post.authorIdentity.type
        ),
        `Intelligence ${post.id} has an invalid publisher.`
      );
      assert(
        post.intelligence && !post.intelligence.deletedAt,
        `Intelligence ${post.id} subtype is missing.`
      );
      assert(!post.demand, `Intelligence ${post.id} has mixed subtype data.`);
      assert(
        Array.isArray(post.intelligence.serviceAreas) &&
          post.intelligence.serviceAreas.every((area) => typeof area === "string"),
        `Intelligence ${post.id} service areas are invalid.`
      );
      assert(
        post.intelligence.originalPriceJpy === null ||
          post.intelligence.campaignPriceJpy <= post.intelligence.originalPriceJpy,
        `Intelligence ${post.id} price is invalid.`
      );
      const shopService = post.intelligence.service;
      const technicianService = post.intelligence.technicianService;
      assert(
        Boolean(shopService) !== Boolean(technicianService),
        `Intelligence ${post.id} must bind exactly one formal service.`
      );
      const boundService = shopService ?? technicianService!;
      assert(
        post.intelligence.serviceNameSnapshot === boundService.name &&
          post.intelligence.serviceDurationSnapshot === boundService.durationMinutes,
        `Intelligence ${post.id} service snapshot is stale.`
      );
      const catalogPriceJpy = Number(boundService.priceAmount.toString());
      assert(
        Number.isSafeInteger(catalogPriceJpy) &&
          post.intelligence.originalPriceJpy === catalogPriceJpy,
        `Intelligence ${post.id} catalog price snapshot is stale.`
      );
      assert(
        boundService.category.isActive && !boundService.category.deletedAt,
        `Intelligence ${post.id} category is unavailable.`
      );
      assert(
        boundService.shop.status === "published" &&
          !boundService.shop.deletedAt &&
          boundService.shop.publicIdentifier?.kind === "SHOP" &&
          boundService.shop.publicIdentifier.status === "ACTIVE" &&
          !boundService.shop.publicIdentifier.deletedAt &&
          boundService.shop.entitySuspensions.length === 0,
        `Intelligence ${post.id} shop is unavailable.`
      );
      if (shopService) {
        assert(
          ["merchant", "merchant_owner", "merchant_staff"].includes(post.authorIdentity.type) &&
            post.authorIdentity.scopeType === "shop" &&
            post.authorIdentity.scopeId === shopService.shopId &&
            shopService.status === "published" &&
            !shopService.deletedAt,
          `Intelligence ${post.id} shop service is outside publisher scope.`
        );
      } else {
        const profile = technicianService!.technicianProfile;
        const affiliation = profile.technicianShopAffiliations.find(
          (candidate) =>
            candidate.shopId === technicianService!.shopId &&
            candidate.workStatus === "ACTIVE" &&
            candidate.activeKey !== null &&
            candidate.startsAt <= checkedAt &&
            (candidate.endsAt === null || candidate.endsAt > checkedAt)
        );
        assert(
          post.authorIdentity.type === "technician" &&
            post.authorIdentity.scopeType === "technician_profile" &&
            post.authorIdentity.scopeId === technicianService!.technicianId &&
            technicianService!.isActive &&
            technicianService!.isBookable &&
            technicianService!.reviewStatus === "APPROVED" &&
            !technicianService!.deletedAt &&
            profile.status === "published" &&
            profile.visibility === "public" &&
            !profile.deletedAt &&
            profile.user.isActive &&
            !profile.user.deletedAt &&
            Boolean(affiliation),
          `Intelligence ${post.id} technician service is outside publisher scope.`
        );
      }
    }

    assert(
      post.comments.length >= EXCHANGE_SIMULATION_COUNTS.comments.minimum &&
        post.comments.length <= EXCHANGE_SIMULATION_COUNTS.comments.maximum,
      `Post ${post.id} comment count is ${post.comments.length}.`
    );
    assert(
      post.likes.length >= EXCHANGE_SIMULATION_COUNTS.likes.minimum &&
        post.likes.length <= EXCHANGE_SIMULATION_COUNTS.likes.maximum,
      `Post ${post.id} like count is ${post.likes.length}.`
    );
    assert(
      post.shares.length >= EXCHANGE_SIMULATION_COUNTS.shares.minimum &&
        post.shares.length <= EXCHANGE_SIMULATION_COUNTS.shares.maximum,
      `Post ${post.id} share count is ${post.shares.length}.`
    );
    assert(
      new Set(post.likes.map((like) => like.actorUserId)).size === post.likes.length,
      `Post ${post.id} has duplicate like actors.`
    );
    assert(
      new Set(post.shares.map((share) => share.actorUserId)).size === post.shares.length,
      `Post ${post.id} has duplicate share actors.`
    );

    for (const comment of post.comments) {
      assert(!comment.deletedAt, `Comment ${comment.id} is soft-deleted.`);
      assert(
        comment.idempotencyKey.startsWith(EXCHANGE_SIMULATION_NAMESPACE),
        `Comment ${comment.id} is not simulation-owned.`
      );
      assert(comment.createdAt >= post.createdAt, `Comment ${comment.id} predates its post.`);
      assert(
        comment.author.id === comment.authorUserId &&
          comment.author.isActive &&
          !comment.author.deletedAt,
        `Comment ${comment.id} author is invalid.`
      );
      assertIdentity(comment.authorIdentity, comment.authorUserId, `Comment ${comment.id} author`);
      assert(
        comment.authorPublicId === comment.authorIdentity.publicIdentifier?.publicId,
        `Comment ${comment.id} public ID snapshot mismatch.`
      );
      actorIds.add(comment.authorUserId);
    }
    for (const like of post.likes) {
      assert(!like.deletedAt, `Like ${like.id} is soft-deleted.`);
      assert(like.createdAt >= post.createdAt, `Like ${like.id} predates its post.`);
      assert(
        like.actor.id === like.actorUserId && like.actor.isActive && !like.actor.deletedAt,
        `Like ${like.id} actor is invalid.`
      );
      assertIdentity(like.actorIdentity, like.actorUserId, `Like ${like.id} actor`);
      actorIds.add(like.actorUserId);
    }
    for (const share of post.shares) {
      assert(!share.deletedAt, `Share ${share.id} is soft-deleted.`);
      assert(
        share.idempotencyKey.startsWith(EXCHANGE_SIMULATION_NAMESPACE),
        `Share ${share.id} is not simulation-owned.`
      );
      assert(share.createdAt >= post.createdAt, `Share ${share.id} predates its post.`);
      assert(
        share.actor.id === share.actorUserId && share.actor.isActive && !share.actor.deletedAt,
        `Share ${share.id} actor is invalid.`
      );
      assertIdentity(share.actorIdentity, share.actorUserId, `Share ${share.id} actor`);
      actorIds.add(share.actorUserId);
    }
    comments += post.comments.length;
    likes += post.likes.length;
    shares += post.shares.length;
  }

  assert(demands === EXCHANGE_SIMULATION_COUNTS.demandPosts, `Demand count is ${demands}.`);
  assert(
    intelligences === EXCHANGE_SIMULATION_COUNTS.intelligencePosts,
    `Intelligence count is ${intelligences}.`
  );
  return {
    posts: posts.length,
    demands,
    intelligences,
    comments,
    likes,
    shares,
    actors: actorIds.size,
    legacyResidue,
    status: "ok"
  };
};
