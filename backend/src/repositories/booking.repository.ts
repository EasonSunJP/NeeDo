import { createHash } from "node:crypto";
import {
  OrderPerformanceOutcome,
  OrderPerformanceRevisionAction,
  OrderPerformanceTreatment,
  Prisma,
  type PrismaClient
} from "@prisma/client";
import { prisma } from "../prisma/client";
import type { LedgerTransactionClient } from "../services/ledger.service";
import type {
  AffiliateCheckoutPrepared,
  AffiliateCheckoutSummary
} from "../services/affiliate-checkout.service";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";
import { runWithTransactionConflictRetry } from "../utils/transaction-conflict-retry";
import {
  classifyAdverseOutcomeInTransaction,
  recalculateTechnicianSummaryInTransaction
} from "./order-performance.repository";

export type BookingOrderStatusPayload =
  | "pending"
  | "confirmed"
  | "inService"
  | "completed"
  | "cancelled";
export type BookingOrderTypePayload = "booking" | "request";
export type ScheduleSlotStatusPayload = "available" | "booked" | "blocked";
export type BookingFulfillmentMode = "home" | "store";
export type ServicePaymentMethodPayload = "onsite" | "bank_transfer";
export type ServicePaymentStatusPayload = "pending" | "confirmed" | "refundPending" | "refunded";

export interface AvailabilityListInput extends PaginationInput {
  serviceId?: number;
  technicianServiceId?: number;
  shopId?: number;
  technicianId?: number;
  from: Date;
  to: Date;
}
export interface BookingCreateRepositoryInput {
  customerUserId: number;
  orderType?: BookingOrderTypePayload;
  serviceId?: number;
  technicianServiceId?: number;
  scheduleSlotId: number;
  fulfillmentMode: BookingFulfillmentMode;
  paymentMethod?: ServicePaymentMethodPayload;
  note?: string | null;
}

export interface BookingCreateAffiliatePreparationContext {
  transactionClient: LedgerTransactionClient;
  customerUserId: number;
  shopId: number;
  serviceId: number | null;
  originalPriceJpy: number;
  scheduledStartAt: Date;
}

export interface BookingCreateAffiliatePersistenceContext extends Omit<
  BookingCreateAffiliatePreparationContext,
  "serviceId"
> {
  serviceId: number;
  bookingOrderId: number;
  prepared: AffiliateCheckoutPrepared;
}

export interface BookingSupersededAffiliateInvalidationContext {
  transactionClient: LedgerTransactionClient;
  bookingOrderId: number;
  actorUserId: number;
}

export interface BookingCreateRepositoryOptions {
  prepareAffiliate?: (
    context: BookingCreateAffiliatePreparationContext
  ) => Promise<AffiliateCheckoutPrepared>;
  persistAffiliate?: (context: BookingCreateAffiliatePersistenceContext) => Promise<void>;
  invalidateSupersededAffiliate?: (
    context: BookingSupersededAffiliateInvalidationContext
  ) => Promise<void>;
}

class BookingPendingReplacementUnavailableError extends Error {
  public constructor() {
    super("error.booking.pending_replacement_unavailable");
    this.name = "BookingPendingReplacementUnavailableError";
  }
}

export interface BookingSupersededOrderNotification {
  order: BookingOrderPayload;
  recipientUserIds: number[];
}

export interface BookingCreateMutationResult {
  order: BookingOrderPayload;
  recipientUserIds: number[];
  supersededOrders: BookingSupersededOrderNotification[];
}

export type ManualPaymentScope = { scope: "merchant"; shopId: number } | { scope: "backoffice" };

export type ConfirmManualPaymentRepositoryInput = ManualPaymentScope & {
  orderId: number;
  actorUserId: number;
  method: ServicePaymentMethodPayload;
  amountJpy: number;
  reference?: string | null;
  note?: string | null;
};

export type RefundManualPaymentRepositoryInput = ManualPaymentScope & {
  orderId: number;
  actorUserId: number;
  reason: string;
  reference?: string | null;
};

export interface OrderListInput extends PaginationInput {
  customerUserId?: number;
  shopId?: number;
  technicianProfileId?: number;
  status?: BookingOrderStatusPayload;
  from?: Date;
  to?: Date;
}

export type ScheduleScope =
  | { scope: "merchant"; shopId: number }
  | { scope: "technician"; technicianProfileId: number };

export type ScheduleListInput = ScheduleScope &
  PaginationInput & {
    from: Date;
    to: Date;
    serviceId?: number;
    technicianServiceId?: number;
    technicianProfileId?: number;
    status?: ScheduleSlotStatusPayload;
  };

export type ScheduleSlotCreateInput = ScheduleScope & {
  serviceId?: number;
  technicianServiceId?: number;
  technicianProfileId?: number | null;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
};

export type ScheduleSlotUpdateInput = ScheduleScope & {
  id: number;
  startsAt?: Date;
  endsAt?: Date;
  capacity?: number;
  status?: "available" | "blocked";
};

export type ScheduleSlotDeleteInput = ScheduleScope & { id: number };

export type ScheduleSlotReadInput = ScheduleScope & { id: number };

export type OrderTransitionActorContext = {
  userId: number;
  identityId: number | null;
  identityType: string;
};

export type ScheduleMutationResult =
  | { outcome: "ok"; slot: ScheduleSlotPayload }
  | { outcome: "not_found" | "conflict" | "in_use" | "duration_mismatch" | "suspended" };

export interface OrderTransitionRepositoryInput {
  id: number;
  actorUserId: number;
  actor?: OrderTransitionActorContext;
  fromStatus: BookingOrderStatusPayload;
  toStatus: BookingOrderStatusPayload;
  reason?: string | null;
}

export interface OrderTransitionSettlementContext {
  transactionClient: LedgerTransactionClient;
  order: BookingOrderPayload;
}

export interface OrderTransitionRepositoryOptions {
  settle?: (context: OrderTransitionSettlementContext) => Promise<void>;
}

export interface ActiveOrderAcceptancePauseSummary {
  subjectType: "merchant_account" | "shop";
  authorityType: "operations" | "merchant" | "shop";
  reasonCode: string;
  startsAt: Date;
}

export interface OrderAcceptancePausedResult {
  kind: "acceptance_paused";
  pauses: ActiveOrderAcceptancePauseSummary[];
}

export type OrderTransitionMutationResult =
  | BookingOrderPayload
  | OrderAcceptancePausedResult
  | null;

export interface ScheduleSlotPayload {
  id: number;
  serviceId: number | null;
  technicianServiceId: number | null;
  shopId: number;
  technicianProfileId: number | null;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  bookedCount: number;
  status: ScheduleSlotStatusPayload;
  serviceName: string;
  shopName: string;
  technicianName: string | null;
  priceAmount: string;
  currency: string;
  durationMinutes: number;
}

export interface OrderStatusHistoryPayload {
  id: number;
  orderId: number;
  fromStatus: BookingOrderStatusPayload | null;
  toStatus: BookingOrderStatusPayload;
  actorUserId: number | null;
  reason: string | null;
  createdAt: Date;
}

export type OrderTimelineEventPayload =
  | {
      type: "ORDER_STATUS_CHANGED";
      id: string;
      createdAt: Date;
      actorUserId: number | null;
      fromStatus: BookingOrderStatusPayload | null;
      toStatus: BookingOrderStatusPayload;
      publicReason: string | null;
    }
  | {
      type:
        | "TECHNICIAN_CANCEL_CLASSIFIED"
        | "TECHNICIAN_UNCOMPLETED_CLASSIFIED"
        | "SPECIAL_CANCELLATION_APPLIED"
        | "SPECIAL_CANCELLATION_REVOKED";
      id: string;
      createdAt: Date;
      actorUserId: number | null;
      publicReason: string | null;
      internalNote?: string;
    };

