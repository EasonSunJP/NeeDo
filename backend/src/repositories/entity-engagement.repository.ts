import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";

export type EntityTargetType = "shop" | "technician";

export interface EntityTarget {
  targetType: EntityTargetType;
  publicId: string;
}

export interface EntityFavoriteState extends EntityTarget {
  isFavorited: boolean;
  favoriteCount: number;
}

export interface EntityFavoriteListItem extends EntityFavoriteState {
  favoritedAt: Date;
}

export interface EntityFavoriteListInput extends PaginationInput {
  userId: number;
  page: number;
  pageSize: number;
  targetType?: EntityTargetType;
}

export interface EntityEngagementRepositoryPort {
  setFavorite(
    userId: number,
    target: EntityTarget,
    isFavorited: boolean
  ): Promise<EntityFavoriteState | null>;
  getFavoriteStatuses(userId: number, targets: EntityTarget[]): Promise<EntityFavoriteState[]>;
  listFavorites(input: EntityFavoriteListInput): Promise<PaginatedResponse<EntityFavoriteListItem>>;
}

interface ResolvedEntityTarget extends EntityTarget {
  shopId: number | null;
  technicianProfileId: number | null;
}

interface ResolvedFavoriteListTarget extends ResolvedEntityTarget {
  favoritedAt: Date;
}

const activeShopWhere = (publicIds: string[]): Prisma.ShopWhereInput => ({
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
  }
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

const favoriteTargetWhere = (target: ResolvedEntityTarget): Prisma.EntityFavoriteWhereInput =>
  target.targetType === "shop"
    ? { shopId: target.shopId }
    : { technicianProfileId: target.technicianProfileId };

const activeKeyFor = (userId: number, target: ResolvedEntityTarget): string =>
  `${userId}:${target.targetType}:${target.shopId ?? target.technicianProfileId}`;

export class EntityEngagementRepository implements EntityEngagementRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async setFavorite(
    userId: number,
    target: EntityTarget,
    isFavorited: boolean
  ): Promise<EntityFavoriteState | null> {
    const [resolved] = await this.resolveTargets([target]);
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
    targets: EntityTarget[]
  ): Promise<EntityFavoriteState[]> {
    const resolved = await this.resolveTargets(targets);
    return this.readFavoriteStates(userId, resolved);
  }

  public async listFavorites(
    input: EntityFavoriteListInput
  ): Promise<PaginatedResponse<EntityFavoriteListItem>> {
    const pagination = toPrismaPagination(input);
    const shopVisibility: Prisma.EntityFavoriteWhereInput = {
      shop: { is: activeShopWhere([]) }
    };
    const technicianVisibility: Prisma.EntityFavoriteWhereInput = {
      technicianProfile: { is: activeTechnicianWhere([]) }
    };
    const visibility =
      input.targetType === "shop"
        ? [shopVisibility]
        : input.targetType === "technician"
          ? [technicianVisibility]
          : [shopVisibility, technicianVisibility];
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
          shop: { select: { publicIdentifier: { select: { publicId: true } } } },
          technicianProfile: {
            select: {
              user: {
                select: {
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
      if (row.shopId !== null && shopPublicId) {
        resolved.push({
          targetType: "shop" as const,
          publicId: shopPublicId,
          shopId: row.shopId,
          technicianProfileId: null,
          favoritedAt: row.createdAt
        });
        return;
      }
      const technicianPublicId =
        row.technicianProfile?.user.identities[0]?.publicIdentifier?.publicId;
      if (row.technicianProfileId !== null && technicianPublicId) {
        resolved.push({
          targetType: "technician" as const,
          publicId: technicianPublicId,
          shopId: null,
          technicianProfileId: row.technicianProfileId,
          favoritedAt: row.createdAt
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
        return state ? [{ ...state, favoritedAt: item.favoritedAt }] : [];
      }),
      total,
      input
    );
  }

  private async resolveTargets(targets: EntityTarget[]): Promise<ResolvedEntityTarget[]> {
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
    const [shops, technicians] = await Promise.all([
      shopPublicIds.length > 0
        ? this.client.shop.findMany({
            where: activeShopWhere(shopPublicIds),
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
          technicianProfileId: null
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
            technicianProfileId: technician.id
          });
        }
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
    const targetOr: Prisma.EntityFavoriteWhereInput[] = [
      ...(shopIds.length > 0 ? [{ shopId: { in: shopIds } }] : []),
      ...(technicianProfileIds.length > 0
        ? [{ technicianProfileId: { in: technicianProfileIds } }]
        : [])
    ];
    const [mine, shopCounts, technicianCounts] = await Promise.all([
      this.client.entityFavorite.findMany({
        where: { userId, deletedAt: null, OR: targetOr },
        select: { shopId: true, technicianProfileId: true }
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
        : []
    ]);
    const mineKeys = new Set(
      mine.map((favorite) =>
        favorite.shopId !== null
          ? `shop:${favorite.shopId}`
          : `technician:${favorite.technicianProfileId}`
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

    return targets.map((target) => {
      const internalId = target.shopId ?? target.technicianProfileId;
      const key = `${target.targetType}:${internalId}`;
      return {
        targetType: target.targetType,
        publicId: target.publicId,
        isFavorited: mineKeys.has(key),
        favoriteCount:
          target.targetType === "shop"
            ? (shopCountById.get(target.shopId as number) ?? 0)
            : (technicianCountById.get(target.technicianProfileId as number) ?? 0)
      };
    });
  }
}
