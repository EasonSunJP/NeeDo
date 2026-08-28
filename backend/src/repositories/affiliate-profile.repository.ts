import { createHash } from "node:crypto";
import {
  AffiliateChannelPlatform as PrismaAffiliateChannelPlatform,
  AffiliateCooperationStatus as PrismaAffiliateCooperationStatus,
  AffiliateProfileStatus as PrismaAffiliateProfileStatus,
  type PrismaClient
} from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { ERROR_CODES } from "../constants/error-codes";
import { prisma } from "../prisma/client";
import type { AffiliateChannelPlatform } from "../services/affiliate-channel-url.service";
import { AppError } from "../utils/app-error";
import { toAuditLogCreateData, type AuditLogCreateInput } from "./audit-log.repository";

export type AffiliateProfileStatus = "active" | "suspended" | "closed";
export type AffiliateCooperationStatus = "available" | "selective" | "unavailable";

export interface AffiliateProfileChannelPayload {
  channelId: number;
  platform: AffiliateChannelPlatform;
  customLabel: string | null;
  homepageUrl: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface AffiliateProfilePayload {
  profileId: number;
  needoId: string;
  displayName: string;
  avatarUrl: string | null;
  affiliateStatus: AffiliateProfileStatus;
  cooperationStatus: AffiliateCooperationStatus;
  version: number;
  bio: string | null;
  strengths: string[];
  serviceAreas: string[];
  channels: AffiliateProfileChannelPayload[];
  updatedAt: string;
}

export interface AffiliateProfileMutation {
  bio?: string | null;
  strengths?: string[];
  serviceAreas?: string[];
  cooperationStatus?: AffiliateCooperationStatus;
}

export interface AffiliateProfileChannelMutation {
  platform?: AffiliateChannelPlatform;
  customLabel?: string | null;
  homepageUrl?: string;
  sortOrder?: number;
}

export interface AffiliateProfileRepositoryPort {
  findMine: (userId: number) => Promise<AffiliateProfilePayload | null>;
  updateMine: (
    userId: number,
    expectedVersion: number,
    mutation: AffiliateProfileMutation,
    auditLog: AuditLogCreateInput
  ) => Promise<AffiliateProfilePayload>;
  createChannel: (
    userId: number,
    expectedVersion: number,
    mutation: Required<AffiliateProfileChannelMutation>,
    auditLog: AuditLogCreateInput
  ) => Promise<AffiliateProfilePayload>;
  updateChannel: (
    userId: number,
    channelId: number,
    expectedVersion: number,
    mutation: AffiliateProfileChannelMutation,
    auditLog: AuditLogCreateInput
  ) => Promise<AffiliateProfilePayload>;
  deleteChannel: (
    userId: number,
    channelId: number,
    expectedVersion: number,
    auditLog: AuditLogCreateInput
  ) => Promise<AffiliateProfilePayload>;
}

const profileSelect = {
  id: true,
  version: true,
  status: true,
  cooperationStatus: true,
  bio: true,
  strengths: true,
  serviceAreas: true,
  updatedAt: true,
  user: { select: { needoId: true, username: true, avatarUrl: true } },
  channels: {
    where: { deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: {
      id: true,
      platform: true,
      customLabel: true,
      homepageUrl: true,
      sortOrder: true,
      createdAt: true,
      updatedAt: true
    }
  }
} satisfies Prisma.AffiliateProfileSelect;

type AffiliateProfileRecord = Prisma.AffiliateProfileGetPayload<{ select: typeof profileSelect }>;
type TransactionClient = Prisma.TransactionClient;

const platformToPrisma: Record<AffiliateChannelPlatform, PrismaAffiliateChannelPlatform> = {
  x: PrismaAffiliateChannelPlatform.X,
  instagram: PrismaAffiliateChannelPlatform.INSTAGRAM,
  youtube: PrismaAffiliateChannelPlatform.YOUTUBE,
  tiktok: PrismaAffiliateChannelPlatform.TIKTOK,
  custom: PrismaAffiliateChannelPlatform.CUSTOM
};

export class AffiliateProfileRepository implements AffiliateProfileRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async findMine(userId: number): Promise<AffiliateProfilePayload | null> {
    const profile = await this.client.affiliateProfile.findFirst({
      where: { userId, deletedAt: null },
      select: profileSelect
    });
    return profile ? this.mapProfile(profile) : null;
  }

  public updateMine(
    userId: number,
    expectedVersion: number,
    mutation: AffiliateProfileMutation,
    auditLog: AuditLogCreateInput
  ): Promise<AffiliateProfilePayload> {
    return this.client.$transaction(async (transaction) => {
      const current = await this.requireCurrent(transaction, userId, expectedVersion);
      await this.incrementProfileVersion(transaction, userId, current.id, expectedVersion, {
        ...(mutation.bio !== undefined ? { bio: mutation.bio } : {}),
        ...(mutation.strengths !== undefined ? { strengths: mutation.strengths } : {}),
        ...(mutation.serviceAreas !== undefined ? { serviceAreas: mutation.serviceAreas } : {}),
        ...(mutation.cooperationStatus !== undefined
          ? {
              cooperationStatus: this.cooperationStatusToPrisma(mutation.cooperationStatus)
            }
          : {})
      });
      await transaction.auditLog.create({ data: toAuditLogCreateData(auditLog) });
      return this.requireRefreshed(transaction, userId);
    });
  }

  public async createChannel(
    userId: number,
    expectedVersion: number,
    mutation: Required<AffiliateProfileChannelMutation>,
    auditLog: AuditLogCreateInput
  ): Promise<AffiliateProfilePayload> {
    try {
      return await this.client.$transaction(async (transaction) => {
        const current = await this.requireCurrent(transaction, userId, expectedVersion);
        const activeChannels = await transaction.affiliateProfileChannel.count({
          where: { profileId: current.id, deletedAt: null }
        });
        if (activeChannels >= 10) throw this.channelLimit();

        await transaction.affiliateProfileChannel.create({
          data: {
            profileId: current.id,
            platform: platformToPrisma[mutation.platform],
            customLabel: mutation.customLabel,
            homepageUrl: mutation.homepageUrl,
            activeKey: this.activeKey(current.id, mutation.homepageUrl),
            sortOrder: mutation.sortOrder
          }
        });
        await this.incrementProfileVersion(transaction, userId, current.id, expectedVersion, {});
        await transaction.auditLog.create({ data: toAuditLogCreateData(auditLog) });
        return this.requireRefreshed(transaction, userId);
      });
    } catch (error) {
      if (this.isUniqueConflict(error)) throw this.channelConflict();
      throw error;
    }
  }

  public async updateChannel(
    userId: number,
    channelId: number,
    expectedVersion: number,
    mutation: AffiliateProfileChannelMutation,
    auditLog: AuditLogCreateInput
  ): Promise<AffiliateProfilePayload> {
    try {
      return await this.client.$transaction(async (transaction) => {
        const current = await this.requireCurrent(transaction, userId, expectedVersion);
        await this.requireChannel(transaction, current.id, channelId);
        const channelUpdate = await transaction.affiliateProfileChannel.updateMany({
          where: { id: channelId, profileId: current.id, deletedAt: null },
          data: {
            ...(mutation.platform !== undefined
              ? { platform: platformToPrisma[mutation.platform] }
              : {}),
            ...(mutation.customLabel !== undefined ? { customLabel: mutation.customLabel } : {}),
            ...(mutation.homepageUrl !== undefined
              ? {
                  homepageUrl: mutation.homepageUrl,
                  activeKey: this.activeKey(current.id, mutation.homepageUrl)
                }
              : {}),
            ...(mutation.sortOrder !== undefined ? { sortOrder: mutation.sortOrder } : {})
          }
        });
        if (channelUpdate.count !== 1) throw this.notFound();

        await this.incrementProfileVersion(transaction, userId, current.id, expectedVersion, {});
        await transaction.auditLog.create({ data: toAuditLogCreateData(auditLog) });
        return this.requireRefreshed(transaction, userId);
      });
    } catch (error) {
      if (this.isUniqueConflict(error)) throw this.channelConflict();
      throw error;
    }
  }

  public deleteChannel(
    userId: number,
    channelId: number,
    expectedVersion: number,
    auditLog: AuditLogCreateInput
  ): Promise<AffiliateProfilePayload> {
    return this.client.$transaction(async (transaction) => {
      const current = await this.requireCurrent(transaction, userId, expectedVersion);
      await this.requireChannel(transaction, current.id, channelId);
      const deleted = await transaction.affiliateProfileChannel.updateMany({
        where: { id: channelId, profileId: current.id, deletedAt: null },
        data: { activeKey: null, deletedAt: new Date() }
      });
      if (deleted.count !== 1) throw this.notFound();

      await this.incrementProfileVersion(transaction, userId, current.id, expectedVersion, {});
      await transaction.auditLog.create({ data: toAuditLogCreateData(auditLog) });
      return this.requireRefreshed(transaction, userId);
    });
  }

  private async requireCurrent(
    transaction: TransactionClient,
    userId: number,
    expectedVersion: number
  ): Promise<{ id: number; version: number; status: PrismaAffiliateProfileStatus }> {
    const current = await transaction.affiliateProfile.findFirst({
      where: { userId, deletedAt: null },
      select: { id: true, version: true, status: true }
    });
    if (!current || current.status !== PrismaAffiliateProfileStatus.ACTIVE) throw this.notFound();
    if (current.version !== expectedVersion) throw this.versionConflict();
    return current;
  }

  private async requireChannel(
    transaction: TransactionClient,
    profileId: number,
    channelId: number
  ): Promise<void> {
    const channel = await transaction.affiliateProfileChannel.findFirst({
      where: { id: channelId, profileId, deletedAt: null },
      select: { id: true }
    });
    if (!channel) throw this.notFound();
  }

  private async incrementProfileVersion(
    transaction: TransactionClient,
    userId: number,
    profileId: number,
    expectedVersion: number,
    data: Prisma.AffiliateProfileUpdateManyMutationInput
  ): Promise<void> {
    const updated = await transaction.affiliateProfile.updateMany({
      where: { id: profileId, userId, version: expectedVersion, deletedAt: null },
      data: { ...data, version: { increment: 1 } }
    });
    if (updated.count !== 1) throw this.versionConflict();
  }

  private async requireRefreshed(
    transaction: TransactionClient,
    userId: number
  ): Promise<AffiliateProfilePayload> {
    const profile = await transaction.affiliateProfile.findFirst({
      where: { userId, deletedAt: null },
      select: profileSelect
    });
    if (!profile) throw this.notFound();
    return this.mapProfile(profile);
  }

  private mapProfile(profile: AffiliateProfileRecord): AffiliateProfilePayload {
    return {
      profileId: profile.id,
      needoId: profile.user.needoId,
      displayName: profile.user.username,
      avatarUrl: profile.user.avatarUrl,
      affiliateStatus: this.profileStatusFromPrisma(profile.status),
      cooperationStatus: this.cooperationStatusFromPrisma(profile.cooperationStatus),
      version: profile.version,
      bio: profile.bio,
      strengths: this.fromJsonStringArray(profile.strengths),
      serviceAreas: this.fromJsonStringArray(profile.serviceAreas),
      channels: profile.channels.map((channel) => ({
        channelId: channel.id,
        platform: this.platformFromPrisma(channel.platform),
        customLabel: channel.customLabel,
        homepageUrl: channel.homepageUrl,
        sortOrder: channel.sortOrder,
        createdAt: channel.createdAt.toISOString(),
        updatedAt: channel.updatedAt.toISOString()
      })),
      updatedAt: profile.updatedAt.toISOString()
    };
  }

  private activeKey(profileId: number, homepageUrl: string): string {
    return `${profileId}:${createHash("sha256").update(homepageUrl).digest("hex")}`;
  }

  private fromJsonStringArray(value: Prisma.JsonValue | null): string[] {
    if (value === null) return [];
    if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      return value;
    }
    throw new AppError({
      code: ERROR_CODES.INTERNAL,
      message: "error.affiliate_profile.data_invalid",
      statusCode: 500
    });
  }

