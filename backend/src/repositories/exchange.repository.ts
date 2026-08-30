import {
  ContentLocale,
  ExchangePostStatus as DatabaseExchangePostStatus,
  ExchangePostType as DatabaseExchangePostType,
  ExchangeServiceMode as DatabaseExchangeServiceMode
} from "@prisma/client";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { ContentLocaleCode } from "../constants/content-locales";
import { prisma } from "../prisma/client";
import type {
  ExchangeActorLookup,
  ExchangeActorRecord,
  ExchangeCommentRepositoryInput,
  ExchangeLikeRepositoryInput,
  ExchangeMutationResult,
  ExchangePublishRepositoryInput,
  ExchangeRepositoryPort,
  ExchangeShareRepositoryInput,
  ExchangeWithdrawRepositoryInput
} from "../services/exchange.service";
import type {
  ExchangeCommentPage,
  ExchangeCommentPayload,
  ExchangeInteractionCounts,
  ExchangeListInput,
  ExchangePostPage,
  ExchangePostPayload,
  ExchangePostStatus,
  ExchangePostType,
  ExchangeServiceMode
} from "../types/exchange.types";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import { toAuditLogCreateData } from "./audit-log.repository";

const typeToDatabase: Record<ExchangePostType, DatabaseExchangePostType> = {
  demand: DatabaseExchangePostType.DEMAND,
  intelligence: DatabaseExchangePostType.INTELLIGENCE
};

const typeFromDatabase: Record<DatabaseExchangePostType, ExchangePostType> = {
  [DatabaseExchangePostType.DEMAND]: "demand",
  [DatabaseExchangePostType.INTELLIGENCE]: "intelligence"
};

const statusFromDatabase: Record<DatabaseExchangePostStatus, ExchangePostStatus> = {
  [DatabaseExchangePostStatus.PUBLISHED]: "published",
  [DatabaseExchangePostStatus.WITHDRAWN]: "withdrawn",
  [DatabaseExchangePostStatus.EXPIRED]: "expired"
};

const serviceModeFromDatabase: Record<DatabaseExchangeServiceMode, ExchangeServiceMode> = {
  [DatabaseExchangeServiceMode.STORE]: "store",
  [DatabaseExchangeServiceMode.ONSITE]: "onsite",
  [DatabaseExchangeServiceMode.FLEXIBLE]: "flexible"
};

const localeFromDatabase: Record<ContentLocale, ContentLocaleCode> = {
  [ContentLocale.ZH_CN]: "zh-CN",
  [ContentLocale.ZH_TW]: "zh-TW",
  [ContentLocale.EN]: "en",
  [ContentLocale.JA]: "ja",
  [ContentLocale.KO]: "ko"
};

const localeToDatabase: Record<ContentLocaleCode, ContentLocale> = {
  "zh-CN": ContentLocale.ZH_CN,
  "zh-TW": ContentLocale.ZH_TW,
  en: ContentLocale.EN,
  ja: ContentLocale.JA,
  ko: ContentLocale.KO
};

const serviceModeToDatabase: Record<ExchangeServiceMode, DatabaseExchangeServiceMode> = {
  store: DatabaseExchangeServiceMode.STORE,
  onsite: DatabaseExchangeServiceMode.ONSITE,
  flexible: DatabaseExchangeServiceMode.FLEXIBLE
};

const postInclude = (viewerIdentityId: number) =>
  ({
    demand: { where: { deletedAt: null } },
    intelligence: { where: { deletedAt: null } },
    likes: {
      where: { actorIdentityId: viewerIdentityId, deletedAt: null },
      select: { id: true },
      take: 1
    },
    _count: {
      select: {
        comments: { where: { deletedAt: null } },
        likes: { where: { deletedAt: null } },
        shares: { where: { deletedAt: null } }
      }
    }
  }) satisfies Prisma.ExchangePostInclude;

type ExchangePostRecord = Prisma.ExchangePostGetPayload<{
  include: ReturnType<typeof postInclude>;
}>;

const isServiceAreaList = (value: Prisma.JsonValue): value is string[] =>
  Array.isArray(value) && value.every((area) => typeof area === "string");

