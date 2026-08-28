import { randomUUID } from "crypto";
import {
  CarouselScene,
  CarouselTargetType,
  ContentLocale,
  ContentPublicationAggregateType,
  ContentReleaseStatus,
  PublicIdentifierStatus,
  type Prisma,
  type PrismaClient
} from "@prisma/client";
import { CONTENT_LOCALES, type ContentLocaleCode } from "../constants/content-locales";
import { ERROR_CODES } from "../constants/error-codes";
import { prisma } from "../prisma/client";
import type {
  CarouselPublicationPayload,
  CarouselPublicationRepositoryPort,
  CarouselSceneCode,
  CarouselSlidePayload,
  CarouselStatus,
  CarouselTarget,
  CarouselTargetInput,
  CarouselTargetSearchItem,
  CreateCarouselDraftMutation,
  DisableCarouselMutation,
  PublishCarouselMutation,
  PublishedCarouselPayload,
  ReplaceCarouselDraftMutation,
  RollbackCarouselMutation,
  ScheduleCarouselMutation,
  StoredCarouselSlide,
  UpdateCarouselLocaleMutation
} from "../services/carousel-publication.service";
import { AppError } from "../utils/app-error";
import { toPrismaPagination } from "../utils/pagination";

type CarouselClient = PrismaClient | Prisma.TransactionClient;

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
const sceneToDb: Record<CarouselSceneCode, CarouselScene> = {
  USER_HOME: CarouselScene.USER_HOME,
  AFFILIATE_HOME_NOTICE: CarouselScene.AFFILIATE_HOME_NOTICE
};
const sceneFromDb: Record<CarouselScene, CarouselSceneCode> = {
  [CarouselScene.USER_HOME]: "USER_HOME",
  [CarouselScene.AFFILIATE_HOME_NOTICE]: "AFFILIATE_HOME_NOTICE"
};
const statusFromDb: Record<ContentReleaseStatus, CarouselStatus> = {
  [ContentReleaseStatus.DRAFT]: "draft",
  [ContentReleaseStatus.SCHEDULED]: "scheduled",
  [ContentReleaseStatus.PUBLISHED]: "published",
  [ContentReleaseStatus.DISABLED]: "disabled",
  [ContentReleaseStatus.ARCHIVED]: "archived"
};

const releaseInclude = {
  slides: {
    where: { deletedAt: null },
    orderBy: { sortOrder: "asc" as const },
    include: {
      mediaAsset: true,
      shop: { include: { publicIdentifier: true } },
      technicianProfile: {
        include: {
          user: {
            include: {
              identities: {
                where: { type: "technician", isActive: true, deletedAt: null },
                include: { publicIdentifier: true },
                take: 1
              }
            }
          }
        }
      },
      service: { include: { shop: true } },
      announcement: true,
      affiliateTask: true,
      translations: { where: { deletedAt: null }, orderBy: { id: "asc" as const } }
    }
  }
} satisfies Prisma.CarouselReleaseInclude;

type ReleaseRecord = Prisma.CarouselReleaseGetPayload<{ include: typeof releaseInclude }>;
type ResolvedCarouselSlide = Omit<StoredCarouselSlide, "target"> & {
  mediaAssetId: number;
  target: CarouselTarget;
};

interface MutationAuditInput {
  actorUserId: number;
  context: { ip: string; userAgent?: string };
  now: Date;
}

export class CarouselPublicationRepository implements CarouselPublicationRepositoryPort {
  public constructor(private readonly client: CarouselClient = prisma) {}

  public async getScene(scene: CarouselSceneCode) {
    const releases = await this.client.carouselRelease.findMany({
      where: {
        scene: sceneToDb[scene],
        deletedAt: null,
        OR: [
          { draftSlotKey: { not: null } },
          { publishedSlotKey: { not: null } },
          { scheduledSlotKey: { not: null } }
        ]
      },
      include: releaseInclude
    });
    return {
      scene,
      draft: this.slotRelease(releases, "draftSlotKey"),
      published: this.slotRelease(releases, "publishedSlotKey"),
      scheduled: this.slotRelease(releases, "scheduledSlotKey")
    };
  }

  public async createDraft(
    input: CreateCarouselDraftMutation
  ): Promise<CarouselPublicationPayload> {
    try {
      return await this.transaction(async (transaction) => {
        const replay = await this.commandReplay(transaction, input);
        if (replay) return replay;
        const latest = await transaction.carouselRelease.findFirst({
          where: { scene: sceneToDb[input.scene], deletedAt: null },
          orderBy: { version: "desc" },
          select: { version: true }
        });
        const resolved = await this.resolveSlides(
          transaction,
          input.scene,
          input.slides,
          input.actorUserId,
          input.now,
          input.validateAffiliateTask
        );
        const release = await transaction.carouselRelease.create({
          data: {
            scene: sceneToDb[input.scene],
            version: (latest?.version ?? 0) + 1,
            status: ContentReleaseStatus.DRAFT,
            draftSlotKey: this.slotKey(input.scene, "draft"),
            createdById: input.actorUserId,
            createdAt: input.now
          }
        });
        await this.createSlides(transaction, release.id, resolved, input.now);
        const result = await this.loadRelease(transaction, input.scene, release.id);
        await this.audit(transaction, input, "content.carousel.draft_created", release.id, {
          scene: input.scene,
          releaseId: release.id,
          version: release.version
        });
        await this.saveCommand(transaction, input, release.id, "create", result);
        return result;
      });
    } catch (error) {
      const replay = await this.recoverCommandAfterRace(error, input);
      if (replay) return replay;
      if (this.isUniqueConflict(error)) throw this.contentError("error.content.draft_exists", 409);
      if (this.isPrismaWriteRace(error))
        throw this.contentError("error.content.lock_conflict", 409);
      throw error;
    }
  }

  public async findRelease(scene: CarouselSceneCode, releaseId: number) {
    const release = await this.client.carouselRelease.findFirst({
      where: { id: releaseId, scene: sceneToDb[scene], deletedAt: null },
      include: releaseInclude
    });
    return release ? this.mapRelease(release) : null;
  }

