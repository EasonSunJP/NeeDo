import type { PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import { toAuditLogCreateData } from "./audit-log.repository";
import type {
  ShopVisibilityPayload,
  ShopVisibilityRepositoryPort,
  ShopVisibilityUpdateInput
} from "../services/shop-visibility.service";
import {
  FORMAL_DIRECT_SHOP_MERCHANT_IDENTITY_TYPES,
  FORMAL_MERCHANT_ACCOUNT_IDENTITY_TYPES
} from "../services/merchant-shop-scope";

export const SHOP_VISIBILITIES = ["public", "privateAll", "limited", "network"] as const;
export type ShopVisibility = (typeof SHOP_VISIBILITIES)[number];

export interface ShopVisibilityViewer {
  userId: number;
  identityId?: number;
  identityType?: string;
  identityScopeType?: string | null;
  identityScopeId?: number | null;
}

interface ShopVisibilityTarget {
  id: number;
  ownerUserId: number | null;
  visibility: string;
}

const CUSTOMER_IDENTITY_TYPES = new Set(["customer", "user", "u"]);

export class ShopVisibilityRepository implements ShopVisibilityRepositoryPort {
  public constructor(
    private readonly client: PrismaClient = prisma,
    private readonly clock: () => Date = () => new Date()
  ) {}

  public async buildVisibilityWhere(viewer?: ShopVisibilityViewer): Promise<Record<string, unknown>> {
    if (!viewer) return { visibility: "public" };
    const now = this.clock();
    const resolvedViewer = await this.resolveViewerIdentity(viewer);
    const [friendShopIds, businessContactShopIds] = resolvedViewer.identityId
      ? await Promise.all([
          this.findContactShopIds(resolvedViewer.identityId, true),
          this.findContactShopIds(resolvedViewer.identityId, false)
        ])
      : [[], []];
    const networkRelationships: Record<string, unknown>[] = [];

    if (
      CUSTOMER_IDENTITY_TYPES.has(resolvedViewer.identityType ?? "") &&
      resolvedViewer.identityScopeType === "customer_profile" &&
      resolvedViewer.identityScopeId
    ) {
      networkRelationships.push(
        {
          customerMemberships: {
            some: {
              customerProfileId: resolvedViewer.identityScopeId,
              status: "ACTIVE",
              activeKey: { not: null },
              endedAt: null,
              deletedAt: null
            }
          }
        },
        {
          bookingOrders: {
            some: { customerUserId: resolvedViewer.userId, status: { not: "CANCELLED" }, deletedAt: null }
          }
        }
      );
    }
    if (
      resolvedViewer.identityType === "technician" &&
      resolvedViewer.identityScopeType === "technician_profile" &&
      resolvedViewer.identityScopeId
    ) {
      networkRelationships.push({
        technicianShopAffiliations: {
          some: {
            technicianProfileId: resolvedViewer.identityScopeId,
            workStatus: "ACTIVE",
            activeKey: { not: null },
            startsAt: { lte: now },
            OR: [{ endsAt: null }, { endsAt: { gt: now } }],
            deletedAt: null
          }
        }
      });
    }
    const identityType = resolvedViewer.identityType ?? "";
    if (
      FORMAL_DIRECT_SHOP_MERCHANT_IDENTITY_TYPES.has(identityType) &&
      resolvedViewer.identityScopeType === "shop" &&
      resolvedViewer.identityScopeId
    ) {
      networkRelationships.push({ id: resolvedViewer.identityScopeId });
    }
    if (
      FORMAL_MERCHANT_ACCOUNT_IDENTITY_TYPES.has(identityType) &&
      (resolvedViewer.identityScopeType === "merchant_account" || resolvedViewer.identityScopeType === "merchant") &&
      resolvedViewer.identityScopeId
    ) {
      networkRelationships.push({
        merchantMemberships: {
          some: {
            merchantAccountId: resolvedViewer.identityScopeId,
            startsAt: { lte: now },
            OR: [{ endsAt: null }, { endsAt: { gt: now } }],
            deletedAt: null
          }
        }
      });
    }
    if (resolvedViewer.identityType === "scout") {
      networkRelationships.push({
        agentShopReferrals: {
          some: {
            status: { in: ["ACTIVE", "QUALIFIED"] },
            deletedAt: null,
            agentProfile: {
              is: {
                userId: resolvedViewer.userId,
                partnerType: "AGENT",
                activatedAt: { lte: now },
                OR: [{ endsAt: null }, { endsAt: { gt: now } }],
                deletedAt: null
              }
            }
          }
        }
      });
    }

    return {
      OR: [
        { visibility: "public" },
        { ownerUserId: resolvedViewer.userId },
        ...(friendShopIds.length > 0
          ? [{ visibility: { in: ["limited", "network"] }, id: { in: friendShopIds } }]
          : []),
        {
          visibility: "network",
          OR: [
            ...(businessContactShopIds.length > 0
              ? [{ id: { in: businessContactShopIds } }]
              : []),
            ...networkRelationships
          ]
        }
      ]
    };
  }

  public async canView(shopId: number, viewer?: ShopVisibilityViewer): Promise<boolean> {
    const findShop = this.client.shop.findFirst as unknown as (
      args: Record<string, unknown>
    ) => Promise<ShopVisibilityTarget | null>;
    const target = await findShop({
      where: {
        id: shopId,
        status: "published",
        deletedAt: null,
        ...(await this.buildVisibilityWhere(viewer))
      },
      select: { id: true, ownerUserId: true, visibility: true }
    });
    return target !== null;
  }

  public async findVisibility(shopId: number): Promise<ShopVisibilityPayload | null> {
    const findShop = this.client.shop.findFirst as unknown as (
      args: Record<string, unknown>
    ) => Promise<{
      id: number;
      visibility: ShopVisibility;
      visibilityUpdatedAt: Date | null;
      visibilityUpdatedBy: number | null;
    } | null>;
    const shop = await findShop({
      where: { id: shopId, deletedAt: null },
      select: {
        id: true,
        visibility: true,
        visibilityUpdatedAt: true,
        visibilityUpdatedBy: true
      }
    });
    return shop
      ? {
          shopId: shop.id,
          visibility: shop.visibility,
          updatedAt: shop.visibilityUpdatedAt,
          updatedBy: shop.visibilityUpdatedBy
        }
      : null;
  }

  public async updateVisibility(
    input: ShopVisibilityUpdateInput
  ): Promise<ShopVisibilityPayload | null> {
    return this.client.$transaction(async (transaction) => {
      const shopClient = transaction.shop as unknown as {
        updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
        findUnique(args: Record<string, unknown>): Promise<{
          id: number;
          visibility: ShopVisibility;
          visibilityUpdatedAt: Date | null;
          visibilityUpdatedBy: number | null;
        } | null>;
      };
      const current = await shopClient.findUnique({
        where: { id: input.shopId },
        select: { id: true, visibility: true }
      });
      if (!current) return null;
      const result = await shopClient.updateMany({
        where: { id: input.shopId, deletedAt: null },
        data: {
          visibility: input.visibility,
          visibilityUpdatedAt: input.updatedAt,
          visibilityUpdatedBy: input.actorUserId
        }
      });
      if (result.count !== 1) return null;
      await transaction.auditLog.create({
        data: toAuditLogCreateData({
          ...input.auditLog,
          metadata: {
            previousVisibility: current.visibility,
            nextVisibility: input.visibility
          }
        })
      });
      const shop = await shopClient.findUnique({
        where: { id: input.shopId },
        select: {
          id: true,
          visibility: true,
          visibilityUpdatedAt: true,
          visibilityUpdatedBy: true
        }
      });
      return shop
        ? {
            shopId: shop.id,
            visibility: shop.visibility,
            updatedAt: shop.visibilityUpdatedAt,
            updatedBy: shop.visibilityUpdatedBy
          }
        : null;
    });
  }

  public async canViewTarget(
    target: ShopVisibilityTarget,
    viewer?: ShopVisibilityViewer
  ): Promise<boolean> {
    return this.canView(target.id, viewer);
  }

  private async resolveViewerIdentity(viewer: ShopVisibilityViewer): Promise<ShopVisibilityViewer> {
    if (
      !viewer.identityId ||
      (viewer.identityType !== undefined &&
        viewer.identityScopeType !== undefined &&
        viewer.identityScopeId !== undefined)
    ) {
      return viewer;
    }
    const identity = await this.client.userIdentity.findFirst({
      where: { id: viewer.identityId, userId: viewer.userId, isActive: true, deletedAt: null },
      select: { id: true, type: true, scopeType: true, scopeId: true }
    });
    return identity
      ? {
          ...viewer,
          identityType: identity.type,
          identityScopeType: identity.scopeType,
          identityScopeId: identity.scopeId
        }
      : viewer;
  }

  private async findContactShopIds(
    viewerIdentityId: number,
    reciprocalFriend: boolean
  ): Promise<number[]> {
    const identities = await this.client.userIdentity.findMany({
      where: {
        type: { in: [...FORMAL_DIRECT_SHOP_MERCHANT_IDENTITY_TYPES] },
        scopeType: "shop",
        scopeId: { not: null },
        isActive: true,
        deletedAt: null,
        ...(reciprocalFriend
          ? {
              ownedContacts: {
                some: {
                  contactIdentityId: viewerIdentityId,
                  source: "friend_request",
                  blockedAt: null,
                  deletedAt: null
                }
              },
              contactTargets: {
                some: {
                  ownerIdentityId: viewerIdentityId,
                  source: "friend_request",
                  blockedAt: null,
                  deletedAt: null
                }
              }
            }
          : {
              OR: [
                {
                  ownedContacts: {
                    some: {
                      contactIdentityId: viewerIdentityId,
                      source: { not: "friend_request" },
                      blockedAt: null,
                      deletedAt: null
                    }
                  }
                },
                {
                  contactTargets: {
                    some: {
                      ownerIdentityId: viewerIdentityId,
                      source: { not: "friend_request" },
                      blockedAt: null,
                      deletedAt: null
                    }
                  }
                }
              ]
            })
      },
      select: { scopeId: true }
    });
    return identities.flatMap((identity) =>
      identity.scopeId === null ? [] : [identity.scopeId]
    );
  }
}
