import {
  BookingOrderStatus,
  OrderReviewTargetType,
  Prisma,
  type PrismaClient
} from "@prisma/client";
import { prisma } from "../prisma/client";
import { toAuditLogCreateData, type AuditLogCreateInput } from "./audit-log.repository";

export type UserReviewScope = { scope: "platform" } | { scope: "merchant"; shopId: number };

export interface ReceivedUserReview {
  reviewId: number;
  targetType: "customer";
  rating: number;
  comment: string | null;
  tags: string[];
  createdAt: string;
  amendmentVersion: number;
  order: { id: number; orderNo: string; serviceName: string; startsAt: string };
  reviewer: { needoId: string; displayName: string; avatarUrl: string | null };
}

export interface ReceivedUserReviewPage {
  list: ReceivedUserReview[];
  total: number;
  page: number;
  page_size: 10;
}

export type ReviewAmendmentMutationResult =
  | { kind: "created"; value: { reviewId: number; version: number } }
  | { kind: "not_found" | "version_conflict" };

export interface BackofficeUserReviewRepositoryPort {
  isUserVisibleInMerchantScope(userId: number, shopId: number): Promise<boolean>;
  listReceivedReviews(
    input: UserReviewScope & {
      userId: number;
      page: number;
      pageSize: 10;
    }
  ): Promise<ReceivedUserReviewPage>;
  createAmendmentWithAudit(input: {
    actorId: number;
    reviewId: number;
    rating?: number;
    comment?: string | null;
    tags?: string[];
    reason: string;
    expectedVersion: number;
    audit: AuditLogCreateInput;
  }): Promise<ReviewAmendmentMutationResult>;
}

const reviewSelect = Prisma.validator<Prisma.OrderReviewSelect>()({
  id: true,
  targetType: true,
  rating: true,
  comment: true,
  createdAt: true,
  tags: {
    where: { deletedAt: null },
    orderBy: [{ id: "asc" }],
    select: { label: true }
  },
  amendments: {
    where: { deletedAt: null },
    orderBy: [{ version: "desc" }, { id: "desc" }],
    take: 1,
    select: {
      version: true,
      rating: true,
      comment: true,
      tags: {
        where: { deletedAt: null },
        orderBy: [{ id: "asc" }],
        select: { label: true }
      }
    }
  },
  bookingOrder: {
    select: {
      id: true,
      orderNo: true,
      serviceNameSnapshot: true,
      startsAt: true,
      service: { select: { name: true } }
    }
  },
  reviewer: {
    select: {
      needoId: true,
      username: true,
      avatarUrl: true,
      avatarBootstrapUrl: true,
      customerProfile: { select: { displayName: true } },
      technicianProfile: { select: { displayName: true } }
    }
  }
});

type ReviewRecord = Prisma.OrderReviewGetPayload<{ select: typeof reviewSelect }>;

