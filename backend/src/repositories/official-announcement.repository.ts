import {
  ContentLocale,
  ContentPublicationAggregateType,
  ContentReleaseStatus,
  type Prisma,
  type PrismaClient
} from "@prisma/client";
import { CONTENT_LOCALES, type ContentLocaleCode } from "../constants/content-locales";
import { ERROR_CODES } from "../constants/error-codes";
import { prisma } from "../prisma/client";
import type {
  CreateAnnouncementDraftMutation,
  DisableAnnouncementMutation,
  OfficialAnnouncementPayload,
  OfficialAnnouncementRepositoryPort,
  OfficialAnnouncementStatus,
  PublishedAnnouncementPayload,
  PublishAnnouncementMutation,
  RollbackAnnouncementMutation,
  ScheduleAnnouncementMutation,
  UpdateAnnouncementLocaleMutation
} from "../services/official-announcement.service";
import { AppError } from "../utils/app-error";
import { toPrismaPagination } from "../utils/pagination";

type AnnouncementClient = PrismaClient | Prisma.TransactionClient;

const releaseInclude = {
  announcement: true,
  translations: { where: { deletedAt: null }, orderBy: { id: "asc" as const } }
} satisfies Prisma.OfficialAnnouncementReleaseInclude;

type ReleaseRecord = Prisma.OfficialAnnouncementReleaseGetPayload<{
  include: typeof releaseInclude;
}>;

const localeToDb: Record<ContentLocaleCode, ContentLocale> = {
  "zh-CN": ContentLocale.ZH_CN,
  "zh-TW": ContentLocale.ZH_TW,
  en: ContentLocale.EN,
  ja: ContentLocale.JA,
  ko: ContentLocale.KO
};

const localeFromDb: Record<ContentLocale, ContentLocaleCode> = {
  [ContentLocale.ZH_CN]: "zh-CN",
  [ContentLocale.ZH_TW]: "zh-TW",
  [ContentLocale.EN]: "en",
  [ContentLocale.JA]: "ja",
  [ContentLocale.KO]: "ko"
};

const statusFromDb: Record<ContentReleaseStatus, OfficialAnnouncementStatus> = {
  [ContentReleaseStatus.DRAFT]: "draft",
  [ContentReleaseStatus.SCHEDULED]: "scheduled",
  [ContentReleaseStatus.PUBLISHED]: "published",
  [ContentReleaseStatus.DISABLED]: "disabled",
  [ContentReleaseStatus.ARCHIVED]: "archived"
};

export class OfficialAnnouncementRepository implements OfficialAnnouncementRepositoryPort {
  public constructor(private readonly client: AnnouncementClient = prisma) {}

  public async createDraft(
    input: CreateAnnouncementDraftMutation
  ): Promise<OfficialAnnouncementPayload> {
    try {
      return await this.transaction(async (transaction) => {
        const replay = await this.commandReplay(
          transaction,
          input.idempotencyKey,
          input.requestFingerprint
        );
        if (replay) return replay;
        await input.validateAffiliateTask?.();

        const announcement = await transaction.officialAnnouncement.create({
          data: {
            publicId: input.publicId,
            affiliateTaskId: input.affiliateTaskId,
            createdById: input.actorUserId,
            createdAt: input.now
          }
        });
        const release = await transaction.officialAnnouncementRelease.create({
          data: {
            announcementId: announcement.id,
            version: 1,
            status: ContentReleaseStatus.DRAFT,
            draftSlotKey: this.slotKey(announcement.id, "draft"),
            visibleFrom: input.visibleFrom,
            visibleUntil: input.visibleUntil,
            createdById: input.actorUserId,
            createdAt: input.now
          }
        });
        await transaction.officialAnnouncementTranslation.createMany({
          data: CONTENT_LOCALES.map((locale) => ({
            releaseId: release.id,
            locale: localeToDb[locale],
            title: input.translations[locale].title,
            summary: input.translations[locale].summary,
            body: input.translations[locale].body,
            sourceLocale: localeToDb[input.translations[locale].sourceLocale],
            isInitialCopy: input.translations[locale].isInitialCopy,
            createdAt: input.now
          }))
        });
        const result = await this.loadRelease(transaction, announcement.publicId, release.id);
        await this.audit(
          transaction,
          input,
          "content.affiliate_announcement.draft_created",
          announcement.id,
          {
            publicId: announcement.publicId,
            releaseId: release.id,
            version: 1,
            affiliateTaskId: input.affiliateTaskId
          }
        );
        await this.saveCommand(
          transaction,
          input,
          announcement.publicId,
          release.id,
          "create",
          result
        );
        return result;
      });
    } catch (error) {
      const replay = await this.recoverCommandAfterRace(
        error,
        input.idempotencyKey,
        input.requestFingerprint
      );
      if (replay) return replay;
      if (this.isUniqueConflict(error)) throw this.contentError("error.content.draft_exists", 409);
      if (this.isPrismaWriteRace(error))
        throw this.contentError("error.content.lock_conflict", 409);
      throw error;
    }
  }