  private platformFromPrisma(value: PrismaAffiliateChannelPlatform): AffiliateChannelPlatform {
    return value.toLowerCase() as AffiliateChannelPlatform;
  }

  private profileStatusFromPrisma(value: PrismaAffiliateProfileStatus): AffiliateProfileStatus {
    return value.toLowerCase() as AffiliateProfileStatus;
  }

  private cooperationStatusFromPrisma(
    value: PrismaAffiliateCooperationStatus
  ): AffiliateCooperationStatus {
    return value.toLowerCase() as AffiliateCooperationStatus;
  }

  private cooperationStatusToPrisma(
    value: AffiliateCooperationStatus
  ): PrismaAffiliateCooperationStatus {
    return PrismaAffiliateCooperationStatus[
      value.toUpperCase() as keyof typeof PrismaAffiliateCooperationStatus
    ];
  }

  private isUniqueConflict(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
  }

  private notFound(): AppError {
    return new AppError({
      code: ERROR_CODES.AFFILIATE_PROFILE_NOT_FOUND,
      message: "error.affiliate_profile.not_found",
      statusCode: 404
    });
  }

  private versionConflict(): AppError {
    return new AppError({
      code: ERROR_CODES.AFFILIATE_PROFILE_VERSION_CONFLICT,
      message: "error.affiliate_profile.version_conflict",
      statusCode: 409
    });
  }

  private channelLimit(): AppError {
    return new AppError({
      code: ERROR_CODES.AFFILIATE_PROFILE_CHANNEL_LIMIT,
      message: "error.affiliate_profile.channel_limit",
      statusCode: 409
    });
  }

  private channelConflict(): AppError {
    return new AppError({
      code: ERROR_CODES.AFFILIATE_PROFILE_CHANNEL_CONFLICT,
      message: "error.affiliate_profile.channel_conflict",
      statusCode: 409
    });
  }
}
