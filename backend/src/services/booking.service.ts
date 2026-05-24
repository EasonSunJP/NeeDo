import { ERROR_CODES } from "../constants/error-codes";
import type {
  AvailabilityListInput,
  BookingCreateRepositoryInput,
  BookingOrderPayload,
  BookingOrderStatusPayload,
  BookingRepositoryPort,
  OrderListInput
} from "../repositories/booking.repository";
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
  public constructor(private readonly repository: BookingRepositoryPort) {}

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

  public async getOrder(_actor: AuthenticatedBookingActor, id: number): Promise<BookingOrderPayload> {
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

    const next = await this.repository.transitionOrder({
      id,
      actorUserId: actor.userId,
      fromStatus: order.status,
      toStatus: rule.to,
      reason
    });

    if (!next) {
      throw this.invalidTransitionError();
    }

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
}
