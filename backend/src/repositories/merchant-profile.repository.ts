import type { Prisma, PrismaClient } from "@prisma/client";
import { ERROR_CODES } from "../constants/error-codes";
import { prisma } from "../prisma/client";
import { AppError } from "../utils/app-error";
import { toAuditLogCreateData, type AuditLogCreateInput } from "./audit-log.repository";
import { persistIdentityAvatar } from "./identity-avatar.repository";

export type MerchantProfileGender = "female" | "male" | "private";
export type MerchantProfileVisibility = "public" | "privateAll" | "limited" | "network";

export interface MerchantProfileMutation {
  displayName?: string;
  gender?: MerchantProfileGender;
  age?: number | null;
  heightCm?: number | null;
  languages?: string[];
  bio?: string | null;
  visibility?: MerchantProfileVisibility;
  avatar?: { url: string; mimeType: string };
}

export interface MerchantProfilePayload {
  id: number;
  publicId: string;
  userId: number;
  identityId: number;
  displayName: string;
  avatarUrl: string | null;
  gender: MerchantProfileGender;
  age: number | null;
  heightCm: number | null;
  languages: string[];
  bio: string | null;
  visibility: MerchantProfileVisibility;
  createdAt: string;
  updatedAt: string;
}

export interface MerchantProfileRepositoryPort {
  findMine(userId: number, identityId: number): Promise<MerchantProfilePayload | null>;
  updateMine(
    userId: number,
    identityId: number,
    mutation: MerchantProfileMutation,
    auditLog: AuditLogCreateInput
  ): Promise<MerchantProfilePayload>;
}

const profileInclude = {
  identity: { include: { publicIdentifier: true } },
  user: { select: { avatarBootstrapUrl: true } }
} satisfies Prisma.MerchantIdentityProfileInclude;

type MerchantProfileRecord = Prisma.MerchantIdentityProfileGetPayload<{
  include: typeof profileInclude;
}>;

type AvatarReader = Pick<Prisma.TransactionClient, "mediaAsset">;

export class MerchantProfileRepository implements MerchantProfileRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async findMine(
    userId: number,
    identityId: number
  ): Promise<MerchantProfilePayload | null> {
    const profile = await this.client.merchantIdentityProfile.findFirst({
      where: { userId, identityId, deletedAt: null },
      include: profileInclude
    });
    if (!profile) return null;
    return this.mapProfile(profile, await this.findAvatar(this.client, profile));
  }

  public async updateMine(
    userId: number,
    identityId: number,
    mutation: MerchantProfileMutation,
    auditLog: AuditLogCreateInput
  ): Promise<MerchantProfilePayload> {
    const result = await this.client.$transaction(async (transaction) => {
      const current = await transaction.merchantIdentityProfile.findFirst({
        where: { userId, identityId, deletedAt: null }
      });
      if (!current) throw this.notFound();

      await transaction.merchantIdentityProfile.update({
        where: { id: current.id },
        data: this.profileData(mutation)
      });
      if (mutation.avatar) {
        await persistIdentityAvatar(transaction, {
          avatar: mutation.avatar,
          capturedAt: new Date(),
          identityId,
          source: { kind: "merchant", profileId: current.id },
          userId
        });
      }
      await transaction.auditLog.create({ data: toAuditLogCreateData(auditLog) });
      const profile = await transaction.merchantIdentityProfile.findUniqueOrThrow({
        where: { id: current.id },
        include: profileInclude
      });
      return { profile, avatarUrl: await this.findAvatar(transaction, profile) };
    });

    return this.mapProfile(result.profile, result.avatarUrl);
  }

  private profileData(
    mutation: MerchantProfileMutation
  ): Prisma.MerchantIdentityProfileUpdateInput {
    return {
      ...(mutation.displayName !== undefined ? { displayName: mutation.displayName } : {}),
      ...(mutation.gender !== undefined ? { gender: mutation.gender } : {}),
      ...(mutation.age !== undefined ? { age: mutation.age } : {}),
      ...(mutation.heightCm !== undefined ? { heightCm: mutation.heightCm } : {}),
      ...(mutation.languages !== undefined ? { languages: mutation.languages } : {}),
      ...(mutation.bio !== undefined ? { bio: mutation.bio } : {}),
      ...(mutation.visibility !== undefined ? { visibility: mutation.visibility } : {})
    };
  }

  private async findAvatar(
    client: AvatarReader,
    profile: MerchantProfileRecord
  ): Promise<string | null> {
    const avatar = await client.mediaAsset.findFirst({
      where: {
        entityId: profile.id,
        entityType: "merchant_identity_profile",
        ownerIdentityId: profile.identityId,
        ownerUserId: profile.userId,
        usageType: "avatar",
        isActive: true,
        deletedAt: null
      },
      orderBy: { id: "desc" },
      select: { url: true }
    });
    return avatar?.url ?? profile.user.avatarBootstrapUrl ?? null;
  }

  private mapProfile(
    profile: MerchantProfileRecord,
    avatarUrl: string | null
  ): MerchantProfilePayload {
    const identifier = profile.identity.publicIdentifier;
    if (!identifier || identifier.status !== "ACTIVE" || identifier.deletedAt) {
      throw new AppError({
        code: ERROR_CODES.INTERNAL,
        message: "error.identifier.merchant_unavailable",
        statusCode: 500
      });
    }
    return {
      id: profile.id,
      publicId: identifier.publicId,
      userId: profile.userId,
      identityId: profile.identityId,
      displayName: profile.displayName,
      avatarUrl,
      gender: profile.gender === "female" || profile.gender === "male" ? profile.gender : "private",
      age: profile.age,
      heightCm: profile.heightCm === null ? null : Number(profile.heightCm),
      languages: this.stringArray(profile.languages),
      bio: profile.bio,
      visibility: this.visibility(profile.visibility),
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString()
    };
  }

  private stringArray(value: Prisma.JsonValue | null): string[] {
    if (value === null) return [];
    if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value;
    throw new AppError({
      code: ERROR_CODES.INTERNAL,
      message: "error.merchant_profile.languages_invalid",
      statusCode: 500
    });
  }

  private visibility(value: string): MerchantProfileVisibility {
    return value === "privateAll" || value === "limited" || value === "network" ? value : "public";
  }

  private notFound(): AppError {
    return new AppError({
      code: ERROR_CODES.NOT_FOUND,
      message: "error.merchant_profile.not_found",
      statusCode: 404
    });
  }
}