export class ExchangePostRepository implements ExchangeRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async resolveActor(input: ExchangeActorLookup): Promise<ExchangeActorRecord | null> {
    const identity = await this.client.userIdentity.findFirst({
      where: {
        id: input.identityId,
        userId: input.userId,
        type: input.identityType,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        isActive: true,
        deletedAt: null,
        user: { is: { isActive: true, deletedAt: null } }
      },
      select: {
        id: true,
        userId: true,
        type: true,
        scopeType: true,
        scopeId: true,
        displayName: true,
        publicIdentifier: { select: { publicId: true, status: true, deletedAt: true } },
        user: { select: { username: true, avatarUrl: true, needoId: true } }
      }
    });
    if (!identity) return null;
    const directPublicId =
      identity.publicIdentifier?.status === "ACTIVE" &&
      identity.publicIdentifier.deletedAt === null
        ? identity.publicIdentifier.publicId
        : null;
    const effectivePublicId = directPublicId ??
      (["customer", "user", "u"].includes(identity.type) ? identity.user.needoId : null);
    if (effectivePublicId !== input.publicId) return null;
    return {
      userId: identity.userId,
      identityId: identity.id,
      identityType: identity.type,
      scopeType: identity.scopeType,
      scopeId: identity.scopeId,
      publicId: effectivePublicId,
      displayName: identity.displayName ?? identity.user.username,
      avatarUrl: identity.user.avatarUrl
    };
  }

  public async listPosts(input: ExchangeListInput): Promise<ExchangePostPage> {
    const pagination = toPrismaPagination({ page: input.page, pageSize: input.pageSize });
    const where = {
      type: typeToDatabase[input.type],
      status: DatabaseExchangePostStatus.PUBLISHED,
      expiresAt: { gt: input.now },
      ...(input.authorIdentityId ? { ownerIdentityId: input.authorIdentityId } : {}),
      deletedAt: null
    } satisfies Prisma.ExchangePostWhereInput;

    const [rows, total] = await Promise.all([
      this.client.exchangePost.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: pagination.skip,
        take: pagination.take,
        include: postInclude(input.viewerIdentityId)
      }),
      this.client.exchangePost.count({ where })
    ]);

    return buildPaginatedResponse(
      rows.map((row) => this.mapPost(row, input.viewerIdentityId, input.now)),
      total,
      pagination
    );
  }

  public async findPostById(
    postId: number,
    viewerIdentityId: number,
    now: Date
  ): Promise<ExchangePostPayload | null> {
    const row = await this.client.exchangePost.findFirst({
      where: { id: postId, deletedAt: null },
      include: postInclude(viewerIdentityId)
    });

    return row ? this.mapPost(row, viewerIdentityId, now) : null;
  }

  public async listComments(
    postId: number,
    input: { page: number; pageSize: number }
  ): Promise<ExchangeCommentPage> {
    const pagination = toPrismaPagination(input);
    const where = { postId, deletedAt: null } satisfies Prisma.ExchangeCommentWhereInput;
    const [rows, total] = await Promise.all([
      this.client.exchangeComment.findMany({
        where,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.client.exchangeComment.count({ where })
    ]);

    return buildPaginatedResponse(
      rows.map((row) => this.mapComment(row)),
      total,
      pagination
    );
  }

  public async publishPost(
    input: ExchangePublishRepositoryInput
  ): Promise<ExchangeMutationResult<ExchangePostPayload>> {
    const ownerIdentityId = input.actor.ownerIdentityId ?? input.actor.identityId;
    try {
      return await this.client.$transaction(async (transaction) => {
        const existing = await transaction.exchangePost.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          include: postInclude(ownerIdentityId)
        });
        if (existing) {
          return {
            kind: "replayed",
            value: this.mapPost(existing, ownerIdentityId, input.now)
          };
        }

        const created = await transaction.exchangePost.create({
          data: {
            authorUserId: input.actor.userId,
            authorIdentityId: input.actor.identityId,
            ownerIdentityId,
            publisherPublicId: input.actor.publicId,
            publisherIdentityType: input.actor.identityType,
            publisherDisplayName: input.actor.displayName,
            publisherAvatarUrl: input.actor.avatarUrl,
            type: typeToDatabase[input.input.type],
            status: DatabaseExchangePostStatus.PUBLISHED,
            title: input.input.title,
            detail: input.input.detail,
            contentLocale: localeToDatabase[input.input.contentLocale],
            areaLabel: input.input.areaLabel,
            serviceStartAt: input.input.serviceStartAt,
            serviceEndAt: input.input.serviceEndAt,
            expiresAt: input.input.expiresAt,
            idempotencyKey: input.idempotencyKey,
            createdAt: input.now,
            updatedAt: input.now,
            ...(input.input.type === "demand"
              ? {
                  demand: {
                    create: {
                      budgetMinJpy: input.input.budgetMinJpy,
                      budgetMaxJpy: input.input.budgetMaxJpy
                    }
                  }
                }
              : {
                  intelligence: {
                    create: {
                      serviceMode: serviceModeToDatabase[input.input.serviceMode],
                      addressLabel: input.input.addressLabel,
                      serviceAreas: input.input.serviceAreas,
                      originalPriceJpy: input.input.originalPriceJpy,
                      campaignPriceJpy: input.input.campaignPriceJpy
                    }
                  }
                })
          },
          include: postInclude(ownerIdentityId)
        });
        await transaction.auditLog.create({
          data: toAuditLogCreateData({ ...input.audit, targetId: created.id })
        });
        return {
          kind: "success",
          value: this.mapPost(created, ownerIdentityId, input.now)
        };
      });
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
      const existing = await this.client.exchangePost.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: postInclude(ownerIdentityId)
      });
      if (!existing) throw error;
      return {
        kind: "replayed",
        value: this.mapPost(existing, ownerIdentityId, input.now)
      };
    }
  }

  public withdrawPost(
    input: ExchangeWithdrawRepositoryInput
  ): Promise<ExchangeMutationResult<ExchangePostPayload>> {
    const ownerIdentityId = input.actor.ownerIdentityId ?? input.actor.identityId;
    return this.client.$transaction(async (transaction) => {
      const current = await transaction.exchangePost.findFirst({
        where: { id: input.postId, deletedAt: null },
        include: postInclude(ownerIdentityId)
      });
      if (!current) return { kind: "not_found" };
      if (current.ownerIdentityId !== ownerIdentityId) return { kind: "forbidden" };
      if (current.status === DatabaseExchangePostStatus.WITHDRAWN) {
        return {
          kind: "replayed",
          value: this.mapPost(current, ownerIdentityId, input.now)
        };
      }
      if (
        current.status !== DatabaseExchangePostStatus.PUBLISHED ||
        current.expiresAt.getTime() <= input.now.getTime()
      ) {
        return { kind: "unavailable" };
      }
      const updated = await transaction.exchangePost.update({
        where: { id: current.id },
        data: {
          status: DatabaseExchangePostStatus.WITHDRAWN,
          withdrawnAt: input.now,
          updatedAt: input.now
        },
        include: postInclude(ownerIdentityId)
      });
      await transaction.auditLog.create({
        data: toAuditLogCreateData({ ...input.audit, targetId: updated.id })
      });
      return {
        kind: "success",
        value: this.mapPost(updated, ownerIdentityId, input.now)
      };
    });
  }

  public async createComment(
    input: ExchangeCommentRepositoryInput
  ): Promise<ExchangeMutationResult<ExchangeCommentPayload>> {
    try {
      return await this.client.$transaction(async (transaction) => {
        const existing = await transaction.exchangeComment.findUnique({
          where: { idempotencyKey: input.idempotencyKey }
        });
        if (existing) return { kind: "replayed", value: this.mapComment(existing) };
        const availability = await this.postAvailability(transaction, input.postId, input.now);
        if (availability !== "available") return { kind: availability };
        const created = await transaction.exchangeComment.create({
          data: {
            postId: input.postId,
            authorUserId: input.actor.userId,
            authorIdentityId: input.actor.identityId,
            authorPublicId: input.actor.publicId,
            authorIdentityType: input.actor.identityType,
            authorDisplayName: input.actor.displayName,
            authorAvatarUrl: input.actor.avatarUrl,
            content: input.input.content,
            idempotencyKey: input.idempotencyKey,
            createdAt: input.now,
            updatedAt: input.now
          }
        });
        await transaction.auditLog.create({
          data: toAuditLogCreateData({ ...input.audit, targetId: input.postId })
        });
        return { kind: "success", value: this.mapComment(created) };
      });
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
      const existing = await this.client.exchangeComment.findUnique({
        where: { idempotencyKey: input.idempotencyKey }
      });
      if (!existing) throw error;
      return { kind: "replayed", value: this.mapComment(existing) };
    }
  }

  public setLike(
    input: ExchangeLikeRepositoryInput
  ): Promise<ExchangeMutationResult<ExchangeInteractionCounts>> {
    const ownerIdentityId = input.actor.ownerIdentityId ?? input.actor.identityId;
    return this.client.$transaction(async (transaction) => {
      const availability = await this.postAvailability(transaction, input.postId, input.now);
      if (availability !== "available") return { kind: availability };
      const existing = await transaction.exchangeLike.findUnique({
        where: {
          postId_actorIdentityId: { postId: input.postId, actorIdentityId: ownerIdentityId }
        }
      });
      let changed = false;
      if (input.liked && !existing) {
        await transaction.exchangeLike.create({
          data: {
            postId: input.postId,
            actorUserId: input.actor.userId,
            actorIdentityId: ownerIdentityId,
            createdAt: input.now,
            updatedAt: input.now
          }
        });
        changed = true;
      } else if (input.liked && existing?.deletedAt) {
        await transaction.exchangeLike.update({
          where: { id: existing.id },
          data: {
            actorIdentityId: ownerIdentityId,
            deletedAt: null,
            updatedAt: input.now
          }
        });
        changed = true;
      } else if (!input.liked && existing && !existing.deletedAt) {
        await transaction.exchangeLike.update({
          where: { id: existing.id },
          data: { deletedAt: input.now, updatedAt: input.now }
        });
        changed = true;
      }
      if (changed) {
        await transaction.auditLog.create({
          data: toAuditLogCreateData({ ...input.audit, targetId: input.postId })
        });
      }
      return {
        kind: changed ? "success" : "replayed",
        value: await this.countInteractions(transaction, input.postId)
      };
    });
  }

  public async recordShare(
    input: ExchangeShareRepositoryInput
  ): Promise<ExchangeMutationResult<ExchangeInteractionCounts>> {
    const ownerIdentityId = input.actor.ownerIdentityId ?? input.actor.identityId;
    try {
      return await this.client.$transaction(async (transaction) => {
        const replay = await transaction.exchangeShare.findFirst({
          where: {
            OR: [
              { idempotencyKey: input.idempotencyKey },
              { postId: input.postId, actorIdentityId: ownerIdentityId }
            ],
            deletedAt: null
          },
          select: { id: true }
        });
        if (replay) {
          return {
            kind: "replayed",
            value: await this.countInteractions(transaction, input.postId)
          };
        }
        const availability = await this.postAvailability(transaction, input.postId, input.now);
        if (availability !== "available") return { kind: availability };
        await transaction.exchangeShare.create({
          data: {
            postId: input.postId,
            actorUserId: input.actor.userId,
            actorIdentityId: ownerIdentityId,
            idempotencyKey: input.idempotencyKey,
            createdAt: input.now,
            updatedAt: input.now
          }
        });
        await transaction.auditLog.create({
          data: toAuditLogCreateData({ ...input.audit, targetId: input.postId })
        });
        return {
          kind: "success",
          value: await this.countInteractions(transaction, input.postId)
        };
      });
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
      return this.client.$transaction(async (transaction) => ({
        kind: "replayed" as const,
        value: await this.countInteractions(transaction, input.postId)
      }));
    }
  }

  public expireDue(now: Date, batchSize: number): Promise<number> {
    return this.client.$transaction(async (transaction) => {
      const due = await transaction.exchangePost.findMany({
        where: {
          status: DatabaseExchangePostStatus.PUBLISHED,
          expiresAt: { lte: now },
          deletedAt: null
        },
        orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
        take: Math.max(1, Math.floor(batchSize)),
        select: { id: true }
      });
      if (due.length === 0) return 0;
      let expired = 0;
      for (const { id } of due) {
        const updated = await transaction.exchangePost.updateMany({
          where: {
            id,
            status: DatabaseExchangePostStatus.PUBLISHED,
            expiresAt: { lte: now },
            deletedAt: null
          },
          data: { status: DatabaseExchangePostStatus.EXPIRED, updatedAt: now }
        });
        if (updated.count !== 1) continue;
        expired += 1;
        await transaction.auditLog.create({
          data: toAuditLogCreateData({
            actorId: null,
            action: "exchange.post.expire",
            targetType: "ExchangePost",
            targetId: id,
            metadata: { expiredAt: now.toISOString() }
          })
        });
      }
      return expired;
    });
  }

  private mapPost(
    row: ExchangePostRecord,
    viewerIdentityId: number,
    now: Date
  ): ExchangePostPayload {
    const expired =
      row.status === DatabaseExchangePostStatus.PUBLISHED &&
      row.expiresAt.getTime() <= now.getTime();
    const status = expired ? "expired" : statusFromDatabase[row.status];
    const intelligence = row.intelligence
      ? (() => {
          if (!isServiceAreaList(row.intelligence.serviceAreas)) {
            throw new Error("error.exchange.invalid_service_areas");
          }
          return {
            serviceMode: serviceModeFromDatabase[row.intelligence.serviceMode],
            addressLabel: row.intelligence.addressLabel,
            serviceAreas: row.intelligence.serviceAreas,
            originalPriceJpy: row.intelligence.originalPriceJpy,
            campaignPriceJpy: row.intelligence.campaignPriceJpy
          };
        })()
      : null;

    return {
      id: row.id,
      type: typeFromDatabase[row.type],
      status,
      title: row.title,
      detail: row.detail,
      contentLocale: localeFromDatabase[row.contentLocale],
      areaLabel: row.areaLabel,
      serviceStartAt: row.serviceStartAt.toISOString(),
      serviceEndAt: row.serviceEndAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      publishedAt: row.createdAt.toISOString(),
      publisher: {
        publicId: row.publisherPublicId,
        identityType: row.publisherIdentityType,
        displayName: row.publisherDisplayName,
        avatarUrl: row.publisherAvatarUrl
      },
      counts: {
        comments: row._count.comments,
        likes: row._count.likes,
        shares: row._count.shares
      },
      viewer: {
        liked: row.likes.length > 0,
        canWithdraw: row.ownerIdentityId === viewerIdentityId && status === "published"
      },
      demand: row.demand
        ? {
            budgetMinJpy: row.demand.budgetMinJpy,
            budgetMaxJpy: row.demand.budgetMaxJpy
          }
        : null,
      intelligence
    };
  }

  private mapComment(row: {
    id: number;
    postId: number;
    authorPublicId: string;
    authorIdentityType: string;
    authorDisplayName: string;
    authorAvatarUrl: string | null;
    content: string;
    createdAt: Date;
  }): ExchangeCommentPayload {
    return {
      id: row.id,
      postId: row.postId,
      author: {
        publicId: row.authorPublicId,
        identityType: row.authorIdentityType,
        displayName: row.authorDisplayName,
        avatarUrl: row.authorAvatarUrl
      },
      content: row.content,
      createdAt: row.createdAt.toISOString()
    };
  }

  private async postAvailability(
    transaction: Prisma.TransactionClient,
    postId: number,
    now: Date
  ): Promise<"available" | "not_found" | "unavailable"> {
    const live = await transaction.exchangePost.findFirst({
      where: {
        id: postId,
        status: DatabaseExchangePostStatus.PUBLISHED,
        expiresAt: { gt: now },
        deletedAt: null
      },
      select: { id: true }
    });
    if (live) return "available";
    const exists = await transaction.exchangePost.findFirst({
      where: { id: postId, deletedAt: null },
      select: { id: true }
    });
    return exists ? "unavailable" : "not_found";
  }

  private async countInteractions(
    transaction: Prisma.TransactionClient,
    postId: number
  ): Promise<ExchangeInteractionCounts> {
    const where = { postId, deletedAt: null };
    const [comments, likes, shares] = await Promise.all([
      transaction.exchangeComment.count({ where }),
      transaction.exchangeLike.count({ where }),
      transaction.exchangeShare.count({ where })
    ]);
    return { comments, likes, shares };
  }

  private isUniqueConflict(error: unknown): boolean {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
  }
}
