import type { Prisma } from "@prisma/client";

export type IdentityAvatarSource =
  | { kind: "customer"; profileId: number }
  | { kind: "technician"; profileId: number }
  | { kind: "shop"; shopId: number };

export interface IdentityAvatarMutation {
  avatar: { mimeType: string; url: string };
  capturedAt: Date;
  identityId: number;
  source: IdentityAvatarSource;
  userId: number;
}

export async function persistIdentityAvatar(
  transaction: Prisma.TransactionClient,
  input: IdentityAvatarMutation
): Promise<{ establishedBootstrap: boolean }> {
  const bootstrap = await transaction.user.updateMany({
    where: { avatarBootstrapUrl: null, id: input.userId },
    data: {
      avatarBootstrappedAt: input.capturedAt,
      avatarBootstrapUrl: input.avatar.url,
      avatarUrl: input.avatar.url
    }
  });

  if (bootstrap.count === 0 && input.source.kind === "customer") {
    await transaction.user.update({
      where: { id: input.userId },
      data: { avatarUrl: input.avatar.url }
    });
  }

  const sourceWhere = input.source.kind === "customer"
    ? { customerProfileId: input.source.profileId }
    : input.source.kind === "technician"
      ? { technicianProfileId: input.source.profileId }
      : { shopId: input.source.shopId };
  const entityType = input.source.kind === "customer"
    ? "customer_profile"
    : input.source.kind === "technician"
      ? "technician_profile"
      : "shop";
  const entityId = input.source.kind === "shop" ? input.source.shopId : input.source.profileId;

  await transaction.mediaAsset.updateMany({
    where: {
      ...sourceWhere,
      deletedAt: null,
      isActive: true,
      usageType: "avatar"
    },
    data: { isActive: false }
  });
  await transaction.mediaAsset.create({
    data: {
      ...sourceWhere,
      entityId,
      entityType,
      mimeType: input.avatar.mimeType,
      ownerIdentityId: input.identityId,
      ownerUserId: input.userId,
      url: input.avatar.url,
      usageType: "avatar"
    }
  });

  return { establishedBootstrap: bootstrap.count === 1 };
}
