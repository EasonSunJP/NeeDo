import { ERROR_CODES } from "../constants/error-codes";
import { logger } from "../config/logger";
import type {
  AvailabilityListInput,
  BookingCreateRepositoryOptions,
  BookingCreateRepositoryInput,
  BookingOrderPayload,
  BookingOrderStatusPayload,
  BookingRepositoryPort,
  ManualPaymentMutationResult,
  ManualPaymentScope,
  OrderAcceptancePausedResult,
  OrderTransitionRepositoryOptions,
  OrderListInput,
  ScheduleListInput,
  ScheduleMutationResult,
  ScheduleScope,
  ScheduleSlotCreateInput,
  ScheduleSlotPayload,
  ScheduleSlotUpdateInput
} from "../repositories/booking.repository";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import type { AuditLogService } from "./audit-log.service";
import type { BookingLedgerSettlementPort } from "./ledger.service";
import type { OrderStatusNotificationInput, OrderStatusNotificationPort } from "./realtime.service";
import { AppError } from "../utils/app-error";
import type { PaginatedResponse } from "../utils/pagination";
import {
  selectAffiliatePromotion,
  type AffiliateCheckoutService,
  type AffiliatePromotionInput
} from "./affiliate-checkout.service";
import { hasMerchantShopScope, requireMerchantShopId } from "./merchant-shop-scope";

export interface AuthenticatedBookingActor {
  userId: number;
  roles: string[];
  currentIdentityType?: string;
  currentIdentityScopeType?: string | null;
  currentIdentityScopeId?: number | null;
  selectedMerchantShopId?: number;
  selectedMerchantShopPublicId?: string;
  isReadOnlyMerchantPreview?: boolean;
  merchantPreviewShopId?: number;
}
export interface BookingCreateInput
  extends Omit<BookingCreateRepositoryInput, "customerUserId">, AffiliatePromotionInput {
  orderType?: "booking" | "request";
}

export interface ManualPaymentConfirmInput {
  method: "onsite" | "bank_transfer";
  amountJpy: number;
  reference?: string | null;
  note?: string | null;
}

export interface ManualPaymentRefundInput {
  reason: string;
  reference?: string | null;
}

