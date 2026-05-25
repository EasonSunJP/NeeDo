import { ERROR_CODES } from "../constants/error-codes";
import type {
  AvailabilityListInput,
  BookingCreateRepositoryInput,
  BookingOrderPayload,
  BookingOrderStatusPayload,
  BookingRepositoryPort,
  OrderTransitionRepositoryOptions,
  OrderListInput
} from "../repositories/booking.repository";
import type { BookingLedgerSettlementPort } from "./ledger.service";
import type { OrderStatusNotificationPort } from "./realtime.service";
import { AppError } from "../utils/app-error";
import type { PaginatedResponse } from "../utils/pagination";

export interface AuthenticatedBookingActor {
  userId: number;
  roles: string[];
}

export interface BookingCreateInput extends Omit<BookingCreateRepositoryInput, "customerUserId"> {
  orderType?: "booking";
}

type OrderAction = "confirm" | "cancel" | "start" | "complete";

const ORDER_TRANSITIONS = {
  confirm: {
    from: ["pending"],
    to: "confirmed"
  },
  cancel: {
    from: ["pending", "confirmed"],
    to: "cancelled"
  },
  start: {
    from: ["confirmed"],
    to: "inService"
  },
  complete: {
    from: ["inService"],
    to: "completed"
  }
} as const satisfies Record<
  OrderAction,
  { from: readonly BookingOrderStatusPayload[]; to: BookingOrderStatusPayload }
>;

export class BookingService {
  public constructor(
    private readonly repository: BookingRepositoryPort,
    private readonly ledgerService?: BookingLedgerSettlementPort,
    private readonly notificationService?: OrderStatusNotificationPort
  ) {}

  public listAvailableSlots(input: AvailabilityListInput) {
    return this.repository.listAvailableSlots(input);
  }

  public async createBooking(
    actor: AuthenticatedBookingActor,
    input: BookingCreateInput
  ): Promise<BookingOrderPayload> {
    const order = await this.repository.createBooking({
      customerUserId: actor.userId,
      serviceId: input.serviceId,
      scheduleSlotId: input.scheduleSlotId,
      fulfillmentMode: input.fulfillmentMode,
      note: input.note
    });

    if (!order) {
      throw this.slotUnavailableError();
    }

    return order;
  }

  public listOrders(
    _actor: AuthenticatedBookingActor,
    input: OrderListInput
  ): Promise<PaginatedResponse<BookingOrderPayload>> {
    return this.repository.listOrders(input);
  }

  public async getOrder(
    _actor: AuthenticatedBookingActor,
    id: number
  ): Promise<BookingOrderPayload> {
    const order = await this.repository.findOrderById(id);

    if (!order) {
      throw this.notFoundError();
    }

    return order;
  }

  public transitionOrder(
    actor: AuthenticatedBookingActor,
    id: number,
    action: OrderAction,
    reason?: string | null
  ): Promise<BookingOrderPayload> {
    return this.transition(actor, id, action, reason);
  }

  private async transition(
    actor: AuthenticatedBookingActor,
    id: number,
    action: OrderAction,
    reason?: string | null
  ): Promise<BookingOrderPayload> {
    const order = await this.getOrder(actor, id);
    const rule = ORDER_TRANSITIONS[action];
    const allowedStatuses: readonly BookingOrderStatusPayload[] = rule.from;

    if (!allowedStatuses.includes(order.status)) {
      throw this.invalidTransitionError();
    }

    const next = await this.repository.transitionOrder(
      {
        id,
        actorUserId: actor.userId,
        fromStatus: order.status,
        toStatus: rule.to,
        reason
      },
      this.createSettlementOptions(actor, order, action)
    );

    if (!next) {
      throw this.invalidTransitionError();
    }

    await this.notificationService?.notifyOrderStatusChanged({
      actorUserId: actor.userId,
      orderId: next.id,
      orderNo: next.orderNo,
      fromStatus: order.status,
      toStatus: next.status,
      serviceName: next.serviceName,
      recipientUserIds: this.resolveOrderNotificationRecipients(actor, next)
    });

    return next;
  }

  private slotUnavailableError(): AppError {
    return new AppError({
      code: ERROR_CODES.BOOKING_SLOT_UNAVAILABLE,
      message: "error.booking.slot_unavailable",
      statusCode: 409
    });
  }

  private invalidTransitionError(): AppError {
    return new AppError({
      code: ERROR_CODES.ORDER_INVALID_TRANSITION,
      message: "error.order.invalid_transition",
      statusCode: 409
    });
  }

  private notFoundError(): AppError {
    return new AppError({
      code: ERROR_CODES.NOT_FOUND,
      message: "error.order.not_found",
      statusCode: 404
    });
  }

  private createSettlementOptions(
    actor: AuthenticatedBookingActor,
    order: BookingOrderPayload,
    action: OrderAction
  ): OrderTransitionRepositoryOptions {
    if (!this.ledgerService) {
      return {};
    }

    if (action === "confirm") {
      return {
        settle: (context) =>
          this.ledgerService!.freezeBookingAcceptance(
            {
              bookingOrderId: order.id,
              shopId: order.shopId,
              actorUserId: actor.userId
            },
            { transactionClient: context.transactionClient }
          ).then(() => undefined)
      };
    }

    if (action === "complete") {
      return {
        settle: (context) =>
          this.ledgerService!.settleBookingCompletion(
            {
              bookingOrderId: order.id,
              shopId: order.shopId,
              customerUserId: order.customerUserId,
              actorUserId: actor.userId
            },
            { transactionClient: context.transactionClient }
          ).then(() => undefined)
      };
    }

    if (action === "cancel" && order.status === "confirmed") {
      return this.isServiceProviderActor(actor)
        ? {
            settle: (context) =>
              this.ledgerService!.compensateCustomerForMerchantCancellation(
                {
                  bookingOrderId: order.id,
                  shopId: order.shopId,
                  customerUserId: order.customerUserId,
                  actorUserId: actor.userId
                },
                { transactionClient: context.transactionClient }
              ).then(() => undefined)
          }
        : {
            settle: (context) =>
              this.ledgerService!.releaseBookingHold(
                {
                  bookingOrderId: order.id,
                  shopId: order.shopId,
                  actorUserId: actor.userId
                },
                { transactionClient: context.transactionClient }
              ).then(() => undefined)
          };
    }

    return {};
  }

  private isServiceProviderActor(actor: AuthenticatedBookingActor): boolean {
    return actor.roles.some((role) =>
      ["merchant_owner", "merchant_staff", "technician"].includes(role)
    );
  }

  private resolveOrderNotificationRecipients(
    actor: AuthenticatedBookingActor,
    order: BookingOrderPayload
  ): number[] {
    return order.customerUserId === actor.userId ? [] : [order.customerUserId];
  }
}
