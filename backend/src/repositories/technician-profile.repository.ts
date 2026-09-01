import type { Prisma, PrismaClient } from "@prisma/client";
import { ERROR_CODES } from "../constants/error-codes";
import { prisma } from "../prisma/client";
import { AppError } from "../utils/app-error";
import {
  toAuditLogCreateData,
  type AuditLogCreateInput
} from "./audit-log.repository";
import { persistIdentityAvatar } from "./identity-avatar.repository";

export type TechnicianPaymentMethod =
  | "platform"
  | "offline"
  | "prepay"
  | "cash"
  | "paypay"
  | "paypal"
  | "wechatpay"
  | "alipay";
export type TechnicianProfileVisibility = "public" | "privateAll" | "limited" | "network";
export type TechnicianEmploymentTypePayload = "independent" | "full_time" | "temporary";
export type TechnicianServiceBase = { latitude: number; longitude: number } | null;

export interface TechnicianProfileMutation {
  displayName?: string;
  age?: number | null;
  heightCm?: number | null;
  languages?: string[];
  bio?: string | null;
  serviceAreas?: string[];
  profileTags?: string[];
  canServeForeigners?: boolean;
  bidBudgetMinJpy?: number | null;
  bidBudgetMaxJpy?: number | null;
  paymentMethods?: TechnicianPaymentMethod[];
  serviceBase?: TechnicianServiceBase;
  visibility?: TechnicianProfileVisibility;
  avatar?: { url: string; mimeType: string };
}

export interface TechnicianProfilePayload {
  id: number;
  publicId: string;
  userId: number;
  shopId: number | null;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  city: string;
  age: number | null;
  heightCm: number | null;
  languages: string[];
  serviceAreas: string[];
  profileTags: string[];
  canServeForeigners: boolean;
  bidBudgetMinJpy: number | null;
  bidBudgetMaxJpy: number | null;
  paymentMethods: TechnicianPaymentMethod[];
  serviceBase: TechnicianServiceBase;
  visibility: TechnicianProfileVisibility;
  employmentType: TechnicianEmploymentTypePayload;
  yearsExperience: number;
  createdAt: string;
  updatedAt: string;
}

export interface TechnicianProfileRepositoryPort {
  findMine(userId: number, profileId: number): Promise<TechnicianProfilePayload | null>;
  updateMine(
    userId: number,
    profileId: number,
    ownerIdentityId: number,
    mutation: TechnicianProfileMutation,
    auditLog: AuditLogCreateInput
  ): Promise<TechnicianProfilePayload>;
}

const profileInclude = {
  mediaAssets: {
    where: { usageType: "avatar", isActive: true, deletedAt: null },
    orderBy: { id: "desc" as const },
    take: 1
  },
  user: {
    select: {
      avatarBootstrapUrl: true,
      identities: {
        where: { type: { in: ["technician", "service", "s"] }, isActive: true, deletedAt: null },
        include: { publicIdentifier: true },
        orderBy: [{ isDefault: "desc" as const }, { id: "asc" as const }]
      }
    }
  }
} satisfies Prisma.TechnicianProfileInclude;

type TechnicianProfileRecord = Prisma.TechnicianProfileGetPayload<{
  include: typeof profileInclude;
}>;

