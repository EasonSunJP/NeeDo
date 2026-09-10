import {
  PlatformLoginVerificationRule as PrismaPlatformLoginVerificationRule,
  Prisma,
  type PrismaClient
} from "@prisma/client";
import type {
  PlatformBrandMedia,
  PlatformLoginVerificationRule
} from "../domain/platform-settings";
import { prisma } from "../prisma/client";
import {
  toAuditLogCreateData,
  type AuditLogCreateInput
} from "./audit-log.repository";
import {
  isRetryableTransactionConflict,
  runWithTransactionConflictRetry
} from "../utils/transaction-conflict-retry";

const ACTIVE_KEY = "active";

const mediaSelect = Prisma.validator<Prisma.MediaAssetSelect>()({
  id: true,
  checksumSha256: true,
  url: true,
  mimeType: true,
  width: true,
  height: true,
  altText: true
});

const settingSelect = Prisma.validator<Prisma.PlatformSettingVersionSelect>()({
  id: true,
  publicId: true,
  version: true,
  siteEnabled: true,
  selfRegistrationEnabled: true,
  googleLoginEnabled: true,
  passwordLoginOtpEnabled: true,
  passwordLoginOtpRule: true,
  passwordLoginOtpOnNewIp: true,
  loginLogoMediaAssetId: true,
  requestButtonMediaAssetId: true,
  offlinePaymentEnabled: true,
  ndpPaymentEnabled: true,
  anytimeServiceTestEnabled: true,
  overdueAppointmentGateEnabled: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
  loginLogoMediaAsset: { select: mediaSelect },
  requestButtonMediaAsset: { select: mediaSelect }
});

type StoredSetting = Prisma.PlatformSettingVersionGetPayload<{ select: typeof settingSelect }>;
type StoredMedia = Prisma.MediaAssetGetPayload<{ select: typeof mediaSelect }>;

export interface PlatformSettingsMediaRecord extends PlatformBrandMedia {
  mediaAssetId: number;
}

export interface PlatformSettingsRecord {
  id: number;
  publicId: string;
  version: number;
  siteEnabled: boolean;
  selfRegistrationEnabled: boolean;
  googleLoginEnabled: boolean;
  passwordLoginOtpEnabled: boolean;
  passwordLoginOtpRule: PlatformLoginVerificationRule;
  passwordLoginOtpOnNewIp: boolean;
  loginLogoMediaAssetId: number | null;
  requestButtonMediaAssetId: number | null;
  offlinePaymentEnabled: boolean;
  ndpPaymentEnabled: boolean;
  anytimeServiceTestEnabled: boolean;
  overdueAppointmentGateEnabled: boolean;
  createdByUserId: number | null;
  createdAt: Date;
  updatedAt: Date;
  loginLogo: PlatformSettingsMediaRecord | null;
  requestButton: PlatformSettingsMediaRecord | null;
}

export interface PlatformBasicSettingsChanges {
  siteEnabled: boolean;
  selfRegistrationEnabled: boolean;
  googleLoginEnabled: boolean;
  passwordLoginOtpEnabled: boolean;
  passwordLoginOtpRule: PlatformLoginVerificationRule;
  passwordLoginOtpOnNewIp: boolean;
  anytimeServiceTestEnabled: boolean;
  overdueAppointmentGateEnabled: boolean;
  loginLogoMediaPublicId: string | null;
  requestButtonMediaPublicId: string | null;
}

export interface PlatformPaymentSettingsChanges {
  offlinePaymentEnabled: boolean;
  ndpPaymentEnabled: boolean;
}

interface ReplacePlatformSettingsBase {
  expectedVersion: number;
  actorUserId: number;
  audit: AuditLogCreateInput;
}

export type ReplacePlatformSettingsInput = ReplacePlatformSettingsBase &
  (
    | { section: "basic"; changes: PlatformBasicSettingsChanges }
    | { section: "payment"; changes: PlatformPaymentSettingsChanges }
  );

export type PlatformSettingsMutationResult =
  | { kind: "updated"; value: PlatformSettingsRecord }
  | { kind: "version_conflict" }
  | { kind: "media_not_found"; field: "loginLogo" | "requestButton" };

