import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";
import { ShopVisibilityRepository, type ShopVisibilityViewer } from "./shop-visibility.repository";
import type { ShopVisibilityRepositoryPort } from "../services/shop-visibility.service";
import { calculateTechnicianPlatformRating } from "../domain/technician-rating";

export type EntityTargetType = "shop" | "technician" | "service" | "technician_service";

export interface EntityTarget {
  targetType: EntityTargetType;
  publicId: string;
}

export interface EntityFavoriteState extends EntityTarget {
  isFavorited: boolean;
  favoriteCount: number;
}

export type EntityFavoriteCard =
  | {
      kind: "shop";
      name: string;
      description: string | null;
      address: string;
      imageUrl: string | null;
      rating: number;
      reviewCount: number;
      completedOrderCount: number;
      shareCount: number;
    }
  | {
      kind: "technician";
      name: string;
      description: string | null;
      imageUrl: string | null;
      languages: string[];
      rating: number;
      completedOrderCount: number;
      shareCount: number;
    }
  | {
      kind: "service";
      name: string;
      description: string | null;
      imageUrl: string | null;
      priceAmount: number;
      currency: string;
      durationMinutes: number;
      usageCount: number;
      shareCount: number;
      isBookable: boolean;
      shopPublicId: string | null;
      shopAddress: string | null;
      tags: string[];
    };

export interface EntityFavoriteListItem extends EntityFavoriteState {
  favoritedAt: Date;
  card: EntityFavoriteCard;
}

export interface EntityShareReceipt extends EntityTarget {
  eventId: number;
  messageId: number | null;
  shareCount: number;
  replayed: boolean;
}

export interface ResolvedEntityTarget extends EntityTarget {
  shopId: number | null;
  technicianProfileId: number | null;
  serviceId: number | null;
  technicianServiceId: number | null;
}

export interface RecordSystemEntityShareInput {
  actorUserId: number;
  actorIdentityId: number;
  target: EntityTarget;
  idempotencyKey: string;
  requestFingerprint: string;
  viewer?: ShopVisibilityViewer;
}

export type RecordEntityShareOutcome =
  | { status: "created" | "replayed"; receipt: EntityShareReceipt }
  | { status: "idempotency_conflict" }
  | { status: "target_not_found" };

export interface EntityFavoriteListInput extends PaginationInput {
  userId: number;
  page: number;
  pageSize: number;
  targetType?: EntityTargetType;
  viewer?: ShopVisibilityViewer;
}

export interface EntityEngagementRepositoryPort {
  setFavorite(
    userId: number,
    target: EntityTarget,
    isFavorited: boolean,
    viewer?: ShopVisibilityViewer
  ): Promise<EntityFavoriteState | null>;
  getFavoriteStatuses(userId: number, targets: EntityTarget[], viewer?: ShopVisibilityViewer): Promise<EntityFavoriteState[]>;
  listFavorites(input: EntityFavoriteListInput): Promise<PaginatedResponse<EntityFavoriteListItem>>;
  resolveTarget(target: EntityTarget, viewer?: ShopVisibilityViewer): Promise<ResolvedEntityTarget | null>;
  recordSystemShare(input: RecordSystemEntityShareInput): Promise<RecordEntityShareOutcome>;
}

interface ResolvedFavoriteListTarget extends ResolvedEntityTarget {
  favoritedAt: Date;
  card: EntityFavoriteCard;
}

const activeShopWhere = (
  publicIds: string[],
  visibilityWhere: Prisma.ShopWhereInput
): Prisma.ShopWhereInput => ({
  deletedAt: null,
  status: "published",
  publicIdentifier: {
    is: {
      ...(publicIds.length > 0 ? { publicId: { in: publicIds } } : {}),
      kind: "SHOP",
      status: "ACTIVE",
      searchable: true,
      deletedAt: null
    }
  },
  ...visibilityWhere
});

const activeTechnicianWhere = (publicIds: string[]): Prisma.TechnicianProfileWhereInput => ({
  deletedAt: null,
  status: "published",
  user: {
    isActive: true,
    deletedAt: null,
    identities: {
      some: {
        deletedAt: null,
        isActive: true,
        type: { in: ["technician", "service", "s"] },
        publicIdentifier: {
          is: {
            ...(publicIds.length > 0 ? { publicId: { in: publicIds } } : {}),
            kind: "S",
            status: "ACTIVE",
            searchable: true,
            deletedAt: null
          }
        }
      }
    }
  }
});