  public async list(input: { page: number; pageSize: number }): Promise<{
    list: OfficialAnnouncementPayload[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const pagination = toPrismaPagination(input);
    const [announcements, total] = await Promise.all([
      this.client.officialAnnouncement.findMany({
        where: { deletedAt: null },
        orderBy: { updatedAt: "desc" },
        skip: pagination.skip,
        take: pagination.take,
        select: {
          publicId: true,
          releases: {
            where: { deletedAt: null },
            orderBy: { version: "desc" },
            take: 1,
            include: releaseInclude
          }
        }
      }),
      this.client.officialAnnouncement.count({ where: { deletedAt: null } })
    ]);
    return {
      list: announcements.flatMap((announcement) =>
        announcement.releases.map((release) => this.mapRelease(release))
      ),
      total,
      page: input.page,
      pageSize: input.pageSize
    };
  }

  public async findDraft(
    publicId: string,
    releaseId: number
  ): Promise<OfficialAnnouncementPayload | null> {
    const release = await this.client.officialAnnouncementRelease.findFirst({
      where: {
        id: releaseId,
        deletedAt: null,
        announcement: { publicId, deletedAt: null }
      },
      include: releaseInclude
    });
    return release ? this.mapRelease(release) : null;
  }

  public async updateLocale(
    input: UpdateAnnouncementLocaleMutation
  ): Promise<OfficialAnnouncementPayload> {
    return this.transaction(async (transaction) => {
      const release = await this.findReleaseForMutation(
        transaction,
        input.publicId,
        input.releaseId
      );
      this.assertDraftAndLock(release, input.expectedLockVersion);
      if (input.copyToAll) {
        const source = release.translations.find(
          (translation) => translation.locale === localeToDb[input.locale]
        );
        if (!source) throw this.contentError("error.content.incomplete_translations", 409);
        await transaction.officialAnnouncementTranslation.updateMany({
          where: { releaseId: release.id, deletedAt: null },
          data: {
            title: source.title,
            summary: source.summary,
            body: source.body,
            sourceLocale: source.locale,
            isInitialCopy: false,
            updatedAt: input.now
          }
        });
      } else {
        if (!input.translation)
          throw this.contentError("error.content.incomplete_translations", 409);
        const updated = await transaction.officialAnnouncementTranslation.updateMany({
          where: { releaseId: release.id, locale: localeToDb[input.locale], deletedAt: null },
          data: {
            title: input.translation.title,
            summary: input.translation.summary,
            body: input.translation.body,
            sourceLocale: localeToDb[input.locale],
            isInitialCopy: false,
            updatedAt: input.now
          }
        });
        if (updated.count !== 1)
          throw this.contentError("error.content.incomplete_translations", 409);
      }
      await this.bumpDraftLock(
        transaction,
        release.id,
        input.expectedLockVersion,
        input.actorUserId,
        input.now
      );
      await this.audit(
        transaction,
        input,
        "content.affiliate_announcement.locale_updated",
        release.announcementId,
        {
          publicId: input.publicId,
          releaseId: release.id,
          locale: input.locale,
          copyToAll: input.copyToAll
        }
      );
      return this.loadRelease(transaction, input.publicId, release.id);
    });
  }

  public publish(input: PublishAnnouncementMutation): Promise<OfficialAnnouncementPayload> {
    return this.publicationCommand(input, "publish", async (transaction, release) => {
      this.assertDraftAndLock(release, input.expectedLockVersion);
      this.assertCompleteTranslations(release);
      this.assertNotExpired(release, input.now);
      const scheduled = await transaction.officialAnnouncementRelease.findFirst({
        where: {
          announcementId: release.announcementId,
          scheduledSlotKey: { not: null },
          deletedAt: null
        },
        select: { id: true }
      });
      if (scheduled) throw this.contentError("error.content.schedule_conflict", 409);
      await transaction.officialAnnouncementRelease.updateMany({
        where: {
          announcementId: release.announcementId,
          publishedSlotKey: { not: null },
          deletedAt: null
        },
        data: {
          status: ContentReleaseStatus.ARCHIVED,
          publishedSlotKey: null,
          archivedAt: input.now,
          updatedAt: input.now
        }
      });
      const updated = await transaction.officialAnnouncementRelease.updateMany({
        where: {
          id: release.id,
          status: ContentReleaseStatus.DRAFT,
          lockVersion: input.expectedLockVersion
        },
        data: {
          status: ContentReleaseStatus.PUBLISHED,
          lockVersion: { increment: 1 },
          draftSlotKey: null,
          publishedSlotKey: this.slotKey(release.announcementId, "published"),
          publishAt: input.now,
          activatedAt: input.now,
          publishedById: input.actorUserId,
          updatedById: input.actorUserId,
          updatedAt: input.now
        }
      });
      if (updated.count !== 1) throw this.contentError("error.content.lock_conflict", 409);
    });
  }

  public schedule(input: ScheduleAnnouncementMutation): Promise<OfficialAnnouncementPayload> {
    return this.publicationCommand(input, "schedule", async (transaction, release) => {
      this.assertDraftAndLock(release, input.expectedLockVersion);
      this.assertCompleteTranslations(release);
      if (input.publishAt <= input.now)
        throw this.contentError("error.content.schedule_conflict", 409);
      this.assertEffectiveWindow(release, input.publishAt);
      const existing = await transaction.officialAnnouncementRelease.findFirst({
        where: {
          announcementId: release.announcementId,
          scheduledSlotKey: { not: null },
          deletedAt: null
        },
        select: { id: true }
      });
      if (existing) throw this.contentError("error.content.schedule_conflict", 409);
      const updated = await transaction.officialAnnouncementRelease.updateMany({
        where: {
          id: release.id,
          status: ContentReleaseStatus.DRAFT,
          lockVersion: input.expectedLockVersion
        },
        data: {
          status: ContentReleaseStatus.SCHEDULED,
          lockVersion: { increment: 1 },
          draftSlotKey: null,
          scheduledSlotKey: this.slotKey(release.announcementId, "scheduled"),
          publishAt: input.publishAt,
          publishedById: input.actorUserId,
          updatedById: input.actorUserId,
          updatedAt: input.now
        }
      });
      if (updated.count !== 1) throw this.contentError("error.content.lock_conflict", 409);
    });
  }

  public disable(input: DisableAnnouncementMutation): Promise<OfficialAnnouncementPayload> {
    return this.publicationCommand(input, "disable", async (transaction, release) => {
      if (
        (release.status !== ContentReleaseStatus.PUBLISHED &&
          release.status !== ContentReleaseStatus.SCHEDULED) ||
        release.lockVersion !== input.expectedLockVersion
      ) {
        throw this.contentError(
          release.lockVersion !== input.expectedLockVersion
            ? "error.content.lock_conflict"
            : "error.content.invalid_state_transition",
          409
        );
      }
      const updated = await transaction.officialAnnouncementRelease.updateMany({
        where: { id: release.id, status: release.status, lockVersion: input.expectedLockVersion },
        data: {
          status: ContentReleaseStatus.DISABLED,
          lockVersion: { increment: 1 },
          publishedSlotKey: null,
          scheduledSlotKey: null,
          disabledAt: input.now,
          disabledById: input.actorUserId,
          updatedById: input.actorUserId,
          updatedAt: input.now
        }
      });
      if (updated.count !== 1) throw this.contentError("error.content.lock_conflict", 409);
    });
  }

  public async cloneForRollback(
    input: RollbackAnnouncementMutation
  ): Promise<OfficialAnnouncementPayload> {
    try {
      return await this.transaction(async (transaction) => {
        const replay = await this.commandReplay(
          transaction,
          input.idempotencyKey,
          input.requestFingerprint
        );
        if (replay) return replay;
        const source = await this.findReleaseForMutation(
          transaction,
          input.publicId,
          input.sourceReleaseId
        );
        const current = await transaction.officialAnnouncementRelease.findFirst({
          where: { announcementId: source.announcementId, deletedAt: null },
          orderBy: { version: "desc" },
          select: { version: true }
        });
        if (!current) throw this.contentError("error.content.release_not_found", 404);
        if (current.version !== input.expectedCurrentVersion) {
          throw this.contentError("error.content.lock_conflict", 409);
        }
        const draft = await transaction.officialAnnouncementRelease.findFirst({
          where: {
            announcementId: source.announcementId,
            draftSlotKey: { not: null },
            deletedAt: null
          },
          select: { id: true }
        });
        if (draft) throw this.contentError("error.content.draft_exists", 409);
        const clone = await transaction.officialAnnouncementRelease.create({
          data: {
            announcementId: source.announcementId,
            version: current.version + 1,
            status: ContentReleaseStatus.DRAFT,
            lockVersion: 1,
            draftSlotKey: this.slotKey(source.announcementId, "draft"),
            visibleFrom: source.visibleFrom,
            visibleUntil: source.visibleUntil,
            sourceReleaseId: source.id,
            createdById: input.actorUserId,
            createdAt: input.now
          }
        });
        await transaction.officialAnnouncementTranslation.createMany({
          data: source.translations.map((translation) => ({
            releaseId: clone.id,
            locale: translation.locale,
            title: translation.title,
            summary: translation.summary,
            body: translation.body,
            sourceLocale: translation.sourceLocale,
            isInitialCopy: false,
            createdAt: input.now
          }))
        });
        const result = await this.loadRelease(transaction, input.publicId, clone.id);
        await this.audit(
          transaction,
          input,
          "content.affiliate_announcement.rollback_cloned",
          source.announcementId,
          {
            publicId: input.publicId,
            sourceReleaseId: source.id,
            releaseId: clone.id,
            version: clone.version,
            reason: input.reason
          }
        );
        await this.saveCommand(transaction, input, input.publicId, clone.id, "rollback", result);
        return result;
      });
    } catch (error) {
      const replay = await this.recoverCommandAfterRace(
        error,
        input.idempotencyKey,
        input.requestFingerprint
      );
      if (replay) return replay;
      if (this.isUniqueConflict(error)) throw this.contentError("error.content.draft_exists", 409);
      if (this.isPrismaWriteRace(error))
        throw this.contentError("error.content.lock_conflict", 409);
      throw error;
    }
  }

  public async listHistory(input: { publicId: string; page: number; pageSize: number }): Promise<{
    list: OfficialAnnouncementPayload[];
    total: number;
  }> {
    const announcement = await this.client.officialAnnouncement.findFirst({
      where: { publicId: input.publicId, deletedAt: null },
      select: { id: true }
    });
    if (!announcement) throw this.contentError("error.content.not_found", 404);
    const pagination = toPrismaPagination(input);
    const where = { announcementId: announcement.id, deletedAt: null };
    const [releases, total] = await Promise.all([
      this.client.officialAnnouncementRelease.findMany({
        where,
        orderBy: { version: "desc" },
        skip: pagination.skip,
        take: pagination.take,
        include: releaseInclude
      }),
      this.client.officialAnnouncementRelease.count({ where })
    ]);
    return { list: releases.map((release) => this.mapRelease(release)), total };
  }

  public async findPublished(
    publicId: string,
    locale: ContentLocaleCode,
    now: Date
  ): Promise<PublishedAnnouncementPayload | null> {
    const release = await this.client.officialAnnouncementRelease.findFirst({
      where: {
        deletedAt: null,
        announcement: { publicId, deletedAt: null },
        status: ContentReleaseStatus.PUBLISHED,
        publishedSlotKey: { not: null },
        AND: [
          { OR: [{ visibleFrom: null }, { visibleFrom: { lte: now } }] },
          { OR: [{ visibleUntil: null }, { visibleUntil: { gt: now } }] }
        ]
      },
      orderBy: { version: "desc" },
      include: {
        announcement: true,
        translations: {
          where: { locale: localeToDb[locale], deletedAt: null },
          take: 1
        }
      }
    });
    const translation = release?.translations[0];
    if (!release || !translation) return null;
    return {
      publicId: release.announcement.publicId,
      releaseId: release.id,
      version: release.version,
      locale,
      title: translation.title,
      summary: translation.summary,
      body: translation.body,
      visibleFrom: release.visibleFrom,
      visibleUntil: release.visibleUntil,
      activatedAt: release.activatedAt,
      affiliateTaskId: release.announcement.affiliateTaskId
    };
  }

  private async publicationCommand(
    input: PublishAnnouncementMutation | ScheduleAnnouncementMutation | DisableAnnouncementMutation,
    action: "publish" | "schedule" | "disable",
    mutate: (transaction: Prisma.TransactionClient, release: ReleaseRecord) => Promise<void>
  ): Promise<OfficialAnnouncementPayload> {
    try {
      return await this.transaction(async (transaction) => {
        const replay = await this.commandReplay(
          transaction,
          input.idempotencyKey,
          input.requestFingerprint
        );
        if (replay) return replay;
        const release = await this.findReleaseForMutation(
          transaction,
          input.publicId,
          input.releaseId
        );
        if (release.announcement.affiliateTaskId !== null) {
          await input.validateAffiliateTask?.(release.announcement.affiliateTaskId);
        }
        await mutate(transaction, release);
        const result = await this.loadRelease(transaction, input.publicId, release.id);
        await this.audit(
          transaction,
          input,
          `content.affiliate_announcement.${action}`,
          release.announcementId,
          {
            publicId: input.publicId,
            releaseId: release.id,
            version: release.version,
            reason: input.reason ?? null,
            ...(action === "schedule" && "publishAt" in input
              ? { publishAt: input.publishAt.toISOString() }
              : {})
          }
        );
        await this.saveCommand(transaction, input, input.publicId, release.id, action, result);
        return result;
      });
    } catch (error) {
      const replay = await this.recoverCommandAfterRace(
        error,
        input.idempotencyKey,
        input.requestFingerprint
      );
      if (replay) return replay;
      if (this.isUniqueConflict(error) || this.isPrismaWriteRace(error)) {
        throw this.contentError(
          action === "schedule" ? "error.content.schedule_conflict" : "error.content.lock_conflict",
          409
        );
      }
      throw error;
    }
  }

  private transaction<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    if ("$transaction" in this.client) {
      return this.client.$transaction(operation);
    }
    return operation(this.client as Prisma.TransactionClient);
  }

