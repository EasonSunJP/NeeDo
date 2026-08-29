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
  ExchangeCommentPage,
  ExchangeCommentPayload,
  ExchangeListInput,
  ExchangePostPage,
  ExchangePostPayload,
  ExchangePostStatus,
  ExchangePostType,
  ExchangeServiceMode
} from "../types/exchange.types";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";

type ExchangeClient = PrismaClient | Prisma.TransactionClient;

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

const postInclude = (viewerUserId: number) =>
  ({
    demand: { where: { deletedAt: null } },
    intelligence: { where: { deletedAt: null } },
    likes: {
      where: { actorUserId: viewerUserId, deletedAt: null },
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

export class ExchangePostRepository {
  public constructor(private readonly client: ExchangeClient = prisma) {}

  public async listPosts(input: ExchangeListInput): Promise<ExchangePostPage> {
    const pagination = toPrismaPagination({ page: input.page, pageSize: input.pageSize });
    const where = {
      type: typeToDatabase[input.type],
      status: DatabaseExchangePostStatus.PUBLISHED,
      expiresAt: { gt: input.now },
      deletedAt: null
    } satisfies Prisma.ExchangePostWhereInput;

    const [rows, total] = await Promise.all([
      this.client.exchangePost.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: pagination.skip,
        take: pagination.take,
        include: postInclude(input.viewerUserId)
      }),
      this.client.exchangePost.count({ where })
    ]);

    return buildPaginatedResponse(
      rows.map((row) => this.mapPost(row, input.viewerUserId, input.now)),
      total,
      pagination
    );
  }

  public async findPostById(
    postId: number,
    viewerUserId: number,
    now: Date
  ): Promise<ExchangePostPayload | null> {
    const row = await this.client.exchangePost.findFirst({
      where: { id: postId, deletedAt: null },
      include: postInclude(viewerUserId)
    });

    return row ? this.mapPost(row, viewerUserId, now) : null;
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

  private mapPost(row: ExchangePostRecord, viewerUserId: number, now: Date): ExchangePostPayload {
    const expired = row.expiresAt.getTime() <= now.getTime();
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
        canWithdraw: row.authorUserId === viewerUserId && status === "published"
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
}