const activeServiceWhere = (
  publicIds: string[],
  visibilityWhere: Prisma.ShopWhereInput
): Prisma.ServiceWhereInput => ({
  deletedAt: null,
  status: "published",
  ...(publicIds.length > 0 ? { publicId: { in: publicIds } } : {}),
  shop: { is: { deletedAt: null, status: "published", ...visibilityWhere } }
});

const activeTechnicianServiceWhere = (
  publicIds: string[],
  visibilityWhere: Prisma.ShopWhereInput
): Prisma.TechnicianServiceWhereInput => ({
  deletedAt: null,
  isActive: true,
  reviewStatus: "APPROVED",
  ...(publicIds.length > 0 ? { publicId: { in: publicIds } } : {}),
  technicianProfile: { is: activeTechnicianWhere([]) },
  OR: [
    { shopId: null },
    { shop: { is: { deletedAt: null, status: "published", ...visibilityWhere } } }
  ]
});

const favoriteTargetWhere = (target: ResolvedEntityTarget): Prisma.EntityFavoriteWhereInput => {
  if (target.targetType === "shop") return { shopId: target.shopId };
  if (target.targetType === "technician") {
    return { technicianProfileId: target.technicianProfileId };
  }
  if (target.targetType === "service") return { serviceId: target.serviceId };
  return { technicianServiceId: target.technicianServiceId };
};

const shareTargetWhere = (target: ResolvedEntityTarget): Prisma.EntityShareEventWhereInput => {
  if (target.targetType === "shop") return { shopId: target.shopId };
  if (target.targetType === "technician") {
    return { technicianProfileId: target.technicianProfileId };
  }
  if (target.targetType === "service") return { serviceId: target.serviceId };
  return { technicianServiceId: target.technicianServiceId };
};

const resolvedInternalId = (target: ResolvedEntityTarget): number => {
  const id =
    target.shopId ?? target.technicianProfileId ?? target.serviceId ?? target.technicianServiceId;
  if (id === null) throw new Error("Resolved engagement target has no internal id.");
  return id;
};

const activeKeyFor = (userId: number, target: ResolvedEntityTarget): string =>
  `${userId}:${target.targetType}:${resolvedInternalId(target)}`;

export class EntityEngagementRepository implements EntityEngagementRepositoryPort {
  public constructor(
    private readonly client: PrismaClient = prisma,
    private readonly shopVisibility: ShopVisibilityRepositoryPort = new ShopVisibilityRepository(client)
  ) {}

  public async setFavorite(
    userId: number,
    target: EntityTarget,
    isFavorited: boolean,
    viewer?: ShopVisibilityViewer
  ): Promise<EntityFavoriteState | null> {
    const [resolved] = await this.resolveTargets([target], viewer);
    if (!resolved) {
      return null;
    }

    try {
      const favoriteCount = await this.client.$transaction(async (transaction) => {
        const targetWhere = favoriteTargetWhere(resolved);
        const existing = await transaction.entityFavorite.findFirst({
          where: { userId, ...targetWhere },
          orderBy: [{ deletedAt: "asc" }, { id: "desc" }]
        });

        if (isFavorited && existing && existing.deletedAt !== null) {
          await transaction.entityFavorite.update({
            where: { id: existing.id },
            data: { activeKey: activeKeyFor(userId, resolved), deletedAt: null }
          });
        } else if (isFavorited && !existing) {
          await transaction.entityFavorite.create({
            data: {
              userId,
              shopId: resolved.shopId,
              technicianProfileId: resolved.technicianProfileId,
              serviceId: resolved.serviceId,
              technicianServiceId: resolved.technicianServiceId,
              activeKey: activeKeyFor(userId, resolved)
            }
          });
        } else if (!isFavorited && existing?.deletedAt === null) {
          await transaction.entityFavorite.update({
            where: { id: existing.id },
            data: { activeKey: null, deletedAt: new Date() }
          });
        }

        return transaction.entityFavorite.count({
          where: { ...targetWhere, deletedAt: null }
        });
      });

      return { ...target, isFavorited, favoriteCount };
    } catch (error) {
      if (
        isFavorited &&
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        return (await this.readFavoriteStates(userId, [resolved]))[0] ?? null;
      }
      throw error;
    }
  }