  private async findReleaseForMutation(
    transaction: Prisma.TransactionClient,
    publicId: string,
    releaseId: number
  ): Promise<ReleaseRecord> {
    const release = await transaction.officialAnnouncementRelease.findFirst({
      where: { id: releaseId, deletedAt: null, announcement: { publicId, deletedAt: null } },
      include: releaseInclude
    });
    if (!release) throw this.contentError("error.content.release_not_found", 404);
    return release;
  }

  private async loadRelease(
    transaction: Prisma.TransactionClient,
    publicId: string,
    releaseId: number
  ): Promise<OfficialAnnouncementPayload> {
    return this.mapRelease(await this.findReleaseForMutation(transaction, publicId, releaseId));
  }

  private assertDraftAndLock(release: ReleaseRecord, expectedLockVersion: number): void {
    if (release.status !== ContentReleaseStatus.DRAFT) {
      throw this.contentError("error.content.invalid_state_transition", 409);
    }
    if (release.lockVersion !== expectedLockVersion) {
      throw this.contentError("error.content.lock_conflict", 409);
    }
  }

  private assertCompleteTranslations(release: ReleaseRecord): void {
    if (
      release.translations.length !== CONTENT_LOCALES.length ||
      release.translations.some(
        (translation) => !translation.title.trim() || !translation.body.trim()
      )
    ) {
      throw this.contentError("error.content.incomplete_translations", 409);
    }
  }