export interface OrderConfirmInput {
  insufficientBalanceConfirmation?: {
    confirmed: true;
    idempotencyKey: string;
    previewVersion: string;
  };
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
    private readonly notificationService?: OrderStatusNotificationPort,
    private readonly auditLogService?: Pick<AuditLogService, "record">,
    private readonly affiliateCheckoutService?: Pick<
      AffiliateCheckoutService,
      | "prepareCheckout"
      | "persistAttribution"
      | "invalidateCancelledBooking"
      | "settleCompletedBooking"
    >
  ) {}

  public listAvailableSlots(input: AvailabilityListInput) {
    return this.repository.listAvailableSlots(input);
  }

  public async listScheduleSlots(
    actor: AuthenticatedAccessContext,
    input: Omit<ScheduleListInput, keyof ScheduleScope>
  ): Promise<PaginatedResponse<ScheduleSlotPayload>> {
    return this.repository.listScheduleSlots({ ...this.getScheduleScope(actor), ...input });
  }

  public async getScheduleSlot(
    actor: AuthenticatedAccessContext,
    id: number
  ): Promise<ScheduleSlotPayload> {
    const slot = await this.repository.findScheduleSlotById({
      ...this.getScheduleScope(actor),
      id
    });
    if (!slot) {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.schedule.slot_not_found",
        statusCode: 404
      });
    }
    return slot;
  }

  public async createScheduleSlot(
    actor: AuthenticatedAccessContext,
    input: Omit<ScheduleSlotCreateInput, keyof ScheduleScope>,
    context: AuthRequestContext
  ): Promise<ScheduleSlotPayload> {
    const scope = this.getScheduleScope(actor);
    const targetShopId =
      scope.scope === "merchant"
        ? scope.shopId
        : await this.repository.findTechnicianShopId?.(scope.technicianProfileId);
    await this.assertShopNotSuspended(targetShopId ?? null);
    const repositoryInput: ScheduleSlotCreateInput =
      scope.scope === "technician"
        ? {
            scope: "technician",
            technicianProfileId: scope.technicianProfileId,
            serviceId: input.serviceId,
            technicianServiceId: input.technicianServiceId,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            capacity: input.capacity
          }
        : { ...input, scope: "merchant", shopId: scope.shopId };
    const slot = this.requireScheduleMutation(
      await this.repository.createScheduleSlot(repositoryInput)
    );
    await this.recordScheduleMutation(actor, context, scope, "create", slot);
    return slot;
  }

  public async updateScheduleSlot(
    actor: AuthenticatedAccessContext,
    id: number,
    input: Omit<ScheduleSlotUpdateInput, keyof ScheduleScope | "id">,
    context: AuthRequestContext
  ): Promise<ScheduleSlotPayload> {
    const scope = this.getScheduleScope(actor);
    await this.assertShopNotSuspended((await this.repository.findScheduleSlotShopId?.(id)) ?? null);
    const slot = this.requireScheduleMutation(
      await this.repository.updateScheduleSlot({ ...scope, id, ...input })
    );
    await this.recordScheduleMutation(actor, context, scope, "update", slot);
    return slot;
  }

  public async deleteScheduleSlot(
    actor: AuthenticatedAccessContext,
    id: number,
    context: AuthRequestContext
  ): Promise<ScheduleSlotPayload> {
    const scope = this.getScheduleScope(actor);
    const slot = this.requireScheduleMutation(
      await this.repository.deleteScheduleSlot({ ...scope, id })
    );
    await this.recordScheduleMutation(actor, context, scope, "delete", slot);
    return slot;
  }

  public async createBooking(
    actor: AuthenticatedBookingActor,
    input: BookingCreateInput
  ): Promise<BookingOrderPayload> {
    if (!this.isCustomerSharedIdentity(actor)) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_FORBIDDEN,
        message: "error.auth.identity_forbidden",
        statusCode: 403
      });
    }
    await this.assertShopNotSuspended(
      (await this.repository.findScheduleSlotShopId?.(input.scheduleSlotId)) ?? null
    );
    const repositoryInput: BookingCreateRepositoryInput = {
      customerUserId: actor.userId,
      orderType: input.orderType ?? "booking",
      serviceId: input.serviceId,
      technicianServiceId: input.technicianServiceId,
      scheduleSlotId: input.scheduleSlotId,
      fulfillmentMode: input.fulfillmentMode,
      paymentMethod: input.paymentMethod,
      note: input.note
    };
    const selector = selectAffiliatePromotion(input);
    if (selector && !this.affiliateCheckoutService) {
      throw new AppError({
        code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
        message: "error.dependency_unavailable",
        statusCode: 503
      });
    }
    const repositoryOptions = {
      ...(selector
        ? {
            prepareAffiliate: (
              context: Parameters<
                NonNullable<BookingCreateRepositoryOptions["prepareAffiliate"]>
              >[0]
            ) =>
              this.affiliateCheckoutService!.prepareCheckout({
                ...context,
                selector
              }),
            persistAffiliate: (
              context: Parameters<
                NonNullable<BookingCreateRepositoryOptions["persistAffiliate"]>
              >[0]
            ) =>
              this.affiliateCheckoutService!.persistAttribution({
                bookingOrderId: context.bookingOrderId,
                customerUserId: context.customerUserId,
                shopId: context.shopId,
                serviceId: context.serviceId,
                prepared: context.prepared,
                transactionClient: context.transactionClient
              })
          }
        : {}),
      ...(this.affiliateCheckoutService
        ? {
            invalidateSupersededAffiliate: (
              context: Parameters<
                NonNullable<BookingCreateRepositoryOptions["invalidateSupersededAffiliate"]>
              >[0]
            ) =>
              this.affiliateCheckoutService!.invalidateCancelledBooking({
                bookingOrderId: context.bookingOrderId,
                actorUserId: context.actorUserId,
                transactionClient: context.transactionClient
              })
          }
        : {})
    };
    const result =
      Object.keys(repositoryOptions).length > 0
        ? await this.repository.createBooking(repositoryInput, repositoryOptions)
        : await this.repository.createBooking(repositoryInput);

    if (!result) {
      throw this.slotUnavailableError();
    }
    if (!("order" in result) || !("supersededOrders" in result)) {
      return result;
    }

    for (const superseded of result.supersededOrders) {
      await this.notifyOrderStatusChangedBestEffort({
        actorUserId: actor.userId,
        orderId: superseded.order.id,
        orderNo: superseded.order.orderNo,
        fromStatus: "pending",
        toStatus: "cancelled",
        serviceName: superseded.order.serviceName,
        recipientUserIds: superseded.recipientUserIds
      });
    }
    await this.notifyOrderStatusChangedBestEffort({
      actorUserId: actor.userId,
      orderId: result.order.id,
      orderNo: result.order.orderNo,
      fromStatus: "none",
      toStatus: "pending",
      serviceName: result.order.serviceName,
      recipientUserIds: result.recipientUserIds
    });
    return result.order;
  }

  public async listOrders(
    actor: AuthenticatedBookingActor,
    input: OrderListInput
  ): Promise<PaginatedResponse<BookingOrderPayload>> {
    return this.repository.listOrders(this.scopeOrderListInput(actor, input));
  }

  public async getOrder(
    actor: AuthenticatedBookingActor,
    id: number
  ): Promise<BookingOrderPayload> {
    const order = await this.repository.findOrderById(id);

    if (!order) {
      throw this.notFoundError();
    }

    if (!this.canAccessOrder(actor, order)) {
      throw this.notFoundError();
    }

    return order;
  }

  public transitionOrder(
    actor: AuthenticatedBookingActor,
    id: number,
    action: OrderAction,
    reason?: string | null,
    confirmInput?: OrderConfirmInput
  ): Promise<BookingOrderPayload> {
    return this.transition(
      actor,
      id,
      action,
      reason,
      action === "confirm" ? confirmInput : undefined
    );
  }

  public async confirmManualPayment(
    actor: AuthenticatedAccessContext,
    orderId: number,
    input: ManualPaymentConfirmInput,
    context: AuthRequestContext
  ): Promise<BookingOrderPayload> {
    const scope = this.getManualPaymentScope(actor);
    const result = await this.repository.confirmManualPayment({
      ...scope,
      orderId,
      actorUserId: actor.userId,
      method: input.method,
      amountJpy: input.amountJpy,
      reference: input.reference,
      note: input.note
    });
    const order = this.requireManualPaymentMutation(result);

    if (result.outcome === "ok" && result.applied) {
      await this.recordManualPaymentMutation(actor, context, scope, "confirm", order);
    }

    return order;
  }

  public async refundManualPayment(
    actor: AuthenticatedAccessContext,
    orderId: number,
    input: ManualPaymentRefundInput,
    context: AuthRequestContext
  ): Promise<BookingOrderPayload> {
    const scope = this.getManualPaymentScope(actor);
    const result = await this.repository.refundManualPayment({
      ...scope,
      orderId,
      actorUserId: actor.userId,
      reason: input.reason,
      reference: input.reference
    });
    const order = this.requireManualPaymentMutation(result);

    if (result.outcome === "ok" && result.applied) {
      await this.recordManualPaymentMutation(actor, context, scope, "refund", order);
    }

    return order;
  }

  private async transition(
    actor: AuthenticatedBookingActor,
    id: number,
    action: OrderAction,
    reason?: string | null,
    confirmInput?: OrderConfirmInput
  ): Promise<BookingOrderPayload> {
    const order = await this.getOrder(actor, id);
    const rule = ORDER_TRANSITIONS[action];
    const allowedStatuses: readonly BookingOrderStatusPayload[] = rule.from;

    if (!allowedStatuses.includes(order.status)) {
      throw this.invalidTransitionError();
    }

    const transitionInput = {
      id,
      actorUserId: actor.userId,
      fromStatus: order.status,
      toStatus: rule.to,
      reason
    };
    const transitionOptions = this.createSettlementOptions(actor, order, action, confirmInput);
    const guardedResult =
      action === "confirm"
        ? await this.repository.transitionOrderWithScheduleGuard?.(
            transitionInput,
            transitionOptions
          )
        : undefined;
    if (guardedResult?.outcome === "schedule_conflict") {
      throw new AppError({
        code: ERROR_CODES.SCHEDULE_CONFLICT,
        message: "error.schedule.conflict",
        statusCode: 409
      });
    }
    if (guardedResult?.outcome === "acceptance_paused") {
      throw new AppError({
        code: ERROR_CODES.ORDER_ACCEPTANCE_PAUSED,
        message: "error.order.acceptance_paused",
        statusCode: 409,
        data: { pauses: guardedResult.pauses }
      });
    }
    const next = guardedResult
      ? guardedResult.outcome === "ok"
        ? guardedResult.order
        : null
      : await this.repository.transitionOrder(transitionInput, transitionOptions);

    if (!next) {
      throw this.invalidTransitionError();
    }

    if (this.isAcceptancePausedResult(next)) {
      throw new AppError({
        code: ERROR_CODES.ORDER_ACCEPTANCE_PAUSED,
        message: "error.order.acceptance_paused",
        statusCode: 409,
        data: { pauses: next.pauses }
      });
    }

    await this.notifyOrderStatusChangedBestEffort({
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

  private async notifyOrderStatusChangedBestEffort(
    input: OrderStatusNotificationInput
  ): Promise<void> {
    if (!this.notificationService) {
      return;
    }
    try {
      await this.notificationService.notifyOrderStatusChanged(input);
    } catch (error) {
      logger.error(
        {
          error,
          orderId: input.orderId,
          fromStatus: input.fromStatus,
          toStatus: input.toStatus
        },
        "Order status notification failed after booking commit"
      );
    }
  }

  private isAcceptancePausedResult(
    result: BookingOrderPayload | OrderAcceptancePausedResult
  ): result is OrderAcceptancePausedResult {
    return "kind" in result && result.kind === "acceptance_paused";
  }

  private slotUnavailableError(): AppError {
    return new AppError({
      code: ERROR_CODES.BOOKING_SLOT_UNAVAILABLE,
      message: "error.booking.slot_unavailable",
      statusCode: 409
    });
  }

  private getScheduleScope(actor: AuthenticatedAccessContext): ScheduleScope {
    if (actor.currentIdentityScopeType === "technician_profile" && actor.currentIdentityScopeId) {
      return { scope: "technician", technicianProfileId: actor.currentIdentityScopeId };
    }
    return { scope: "merchant", shopId: requireMerchantShopId(actor) };
  }

  private getManualPaymentScope(actor: AuthenticatedAccessContext): ManualPaymentScope {
    if (actor.currentIdentityType === "platform") {
      return { scope: "backoffice" };
    }
    return { scope: "merchant", shopId: requireMerchantShopId(actor) };
  }

  private requireManualPaymentMutation(result: ManualPaymentMutationResult): BookingOrderPayload {
    if (result.outcome === "ok") return result.order;
    if (result.outcome === "not_found") throw this.notFoundError();
    if (result.outcome === "invalid_state") {
      throw new AppError({
        code: ERROR_CODES.PAYMENT_INVALID_STATE,
        message: "error.payment.invalid_state",
        statusCode: 409
      });
    }
    if (result.outcome === "amount_mismatch") {
      throw new AppError({
        code: ERROR_CODES.PAYMENT_AMOUNT_MISMATCH,
        message: "error.payment.amount_mismatch",
        statusCode: 409
      });
    }
    throw new AppError({
      code: ERROR_CODES.PAYMENT_CONFLICT,
      message: "error.payment.conflict",
      statusCode: 409
    });
  }

  private async recordManualPaymentMutation(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    scope: ManualPaymentScope,
    operation: "confirm" | "refund",
    order: BookingOrderPayload
  ): Promise<void> {
    if (!this.auditLogService) throw new Error("Manual payment audit log service is required");
    await this.auditLogService.record({
      actor,
      action: `${scope.scope === "merchant" ? "merchant_admin" : "backoffice"}.order_payment.${operation}`,
      targetType: "BookingOrder",
      targetId: order.id,
      context,
      metadata: {
        shopId: order.shopId,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        paymentAmountJpy: order.paymentAmountJpy
      }
    });
  }

  private requireScheduleMutation(result: ScheduleMutationResult): ScheduleSlotPayload {
    if (result.outcome === "ok") return result.slot;
    if (result.outcome === "suspended") throw this.suspendedError();
    if (result.outcome === "not_found") {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.schedule.slot_not_found",
        statusCode: 404
      });
    }
    if (result.outcome === "in_use") {
      throw new AppError({
        code: ERROR_CODES.SCHEDULE_SLOT_IN_USE,
        message: "error.schedule.slot_in_use",
        statusCode: 409
      });
    }
    throw new AppError({
      code: ERROR_CODES.SCHEDULE_CONFLICT,
      message:
        result.outcome === "duration_mismatch"
          ? "error.schedule.duration_mismatch"
          : "error.schedule.conflict",
      statusCode: 409
    });
  }

  private async assertShopNotSuspended(shopId: number | null): Promise<void> {
    if (shopId && (await this.repository.isShopSuspended?.(shopId))) {
      throw this.suspendedError();
    }
  }

  private suspendedError(): AppError {
    return new AppError({
      code: ERROR_CODES.ENTITY_SUSPENDED,
      message: "error.entity.suspended",
      statusCode: 409
    });
  }

  private async recordScheduleMutation(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    scope: ScheduleScope,
    operation: "create" | "update" | "delete",
    slot: ScheduleSlotPayload
  ): Promise<void> {
    if (!this.auditLogService) throw new Error("Schedule audit log service is required");
    await this.auditLogService.record({
      actor,
      action: `${scope.scope === "merchant" ? "merchant_admin" : "technician"}.schedule_slot.${operation}`,
      targetType: "ScheduleSlot",
      targetId: slot.id,
      context,
      metadata: { shopId: slot.shopId, technicianProfileId: slot.technicianProfileId }
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
    action: OrderAction,
    confirmInput?: OrderConfirmInput
  ): OrderTransitionRepositoryOptions {
    const actions: Array<NonNullable<OrderTransitionRepositoryOptions["settle"]>> = [];
    const ledgerOptions = this.createLedgerSettlementOptions(actor, order, action, confirmInput);
    if (ledgerOptions.settle) {
      actions.push(ledgerOptions.settle);
    }
    if (action === "cancel" && this.affiliateCheckoutService) {
      actions.push((context) =>
        this.affiliateCheckoutService!.invalidateCancelledBooking({
          bookingOrderId: order.id,
          actorUserId: actor.userId,
          transactionClient: context.transactionClient
        })
      );
    }
    if (action === "complete" && this.affiliateCheckoutService) {
      actions.push((context) =>
        this.affiliateCheckoutService!.settleCompletedBooking({
          bookingOrderId: order.id,
          customerUserId: order.customerUserId,
          shopId: order.shopId,
          serviceId: order.serviceId,
          actorUserId: actor.userId,
          transactionClient: context.transactionClient
        }).then(() => undefined)
      );
    }
    return actions.length === 0
      ? {}
      : {
          settle: async (context) => {
            for (const actionHandler of actions) {
              await actionHandler(context);
            }
          }
        };
  }

  private createLedgerSettlementOptions(
    actor: AuthenticatedBookingActor,
    order: BookingOrderPayload,
    action: OrderAction,
    confirmInput?: OrderConfirmInput
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
              orderType: order.orderType,
              shopId: order.shopId,
              technicianProfileId: order.technicianProfileId,
              serviceId: order.serviceId,
              serviceAmountJpy: this.moneyToInteger(order.priceAmount),
              scheduledStartAt: order.startsAt,
              acceptedAt: new Date(),
              customerUserId: order.customerUserId,
              actorUserId: actor.userId,
              insufficientBalanceConfirmation: confirmInput?.insufficientBalanceConfirmation
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
              orderType: order.orderType,
              shopId: order.shopId,
              technicianProfileId: order.technicianProfileId,
              serviceId: order.serviceId,
              serviceAmountJpy: this.moneyToInteger(order.priceAmount),
              scheduledStartAt: order.startsAt,
              completedAt: new Date(),
              customerUserId: order.customerUserId,
              actorUserId: actor.userId
            },
            { transactionClient: context.transactionClient }
          ).then(() => undefined)
      };
    }

    if (action === "cancel" && order.status === "confirmed") {
      if (order.orderType === "request") {
        return {
          settle: (context) =>
            this.ledgerService!.releaseBookingHold(
              {
                bookingOrderId: order.id,
                orderType: order.orderType,
                shopId: order.shopId,
                technicianProfileId: order.technicianProfileId,
                serviceId: order.serviceId,
                serviceAmountJpy: this.moneyToInteger(order.priceAmount),
                scheduledStartAt: order.startsAt,
                customerUserId: order.customerUserId,
                actorUserId: actor.userId
              },
              { transactionClient: context.transactionClient }
            ).then(() => undefined)
        };
      }

      return this.isServiceProviderActor(actor)
        ? {
            settle: (context) =>
              this.ledgerService!.compensateCustomerForMerchantCancellation(
                {
                  bookingOrderId: order.id,
                  orderType: order.orderType,
                  shopId: order.shopId,
                  technicianProfileId: order.technicianProfileId,
                  serviceId: order.serviceId,
                  serviceAmountJpy: this.moneyToInteger(order.priceAmount),
                  scheduledStartAt: order.startsAt,
                  completedAt: new Date(),
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
                  orderType: order.orderType,
                  shopId: order.shopId,
                  technicianProfileId: order.technicianProfileId,
                  serviceId: order.serviceId,
                  serviceAmountJpy: this.moneyToInteger(order.priceAmount),
                  scheduledStartAt: order.startsAt,
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

  private scopeOrderListInput(
    actor: AuthenticatedBookingActor,
    input: OrderListInput
  ): OrderListInput {
    if (this.isPlatformOrderActor(actor)) {
      return input;
    }

    if (this.isMerchantShopActor(actor)) {
      return {
        ...input,
        shopId: requireMerchantShopId(actor as AuthenticatedAccessContext)
      };
    }

    if (actor.currentIdentityScopeType === "technician_profile" && actor.currentIdentityScopeId) {
      return { ...input, technicianProfileId: actor.currentIdentityScopeId };
    }

    if (!this.isCustomerSharedIdentity(actor)) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_FORBIDDEN,
        message: "error.auth.identity_forbidden",
        statusCode: 403
      });
    }

    return {
      ...input,
      customerUserId: actor.userId,
      shopId: undefined,
      technicianProfileId: undefined
    };
  }

  private canAccessOrder(actor: AuthenticatedBookingActor, order: BookingOrderPayload): boolean {
    if (this.isPlatformOrderActor(actor)) return true;
    if (this.isMerchantShopActor(actor)) {
      return order.shopId === requireMerchantShopId(actor as AuthenticatedAccessContext);
    }
    if (actor.currentIdentityScopeType === "technician_profile" && actor.currentIdentityScopeId) {
      return order.technicianProfileId === actor.currentIdentityScopeId;
    }
    if (!this.isCustomerSharedIdentity(actor)) return false;
    return order.customerUserId === actor.userId;
  }

  private isPlatformOrderActor(actor: AuthenticatedBookingActor): boolean {
    const hasPlatformRole = actor.roles.some((role) =>
      ["platform_admin", "admin", "operator", "finance", "support"].includes(role)
    );

    if (!hasPlatformRole) return false;
    if (!actor.currentIdentityScopeType && !actor.currentIdentityType) return true;
    return (
      actor.currentIdentityScopeType === "global" ||
      actor.currentIdentityType === "platform" ||
      actor.currentIdentityType === "platform_admin"
    );
  }

  private isMerchantShopActor(actor: AuthenticatedBookingActor): boolean {
    return hasMerchantShopScope(actor as AuthenticatedAccessContext);
  }

  private isCustomerSharedIdentity(actor: AuthenticatedBookingActor): boolean {
    if (!actor.currentIdentityType) return true;
    return ["customer", "user", "u", "scout", "affiliate", "alliance_marketing"].includes(
      actor.currentIdentityType
    );
  }

  private moneyToInteger(value: string): number {
    return Math.round(Number(value));
  }

  private resolveOrderNotificationRecipients(
    actor: AuthenticatedBookingActor,
    order: BookingOrderPayload
  ): number[] {
    return order.customerUserId === actor.userId ? [] : [order.customerUserId];
  }
}
