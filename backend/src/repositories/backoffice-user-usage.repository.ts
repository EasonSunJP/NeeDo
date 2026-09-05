import { Prisma, ServicePaymentStatus, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import { toAuditLogCreateData, type AuditLogCreateInput } from "./audit-log.repository";

export type UserUsageScope = { scope: "platform" } | { scope: "merchant"; shopId: number };

export interface UserUsageRow {
  id: number;
  orderNo: string;
  status: string;
  paymentStatus: string;
  serviceName: string;
  shopName: string;
  technicianName: string | null;
  startsAt: string;
  endsAt: string;
  priceAmount: number;
  currency: string;
  refund: {
    exists: boolean;
    displayReference: string | null;
    note: string | null;
    amendmentVersion: number;
  };
}

export interface UserUsagePage {
  list: UserUsageRow[];
  total: number;
  page: number;
  page_size: 10;
}

export interface UserUsageTimelineEntry {
  id: string;
  type: "order_created" | "status" | "service" | "comment" | "refund";
  code: string;
  occurredAt: string;
  actorName: string | null;
  body: string | null;
}

export interface UserUsageTimeline {
  order: UserUsageRow;
  timeline: UserUsageTimelineEntry[];
}

export type AppendMutationResult<T> =
  | { kind: "created"; value: T }
  | { kind: "not_found" | "refund_not_found" | "version_conflict" };

export interface BackofficeUserUsageRepositoryPort {
  listUsage(
    input: UserUsageScope & {
      userId: number;
      page: number;
      pageSize: 10;
      keyword?: string;
      from: Date;
      to: Date;
    }
  ): Promise<UserUsagePage>;
  getTimeline(
    input: UserUsageScope & { userId: number; orderId: number }
  ): Promise<UserUsageTimeline | null>;
  createCommentWithAudit(input: {
    actorId: number;
    userId?: number;
    orderId: number;
    body: string;
    audit: AuditLogCreateInput;
  }): Promise<AppendMutationResult<{ commentId: number }>>;
  createRefundAmendmentWithAudit(input: {
    actorId: number;
    userId?: number;
    orderId: number;
    displayReference?: string | null;
    note?: string | null;
    reason: string;
    expectedVersion: number;
    audit: AuditLogCreateInput;
  }): Promise<AppendMutationResult<{ orderId: number; version: number }>>;
}

const orderSummarySelect = Prisma.validator<Prisma.BookingOrderSelect>()({
  id: true,
  orderNo: true,
  status: true,
  paymentStatus: true,
  paymentRefundedAt: true,
  paymentRefundReference: true,
  paymentRefundReason: true,
  priceAmount: true,
  currency: true,
  startsAt: true,
  endsAt: true,
  createdAt: true,
  serviceNameSnapshot: true,
  service: { select: { name: true } },
  shop: { select: { name: true } },
  technicianProfile: { select: { displayName: true } },
  refundAmendments: {
    where: { deletedAt: null },
    orderBy: [{ version: "desc" }, { id: "desc" }],
    take: 1,
    select: { version: true, displayReference: true, note: true, createdAt: true }
  }
});

const orderTimelineSelect = Prisma.validator<Prisma.BookingOrderSelect>()({
  ...orderSummarySelect,
  statusHistory: {
    where: { deletedAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      fromStatus: true,
      toStatus: true,
      reason: true,
      createdAt: true,
      actor: { select: { username: true } }
    }
  },
  serviceEvents: {
    where: { deletedAt: null },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      eventType: true,
      reason: true,
      occurredAt: true,
      actor: { select: { username: true } }
    }
  },
  timelineComments: {
    where: { deletedAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      body: true,
      visibility: true,
      createdAt: true,
      actor: { select: { username: true } }
    }
  }
});

type SummaryRecord = Prisma.BookingOrderGetPayload<{ select: typeof orderSummarySelect }>;
type TimelineRecord = Prisma.BookingOrderGetPayload<{ select: typeof orderTimelineSelect }>;