export interface PlatformSettingsRepositoryPort {
  getActive(): Promise<PlatformSettingsRecord | null>;
  replaceWithAudit(input: ReplacePlatformSettingsInput): Promise<PlatformSettingsMutationResult>;
}

class PlatformSettingsConflict extends Error {}

export class PlatformSettingsRepository implements PlatformSettingsRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async getActive(): Promise<PlatformSettingsRecord | null> {
    const row = await this.client.platformSettingVersion.findFirst({
      where: { activeKey: ACTIVE_KEY, deletedAt: null },
      orderBy: [{ version: "desc" }, { id: "desc" }],
      select: settingSelect
    });
    return row ? this.mapSetting(row) : null;
  }

  public async replaceWithAudit(
    input: ReplacePlatformSettingsInput
  ): Promise<PlatformSettingsMutationResult> {
    try {
      return await runWithTransactionConflictRetry(() =>
        this.client.$transaction((transaction) => this.replaceInTransaction(transaction, input), {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable
        })
      );
    } catch (error) {
      if (
        error instanceof PlatformSettingsConflict ||
        this.isUniqueConflict(error) ||
        isRetryableTransactionConflict(error)
      ) {
        return { kind: "version_conflict" };
      }
      throw error;
    }
  }

  private async replaceInTransaction(
    transaction: Prisma.TransactionClient,
    input: ReplacePlatformSettingsInput
  ): Promise<PlatformSettingsMutationResult> {
    await transaction.$queryRaw(
      Prisma.sql`SELECT id FROM platform_setting_versions WHERE active_key = ${ACTIVE_KEY} AND deleted_at IS NULL FOR UPDATE`
    );
    const current = await transaction.platformSettingVersion.findFirst({
      where: { activeKey: ACTIVE_KEY, deletedAt: null },
      orderBy: [{ version: "desc" }, { id: "desc" }],
      select: settingSelect
    });
    if (!current || current.version !== input.expectedVersion) {
      return { kind: "version_conflict" };
    }

    let loginLogoMediaAssetId = current.loginLogoMediaAssetId;
    let requestButtonMediaAssetId = current.requestButtonMediaAssetId;
    if (input.section === "basic") {
      const loginLogo = await this.resolveMedia(
        transaction,
        input.changes.loginLogoMediaPublicId
      );
      if (input.changes.loginLogoMediaPublicId && !loginLogo) {
        return { kind: "media_not_found", field: "loginLogo" };
      }
      const requestButton = await this.resolveMedia(
        transaction,
        input.changes.requestButtonMediaPublicId
      );
      if (input.changes.requestButtonMediaPublicId && !requestButton) {
        return { kind: "media_not_found", field: "requestButton" };
      }
      loginLogoMediaAssetId = loginLogo?.id ?? null;
      requestButtonMediaAssetId = requestButton?.id ?? null;
    }

    const closed = await transaction.platformSettingVersion.updateMany({
      where: {
        id: current.id,
        version: input.expectedVersion,
        activeKey: ACTIVE_KEY,
        deletedAt: null
      },
      data: { activeKey: null }
    });
    if (closed.count !== 1) throw new PlatformSettingsConflict();

    const created = await transaction.platformSettingVersion.create({
      data: {
        version: current.version + 1,
        activeKey: ACTIVE_KEY,
        siteEnabled:
          input.section === "basic" ? input.changes.siteEnabled : current.siteEnabled,
        selfRegistrationEnabled:
          input.section === "basic"
            ? input.changes.selfRegistrationEnabled
            : current.selfRegistrationEnabled,
        googleLoginEnabled:
          input.section === "basic"
            ? input.changes.googleLoginEnabled
            : current.googleLoginEnabled,
        passwordLoginOtpEnabled:
          input.section === "basic"
            ? input.changes.passwordLoginOtpEnabled
            : current.passwordLoginOtpEnabled,
        passwordLoginOtpRule:
          input.section === "basic"
            ? this.ruleToDatabase(input.changes.passwordLoginOtpRule)
            : current.passwordLoginOtpRule,
        passwordLoginOtpOnNewIp:
          input.section === "basic"
            ? input.changes.passwordLoginOtpOnNewIp
            : current.passwordLoginOtpOnNewIp,
        anytimeServiceTestEnabled:
          input.section === "basic"
            ? input.changes.anytimeServiceTestEnabled
            : current.anytimeServiceTestEnabled,
        overdueAppointmentGateEnabled:
          input.section === "basic"
            ? input.changes.overdueAppointmentGateEnabled
            : current.overdueAppointmentGateEnabled,
        loginLogoMediaAssetId,
        requestButtonMediaAssetId,
        offlinePaymentEnabled:
          input.section === "payment"
            ? input.changes.offlinePaymentEnabled
            : current.offlinePaymentEnabled,
        ndpPaymentEnabled:
          input.section === "payment" ? input.changes.ndpPaymentEnabled : current.ndpPaymentEnabled,
        createdByUserId: input.actorUserId
      },
      select: settingSelect
    });

    const metadata =
      input.audit.metadata && typeof input.audit.metadata === "object" ? input.audit.metadata : {};
    await transaction.auditLog.create({
      data: toAuditLogCreateData({
        ...input.audit,
        targetId: created.id,
        metadata: {
          ...metadata,
          previousVersion: current.version,
          nextVersion: created.version
        }
      })
    });
    return { kind: "updated", value: this.mapSetting(created) };
  }

  private async resolveMedia(
    transaction: Prisma.TransactionClient,
    publicId: string | null
  ): Promise<StoredMedia | null> {
    if (publicId === null) return null;
    return transaction.mediaAsset.findFirst({
      where: {
        checksumSha256: publicId,
        entityType: "content_publication_upload",
        usageType: "content_publication_public",
        mimeType: { in: ["image/jpeg", "image/png", "image/webp"] },
        isActive: true,
        purgedAt: null,
        deletedAt: null
      },
      select: mediaSelect,
      orderBy: { id: "desc" }
    });
  }

  private mapSetting(setting: StoredSetting): PlatformSettingsRecord {
    return {
      id: setting.id,
      publicId: setting.publicId,
      version: setting.version,
      siteEnabled: setting.siteEnabled,
      selfRegistrationEnabled: setting.selfRegistrationEnabled,
      googleLoginEnabled: setting.googleLoginEnabled,
      passwordLoginOtpEnabled: setting.passwordLoginOtpEnabled,
      passwordLoginOtpRule: this.ruleFromDatabase(setting.passwordLoginOtpRule),
      passwordLoginOtpOnNewIp: setting.passwordLoginOtpOnNewIp,
      loginLogoMediaAssetId: setting.loginLogoMediaAssetId,
      requestButtonMediaAssetId: setting.requestButtonMediaAssetId,
      offlinePaymentEnabled: setting.offlinePaymentEnabled,
      ndpPaymentEnabled: setting.ndpPaymentEnabled,
      anytimeServiceTestEnabled: setting.anytimeServiceTestEnabled,
      overdueAppointmentGateEnabled: setting.overdueAppointmentGateEnabled,
      createdByUserId: setting.createdByUserId,
      createdAt: setting.createdAt,
      updatedAt: setting.updatedAt,
      loginLogo: this.mapMedia(setting.loginLogoMediaAsset),
      requestButton: this.mapMedia(setting.requestButtonMediaAsset)
    };
  }

  private mapMedia(media: StoredMedia | null): PlatformSettingsMediaRecord | null {
    if (!media?.checksumSha256) return null;
    return {
      mediaAssetId: media.id,
      publicId: media.checksumSha256,
      url: media.url,
      mimeType: media.mimeType,
      width: media.width,
      height: media.height,
      altText: media.altText
    };
  }

  private ruleToDatabase(
    rule: PlatformLoginVerificationRule
  ): PrismaPlatformLoginVerificationRule {
    if (rule === "monthly_first") return PrismaPlatformLoginVerificationRule.MONTHLY_FIRST;
    if (rule === "every_login") return PrismaPlatformLoginVerificationRule.EVERY_LOGIN;
    return PrismaPlatformLoginVerificationRule.FIRST_LOGIN;
  }

  private ruleFromDatabase(
    rule: PrismaPlatformLoginVerificationRule
  ): PlatformLoginVerificationRule {
    if (rule === PrismaPlatformLoginVerificationRule.MONTHLY_FIRST) return "monthly_first";
    if (rule === PrismaPlatformLoginVerificationRule.EVERY_LOGIN) return "every_login";
    return "first_login";
  }

  private isUniqueConflict(error: unknown): boolean {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
  }
}
