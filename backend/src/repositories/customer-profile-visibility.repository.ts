import type { PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import { FORMAL_MERCHANT_IDENTITY_TYPES } from "../services/merchant-shop-scope";

export type CustomerProfileVisibility = "public" | "privateAll" | "limited" | "network";

export interface CustomerProfileVisibilityTarget {
  profileId: number;
  userId: number;
  visibility: CustomerProfileVisibility | string;
  isPublic?: boolean;
}

export interface CustomerProfileViewer {
  userId: number;
  identityId?: number;
  identityType?: string;
  identityScopeType?: string | null;
  identityScopeId?: number | null;
}

const CUSTOMER_IDENTITY_TYPES = ["customer", "user", "u"];
const CUSTOMER_VIEWER_IDENTITY_TYPES = new Set(["customer", "user", "u"]);
const AFFILIATE_VIEWER_IDENTITY_TYPES = new Set(["scout", "affiliate", "alliance_marketing"]);
const ACTIVE_ATTRIBUTION_STATUSES = ["ATTRIBUTED", "QUALIFIED", "SETTLED"] as const;

export class CustomerProfileVisibilityRepository {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async canView(
    target: CustomerProfileVisibilityTarget,
    viewer?: CustomerProfileViewer
  ): Promise<boolean> {
    if (target.visibility === "public") return target.isPublic !== false;
    if (!viewer) return false;
    if (viewer.userId === target.userId) return true;
    if (target.visibility === "privateAll") return false;
    if (target.visibility !== "limited" && target.visibility !== "network") return false;

    const resolvedViewer = await this.resolveViewerIdentity(viewer);
    const targetIdentityId = resolvedViewer.identityId
      ? await this.findTargetCustomerIdentityId(target)
      : null;
    if (
      resolvedViewer.identityId &&
      targetIdentityId &&
      (await this.isFriend(targetIdentityId, resolvedViewer.identityId))
    ) {
      return true;
    }
    if (target.visibility === "limited") return false;

    if (
      resolvedViewer.identityId &&
      targetIdentityId &&
      (await this.hasBusinessContact(targetIdentityId, resolvedViewer.identityId))
    ) {
      return true;
    }
    if (await this.hasIntroductionRelationship(target.userId, resolvedViewer)) return true;
    if (await this.hasMerchantRelationship(target, resolvedViewer)) return true;
    return this.hasTechnicianRelationship(target.userId, resolvedViewer);
  }

  private async findTargetCustomerIdentityId(
    target: CustomerProfileVisibilityTarget
  ): Promise<number | null> {
    const targetIdentity = await this.client.userIdentity.findFirst({
      where: {
        userId: target.userId,
        type: { in: CUSTOMER_IDENTITY_TYPES },
        scopeType: "customer_profile",
        scopeId: target.profileId,
        isActive: true,
        deletedAt: null
      },
      select: { id: true }
    });
    return targetIdentity?.id ?? null;
  }

  private async isFriend(targetIdentityId: number, viewerIdentityId: number): Promise<boolean> {
    const reciprocalCount = await this.client.contact.count({
      where: {
        source: "friend_request",
        deletedAt: null,
        blockedAt: null,
        OR: [
          { ownerIdentityId: viewerIdentityId, contactIdentityId: targetIdentityId },
          { ownerIdentityId: targetIdentityId, contactIdentityId: viewerIdentityId }
        ]
      }
    });
    return reciprocalCount === 2;
  }

  private async hasBusinessContact(
    targetIdentityId: number,
    viewerIdentityId: number
  ): Promise<boolean> {
    const contact = await this.client.contact.findFirst({
      where: {
        source: { not: "friend_request" },
        deletedAt: null,
        blockedAt: null,
        OR: [
          { ownerIdentityId: viewerIdentityId, contactIdentityId: targetIdentityId },
          { ownerIdentityId: targetIdentityId, contactIdentityId: viewerIdentityId }
        ]
      },
      select: { id: true }
    });
    return contact !== null;
  }

  private async resolveViewerIdentity(
    viewer: CustomerProfileViewer
  ): Promise<CustomerProfileViewer> {
    if (
      !viewer.identityId ||
      (viewer.identityType !== undefined &&
        viewer.identityScopeType !== undefined &&
        viewer.identityScopeId !== undefined)
    ) {
      return viewer;
    }

    const identity = await this.client.userIdentity.findFirst({
      where: {
        id: viewer.identityId,
        userId: viewer.userId,
        isActive: true,
        deletedAt: null
      },
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

  private async hasIntroductionRelationship(
    targetUserId: number,
    viewer: CustomerProfileViewer
  ): Promise<boolean> {
    const identityType = viewer.identityType ?? "";
    const direction = AFFILIATE_VIEWER_IDENTITY_TYPES.has(identityType)
      ? { claimantUserId: viewer.userId, customerUserId: targetUserId }
      : CUSTOMER_VIEWER_IDENTITY_TYPES.has(identityType)
        ? { claimantUserId: targetUserId, customerUserId: viewer.userId }
        : null;
    if (!direction) return false;

    const attribution = await this.client.affiliateAttribution.findFirst({
      where: {
        deletedAt: null,
        status: { in: [...ACTIVE_ATTRIBUTION_STATUSES] },
        ...direction
      },
      select: { id: true }
    });
    return attribution !== null;
  }

  private async hasMerchantRelationship(
    target: CustomerProfileVisibilityTarget,
    viewer: CustomerProfileViewer
  ): Promise<boolean> {
    if (
      !FORMAL_MERCHANT_IDENTITY_TYPES.has(viewer.identityType ?? "") ||
      viewer.identityScopeType !== "shop" ||
      !viewer.identityScopeId
    ) {
      return false;
    }

    const membership = await this.client.shopCustomerMembership.findFirst({
      where: {
        shopId: viewer.identityScopeId,
        customerProfileId: target.profileId,
        status: "ACTIVE",
        endedAt: null,
        deletedAt: null
      },
      select: { id: true }
    });
    if (membership) return true;

    const booking = await this.client.bookingOrder.findFirst({
      where: {
        customerUserId: target.userId,
        shopId: viewer.identityScopeId,
        deletedAt: null
      },
      select: { id: true }
    });
    return booking !== null;
  }

  private async hasTechnicianRelationship(
    targetUserId: number,
    viewer: CustomerProfileViewer
  ): Promise<boolean> {
    if (
      viewer.identityType !== "technician" ||
      viewer.identityScopeType !== "technician_profile" ||
      !viewer.identityScopeId
    ) {
      return false;
    }

    const booking = await this.client.bookingOrder.findFirst({
      where: {
        customerUserId: targetUserId,
        technicianProfileId: viewer.identityScopeId,
        deletedAt: null
      },
      select: { id: true }
    });
    return booking !== null;
  }
}
