import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";

export type BookingOrderStatusPayload =
  | "pending"
  | "confirmed"
  | "inService"
  | "completed"
  | "cancelled";
export type BookingOrderTypePayload = "booking" | "request";
export type ScheduleSlotStatusPayload = "available" | "booked" | "blocked";
export type BookingFulfillmentMode = "home" | "store";

export interface AvailabilityListInput extends PaginationInput {
  serviceId: number;
  shopId?: number;
  technicianId?: number;
  from: Date;
  to: Date;
}

export interface BookingCreateRepositoryInput {
  customerUserId: number;
  serviceId: number;
  scheduleSlotId: number;
  fulfillmentMode: BookingFulfillmentMode;
  note?: string | null;
}

export interface OrderListInput extends PaginationInput {
  customerUserId?: number;
  status?: BookingOrderStatusPayload;
}

export interface OrderTransitionRepositoryInput {
  id: number;
  actorUserId: number;
  fromStatus: BookingOrderStatusPayload;
  toStatus: BookingOrderStatusPayload;
  reason?: string | null;
}

export interface ScheduleSlotPayload {
  id: number;
  serviceId: number;
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

export interface BookingOrderPayload {
  id: number;
  orderNo: string;
  orderType: BookingOrderTypePayload;
  status: BookingOrderStatusPayload;
  paymentStatus: "unpaid";
  customerUserId: number;
  serviceId: number;
  shopId: number;
  technicianProfileId: number | null;
  scheduleSlotId: number;
  fulfillmentMode: BookingFulfillmentMode;
  serviceName: string;
  shopName: string;
  technicianName: string | null;
  priceAmount: string;
  currency: string;
  startsAt: Date;
  endsAt: Date;
  note: string | null;
  cancelReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  statusHistory: OrderStatusHistoryPayload[];
}

export interface BookingRepositoryPort {
  listAvailableSlots: (
    input: AvailabilityListInput
  ) => Promise<PaginatedResponse<ScheduleSlotPayload>>;
  createBooking: (input: BookingCreateRepositoryInput) => Promise<BookingOrderPayload | null>;
  listOrders: (input: OrderListInput) => Promise<PaginatedResponse<BookingOrderPayload>>;
  findOrderById: (id: number) => Promise<BookingOrderPayload | null>;
  transitionOrder: (
    input: OrderTransitionRepositoryInput
  ) => Promise<BookingOrderPayload | null>;
}

type DecimalLike = {
  toFixed: (decimalPlaces?: number) => string;
  toString: () => string;
};

type SlotRecord = Prisma.ScheduleSlotGetPayload<{
  include: {
    service: true;
    shop: true;
    technicianProfile: true;
  };
}>;

type OrderRecord = Prisma.BookingOrderGetPayload<{
  include: {
    service: true;
    shop: true;
    technicianProfile: true;
    statusHistory: {
      orderBy: {
        createdAt: "asc";
      };
    };
  };
}>;

const ACTIVE_ORDER_DB_STATUSES = ["PENDING", "CONFIRMED", "IN_SERVICE"] as const;

export class BookingRepository implements BookingRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async listAvailableSlots(
    input: AvailabilityListInput
  ): Promise<PaginatedResponse<ScheduleSlotPayload>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.ScheduleSlotWhereInput = {
      deletedAt: null,
      status: "AVAILABLE",
      serviceId: input.serviceId,
      startsAt: { gte: input.from },
      endsAt: { lte: input.to },
      service: {
        deletedAt: null,
        status: "published"
      },
      shop: {
        deletedAt: null,
        status: "published"
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

  public async createBooking(
    input: BookingCreateRepositoryInput
  ): Promise<BookingOrderPayload | null> {
    return this.client.$transaction(async (tx) => {
      const slot = await tx.scheduleSlot.findFirst({
        where: {
          id: input.scheduleSlotId,
          serviceId: input.serviceId,
          deletedAt: null,
          status: "AVAILABLE",
          service: {
            deletedAt: null,
            status: "published"
          },
          shop: {
            deletedAt: null,
            status: "published"
          }
        },
        include: this.slotInclude()
      });

      if (!slot || slot.bookedCount >= slot.capacity) {
        return null;
      }

      const conflict = await tx.bookingOrder.findFirst({
        where: {
          deletedAt: null,
          status: { in: [...ACTIVE_ORDER_DB_STATUSES] },
          OR: [
            { scheduleSlotId: slot.id },
            ...(slot.technicianProfileId
              ? [
                  {
                    technicianProfileId: slot.technicianProfileId,
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
        return null;
      }

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
        return null;
      }

      const order = await tx.bookingOrder.create({
        data: {
          orderNo: this.createOrderNo(),
          orderType: "BOOKING",
          customerUserId: input.customerUserId,
          serviceId: slot.serviceId,
          shopId: slot.shopId,
          technicianProfileId: slot.technicianProfileId,
          scheduleSlotId: slot.id,
          status: "PENDING",
          fulfillmentMode: input.fulfillmentMode,
          priceAmount: slot.service.priceAmount,
          currency: slot.service.currency,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
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

      return this.mapOrder(order);
    });
  }

  public async listOrders(input: OrderListInput): Promise<PaginatedResponse<BookingOrderPayload>> {
    const pagination = toPrismaPagination(input);
    const where: Prisma.BookingOrderWhereInput = {
      deletedAt: null,
      ...(input.customerUserId ? { customerUserId: input.customerUserId } : {}),
      ...(input.status ? { status: this.statusToDb(input.status) } : {})
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
    input: OrderTransitionRepositoryInput
  ): Promise<BookingOrderPayload | null> {
    return this.client.$transaction(async (tx) => {
      const current = await tx.bookingOrder.findFirst({
        where: {
          id: input.id,
          deletedAt: null
        },
        include: this.orderInclude()
      });

      if (!current || this.statusFromDb(current.status) !== input.fromStatus) {
        return null;
      }

      const update = await tx.bookingOrder.updateMany({
        where: {
          id: input.id,
          deletedAt: null,
          status: this.statusToDb(input.fromStatus)
        },
        data: {
          status: this.statusToDb(input.toStatus),
          cancelReason: input.toStatus === "cancelled" ? input.reason?.trim() || null : undefined
        }
      });

      if (update.count !== 1) {
        return null;
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
          actorUserId: input.actorUserId,
          reason: input.reason?.trim() || null
        }
      });

      const next = await tx.bookingOrder.findFirst({
        where: {
          id: input.id,
          deletedAt: null
        },
        include: this.orderInclude()
      });

      return next ? this.mapOrder(next) : null;
    });
  }

  private slotInclude() {
    return {
      service: true,
      shop: true,
      technicianProfile: true
    };
  }

  private orderInclude() {
    return {
      service: true,
      shop: true,
      technicianProfile: true,
      statusHistory: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" as const }
      }
    };
  }

  private mapSlot(slot: SlotRecord): ScheduleSlotPayload {
    return {
      id: slot.id,
      serviceId: slot.serviceId,
      shopId: slot.shopId,
      technicianProfileId: slot.technicianProfileId,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      capacity: slot.capacity,
      bookedCount: slot.bookedCount,
      status: this.slotStatusFromDb(slot.status),
      serviceName: slot.service.name,
      shopName: slot.shop.name,
      technicianName: slot.technicianProfile?.displayName ?? null,
      priceAmount: this.formatDecimal(slot.service.priceAmount, 2),
      currency: slot.service.currency,
      durationMinutes: slot.service.durationMinutes
    };
  }

  private mapOrder(order: OrderRecord): BookingOrderPayload {
    return {
      id: order.id,
      orderNo: order.orderNo,
      orderType: this.orderTypeFromDb(order.orderType),
      status: this.statusFromDb(order.status),
      paymentStatus: "unpaid",
      customerUserId: order.customerUserId,
      serviceId: order.serviceId,
      shopId: order.shopId,
      technicianProfileId: order.technicianProfileId,
      scheduleSlotId: order.scheduleSlotId,
      fulfillmentMode: order.fulfillmentMode === "home" ? "home" : "store",
      serviceName: order.service.name,
      shopName: order.shop.name,
      technicianName: order.technicianProfile?.displayName ?? null,
      priceAmount: this.formatDecimal(order.priceAmount, 2),
      currency: order.currency,
      startsAt: order.startsAt,
      endsAt: order.endsAt,
      note: order.note,
      cancelReason: order.cancelReason,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      statusHistory: order.statusHistory.map((history) => ({
        id: history.id,
        orderId: history.bookingOrderId,
        fromStatus: history.fromStatus ? this.statusFromDb(history.fromStatus) : null,
        toStatus: this.statusFromDb(history.toStatus),
        actorUserId: history.actorUserId,
        reason: history.reason,
        createdAt: history.createdAt
      }))
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

  private orderTypeFromDb(orderType: string): BookingOrderTypePayload {
    return orderType === "REQUEST" ? "request" : "booking";
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