export class BackofficeUserUsageRepository implements BackofficeUserUsageRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async listUsage(
    input: UserUsageScope & {
      userId: number;
      page: number;
      pageSize: 10;
      keyword?: string;
      from: Date;
      to: Date;
    }
  ): Promise<UserUsagePage> {
    const where = {
      customerUserId: input.userId,
      ...(input.scope === "merchant" ? { shopId: input.shopId } : {}),
      startsAt: { gte: input.from, lt: input.to },
      deletedAt: null,
      ...(input.keyword
        ? {
            OR: [
              { orderNo: { contains: input.keyword } },
              { serviceNameSnapshot: { contains: input.keyword } },
              { shop: { name: { contains: input.keyword } } }
            ]
          }
        : {})
    } satisfies Prisma.BookingOrderWhereInput;
    const [rows, total] = await Promise.all([
      this.client.bookingOrder.findMany({
        where,
        select: orderSummarySelect,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        orderBy: [{ startsAt: "desc" }, { id: "desc" }]
      }),
      this.client.bookingOrder.count({ where })
    ]);
    return {
      list: rows.map((row) => this.mapSummary(row)),
      total,
      page: input.page,
      page_size: 10
    };
  }

  public async getTimeline(
    input: UserUsageScope & { userId: number; orderId: number }
  ): Promise<UserUsageTimeline | null> {
    const order = await this.client.bookingOrder.findFirst({
      where: {
        id: input.orderId,
        customerUserId: input.userId,
        ...(input.scope === "merchant" ? { shopId: input.shopId } : {}),
        deletedAt: null
      },
      select: orderTimelineSelect
    });
    if (!order) return null;
    return { order: this.mapSummary(order), timeline: this.mapTimeline(order, input.scope) };
  }

  public async createCommentWithAudit(input: {
    actorId: number;
    userId?: number;
    orderId: number;
    body: string;
    audit: AuditLogCreateInput;
  }): Promise<AppendMutationResult<{ commentId: number }>> {
    return this.client.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ id: number }>>(
        input.userId
          ? Prisma.sql`SELECT id FROM booking_orders WHERE id = ${input.orderId} AND customer_user_id = ${input.userId} AND deleted_at IS NULL FOR UPDATE`
          : Prisma.sql`SELECT id FROM booking_orders WHERE id = ${input.orderId} AND deleted_at IS NULL FOR UPDATE`
      );
      if (locked.length === 0) return { kind: "not_found" as const };
      const comment = await transaction.orderTimelineComment.create({
        data: {
          bookingOrderId: input.orderId,
          actorUserId: input.actorId,
          body: input.body,
          visibility: "backoffice"
        },
        select: { id: true }
      });
      await transaction.auditLog.create({
        data: toAuditLogCreateData({ ...input.audit, targetId: comment.id })
      });
      return { kind: "created" as const, value: { commentId: comment.id } };
    });
  }

  public async createRefundAmendmentWithAudit(input: {
    actorId: number;
    userId?: number;
    orderId: number;
    displayReference?: string | null;
    note?: string | null;
    reason: string;
    expectedVersion: number;
    audit: AuditLogCreateInput;
  }): Promise<AppendMutationResult<{ orderId: number; version: number }>> {
    try {
      return await this.client.$transaction(async (transaction) => {
        const locked = await transaction.$queryRaw<Array<{ id: number }>>(
          input.userId
            ? Prisma.sql`SELECT id FROM booking_orders WHERE id = ${input.orderId} AND customer_user_id = ${input.userId} AND deleted_at IS NULL FOR UPDATE`
            : Prisma.sql`SELECT id FROM booking_orders WHERE id = ${input.orderId} AND deleted_at IS NULL FOR UPDATE`
        );
        if (locked.length === 0) return { kind: "not_found" as const };
        const order = await transaction.bookingOrder.findFirst({
          where: {
            id: input.orderId,
            ...(input.userId ? { customerUserId: input.userId } : {}),
            deletedAt: null
          },
          select: {
            id: true,
            paymentStatus: true,
            paymentRefundedAt: true,
            paymentRefundReference: true,
            paymentRefundReason: true,
            refundAmendments: {
              where: { deletedAt: null },
              orderBy: [{ version: "desc" }, { id: "desc" }],
              take: 1,
              select: { version: true, displayReference: true, note: true }
            }
          }
        });
        if (!order) return { kind: "not_found" as const };
        if (!this.hasRefund(order)) return { kind: "refund_not_found" as const };
        const current = order.refundAmendments[0] ?? null;
        const currentVersion = current?.version ?? 0;
        if (currentVersion !== input.expectedVersion) return { kind: "version_conflict" as const };
        const version = currentVersion + 1;
        const amendment = await transaction.orderRefundAmendment.create({
          data: {
            bookingOrderId: order.id,
            version,
            displayReference:
              "displayReference" in input
                ? input.displayReference
                : current
                  ? current.displayReference
                  : order.paymentRefundReference,
            note:
              "note" in input
                ? input.note
                : current
                  ? current.note
                  : order.paymentRefundReason,
            reason: input.reason,
            revisedById: input.actorId
          },
          select: { id: true, version: true }
        });
        await transaction.auditLog.create({
          data: toAuditLogCreateData({ ...input.audit, targetId: amendment.id })
        });
        return { kind: "created" as const, value: { orderId: order.id, version } };
      });
    } catch (error: unknown) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: unknown }).code === "P2002"
      ) {
        return { kind: "version_conflict" };
      }
      throw error;
    }
  }

  private mapSummary(order: SummaryRecord): UserUsageRow {
    const amendment = order.refundAmendments[0] ?? null;
    const refundExists = this.hasRefund(order);
    return {
      id: order.id,
      orderNo: order.orderNo,
      status: order.status.toLowerCase(),
      paymentStatus: order.paymentStatus.toLowerCase(),
      serviceName: order.serviceNameSnapshot ?? order.service?.name ?? "—",
      shopName: order.shop.name,
      technicianName: order.technicianProfile?.displayName ?? null,
      startsAt: order.startsAt.toISOString(),
      endsAt: order.endsAt.toISOString(),
      priceAmount: Number(order.priceAmount),
      currency: order.currency,
      refund: {
        exists: refundExists,
        displayReference: refundExists
          ? amendment
            ? amendment.displayReference
            : order.paymentRefundReference
          : null,
        note: refundExists ? (amendment ? amendment.note : order.paymentRefundReason) : null,
        amendmentVersion: amendment?.version ?? 0
      }
    };
  }

  private mapTimeline(
    order: TimelineRecord,
    scope: UserUsageScope["scope"]
  ): UserUsageTimelineEntry[] {
    const entries: UserUsageTimelineEntry[] = [
      {
        id: `created:${order.id}`,
        type: "order_created",
        code: "order_created",
        occurredAt: order.createdAt.toISOString(),
        actorName: null,
        body: null
      },
      ...order.statusHistory.map((event) => ({
        id: `status:${event.id}`,
        type: "status" as const,
        code: event.toStatus.toLowerCase(),
        occurredAt: event.createdAt.toISOString(),
        actorName: event.actor?.username ?? null,
        body: event.reason
      })),
      ...order.serviceEvents.map((event) => ({
        id: `service:${event.id}`,
        type: "service" as const,
        code: event.eventType.toLowerCase(),
        occurredAt: event.occurredAt.toISOString(),
        actorName: event.actor?.username ?? null,
        body: event.reason
      })),
      ...order.timelineComments
        .filter((comment) => scope === "platform" || comment.visibility !== "backoffice")
        .map((comment) => ({
          id: `comment:${comment.id}`,
          type: "comment" as const,
          code: "comment",
          occurredAt: comment.createdAt.toISOString(),
          actorName: comment.actor.username,
          body: comment.body
        }))
    ];
    if (this.hasRefund(order)) {
      const amendment = order.refundAmendments[0] ?? null;
      entries.push({
        id: `refund:${order.id}:${amendment?.version ?? 0}`,
        type: "refund",
        code: "refund",
        occurredAt: (
          amendment?.createdAt ??
          order.paymentRefundedAt ??
          order.createdAt
        ).toISOString(),
        actorName: null,
        body: amendment ? amendment.note : order.paymentRefundReason
      });
    }
    return entries.sort(
      (left, right) =>
        Date.parse(left.occurredAt) - Date.parse(right.occurredAt) ||
        left.id.localeCompare(right.id)
    );
  }

  private hasRefund(order: {
    paymentStatus: ServicePaymentStatus;
    paymentRefundedAt: Date | null;
  }): boolean {
    return (
      order.paymentRefundedAt !== null ||
      order.paymentStatus === ServicePaymentStatus.REFUND_PENDING ||
      order.paymentStatus === ServicePaymentStatus.REFUNDED
    );
  }
}