  public async replaceDraft(
    input: ReplaceCarouselDraftMutation
  ): Promise<CarouselPublicationPayload> {
    try {
      return await this.transaction(async (transaction) => {
        const release = await this.findReleaseForMutation(
          transaction,
          input.scene,
          input.releaseId
        );
        this.assertDraftAndLock(release, input.expectedLockVersion);
        const resolved = await this.resolveSlides(
          transaction,
          input.scene,
          input.slides,
          input.actorUserId,
          input.now,
          input.validateAffiliateTask
        );
        const bumped = await transaction.carouselRelease.updateMany({
          where: {
            id: release.id,
            status: ContentReleaseStatus.DRAFT,
            lockVersion: input.expectedLockVersion
          },
          data: {
            lockVersion: { increment: 1 },
            updatedById: input.actorUserId,
            updatedAt: input.now
          }
        });
        if (bumped.count !== 1) throw this.contentError("error.content.lock_conflict", 409);

        const incomingIds = new Set(resolved.map((slide) => slide.publicId));
        const maximumOrder = await transaction.carouselSlide.aggregate({
          where: { releaseId: release.id },
          _max: { sortOrder: true }
        });
        const stagingBase = (maximumOrder._max.sortOrder ?? -1) + 1;
        for (const [index, slide] of release.slides.entries()) {
          await transaction.carouselSlide.update({
            where: { id: slide.id },
            data: { sortOrder: stagingBase + index, updatedAt: input.now }
          });
        }
        for (const slide of release.slides) {
          if (incomingIds.has(slide.publicId)) continue;
          await transaction.carouselSlideTranslation.updateMany({
            where: { slideId: slide.id, deletedAt: null },
            data: { deletedAt: input.now, updatedAt: input.now }
          });
          await transaction.carouselSlide.updateMany({
            where: { id: slide.id, deletedAt: null },
            data: { deletedAt: input.now, updatedAt: input.now }
          });
        }
        for (const slide of resolved) {
          const existing = release.slides.find(
            (candidate) => candidate.publicId === slide.publicId
          );
          if (!existing) {
            await this.createSlide(transaction, release.id, slide, input.now);
            continue;
          }
          await transaction.carouselSlide.update({
            where: { id: existing.id },
            data: {
              ...this.slideScalarData(slide),
              mediaAssetId: slide.mediaAssetId,
              deletedAt: null,
              updatedAt: input.now
            }
          });
          for (const locale of CONTENT_LOCALES) {
            await transaction.carouselSlideTranslation.upsert({
              where: { slideId_locale: { slideId: existing.id, locale: localeToDb[locale] } },
              create: this.translationData(existing.id, locale, slide, input.now),
              update: {
                ...this.translationValues(locale, slide),
                deletedAt: null,
                updatedAt: input.now
              }
            });
          }
        }
        const result = await this.loadRelease(transaction, input.scene, release.id);
        await this.audit(transaction, input, "content.carousel.draft_replaced", release.id, {
          scene: input.scene,
          releaseId: release.id,
          slideCount: resolved.length
        });
        return result;
      });
    } catch (error) {
      if (this.isUniqueConflict(error) || this.isPrismaWriteRace(error))
        throw this.contentError("error.content.lock_conflict", 409);
      throw error;
    }
  }

