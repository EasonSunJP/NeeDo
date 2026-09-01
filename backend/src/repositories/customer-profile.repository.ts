import type {
  CustomerProfile,
  MediaAsset,
  Prisma,
  PrismaClient,
  UserExperienceAccount
} from "@prisma/client";
import { prisma } from "../prisma/client";
import {
  toAuditLogCreateData,
  type AuditLogCreateInput
} from "./audit-log.repository";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import { resolveEffectiveCustomerMembershipLevel } from "../services/customer-membership.service";
import { persistIdentityAvatar } from "./identity-avatar.repository";

export interface CustomerProfileMutation {
  displayName?: string;
  gender?: "female" | "male" | "private";
  age?: number | null;
  heightCm?: number | null;
  languages?: string[];
  bio?: string | null;
  visibility?: "public" | "privateAll" | "limited" | "network";
  isPublic?: boolean;
  avatar?: { url: string; mimeType: string };
}

export interface CustomerProfilePayload {
  id: number;
  publicId: string;
  userId: number;
  displayName: string;
  city: string | null;
  membershipLevel: string;
  level: number;
  avatarUrl: string | null;
  gender: "female" | "male" | "private";
  age: number | null;
  heightCm: number | null;
  languages: string[];
  bio: string | null;
  visibility: "public" | "privateAll" | "limited" | "network";
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerProfileRepositoryPort {
  findMine: (userId: number, profileId: number) => Promise<CustomerProfilePayload | null>;
  updateMine: (
    userId: number,
    profileId: number,
    ownerIdentityId: number,
    mutation: CustomerProfileMutation,
    auditLog: AuditLogCreateInput
  ) => Promise<CustomerProfilePayload>;
}

type CustomerProfileRecord = CustomerProfile & {
  mediaAssets: MediaAsset[];
  user: {
    avatarBootstrapUrl: string | null;
    avatarUrl: string | null;
    experienceAccount: Pick<UserExperienceAccount, "currentLevel" | "deletedAt"> | null;
    needoId: string;
  };
};

export class CustomerProfileRepository implements CustomerProfileRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async findMine(userId: number, profileId: number): Promise<CustomerProfilePayload | null> {
    const profile = await this.client.customerProfile.findFirst({
      where: { id: profileId, userId, deletedAt: null },
      include: {
        mediaAssets: this.avatarMediaInclude(),
        user: {
          select: {
            avatarBootstrapUrl: true,
            avatarUrl: true,
            experienceAccount: { select: { currentLevel: true, deletedAt: true } },
            needoId: true
          }
        }
      }
    });

    return profile ? this.mapProfile(profile) : null;
  }

  public async updateMine(
    userId: number,
    profileId: number,
    ownerIdentityId: number,
    mutation: CustomerProfileMutation,
    auditLog: AuditLogCreateInput
  ): Promise<CustomerProfilePayload> {
    const profile = await this.client.$transaction(async (transaction) => {
      const current = await transaction.customerProfile.findFirst({
        where: { id: profileId, userId, deletedAt: null }
      });

      if (!current) {
        throw this.notFound();
      }

      const updated = await transaction.customerProfile.update({
        where: { id: current.id },
        data: this.profileData(mutation),
        include: {
          mediaAssets: this.avatarMediaInclude(),
          user: {
            select: {
              avatarBootstrapUrl: true,
              avatarUrl: true,
              experienceAccount: { select: { currentLevel: true, deletedAt: true } },
              needoId: true
            }
          }
        }
      });

      if (mutation.avatar) {
        await persistIdentityAvatar(transaction, {
          avatar: mutation.avatar,
          capturedAt: new Date(),
          identityId: ownerIdentityId,
          source: { kind: "customer", profileId },
          userId
        });
      }

      await transaction.auditLog.create({ data: toAuditLogCreateData(auditLog) });

      return transaction.customerProfile.findUniqueOrThrow({
        where: { id: updated.id },
        include: {
          mediaAssets: this.avatarMediaInclude(),
          user: {
            select: {
              avatarBootstrapUrl: true,
              avatarUrl: true,
              experienceAccount: { select: { currentLevel: true, deletedAt: true } },
              needoId: true
            }
          }
        }
      });
    });

    return this.mapProfile(profile);
  }

