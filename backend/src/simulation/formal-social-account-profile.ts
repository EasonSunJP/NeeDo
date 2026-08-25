import type { Prisma } from "@prisma/client";

import type { SocialSimulationAccount } from "./social-simulation-plan";

const syncCustomerAvatar = async (
  tx: Prisma.TransactionClient,
  customerProfileId: number,
  account: SocialSimulationAccount
): Promise<void> => {
  const updated = await tx.mediaAsset.updateMany({
    where: { customerProfileId, usageType: "avatar" },
    data: {
      entityType: "customer",
      entityId: customerProfileId,
      url: account.avatarUrl,
      altText: `${account.displayName} avatar`,
      isActive: true,
      deletedAt: null
    }
  });
  if (updated.count === 0) {
    await tx.mediaAsset.create({
      data: {
        entityType: "customer",
        entityId: customerProfileId,
        customerProfileId,
        url: account.avatarUrl,
        usageType: "avatar",
        altText: `${account.displayName} avatar`
      }
    });
  }
};

const syncTechnicianAvatar = async (
  tx: Prisma.TransactionClient,
  technicianProfileId: number,
  account: SocialSimulationAccount
): Promise<void> => {
  const updated = await tx.mediaAsset.updateMany({
    where: { technicianProfileId, usageType: "avatar" },
    data: {
      entityType: "technician",
      entityId: technicianProfileId,
      url: account.avatarUrl,
      altText: `${account.displayName} avatar`,
      isActive: true,
      deletedAt: null
    }
  });
  if (updated.count === 0) {
    await tx.mediaAsset.create({
      data: {
        entityType: "technician",
        entityId: technicianProfileId,
        technicianProfileId,
        url: account.avatarUrl,
        usageType: "avatar",
        altText: `${account.displayName} avatar`
      }
    });
  }
};

export const syncFormalSocialAccountProfile = async (
  tx: Prisma.TransactionClient,
  userId: number,
  account: SocialSimulationAccount
): Promise<number | null> => {
  if (account.socialType === "user") {
    const bio =
      account.email === "customer@example.com"
        ? "福岡で働く会社員です。休日はカフェ巡りと温泉、気になるウェルネスサービスを楽しんでいます。"
        : `${account.displayName}です。日々の暮らしで見つけたお気に入りのサービスや場所を紹介します。`;
    const profile = await tx.customerProfile.upsert({
      where: { userId },
      create: {
        userId,
        displayName: account.displayName,
        bio,
        city: "Tokyo",
        membershipLevel: "standard",
        isPublic: true
      },
      update: {
        displayName: account.displayName,
        bio,
        isPublic: true,
        deletedAt: null
      }
    });
    await syncCustomerAvatar(tx, profile.id, account);
    const identity = await tx.userIdentity.findFirst({
      where: { userId, type: "customer", scopeType: "customer_profile" }
    });
    if (identity) {
      await tx.userIdentity.update({
        where: { id: identity.id },
        data: {
          scopeId: profile.id,
          displayName: account.displayName,
          isActive: true,
          deletedAt: null
        }
      });
    } else {
      await tx.userIdentity.create({
        data: {
          userId,
          type: "customer",
          scopeType: "customer_profile",
          scopeId: profile.id,
          displayName: account.displayName,
          isDefault: account.accountType === "customer",
          isActive: true
        }
      });
    }
    return profile.id;
  }

  if (account.socialType === "technician") {
    const profile = await tx.technicianProfile.findFirst({
      where: { userId, deletedAt: null },
      select: { id: true }
    });
    await tx.technicianProfile.updateMany({
      where: { userId, deletedAt: null },
      data: { displayName: account.displayName }
    });
    if (profile) await syncTechnicianAvatar(tx, profile.id, account);
  }

  return null;
};