export class BackofficeUserReviewRepository implements BackofficeUserReviewRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async isUserVisibleInMerchantScope(userId: number, shopId: number): Promise<boolean> {
    const user = await this.client.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
        bookingOrders: { some: { shopId, deletedAt: null } }
      },
      select: { id: true }
    });
    return user !== null;
  }

  public async listReceivedReviews(
    input: UserReviewScope & {
      userId: number;
      page: number;
      pageSize: 10;
    }
  ): Promise<ReceivedUserReviewPage> {
    const where = {
      targetType: OrderReviewTargetType.CUSTOMER,
      deletedAt: null,
      customerProfile: { userId: input.userId, deletedAt: null },
      bookingOrder: {
        ...(input.scope === "merchant" ? { shopId: input.shopId } : {}),
        status: BookingOrderStatus.COMPLETED,
        deletedAt: null
      }
    } satisfies Prisma.OrderReviewWhereInput;
    const [rows, total] = await Promise.all([
      this.client.orderReview.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        select: reviewSelect
      }),
      this.client.orderReview.count({ where })
    ]);
    return {
      list: rows.map((row) => this.mapReview(row)),
      total,
      page: input.page,
      page_size: 10
    };
  }

  public async createAmendmentWithAudit(input: {
    actorId: number;
    reviewId: number;
    rating?: number;
    comment?: string | null;
    tags?: string[];
    reason: string;
    expectedVersion: number;
    audit: AuditLogCreateInput;
  }): Promise<ReviewAmendmentMutationResult> {
    try {
      return await this.client.$transaction(async (transaction) => {
        const locked = await transaction.$queryRaw<Array<{ id: number }>>(
          Prisma.sql`SELECT id FROM order_reviews WHERE id = ${input.reviewId} AND deleted_at IS NULL FOR UPDATE`
        );
        if (locked.length === 0) return { kind: "not_found" as const };
        const review = await transaction.orderReview.findFirst({
          where: {
            id: input.reviewId,
            targetType: OrderReviewTargetType.CUSTOMER,
            deletedAt: null,
            bookingOrder: { status: BookingOrderStatus.COMPLETED, deletedAt: null }
          },
          select: {
            id: true,
            rating: true,
            comment: true,
            tags: {
              where: { deletedAt: null },
              orderBy: [{ id: "asc" }],
              select: { label: true }
            },
            amendments: {
              where: { deletedAt: null },
              orderBy: [{ version: "desc" }, { id: "desc" }],
              take: 1,
              select: {
                version: true,
                rating: true,
                comment: true,
                tags: {
                  where: { deletedAt: null },
                  orderBy: [{ id: "asc" }],
                  select: { label: true }
                }
              }
            }
          }
        });
        if (!review) return { kind: "not_found" as const };
        const current = review.amendments[0] ?? null;
        const currentVersion = current?.version ?? 0;
        if (currentVersion !== input.expectedVersion) {
          return { kind: "version_conflict" as const };
        }
        const labels = input.tags ?? (current?.tags ?? review.tags).map((tag) => tag.label);
        const version = currentVersion + 1;
        const amendment = await transaction.orderReviewAmendment.create({
          data: {
            orderReviewId: review.id,
            version,
            rating: input.rating ?? current?.rating ?? review.rating,
            comment:
              "comment" in input ? input.comment : current ? current.comment : review.comment,
            reason: input.reason,
            revisedById: input.actorId,
            tags: { create: labels.map((label) => ({ label })) }
          },
          select: { id: true, version: true }
        });
        await transaction.auditLog.create({
          data: toAuditLogCreateData({
            ...input.audit,
            targetId: amendment.id,
            metadata: {
              ...this.metadataObject(input.audit.metadata),
              reviewId: review.id,
              version,
              reason: input.reason
            }
          })
        });
        return { kind: "created" as const, value: { reviewId: review.id, version } };
      });
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) return { kind: "version_conflict" };
      throw error;
    }
  }

  private mapReview(row: ReviewRecord): ReceivedUserReview {
    const amendment = row.amendments[0] ?? null;
    const tags = amendment?.tags ?? row.tags;
    return {
      reviewId: row.id,
      targetType: "customer",
      rating: amendment?.rating ?? row.rating,
      comment: amendment ? amendment.comment : row.comment,
      tags: tags.map((tag) => tag.label),
      createdAt: row.createdAt.toISOString(),
      amendmentVersion: amendment?.version ?? 0,
      order: {
        id: row.bookingOrder.id,
        orderNo: row.bookingOrder.orderNo,
        serviceName: row.bookingOrder.serviceNameSnapshot ?? row.bookingOrder.service?.name ?? "—",
        startsAt: row.bookingOrder.startsAt.toISOString()
      },
      reviewer: {
        needoId: row.reviewer.needoId,
        displayName:
          row.reviewer.technicianProfile?.displayName ??
          row.reviewer.customerProfile?.displayName ??
          row.reviewer.username,
        avatarUrl: row.reviewer.avatarUrl ?? row.reviewer.avatarBootstrapUrl
      }
    };
  }

  private metadataObject(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return Boolean(
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
    );
  }
}