export interface OrderPerformanceAssessmentPublicPayload {
  id: number;
  bookingOrderId: number;
  technicianProfileId: number;
  outcome: "technician_cancelled" | "technician_uncompleted";
  treatment: "counted" | "special_excluded";
  version: number;
  currentRevisionId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BookingOrderPayload {
  id: number;
  orderNo: string;
  orderType: BookingOrderTypePayload;
  status: BookingOrderStatusPayload;
  paymentMethod: ServicePaymentMethodPayload;
  paymentStatus: ServicePaymentStatusPayload;
  paymentAmountJpy: number;
  paymentConfirmedById: number | null;
  paymentConfirmedAt: Date | null;
  paymentReference: string | null;
  paymentNote: string | null;
  paymentRefundedById: number | null;
  paymentRefundedAt: Date | null;
  paymentRefundReference: string | null;
  paymentRefundReason: string | null;
  customerUserId: number;
  serviceId: number | null;
  technicianServiceId: number | null;
  shopId: number;
  technicianProfileId: number | null;
  scheduleSlotId: number;
  fulfillmentMode: BookingFulfillmentMode;
  serviceName: string;
  pricingModeSnapshot: "merchant" | "technician";
  serviceOwnerType: "shop" | "technician";
  serviceOwnerId: number | null;
  serviceNameSnapshot: string | null;
  servicePriceSnapshot: string | null;
  serviceDurationSnapshot: number | null;
  serviceSnapshot: unknown;
  shopName: string;
  technicianName: string | null;
  priceAmount: string;
  currency: string;
  startsAt: Date;
  endsAt: Date;
  note: string | null;
  cancelReason: string | null;
  affiliate: AffiliateCheckoutSummary | null;
  createdAt: Date;
  updatedAt: Date;
  statusHistory: OrderStatusHistoryPayload[];
  performanceAssessment: OrderPerformanceAssessmentPublicPayload | null;
  timelineEvents: OrderTimelineEventPayload[];
}

export type ManualPaymentMutationResult =
  | { outcome: "ok"; order: BookingOrderPayload; applied: boolean }
  | { outcome: "not_found" | "invalid_state" | "amount_mismatch" | "conflict" };

export type OrderTransitionGuardedResult =
  | { outcome: "ok"; order: BookingOrderPayload }
  | { outcome: "acceptance_paused"; pauses: ActiveOrderAcceptancePauseSummary[] }
  | { outcome: "invalid_state" | "schedule_conflict" };

export interface BookingRepositoryPort {
  listAvailableSlots: (
    input: AvailabilityListInput
  ) => Promise<PaginatedResponse<ScheduleSlotPayload>>;
  createBooking: (
    input: BookingCreateRepositoryInput,
    options?: BookingCreateRepositoryOptions
  ) => Promise<BookingCreateMutationResult | BookingOrderPayload | null>;
  findScheduleSlotShopId?: (scheduleSlotId: number) => Promise<number | null>;
  findTechnicianShopId?: (technicianProfileId: number) => Promise<number | null>;
  isShopSuspended?: (shopId: number) => Promise<boolean>;
  listOrders: (input: OrderListInput) => Promise<PaginatedResponse<BookingOrderPayload>>;
  findOrderById: (id: number) => Promise<BookingOrderPayload | null>;
  transitionOrder: (
    input: OrderTransitionRepositoryInput,
    options?: OrderTransitionRepositoryOptions
  ) => Promise<OrderTransitionMutationResult>;
  transitionOrderWithScheduleGuard?: (
    input: OrderTransitionRepositoryInput,
    options?: OrderTransitionRepositoryOptions
  ) => Promise<OrderTransitionGuardedResult>;
  findScheduleSlotById: (input: ScheduleSlotReadInput) => Promise<ScheduleSlotPayload | null>;
  listScheduleSlots: (input: ScheduleListInput) => Promise<PaginatedResponse<ScheduleSlotPayload>>;
  createScheduleSlot: (input: ScheduleSlotCreateInput) => Promise<ScheduleMutationResult>;
  updateScheduleSlot: (input: ScheduleSlotUpdateInput) => Promise<ScheduleMutationResult>;
  deleteScheduleSlot: (input: ScheduleSlotDeleteInput) => Promise<ScheduleMutationResult>;
  confirmManualPayment: (
    input: ConfirmManualPaymentRepositoryInput
  ) => Promise<ManualPaymentMutationResult>;
  refundManualPayment: (
    input: RefundManualPaymentRepositoryInput
  ) => Promise<ManualPaymentMutationResult>;
}

type DecimalLike = {
  toFixed: (decimalPlaces?: number) => string;
  toString: () => string;
};

type SlotRecord = Prisma.ScheduleSlotGetPayload<{
  include: {
    service: true;
    technicianService: true;
    shop: true;
    technicianProfile: true;
  };
}>;

type OrderRecord = Prisma.BookingOrderGetPayload<{
  include: {
    service: true;
    technicianService: true;
    shop: true;
    technicianProfile: true;
    statusHistory: {
      orderBy: {
        createdAt: "asc";
      };
    };
    performanceAssessment: {
      select: {
        id: true;
        bookingOrderId: true;
        technicianProfileId: true;
        outcome: true;
        treatment: true;
        version: true;
        currentRevisionId: true;
        createdAt: true;
        updatedAt: true;
      };
    };
    performanceRevisions: {
      select: {
        id: true;
        action: true;
        actorUserId: true;
        publicReason: true;
        createdAt: true;
      };
      orderBy: [{ createdAt: "asc" }, { id: "asc" }];
    };
    affiliateAttributions: {
      include: {
        claim: {
          select: {
            publicCode: true;
          };
        };
      };
    };
  };
}>;

const ACTIVE_ORDER_DB_STATUSES = ["PENDING", "CONFIRMED", "IN_SERVICE"] as const;
const HARD_LOCK_ORDER_DB_STATUSES = ["CONFIRMED", "IN_SERVICE"] as const;

export class BookingRepository implements BookingRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async listAvailableSlots(
    input: AvailabilityListInput
  ): Promise<PaginatedResponse<ScheduleSlotPayload>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.ScheduleSlotWhereInput = {
      deletedAt: null,
      status: "AVAILABLE",
      bookedCount: { lt: this.client.scheduleSlot.fields.capacity },
      ...(input.serviceId ? { serviceId: input.serviceId } : {}),
      ...(input.technicianServiceId ? { technicianServiceId: input.technicianServiceId } : {}),
      startsAt: { gte: input.from },
      endsAt: { lte: input.to },
      ...(input.serviceId
        ? {
            service: {
              deletedAt: null,
              status: "published"
            }
          }
        : {}),
      ...(input.technicianServiceId
        ? {
            technicianService: {
              deletedAt: null,
              isActive: true,
              isBookable: true
            }
          }
        : {}),
      shop: {
        deletedAt: null,
        status: "published",
        entitySuspensions: {
          none: { activeKey: { not: null }, status: "active", deletedAt: null }
        }
      },
      ...(input.shopId ? { shopId: input.shopId } : {}),
      ...(input.technicianId ? { technicianProfileId: input.technicianId } : {})
    };
    const [list, total] = await Promise.all([
      this.client.scheduleSlot.findMany({
        where,
        include: this.slotInclude(),
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ startsAt: "asc" }, { id: "asc" }]
      }),
      this.client.scheduleSlot.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((slot) => this.mapSlot(slot)),
      total,
      pagination
    );
  }

  public async findScheduleSlotShopId(scheduleSlotId: number): Promise<number | null> {
    const slot = await this.client.scheduleSlot.findFirst({
      where: { id: scheduleSlotId, deletedAt: null },
      select: { shopId: true }
    });
    return slot?.shopId ?? null;
  }

  public async findTechnicianShopId(technicianProfileId: number): Promise<number | null> {
    const technician = await this.client.technicianProfile.findFirst({
      where: { id: technicianProfileId, deletedAt: null },
      select: { shopId: true }
    });
    return technician?.shopId ?? null;
  }

  public async isShopSuspended(shopId: number): Promise<boolean> {
    return this.isShopSuspendedInTransaction(this.client, shopId);
  }

  public async findScheduleSlotById(
    input: ScheduleSlotReadInput
  ): Promise<ScheduleSlotPayload | null> {
    const slot = await this.client.scheduleSlot.findFirst({
      where: {
        id: input.id,
        deletedAt: null,
        ...this.scheduleScopeWhere(input)
      },
      include: this.slotInclude()
    });

    return slot ? this.mapSlot(slot) : null;
  }

  public async listScheduleSlots(
    input: ScheduleListInput
  ): Promise<PaginatedResponse<ScheduleSlotPayload>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.ScheduleSlotWhereInput = {
      deletedAt: null,
      startsAt: { lt: input.to },
      endsAt: { gt: input.from },
      ...(input.scope === "merchant"
        ? {
            shopId: input.shopId,
            ...(input.technicianProfileId ? { technicianProfileId: input.technicianProfileId } : {})
          }
        : { technicianProfileId: input.technicianProfileId }),
      ...(input.serviceId ? { serviceId: input.serviceId } : {}),
      ...(input.technicianServiceId ? { technicianServiceId: input.technicianServiceId } : {}),
      ...(input.status ? { status: this.slotStatusToDb(input.status) } : {})
    };
    const [list, total] = await Promise.all([
      this.client.scheduleSlot.findMany({
        where,
        include: this.slotInclude(),
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ startsAt: "asc" }, { id: "asc" }]
      }),
      this.client.scheduleSlot.count({ where })
    ]);
    return buildPaginatedResponse(
      list.map((row) => this.mapSlot(row)),
      total,
      pagination
    );
  }

  public createScheduleSlot(input: ScheduleSlotCreateInput): Promise<ScheduleMutationResult> {
    return this.client.$transaction(
      async (transaction) => {
        const target = await this.resolveScheduleTarget(
          transaction,
          input,
          input.serviceId,
          input.technicianServiceId,
          input.technicianProfileId ?? null
        );
        if (!target) return { outcome: "not_found" };
        if (await this.isShopSuspendedInTransaction(transaction, target.shopId))
          return { outcome: "suspended" };
        await this.lockScheduleOwner(transaction, target.shopId, target.technicianProfileId);
        if (!this.matchesServiceDuration(input.startsAt, input.endsAt, target.durationMinutes)) {
          return { outcome: "duration_mismatch" };
        }
        if (
          target.technicianProfileId &&
          (await this.hasConfirmedBookingOverlap(
            transaction,
            target.technicianProfileId,
            input.startsAt,
            input.endsAt
          ))
        ) {
          return { outcome: "conflict" };
        }
        if (
          await this.hasScheduleOverlap(
            transaction,
            target.shopId,
            target.technicianProfileId,
            target.serviceId,
            input.startsAt,
            input.endsAt
          )
        ) {
          return { outcome: "conflict" };
        }
        const availability = await transaction.availability.create({
          data: {
            shopId: target.shopId,
            technicianProfileId: target.technicianProfileId,
            sourceType: input.scope === "technician" ? "TECHNICIAN" : "SHOP",
            visibility: input.scope === "technician" ? "AFFILIATED_SHOPS" : "SHOP_ONLY",
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            capacity: input.capacity,
            isActive: true
          }
        });
        const created = await transaction.scheduleSlot.create({
          data: {
            availabilityId: availability.id,
            serviceId: target.serviceId,
            technicianServiceId: target.technicianServiceId,
            shopId: target.shopId,
            technicianProfileId: target.technicianProfileId,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            capacity: input.capacity,
            status: "AVAILABLE"
          },
          include: this.slotInclude()
        });
        return { outcome: "ok", slot: this.mapSlot(created) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
    );
  }

  public updateScheduleSlot(input: ScheduleSlotUpdateInput): Promise<ScheduleMutationResult> {
    return this.client.$transaction(
      async (transaction) => {
        const existing = await transaction.scheduleSlot.findFirst({
          where: { id: input.id, deletedAt: null, ...this.scheduleScopeWhere(input) },
          include: this.slotInclude()
        });
        if (existing && (await this.isShopSuspendedInTransaction(transaction, existing.shopId)))
          return { outcome: "suspended" };
        if (!existing || (!existing.serviceId && !existing.technicianServiceId))
          return { outcome: "not_found" };
        await this.lockScheduleOwner(transaction, existing.shopId, existing.technicianProfileId);
        const startsAt = input.startsAt ?? existing.startsAt;
        const endsAt = input.endsAt ?? existing.endsAt;
        const capacity = input.capacity ?? existing.capacity;
        const timeChanged =
          startsAt.getTime() !== existing.startsAt.getTime() ||
          endsAt.getTime() !== existing.endsAt.getTime();
        if (
          existing.bookedCount > 0 &&
          (timeChanged || input.status === "blocked" || capacity < existing.bookedCount)
        ) {
          return { outcome: "in_use" };
        }
        if (
          !this.matchesServiceDuration(
            startsAt,
            endsAt,
            existing.service?.durationMinutes ?? existing.technicianService?.durationMinutes ?? 0
          )
        ) {
          return { outcome: "duration_mismatch" };
        }
        if (
          timeChanged &&
          existing.technicianProfileId &&
          (await this.hasConfirmedBookingOverlap(
            transaction,
            existing.technicianProfileId,
            startsAt,
            endsAt,
            existing.id
          ))
        ) {
          return { outcome: "conflict" };
        }
        if (
          timeChanged &&
          (await this.hasScheduleOverlap(
            transaction,
            existing.shopId,
            existing.technicianProfileId,
            existing.serviceId,
            startsAt,
            endsAt,
            existing.id
          ))
        ) {
          return { outcome: "conflict" };
        }
        const requestedStatus = input.status ? this.slotStatusToDb(input.status) : existing.status;
        const status =
          existing.bookedCount >= capacity
            ? "BOOKED"
            : requestedStatus === "BOOKED"
              ? "AVAILABLE"
              : requestedStatus;
        if (existing.availabilityId) {
          await transaction.availability.updateMany({
            where: { id: existing.availabilityId, deletedAt: null },
            data: { startsAt, endsAt, capacity, isActive: status !== "BLOCKED" }
          });
        }
        const updated = await transaction.scheduleSlot.update({
          where: { id: existing.id },
          data: { startsAt, endsAt, capacity, status },
          include: this.slotInclude()
        });
        return { outcome: "ok", slot: this.mapSlot(updated) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
    );
  }

  public deleteScheduleSlot(input: ScheduleSlotDeleteInput): Promise<ScheduleMutationResult> {
    return this.client.$transaction(
      async (transaction) => {
        const existing = await transaction.scheduleSlot.findFirst({
          where: { id: input.id, deletedAt: null, ...this.scheduleScopeWhere(input) },
          include: this.slotInclude()
        });
        if (!existing) return { outcome: "not_found" };
        await this.lockScheduleOwner(transaction, existing.shopId, existing.technicianProfileId);
        const activeOrders = await transaction.bookingOrder.count({
          where: {
            scheduleSlotId: existing.id,
            deletedAt: null,
            status: { in: [...ACTIVE_ORDER_DB_STATUSES] }
          }
        });
        if (existing.bookedCount > 0 || activeOrders > 0) return { outcome: "in_use" };
        const deletedAt = new Date();
        const deleted = await transaction.scheduleSlot.update({
          where: { id: existing.id },
          data: { status: "BLOCKED", deletedAt },
          include: this.slotInclude()
        });
        if (existing.availabilityId) {
          await transaction.availability.updateMany({
            where: { id: existing.availabilityId, deletedAt: null },
            data: { isActive: false, deletedAt }
          });
        }
        return { outcome: "ok", slot: this.mapSlot(deleted) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
    );
  }

  public async createBooking(
    input: BookingCreateRepositoryInput,
    options: BookingCreateRepositoryOptions = {}
  ): Promise<BookingCreateMutationResult | null> {
    if (Boolean(options.prepareAffiliate) !== Boolean(options.persistAffiliate)) {
      throw new Error("error.affiliate.checkout_hook_invalid");
    }
    try {
      return await runWithTransactionConflictRetry(() =>
        this.client.$transaction(
          async (tx) => {
            if (!(await this.lockCustomerUser(tx, input.customerUserId))) {
              return null;
            }
            const customerProfile = await tx.customerProfile.findFirst({
              where: { userId: input.customerUserId, deletedAt: null },
              select: { membershipLevel: true }
            });
            const isBlackMember = customerProfile?.membershipLevel.toLowerCase() === "black";

            let slot = await tx.scheduleSlot.findFirst({
              where: {
                id: input.scheduleSlotId,
                ...(input.serviceId ? { serviceId: input.serviceId } : {}),
                ...(input.technicianServiceId
                  ? { technicianServiceId: input.technicianServiceId }
                  : {}),
                deletedAt: null,
                status: { in: ["AVAILABLE", "BOOKED"] },
                ...(input.serviceId
                  ? {
                      service: {
                        deletedAt: null,
                        status: "published"
                      }
                    }
                  : {}),
                ...(input.technicianServiceId
                  ? {
                      technicianService: {
                        deletedAt: null,
                        isActive: true,
                        isBookable: true
                      }
                    }
                  : {}),
                shop: {
                  deletedAt: null,
                  status: "published",
                  entitySuspensions: {
                    none: { activeKey: { not: null }, status: "active", deletedAt: null }
                  }
                }
              },
              include: this.slotInclude()
            });

            if (!slot) {
              return null;
            }

            await this.lockScheduleOwner(tx, slot.shopId, slot.technicianProfileId);

            const supersededPendingOrders = !isBlackMember
              ? await tx.bookingOrder.findMany({
                  where: {
                    customerUserId: input.customerUserId,
                    status: "PENDING",
                    deletedAt: null
                  },
                  include: this.orderInclude(),
                  orderBy: { id: "asc" }
                })
              : [];
            const supersededOrderIds = supersededPendingOrders.map((order) => order.id);

            if (supersededOrderIds.length > 0) {
              const cancelled = await tx.bookingOrder.updateMany({
                where: {
                  id: { in: supersededOrderIds },
                  customerUserId: input.customerUserId,
                  status: "PENDING",
                  deletedAt: null
                },
                data: {
                  status: "CANCELLED",
                  cancelReason: "superseded_by_new_pending_order"
                }
              });
              if (cancelled.count !== supersededOrderIds.length) {
                throw new Error("error.booking.pending_replacement_conflict");
              }

              const slotReleaseCounts = new Map<number, number>();
              for (const pendingOrder of supersededPendingOrders) {
                slotReleaseCounts.set(
                  pendingOrder.scheduleSlotId,
                  (slotReleaseCounts.get(pendingOrder.scheduleSlotId) ?? 0) + 1
                );
              }
              for (const [scheduleSlotId, releaseCount] of slotReleaseCounts) {
                const released = await tx.scheduleSlot.updateMany({
                  where: {
                    id: scheduleSlotId,
                    bookedCount: { gte: releaseCount },
                    deletedAt: null
                  },
                  data: {
                    bookedCount: { decrement: releaseCount },
                    status: "AVAILABLE"
                  }
                });
                if (released.count !== 1) {
                  throw new BookingPendingReplacementUnavailableError();
                }
              }
            }

            slot = await tx.scheduleSlot.findFirst({
              where: {
                id: input.scheduleSlotId,
                ...(input.serviceId ? { serviceId: input.serviceId } : {}),
                ...(input.technicianServiceId
                  ? { technicianServiceId: input.technicianServiceId }
                  : {}),
                deletedAt: null,
                status: "AVAILABLE",
                ...(input.serviceId ? { service: { deletedAt: null, status: "published" } } : {}),
                ...(input.technicianServiceId
                  ? {
                      technicianService: {
                        deletedAt: null,
                        isActive: true,
                        isBookable: true
                      }
                    }
                  : {}),
                shop: {
                  deletedAt: null,
                  status: "published",
                  entitySuspensions: {
                    none: { activeKey: { not: null }, status: "active", deletedAt: null }
                  }
                }
              },
              include: this.slotInclude()
            });
            if (!slot || slot.bookedCount >= slot.capacity) {
              if (supersededOrderIds.length > 0) {
                throw new BookingPendingReplacementUnavailableError();
              }
              return null;
            }

            const pricingMode = this.pricingModeFromDb(slot.shop.pricingMode);
            const serviceSource =
              pricingMode === "technician"
                ? this.createTechnicianServiceSource(slot, input.technicianServiceId)
                : this.createShopServiceSource(slot, input.serviceId);

            if (!serviceSource) {
              if (supersededOrderIds.length > 0) {
                throw new BookingPendingReplacementUnavailableError();
              }
              return null;
            }

            const conflict = await tx.bookingOrder.findFirst({
              where: {
                deletedAt: null,
                OR: [
                  {
                    customerUserId: input.customerUserId,
                    status: {
                      in: isBlackMember
                        ? [...ACTIVE_ORDER_DB_STATUSES]
                        : [...HARD_LOCK_ORDER_DB_STATUSES]
                    },
                    startsAt: { lt: slot.endsAt },
                    endsAt: { gt: slot.startsAt }
                  },
                  ...(slot.technicianProfileId
                    ? [
                        {
                          scheduleSlotId: { not: slot.id },
                          technicianProfileId: slot.technicianProfileId,
                          status: { in: [...HARD_LOCK_ORDER_DB_STATUSES] },
                          startsAt: { lt: slot.endsAt },
                          endsAt: { gt: slot.startsAt }
                        }
                      ]
                    : [])
                ]
              },
              select: { id: true }
            });

            if (conflict) {
              if (supersededOrderIds.length > 0) {
                throw new BookingPendingReplacementUnavailableError();
              }
              return null;
            }

            if (options.invalidateSupersededAffiliate) {
              for (const bookingOrderId of supersededOrderIds) {
                await options.invalidateSupersededAffiliate({
                  transactionClient: tx,
                  bookingOrderId,
                  actorUserId: input.customerUserId
                });
              }
            }

            const originalPriceJpy = Math.round(Number(serviceSource.priceAmount.toString()));
            const affiliateContext: BookingCreateAffiliatePreparationContext = {
              transactionClient: tx,
              customerUserId: input.customerUserId,
              shopId: slot.shopId,
              serviceId: serviceSource.affiliateServiceId,
              originalPriceJpy,
              scheduledStartAt: slot.startsAt
            };
            const preparedAffiliate = options.prepareAffiliate
              ? await options.prepareAffiliate(affiliateContext)
              : null;
            const finalPriceJpy = preparedAffiliate?.finalPriceJpy ?? originalPriceJpy;

            const nextBookedCount = slot.bookedCount + 1;
            const slotUpdate = await tx.scheduleSlot.updateMany({
              where: {
                id: slot.id,
                deletedAt: null,
                status: "AVAILABLE",
                bookedCount: { lt: slot.capacity }
              },
              data: {
                bookedCount: { increment: 1 },
                status: nextBookedCount >= slot.capacity ? "BOOKED" : "AVAILABLE"
              }
            });

            if (slotUpdate.count !== 1) {
              if (supersededOrderIds.length > 0) {
                throw new BookingPendingReplacementUnavailableError();
              }
              return null;
            }

            const order = await tx.bookingOrder.create({
              data: {
                orderNo: this.createOrderNo(),
                orderType: this.orderTypeToDb(input.orderType ?? "booking"),
                customerUserId: input.customerUserId,
                serviceId: serviceSource.serviceId,
                technicianServiceId: serviceSource.technicianServiceId,
                shopId: slot.shopId,
                technicianProfileId: slot.technicianProfileId,
                scheduleSlotId: slot.id,
                status: "PENDING",
                fulfillmentMode: input.fulfillmentMode,
                priceAmount: finalPriceJpy,
                currency: serviceSource.currency,
                pricingModeSnapshot: pricingMode === "technician" ? "TECHNICIAN" : "MERCHANT",
                serviceOwnerType: serviceSource.ownerType === "technician" ? "TECHNICIAN" : "SHOP",
                serviceOwnerId: serviceSource.ownerId,
                serviceNameSnapshot: serviceSource.name,
                servicePriceSnapshot: serviceSource.priceAmount,
                serviceDurationSnapshot: serviceSource.durationMinutes,
                serviceSnapshotJson: serviceSource.snapshot,
                startsAt: slot.startsAt,
                endsAt: slot.endsAt,
                paymentMethod: this.paymentMethodToDb(input.paymentMethod ?? "onsite"),
                paymentAmountJpy: finalPriceJpy,
                note: input.note?.trim() || null,
                statusHistory: {
                  create: {
                    fromStatus: null,
                    toStatus: "PENDING",
                    actorUserId: input.customerUserId
                  }
                }
              },
              include: this.orderInclude()
            });

            if (supersededOrderIds.length > 0) {
              await tx.orderStatusHistory.createMany({
                data: supersededOrderIds.map((bookingOrderId) => ({
                  bookingOrderId,
                  fromStatus: "PENDING" as const,
                  toStatus: "CANCELLED" as const,
                  actorUserId: input.customerUserId,
                  reason: "superseded_by_new_pending_order",
                  metadata: {
                    supersededByBookingOrderId: order.id
                  }
                }))
              });
            }

            const cancelledOrders =
              supersededOrderIds.length > 0
                ? await tx.bookingOrder.findMany({
                    where: { id: { in: supersededOrderIds }, deletedAt: null },
                    include: this.orderInclude(),
                    orderBy: { id: "asc" }
                  })
                : [];

            const buildResult = (createdOrder: OrderRecord): BookingCreateMutationResult => ({
              order: this.mapOrder(createdOrder),
              recipientUserIds: this.providerUserIds(createdOrder),
              supersededOrders: cancelledOrders.map((cancelledOrder) => ({
                order: this.mapOrder(cancelledOrder),
                recipientUserIds: this.providerUserIds(cancelledOrder)
              }))
            });

            if (preparedAffiliate && options.persistAffiliate) {
              if (!serviceSource.affiliateServiceId) {
                throw new Error("error.affiliate.promotion_scope_mismatch");
              }
              await options.persistAffiliate({
                ...affiliateContext,
                serviceId: serviceSource.affiliateServiceId,
                bookingOrderId: order.id,
                prepared: preparedAffiliate
              });
              const attributedOrder = await tx.bookingOrder.findFirst({
                where: { id: order.id, deletedAt: null },
                include: this.orderInclude()
              });
              if (!attributedOrder) {
                throw new Error("error.order.not_found");
              }
              return buildResult(attributedOrder);
            }

            return buildResult(order);
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }
        )
      );
    } catch (error) {
      if (error instanceof BookingPendingReplacementUnavailableError) {
        return null;
      }
      throw error;
    }
  }

  private async isShopSuspendedInTransaction(
    transaction: Pick<Prisma.TransactionClient, "entitySuspension">,
    shopId: number
  ): Promise<boolean> {
    const suspension = await transaction.entitySuspension.findFirst({
      where: {
        subjectType: "shop",
        shopId,
        activeKey: { not: null },
        status: "active",
        deletedAt: null
      },
      select: { id: true }
    });
    return suspension !== null;
  }

  public async listOrders(input: OrderListInput): Promise<PaginatedResponse<BookingOrderPayload>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.BookingOrderWhereInput = {
      deletedAt: null,
      ...(input.customerUserId ? { customerUserId: input.customerUserId } : {}),
      ...(input.shopId ? { shopId: input.shopId } : {}),
      ...(input.technicianProfileId ? { technicianProfileId: input.technicianProfileId } : {}),
      ...(input.status ? { status: this.statusToDb(input.status) } : {}),
      ...(input.from && input.to ? { startsAt: { gte: input.from, lt: input.to } } : {})
    };
    const [list, total] = await Promise.all([
      this.client.bookingOrder.findMany({
        where,
        include: this.orderInclude(),
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ startsAt: "desc" }, { id: "desc" }]
      }),
      this.client.bookingOrder.count({ where })
    ]);

    return buildPaginatedResponse(
      list.map((order) => this.mapOrder(order)),
      total,
      pagination
    );
  }

  public async findOrderById(id: number): Promise<BookingOrderPayload | null> {
    const order = await this.client.bookingOrder.findFirst({
      where: {
        id,
        deletedAt: null
      },
      include: this.orderInclude()
    });

    return order ? this.mapOrder(order) : null;
  }

  public async transitionOrder(
    input: OrderTransitionRepositoryInput,
    options: OrderTransitionRepositoryOptions = {}
  ): Promise<OrderTransitionMutationResult> {
    const result = await this.transitionOrderWithScheduleGuard(input, options);
    if (!result) {
      return null;
    }
    if (result.outcome === "ok") {
      return result.order;
    }
    if (result.outcome === "acceptance_paused") {
      return { kind: "acceptance_paused", pauses: result.pauses };
    }
    return null;
  }

  public async transitionOrderWithScheduleGuard(
    input: OrderTransitionRepositoryInput,
    options: OrderTransitionRepositoryOptions = {}
  ): Promise<OrderTransitionGuardedResult> {
    const actor: OrderTransitionActorContext = input.actor ?? {
      userId: input.actorUserId,
      identityId: null,
      identityType: "unknown"
    };
    if (actor.userId !== input.actorUserId) {
      throw new Error("error.order.transition_actor_mismatch");
    }
    return runWithTransactionConflictRetry(() =>
      this.client.$transaction(async (tx) => {
        const current = await tx.bookingOrder.findFirst({
          where: {
            id: input.id,
            deletedAt: null
          },
          include: this.orderInclude()
        });

        if (!current || this.statusFromDb(current.status) !== input.fromStatus) {
          return { outcome: "invalid_state" as const };
        }

        if (input.toStatus === "confirmed") {
          const pauses = await this.findActiveAcceptancePauses(tx, current.shopId);
          if (pauses.length > 0) {
            return { outcome: "acceptance_paused" as const, pauses };
          }

          if (current.technicianProfileId) {
            await this.lockScheduleOwner(tx, current.shopId, current.technicianProfileId);
            const conflict = await tx.bookingOrder.findFirst({
              where: {
                id: { not: current.id },
                technicianProfileId: current.technicianProfileId,
                status: { in: [...HARD_LOCK_ORDER_DB_STATUSES] },
                startsAt: { lt: current.endsAt },
                endsAt: { gt: current.startsAt },
                deletedAt: null
              },
              select: { id: true }
            });
            if (conflict) {
              return { outcome: "schedule_conflict" as const };
            }
          }
        }

        const update = await tx.bookingOrder.updateMany({
          where: {
            id: input.id,
            deletedAt: null,
            status: this.statusToDb(input.fromStatus)
          },
          data: {
            status: this.statusToDb(input.toStatus),
            cancelReason: input.toStatus === "cancelled" ? input.reason?.trim() || null : undefined,
            paymentStatus:
              input.toStatus === "cancelled" && current.paymentStatus === "CONFIRMED"
                ? "REFUND_PENDING"
                : undefined
          }
        });

        if (update.count !== 1) {
          return { outcome: "invalid_state" as const };
        }

        if (input.toStatus === "cancelled") {
          await tx.scheduleSlot.updateMany({
            where: {
              id: current.scheduleSlotId,
              bookedCount: { gt: 0 }
            },
            data: {
              bookedCount: { decrement: 1 },
              status: "AVAILABLE"
            }
          });
        }

        await tx.orderStatusHistory.create({
          data: {
            bookingOrderId: input.id,
            fromStatus: this.statusToDb(input.fromStatus),
            toStatus: this.statusToDb(input.toStatus),
            actorUserId: actor.userId,
            reason: input.reason?.trim() || null
          }
        });

        if (
          input.toStatus === "cancelled" &&
          current.technicianProfileId !== null &&
          current.technicianProfile?.userId === actor.userId
        ) {
          const publicReason = input.reason?.trim() || null;
          const idempotencyKey = `booking-transition:${current.id}:technician-cancelled`;
          const requestFingerprint = createHash("sha256")
            .update(
              JSON.stringify({
                action: "classify_technician_cancelled",
                bookingOrderId: current.id,
                technicianProfileId: current.technicianProfileId,
                actorUserId: actor.userId,
                actorIdentityId: actor.identityId,
                actorIdentityType: actor.identityType,
                publicReason
              })
            )
            .digest("hex");
          const classification = await classifyAdverseOutcomeInTransaction(tx, {
            bookingOrderId: current.id,
            technicianProfileId: current.technicianProfileId,
            outcome: OrderPerformanceOutcome.TECHNICIAN_CANCELLED,
            actorUserId: actor.userId,
            publicReason,
            internalNote: null,
            idempotencyKey,
            requestFingerprint,
            expectedRevision: 0,
            calculatedAt: new Date()
          });
          if (classification.outcome !== "ok") {
            throw new Error("error.order_performance.classification_conflict");
          }
        } else if (input.toStatus === "completed" && current.technicianProfileId !== null) {
          await recalculateTechnicianSummaryInTransaction(
            tx,
            current.technicianProfileId,
            new Date()
          );
        }

        if (options.settle) {
          await options.settle({
            transactionClient: tx,
            order: this.mapOrder(current)
          });
        }

        const next = await tx.bookingOrder.findFirst({
          where: {
            id: input.id,
            deletedAt: null
          },
          include: this.orderInclude()
        });

        return next
          ? { outcome: "ok" as const, order: this.mapOrder(next) }
          : { outcome: "invalid_state" as const };
      })
    );
  }

  public confirmManualPayment(
    input: ConfirmManualPaymentRepositoryInput
  ): Promise<ManualPaymentMutationResult> {
    return this.client.$transaction(async (tx) => {
      const current = await tx.bookingOrder.findFirst({
        where: {
          id: input.orderId,
          deletedAt: null,
          ...this.manualPaymentScopeWhere(input)
        },
        include: this.orderInclude()
      });

      if (!current) {
        return { outcome: "not_found" };
      }

      const amountJpy = Math.round(Number(current.priceAmount.toString()));

      if (input.amountJpy !== amountJpy) {
        return { outcome: "amount_mismatch" };
      }

      const reference = input.reference?.trim() || null;
      const note = input.note?.trim() || null;
      const method = this.paymentMethodToDb(input.method);

      if (current.paymentStatus === "CONFIRMED") {
        const isSameConfirmation =
          current.paymentMethod === method &&
          current.paymentAmountJpy === input.amountJpy &&
          current.paymentReference === reference &&
          current.paymentNote === note;

        return isSameConfirmation
          ? { outcome: "ok", order: this.mapOrder(current), applied: false }
          : { outcome: "conflict" };
      }

      if (current.paymentStatus !== "PENDING") {
        return { outcome: "conflict" };
      }

      if (
        current.status !== "CONFIRMED" &&
        current.status !== "IN_SERVICE" &&
        current.status !== "COMPLETED"
      ) {
        return { outcome: "invalid_state" };
      }

      const confirmedAt = new Date();
      const update = await tx.bookingOrder.updateMany({
        where: {
          id: current.id,
          deletedAt: null,
          paymentStatus: "PENDING",
          status: { in: ["CONFIRMED", "IN_SERVICE", "COMPLETED"] }
        },
        data: {
          paymentMethod: method,
          paymentStatus: "CONFIRMED",
          paymentAmountJpy: input.amountJpy,
          paymentConfirmedById: input.actorUserId,
          paymentConfirmedAt: confirmedAt,
          paymentReference: reference,
          paymentNote: note
        }
      });

      if (update.count !== 1) {
        return { outcome: "conflict" };
      }

      const existingFinancial = await tx.orderFinancial.findUnique({
        where: { bookingOrderId: current.id }
      });
      const timeline = this.appendMoneyTimeline(existingFinancial?.moneyTimelineJson, {
        type: "manual_payment_confirmed",
        label: "线下服务收款已确认",
        amountJpy: input.amountJpy,
        actorType: input.scope === "merchant" ? "merchant" : "backoffice",
        occurredAt: confirmedAt.toISOString(),
        status: "confirmed",
        metadata: { method: input.method, reference }
      });
      const financialData = {
        orderType: current.orderType === "REQUEST" ? "request" : "booking",
        customerUserId: current.customerUserId,
        shopId: current.shopId,
        technicianProfileId: current.technicianProfileId,
        serviceAmountJpy: input.amountJpy,
        platformCollectedServiceAmountJpy: 0,
        offlineReportedServiceAmountJpy: input.amountJpy,
        unknownOrUnreportedServiceAmountJpy: 0,
        paymentChannel: input.method === "bank_transfer" ? "bank_transfer" : "offline_cash",
        serviceIncomeStatus: "confirmed",
        serviceIncomeReportedById: input.actorUserId,
        serviceIncomeReportedAt: confirmedAt,
        serviceIncomeConfirmedById: input.actorUserId,
        serviceIncomeConfirmedAt: confirmedAt,
        serviceIncomeNote: note,
        moneyTimelineJson: timeline as Prisma.InputJsonValue,
        deletedAt: null
      };

      await tx.orderFinancial.upsert({
        where: { bookingOrderId: current.id },
        update: financialData,
        create: { bookingOrderId: current.id, ...financialData }
      });

      const next = await tx.bookingOrder.findFirst({
        where: { id: current.id, deletedAt: null },
        include: this.orderInclude()
      });

      return next
        ? { outcome: "ok", order: this.mapOrder(next), applied: true }
        : { outcome: "not_found" };
    });
  }

  public refundManualPayment(
    input: RefundManualPaymentRepositoryInput
  ): Promise<ManualPaymentMutationResult> {
    return this.client.$transaction(async (tx) => {
      const current = await tx.bookingOrder.findFirst({
        where: {
          id: input.orderId,
          deletedAt: null,
          ...this.manualPaymentScopeWhere(input)
        },
        include: this.orderInclude()
      });

      if (!current) {
        return { outcome: "not_found" };
      }

      const reason = input.reason.trim();
      const reference = input.reference?.trim() || null;

      if (current.paymentStatus === "REFUNDED") {
        const isSameRefund =
          current.paymentRefundReason === reason && current.paymentRefundReference === reference;

        return isSameRefund
          ? { outcome: "ok", order: this.mapOrder(current), applied: false }
          : { outcome: "conflict" };
      }

      const mayRefund =
        (current.paymentStatus === "REFUND_PENDING" && current.status === "CANCELLED") ||
        (current.paymentStatus === "CONFIRMED" && current.status === "COMPLETED");

      if (!mayRefund) {
        return { outcome: "invalid_state" };
      }

      const refundedAt = new Date();
      const update = await tx.bookingOrder.updateMany({
        where: {
          id: current.id,
          deletedAt: null,
          paymentStatus: current.paymentStatus,
          status: current.status
        },
        data: {
          paymentStatus: "REFUNDED",
          paymentRefundedById: input.actorUserId,
          paymentRefundedAt: refundedAt,
          paymentRefundReference: reference,
          paymentRefundReason: reason
        }
      });

      if (update.count !== 1) {
        return { outcome: "conflict" };
      }

      const existingFinancial = await tx.orderFinancial.findUnique({
        where: { bookingOrderId: current.id }
      });
      const timeline = this.appendMoneyTimeline(existingFinancial?.moneyTimelineJson, {
        type: "manual_payment_refunded",
        label: "线下服务收款已退款",
        amountJpy: current.paymentAmountJpy,
        actorType: input.scope === "merchant" ? "merchant" : "backoffice",
        occurredAt: refundedAt.toISOString(),
        status: "refunded",
        metadata: { reason, reference }
      });

      if (existingFinancial) {
        await tx.orderFinancial.update({
          where: { id: existingFinancial.id },
          data: {
            serviceIncomeStatus: "confirmed",
            settlementStatus: "refunded",
            moneyTimelineJson: timeline as Prisma.InputJsonValue
          }
        });
      }

      const next = await tx.bookingOrder.findFirst({
        where: { id: current.id, deletedAt: null },
        include: this.orderInclude()
      });

      return next
        ? { outcome: "ok", order: this.mapOrder(next), applied: true }
        : { outcome: "not_found" };
    });
  }

  private scheduleScopeWhere(scope: ScheduleScope): Prisma.ScheduleSlotWhereInput {
    return scope.scope === "merchant"
      ? { shopId: scope.shopId }
      : { technicianProfileId: scope.technicianProfileId };
  }

  private manualPaymentScopeWhere(scope: ManualPaymentScope): Prisma.BookingOrderWhereInput {
    return scope.scope === "merchant" ? { shopId: scope.shopId } : {};
  }

  private appendMoneyTimeline(value: Prisma.JsonValue | null | undefined, event: object): object[] {
    return [
      ...(Array.isArray(value)
        ? value.filter((item): item is object => Boolean(item) && typeof item === "object")
        : []),
      event
    ];
  }

  private async resolveScheduleTarget(
    transaction: Prisma.TransactionClient,
    scope: ScheduleScope,
    serviceId: number | undefined,
    technicianServiceId: number | undefined,
    requestedTechnicianProfileId: number | null
  ): Promise<{
    shopId: number;
    technicianProfileId: number | null;
    serviceId: number | null;
    technicianServiceId: number | null;
    durationMinutes: number;
  } | null> {
    if (Boolean(serviceId) === Boolean(technicianServiceId)) return null;
    let shopId: number;
    let technicianProfileId = requestedTechnicianProfileId;
    if (scope.scope === "technician") {
      const technician = await transaction.technicianProfile.findFirst({
        where: {
          id: scope.technicianProfileId,
          deletedAt: null,
          status: "published",
          shopId: { not: null }
        },
        select: { id: true, shopId: true }
      });
      if (!technician?.shopId) return null;
      shopId = technician.shopId;
      technicianProfileId = technician.id;
    } else {
      shopId = scope.shopId;
    }
    const shop = await transaction.shop.findFirst({
      where: { id: shopId, deletedAt: null, status: "published" },
      select: { id: true }
    });
    if (!shop) return null;
    if (technicianServiceId) {
      const technicianService = await transaction.technicianService.findFirst({
        where: {
          id: technicianServiceId,
          shopId,
          deletedAt: null,
          isActive: true,
          isBookable: true
        },
        select: { id: true, technicianId: true, durationMinutes: true }
      });
      if (
        !technicianService ||
        (technicianProfileId && technicianProfileId !== technicianService.technicianId)
      )
        return null;
      technicianProfileId = technicianService.technicianId;
      if (!(await this.hasActiveScheduleAffiliation(transaction, shopId, technicianProfileId)))
        return null;
      return {
        shopId,
        technicianProfileId,
        serviceId: null,
        technicianServiceId: technicianService.id,
        durationMinutes: technicianService.durationMinutes
      };
    }
    const [service, technician] = await Promise.all([
      transaction.service.findFirst({
        where: { id: serviceId, shopId, deletedAt: null, status: "published" },
        select: { id: true, durationMinutes: true }
      }),
      technicianProfileId
        ? this.hasActiveScheduleAffiliation(transaction, shopId, technicianProfileId)
        : Promise.resolve(null)
    ]);
    if (!service || (technicianProfileId && !technician)) return null;
    return {
      shopId,
      technicianProfileId,
      serviceId: service.id,
      technicianServiceId: null,
      durationMinutes: service.durationMinutes
    };
  }

  private async lockScheduleOwner(
    transaction: Prisma.TransactionClient,
    shopId: number,
    technicianProfileId: number | null
  ): Promise<void> {
    const updatedAt = new Date();
    if (technicianProfileId) {
      await transaction.technicianProfile.update({
        where: { id: technicianProfileId },
        data: { updatedAt }
      });
      return;
    }
    await transaction.shop.update({ where: { id: shopId }, data: { updatedAt } });
  }

  private async lockCustomerUser(
    transaction: Prisma.TransactionClient,
    userId: number
  ): Promise<boolean> {
    const rows = await transaction.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT \`id\` FROM \`users\` WHERE \`id\` = ${userId} AND \`deleted_at\` IS NULL FOR UPDATE`
    );
    return rows.length === 1;
  }

  private async findActiveAcceptancePauses(
    transaction: Prisma.TransactionClient,
    shopId: number
  ): Promise<ActiveOrderAcceptancePauseSummary[]> {
    await transaction.$queryRaw<Array<{ id: number }>>(
      Prisma.sql`SELECT \`id\` FROM \`shops\` WHERE \`id\` = ${shopId} AND \`deleted_at\` IS NULL FOR UPDATE`
    );
    const at = new Date();
    const memberships = await transaction.$queryRaw<Array<{ merchantAccountId: number }>>(
      Prisma.sql`
        SELECT \`merchant_account_id\` AS \`merchantAccountId\`
        FROM \`merchant_shop_memberships\`
        WHERE \`shop_id\` = ${shopId}
          AND \`active_key\` IS NOT NULL
          AND \`deleted_at\` IS NULL
          AND \`starts_at\` <= ${at}
          AND (\`ends_at\` IS NULL OR \`ends_at\` > ${at})
        ORDER BY \`merchant_account_id\` ASC, \`id\` ASC
        FOR UPDATE
      `
    );
    const merchantAccountIds = Array.from(
      new Set(memberships.map((membership) => membership.merchantAccountId))
    );
    if (merchantAccountIds.length > 0) {
      await transaction.$queryRaw<Array<{ id: number }>>(
        Prisma.sql`SELECT \`id\` FROM \`merchant_accounts\` WHERE \`id\` IN (${Prisma.join(merchantAccountIds)}) AND \`deleted_at\` IS NULL ORDER BY \`id\` FOR UPDATE`
      );
    }
    const pauses = await transaction.orderAcceptancePause.findMany({
      where: {
        status: "ACTIVE",
        activeKey: { not: null },
        deletedAt: null,
        OR: [
          { subjectType: "SHOP", shopId },
          ...(merchantAccountIds.length > 0
            ? [
                {
                  subjectType: "MERCHANT_ACCOUNT" as const,
                  merchantAccountId: { in: merchantAccountIds }
                }
              ]
            : [])
        ]
      },
      select: {
        subjectType: true,
        authorityType: true,
        reasonCode: true,
        startsAt: true
      },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }]
    });
    return pauses.map((pause) => ({
      subjectType: pause.subjectType === "SHOP" ? "shop" : "merchant_account",
      authorityType:
        pause.authorityType === "OPERATIONS"
          ? "operations"
          : pause.authorityType === "MERCHANT"
            ? "merchant"
            : "shop",
      reasonCode: pause.reasonCode,
      startsAt: pause.startsAt
    }));
  }

  private providerUserIds(order: OrderRecord): number[] {
    return Array.from(
      new Set(
        [order.shop.ownerUserId, order.technicianProfile?.userId].filter(
          (userId): userId is number => typeof userId === "number"
        )
      )
    );
  }

  private matchesServiceDuration(startsAt: Date, endsAt: Date, durationMinutes: number): boolean {
    return endsAt.getTime() - startsAt.getTime() === durationMinutes * 60_000;
  }

  private async hasScheduleOverlap(
    transaction: Prisma.TransactionClient,
    shopId: number,
    technicianProfileId: number | null,
    serviceId: number | null,
    startsAt: Date,
    endsAt: Date,
    excludeId?: number
  ): Promise<boolean> {
    return Boolean(
      await transaction.scheduleSlot.findFirst({
        where: {
          deletedAt: null,
          ...(excludeId ? { id: { not: excludeId } } : {}),
          ...(technicianProfileId
            ? { shopId, technicianProfileId }
            : { shopId, serviceId, technicianProfileId: null }),
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt }
        },
        select: { id: true }
      })
    );
  }

  private async hasActiveScheduleAffiliation(
    transaction: Prisma.TransactionClient,
    shopId: number,
    technicianProfileId: number
  ): Promise<boolean> {
    return Boolean(
      await transaction.technicianShopAffiliation.findFirst({
        where: {
          shopId,
          technicianProfileId,
          activeKey: { not: null },
          workStatus: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] },
          endsAt: null,
          deletedAt: null,
          technicianProfile: { deletedAt: null, status: "published" }
        },
        select: { id: true, relationshipType: true }
      })
    );
  }

  private async hasConfirmedBookingOverlap(
    transaction: Prisma.TransactionClient,
    technicianProfileId: number,
    startsAt: Date,
    endsAt: Date,
    excludeScheduleSlotId?: number
  ): Promise<boolean> {
    return Boolean(
      await transaction.bookingOrder.findFirst({
        where: {
          technicianProfileId,
          status: { in: [...HARD_LOCK_ORDER_DB_STATUSES] },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
          deletedAt: null,
          ...(excludeScheduleSlotId ? { scheduleSlotId: { not: excludeScheduleSlotId } } : {})
        },
        select: { id: true }
      })
    );
  }

  private slotInclude() {
    return {
      service: true,
      technicianService: true,
      shop: true,
      technicianProfile: true
    };
  }

  private orderInclude() {
    return {
      service: true,
      technicianService: true,
      shop: true,
      technicianProfile: true,
      statusHistory: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" as const }
      },
      performanceAssessment: {
        select: {
          id: true,
          bookingOrderId: true,
          technicianProfileId: true,
          outcome: true,
          treatment: true,
          version: true,
          currentRevisionId: true,
          createdAt: true,
          updatedAt: true
        }
      },
      performanceRevisions: {
        where: { deletedAt: null },
        orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
        select: {
          id: true,
          action: true,
          actorUserId: true,
          publicReason: true,
          createdAt: true
        }
      },
      affiliateAttributions: {
        where: { deletedAt: null },
        orderBy: { id: "desc" as const },
        take: 1,
        include: {
          claim: {
            select: { publicCode: true }
          }
        }
      }
    };
  }

  private mapSlot(slot: SlotRecord): ScheduleSlotPayload {
    const serviceName = slot.service?.name ?? slot.technicianService?.name ?? "Unknown service";
    const priceAmount = slot.service?.priceAmount ?? slot.technicianService?.priceAmount ?? 0;
    const currency = slot.service?.currency ?? slot.technicianService?.currency ?? "JPY";
    const durationMinutes =
      slot.service?.durationMinutes ?? slot.technicianService?.durationMinutes ?? 0;

    return {
      id: slot.id,
      serviceId: slot.serviceId,
      technicianServiceId: slot.technicianServiceId,
      shopId: slot.shopId,
      technicianProfileId: slot.technicianProfileId,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      capacity: slot.capacity,
      bookedCount: slot.bookedCount,
      status: this.slotStatusFromDb(slot.status),
      serviceName,
      shopName: slot.shop.name,
      technicianName: slot.technicianProfile?.displayName ?? null,
      priceAmount: this.formatDecimal(priceAmount, 2),
      currency,
      durationMinutes
    };
  }

  private mapOrder(order: OrderRecord): BookingOrderPayload {
    const serviceName =
      order.serviceNameSnapshot ??
      order.service?.name ??
      order.technicianService?.name ??
      "Unknown service";

    const statusHistory = order.statusHistory.map((history) => ({
      id: history.id,
      orderId: history.bookingOrderId,
      fromStatus: history.fromStatus ? this.statusFromDb(history.fromStatus) : null,
      toStatus: this.statusFromDb(history.toStatus),
      actorUserId: history.actorUserId,
      reason: history.reason,
      createdAt: history.createdAt
    }));
    const timelineEvents: OrderTimelineEventPayload[] = [
      ...statusHistory.map((history) => ({
        type: "ORDER_STATUS_CHANGED" as const,
        id: `status:${history.id}`,
        createdAt: history.createdAt,
        actorUserId: history.actorUserId,
        fromStatus: history.fromStatus,
        toStatus: history.toStatus,
        publicReason: history.reason
      })),
      ...order.performanceRevisions.map((revision) => ({
        type: this.performanceTimelineType(revision.action),
        id: `performance:${revision.id}`,
        createdAt: revision.createdAt,
        actorUserId: revision.actorUserId,
        publicReason: revision.publicReason
      }))
    ].sort(
      (left, right) =>
        left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id)
    );

    return {
      id: order.id,
      orderNo: order.orderNo,
      orderType: this.orderTypeFromDb(order.orderType),
      status: this.statusFromDb(order.status),
      paymentMethod: this.paymentMethodFromDb(order.paymentMethod),
      paymentStatus: this.paymentStatusFromDb(order.paymentStatus),
      paymentAmountJpy: order.paymentAmountJpy,
      paymentConfirmedById: order.paymentConfirmedById,
      paymentConfirmedAt: order.paymentConfirmedAt,
      paymentReference: order.paymentReference,
      paymentNote: order.paymentNote,
      paymentRefundedById: order.paymentRefundedById,
      paymentRefundedAt: order.paymentRefundedAt,
      paymentRefundReference: order.paymentRefundReference,
      paymentRefundReason: order.paymentRefundReason,
      customerUserId: order.customerUserId,
      serviceId: order.serviceId,
      technicianServiceId: order.technicianServiceId,
      shopId: order.shopId,
      technicianProfileId: order.technicianProfileId,
      scheduleSlotId: order.scheduleSlotId,
      fulfillmentMode: order.fulfillmentMode === "home" ? "home" : "store",
      serviceName,
      pricingModeSnapshot: this.pricingModeFromDb(order.pricingModeSnapshot),
      serviceOwnerType: this.serviceOwnerTypeFromDb(order.serviceOwnerType),
      serviceOwnerId: order.serviceOwnerId,
      serviceNameSnapshot: order.serviceNameSnapshot,
      servicePriceSnapshot: order.servicePriceSnapshot
        ? this.formatDecimal(order.servicePriceSnapshot, 2)
        : null,
      serviceDurationSnapshot: order.serviceDurationSnapshot,
      serviceSnapshot: order.serviceSnapshotJson,
      shopName: order.shop.name,
      technicianName: order.technicianProfile?.displayName ?? null,
      priceAmount: this.formatDecimal(order.priceAmount, 2),
      currency: order.currency,
      startsAt: order.startsAt,
      endsAt: order.endsAt,
      note: order.note,
      cancelReason: order.cancelReason,
      affiliate: order.affiliateAttributions[0]
        ? {
            taskId: order.affiliateAttributions[0].taskId,
            publicCode: order.affiliateAttributions[0].claim.publicCode,
            source: order.affiliateAttributions[0].source === "CODE" ? "code" : "url",
            originalPriceJpy: order.affiliateAttributions[0].originalPriceJpy,
            customerDiscountJpy: order.affiliateAttributions[0].customerDiscountJpy,
            finalPriceJpy: order.affiliateAttributions[0].finalPriceJpy,
            rewardAllocatedNdp: order.affiliateAttributions[0].rewardAllocatedNdp,
            attributionStatus:
              order.affiliateAttributions[0].status.toLowerCase() as AffiliateCheckoutSummary["attributionStatus"]
          }
        : null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      statusHistory,
      performanceAssessment: order.performanceAssessment
        ? {
            id: order.performanceAssessment.id,
            bookingOrderId: order.performanceAssessment.bookingOrderId,
            technicianProfileId: order.performanceAssessment.technicianProfileId,
            outcome:
              order.performanceAssessment.outcome === OrderPerformanceOutcome.TECHNICIAN_CANCELLED
                ? "technician_cancelled"
                : "technician_uncompleted",
            treatment:
              order.performanceAssessment.treatment === OrderPerformanceTreatment.SPECIAL_EXCLUDED
                ? "special_excluded"
                : "counted",
            version: order.performanceAssessment.version,
            currentRevisionId: order.performanceAssessment.currentRevisionId,
            createdAt: order.performanceAssessment.createdAt,
            updatedAt: order.performanceAssessment.updatedAt
          }
        : null,
      timelineEvents
    };
  }

  private performanceTimelineType(
    action: OrderPerformanceRevisionAction
  ): Exclude<OrderTimelineEventPayload, { type: "ORDER_STATUS_CHANGED" }>["type"] {
    switch (action) {
      case OrderPerformanceRevisionAction.CLASSIFY_TECHNICIAN_CANCELLED:
        return "TECHNICIAN_CANCEL_CLASSIFIED";
      case OrderPerformanceRevisionAction.CLASSIFY_TECHNICIAN_UNCOMPLETED:
        return "TECHNICIAN_UNCOMPLETED_CLASSIFIED";
      case OrderPerformanceRevisionAction.APPLY_SPECIAL_EXCLUSION:
        return "SPECIAL_CANCELLATION_APPLIED";
      case OrderPerformanceRevisionAction.REVOKE_SPECIAL_EXCLUSION:
        return "SPECIAL_CANCELLATION_REVOKED";
    }
  }

  private createShopServiceSource(slot: SlotRecord, requestedServiceId?: number) {
    if (!requestedServiceId || !slot.service || slot.serviceId !== requestedServiceId) {
      return null;
    }

    return {
      serviceId: slot.serviceId,
      affiliateServiceId: slot.serviceId,
      technicianServiceId: null,
      ownerType: "shop" as const,
      ownerId: slot.serviceId,
      name: slot.service.name,
      priceAmount: slot.service.priceAmount,
      currency: slot.service.currency,
      durationMinutes: slot.service.durationMinutes,
      snapshot: {
        serviceId: slot.serviceId,
        name: slot.service.name,
        description: slot.service.description,
        priceAmount: this.formatDecimal(slot.service.priceAmount, 2),
        currency: slot.service.currency,
        durationMinutes: slot.service.durationMinutes
      }
    };
  }

  private createTechnicianServiceSource(slot: SlotRecord, requestedTechnicianServiceId?: number) {
    if (
      !requestedTechnicianServiceId ||
      !slot.technicianService ||
      slot.technicianServiceId !== requestedTechnicianServiceId
    ) {
      return null;
    }

    return {
      serviceId: null,
      affiliateServiceId: slot.technicianService.sourceShopServiceId,
      technicianServiceId: slot.technicianServiceId,
      ownerType: "technician" as const,
      ownerId: slot.technicianService.technicianId,
      name: slot.technicianService.name,
      priceAmount: slot.technicianService.priceAmount,
      currency: slot.technicianService.currency,
      durationMinutes: slot.technicianService.durationMinutes,
      snapshot: {
        technicianServiceId: slot.technicianServiceId,
        name: slot.technicianService.name,
        description: slot.technicianService.description,
        priceAmount: slot.technicianService.priceAmount,
        currency: slot.technicianService.currency,
        durationMinutes: slot.technicianService.durationMinutes,
        technicianId: slot.technicianService.technicianId
      }
    };
  }

  private statusFromDb(status: string): BookingOrderStatusPayload {
    if (status === "CONFIRMED") {
      return "confirmed";
    }
    if (status === "IN_SERVICE") {
      return "inService";
    }
    if (status === "COMPLETED") {
      return "completed";
    }
    if (status === "CANCELLED") {
      return "cancelled";
    }

    return "pending";
  }

  private paymentMethodFromDb(method: string): ServicePaymentMethodPayload {
    return method === "BANK_TRANSFER" ? "bank_transfer" : "onsite";
  }

  private paymentMethodToDb(method: ServicePaymentMethodPayload): "ONSITE" | "BANK_TRANSFER" {
    return method === "bank_transfer" ? "BANK_TRANSFER" : "ONSITE";
  }

  private paymentStatusFromDb(status: string): ServicePaymentStatusPayload {
    if (status === "CONFIRMED") return "confirmed";
    if (status === "REFUND_PENDING") return "refundPending";
    if (status === "REFUNDED") return "refunded";
    return "pending";
  }

  private statusToDb(status: BookingOrderStatusPayload) {
    if (status === "confirmed") {
      return "CONFIRMED";
    }
    if (status === "inService") {
      return "IN_SERVICE";
    }
    if (status === "completed") {
      return "COMPLETED";
    }
    if (status === "cancelled") {
      return "CANCELLED";
    }

    return "PENDING";
  }

  private slotStatusFromDb(status: string): ScheduleSlotStatusPayload {
    if (status === "BOOKED") {
      return "booked";
    }
    if (status === "BLOCKED") {
      return "blocked";
    }

    return "available";
  }

  private slotStatusToDb(status: ScheduleSlotStatusPayload) {
    if (status === "booked") return "BOOKED" as const;
    if (status === "blocked") return "BLOCKED" as const;
    return "AVAILABLE" as const;
  }

  private orderTypeFromDb(orderType: string): BookingOrderTypePayload {
    return orderType === "REQUEST" ? "request" : "booking";
  }

  private orderTypeToDb(orderType: BookingOrderTypePayload) {
    return orderType === "request" ? ("REQUEST" as const) : ("BOOKING" as const);
  }

  private pricingModeFromDb(value: string): "merchant" | "technician" {
    return value === "TECHNICIAN" ? "technician" : "merchant";
  }

  private serviceOwnerTypeFromDb(value: string): "shop" | "technician" {
    return value === "TECHNICIAN" ? "technician" : "shop";
  }

  private createOrderNo(): string {
    const now = new Date();
    const timestamp = [
      now.getUTCFullYear(),
      String(now.getUTCMonth() + 1).padStart(2, "0"),
      String(now.getUTCDate()).padStart(2, "0"),
      String(now.getUTCHours()).padStart(2, "0"),
      String(now.getUTCMinutes()).padStart(2, "0"),
      String(now.getUTCSeconds()).padStart(2, "0")
    ].join("");
    const suffix = String(Math.floor(Math.random() * 9000) + 1000);

    return `ND${timestamp}${suffix}`;
  }

  private formatDecimal(value: DecimalLike | string | number, scale: number): string {
    if (typeof value === "number") {
      return value.toFixed(scale);
    }
    if (typeof value === "string") {
      return Number.parseFloat(value).toFixed(scale);
    }

    return value.toFixed(scale);
  }
}
