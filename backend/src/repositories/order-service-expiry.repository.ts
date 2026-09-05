import {
  BookingOrderStatus,
  OrderServiceEventType,
  Prisma,
  type PrismaClient
} from "@prisma/client";
import { ERROR_CODES } from "../constants/error-codes";
import { prisma } from "../prisma/client";
import type { OrderServiceExpiryRepositoryPort } from "../services/order-service-expiry.service";
import { runWithTransactionConflictRetry } from "../utils/transaction-conflict-retry";
import {
  calculateOrderCheckoutSnapshot,
  OrderCheckoutSnapshotError
} from "./order-checkout-calculation";

const AUTOMATIC_END_REASON = "automatic_timer_elapsed";

export interface OrderServiceExpiryCandidateFailure {
  orderId: number;
  code: number;
  message: string;
}

export type OrderServiceExpiryFailureReporter = (
  failure: OrderServiceExpiryCandidateFailure
) => void | Promise<void>;

const expiryOrderInclude = {
  serviceSession: {
    include: {
      addOns: {
        where: { deletedAt: null },
        orderBy: [{ proposedAt: "asc" }, { id: "asc" }]
      }
    }
  },
  affiliateAttributions: {
    where: { deletedAt: null },
    orderBy: { id: "asc" }
  },
  travelFareSnapshot: true
} satisfies Prisma.BookingOrderInclude;

type ExpiryOrderRecord = Prisma.BookingOrderGetPayload<{ include: typeof expiryOrderInclude }>;

class OrderServiceExpirySnapshotError extends Error {}

export class OrderServiceExpiryRepository implements OrderServiceExpiryRepositoryPort {
  public constructor(
    private readonly client: PrismaClient = prisma,
    private readonly reportFailure?: OrderServiceExpiryFailureReporter
  ) {}

  public async moveDueSessionsToCheckout(input: { now: Date; batchSize: number }): Promise<number> {
    const candidates = await this.client.orderServiceSession.findMany({
      where: {
        deletedAt: null,
        endedAt: null,
        expectedEndsAt: { lte: input.now },
        bookingOrder: {
          status: BookingOrderStatus.IN_SERVICE,
          deletedAt: null
        }
      },
      select: { bookingOrderId: true },
      orderBy: [{ expectedEndsAt: "asc" }, { bookingOrderId: "asc" }],
      take: input.batchSize
    });

    let advanced = 0;
    for (const candidate of candidates) {
      try {
        if (await this.advanceCandidate(candidate.bookingOrderId, input.now)) advanced += 1;
      } catch {
        await this.reportCandidateFailure(candidate.bookingOrderId);
      }
    }
    return advanced;
  }