  private assertEffectiveWindow(release: ReleaseRecord, effectiveAt: Date): void {
    if (
      (release.visibleFrom !== null && effectiveAt < release.visibleFrom) ||
      (release.visibleUntil !== null && effectiveAt >= release.visibleUntil)
    ) {
      throw this.contentError("error.content.schedule_conflict", 409);
    }
  }

  private assertNotExpired(release: ReleaseRecord, effectiveAt: Date): void {
    if (release.visibleUntil !== null && effectiveAt >= release.visibleUntil) {
      throw this.contentError("error.content.schedule_conflict", 409);
    }
  }

  private async bumpDraftLock(
    transaction: Prisma.TransactionClient,
    releaseId: number,
    expectedLockVersion: number,
    actorUserId: number,
    now: Date
  ): Promise<void> {
    const updated = await transaction.officialAnnouncementRelease.updateMany({
      where: {
        id: releaseId,
        status: ContentReleaseStatus.DRAFT,
        lockVersion: expectedLockVersion
      },
      data: { lockVersion: { increment: 1 }, updatedById: actorUserId, updatedAt: now }
    });
    if (updated.count !== 1) throw this.contentError("error.content.lock_conflict", 409);
  }

  private async commandReplay(
    transaction: AnnouncementClient,
    idempotencyKey: string,
    requestFingerprint: string
  ): Promise<OfficialAnnouncementPayload | null> {
    const command = await transaction.contentPublicationCommand.findUnique({
      where: { idempotencyKey }
    });
    if (!command) return null;
    if (command.requestFingerprint !== requestFingerprint) {
      throw this.contentError("error.idempotency_key_reused", 409);
    }
    return this.hydratePayload(command.result);
  }

