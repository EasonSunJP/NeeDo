import {
  ContentLocale,
  NoticeDeliveryStatus,
  NotificationType,
  OfficialNoticeAudienceType,
  OfficialNoticeIssuerType,
  OfficialNoticeLevel,
  OfficialNoticeStatus,
  Prisma,
  type PrismaClient
} from "@prisma/client";
import { CONTENT_LOCALES, type ContentLocaleCode } from "../constants/content-locales";
import { ERROR_CODES } from "../constants/error-codes";
import { prisma } from "../prisma/client";
import type {
  CreateAndPlanOfficialNoticeInput,
  LifecycleMutationInput,
  OfficialNoticeDispatchResult,
  OfficialNoticeLevelCode,
  OfficialNoticePayload,
  OfficialNoticeRepositoryPort,
  OfficialNoticeStatusCode,
  RecipientOfficialNoticePayload
} from "../services/official-notice.service";
import { AppError } from "../utils/app-error";
import { toPrismaPagination } from "../utils/pagination";
import type { RealtimeEvent, RealtimeEventGatewayPort } from "../services/realtime-event.gateway";
import type {
  MerchantNoticeAudienceInput,
  NoticeAudienceInput,
  OfficialNoticeAudienceInput,
  OfficialNoticeBlockInput
} from "../validators/official-notice.validator";
import type {
  NoticeIssuerReadScope,
  NoticeIssuerScope
} from "../services/official-notice-scope";
import {
  buildActiveMerchantNoticePublisherWhere,
  buildMerchantNoticeRecipientWhere
} from "./merchant-notice-audience";

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
const levelToDb: Record<OfficialNoticeLevelCode, OfficialNoticeLevel> = {
  general: OfficialNoticeLevel.GENERAL,
  important: OfficialNoticeLevel.IMPORTANT,
  urgent: OfficialNoticeLevel.URGENT
};
const levelFromDb: Record<OfficialNoticeLevel, OfficialNoticeLevelCode> = {
  [OfficialNoticeLevel.GENERAL]: "general",
  [OfficialNoticeLevel.IMPORTANT]: "important",
  [OfficialNoticeLevel.URGENT]: "urgent"
};
const statusFromDb: Record<OfficialNoticeStatus, OfficialNoticeStatusCode> = {
  [OfficialNoticeStatus.DRAFT]: "draft",
  [OfficialNoticeStatus.PENDING_REVIEW]: "pending_review",
  [OfficialNoticeStatus.APPROVED]: "approved",
  [OfficialNoticeStatus.SCHEDULED]: "scheduled",
  [OfficialNoticeStatus.SENDING]: "sending",
  [OfficialNoticeStatus.SENT]: "sent",
  [OfficialNoticeStatus.CANCELLED]: "cancelled",
  [OfficialNoticeStatus.ARCHIVED]: "archived"
};
const statusToDb: Record<OfficialNoticeStatusCode, OfficialNoticeStatus> = Object.fromEntries(
  Object.entries(statusFromDb).map(([database, value]) => [value, database])
) as Record<OfficialNoticeStatusCode, OfficialNoticeStatus>;
const audienceTypeToDb: Record<NoticeAudienceInput["type"], OfficialNoticeAudienceType> = {
  all: OfficialNoticeAudienceType.ALL,
  identity_types: OfficialNoticeAudienceType.IDENTITY_TYPES,
  exact_users: OfficialNoticeAudienceType.EXACT_USERS,
  shop_card_holders: OfficialNoticeAudienceType.SHOP_CARD_HOLDERS,
  shop_employees: OfficialNoticeAudienceType.SHOP_EMPLOYEES,
  shop_technicians: OfficialNoticeAudienceType.SHOP_TECHNICIANS
};

interface NoticeRecord {
  id: number;
  publicId: string;
  level: OfficialNoticeLevel;
  status: OfficialNoticeStatus;
  sourceLocale: ContentLocale;
  targetSummary: string;
  scheduledAt: Date | null;
  sentAt: Date | null;
  cancelledAt: Date | null;
  archivedAt: Date | null;
  lockVersion: number;
  createdAt: Date;
  updatedAt: Date;
  translations: Array<{
    locale: ContentLocale;
    title: string;
    summary: string;
    blocks: Prisma.JsonValue;
    sourceLocale: ContentLocale;
    isInitialCopy: boolean;
  }>;
}

interface DeliveryCounts {
  pending: number;
  delivered: number;
  failed: number;
  read: number;
}

export function getOfficialNoticeRetryAt(
  attemptCount: number,
  maxAttempts: number,
  now: Date
): Date | null {
  return attemptCount < maxAttempts ? new Date(now.getTime() + 60_000) : null;
}