  public async updateLocale(
    input: UpdateCarouselLocaleMutation
  ): Promise<CarouselPublicationPayload> {
    return this.transaction(async (transaction) => {
      const release = await this.findReleaseForMutation(transaction, input.scene, input.releaseId);
      this.assertDraftAndLock(release, input.expectedLockVersion);
      const slide = release.slides.find((candidate) => candidate.publicId === input.slidePublicId);
      if (!slide) throw this.contentError("error.content.release_not_found", 404);
      if (input.copyToAll) {
        const source = slide.translations.find(
          (translation) => translation.locale === localeToDb[input.locale]
        );
        if (!source) throw this.contentError("error.content.incomplete_translations", 409);
        await transaction.carouselSlideTranslation.updateMany({
          where: { slideId: slide.id, deletedAt: null },
          data: {
            badge: source.badge,
            title: source.title,
            caption: source.caption,
            ctaLabel: source.ctaLabel,
            imageAltText: source.imageAltText,
            sourceLocale: source.locale,
            isInitialCopy: false,
            updatedAt: input.now
          }
        });
      } else {
        if (!input.translation)
          throw this.contentError("error.content.incomplete_translations", 409);
        const updated = await transaction.carouselSlideTranslation.updateMany({
          where: { slideId: slide.id, locale: localeToDb[input.locale], deletedAt: null },
          data: {
            ...input.translation,
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
      const result = await this.loadRelease(transaction, input.scene, release.id);
      await this.audit(
        transaction,
        input,
        input.copyToAll
          ? "content.carousel.locale_copied_to_all"
          : "content.carousel.locale_updated",
        release.id,
        {
          scene: input.scene,
          releaseId: release.id,
          slidePublicId: input.slidePublicId,
          sourceLocale: input.locale
        }
      );
      return result;
    });
  }

  public publish(input: PublishCarouselMutation): Promise<CarouselPublicationPayload> {
    return this.publicationCommand(input, "publish", async (transaction, release) => {
      this.assertDraftAndLock(release, input.expectedLockVersion);
      await this.validateRelease(transaction, release, input.now, input.validateAffiliateTask);
      await transaction.carouselRelease.updateMany({
        where: { scene: sceneToDb[input.scene], publishedSlotKey: { not: null }, deletedAt: null },
        data: {
          status: ContentReleaseStatus.ARCHIVED,
          publishedSlotKey: null,
          archivedAt: input.now,
          updatedAt: input.now
        }
      });
      const updated = await transaction.carouselRelease.updateMany({
        where: {
          id: release.id,
          status: ContentReleaseStatus.DRAFT,
          lockVersion: input.expectedLockVersion
        },
        data: {
          status: ContentReleaseStatus.PUBLISHED,
          lockVersion: { increment: 1 },
          draftSlotKey: null,
          publishedSlotKey: this.slotKey(input.scene, "published"),
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

  public schedule(input: ScheduleCarouselMutation): Promise<CarouselPublicationPayload> {
    return this.publicationCommand(input, "schedule", async (transaction, release) => {
      this.assertDraftAndLock(release, input.expectedLockVersion);
      if (input.publishAt <= input.now)
        throw this.contentError("error.content.schedule_conflict", 409);
      await this.validateRelease(
        transaction,
        release,
        input.publishAt,
        input.validateAffiliateTask
      );
      const occupied = await transaction.carouselRelease.findFirst({
        where: { scene: sceneToDb[input.scene], scheduledSlotKey: { not: null }, deletedAt: null },
        select: { id: true }
      });
      if (occupied) throw this.contentError("error.content.schedule_conflict", 409);
      const updated = await transaction.carouselRelease.updateMany({
        where: {
          id: release.id,
          status: ContentReleaseStatus.DRAFT,
          lockVersion: input.expectedLockVersion
        },
        data: {
          status: ContentReleaseStatus.SCHEDULED,
          lockVersion: { increment: 1 },
          draftSlotKey: null,
          scheduledSlotKey: this.slotKey(input.scene, "scheduled"),
          publishAt: input.publishAt,
          publishedById: input.actorUserId,
          updatedById: input.actorUserId,
          updatedAt: input.now
        }
      });
      if (updated.count !== 1) throw this.contentError("error.content.lock_conflict", 409);
    });
  }

  public disable(input: DisableCarouselMutation): Promise<CarouselPublicationPayload> {
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
      const updated = await transaction.carouselRelease.updateMany({
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
    input: RollbackCarouselMutation
  ): Promise<CarouselPublicationPayload> {
    try {
      return await this.transaction(async (transaction) => {
        const replay = await this.commandReplay(transaction, input);
        if (replay) return replay;
        const source = await this.findReleaseForMutation(
          transaction,
          input.scene,
          input.sourceReleaseId
        );
        await this.validateRelease(transaction, source, input.now, input.validateAffiliateTask);
        const latest = await transaction.carouselRelease.findFirst({
          where: { scene: sceneToDb[input.scene], deletedAt: null },
          orderBy: { version: "desc" },
          select: { version: true }
        });
        if (!latest) throw this.contentError("error.content.release_not_found", 404);
        if (latest.version !== input.expectedCurrentVersion)
          throw this.contentError("error.content.lock_conflict", 409);
        const draft = await transaction.carouselRelease.findFirst({
          where: { scene: sceneToDb[input.scene], draftSlotKey: { not: null }, deletedAt: null },
          select: { id: true }
        });
        if (draft) throw this.contentError("error.content.draft_exists", 409);
        const clone = await transaction.carouselRelease.create({
          data: {
            scene: sceneToDb[input.scene],
            version: latest.version + 1,
            status: ContentReleaseStatus.DRAFT,
            lockVersion: 1,
            draftSlotKey: this.slotKey(input.scene, "draft"),
            sourceReleaseId: source.id,
            createdById: input.actorUserId,
            createdAt: input.now
          }
        });
        const slides: StoredCarouselSlide[] = source.slides.map((slide) => ({
          publicId: randomUUID(),
          mediaAssetPublicId: slide.mediaAsset.checksumSha256 ?? "",
          sortOrder: slide.sortOrder,
          isEnabled: slide.isEnabled,
          visibleFrom: slide.visibleFrom,
          visibleUntil: slide.visibleUntil,
          target: this.mapTarget(slide),
          translations: Object.fromEntries(
            slide.translations.map((translation) => [
              localeFromDb[translation.locale],
              {
                badge: translation.badge,
                title: translation.title,
                caption: translation.caption,
                ctaLabel: translation.ctaLabel,
                imageAltText: translation.imageAltText,
                sourceLocale: localeFromDb[translation.sourceLocale],
                isInitialCopy: false
              }
            ])
          ) as StoredCarouselSlide["translations"]
        }));
        const resolved = await this.resolveSlides(
          transaction,
          input.scene,
          slides,
          input.actorUserId,
          input.now,
          input.validateAffiliateTask,
          new Set(source.slides.map((slide) => slide.mediaAssetId))
        );
        await this.createSlides(transaction, clone.id, resolved, input.now);
        const result = await this.loadRelease(transaction, input.scene, clone.id);
        await this.audit(transaction, input, "content.carousel.rollback_cloned", clone.id, {
          scene: input.scene,
          sourceReleaseId: source.id,
          releaseId: clone.id,
          version: clone.version,
          reason: input.reason
        });
        await this.saveCommand(transaction, input, clone.id, "rollback", result);
        return result;
      });
    } catch (error) {
      const replay = await this.recoverCommandAfterRace(error, input);
      if (replay) return replay;
      if (this.isUniqueConflict(error)) throw this.contentError("error.content.draft_exists", 409);
      if (this.isPrismaWriteRace(error))
        throw this.contentError("error.content.lock_conflict", 409);
      throw error;
    }
  }

  public async listHistory(input: { scene: CarouselSceneCode; page: number; pageSize: number }) {
    const pagination = toPrismaPagination(input);
    const where = { scene: sceneToDb[input.scene], deletedAt: null };
    const [releases, total] = await Promise.all([
      this.client.carouselRelease.findMany({
        where,
        include: releaseInclude,
        orderBy: { version: "desc" },
        skip: pagination.skip,
        take: pagination.take
      }),
      this.client.carouselRelease.count({ where })
    ]);
    return { list: releases.map((release) => this.mapRelease(release)), total };
  }

  public async findPublishedScene(
    scene: CarouselSceneCode,
    locale: ContentLocaleCode,
    _actor: PublishCarouselMutation["actor"],
    now: Date
  ): Promise<PublishedCarouselPayload> {
    const release = await this.client.carouselRelease.findFirst({
      where: {
        scene: sceneToDb[scene],
        status: ContentReleaseStatus.PUBLISHED,
        publishedSlotKey: { not: null },
        deletedAt: null
      },
      include: releaseInclude,
      orderBy: { version: "desc" }
    });
    if (!release)
      return { scene, locale, releaseVersion: null, generatedAt: now.toISOString(), slides: [] };
    const announcementIds = release.slides.flatMap((slide) =>
      slide.announcementId === null ? [] : [slide.announcementId]
    );
    const currentAnnouncements =
      announcementIds.length === 0
        ? []
        : await this.client.officialAnnouncementRelease.findMany({
            where: {
              announcementId: { in: announcementIds },
              status: ContentReleaseStatus.PUBLISHED,
              publishedSlotKey: { not: null },
              deletedAt: null,
              AND: [
                { OR: [{ visibleFrom: null }, { visibleFrom: { lte: now } }] },
                { OR: [{ visibleUntil: null }, { visibleUntil: { gt: now } }] }
              ]
            },
            select: { announcementId: true }
          });
    const announcementSet = new Set(currentAnnouncements.map((item) => item.announcementId));
    const slides = release.slides.flatMap((slide) => {
      if (
        !slide.isEnabled ||
        (slide.visibleFrom && slide.visibleFrom > now) ||
        (slide.visibleUntil && slide.visibleUntil <= now)
      )
        return [];
      const translation = slide.translations.find((item) => item.locale === localeToDb[locale]);
      const target = this.publicTarget(slide, announcementSet);
      if (!translation || !target || !this.mediaAvailable(slide.mediaAsset)) return [];
      return [
        {
          id: slide.publicId,
          badge: translation.badge,
          title: translation.title,
          caption: translation.caption,
          ctaLabel: translation.ctaLabel,
          imageAltText: translation.imageAltText,
          imageUrl: slide.mediaAsset.url,
          target
        }
      ];
    });
    return {
      scene,
      locale,
      releaseVersion: release.version,
      generatedAt: now.toISOString(),
      slides
    };
  }

  public async searchTargets(input: {
    scene: CarouselSceneCode;
    type?: string;
    q?: string;
    page: number;
    pageSize: number;
    scopeShopId: number | null;
    actor: PublishCarouselMutation["actor"];
    now: Date;
    validateAffiliateTask: (taskId: number) => Promise<void>;
  }): Promise<{ list: CarouselTargetSearchItem[]; total: number }> {
    const types = input.type
      ? [input.type]
      : input.scene === "USER_HOME"
        ? ["shop", "technician", "service"]
        : ["announcement", "affiliate_task"];
    const items: CarouselTargetSearchItem[] = [];
    let total = 0;
    const prefixSize = input.page * input.pageSize;
    const q = input.q?.trim();
    const contains = q ? { contains: q } : undefined;
    if (types.includes("shop")) {
      const where: Prisma.ShopWhereInput = {
        deletedAt: null,
        status: "published",
        ...(input.scopeShopId ? { id: input.scopeShopId } : {}),
        ...(contains ? { OR: [{ name: contains }, { city: contains }] } : {}),
        publicIdentifier: { is: { status: PublicIdentifierStatus.ACTIVE, deletedAt: null } }
      };
      const [rows, count] = await Promise.all([
        this.client.shop.findMany({
          where,
          include: { publicIdentifier: true },
          orderBy: [{ name: "asc" }, { id: "asc" }],
          take: prefixSize
        }),
        this.client.shop.count({ where })
      ]);
      total += count;
      items.push(
        ...rows.flatMap((row) =>
          row.publicIdentifier
            ? [
                {
                  type: "shop" as const,
                  publicId: row.publicIdentifier.publicId,
                  label: row.name,
                  status: row.status,
                  target: { type: "shop" as const, publicId: row.publicIdentifier.publicId }
                }
              ]
            : []
        )
      );
    }
    if (types.includes("technician")) {
      const where: Prisma.TechnicianProfileWhereInput = {
        deletedAt: null,
        status: "published",
        ...(input.scopeShopId
          ? {
              OR: [
                { shopId: input.scopeShopId },
                {
                  technicianShopAffiliations: {
                    some: { shopId: input.scopeShopId, workStatus: "ACTIVE", deletedAt: null }
                  }
                }
              ]
            }
          : {}),
        ...(contains ? { OR: [{ displayName: contains }, { city: contains }] } : {}),
        user: {
          deletedAt: null,
          isActive: true,
          identities: {
            some: {
              type: "technician",
              isActive: true,
              deletedAt: null,
              publicIdentifier: { is: { status: PublicIdentifierStatus.ACTIVE, deletedAt: null } }
            }
          }
        }
      };
      const [rows, count] = await Promise.all([
        this.client.technicianProfile.findMany({
          where,
          include: {
            user: {
              include: {
                identities: {
                  where: { type: "technician", isActive: true, deletedAt: null },
                  include: { publicIdentifier: true },
                  take: 1
                }
              }
            }
          },
          orderBy: [{ displayName: "asc" }, { id: "asc" }],
          take: prefixSize
        }),
        this.client.technicianProfile.count({ where })
      ]);
      total += count;
      items.push(
        ...rows.flatMap((row) => {
          const identifier = row.user.identities[0]?.publicIdentifier;
          return identifier
            ? [
                {
                  type: "technician" as const,
                  publicId: identifier.publicId,
                  label: row.displayName,
                  status: row.status,
                  target: { type: "technician" as const, publicId: identifier.publicId }
                }
              ]
            : [];
        })
      );
    }
    if (types.includes("service")) {
      const where: Prisma.ServiceWhereInput = {
        deletedAt: null,
        status: "published",
        ...(input.scopeShopId ? { shopId: input.scopeShopId } : {}),
        ...(contains ? { OR: [{ name: contains }, { city: contains }] } : {})
      };
      const [rows, count] = await Promise.all([
        this.client.service.findMany({
          where,
          orderBy: [{ name: "asc" }, { publicId: "asc" }],
          take: prefixSize
        }),
        this.client.service.count({ where })
      ]);
      total += count;
      items.push(
        ...rows.map((row) => ({
          type: "service" as const,
          publicId: row.publicId,
          label: row.name,
          status: row.status,
          target: { type: "service" as const, publicId: row.publicId }
        }))
      );
    }
    if (types.includes("announcement")) {
      const where: Prisma.OfficialAnnouncementReleaseWhereInput = {
        status: ContentReleaseStatus.PUBLISHED,
        publishedSlotKey: { not: null },
        deletedAt: null,
        announcement: {
          deletedAt: null,
          ...(input.scopeShopId
            ? { affiliateTask: { is: { publisherShopId: input.scopeShopId, deletedAt: null } } }
            : {})
        },
        AND: [
          { OR: [{ visibleFrom: null }, { visibleFrom: { lte: input.now } }] },
          { OR: [{ visibleUntil: null }, { visibleUntil: { gt: input.now } }] }
        ],
        translations: contains ? { some: { title: contains, deletedAt: null } } : undefined
      };
      const [releases, count] = await Promise.all([
        this.client.officialAnnouncementRelease.findMany({
          where,
          include: {
            announcement: { include: { affiliateTask: { select: { taskCode: true } } } },
            translations: { where: { deletedAt: null }, orderBy: { locale: "asc" }, take: 1 }
          },
          orderBy: [{ announcement: { publicId: "asc" } }, { id: "asc" }]
        }),
        this.client.officialAnnouncementRelease.count({ where })
      ]);
      total += count;
      items.push(
        ...releases.map((row) => ({
          type: "affiliate_announcement" as const,
          publicId: row.announcement.publicId,
          label: row.translations[0]?.title ?? row.announcement.publicId,
          status: "published",
          target: {
            type: "affiliate_announcement" as const,
            announcementPublicId: row.announcement.publicId,
            taskCode: row.announcement.affiliateTask?.taskCode ?? null
          }
        }))
      );
    }
    if (types.includes("affiliate_task")) {
      const visibleTasks: CarouselTargetSearchItem[] = [];
      const batchSize = 100;
      let skip = 0;
      while (true) {
        const rows = await this.client.affiliateTask.findMany({
          where: {
            deletedAt: null,
            status: { in: ["SCHEDULED", "ACTIVE"] },
            claimStartsAt: { lte: input.now },
            claimEndsAt: { gt: input.now },
            taskEndsAt: { gt: input.now },
            ...(input.scopeShopId ? { publisherShopId: input.scopeShopId } : {}),
            ...(contains ? { OR: [{ name: contains }, { taskCode: contains }] } : {})
          },
          orderBy: [{ name: "asc" }, { taskCode: "asc" }, { id: "asc" }],
          skip,
          take: batchSize
        });
        for (const row of rows) {
          try {
            await input.validateAffiliateTask(row.id);
          } catch {
            continue;
          }
          visibleTasks.push({
            type: "affiliate_task",
            taskCode: row.taskCode,
            label: row.name,
            status: String(row.status).toLowerCase()
          });
        }
        skip += rows.length;
        if (rows.length < batchSize) break;
      }
      total += visibleTasks.length;
      items.push(...visibleTasks);
    }
    items.sort((left, right) => this.compareSearchTargets(left, right));
    const start = (input.page - 1) * input.pageSize;
    return { list: items.slice(start, start + input.pageSize), total };
  }

  private async publicationCommand(
    input: PublishCarouselMutation | ScheduleCarouselMutation | DisableCarouselMutation,
    action: "publish" | "schedule" | "disable",
    mutate: (transaction: Prisma.TransactionClient, release: ReleaseRecord) => Promise<void>
  ): Promise<CarouselPublicationPayload> {
    try {
      return await this.transaction(async (transaction) => {
        const replay = await this.commandReplay(transaction, input);
        if (replay) return replay;
        const release = await this.findReleaseForMutation(
          transaction,
          input.scene,
          input.releaseId
        );
        await mutate(transaction, release);
        const result = await this.loadRelease(transaction, input.scene, release.id);
        await this.audit(transaction, input, `content.carousel.${action}`, release.id, {
          scene: input.scene,
          releaseId: release.id,
          version: release.version,
          reason: input.reason ?? null,
          ...(action === "schedule" && "publishAt" in input
            ? { publishAt: input.publishAt.toISOString() }
            : {})
        });
        await this.saveCommand(transaction, input, release.id, action, result);
        return result;
      });
    } catch (error) {
      const replay = await this.recoverCommandAfterRace(error, input);
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

  private async resolveSlides(
    transaction: Prisma.TransactionClient,
    scene: CarouselSceneCode,
    slides: StoredCarouselSlide[],
    actorUserId: number,
    effectiveAt: Date,
    validateAffiliateTask: (taskId: number) => Promise<void>,
    authorizedMediaAssetIds: ReadonlySet<number> = new Set()
  ): Promise<ResolvedCarouselSlide[]> {
    const result: ResolvedCarouselSlide[] = [];
    for (const slide of slides) {
      const media = await transaction.mediaAsset.findFirst({
        where: {
          checksumSha256: slide.mediaAssetPublicId,
          entityType: "content_publication_upload",
          usageType: "content_publication_public",
          isActive: true,
          purgedAt: null,
          deletedAt: null,
          ...(authorizedMediaAssetIds.size > 0
            ? {
                OR: [{ ownerUserId: actorUserId }, { id: { in: [...authorizedMediaAssetIds] } }]
              }
            : { ownerUserId: actorUserId })
        },
        select: { id: true },
        orderBy: { id: "desc" }
      });
      if (!media) throw this.contentError("error.content.media_invalid", 409);
      const target = await this.resolveTarget(transaction, scene, slide.target);
      if (scene === "AFFILIATE_HOME_NOTICE" && target.type === "affiliate_announcement") {
        const announcement = await transaction.officialAnnouncement.findUniqueOrThrow({
          where: { publicId: target.announcementPublicId },
          select: { id: true }
        });
        const published = await transaction.officialAnnouncementRelease.findFirst({
          where: {
            announcementId: announcement.id,
            status: ContentReleaseStatus.PUBLISHED,
            publishedSlotKey: { not: null },
            deletedAt: null
          },
          select: { visibleFrom: true, visibleUntil: true }
        });
        const start = slide.visibleFrom ?? effectiveAt;
        const covers =
          published !== null &&
          (published.visibleFrom === null || published.visibleFrom <= start) &&
          (published.visibleUntil === null ||
            (slide.visibleUntil !== null && published.visibleUntil >= slide.visibleUntil));
        if (!covers) throw this.contentError("error.content.target_unavailable", 409);
        if (target.affiliateTaskId !== null) {
          await validateAffiliateTask(target.affiliateTaskId);
        }
      }
      result.push({ ...slide, mediaAssetId: media.id, target });
    }
    return result;
  }

  private async resolveTarget(
    transaction: Prisma.TransactionClient,
    scene: CarouselSceneCode,
    target: CarouselTargetInput
  ): Promise<CarouselTarget> {
    if (scene === "USER_HOME" && target.type === "shop") {
      const row = await transaction.shop.findFirst({
        where: {
          ...("shopId" in target ? { id: target.shopId } : {}),
          status: "published",
          deletedAt: null,
          publicIdentifier: {
            is: {
              ...("publicId" in target ? { publicId: target.publicId } : {}),
              status: PublicIdentifierStatus.ACTIVE,
              deletedAt: null
            }
          }
        },
        select: { id: true }
      });
      if (!row) throw this.contentError("error.content.target_unavailable", 409);
      return { type: "shop", shopId: row.id };
    }
    if (scene === "USER_HOME" && target.type === "technician") {
      const row = await transaction.technicianProfile.findFirst({
        where: {
          ...("technicianProfileId" in target ? { id: target.technicianProfileId } : {}),
          status: "published",
          deletedAt: null,
          user: {
            deletedAt: null,
            isActive: true,
            identities: {
              some: {
                type: "technician",
                isActive: true,
                deletedAt: null,
                publicIdentifier: {
                  is: {
                    ...("publicId" in target ? { publicId: target.publicId } : {}),
                    status: PublicIdentifierStatus.ACTIVE,
                    deletedAt: null
                  }
                }
              }
            }
          }
        },
        select: { id: true }
      });
      if (!row) throw this.contentError("error.content.target_unavailable", 409);
      return { type: "technician", technicianProfileId: row.id };
    }
    if (scene === "USER_HOME" && target.type === "service") {
      const row = await transaction.service.findFirst({
        where: {
          ...("serviceId" in target ? { id: target.serviceId } : { publicId: target.publicId }),
          status: "published",
          deletedAt: null,
          shop: { status: "published", deletedAt: null }
        },
        select: { id: true }
      });
      if (!row) throw this.contentError("error.content.target_unavailable", 409);
      return { type: "service", serviceId: row.id };
    }
    if (scene === "AFFILIATE_HOME_NOTICE" && target.type === "affiliate_announcement") {
      const row = await transaction.officialAnnouncement.findFirst({
        where: { publicId: target.announcementPublicId, deletedAt: null },
        select: { id: true, affiliateTaskId: true, affiliateTask: { select: { taskCode: true } } }
      });
      const matches =
        row !== null &&
        ("affiliateTaskId" in target
          ? row.affiliateTaskId === target.affiliateTaskId
          : row.affiliateTask?.taskCode === target.taskCode ||
            (row.affiliateTaskId === null && target.taskCode === null));
      if (!row || !matches) throw this.contentError("error.content.target_unavailable", 409);
      return {
        type: "affiliate_announcement",
        announcementPublicId: target.announcementPublicId,
        affiliateTaskId: row.affiliateTaskId
      };
    }
    throw this.contentError("error.carousel.target_invalid", 409);
  }

  private async validateRelease(
    transaction: Prisma.TransactionClient,
    release: ReleaseRecord,
    effectiveAt: Date,
    validateAffiliateTask: (taskId: number) => Promise<void>
  ) {
    if (
      release.slides.length === 0 ||
      release.slides.some((slide, index) => slide.sortOrder !== index)
    )
      throw this.contentError("error.carousel.sort_invalid", 409);
    if (
      !release.slides.some(
        (slide) => slide.isEnabled && (!slide.visibleUntil || slide.visibleUntil > effectiveAt)
      )
    )
      throw this.contentError("error.carousel.no_visible_slide", 409);
    const announcements = release.slides.flatMap((slide) =>
      slide.announcementId === null ? [] : [slide.announcementId]
    );
    const announcementReleases =
      announcements.length === 0
        ? []
        : await transaction.officialAnnouncementRelease.findMany({
            where: {
              announcementId: { in: announcements },
              status: ContentReleaseStatus.PUBLISHED,
              publishedSlotKey: { not: null },
              deletedAt: null
            },
            select: { announcementId: true, visibleFrom: true, visibleUntil: true }
          });
    for (const slide of release.slides) {
      if (
        !this.mediaAvailable(slide.mediaAsset) ||
        slide.translations.length !== CONTENT_LOCALES.length ||
        slide.translations.some(
          (translation) => !translation.title.trim() || !translation.imageAltText.trim()
        )
      )
        throw this.contentError("error.content.incomplete_translations", 409);
      if (slide.visibleFrom && slide.visibleUntil && slide.visibleFrom >= slide.visibleUntil)
        throw this.contentError("error.content.schedule_conflict", 409);
      if (slide.visibleUntil && slide.visibleUntil <= effectiveAt)
        throw this.contentError("error.content.schedule_conflict", 409);
      if (!this.publicTarget(slide, new Set(announcements)))
        throw this.contentError("error.content.target_unavailable", 409);
      if (slide.announcementId !== null) {
        const covers = announcementReleases.some(
          (announcement) =>
            announcement.announcementId === slide.announcementId &&
            (announcement.visibleFrom === null ||
              announcement.visibleFrom <= (slide.visibleFrom ?? effectiveAt)) &&
            (announcement.visibleUntil === null ||
              (slide.visibleUntil !== null && announcement.visibleUntil >= slide.visibleUntil))
        );
        if (!covers) throw this.contentError("error.content.target_unavailable", 409);
        if (slide.announcement?.affiliateTaskId !== slide.affiliateTaskId)
          throw this.contentError("error.content.target_unavailable", 409);
        if (slide.affiliateTaskId !== null) await validateAffiliateTask(slide.affiliateTaskId);
      }
    }
  }

  private publicTarget(slide: ReleaseRecord["slides"][number], announcements: Set<number>) {
    if (
      slide.targetType === CarouselTargetType.SHOP &&
      slide.shop?.status === "published" &&
      slide.shop.deletedAt === null &&
      slide.shop.publicIdentifier?.status === PublicIdentifierStatus.ACTIVE &&
      slide.shop.publicIdentifier.deletedAt === null
    )
      return { type: "shop" as const, publicId: slide.shop.publicIdentifier.publicId };
    const identity = slide.technicianProfile?.user.identities[0];
    if (
      slide.targetType === CarouselTargetType.TECHNICIAN &&
      slide.technicianProfile?.status === "published" &&
      slide.technicianProfile.deletedAt === null &&
      slide.technicianProfile.user.isActive &&
      slide.technicianProfile.user.deletedAt === null &&
      identity?.publicIdentifier?.status === PublicIdentifierStatus.ACTIVE &&
      identity.publicIdentifier.deletedAt === null
    )
      return { type: "technician" as const, publicId: identity.publicIdentifier.publicId };
    if (
      slide.targetType === CarouselTargetType.SERVICE &&
      slide.service?.status === "published" &&
      slide.service.deletedAt === null &&
      slide.service.shop.status === "published" &&
      slide.service.shop.deletedAt === null
    )
      return { type: "service" as const, publicId: slide.service.publicId };
    if (
      slide.targetType === CarouselTargetType.AFFILIATE_ANNOUNCEMENT &&
      slide.announcement &&
      slide.announcement.deletedAt === null &&
      announcements.has(slide.announcement.id)
    )
      return { type: "affiliate_announcement" as const, publicId: slide.announcement.publicId };
    return null;
  }

  private mediaAvailable(media: ReleaseRecord["slides"][number]["mediaAsset"]): boolean {
    return (
      media.entityType === "content_publication_upload" &&
      media.usageType === "content_publication_public" &&
      media.isActive &&
      media.purgedAt === null &&
      media.deletedAt === null &&
      Boolean(media.checksumSha256)
    );
  }

  private mapTarget(slide: ReleaseRecord["slides"][number]): CarouselTarget {
    if (slide.targetType === CarouselTargetType.SHOP && slide.shopId)
      return { type: "shop", shopId: slide.shopId };
    if (slide.targetType === CarouselTargetType.TECHNICIAN && slide.technicianProfileId)
      return { type: "technician", technicianProfileId: slide.technicianProfileId };
    if (slide.targetType === CarouselTargetType.SERVICE && slide.serviceId)
      return { type: "service", serviceId: slide.serviceId };
    if (slide.targetType === CarouselTargetType.AFFILIATE_ANNOUNCEMENT && slide.announcement)
      return {
        type: "affiliate_announcement",
        announcementPublicId: slide.announcement.publicId,
        affiliateTaskId: slide.affiliateTaskId
      };
    throw this.contentError("error.carousel.target_invalid", 409);
  }

  private async createSlides(
    transaction: Prisma.TransactionClient,
    releaseId: number,
    slides: ResolvedCarouselSlide[],
    now: Date
  ) {
    for (const slide of slides) await this.createSlide(transaction, releaseId, slide, now);
  }

  private async createSlide(
    transaction: Prisma.TransactionClient,
    releaseId: number,
    slide: ResolvedCarouselSlide,
    now: Date
  ) {
    let announcementId: number | null = null;
    if (slide.target.type === "affiliate_announcement") {
      announcementId = (
        await transaction.officialAnnouncement.findUniqueOrThrow({
          where: { publicId: slide.target.announcementPublicId },
          select: { id: true }
        })
      ).id;
    }
    const created = await transaction.carouselSlide.create({
      data: {
        releaseId,
        mediaAssetId: slide.mediaAssetId,
        ...this.slideScalarData(slide, announcementId),
        createdAt: now
      }
    });
    await transaction.carouselSlideTranslation.createMany({
      data: CONTENT_LOCALES.map((locale) => this.translationData(created.id, locale, slide, now))
    });
  }

  private slideScalarData(slide: ResolvedCarouselSlide, announcementId?: number | null) {
    const targetType =
      slide.target.type === "shop"
        ? CarouselTargetType.SHOP
        : slide.target.type === "technician"
          ? CarouselTargetType.TECHNICIAN
          : slide.target.type === "service"
            ? CarouselTargetType.SERVICE
            : CarouselTargetType.AFFILIATE_ANNOUNCEMENT;
    return {
      publicId: slide.publicId,
      sortOrder: slide.sortOrder,
      isEnabled: slide.isEnabled,
      visibleFrom: slide.visibleFrom,
      visibleUntil: slide.visibleUntil,
      targetType,
      shopId: slide.target.type === "shop" ? slide.target.shopId : null,
      technicianProfileId:
        slide.target.type === "technician" ? slide.target.technicianProfileId : null,
      serviceId: slide.target.type === "service" ? slide.target.serviceId : null,
      announcementId: announcementId ?? null,
      affiliateTaskId:
        slide.target.type === "affiliate_announcement" ? slide.target.affiliateTaskId : null
    };
  }

  private translationData(
    slideId: number,
    locale: ContentLocaleCode,
    slide: StoredCarouselSlide,
    now: Date
  ) {
    return {
      slideId,
      locale: localeToDb[locale],
      ...this.translationValues(locale, slide),
      createdAt: now
    };
  }

  private translationValues(locale: ContentLocaleCode, slide: StoredCarouselSlide) {
    const value = slide.translations[locale];
    return {
      badge: value.badge,
      title: value.title,
      caption: value.caption,
      ctaLabel: value.ctaLabel,
      imageAltText: value.imageAltText,
      sourceLocale: localeToDb[value.sourceLocale],
      isInitialCopy: value.isInitialCopy
    };
  }

  private async findReleaseForMutation(
    transaction: Prisma.TransactionClient,
    scene: CarouselSceneCode,
    releaseId: number
  ): Promise<ReleaseRecord> {
    const release = await transaction.carouselRelease.findFirst({
      where: { id: releaseId, scene: sceneToDb[scene], deletedAt: null },
      include: releaseInclude
    });
    if (!release) throw this.contentError("error.content.release_not_found", 404);
    return release;
  }

  private async loadRelease(
    transaction: Prisma.TransactionClient,
    scene: CarouselSceneCode,
    releaseId: number
  ) {
    return this.mapRelease(await this.findReleaseForMutation(transaction, scene, releaseId));
  }

  private mapRelease(release: ReleaseRecord): CarouselPublicationPayload {
    return {
      scene: sceneFromDb[release.scene],
      releaseId: release.id,
      version: release.version,
      status: statusFromDb[release.status],
      lockVersion: release.lockVersion,
      publishAt: release.publishAt,
      activatedAt: release.activatedAt,
      disabledAt: release.disabledAt,
      archivedAt: release.archivedAt,
      sourceReleaseId: release.sourceReleaseId,
      slides: release.slides.map(
        (slide): CarouselSlidePayload => ({
          id: slide.publicId,
          mediaAssetPublicId: slide.mediaAsset.checksumSha256 ?? "",
          imageUrl: slide.mediaAsset.url,
          sortOrder: slide.sortOrder,
          isEnabled: slide.isEnabled,
          visibleFrom: slide.visibleFrom,
          visibleUntil: slide.visibleUntil,
          target: this.mapTarget(slide),
          translations: Object.fromEntries(
            slide.translations.map((translation) => [
              localeFromDb[translation.locale],
              {
                badge: translation.badge,
                title: translation.title,
                caption: translation.caption,
                ctaLabel: translation.ctaLabel,
                imageAltText: translation.imageAltText,
                sourceLocale: localeFromDb[translation.sourceLocale],
                isInitialCopy: translation.isInitialCopy
              }
            ])
          ) as CarouselSlidePayload["translations"]
        })
      ),
      createdAt: release.createdAt,
      updatedAt: release.updatedAt
    };
  }

  private slotRelease(
    releases: ReleaseRecord[],
    field: "draftSlotKey" | "publishedSlotKey" | "scheduledSlotKey"
  ) {
    const release = releases.find((candidate) => candidate[field] !== null);
    return release ? this.mapRelease(release) : null;
  }

  private assertDraftAndLock(release: ReleaseRecord, expectedLockVersion: number) {
    if (release.status !== ContentReleaseStatus.DRAFT)
      throw this.contentError("error.content.invalid_state_transition", 409);
    if (release.lockVersion !== expectedLockVersion)
      throw this.contentError("error.content.lock_conflict", 409);
  }

  private async bumpDraftLock(
    transaction: Prisma.TransactionClient,
    releaseId: number,
    expectedLockVersion: number,
    actorUserId: number,
    now: Date
  ) {
    const result = await transaction.carouselRelease.updateMany({
      where: {
        id: releaseId,
        status: ContentReleaseStatus.DRAFT,
        lockVersion: expectedLockVersion
      },
      data: { lockVersion: { increment: 1 }, updatedById: actorUserId, updatedAt: now }
    });
    if (result.count !== 1) throw this.contentError("error.content.lock_conflict", 409);
  }

  private transaction<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    return "$transaction" in this.client
      ? this.client.$transaction(operation)
      : operation(this.client as Prisma.TransactionClient);
  }

  private async commandReplay(
    transaction: CarouselClient,
    input: { idempotencyKey: string; requestFingerprint: string; actorUserId: number }
  ) {
    const command = await transaction.contentPublicationCommand.findUnique({
      where: { idempotencyKey: input.idempotencyKey }
    });
    if (!command) return null;
    if (
      command.requestFingerprint !== input.requestFingerprint ||
      command.actorUserId !== input.actorUserId
    )
      throw this.contentError("error.idempotency_key_reused", 409);
    return this.hydratePayload(command.result);
  }

  private async recoverCommandAfterRace(
    error: unknown,
    input: { idempotencyKey: string; requestFingerprint: string; actorUserId: number }
  ) {
    if (!this.isRaceShapedConflict(error)) return null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const replay = await this.commandReplay(this.client, input);
      if (replay) return replay;
      if (attempt < 5) await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
    return null;
  }

  private async saveCommand(
    transaction: Prisma.TransactionClient,
    input: {
      scene: CarouselSceneCode;
      idempotencyKey: string;
      requestFingerprint: string;
      actorUserId: number;
      now: Date;
    },
    releaseId: number,
    action: string,
    result: CarouselPublicationPayload
  ) {
    await transaction.contentPublicationCommand.create({
      data: {
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint,
        aggregateType: ContentPublicationAggregateType.CAROUSEL,
        aggregateKey: `carousel:${input.scene}`,
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
    input: MutationAuditInput,
    action: string,
    targetId: number,
    metadata: Prisma.InputJsonValue
  ) {
    await transaction.auditLog.create({
      data: {
        actorId: input.actorUserId,
        action,
        targetType: "CarouselRelease",
        targetId,
        ip: input.context.ip,
        userAgent: input.context.userAgent ?? null,
        metadata,
        createdAt: input.now
      }
    });
  }

  private hydratePayload(value: Prisma.JsonValue): CarouselPublicationPayload {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw this.contentError("error.content.invalid_state_transition", 409);
    const result = value as unknown as CarouselPublicationPayload;
    const date = (value: unknown) => (typeof value === "string" ? new Date(value) : null);
    return {
      ...result,
      publishAt: date(result.publishAt),
      activatedAt: date(result.activatedAt),
      disabledAt: date(result.disabledAt),
      archivedAt: date(result.archivedAt),
      createdAt: date(result.createdAt) ?? new Date(0),
      updatedAt: date(result.updatedAt) ?? new Date(0),
      slides: result.slides.map((slide) => ({
        ...slide,
        visibleFrom: date(slide.visibleFrom),
        visibleUntil: date(slide.visibleUntil)
      }))
    };
  }

  private slotKey(scene: CarouselSceneCode, slot: "draft" | "published" | "scheduled") {
    return `carousel:${scene}:${slot}`;
  }
  private compareSearchTargets(
    left: CarouselTargetSearchItem,
    right: CarouselTargetSearchItem
  ): number {
    const labelOrder = left.label.localeCompare(right.label);
    if (labelOrder !== 0) return labelOrder;
    const ranks: Record<CarouselTargetSearchItem["type"], number> = {
      shop: 0,
      technician: 1,
      service: 2,
      affiliate_announcement: 3,
      affiliate_task: 4
    };
    const typeOrder = ranks[left.type] - ranks[right.type];
    if (typeOrder !== 0) return typeOrder;
    return 0;
  }
  private isUniqueConflict(error: unknown) {
    return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
  }
  private isPrismaWriteRace(error: unknown) {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error.code === "P2025" || error.code === "P2034")
    );
  }
  private isRaceShapedConflict(error: unknown) {
    return (
      this.isUniqueConflict(error) ||
      this.isPrismaWriteRace(error) ||
      (error instanceof AppError &&
        error.statusCode === 409 &&
        error.message !== "error.idempotency_key_reused")
    );
  }
  private contentError(message: string, statusCode: number) {
    return new AppError({ code: ERROR_CODES.VALIDATION, message, statusCode });
  }
}