  public async getFavoriteStatuses(
    userId: number,
    targets: EntityTarget[],
    viewer?: ShopVisibilityViewer
  ): Promise<EntityFavoriteState[]> {
    const resolved = await this.resolveTargets(targets, viewer);
    return this.readFavoriteStates(userId, resolved);
  }

  public async listFavorites(
    input: EntityFavoriteListInput
  ): Promise<PaginatedResponse<EntityFavoriteListItem>> {
    const pagination = toPrismaPagination(input);
    const visibilityWhere = await this.shopVisibility.buildVisibilityWhere(
      input.viewer
    ) as Prisma.ShopWhereInput;
    const shopVisibility: Prisma.EntityFavoriteWhereInput = {
      shop: { is: activeShopWhere([], visibilityWhere) }
    };
    const technicianVisibility: Prisma.EntityFavoriteWhereInput = {
      technicianProfile: { is: activeTechnicianWhere([]) }
    };
    const serviceVisibility: Prisma.EntityFavoriteWhereInput = {
      service: { is: activeServiceWhere([], visibilityWhere) }
    };
    const technicianServiceVisibility: Prisma.EntityFavoriteWhereInput = {
      technicianService: { is: activeTechnicianServiceWhere([], visibilityWhere) }
    };
    const visibilityByType: Record<EntityTargetType, Prisma.EntityFavoriteWhereInput> = {
      shop: shopVisibility,
      technician: technicianVisibility,
      service: serviceVisibility,
      technician_service: technicianServiceVisibility
    };
    const visibility = input.targetType
      ? [visibilityByType[input.targetType]]
      : Object.values(visibilityByType);
    const where: Prisma.EntityFavoriteWhereInput = {
      userId: input.userId,
      deletedAt: null,
      OR: visibility
    };
    const [rows, total] = await Promise.all([
      this.client.entityFavorite.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          createdAt: true,
          shopId: true,
          technicianProfileId: true,
          serviceId: true,
          technicianServiceId: true,
          shop: {
            select: {
              name: true,
              description: true,
              address: true,
              publicIdentifier: { select: { publicId: true } },
              mediaAssets: {
                where: { deletedAt: null, isActive: true },
                orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
                take: 1,
                select: { url: true }
              },
              reviewSummary: {
                select: { ratingAverage: true, reviewCount: true, deletedAt: true }
              },
              _count: {
                select: {
                  bookingOrders: { where: { status: "COMPLETED", deletedAt: null } },
                  entityShareEvents: { where: { deletedAt: null } }
                }
              }
            }
          },
          service: {
            select: {
              publicId: true,
              name: true,
              description: true,
              priceAmount: true,
              currency: true,
              durationMinutes: true,
              status: true,
              category: { select: { name: true } },
              shop: {
                select: {
                  address: true,
                  publicIdentifier: { select: { publicId: true } }
                }
              },
              mediaAssets: {
                where: { deletedAt: null, isActive: true },
                orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
                take: 1,
                select: { url: true }
              },
              _count: {
                select: {
                  bookingOrders: { where: { status: "COMPLETED", deletedAt: null } },
                  entityShareEvents: { where: { deletedAt: null } }
                }
              }
            }
          },
          technicianService: {
            select: {
              publicId: true,
              name: true,
              description: true,
              priceAmount: true,
              currency: true,
              durationMinutes: true,
              coverImageUrl: true,
              tagsJson: true,
              isBookable: true,
              shop: {
                select: {
                  address: true,
                  publicIdentifier: { select: { publicId: true } }
                }
              },
              _count: {
                select: {
                  bookingOrders: { where: { status: "COMPLETED", deletedAt: null } },
                  entityShareEvents: { where: { deletedAt: null } }
                }
              }
            }
          },
          technicianProfile: {
            select: {
              displayName: true,
              bio: true,
              languages: true,
              reviewSummary: {
                select: { ratingAverage: true, reviewCount: true, deletedAt: true }
              },
              performanceSummary: {
                select: { completedOrderCount: true, deletedAt: true }
              },
              mediaAssets: {
                where: { deletedAt: null, isActive: true },
                orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
                take: 1,
                select: { url: true }
              },
              _count: {
                select: { entityShareEvents: { where: { deletedAt: null } } }
              },
              user: {
                select: {
                  avatarUrl: true,
                  avatarBootstrapUrl: true,
                  identities: {
                    where: {
                      deletedAt: null,
                      isActive: true,
                      type: { in: ["technician", "service", "s"] },
                      publicIdentifier: {
                        is: { kind: "S", status: "ACTIVE", searchable: true, deletedAt: null }
                      }
                    },
                    take: 1,
                    select: { publicIdentifier: { select: { publicId: true } } }
                  }
                }
              }
            }
          }
        }
      }),
      this.client.entityFavorite.count({ where })
    ]);

    const resolved: ResolvedFavoriteListTarget[] = [];
    rows.forEach((row) => {
      const shopPublicId = row.shop?.publicIdentifier?.publicId;
      if (row.shopId !== null && row.shop && shopPublicId) {
        resolved.push({
          targetType: "shop" as const,
          publicId: shopPublicId,
          shopId: row.shopId,
          technicianProfileId: null,
          serviceId: null,
          technicianServiceId: null,
          favoritedAt: row.createdAt,
          card: {
            kind: "shop",
            name: row.shop.name,
            description: row.shop.description,
            address: row.shop.address,
            imageUrl: row.shop.mediaAssets[0]?.url ?? null,
            rating:
              row.shop.reviewSummary?.deletedAt === null
                ? Number(row.shop.reviewSummary.ratingAverage)
                : 0,
            reviewCount:
              row.shop.reviewSummary?.deletedAt === null ? row.shop.reviewSummary.reviewCount : 0,
            completedOrderCount: row.shop._count.bookingOrders,
            shareCount: row.shop._count.entityShareEvents
          }
        });
        return;
      }
      const technicianPublicId =
        row.technicianProfile?.user.identities[0]?.publicIdentifier?.publicId;
      if (row.technicianProfileId !== null && row.technicianProfile && technicianPublicId) {
        resolved.push({
          targetType: "technician" as const,
          publicId: technicianPublicId,
          shopId: null,
          technicianProfileId: row.technicianProfileId,
          serviceId: null,
          technicianServiceId: null,
          favoritedAt: row.createdAt,
          card: {
            kind: "technician",
            name: row.technicianProfile.displayName,
            description: row.technicianProfile.bio,
            imageUrl:
              row.technicianProfile.mediaAssets[0]?.url ??
              row.technicianProfile.user.avatarUrl ??
              row.technicianProfile.user.avatarBootstrapUrl,
            languages: this.stringArray(row.technicianProfile.languages),
            rating:
              row.technicianProfile.reviewSummary?.deletedAt === null
                ? calculateTechnicianPlatformRating(
                    Number(row.technicianProfile.reviewSummary.ratingAverage),
                    row.technicianProfile.reviewSummary.reviewCount
                  )
                : calculateTechnicianPlatformRating(0, 0),
            completedOrderCount:
              row.technicianProfile.performanceSummary?.deletedAt === null
                ? row.technicianProfile.performanceSummary.completedOrderCount
                : 0,
            shareCount: row.technicianProfile._count.entityShareEvents
          }
        });
        return;
      }
      if (row.serviceId !== null && row.service) {
        resolved.push({
          targetType: "service",
          publicId: row.service.publicId,
          shopId: null,
          technicianProfileId: null,
          serviceId: row.serviceId,
          technicianServiceId: null,
          favoritedAt: row.createdAt,
          card: {
            kind: "service",
            name: row.service.name,
            description: row.service.description,
            imageUrl: row.service.mediaAssets[0]?.url ?? null,
            priceAmount: Number(row.service.priceAmount),
            currency: row.service.currency,
            durationMinutes: row.service.durationMinutes,
            usageCount: row.service._count.bookingOrders,
            shareCount: row.service._count.entityShareEvents,
            isBookable: row.service.status === "published",
            shopPublicId: row.service.shop.publicIdentifier?.publicId ?? null,
            shopAddress: row.service.shop.address,
            tags: [row.service.category.name]
          }
        });
        return;
      }
      if (row.technicianServiceId !== null && row.technicianService) {
        resolved.push({
          targetType: "technician_service",
          publicId: row.technicianService.publicId,
          shopId: null,
          technicianProfileId: null,
          serviceId: null,
          technicianServiceId: row.technicianServiceId,
          favoritedAt: row.createdAt,
          card: {
            kind: "service",
            name: row.technicianService.name,
            description: row.technicianService.description,
            imageUrl: row.technicianService.coverImageUrl,
            priceAmount: row.technicianService.priceAmount,
            currency: row.technicianService.currency,
            durationMinutes: row.technicianService.durationMinutes,
            usageCount: row.technicianService._count.bookingOrders,
            shareCount: row.technicianService._count.entityShareEvents,
            isBookable: row.technicianService.isBookable,
            shopPublicId: row.technicianService.shop?.publicIdentifier?.publicId ?? null,
            shopAddress: row.technicianService.shop?.address ?? null,
            tags: this.stringArray(row.technicianService.tagsJson)
          }
        });
      }
    });
    const states = await this.readFavoriteStates(input.userId, resolved);
    const stateByKey = new Map(
      states.map((state) => [`${state.targetType}:${state.publicId}`, state])
    );

    return buildPaginatedResponse(
      resolved.flatMap((item) => {
        const state = stateByKey.get(`${item.targetType}:${item.publicId}`);
        return state ? [{ ...state, favoritedAt: item.favoritedAt, card: item.card }] : [];
      }),
      total,
      input
    );
  }

  public async resolveTarget(
    target: EntityTarget,
    viewer?: ShopVisibilityViewer
  ): Promise<ResolvedEntityTarget | null> {
    return (await this.resolveTargets([target], viewer))[0] ?? null;
  }

  public async recordSystemShare(
    input: RecordSystemEntityShareInput
  ): Promise<RecordEntityShareOutcome> {
    const target = await this.resolveTarget(input.target, input.viewer);
    if (!target) {
      return { status: "target_not_found" };
    }

    const execute = async (): Promise<RecordEntityShareOutcome> =>
      this.client.$transaction(async (transaction) => {
        const existing = await transaction.entityShareEvent.findUnique({
          where: {
            actorUserId_idempotencyKey: {
              actorUserId: input.actorUserId,
              idempotencyKey: input.idempotencyKey
            }
          }
        });
        if (existing) {
          if (existing.requestFingerprint !== input.requestFingerprint) {
            return { status: "idempotency_conflict" };
          }
          const shareCount = await transaction.entityShareEvent.count({
            where: { ...shareTargetWhere(target), deletedAt: null }
          });
          return {
            status: "replayed",
            receipt: this.shareReceipt(target, existing.id, existing.messageId, shareCount, true)
          };
        }

        const event = await transaction.entityShareEvent.create({
          data: {
            actorUserId: input.actorUserId,
            actorIdentityId: input.actorIdentityId,
            shopId: target.shopId,
            technicianProfileId: target.technicianProfileId,
            serviceId: target.serviceId,
            technicianServiceId: target.technicianServiceId,
            channel: "SYSTEM_SHARE",
            recipientUserId: null,
            recipientIdentityId: null,
            conversationId: null,
            messageId: null,
            idempotencyKey: input.idempotencyKey,
            requestFingerprint: input.requestFingerprint
          }
        });
        const shareCount = await transaction.entityShareEvent.count({
          where: { ...shareTargetWhere(target), deletedAt: null }
        });
        return {
          status: "created",
          receipt: this.shareReceipt(target, event.id, null, shareCount, false)
        };
      });

    try {
      return await execute();
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }
      const existing = await this.client.entityShareEvent.findUnique({
        where: {
          actorUserId_idempotencyKey: {
            actorUserId: input.actorUserId,
            idempotencyKey: input.idempotencyKey
          }
        }
      });
      if (!existing) {
        throw error;
      }
      if (existing.requestFingerprint !== input.requestFingerprint) {
        return { status: "idempotency_conflict" };
      }
      const shareCount = await this.client.entityShareEvent.count({
        where: { ...shareTargetWhere(target), deletedAt: null }
      });
      return {
        status: "replayed",
        receipt: this.shareReceipt(target, existing.id, existing.messageId, shareCount, true)
      };
    }
  }

  private async resolveTargets(
    targets: EntityTarget[],
    viewer?: ShopVisibilityViewer
  ): Promise<ResolvedEntityTarget[]> {
    if (targets.length === 0) {
      return [];
    }
    const shopPublicIds = [
      ...new Set(
        targets.filter((target) => target.targetType === "shop").map((target) => target.publicId)
      )
    ];
    const technicianPublicIds = [
      ...new Set(
        targets
          .filter((target) => target.targetType === "technician")
          .map((target) => target.publicId)
      )
    ];
    const servicePublicIds = [
      ...new Set(
        targets.filter((target) => target.targetType === "service").map((target) => target.publicId)
      )
    ];
    const technicianServicePublicIds = [
      ...new Set(
        targets
          .filter((target) => target.targetType === "technician_service")
          .map((target) => target.publicId)
      )
    ];
    const visibilityWhere = await this.shopVisibility.buildVisibilityWhere(viewer) as Prisma.ShopWhereInput;
    const [shops, technicians, services, technicianServices] = await Promise.all([
      shopPublicIds.length > 0
        ? this.client.shop.findMany({
            where: activeShopWhere(shopPublicIds, visibilityWhere),
            select: { id: true, publicIdentifier: { select: { publicId: true } } }
          })
        : [],
      technicianPublicIds.length > 0
        ? this.client.technicianProfile.findMany({
            where: activeTechnicianWhere(technicianPublicIds),
            select: {
              id: true,
              user: {
                select: {
                  identities: {
                    where: {
                      deletedAt: null,
                      isActive: true,
                      type: { in: ["technician", "service", "s"] },
                      publicIdentifier: {
                        is: {
                          publicId: { in: technicianPublicIds },
                          kind: "S",
                          status: "ACTIVE",
                          searchable: true,
                          deletedAt: null
                        }
                      }
                    },
                    select: { publicIdentifier: { select: { publicId: true } } }
                  }
                }
              }
            }
          })
        : [],
      servicePublicIds.length > 0
        ? this.client.service.findMany({
            where: activeServiceWhere(servicePublicIds, visibilityWhere),
            select: { id: true, publicId: true }
          })
        : [],
      technicianServicePublicIds.length > 0
        ? this.client.technicianService.findMany({
            where: activeTechnicianServiceWhere(technicianServicePublicIds, visibilityWhere),
            select: { id: true, publicId: true }
          })
        : []
    ]);
    const resolvedByKey = new Map<string, ResolvedEntityTarget>();
    shops.forEach((shop) => {
      const publicId = shop.publicIdentifier?.publicId;
      if (publicId) {
        resolvedByKey.set(`shop:${publicId}`, {
          targetType: "shop",
          publicId,
          shopId: shop.id,
          technicianProfileId: null,
          serviceId: null,
          technicianServiceId: null
        });
      }
    });
    technicians.forEach((technician) => {
      technician.user.identities.forEach((identity) => {
        const publicId = identity.publicIdentifier?.publicId;
        if (publicId) {
          resolvedByKey.set(`technician:${publicId}`, {
            targetType: "technician",
            publicId,
            shopId: null,
            technicianProfileId: technician.id,
            serviceId: null,
            technicianServiceId: null
          });
        }
      });
    });
    services.forEach((service) => {
      resolvedByKey.set(`service:${service.publicId}`, {
        targetType: "service",
        publicId: service.publicId,
        shopId: null,
        technicianProfileId: null,
        serviceId: service.id,
        technicianServiceId: null
      });
    });
    technicianServices.forEach((service) => {
      resolvedByKey.set(`technician_service:${service.publicId}`, {
        targetType: "technician_service",
        publicId: service.publicId,
        shopId: null,
        technicianProfileId: null,
        serviceId: null,
        technicianServiceId: service.id
      });
    });

    return targets.flatMap((target) => {
      const resolved = resolvedByKey.get(`${target.targetType}:${target.publicId}`);
      return resolved ? [resolved] : [];
    });
  }

  private async readFavoriteStates(
    userId: number,
    targets: ResolvedEntityTarget[]
  ): Promise<EntityFavoriteState[]> {
    if (targets.length === 0) {
      return [];
    }
    const shopIds = [
      ...new Set(targets.flatMap((target) => (target.shopId === null ? [] : [target.shopId])))
    ];
    const technicianProfileIds = [
      ...new Set(
        targets.flatMap((target) =>
          target.technicianProfileId === null ? [] : [target.technicianProfileId]
        )
      )
    ];
    const serviceIds = [
      ...new Set(targets.flatMap((target) => (target.serviceId === null ? [] : [target.serviceId])))
    ];
    const technicianServiceIds = [
      ...new Set(
        targets.flatMap((target) =>
          target.technicianServiceId === null ? [] : [target.technicianServiceId]
        )
      )
    ];
    const targetOr: Prisma.EntityFavoriteWhereInput[] = [
      ...(shopIds.length > 0 ? [{ shopId: { in: shopIds } }] : []),
      ...(technicianProfileIds.length > 0
        ? [{ technicianProfileId: { in: technicianProfileIds } }]
        : []),
      ...(serviceIds.length > 0 ? [{ serviceId: { in: serviceIds } }] : []),
      ...(technicianServiceIds.length > 0
        ? [{ technicianServiceId: { in: technicianServiceIds } }]
        : [])
    ];
    const [mine, shopCounts, technicianCounts, serviceCounts, technicianServiceCounts] =
      await Promise.all([
        this.client.entityFavorite.findMany({
          where: { userId, deletedAt: null, OR: targetOr },
          select: {
            shopId: true,
            technicianProfileId: true,
            serviceId: true,
            technicianServiceId: true
          }
        }),
        shopIds.length > 0
          ? this.client.entityFavorite.groupBy({
              by: ["shopId"],
              where: { shopId: { in: shopIds }, deletedAt: null },
              _count: { _all: true }
            })
          : [],
        technicianProfileIds.length > 0
          ? this.client.entityFavorite.groupBy({
              by: ["technicianProfileId"],
              where: { technicianProfileId: { in: technicianProfileIds }, deletedAt: null },
              _count: { _all: true }
            })
          : [],
        serviceIds.length > 0
          ? this.client.entityFavorite.groupBy({
              by: ["serviceId"],
              where: { serviceId: { in: serviceIds }, deletedAt: null },
              _count: { _all: true }
            })
          : [],
        technicianServiceIds.length > 0
          ? this.client.entityFavorite.groupBy({
              by: ["technicianServiceId"],
              where: { technicianServiceId: { in: technicianServiceIds }, deletedAt: null },
              _count: { _all: true }
            })
          : []
      ]);
    const mineKeys = new Set(
      mine.map((favorite) =>
        favorite.shopId !== null
          ? `shop:${favorite.shopId}`
          : favorite.technicianProfileId !== null
            ? `technician:${favorite.technicianProfileId}`
            : favorite.serviceId !== null
              ? `service:${favorite.serviceId}`
              : `technician_service:${favorite.technicianServiceId}`
      )
    );
    const shopCountById = new Map(
      shopCounts.flatMap((count) =>
        count.shopId === null ? [] : [[count.shopId, count._count._all] as const]
      )
    );
    const technicianCountById = new Map(
      technicianCounts.flatMap((count) =>
        count.technicianProfileId === null
          ? []
          : [[count.technicianProfileId, count._count._all] as const]
      )
    );
    const serviceCountById = new Map(
      serviceCounts.flatMap((count) =>
        count.serviceId === null ? [] : [[count.serviceId, count._count._all] as const]
      )
    );
    const technicianServiceCountById = new Map(
      technicianServiceCounts.flatMap((count) =>
        count.technicianServiceId === null
          ? []
          : [[count.technicianServiceId, count._count._all] as const]
      )
    );

    return targets.map((target) => {
      const internalId = resolvedInternalId(target);
      const key = `${target.targetType}:${internalId}`;
      return {
        targetType: target.targetType,
        publicId: target.publicId,
        isFavorited: mineKeys.has(key),
        favoriteCount:
          target.targetType === "shop"
            ? (shopCountById.get(target.shopId as number) ?? 0)
            : target.targetType === "technician"
              ? (technicianCountById.get(target.technicianProfileId as number) ?? 0)
              : target.targetType === "service"
                ? (serviceCountById.get(target.serviceId as number) ?? 0)
                : (technicianServiceCountById.get(target.technicianServiceId as number) ?? 0)
      };
    });
  }

  private shareReceipt(
    target: ResolvedEntityTarget,
    eventId: number,
    messageId: number | null,
    shareCount: number,
    replayed: boolean
  ): EntityShareReceipt {
    return {
      targetType: target.targetType,
      publicId: target.publicId,
      eventId,
      messageId,
      shareCount,
      replayed
    };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
  }
}