export function buildOfficialNoticeRecipientWhere(
  audience: OfficialNoticeAudienceInput
): Prisma.UserIdentityWhereInput {
  const base: Prisma.UserIdentityWhereInput = {
    isActive: true,
    deletedAt: null,
    user: { isActive: true, deletedAt: null }
  };
  if (audience.type === "identity_types") {
    return { ...base, type: { in: [...new Set(audience.identityTypes)] } };
  }
  if (audience.type === "exact_users") {
    return { ...base, userId: { in: [...new Set(audience.userIds)] } };
  }
  return base;
}

export class OfficialNoticeRepository implements OfficialNoticeRepositoryPort {
  private readonly maxDeliveryAttempts: number;

  public constructor(
    private readonly client: PrismaClient = prisma,
    maxDeliveryAttempts = 3,
    private readonly eventGateway?: Pick<RealtimeEventGatewayPort, "publish">
  ) {
    this.maxDeliveryAttempts = Math.max(1, Math.min(20, maxDeliveryAttempts));
  }

  public async createAndPlan(
    input: CreateAndPlanOfficialNoticeInput
  ): Promise<OfficialNoticePayload> {
    let resultPublicId = input.publicId;
    await this.assertActiveMerchantPublisher(this.client, input.issuerScope, input.now);
    const replay = await this.client.officialNotice.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: {
        publicId: true,
        requestFingerprint: true,
        issuerType: true,
        issuerShopId: true
      }
    });
    if (replay) {
      this.assertIssuerScope(replay, input.issuerScope);
      if (replay.requestFingerprint !== input.requestFingerprint)
        throw this.conflict("error.idempotency_key_reused");
      return this.requirePayload(replay.publicId);
    }
    if (input.sendMode === "scheduled" && input.scheduledAt.getTime() <= input.now.getTime()) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.official_notice.schedule_future_required",
        statusCode: 400
      });
    }

    await this.client
      .$transaction(
        async (transaction) => {
          await this.assertActiveMerchantPublisher(transaction, input.issuerScope, input.now);
          const notice = await transaction.officialNotice.create({
            data: {
              publicId: input.publicId,
              level: levelToDb[input.level],
              status: OfficialNoticeStatus.SCHEDULED,
              sourceLocale: localeToDb[input.sourceLocale],
              audienceType: audienceTypeToDb[input.audience.type],
              audienceCriteria: input.audience as Prisma.InputJsonValue,
              targetSummary: input.targetSummary,
              scheduledAt: input.scheduledAt,
              submittedAt: input.now,
              approvedAt: input.now,
              lockVersion: 1,
              idempotencyKey: input.idempotencyKey,
              requestFingerprint: input.requestFingerprint,
              issuerType:
                input.issuerScope.type === "platform"
                  ? OfficialNoticeIssuerType.PLATFORM
                  : OfficialNoticeIssuerType.SHOP,
              issuerShopId: input.issuerScope.type === "shop" ? input.issuerScope.shopId : null,
              createdByIdentityId:
                input.issuerScope.type === "shop" ? input.issuerScope.actorIdentityId : null,
              createdById: input.actorUserId,
              updatedById: input.actorUserId,
              submittedById: input.actorUserId,
              approvedById: input.actorUserId,
              createdAt: input.now,
              updatedAt: input.now,
              translations: {
                create: CONTENT_LOCALES.map((locale) => ({
                  locale: localeToDb[locale],
                  title: input.translations[locale].title,
                  summary: input.translations[locale].summary,
                  blocks: input.translations[locale].blocks as Prisma.InputJsonValue,
                  sourceLocale: localeToDb[input.translations[locale].sourceLocale],
                  isInitialCopy: input.translations[locale].isInitialCopy,
                  createdAt: input.now,
                  updatedAt: input.now
                }))
              }
            }
          });

          const audienceCount = await this.snapshotAudience(transaction, notice.id, input);
          await transaction.auditLog.create({
            data: {
              actorId: input.actorUserId,
              action: "official_notice.create_and_plan",
              targetType: "OfficialNotice",
              targetId: notice.id,
              ip: input.context.ip,
              userAgent: input.context.userAgent ?? null,
              metadata: {
                publicId: notice.publicId,
                level: input.level,
                targetSummary: input.targetSummary,
                audienceCount,
                scheduledAt: input.scheduledAt.toISOString(),
                idempotencyKey: input.idempotencyKey,
                issuerType: input.issuerScope.type,
                issuerShopId: input.issuerScope.type === "shop" ? input.issuerScope.shopId : null,
                actorIdentityId:
                  input.issuerScope.type === "shop" ? input.issuerScope.actorIdentityId : null
              } satisfies Prisma.InputJsonValue,
              createdAt: input.now
            }
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 60_000 }
      )
      .catch(async (error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ["P2002", "P2034"].includes(error.code)
        ) {
          const concurrent = await this.client.officialNotice.findUnique({
            where: { idempotencyKey: input.idempotencyKey },
            select: {
              publicId: true,
              requestFingerprint: true,
              issuerType: true,
              issuerShopId: true
            }
          });
          if (concurrent) {
            this.assertIssuerScope(concurrent, input.issuerScope);
            if (concurrent.requestFingerprint !== input.requestFingerprint)
              throw this.conflict("error.idempotency_key_reused");
            resultPublicId = concurrent.publicId;
            return;
          }
          throw this.conflict("error.official_notice.concurrent_change");
        }
        throw error;
      });
    return this.requirePayload(resultPublicId);
  }

  public async listBackoffice(input: {
    issuerScope: NoticeIssuerReadScope;
    page: number;
    pageSize: number;
    status?: OfficialNoticeStatusCode;
    level?: OfficialNoticeLevelCode;
  }): Promise<{ list: OfficialNoticePayload[]; total: number }> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.OfficialNoticeWhereInput = {
      deletedAt: null,
      ...this.issuerWhere(input.issuerScope),
      ...(input.status ? { status: statusToDb[input.status] } : {}),
      ...(input.level ? { level: levelToDb[input.level] } : {})
    };
    const [records, total] = await Promise.all([
      this.client.officialNotice.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: pagination.skip,
        take: pagination.take,
        include: { translations: { where: { deletedAt: null }, orderBy: { id: "asc" } } }
      }),
      this.client.officialNotice.count({ where })
    ]);
    const counts = await this.deliveryCounts(records.map((record) => record.id));
    return {
      list: records.map((record) => this.mapPayload(record as NoticeRecord, counts.get(record.id))),
      total
    };
  }

  public async dispatchNotice(publicId: string, now: Date): Promise<OfficialNoticePayload> {
    const notice = await this.client.officialNotice.findFirst({
      where: { publicId, deletedAt: null },
      select: { id: true, status: true, scheduledAt: true }
    });
    if (!notice) throw this.notFound();
    if (
      notice.status === OfficialNoticeStatus.CANCELLED ||
      notice.status === OfficialNoticeStatus.ARCHIVED
    ) {
      throw this.conflict("error.official_notice.not_dispatchable");
    }
    if (notice.scheduledAt && notice.scheduledAt.getTime() > now.getTime()) {
      throw this.conflict("error.official_notice.not_due");
    }
    const claimed = await this.client.officialNotice.updateMany({
      where: {
        id: notice.id,
        status: { in: [OfficialNoticeStatus.SCHEDULED, OfficialNoticeStatus.SENDING] },
        deletedAt: null
      },
      data: { status: OfficialNoticeStatus.SENDING, updatedAt: now }
    });
    if (claimed.count === 0) return this.requirePayload(publicId);
    const deliveries = await this.client.noticeDelivery.findMany({
      where: {
        noticeId: notice.id,
        OR: [
          {
            status: NoticeDeliveryStatus.PENDING,
            OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }]
          },
          {
            status: NoticeDeliveryStatus.FAILED,
            attemptCount: { lt: this.maxDeliveryAttempts },
            nextAttemptAt: { lte: now }
          }
        ],
        deletedAt: null
      },
      orderBy: { id: "asc" },
      select: { id: true, attemptCount: true },
      take: 250
    });
    for (const delivery of deliveries) {
      try {
        await this.deliverOne(delivery.id, notice.id, now);
      } catch (error) {
        await this.client.noticeDelivery.updateMany({
          where: {
            id: delivery.id,
            attemptCount: delivery.attemptCount,
            status: { in: [NoticeDeliveryStatus.PENDING, NoticeDeliveryStatus.FAILED] },
            deletedAt: null
          },
          data: {
            status: NoticeDeliveryStatus.FAILED,
            attemptCount: { increment: 1 },
            lastAttemptAt: now,
            failedAt: now,
            nextAttemptAt: getOfficialNoticeRetryAt(
              delivery.attemptCount + 1,
              this.maxDeliveryAttempts,
              now
            ),
            lastError: this.errorName(error),
            updatedAt: now
          }
        });
      }
    }
    await this.client.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT id FROM official_notices WHERE id = ${notice.id} AND deleted_at IS NULL FOR UPDATE`
      );
      const retryable = await transaction.noticeDelivery.count({
        where: {
          noticeId: notice.id,
          deletedAt: null,
          OR: [
            { status: NoticeDeliveryStatus.PENDING },
            { status: NoticeDeliveryStatus.FAILED, attemptCount: { lt: this.maxDeliveryAttempts } }
          ]
        }
      });
      if (retryable === 0) {
        await transaction.officialNotice.updateMany({
          where: { id: notice.id, status: OfficialNoticeStatus.SENDING, deletedAt: null },
          data: {
            status: OfficialNoticeStatus.SENT,
            sentAt: now,
            lockVersion: { increment: 1 },
            updatedAt: now
          }
        });
      }
    });
    return this.requirePayload(publicId);
  }

  public async dispatchDueBatch(
    now: Date,
    batchSize: number
  ): Promise<OfficialNoticeDispatchResult> {
    const due = await this.client.officialNotice.findMany({
      where: {
        status: { in: [OfficialNoticeStatus.SCHEDULED, OfficialNoticeStatus.SENDING] },
        scheduledAt: { lte: now },
        deletedAt: null,
        OR: [
          { deliveries: { some: this.dueDeliveryWhere(now) } },
          {
            deliveries: {
              none: {
                deletedAt: null,
                OR: [
                  { status: NoticeDeliveryStatus.PENDING },
                  {
                    status: NoticeDeliveryStatus.FAILED,
                    attemptCount: { lt: this.maxDeliveryAttempts }
                  }
                ]
              }
            }
          }
        ]
      },
      orderBy: [{ scheduledAt: "asc" }, { id: "asc" }],
      take: batchSize,
      select: { publicId: true }
    });
    let delivered = 0;
    let failed = 0;
    for (const notice of due) {
      try {
        const result = await this.dispatchNotice(notice.publicId, now);
        delivered += result.delivery.delivered;
        failed += result.delivery.failed;
      } catch (error) {
        // A lifecycle command can win after this batch selected the notice.
        if (error instanceof AppError && error.message === "error.official_notice.not_dispatchable")
          continue;
        throw error;
      }
    }
    return { notices: due.length, delivered, failed };
  }

  public cancel(input: LifecycleMutationInput): Promise<OfficialNoticePayload> {
    return this.lifecycle(input, "cancel");
  }

  public archive(input: LifecycleMutationInput): Promise<OfficialNoticePayload> {
    return this.lifecycle(input, "archive");
  }

  public async retryFailures(input: LifecycleMutationInput): Promise<OfficialNoticePayload> {
    await this.client.$transaction(async (transaction) => {
      const notice = await this.lockNotice(transaction, input.publicId, input.issuerScope);
      await this.assertActiveMerchantPublisher(transaction, input.issuerScope, input.now);
      if (await this.isLifecycleReplay(transaction, notice.id, input)) return;
      if (
        !new Set<OfficialNoticeStatus>([
          OfficialNoticeStatus.SENT,
          OfficialNoticeStatus.SENDING
        ]).has(notice.status)
      ) {
        throw this.conflict("error.official_notice.not_retryable");
      }
      this.assertVersion(notice.lockVersion, input.expectedLockVersion);
      const retried = await transaction.noticeDelivery.updateMany({
        where: { noticeId: notice.id, status: NoticeDeliveryStatus.FAILED, deletedAt: null },
        data: {
          status: NoticeDeliveryStatus.PENDING,
          attemptCount: 0,
          nextAttemptAt: input.now,
          failedAt: null,
          lastError: null,
          updatedAt: input.now
        }
      });
      if (retried.count === 0) throw this.conflict("error.official_notice.no_failed_deliveries");
      await transaction.officialNotice.update({
        where: { id: notice.id },
        data: {
          status: OfficialNoticeStatus.SENDING,
          scheduledAt: input.now,
          sentAt: null,
          updatedById: input.actorUserId,
          lockVersion: { increment: 1 },
          updatedAt: input.now
        }
      });
      await this.auditLifecycle(transaction, notice.id, "retry_failures", input, {
        retried: retried.count
      });
    });
    return this.requirePayload(input.publicId);
  }

  public async listMine(input: {
    recipientIdentityId: number;
    locale: ContentLocaleCode;
    unreadOnly: boolean;
    page: number;
    pageSize: number;
  }): Promise<{ list: RecipientOfficialNoticePayload[]; total: number }> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.NoticeDeliveryWhereInput = {
      recipientIdentityId: input.recipientIdentityId,
      status: NoticeDeliveryStatus.DELIVERED,
      ...(input.unreadOnly ? { readAt: null } : {}),
      deletedAt: null,
      notice: {
        status: {
          in: [
            OfficialNoticeStatus.SENDING,
            OfficialNoticeStatus.SENT,
            OfficialNoticeStatus.ARCHIVED
          ]
        },
        deletedAt: null
      }
    };
    const [deliveries, total] = await Promise.all([
      this.client.noticeDelivery.findMany({
        where,
        orderBy: [{ deliveredAt: "desc" }, { id: "desc" }],
        skip: pagination.skip,
        take: pagination.take,
        include: {
          notice: {
            include: { translations: { where: { deletedAt: null }, orderBy: { id: "asc" } } }
          }
        }
      }),
      this.client.noticeDelivery.count({ where })
    ]);
    return {
      list: deliveries.map((delivery) => {
        const translations = delivery.notice.translations;
        const translation =
          translations.find((item) => item.locale === localeToDb[input.locale]) ??
          translations.find((item) => item.locale === delivery.notice.sourceLocale) ??
          translations[0];
        if (!translation || !delivery.deliveredAt)
          throw this.conflict("error.official_notice.translation_missing");
        return {
          publicId: delivery.notice.publicId,
          level: levelFromDb[delivery.notice.level],
          title: translation.title,
          summary: translation.summary,
          blocks: this.blocks(translation.blocks),
          targetSummary: delivery.notice.targetSummary,
          sentAt: delivery.deliveredAt,
          readAt: delivery.readAt
        };
      }),
      total
    };
  }

  public async markRead(input: {
    publicId: string;
    recipientIdentityId: number;
    actorUserId: number;
    context: { ip: string; userAgent?: string };
    now: Date;
  }): Promise<{ publicId: string; readAt: Date }> {
    const candidate = await this.client.noticeDelivery.findFirst({
      where: {
        recipientIdentityId: input.recipientIdentityId,
        recipientUserId: input.actorUserId,
        status: NoticeDeliveryStatus.DELIVERED,
        deletedAt: null,
        notice: { publicId: input.publicId, deletedAt: null }
      },
      select: { id: true }
    });
    if (!candidate) throw this.notFound();
    return this.client.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`SELECT id FROM notice_deliveries
        WHERE id = ${candidate.id}
        AND recipient_identity_id = ${input.recipientIdentityId} AND recipient_user_id = ${input.actorUserId}
        AND deleted_at IS NULL FOR UPDATE`);
      const delivery = await transaction.noticeDelivery.findFirst({
        where: {
          recipientIdentityId: input.recipientIdentityId,
          recipientUserId: input.actorUserId,
          status: NoticeDeliveryStatus.DELIVERED,
          deletedAt: null,
          notice: { publicId: input.publicId, deletedAt: null }
        },
        select: { id: true, readAt: true, notificationId: true, noticeId: true }
      });
      if (!delivery) throw this.notFound();
      const readAt = delivery.readAt ?? input.now;
      if (!delivery.readAt) {
        await transaction.noticeDelivery.update({
          where: { id: delivery.id },
          data: { readAt, updatedAt: input.now }
        });
        if (delivery.notificationId) {
          await transaction.notification.updateMany({
            where: { id: delivery.notificationId, readAt: null, deletedAt: null },
            data: { readAt, updatedAt: input.now }
          });
        }
        await transaction.auditLog.create({
          data: {
            actorId: input.actorUserId,
            action: "official_notice.read",
            targetType: "OfficialNotice",
            targetId: delivery.noticeId,
            ip: input.context.ip,
            userAgent: input.context.userAgent ?? null,
            metadata: { publicId: input.publicId, recipientIdentityId: input.recipientIdentityId },
            createdAt: input.now
          }
        });
      }
      return { publicId: input.publicId, readAt };
    });
  }

  private async deliverOne(deliveryId: number, noticeId: number, now: Date): Promise<void> {
    const event = await this.client.$transaction(
      async (transaction): Promise<RealtimeEvent | undefined> => {
        // Acquire locks before any consistent read establishes a Repeatable Read snapshot.
        await transaction.$queryRaw(
          Prisma.sql`SELECT id FROM official_notices WHERE id = ${noticeId} AND deleted_at IS NULL FOR UPDATE`
        );
        const locked = await transaction.$queryRaw<Array<{ id: number }>>(
          Prisma.sql`SELECT id FROM notice_deliveries WHERE id = ${deliveryId} AND deleted_at IS NULL FOR UPDATE`
        );
        if (locked.length !== 1) return;
        const delivery = await transaction.noticeDelivery.findUnique({
          where: { id: deliveryId },
          include: {
            notice: {
              include: { translations: { where: { deletedAt: null }, orderBy: { id: "asc" } } }
            }
          }
        });
        if (
          !delivery ||
          !new Set<NoticeDeliveryStatus>([
            NoticeDeliveryStatus.PENDING,
            NoticeDeliveryStatus.FAILED
          ]).has(delivery.status)
        )
          return;
        if (delivery.notice.status !== OfficialNoticeStatus.SENDING) return;
        if (delivery.nextAttemptAt && delivery.nextAttemptAt > now) return;
        if (
          delivery.status === NoticeDeliveryStatus.FAILED &&
          delivery.attemptCount >= this.maxDeliveryAttempts
        )
          return;
        const translation =
          delivery.notice.translations.find(
            (item) => item.locale === delivery.notice.sourceLocale
          ) ?? delivery.notice.translations[0];
        if (!translation) throw this.conflict("error.official_notice.translation_missing");
        const notification = await transaction.notification.create({
          data: {
            recipientUserId: delivery.recipientUserId,
            recipientIdentityId: delivery.recipientIdentityId,
            actorUserId: delivery.notice.createdById,
            actorIdentityId: delivery.notice.createdByIdentityId,
            type: NotificationType.SYSTEM,
            title: translation.title,
            body: translation.summary,
            payload: {
              kind: "official_notice",
              publicId: delivery.notice.publicId,
              level: levelFromDb[delivery.notice.level],
              targetSummary: delivery.notice.targetSummary
            } satisfies Prisma.InputJsonValue,
            createdAt: now,
            updatedAt: now
          }
        });
        await transaction.noticeDelivery.update({
          where: { id: delivery.id },
          data: {
            notificationId: notification.id,
            status: NoticeDeliveryStatus.DELIVERED,
            attemptCount: { increment: 1 },
            nextAttemptAt: null,
            lastAttemptAt: now,
            deliveredAt: now,
            failedAt: null,
            lastError: null,
            updatedAt: now
          }
        });
        return {
          id: `official-notice:${delivery.id}`,
          type: "notification.created",
          recipientUserId: delivery.recipientUserId,
          recipientIdentityId: delivery.recipientIdentityId,
          payload: { kind: "official_notice", publicId: delivery.notice.publicId },
          createdAt: now.toISOString()
        };
      }
    );
    if (event) {
      try {
        this.eventGateway?.publish(event);
      } catch {
        // Delivery is committed; reconnecting clients recover it through the inbox API.
      }
    }
  }

  private async lifecycle(
    input: LifecycleMutationInput,
    action: "cancel" | "archive"
  ): Promise<OfficialNoticePayload> {
    await this.client.$transaction(async (transaction) => {
      const notice = await this.lockNotice(transaction, input.publicId, input.issuerScope);
      await this.assertActiveMerchantPublisher(transaction, input.issuerScope, input.now);
      if (await this.isLifecycleReplay(transaction, notice.id, input)) return;
      this.assertVersion(notice.lockVersion, input.expectedLockVersion);
      if (action === "cancel") {
        if (
          !new Set<OfficialNoticeStatus>([
            OfficialNoticeStatus.DRAFT,
            OfficialNoticeStatus.PENDING_REVIEW,
            OfficialNoticeStatus.APPROVED,
            OfficialNoticeStatus.SCHEDULED
          ]).has(notice.status)
        ) {
          throw this.conflict("error.official_notice.not_cancellable");
        }
        await transaction.noticeDelivery.updateMany({
          where: { noticeId: notice.id, status: NoticeDeliveryStatus.PENDING, deletedAt: null },
          data: {
            status: NoticeDeliveryStatus.CANCELLED,
            nextAttemptAt: null,
            updatedAt: input.now
          }
        });
        await transaction.officialNotice.update({
          where: { id: notice.id },
          data: {
            status: OfficialNoticeStatus.CANCELLED,
            cancelledAt: input.now,
            cancelledById: input.actorUserId,
            updatedById: input.actorUserId,
            lockVersion: { increment: 1 },
            updatedAt: input.now
          }
        });
      } else {
        if (
          !new Set<OfficialNoticeStatus>([
            OfficialNoticeStatus.SENT,
            OfficialNoticeStatus.CANCELLED
          ]).has(notice.status)
        ) {
          throw this.conflict("error.official_notice.not_archivable");
        }
        await transaction.officialNotice.update({
          where: { id: notice.id },
          data: {
            status: OfficialNoticeStatus.ARCHIVED,
            archivedAt: input.now,
            archivedById: input.actorUserId,
            updatedById: input.actorUserId,
            lockVersion: { increment: 1 },
            updatedAt: input.now
          }
        });
      }
      await this.auditLifecycle(transaction, notice.id, action, input);
    });
    return this.requirePayload(input.publicId);
  }

  private async lockNotice(
    transaction: Prisma.TransactionClient,
    publicId: string,
    issuerScope: NoticeIssuerScope
  ) {
    const locked =
      issuerScope.type === "platform"
        ? await transaction.$queryRaw<Array<{ id: number }>>(
            Prisma.sql`SELECT id FROM official_notices WHERE public_id = ${publicId} AND issuer_type = 'platform' AND deleted_at IS NULL FOR UPDATE`
          )
        : await transaction.$queryRaw<Array<{ id: number }>>(
            Prisma.sql`SELECT id FROM official_notices WHERE public_id = ${publicId} AND issuer_type = 'shop' AND issuer_shop_id = ${issuerScope.shopId} AND deleted_at IS NULL FOR UPDATE`
          );
    if (locked.length !== 1) throw this.notFound();
    return transaction.officialNotice.findUniqueOrThrow({
      where: { id: locked[0].id },
      select: { id: true, status: true, lockVersion: true }
    });
  }

  private dueDeliveryWhere(now: Date): Prisma.NoticeDeliveryWhereInput {
    return {
      deletedAt: null,
      OR: [
        {
          status: NoticeDeliveryStatus.PENDING,
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }]
        },
        {
          status: NoticeDeliveryStatus.FAILED,
          attemptCount: { lt: this.maxDeliveryAttempts },
          nextAttemptAt: { lte: now }
        }
      ]
    };
  }

  private async isLifecycleReplay(
    transaction: Prisma.TransactionClient,
    noticeId: number,
    input: LifecycleMutationInput
  ): Promise<boolean> {
    const record = await transaction.auditLog.findFirst({
      where: {
        targetType: "OfficialNotice",
        targetId: noticeId,
        metadata: { path: "$.idempotencyKey", equals: input.idempotencyKey },
        deletedAt: null
      },
      select: { metadata: true }
    });
    if (!record) return false;
    const metadata = record.metadata as Record<string, unknown> | null;
    if (metadata?.requestFingerprint !== input.requestFingerprint)
      throw this.conflict("error.idempotency_key_reused");
    return true;
  }

  private async auditLifecycle(
    transaction: Prisma.TransactionClient,
    noticeId: number,
    action: string,
    input: LifecycleMutationInput,
    extra: Record<string, unknown> = {}
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        actorId: input.actorUserId,
        action: `official_notice.${action}`,
        targetType: "OfficialNotice",
        targetId: noticeId,
        ip: input.context.ip,
        userAgent: input.context.userAgent ?? null,
        metadata: {
          publicId: input.publicId,
          reason: input.reason,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint: input.requestFingerprint,
          ...extra
        } as Prisma.InputJsonValue,
        createdAt: input.now
      }
    });
  }

  private async snapshotAudience(
    transaction: Prisma.TransactionClient,
    noticeId: number,
    input: CreateAndPlanOfficialNoticeInput
  ): Promise<number> {
    let afterId = 0;
    let total = 0;
    const foundUsers = new Set<number>();
    while (true) {
      const recipients = await transaction.userIdentity.findMany({
        where: {
          ...(input.issuerScope.type === "platform"
            ? buildOfficialNoticeRecipientWhere(input.audience as OfficialNoticeAudienceInput)
            : buildMerchantNoticeRecipientWhere(
                input.issuerScope.shopId,
                input.audience as MerchantNoticeAudienceInput,
                input.now
              )),
          id: { gt: afterId }
        },
        orderBy: { id: "asc" },
        take: 500,
        select: {
          id: true,
          userId: true,
          type: true,
          scopeType: true,
          scopeId: true,
          displayName: true,
          user: { select: { needoId: true } }
        }
      });
      if (recipients.length === 0) break;
      afterId = recipients[recipients.length - 1].id;
      total += recipients.length;
      if (input.audience.type === "exact_users")
        for (const recipient of recipients) foundUsers.add(recipient.userId);
      await transaction.noticeAudience.createMany({
        data: recipients.map((recipient) => ({
          noticeId,
          recipientUserId: recipient.userId,
          recipientIdentityId: recipient.id,
          snapshotNeedoId: recipient.user.needoId,
          snapshotIdentityType: recipient.type,
          snapshotDisplayName: recipient.displayName,
          snapshotScopeType: recipient.scopeType,
          snapshotScopeId: recipient.scopeId,
          createdAt: input.now,
          updatedAt: input.now
        }))
      });
      const audiences = await transaction.noticeAudience.findMany({
        where: {
          noticeId,
          recipientIdentityId: { in: recipients.map((recipient) => recipient.id) },
          deletedAt: null
        },
        orderBy: { id: "asc" },
        take: 500,
        select: { id: true, recipientUserId: true, recipientIdentityId: true }
      });
      await transaction.noticeDelivery.createMany({
        data: audiences.map((audience) => ({
          noticeId,
          audienceId: audience.id,
          recipientUserId: audience.recipientUserId,
          recipientIdentityId: audience.recipientIdentityId,
          idempotencyKey: `official-notice:${input.publicId}:identity:${audience.recipientIdentityId}`,
          status: NoticeDeliveryStatus.PENDING,
          nextAttemptAt: input.scheduledAt,
          createdAt: input.now,
          updatedAt: input.now
        }))
      });
    }
    if (total === 0) throw this.conflict("error.official_notice.audience_empty");
    if (
      input.audience.type === "exact_users" &&
      input.audience.userIds.some((id) => !foundUsers.has(id))
    ) {
      throw this.conflict("error.official_notice.target_unavailable");
    }
    return total;
  }

  private async requirePayload(publicId: string): Promise<OfficialNoticePayload> {
    const record = await this.client.officialNotice.findFirst({
      where: { publicId, deletedAt: null },
      include: { translations: { where: { deletedAt: null }, orderBy: { id: "asc" } } }
    });
    if (!record) throw this.notFound();
    const counts = await this.deliveryCounts([record.id]);
    return this.mapPayload(record as NoticeRecord, counts.get(record.id));
  }

  private async deliveryCounts(noticeIds: number[]): Promise<Map<number, DeliveryCounts>> {
    if (noticeIds.length === 0) return new Map();
    const [groups, reads, audiences] = await Promise.all([
      this.client.noticeDelivery.groupBy({
        by: ["noticeId", "status"],
        where: { noticeId: { in: noticeIds }, deletedAt: null },
        _count: { _all: true }
      }),
      this.client.noticeDelivery.groupBy({
        by: ["noticeId"],
        where: { noticeId: { in: noticeIds }, readAt: { not: null }, deletedAt: null },
        _count: { _all: true }
      }),
      this.client.noticeAudience.groupBy({
        by: ["noticeId"],
        where: { noticeId: { in: noticeIds }, deletedAt: null },
        _count: { _all: true }
      })
    ]);
    const result = new Map<number, DeliveryCounts & { audience: number }>();
    for (const id of noticeIds)
      result.set(id, { pending: 0, delivered: 0, failed: 0, read: 0, audience: 0 });
    for (const group of groups) {
      const current = result.get(group.noticeId);
      if (!current) continue;
      if (group.status === NoticeDeliveryStatus.PENDING) current.pending = group._count._all;
      if (group.status === NoticeDeliveryStatus.DELIVERED) current.delivered = group._count._all;
      if (group.status === NoticeDeliveryStatus.FAILED) current.failed = group._count._all;
    }
    for (const group of reads) {
      const current = result.get(group.noticeId);
      if (current) current.read = group._count._all;
    }
    for (const group of audiences) {
      const current = result.get(group.noticeId);
      if (current) current.audience = group._count._all;
    }
    return new Map([...result.entries()].map(([id, value]) => [id, value]));
  }

  private mapPayload(
    record: NoticeRecord,
    counts?: DeliveryCounts & { audience?: number }
  ): OfficialNoticePayload {
    const translations = Object.fromEntries(
      record.translations.map((translation) => [
        localeFromDb[translation.locale],
        {
          title: translation.title,
          summary: translation.summary,
          blocks: this.blocks(translation.blocks),
          sourceLocale: localeFromDb[translation.sourceLocale],
          isInitialCopy: translation.isInitialCopy
        }
      ])
    ) as OfficialNoticePayload["translations"];
    return {
      publicId: record.publicId,
      level: levelFromDb[record.level],
      status: statusFromDb[record.status],
      sourceLocale: localeFromDb[record.sourceLocale],
      targetSummary: record.targetSummary,
      scheduledAt: record.scheduledAt,
      sentAt: record.sentAt,
      cancelledAt: record.cancelledAt,
      archivedAt: record.archivedAt,
      lockVersion: record.lockVersion,
      translations,
      audienceCount: counts && "audience" in counts ? (counts.audience ?? 0) : 0,
      delivery: {
        pending: counts?.pending ?? 0,
        delivered: counts?.delivered ?? 0,
        failed: counts?.failed ?? 0,
        read: counts?.read ?? 0
      },
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    };
  }

  private blocks(value: Prisma.JsonValue): OfficialNoticeBlockInput[] {
    return Array.isArray(value) ? (value as unknown as OfficialNoticeBlockInput[]) : [];
  }

  private assertVersion(actual: number, expected: number): void {
    if (actual !== expected) throw this.conflict("error.official_notice.version_conflict");
  }

  private issuerWhere(issuerScope: NoticeIssuerReadScope): Prisma.OfficialNoticeWhereInput {
    return issuerScope.type === "platform"
      ? { issuerType: OfficialNoticeIssuerType.PLATFORM }
      : { issuerType: OfficialNoticeIssuerType.SHOP, issuerShopId: issuerScope.shopId };
  }

  private assertIssuerScope(
    notice: { issuerType: OfficialNoticeIssuerType; issuerShopId: number | null },
    issuerScope: NoticeIssuerScope
  ): void {
    const matches =
      issuerScope.type === "platform"
        ? notice.issuerType === OfficialNoticeIssuerType.PLATFORM
        : notice.issuerType === OfficialNoticeIssuerType.SHOP &&
          notice.issuerShopId === issuerScope.shopId;
    if (!matches) throw this.conflict("error.idempotency_key_reused");
  }

  private async assertActiveMerchantPublisher(
    client: PrismaClient | Prisma.TransactionClient,
    issuerScope: NoticeIssuerScope,
    now: Date
  ): Promise<void> {
    if (issuerScope.type === "platform") return;
    const employee = await client.shopEmployee.findFirst({
      where: buildActiveMerchantNoticePublisherWhere(
        issuerScope.shopId,
        issuerScope.actorUserId,
        now
      ),
      select: { id: true }
    });
    if (!employee) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_FORBIDDEN,
        message: "error.identity.forbidden",
        statusCode: 403
      });
    }
  }

  private errorName(error: unknown): string {
    return (error instanceof Error ? error.name : typeof error).slice(0, 255);
  }

  private notFound(): AppError {
    return new AppError({
      code: ERROR_CODES.NOT_FOUND,
      message: "error.official_notice.not_found",
      statusCode: 404
    });
  }

  private conflict(message: string): AppError {
    return new AppError({ code: ERROR_CODES.VALIDATION, message, statusCode: 409 });
  }
}
