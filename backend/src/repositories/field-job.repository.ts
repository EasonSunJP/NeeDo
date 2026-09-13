import { BookingOrderStatus, type Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type { FieldJobRepositoryPort, FieldJobSourceRecord } from "../services/field-job.service";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import type { FieldJobListQuery } from "../validators/field-job.validator";

const fieldJobSelect = {
  id: true,
  orderNo: true,
  status: true,
  serviceNameSnapshot: true,
  fulfillmentAddressSnapshot: true,
  paymentStatus: true,
  startsAt: true,
  endsAt: true,
  createdAt: true,
  updatedAt: true,
  customer: { select: { needoId: true } },
  service: { select: { name: true } },
  technicianService: { select: { name: true } },
  shop: { select: { id: true, name: true } },
  technicianProfile: {
    select: {
      id: true,
      displayName: true,
      user: { select: { needoId: true } }
    }
  },
  serviceLocation: {
    select: { admin1Name: true, admin2Name: true, deletedAt: true }
  },
  serviceSession: {
    select: { startedAt: true, expectedEndsAt: true, endedAt: true, deletedAt: true }
  },
  checkout: { select: { receiptConfirmedAt: true, deletedAt: true } },
  sosAlerts: {
    where: { status: "pending", deletedAt: null },
    select: { id: true }
  },
  refundCases: {
    where: { activeKey: { not: null }, deletedAt: null },
    select: { id: true }
  },
  refundDisputes: {
    where: { status: "OPEN", deletedAt: null },
    select: { id: true }
  },
  overdueResolution: { select: { resolution: true, deletedAt: true } },
  performanceAssessment: { select: { id: true, deletedAt: true } },
  statusHistory: {
    where: { deletedAt: null },
    select: {
      id: true,
      fromStatus: true,
      toStatus: true,
      reason: true,
      createdAt: true
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  }
} satisfies Prisma.BookingOrderSelect;

type FieldJobRow = Prisma.BookingOrderGetPayload<{ select: typeof fieldJobSelect }>;

export const FIELD_JOB_FULFILLMENT_MODES = ["home", "home_visit"] as const;

const statusByApi = {
  pending: BookingOrderStatus.PENDING,
  confirmed: BookingOrderStatus.CONFIRMED,
  inService: BookingOrderStatus.IN_SERVICE,
  awaitingCheckout: BookingOrderStatus.AWAITING_CHECKOUT,
  awaitingPaymentConfirmation: BookingOrderStatus.AWAITING_PAYMENT_CONFIRMATION,
  completed: BookingOrderStatus.COMPLETED,
  cancelled: BookingOrderStatus.CANCELLED
} as const;

export class FieldJobRepository implements FieldJobRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async list(input: FieldJobListQuery) {
    const pagination = toPrismaPagination(input);
    const where = this.where(input);
    const [rows, total] = await Promise.all([
      this.client.bookingOrder.findMany({
        where,
        select: fieldJobSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.client.bookingOrder.count({ where })
    ]);
    return buildPaginatedResponse(
      rows.map((row) => this.map(row)),
      total,
      pagination
    );
  }

  public async findById(id: number): Promise<FieldJobSourceRecord | null> {
    const row = await this.client.bookingOrder.findFirst({
      where: {
        id,
        fulfillmentMode: { in: [...FIELD_JOB_FULFILLMENT_MODES] },
        deletedAt: null
      },
      select: fieldJobSelect
    });
    return row ? this.map(row) : null;
  }

  private where(input: FieldJobListQuery): Prisma.BookingOrderWhereInput {
    return {
      fulfillmentMode: { in: [...FIELD_JOB_FULFILLMENT_MODES] },
      deletedAt: null,
      ...(input.status ? { status: statusByApi[input.status] } : {}),
      ...(input.assignment === "assigned"
        ? { technicianProfileId: { not: null } }
        : input.assignment === "unassigned"
          ? { technicianProfileId: null }
          : {}),
      ...(input.keyword
        ? {
            OR: [
              { orderNo: { contains: input.keyword } },
              { serviceNameSnapshot: { contains: input.keyword } },
              { service: { is: { name: { contains: input.keyword } } } },
              { technicianService: { is: { name: { contains: input.keyword } } } },
              { shop: { is: { name: { contains: input.keyword } } } },
              {
                technicianProfile: {
                  is: { displayName: { contains: input.keyword } }
                }
              }
            ]
          }
        : {})
    };
  }

  private map(row: FieldJobRow): FieldJobSourceRecord {
    const location = row.serviceLocation?.deletedAt ? null : row.serviceLocation;
    const session = row.serviceSession?.deletedAt ? null : row.serviceSession;
    const checkout = row.checkout?.deletedAt ? null : row.checkout;
    const overdue = row.overdueResolution?.deletedAt ? null : row.overdueResolution;
    const performance = row.performanceAssessment?.deletedAt ? null : row.performanceAssessment;
    return {
      id: row.id,
      orderNo: row.orderNo,
      status: row.status,
      serviceName:
        row.serviceNameSnapshot?.trim() || row.service?.name || row.technicianService?.name || "—",
      shopId: row.shop.id,
      shopName: row.shop.name,
      customerPublicId: row.customer.needoId,
      technicianProfileId: row.technicianProfile?.id ?? null,
      technicianNeedoId: row.technicianProfile?.user.needoId ?? null,
      technicianName: row.technicianProfile?.displayName ?? null,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      address: {
        regionLabel:
          [location?.admin1Name, location?.admin2Name].filter(Boolean).join(" ") || "地域未確認",
        lines: this.addressLines(row.fulfillmentAddressSnapshot)
      },
      serviceSession: session
        ? {
            startedAt: session.startedAt,
            expectedEndsAt: session.expectedEndsAt,
            endedAt: session.endedAt
          }
        : null,
      receiptConfirmedAt: checkout?.receiptConfirmedAt ?? null,
      paymentStatus: row.paymentStatus,
      activeSosCount: row.sosAlerts.length,
      activeRefundCaseCount: row.refundCases.length,
      openDisputeCount: row.refundDisputes.length,
      overdueResolution: overdue?.resolution ?? null,
      hasPerformanceIssue: Boolean(performance),
      timeline: row.statusHistory.map((event) => ({
        id: event.id,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        reason: event.reason,
        createdAt: event.createdAt
      }))
    };
  }

  private addressLines(value: unknown): string[] {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const record = value as Record<string, unknown>;
    return [record.line1, record.line2, record.line3]
      .filter((line): line is string => typeof line === "string" && line.trim().length > 0)
      .map((line) => line.trim());
  }
}
