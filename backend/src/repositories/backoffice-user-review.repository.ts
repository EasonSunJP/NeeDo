import {
  BookingOrderStatus,
  OrderAddOnStatus,
  OrderReviewTargetType,
  Prisma,
  type PrismaClient
} from "@prisma/client";
import { prisma } from "../prisma/client";
import { toAuditLogCreateData, type AuditLogCreateInput } from "./audit-log.repository";

export type UserReviewScope =
  | { scope: "platform"; showTestNdpData?: boolean }
  | { scope: "merchant"; shopId: number };

export interface ReceivedUserReview {
  reviewId: number;
  targetType: "customer";
  rating: number;
  comment: string | null;
  tags: string[];
  createdAt: string;
  amendmentVersion: number;
  amendmentHistory: Array<{
    version: number;
    rating: number | null;
    comment: string | null;
    tags: string[];
    reason: string;
    revisedAt: string;
    revisedBy: string;
  }>;
  order: {
    id: number;
    orderNo: string;
    serviceName: string;
    startsAt: string;
    shopName: string;
    durationMinutes: number | null;
    note: string | null;
    paymentMethod: "onsite" | "bank_transfer" | "cash" | "ndp" | "other";
    paymentStatus: "pending" | "confirmed" | "refund_pending" | "refunded";
    paymentCurrency: string | null;
    otherPaymentMethod: string | null;
    addOnCount: number;
    addOnMinutes: number;
  };
  reviewer: { needoId: string; displayName: string; avatarUrl: string | null };
}

export interface ReceivedUserReviewPage {
  list: ReceivedUserReview[];
  total: number;
  page: number;
  page_size: 10;
}

export type OperationsReviewStatus = "original" | "amended" | "system";

export type OperationsReview = Omit<ReceivedUserReview, "targetType"> & {
  targetType: "customer" | "technician";
  status: OperationsReviewStatus;
  customer: { needoId: string; displayName: string };
  shop: { id: number; publicId: string | null; name: string };
  technician: { id: number; publicId: string; displayName: string } | null;
};

export interface OperationsReviewPage {
  list: OperationsReview[];
  total: number;
  page: number;
  page_size: 20;
}

export interface OperationsReviewListInput {
  page: number;
  pageSize: 20;
  keyword?: string;
  rating?: number;
  status?: OperationsReviewStatus;
  targetType?: "customer" | "technician";
  from?: Date;
  to?: Date;
  showTestNdpData?: boolean;
}

export type ReviewAmendmentMutationResult =
  | { kind: "created"; value: { reviewId: number; version: number } }
  | { kind: "not_found" | "version_conflict" };

export interface BackofficeUserReviewRepositoryPort {
  listOperationsReviews(input: OperationsReviewListInput): Promise<OperationsReviewPage>;
  getOperationsReview(reviewId: number, showTestNdpData?: boolean): Promise<OperationsReview | null>;
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
  authorType: true,
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
    select: {
      version: true,
      rating: true,
      comment: true,
      reason: true,
      createdAt: true,
      revisedBy: { select: { username: true } },
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
      serviceDurationSnapshot: true,
      note: true,
      paymentMethod: true,
      paymentStatus: true,
      shop: { select: { id: true, shopNo: true, name: true } },
      customer: {
        select: {
          needoId: true,
          username: true,
          customerProfile: { select: { displayName: true } }
        }
      },
      technicianProfile: {
        select: {
          id: true,
          displayName: true,
          user: { select: { needoId: true } }
        }
      },
      addOns: {
        where: { deletedAt: null, status: OrderAddOnStatus.ACCEPTED },
        select: { durationMinutes: true }
      },
      checkout: {
        select: {
          deletedAt: true,
          otherMethodLabel: true,
          ledgerTransaction: { select: { currency: true, deletedAt: true } }
        }
      },
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
  },
  customerProfile: {
    select: {
      displayName: true,
      user: { select: { needoId: true } }
    }
  },
  technicianProfile: {
    select: {
      id: true,
      displayName: true,
      user: { select: { needoId: true } }
    }
  }
});

type ReviewRecord = Prisma.OrderReviewGetPayload<{ select: typeof reviewSelect }>;