  private async recoverCommandAfterRace(
    error: unknown,
    idempotencyKey: string,
    requestFingerprint: string
  ): Promise<OfficialAnnouncementPayload | null> {
    if (!this.isRaceShapedConflict(error)) return null;
    const maxAttempts = 6;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const replay = await this.commandReplay(this.client, idempotencyKey, requestFingerprint);
      if (replay) return replay;
      if (attempt + 1 < maxAttempts) {
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
      }
    }
    return null;
  }

  private async saveCommand(
    transaction: Prisma.TransactionClient,
    input: {
      idempotencyKey: string;
      requestFingerprint: string;
      actorUserId: number;
      now: Date;
    },
    publicId: string,
    releaseId: number,
    action: string,
    result: OfficialAnnouncementPayload
  ): Promise<void> {
    await transaction.contentPublicationCommand.create({
      data: {
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint,
        aggregateType: ContentPublicationAggregateType.OFFICIAL_ANNOUNCEMENT,
        aggregateKey: `announcement:${publicId}`,
        releaseId,
        action,
        actorUserId: input.actorUserId,
        result: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
        createdAt: input.now
      }
    });
  }

  private async audit(
    transaction: Prisma.TransactionClient,
    input: { actorUserId: number; context: { ip: string; userAgent?: string }; now: Date },
    action: string,
    targetId: number,
    metadata: Prisma.InputJsonValue
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        actorId: input.actorUserId,
        action,
        targetType: "OfficialAnnouncement",
        targetId,
        ip: input.context.ip,
        userAgent: input.context.userAgent ?? null,
        metadata,
        createdAt: input.now
      }
    });
  }

  private mapRelease(release: ReleaseRecord): OfficialAnnouncementPayload {
    const translations = Object.fromEntries(
      release.translations.map((translation) => [
        localeFromDb[translation.locale],
        {
          title: translation.title,
          summary: translation.summary,
          body: translation.body,
          sourceLocale: localeFromDb[translation.sourceLocale],
          isInitialCopy: translation.isInitialCopy
        }
      ])
    ) as OfficialAnnouncementPayload["translations"];
    return {
      publicId: release.announcement.publicId,
      releaseId: release.id,
      version: release.version,
      status: statusFromDb[release.status],
      lockVersion: release.lockVersion,
      announcementType: release.announcement.announcementType,
      visibilityScope: release.announcement.visibilityScope,
      affiliateTaskId: release.announcement.affiliateTaskId,
      publishAt: release.publishAt,
      visibleFrom: release.visibleFrom,
      visibleUntil: release.visibleUntil,
      activatedAt: release.activatedAt,
      disabledAt: release.disabledAt,
      archivedAt: release.archivedAt,
      sourceReleaseId: release.sourceReleaseId,
      translations,
      createdAt: release.createdAt,
      updatedAt: release.updatedAt
    };
  }

  private hydratePayload(value: Prisma.JsonValue): OfficialAnnouncementPayload {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw this.contentError("error.content.invalid_state_transition", 409);
    }
    const record = value as Record<string, Prisma.JsonValue>;
    const date = (key: string): Date | null =>
      typeof record[key] === "string" ? new Date(record[key]) : null;
    return {
      ...(record as unknown as OfficialAnnouncementPayload),
      publishAt: date("publishAt"),
      visibleFrom: date("visibleFrom"),
      visibleUntil: date("visibleUntil"),
      activatedAt: date("activatedAt"),
      disabledAt: date("disabledAt"),
      archivedAt: date("archivedAt"),
      createdAt: date("createdAt") ?? new Date(0),
      updatedAt: date("updatedAt") ?? new Date(0)
    };
  }

  private slotKey(announcementId: number, slot: "draft" | "published" | "scheduled"): string {
    return `announcement:${announcementId}:${slot}`;
  }

  private isUniqueConflict(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
  }

  private isPrismaWriteRace(error: unknown): boolean {
    if (typeof error !== "object" || error === null || !("code" in error)) return false;
    return error.code === "P2025" || error.code === "P2034";
  }

  private isRaceShapedConflict(error: unknown): boolean {
    if (this.isUniqueConflict(error) || this.isPrismaWriteRace(error)) return true;
    return (
      error instanceof AppError &&
      error.statusCode === 409 &&
      [
        "error.content.draft_exists",
        "error.content.lock_conflict",
        "error.content.schedule_conflict",
        "error.content.invalid_state_transition"
      ].includes(error.message)
    );
  }

  private contentError(message: string, statusCode: number): AppError {
    return new AppError({ code: ERROR_CODES.VALIDATION, message, statusCode });
  }
}