export class TechnicianProfileRepository implements TechnicianProfileRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async findMine(
    userId: number,
    profileId: number
  ): Promise<TechnicianProfilePayload | null> {
    const profile = await this.client.technicianProfile.findFirst({
      where: { id: profileId, userId, deletedAt: null },
      include: profileInclude
    });
    return profile ? this.mapProfile(profile) : null;
  }

  public async updateMine(
    userId: number,
    profileId: number,
    ownerIdentityId: number,
    mutation: TechnicianProfileMutation,
    auditLog: AuditLogCreateInput
  ): Promise<TechnicianProfilePayload> {
    const profile = await this.client.$transaction(async (transaction) => {
      const current = await transaction.technicianProfile.findFirst({
        where: { id: profileId, userId, deletedAt: null }
      });
      if (!current) throw this.notFound();

      await transaction.technicianProfile.update({
        where: { id: current.id },
        data: this.profileData(mutation)
      });

      if (mutation.avatar) {
        await persistIdentityAvatar(transaction, {
          avatar: mutation.avatar,
          capturedAt: new Date(),
          identityId: ownerIdentityId,
          source: { kind: "technician", profileId },
          userId
        });
      }

      await transaction.auditLog.create({ data: toAuditLogCreateData(auditLog) });
      return transaction.technicianProfile.findUniqueOrThrow({
        where: { id: current.id },
        include: profileInclude
      });
    });

    return this.mapProfile(profile);
  }

  private profileData(mutation: TechnicianProfileMutation): Prisma.TechnicianProfileUpdateInput {
    return {
      ...(mutation.displayName !== undefined ? { displayName: mutation.displayName } : {}),
      ...(mutation.age !== undefined ? { age: mutation.age } : {}),
      ...(mutation.heightCm !== undefined ? { heightCm: mutation.heightCm } : {}),
      ...(mutation.languages !== undefined ? { languages: mutation.languages } : {}),
      ...(mutation.bio !== undefined ? { bio: mutation.bio } : {}),
      ...(mutation.serviceAreas !== undefined
        ? {
            serviceAreasJson: mutation.serviceAreas,
            serviceArea: mutation.serviceAreas.join(", ") || null
          }
        : {}),
      ...(mutation.profileTags !== undefined ? { profileTags: mutation.profileTags } : {}),
      ...(mutation.canServeForeigners !== undefined
        ? { canServeForeigners: mutation.canServeForeigners }
        : {}),
      ...(mutation.bidBudgetMinJpy !== undefined
        ? { bidBudgetMinJpy: mutation.bidBudgetMinJpy }
        : {}),
      ...(mutation.bidBudgetMaxJpy !== undefined
        ? { bidBudgetMaxJpy: mutation.bidBudgetMaxJpy }
        : {}),
      ...(mutation.paymentMethods !== undefined ? { paymentMethods: mutation.paymentMethods } : {}),
      ...(mutation.serviceBase !== undefined
        ? {
            baseLatitude: mutation.serviceBase?.latitude ?? null,
            baseLongitude: mutation.serviceBase?.longitude ?? null
          }
        : {}),
      ...(mutation.visibility !== undefined ? { visibility: mutation.visibility } : {})
    };
  }

  private mapProfile(profile: TechnicianProfileRecord): TechnicianProfilePayload {
    const publicId = profile.user.identities
      .map((identity) => identity.publicIdentifier)
      .find((identifier) => identifier?.kind === "S" && identifier.status === "ACTIVE" && !identifier.deletedAt)
      ?.publicId;
    if (!publicId) {
      throw new AppError({
        code: ERROR_CODES.INTERNAL,
        message: "error.identifier.service_unavailable",
        statusCode: 500
      });
    }

    return {
      id: profile.id,
      publicId,
      userId: profile.userId,
      shopId: profile.shopId,
      displayName: profile.displayName,
      avatarUrl: profile.mediaAssets[0]?.url ?? profile.user.avatarBootstrapUrl ?? null,
      bio: profile.bio,
      city: profile.city,
      age: profile.age,
      heightCm: profile.heightCm === null ? null : Number(profile.heightCm),
      languages: this.stringArray(profile.languages, "languages"),
      serviceAreas: this.stringArray(profile.serviceAreasJson, "service_areas"),
      profileTags: this.stringArray(profile.profileTags, "profile_tags"),
      canServeForeigners: profile.canServeForeigners,
      bidBudgetMinJpy: profile.bidBudgetMinJpy,
      bidBudgetMaxJpy: profile.bidBudgetMaxJpy,
      paymentMethods: this.paymentMethodArray(profile.paymentMethods),
      serviceBase:
        profile.baseLatitude === null || profile.baseLongitude === null
          ? null
          : {
              latitude: Number(profile.baseLatitude),
              longitude: Number(profile.baseLongitude)
            },
      visibility: this.visibility(profile.visibility),
      employmentType: profile.employmentType === "FULL_TIME"
        ? "full_time"
        : profile.employmentType === "TEMPORARY"
          ? "temporary"
          : "independent",
      yearsExperience: profile.yearsExperience,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString()
    };
  }

  private stringArray(value: Prisma.JsonValue | null, field: string): string[] {
    if (value === null) return [];
    if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value;
    throw new AppError({
      code: ERROR_CODES.INTERNAL,
      message: `error.technician_profile.${field}_invalid`,
      statusCode: 500
    });
  }

  private paymentMethodArray(value: Prisma.JsonValue | null): TechnicianPaymentMethod[] {
    const items = this.stringArray(value, "payment_methods");
    const allowed = new Set<TechnicianPaymentMethod>([
      "platform",
      "offline",
      "prepay",
      "cash",
      "paypay",
      "paypal",
      "wechatpay",
      "alipay"
    ]);
    if (items.every((item) => allowed.has(item as TechnicianPaymentMethod))) {
      return items as TechnicianPaymentMethod[];
    }
    throw new AppError({
      code: ERROR_CODES.INTERNAL,
      message: "error.technician_profile.payment_methods_invalid",
      statusCode: 500
    });
  }

  private visibility(value: string): TechnicianProfileVisibility {
    return value === "privateAll" || value === "limited" || value === "network"
      ? value
      : "public";
  }

  private notFound(): AppError {
    return new AppError({
      code: ERROR_CODES.NOT_FOUND,
      message: "error.technician_profile.not_found",
      statusCode: 404
    });
  }
}