export class BackofficeUserReviewRepository implements BackofficeUserReviewRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async listOperationsReviews(
    input: OperationsReviewListInput
  ): Promise<OperationsReviewPage> {
    const filter = this.operationsReviewFilter(input);
    const offset = (input.page - 1) * input.pageSize;
    const totals = await this.client.$queryRaw<Array<{ total: bigint | number }>>(Prisma.sql`
      ${this.operationsReviewCte()}
      SELECT COUNT(*) AS total
      FROM eligible_reviews AS review
      WHERE ${filter}
    `);
    const total = Number(totals[0]?.total ?? 0);
    if (!Number.isSafeInteger(total) || total < 0) {
      throw new RangeError("Invalid operations review total");
    }
    const ids = await this.client.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      ${this.operationsReviewCte()}
      SELECT review.id
      FROM eligible_reviews AS review
      WHERE ${filter}
      ORDER BY review.created_at DESC, review.id DESC
      LIMIT ${input.pageSize}
      OFFSET ${offset}
    `);
    const rows = ids.length
      ? await this.client.orderReview.findMany({
          where: { id: { in: ids.map((item) => item.id) } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: input.pageSize,
          select: reviewSelect
        })
      : [];

    return {
      list: rows.map((row) => this.mapOperationsReview(row)),
      total,
      page: input.page,
      page_size: 20
    };
  }

  public async getOperationsReview(
    reviewId: number,
    showTestNdpData = true
  ): Promise<OperationsReview | null> {
    const row = await this.client.orderReview.findFirst({
      where: {
        id: reviewId,
        deletedAt: null,
        bookingOrder: {
          status: BookingOrderStatus.COMPLETED,
          deletedAt: null,
          ...this.visibleTestNdpOrderWhere({ scope: "platform", showTestNdpData })
        }
      },
      select: reviewSelect
    });
    return row ? this.mapOperationsReview(row) : null;
  }

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
        ...this.visibleTestNdpOrderWhere(input),
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
            authorType: "USER",
            deletedAt: null,
            bookingOrder: { status: BookingOrderStatus.COMPLETED, deletedAt: null }
          },
          select: {
            id: true,
            targetType: true,
            customerProfile: { select: { userId: true } },
            technicianProfile: { select: { userId: true } },
            bookingOrder: { select: { shopId: true } },
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
        const targetUserId =
          review.targetType === OrderReviewTargetType.CUSTOMER
            ? review.customerProfile?.userId
            : review.technicianProfile?.userId;
        if (!targetUserId) return { kind: "not_found" as const };
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
              userId: targetUserId,
              shopId: review.bookingOrder.shopId,
              reviewId: review.id,
              targetType: review.targetType.toLowerCase(),
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
    const order = row.bookingOrder;
    const checkout = order.checkout?.deletedAt === null ? order.checkout : null;
    const ledger =
      checkout?.ledgerTransaction?.deletedAt === null ? checkout.ledgerTransaction : null;
    return {
      reviewId: row.id,
      targetType: "customer",
      rating: amendment?.rating ?? row.rating,
      comment: amendment ? amendment.comment : row.comment,
      tags: tags.map((tag) => tag.label),
      createdAt: row.createdAt.toISOString(),
      amendmentVersion: amendment?.version ?? 0,
      amendmentHistory: row.amendments.map((item) => ({
        version: item.version,
        rating: item.rating,
        comment: item.comment,
        tags: item.tags.map((tag) => tag.label),
        reason: item.reason,
        revisedAt: item.createdAt.toISOString(),
        revisedBy: item.revisedBy.username
      })),
      order: {
        id: row.bookingOrder.id,
        orderNo: row.bookingOrder.orderNo,
        serviceName: row.bookingOrder.serviceNameSnapshot ?? row.bookingOrder.service?.name ?? "—",
        startsAt: order.startsAt.toISOString(),
        shopName: order.shop.name,
        durationMinutes: order.serviceDurationSnapshot,
        note: order.note,
        paymentMethod:
          order.paymentMethod.toLowerCase() as ReceivedUserReview["order"]["paymentMethod"],
        paymentStatus:
          order.paymentStatus.toLowerCase() as ReceivedUserReview["order"]["paymentStatus"],
        paymentCurrency: order.paymentMethod === "NDP" ? (ledger?.currency ?? null) : null,
        otherPaymentMethod:
          order.paymentMethod === "OTHER" ? (checkout?.otherMethodLabel ?? null) : null,
        addOnCount: order.addOns.length,
        addOnMinutes: order.addOns.reduce((sum, item) => sum + item.durationMinutes, 0)
      },
      reviewer: row.reviewer
        ? {
            needoId: row.reviewer.needoId,
            displayName:
              row.reviewer.technicianProfile?.displayName ??
              row.reviewer.customerProfile?.displayName ??
              row.reviewer.username,
            avatarUrl: row.reviewer.avatarUrl ?? row.reviewer.avatarBootstrapUrl
          }
        : { needoId: "system", displayName: "NeeDo System", avatarUrl: null }
    };
  }

  private mapOperationsReview(row: ReviewRecord): OperationsReview {
    const base = this.mapReview(row);
    const technician = row.bookingOrder.technicianProfile ?? row.technicianProfile;
    return {
      ...base,
      targetType: row.targetType.toLowerCase() as OperationsReview["targetType"],
      status:
        row.authorType === "SYSTEM"
          ? "system"
          : row.amendments.length > 0
            ? "amended"
            : "original",
      customer: {
        needoId: row.bookingOrder.customer.needoId,
        displayName:
          row.bookingOrder.customer.customerProfile?.displayName ??
          row.bookingOrder.customer.username
      },
      shop: {
        id: row.bookingOrder.shop.id,
        publicId: row.bookingOrder.shop.shopNo,
        name: row.bookingOrder.shop.name
      },
      technician: technician
        ? {
            id: technician.id,
            publicId: technician.user.needoId,
            displayName: technician.displayName
          }
        : null
    };
  }

  private operationsReviewCte(): Prisma.Sql {
    return Prisma.sql`
      WITH ranked_amendments AS (
        SELECT
          amendment.order_review_id,
          amendment.version,
          amendment.rating,
          amendment.comment,
          ROW_NUMBER() OVER (
            PARTITION BY amendment.order_review_id
            ORDER BY amendment.version DESC, amendment.id DESC
          ) AS amendment_rank
        FROM order_review_amendments AS amendment
        WHERE amendment.deleted_at IS NULL
      ),
      eligible_reviews AS (
        SELECT
          review.id,
          review.author_type,
          review.target_type,
          review.rating,
          review.comment,
          review.created_at,
          latest.version AS amendment_version,
          latest.rating AS amendment_rating,
          latest.comment AS amendment_comment,
          booking.order_no,
          booking.service_name_snapshot,
          service.name AS service_name,
          shop.name AS shop_name,
          reviewer.needo_id AS reviewer_needo_id,
          reviewer.username AS reviewer_username,
          reviewer_customer.display_name AS reviewer_customer_name,
          reviewer_technician.display_name AS reviewer_technician_name,
          customer.needo_id AS customer_needo_id,
          customer.username AS customer_username,
          customer_profile.display_name AS customer_name,
          assigned_technician.display_name AS assigned_technician_name,
          assigned_technician_user.needo_id AS assigned_technician_needo_id,
          target_customer.display_name AS target_customer_name,
          target_technician.display_name AS target_technician_name,
          CASE WHEN EXISTS (
            SELECT 1
            FROM order_financials AS test_financial
            WHERE test_financial.booking_order_id = booking.id
              AND test_financial.deleted_at IS NULL
              AND test_financial.ndp_currency = ${"TEST_NDP"}
          ) OR EXISTS (
            SELECT 1
            FROM order_checkouts AS test_checkout
            INNER JOIN ledger_transactions AS test_ledger
              ON test_ledger.id = test_checkout.ledger_transaction_id
             AND test_ledger.deleted_at IS NULL
            WHERE test_checkout.booking_order_id = booking.id
              AND test_checkout.deleted_at IS NULL
              AND test_ledger.currency = ${"TEST_NDP"}
          ) THEN 1 ELSE 0 END AS is_test_ndp_order
        FROM order_reviews AS review
        INNER JOIN booking_orders AS booking
          ON booking.id = review.booking_order_id
         AND booking.deleted_at IS NULL
         AND booking.status = ${"completed"}
        INNER JOIN shops AS shop
          ON shop.id = booking.shop_id
        LEFT JOIN services AS service
          ON service.id = booking.service_id
        LEFT JOIN users AS reviewer
          ON reviewer.id = review.reviewer_user_id
        LEFT JOIN customer_profiles AS reviewer_customer
          ON reviewer_customer.user_id = reviewer.id
         AND reviewer_customer.deleted_at IS NULL
        LEFT JOIN technician_profiles AS reviewer_technician
          ON reviewer_technician.user_id = reviewer.id
         AND reviewer_technician.deleted_at IS NULL
        INNER JOIN users AS customer
          ON customer.id = booking.customer_user_id
        LEFT JOIN customer_profiles AS customer_profile
          ON customer_profile.user_id = customer.id
         AND customer_profile.deleted_at IS NULL
        LEFT JOIN technician_profiles AS assigned_technician
          ON assigned_technician.id = booking.technician_profile_id
        LEFT JOIN users AS assigned_technician_user
          ON assigned_technician_user.id = assigned_technician.user_id
        LEFT JOIN customer_profiles AS target_customer
          ON target_customer.id = review.customer_profile_id
        LEFT JOIN technician_profiles AS target_technician
          ON target_technician.id = review.technician_profile_id
        LEFT JOIN ranked_amendments AS latest
          ON latest.order_review_id = review.id
         AND latest.amendment_rank = 1
        WHERE review.deleted_at IS NULL
      )
    `;
  }

  private operationsReviewFilter(input: OperationsReviewListInput): Prisma.Sql {
    const filters: Prisma.Sql[] = [Prisma.sql`1 = 1`];
    if (input.showTestNdpData === false) {
      filters.push(Prisma.sql`review.is_test_ndp_order = 0`);
    }
    if (input.keyword) {
      const keyword = `%${input.keyword}%`;
      filters.push(Prisma.sql`(
        review.order_no LIKE ${keyword}
        OR COALESCE(review.service_name_snapshot, review.service_name, ${""}) LIKE ${keyword}
        OR review.shop_name LIKE ${keyword}
        OR COALESCE(review.amendment_comment, review.comment, ${""}) LIKE ${keyword}
        OR COALESCE(review.reviewer_needo_id, ${""}) LIKE ${keyword}
        OR COALESCE(review.reviewer_username, ${""}) LIKE ${keyword}
        OR COALESCE(review.reviewer_customer_name, ${""}) LIKE ${keyword}
        OR COALESCE(review.reviewer_technician_name, ${""}) LIKE ${keyword}
        OR review.customer_needo_id LIKE ${keyword}
        OR review.customer_username LIKE ${keyword}
        OR COALESCE(review.customer_name, ${""}) LIKE ${keyword}
        OR COALESCE(review.assigned_technician_name, ${""}) LIKE ${keyword}
        OR COALESCE(review.assigned_technician_needo_id, ${""}) LIKE ${keyword}
        OR COALESCE(review.target_customer_name, ${""}) LIKE ${keyword}
        OR COALESCE(review.target_technician_name, ${""}) LIKE ${keyword}
      )`);
    }
    if (input.rating !== undefined) {
      filters.push(Prisma.sql`COALESCE(review.amendment_rating, review.rating) = ${input.rating}`);
    }
    if (input.status === "original") {
      filters.push(Prisma.sql`review.author_type = ${"user"} AND review.amendment_version IS NULL`);
    } else if (input.status === "amended") {
      filters.push(Prisma.sql`review.author_type = ${"user"} AND review.amendment_version IS NOT NULL`);
    } else if (input.status === "system") {
      filters.push(Prisma.sql`review.author_type = ${"system"}`);
    }
    if (input.targetType) {
      filters.push(Prisma.sql`review.target_type = ${input.targetType}`);
    }
    if (input.from) filters.push(Prisma.sql`review.created_at >= ${input.from}`);
    if (input.to) filters.push(Prisma.sql`review.created_at < ${input.to}`);
    return Prisma.join(filters, " AND ");
  }

  private visibleTestNdpOrderWhere(scope: UserReviewScope): Prisma.BookingOrderWhereInput {
    if (scope.scope !== "platform" || scope.showTestNdpData !== false) return {};
    return {
      NOT: [
        { financial: { is: { ndpCurrency: "TEST_NDP", deletedAt: null } } },
        {
          checkout: {
            is: {
              deletedAt: null,
              ledgerTransaction: { is: { currency: "TEST_NDP", deletedAt: null } }
            }
          }
        }
      ]
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