  private advanceCandidate(orderId: number, now: Date): Promise<boolean> {
    return runWithTransactionConflictRetry(() =>
      this.client.$transaction(async (transaction) => {
        const locked = await transaction.$queryRaw<Array<{ id: number }>>(
          Prisma.sql`SELECT id FROM booking_orders WHERE id = ${orderId} FOR UPDATE`
        );
        if (locked.length !== 1 || Number(locked[0]?.id) !== orderId) return false;

        const order = await transaction.bookingOrder.findFirst({
          where: { id: orderId, deletedAt: null },
          include: expiryOrderInclude
        });
        if (!order || order.status !== BookingOrderStatus.IN_SERVICE) return false;
        const session = order.serviceSession;
        if (
          !session ||
          session.deletedAt ||
          !session.startedAt ||
          !session.expectedEndsAt ||
          session.endedAt ||
          session.endedByUserId !== null ||
          session.expectedEndsAt > now
        ) {
          throw new OrderServiceExpirySnapshotError();
        }
        if (session.addOns.some((addOn) => addOn.status === "PROPOSED")) return false;

        const [existingCheckout, existingEvents, existingTargetHistory] = await Promise.all([
          transaction.orderCheckout.findUnique({ where: { bookingOrderId: order.id } }),
          transaction.orderServiceEvent.findMany({
            where: {
              bookingOrderId: order.id,
              eventType: {
                in: [OrderServiceEventType.SERVICE_ENDED, OrderServiceEventType.CHECKOUT_CREATED]
              },
              deletedAt: null
            },
            select: { id: true },
            take: 1
          }),
          transaction.orderStatusHistory.findMany({
            where: {
              bookingOrderId: order.id,
              toStatus: BookingOrderStatus.AWAITING_CHECKOUT,
              deletedAt: null
            },
            select: { id: true },
            take: 1
          })
        ]);
        if (existingCheckout || existingEvents.length > 0 || existingTargetHistory.length > 0) {
          throw new OrderServiceExpirySnapshotError();
        }

        const dueAt = session.expectedEndsAt;
        const sessionUpdate = await transaction.orderServiceSession.updateMany({
          where: {
            id: session.id,
            bookingOrderId: order.id,
            expectedEndsAt: dueAt,
            endedAt: null,
            deletedAt: null
          },
          data: { endedByUserId: null, endedAt: dueAt, updatedAt: dueAt }
        });
        if (sessionUpdate.count !== 1) throw new OrderServiceExpirySnapshotError();

        const orderUpdate = await transaction.bookingOrder.updateMany({
          where: {
            id: order.id,
            status: BookingOrderStatus.IN_SERVICE,
            deletedAt: null
          },
          data: { status: BookingOrderStatus.AWAITING_CHECKOUT, updatedAt: dueAt }
        });
        if (orderUpdate.count !== 1) throw new OrderServiceExpirySnapshotError();

        await transaction.orderStatusHistory.create({
          data: {
            bookingOrderId: order.id,
            fromStatus: BookingOrderStatus.IN_SERVICE,
            toStatus: BookingOrderStatus.AWAITING_CHECKOUT,
            actorUserId: null,
            reason: AUTOMATIC_END_REASON,
            createdAt: dueAt,
            updatedAt: dueAt
          }
        });
        await transaction.orderServiceEvent.create({
          data: {
            bookingOrderId: order.id,
            serviceSessionId: session.id,
            eventType: OrderServiceEventType.SERVICE_ENDED,
            actorUserId: null,
            idempotencyKey: this.endIdempotencyKey(order.id, dueAt),
            reason: AUTOMATIC_END_REASON,
            metadata: {
              actor: "system",
              trigger: "system_timer",
              expectedEndsAt: dueAt.toISOString()
            },
            occurredAt: dueAt,
            createdAt: dueAt,
            updatedAt: dueAt
          }
        });

        const rate = await this.resolveEffectiveRate(transaction, dueAt);
        const calculation = this.calculateCheckout(order, rate);
        const checkout = await transaction.orderCheckout.create({
          data: {
            bookingOrderId: order.id,
            baseAmountJpy: calculation.baseAmountJpy,
            addOnAmountJpy: calculation.addOnAmountJpy,
            travelFareAmountJpy: calculation.travelFareAmountJpy,
            discountAmountJpy: calculation.discountAmountJpy,
            checkoutAmountJpy: calculation.checkoutAmountJpy,
            payableNdp: calculation.payableNdp,
            ndpRateRuleId: rate.id,
            rateSnapshotJson: calculation.rate,
            calculationSnapshotJson: calculation.calculation,
            createdAt: dueAt,
            updatedAt: dueAt
          }
        });
        await transaction.orderServiceEvent.create({
          data: {
            bookingOrderId: order.id,
            serviceSessionId: session.id,
            orderCheckoutId: checkout.id,
            eventType: OrderServiceEventType.CHECKOUT_CREATED,
            actorUserId: null,
            idempotencyKey: this.checkoutIdempotencyKey(order.id, dueAt),
            metadata: {
              actor: "system",
              trigger: "system_timer",
              expectedEndsAt: dueAt.toISOString(),
              checkoutAmountJpy: calculation.checkoutAmountJpy,
              travelFareAmountJpy: calculation.travelFareAmountJpy,
              payableNdp: calculation.payableNdp,
              rateRuleId: rate.id
            },
            occurredAt: dueAt,
            createdAt: dueAt,
            updatedAt: dueAt
          }
        });
        return true;
      })
    );
  }

  private async resolveEffectiveRate(transaction: Prisma.TransactionClient, at: Date) {
    const rates = await transaction.ndpExchangeRateRule.findMany({
      where: {
        deletedAt: null,
        effectiveFrom: { lte: at },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }]
      },
      select: {
        id: true,
        publicId: true,
        version: true,
        ndpUnits: true,
        jpyUnits: true,
        effectiveFrom: true,
        effectiveTo: true
      },
      orderBy: [{ version: "desc" }, { id: "desc" }],
      take: 2
    });
    if (rates.length !== 1) throw new OrderServiceExpirySnapshotError();
    const rate = rates[0];
    if (!rate || rate.effectiveFrom > at || (rate.effectiveTo !== null && rate.effectiveTo <= at)) {
      throw new OrderServiceExpirySnapshotError();
    }
    return rate;
  }

  private calculateCheckout(
    order: ExpiryOrderRecord,
    rate: {
      id: number;
      publicId: string;
      version: number;
      ndpUnits: number;
      jpyUnits: number;
      effectiveFrom: Date;
    }
  ) {
    try {
      return calculateOrderCheckoutSnapshot(
        {
          currency: order.currency,
          servicePrice: (order.servicePriceSnapshot ?? order.priceAmount).toString(),
          addOns: order.serviceSession?.addOns ?? [],
          affiliateAttribution: order.affiliateAttributions[0] ?? null,
          travelFareAmountJpy: order.travelFareSnapshot?.fareAmountJpy ?? 0
        },
        { ...rate, ruleId: rate.id }
      );
    } catch (error) {
      if (error instanceof OrderCheckoutSnapshotError) {
        throw new OrderServiceExpirySnapshotError();
      }
      throw error;
    }
  }

  private endIdempotencyKey(orderId: number, dueAt: Date): string {
    return `order-service:auto-end:v1:${orderId}:${dueAt.toISOString()}`;
  }

  private checkoutIdempotencyKey(orderId: number, dueAt: Date): string {
    return `order-service:auto-checkout:v1:${orderId}:${dueAt.toISOString()}`;
  }

  private async reportCandidateFailure(orderId: number): Promise<void> {
    if (!this.reportFailure) return;
    try {
      await this.reportFailure({
        orderId,
        code: ERROR_CODES.INTERNAL,
        message: "error.internal_server_error"
      });
    } catch {
      return;
    }
  }
}