  private avatarMediaInclude(): Prisma.MediaAssetFindManyArgs {
    return {
      where: { usageType: "avatar", isActive: true, deletedAt: null },
      orderBy: { id: "desc" },
      take: 1
    };
  }

  private profileData(mutation: CustomerProfileMutation): Prisma.CustomerProfileUpdateInput {
    return {
      ...(mutation.displayName !== undefined ? { displayName: mutation.displayName } : {}),
      ...(mutation.gender !== undefined ? { gender: mutation.gender } : {}),
      ...(mutation.age !== undefined ? { age: mutation.age } : {}),
      ...(mutation.heightCm !== undefined ? { heightCm: mutation.heightCm } : {}),
      ...(mutation.languages !== undefined
        ? { languages: this.toJsonStringArray(mutation.languages) }
        : {}),
      ...(mutation.bio !== undefined ? { bio: mutation.bio } : {}),
      ...(mutation.visibility !== undefined ? { visibility: mutation.visibility } : {}),
      ...(mutation.isPublic !== undefined ? { isPublic: mutation.isPublic } : {})
    };
  }

  private mapProfile(profile: CustomerProfileRecord): CustomerProfilePayload {
    return {
      id: profile.id,
      publicId: this.requireCustomerPublicId(profile.user.needoId),
      userId: profile.userId,
      displayName: profile.displayName,
      city: profile.city,
      membershipLevel: resolveEffectiveCustomerMembershipLevel(profile),
      level:
        profile.user.experienceAccount?.deletedAt === null
          ? profile.user.experienceAccount.currentLevel
          : 1,
      avatarUrl:
        profile.user.avatarUrl ??
        profile.mediaAssets[0]?.url ??
        profile.user.avatarBootstrapUrl ??
        null,
      gender: this.toGender(profile.gender),
      age: profile.age,
      heightCm: profile.heightCm === null ? null : Number(profile.heightCm),
      languages: this.fromJsonStringArray(profile.languages),
      bio: profile.bio,
      visibility: this.toVisibility(profile.visibility),
      isPublic: profile.isPublic,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString()
    };
  }

  private requireCustomerPublicId(publicId: string): string {
    if (/^(?:u|needo)\d{10}$/.test(publicId)) {
      return publicId;
    }

    throw new AppError({
      code: ERROR_CODES.INTERNAL,
      message: "error.identifier.primary_unavailable",
      statusCode: 500
    });
  }

  private toJsonStringArray(value: string[]): Prisma.InputJsonValue {
    if (!this.isStringArray(value)) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.customer_profile.languages_invalid",
        statusCode: 400
      });
    }

    return value;
  }

  private fromJsonStringArray(value: Prisma.JsonValue | null): string[] {
    if (value === null) {
      return [];
    }

    if (!this.isStringArray(value)) {
      throw new AppError({
        code: ERROR_CODES.INTERNAL,
        message: "error.customer_profile.languages_invalid",
        statusCode: 500
      });
    }

    return value;
  }

  private isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
  }

  private toGender(value: string): "female" | "male" | "private" {
    return value === "female" || value === "male" ? value : "private";
  }

  private toVisibility(value: string): "public" | "privateAll" | "limited" | "network" {
    if (value === "privateAll" || value === "limited" || value === "network") {
      return value;
    }

    return "public";
  }

  private notFound(): AppError {
    return new AppError({
      code: ERROR_CODES.NOT_FOUND,
      message: "error.customer_profile.not_found",
      statusCode: 404
    });
  }
}
