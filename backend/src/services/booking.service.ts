import { ERROR_CODES } from "../constants/error-codes";
import { createHash } from "node:crypto";
import { logger } from "../config/logger";
import type {
  AvailabilityListInput,
  BookingCreateRepositoryOptions,
  BookingCreateRepositoryInput,
  BookingOrderPayload,
  BookingOrderStatusPayload,
  BookingRepositoryPort,
  CheckoutActorInput,
  CheckoutMutationContext,
  CheckoutMutationResult,
  OrderCheckoutPayload,
  FulfillmentActorInput,
  FulfillmentMutationResult,
  ManualPaymentMutationResult,
  ManualPaymentScope,
  OrderAcceptancePausedResult,
  OrderTransitionRepositoryInput,
  OrderTransitionRepositoryOptions,
  OrderListInput,
  OrderReviewMutationResult,
  OrderReviewPayload,
  ScheduleListInput,
  ScheduleMutationResult,
  ScheduleScope,
  ScheduleSlotCreateInput,
  ScheduleSlotPayload,
  ScheduleSlotUpdateInput
} from "../repositories/booking.repository";
import type {
  CreateOrderAddOnInput,
  ConfirmReceiptInput,
  EndServiceInput,
  OrderAddOnDecisionInput,
  OrderReviewCreateInput,
  PayWithNdpInput,
  SelectPaymentMethodInput,
  StartServiceInput
} from "../validators/booking.validator";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import type { AuditLogService } from "./audit-log.service";
import type {
  BookingLedgerSettlementPort,
  CheckoutPaymentLedgerPort
} from "./ledger.service";
import type { OrderStatusNotificationInput, OrderStatusNotificationPort } from "./realtime.service";
import { AppError } from "../utils/app-error";
import type { PaginatedResponse } from "../utils/pagination";
import {
  selectAffiliatePromotion,
  type AffiliateCheckoutService,
  type AffiliatePromotionInput
} from "./affiliate-checkout.service";
import { hasMerchantShopScope, requireMerchantShopId } from "./merchant-shop-scope";
import type { NdpExchangeRateService } from "./ndp-exchange-rate.service";
import type { UserExperienceService } from "./user-experience.service";
import type { UserPolicyEnforcementService } from "./user-policy-enforcement.service";

export interface AuthenticatedBookingActor {
  userId: number;
  roles: string[];
  currentIdentityId?: number;
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

type OrderAction = "confirm" | "cancel";

const ORDER_TRANSITIONS = {
  confirm: {
    from: ["pending"],
    to: "confirmed"
  },
  cancel: {
    from: ["pending", "confirmed"],
    to: "cancelled"
  },
} as const satisfies Record<
  OrderAction,
  { from: readonly BookingOrderStatusPayload[]; to: BookingOrderStatusPayload }
>;

export class BookingService {
  private readonly ndpExchangeRateService?: Pick<NdpExchangeRateService, "resolveEffectiveRate">;
  private readonly userExperienceService?: Pick<UserExperienceService, "recordEvent">;
  private readonly now: () => Date;
  private readonly userPolicyEnforcementService?: Pick<
    UserPolicyEnforcementService,
    "assertServiceEkyc"
  >;

  public constructor(
    private readonly repository: BookingRepositoryPort,
    private readonly ledgerService?: BookingLedgerSettlementPort & Partial<CheckoutPaymentLedgerPort>,
    private readonly notificationService?: OrderStatusNotificationPort,
    private readonly auditLogService?: Pick<AuditLogService, "record"> &
      Partial<Pick<AuditLogService, "createInput">>,
    private readonly affiliateCheckoutService?: Pick<
      AffiliateCheckoutService,
      | "prepareCheckout"
      | "persistAttribution"
      | "invalidateCancelledBooking"
      | "settleCompletedBooking"
    >,
    rateOrExperience?: Pick<NdpExchangeRateService, "resolveEffectiveRate"> |
      Pick<UserExperienceService, "recordEvent">,
    experienceOrNow?: Pick<UserExperienceService, "recordEvent"> | (() => Date),
    nowOrPolicy?: (() => Date) | Pick<UserPolicyEnforcementService, "assertServiceEkyc">,
    policy?: Pick<UserPolicyEnforcementService, "assertServiceEkyc">
  ) {
    if (rateOrExperience && "resolveEffectiveRate" in rateOrExperience) {
      this.ndpExchangeRateService = rateOrExperience;
    } else {
      this.userExperienceService = rateOrExperience;
    }
    if (typeof experienceOrNow === "function") {
      this.now = experienceOrNow;
    } else {
      this.userExperienceService = experienceOrNow ?? this.userExperienceService;
      this.now = typeof nowOrPolicy === "function" ? nowOrPolicy : () => new Date();
    }
    this.userPolicyEnforcementService =
      policy ?? (typeof nowOrPolicy === "function" ? undefined : nowOrPolicy);
  }

  public listAvailableSlots(input: AvailabilityListInput) {
    return this.repository.listAvailableSlots(input);
  }

  public async listScheduleSlots(
    actor: AuthenticatedAccessContext,
    input: Omit<ScheduleListInput, keyof ScheduleScope>
  ): Promise<PaginatedResponse<ScheduleSlotPayload>> {
    return this.repository.listScheduleSlots({ ...input, ...this.getScheduleScope(actor) });
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
      await this.repository.updateScheduleSlot({ ...input, ...scope, id })
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
    await this.userPolicyEnforcementService?.assertServiceEkyc(
      actor.userId,
      input.fulfillmentMode,
      this.now()
    );
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

    if (this.isOwningCustomerDetailActor(actor, order)) {
      const serviceVerificationCode = await this.repository.getServiceVerificationCode?.(order.id);
      if (!serviceVerificationCode) return order;
      return {
        ...order,
        serviceVerificationCode
      };
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

  public async startService(
    actor: AuthenticatedBookingActor,
    orderId: number,
    input: StartServiceInput,
    context: AuthRequestContext
  ): Promise<BookingOrderPayload> {
    const fulfillmentActor = this.getFulfillmentActor(actor, input.actor);
    await this.assertFulfillmentOrderAccess(actor, orderId, fulfillmentActor.actor);
    const result = await this.repository.startService({
      ...fulfillmentActor,
      orderId,
      verificationCode: input.actor === "technician" ? input.verificationCode : null,
      idempotencyKey: input.idempotencyKey,
      requestContext: this.fulfillmentRequestContext(context)
    });
    const mutation = this.requireFulfillmentMutation(result);
    if (mutation.applied) {
      await this.notifyOrderStatusChangedBestEffort({
        actorUserId: actor.userId,
        orderId: mutation.order.id,
        orderNo: mutation.order.orderNo,
        fromStatus: "confirmed",
        toStatus: "inService",
        serviceName: mutation.order.serviceName,
        recipientUserIds: this.resolveOrderNotificationRecipients(actor, mutation.order)
      });
    }
    return mutation.order;
  }

  public async createOrderAddOn(
    actor: AuthenticatedBookingActor,
    orderId: number,
    input: CreateOrderAddOnInput,
    context: AuthRequestContext
  ): Promise<BookingOrderPayload> {
    const fulfillmentActor = this.getFulfillmentActor(actor);
    await this.assertFulfillmentOrderAccess(actor, orderId, fulfillmentActor.actor);
    const result = await this.repository.createOrderAddOn({
      ...fulfillmentActor,
      orderId,
      serviceId: input.serviceId,
      idempotencyKey: input.idempotencyKey,
      requestContext: this.fulfillmentRequestContext(context)
    });
    return this.requireFulfillmentMutation(result).order;
  }

  public async acceptOrderAddOn(
    actor: AuthenticatedBookingActor,
    orderId: number,
    addOnId: number,
    input: OrderAddOnDecisionInput,
    context: AuthRequestContext
  ): Promise<BookingOrderPayload> {
    return this.decideOrderAddOn(actor, orderId, addOnId, "accept", input, context);
  }

  public async rejectOrderAddOn(
    actor: AuthenticatedBookingActor,
    orderId: number,
    addOnId: number,
    input: OrderAddOnDecisionInput,
    context: AuthRequestContext
  ): Promise<BookingOrderPayload> {
    return this.decideOrderAddOn(actor, orderId, addOnId, "reject", input, context);
  }

  public async endService(
    actor: AuthenticatedBookingActor,
    orderId: number,
    input: EndServiceInput,
    context: AuthRequestContext
  ): Promise<BookingOrderPayload> {
    const fulfillmentActor = this.getFulfillmentActor(actor);
    await this.assertFulfillmentOrderAccess(actor, orderId, fulfillmentActor.actor);
    const result = await this.repository.endService({
      ...fulfillmentActor,
      orderId,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      requestContext: this.fulfillmentRequestContext(context)
    });
    const mutation = this.requireFulfillmentMutation(result);
    if (mutation.applied) {
      await this.notifyOrderStatusChangedBestEffort({
        actorUserId: actor.userId,
        orderId: mutation.order.id,
        orderNo: mutation.order.orderNo,
        fromStatus: "inService",
        toStatus: "awaitingCheckout",
        serviceName: mutation.order.serviceName,
        recipientUserIds: this.resolveOrderNotificationRecipients(actor, mutation.order)
      });
    }
    return mutation.order;
  }

  public async createOrderReview(
    actor: AuthenticatedAccessContext,
    orderId: number,
    input: OrderReviewCreateInput,
    context: AuthRequestContext
  ): Promise<{ applied: boolean; review: OrderReviewPayload }> {
    const reviewActor = this.getFulfillmentActor(actor);
    const permittedTarget = reviewActor.actor === "customer" ? "technician" : "customer";
    if (input.targetType !== permittedTarget) throw this.notFoundError();
    await this.assertFulfillmentOrderAccess(actor, orderId, reviewActor.actor);
    if (!this.auditLogService?.createInput) throw this.dependencyUnavailableError();
    const tags = [...input.tags].sort((left, right) =>
      Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"))
    );
    const comment = input.comment?.normalize("NFKC").trim() || null;
    const requestFingerprint = createHash("sha256")
      .update(JSON.stringify({
        orderId,
        reviewerUserId: actor.userId,
        targetType: permittedTarget,
        rating: input.rating,
        tags,
        comment
      }))
      .digest("hex");
    return this.requireOrderReviewMutation(
      await this.repository.createOrderReview({
        ...reviewActor,
        orderId,
        targetType: permittedTarget,
        rating: input.rating,
        tags,
        comment,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint,
        audit: this.auditLogService.createInput({
          actor,
          action: "order.review.create",
          targetType: "BookingOrder",
          targetId: orderId,
          context,
          metadata: {
            orderId,
            reviewTargetType: permittedTarget,
            rating: input.rating,
            tagCount: tags.length
          }
        })
      })
    );
  }

  public async getOwnOrderReview(
    actor: AuthenticatedBookingActor,
    orderId: number
  ): Promise<{ review: OrderReviewPayload | null }> {
    const reviewActor = this.getFulfillmentActor(actor);
    const targetType = reviewActor.actor === "customer" ? "technician" : "customer";
    await this.assertFulfillmentOrderAccess(actor, orderId, reviewActor.actor);
    const result = await this.repository.findOwnOrderReview({
      ...reviewActor,
      orderId,
      targetType
    });
    if (result.outcome === "not_found") throw this.notFoundError();
    return { review: result.review };
  }

  public async getCheckout(
    actor: AuthenticatedBookingActor,
    orderId: number
  ): Promise<OrderCheckoutPayload> {
    const actorInput = this.checkoutActorInput(actor, orderId);
    const existing = await this.repository.getOrCreateCheckout({ ...actorInput, rate: null });
    if (existing.outcome !== "rate_required") return this.requireCheckoutMutation(existing).checkout;
    if (!this.ndpExchangeRateService) throw this.dependencyUnavailableError();
    const resolvedAt = this.now();
    const rate = await this.ndpExchangeRateService.resolveEffectiveRate(resolvedAt);
    const created = await this.repository.getOrCreateCheckout({
      ...actorInput,
      rate: { ...rate, resolvedAt }
    });
    return this.requireCheckoutMutation(created).checkout;
  }

  public async selectCheckoutPaymentMethod(
    actor: AuthenticatedBookingActor,
    orderId: number,
    input: SelectPaymentMethodInput,
    context: AuthRequestContext
  ): Promise<OrderCheckoutPayload> {
    this.assertOwningCustomerIdentity(actor);
    const result = await this.repository.selectCheckoutPaymentMethod({
      ...this.checkoutActorInput(actor, orderId),
      ...input
    });
    const mutation = this.requireCheckoutMutation(result);
    if (mutation.applied) {
      await this.notifyCheckoutCompletionBestEffort(actor, mutation.checkout, context, false);
    }
    return mutation.checkout;
  }

  public async payCheckoutWithNdp(
    actor: AuthenticatedBookingActor,
    orderId: number,
    input: PayWithNdpInput,
    context: AuthRequestContext
  ): Promise<OrderCheckoutPayload> {
    this.assertOwningCustomerIdentity(actor);
    if (!this.ledgerService?.debitCheckoutPayment) throw this.dependencyUnavailableError();
    const result = await this.repository.payCheckoutWithNdp(
      { ...this.checkoutActorInput(actor, orderId), idempotencyKey: input.idempotencyKey },
      {
        debit: async ({ transactionClient, order, checkout, idempotencyKey }) =>
          this.ledgerService!.debitCheckoutPayment!(
            {
              bookingOrderId: order.id,
              checkoutId: checkout.id,
              customerUserId: order.customerUserId,
              payableNdp: checkout.payableNdp,
              idempotencyKey,
              actorUserId: actor.userId
            },
            { transactionClient }
          ),
        settle: (checkoutContext) => this.settleCheckoutBooking(checkoutContext, actor.userId),
        settleAffiliate: (checkoutContext) =>
          this.settleCheckoutAffiliate(checkoutContext, actor.userId)
      }
    );
    const mutation = this.requireCheckoutMutation(result);
    if (mutation.applied) {
      await this.notifyCheckoutCompletionBestEffort(actor, mutation.checkout, context, true);
    }
    return mutation.checkout;
  }

  public async confirmCheckoutReceipt(
    actor: AuthenticatedAccessContext,
    orderId: number,
    input: ConfirmReceiptInput,
    context: AuthRequestContext,
    operationsOverride = false
  ): Promise<OrderCheckoutPayload> {
    if (operationsOverride) {
      if (
        actor.currentIdentityScopeType !== "global" &&
        actor.currentIdentityScopeType !== "platform"
      ) {
        throw this.notFoundError();
      }
      if (!this.auditLogService?.createInput) throw this.dependencyUnavailableError();
    } else if (
      actor.currentIdentityType !== "technician" ||
      actor.currentIdentityScopeType !== "technician_profile" ||
      !actor.currentIdentityScopeId
    ) {
      throw this.notFoundError();
    }
    const actorInput = this.checkoutActorInput(actor, orderId);
    const repositoryInput = operationsOverride
      ? {
          ...actorInput,
          reason: input.reason,
          idempotencyKey: input.idempotencyKey,
          evidence: "operations_receipt_override" as const,
          audit: this.auditLogService!.createInput!({
            actor,
            action: "backoffice.order.checkout.receipt_override",
            targetType: "BookingOrder",
            targetId: orderId,
            context,
            metadata: { orderId, reason: input.reason }
          })
        }
      : {
          ...actorInput,
          reason: input.reason,
          idempotencyKey: input.idempotencyKey,
          evidence: "technician_receipt_confirmation" as const
        };
    const result = await this.repository.confirmCheckoutReceipt(
      repositoryInput,
      {
        settle: (checkoutContext) => this.settleCheckoutBooking(checkoutContext, actor.userId),
        settleAffiliate: (checkoutContext) =>
          this.settleCheckoutAffiliate(checkoutContext, actor.userId)
      }
    );
    const mutation = this.requireCheckoutMutation(result);
    if (mutation.applied) {
      await this.notifyCheckoutCompletionBestEffort(actor, mutation.checkout, context, true);
    }
    return mutation.checkout;
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

  private checkoutActorInput(
    actor: AuthenticatedBookingActor,
    orderId: number
  ): CheckoutActorInput {
    return {
      orderId,
      actorUserId: actor.userId,
      technicianProfileId:
        actor.currentIdentityType === "technician" &&
        actor.currentIdentityScopeType === "technician_profile" &&
        actor.currentIdentityScopeId
          ? actor.currentIdentityScopeId
          : null
    };
  }

  private assertOwningCustomerIdentity(actor: AuthenticatedBookingActor): void {
    if (!this.isCustomerSharedIdentity(actor)) throw this.notFoundError();
  }

  private requireCheckoutMutation(
    result: CheckoutMutationResult
  ): Extract<CheckoutMutationResult, { outcome: "ok" }> {
    if (result.outcome === "ok") return result;
    if (result.outcome === "not_found") throw this.notFoundError();
    if (result.outcome === "rate_required") throw this.dependencyUnavailableError();
    if (result.outcome === "invalid_snapshot") {
      throw new AppError({
        code: ERROR_CODES.ORDER_CHECKOUT_INVALID_SNAPSHOT,
        message: "error.order.checkout.invalid_snapshot",
        statusCode: 409
      });
    }
    if (result.outcome === "invalid_state") {
      throw new AppError({
        code: ERROR_CODES.ORDER_CHECKOUT_INVALID_STATE,
        message: "error.order.checkout.invalid_state",
        statusCode: 409
      });
    }
    throw new AppError({
      code: ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
      message: "error.idempotency.key_reused",
      statusCode: 409
    });
  }

  private async settleCheckoutBooking(
    context: CheckoutMutationContext,
    actorUserId: number
  ): Promise<void> {
    if (!this.ledgerService) throw this.dependencyUnavailableError();
    const confirmed = context.order.statusHistory.find((history) => history.toStatus === "confirmed");
    await this.ledgerService.settleBookingCompletion(
      {
        bookingOrderId: context.order.id,
        orderType: context.order.orderType,
        shopId: context.order.shopId,
        technicianProfileId: context.order.technicianProfileId,
        serviceId: context.order.serviceId,
        serviceAmountJpy: context.checkout.checkoutAmountJpy,
        scheduledStartAt: context.order.startsAt,
        acceptedAt: confirmed?.createdAt,
        completedAt: this.now(),
        customerUserId: context.order.customerUserId,
        actorUserId
      },
      { transactionClient: context.transactionClient }
    );
  }

  private async settleCheckoutAffiliate(
    context: CheckoutMutationContext,
    actorUserId: number
  ): Promise<void> {
    if (this.userExperienceService) {
      await this.userExperienceService.recordEvent(
        {
          userId: context.order.customerUserId,
          eventType: "service_completed",
          sourceType: "booking_order",
          sourcePublicId: context.order.orderNo,
          idempotencyKey: `service-completed:${context.order.orderNo}`,
          baseUnits: 100_000n,
          occurredAt: this.now()
        },
        { transactionClient: context.transactionClient }
      );
    }
    if (this.affiliateCheckoutService) {
      await this.affiliateCheckoutService.settleCompletedBooking({
        bookingOrderId: context.order.id,
        customerUserId: context.order.customerUserId,
        shopId: context.order.shopId,
        serviceId: context.order.serviceId,
        actorUserId,
        transactionClient: context.transactionClient
      });
    }
  }

  private async notifyCheckoutCompletionBestEffort(
    actor: AuthenticatedBookingActor,
    checkout: OrderCheckoutPayload,
    _context: AuthRequestContext,
    completed: boolean
  ): Promise<void> {
    if (!completed) return;
    try {
      const order = await this.repository.findOrderById(checkout.orderId);
      if (!order) return;
      await this.notifyOrderStatusChangedBestEffort({
        actorUserId: actor.userId,
        orderId: order.id,
        orderNo: order.orderNo,
        fromStatus:
          checkout.paymentMethod === "ndp" ? "awaitingCheckout" : "awaitingPaymentConfirmation",
        toStatus: "completed",
        serviceName: order.serviceName,
        recipientUserIds: this.resolveOrderNotificationRecipients(actor, order)
      });
    } catch (error) {
      logger.error(
        { error, orderId: checkout.orderId },
        "Checkout completion notification lookup failed after booking commit"
      );
    }
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

    const transitionActor = {
      userId: actor.userId,
      identityId: actor.currentIdentityId ?? null,
      identityType: actor.currentIdentityType ?? actor.roles[0] ?? "unknown"
    };
    const transitionInput: OrderTransitionRepositoryInput =
      action === "confirm"
        ? {
            id,
            actorUserId: actor.userId,
            actor: transitionActor,
            fromStatus: "pending",
            toStatus: "confirmed",
            reason
          }
        : order.status === "pending"
          ? {
              id,
              actorUserId: actor.userId,
              actor: transitionActor,
              fromStatus: "pending",
              toStatus: "cancelled",
              reason
            }
          : {
              id,
              actorUserId: actor.userId,
              actor: transitionActor,
              fromStatus: "confirmed",
              toStatus: "cancelled",
              reason
            };
    const transitionOptions = this.createSettlementOptions(actor, order, action, confirmInput);
    const guardedResult = await this.repository.transitionOrderWithScheduleGuard?.(
      transitionInput,
      transitionOptions
    );
    if (guardedResult?.outcome === "exchange_cancellation_required") {
      throw new AppError({
        code: ERROR_CODES.EXCHANGE_MATCH_CANCELLATION_REQUIRED,
        message: "error.exchange.match_cancellation_required",
        statusCode: 409
      });
    }
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

  private async decideOrderAddOn(
    actor: AuthenticatedBookingActor,
    orderId: number,
    addOnId: number,
    decision: "accept" | "reject",
    input: OrderAddOnDecisionInput,
    context: AuthRequestContext
  ): Promise<BookingOrderPayload> {
    const fulfillmentActor = this.getFulfillmentActor(actor);
    await this.assertFulfillmentOrderAccess(actor, orderId, fulfillmentActor.actor);
    const result = await this.repository.decideOrderAddOn({
      ...fulfillmentActor,
      orderId,
      addOnId,
      decision,
      idempotencyKey: input.idempotencyKey,
      requestContext: this.fulfillmentRequestContext(context)
    });
    return this.requireFulfillmentMutation(result).order;
  }

  private getFulfillmentActor(
    actor: AuthenticatedBookingActor,
    requestedActor?: "customer" | "technician"
  ): Omit<FulfillmentActorInput, "requestContext"> {
    const actorType =
      actor.currentIdentityScopeType === "technician_profile" &&
      actor.currentIdentityScopeId &&
      actor.currentIdentityType === "technician"
        ? "technician"
        : this.isCustomerFulfillmentIdentity(actor)
          ? "customer"
          : null;
    if (!actorType || (requestedActor && requestedActor !== actorType)) {
      throw new AppError({
        code: ERROR_CODES.FORBIDDEN,
        message: "error.auth.identity_forbidden",
        statusCode: 403
      });
    }
    return {
      actorUserId: actor.userId,
      actor: actorType,
      technicianProfileId:
        actorType === "technician" ? (actor.currentIdentityScopeId ?? null) : null
    };
  }

  private async assertFulfillmentOrderAccess(
    actor: AuthenticatedBookingActor,
    orderId: number,
    participant: "customer" | "technician"
  ): Promise<void> {
    const order = await this.repository.findOrderById(orderId);
    const allowed =
      order?.technicianProfileId &&
      (participant === "customer"
        ? order.customerUserId === actor.userId
        : order.technicianProfileId === actor.currentIdentityScopeId);
    if (!allowed) throw this.notFoundError();
  }

  private isCustomerFulfillmentIdentity(actor: AuthenticatedBookingActor): boolean {
    if (!actor.currentIdentityType) return actor.roles.includes("customer");
    return ["customer", "user", "u"].includes(actor.currentIdentityType);
  }

  private isOwningCustomerDetailActor(
    actor: AuthenticatedBookingActor,
    order: BookingOrderPayload
  ): boolean {
    return this.isCustomerFulfillmentIdentity(actor) && order.customerUserId === actor.userId;
  }

  private fulfillmentRequestContext(context: AuthRequestContext) {
    return { ip: context.ip, userAgent: context.userAgent };
  }

  private requireFulfillmentMutation(
    result: FulfillmentMutationResult
  ): Extract<FulfillmentMutationResult, { outcome: "ok" }> {
    if (result.outcome === "ok") return result;
    if (result.outcome === "not_found" || result.outcome === "forbidden") {
      throw this.notFoundError();
    }
    if (result.outcome === "verification_failed") {
      throw new AppError({
        code: ERROR_CODES.VERIFICATION_CODE_INVALID,
        message: "error.order.verification_code_invalid",
        statusCode: 400
      });
    }
    if (result.outcome === "invalid_service") {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.order.add_on_service_invalid",
        statusCode: 400
      });
    }
    if (result.outcome === "conflict") {
      throw new AppError({
        code: ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
        message: "error.idempotency.key_reused",
        statusCode: 409
      });
    }
    throw this.invalidTransitionError();
  }

  private requireOrderReviewMutation(
    result: OrderReviewMutationResult
  ): { applied: boolean; review: OrderReviewPayload } {
    if (result.outcome === "ok") {
      return { applied: result.applied, review: result.review };
    }
    if (result.outcome === "not_found") throw this.notFoundError();
    if (result.outcome === "invalid_state") {
      throw new AppError({
        code: ERROR_CODES.ORDER_INVALID_TRANSITION,
        message: "error.order.review_requires_completion",
        statusCode: 409
      });
    }
    if (result.outcome === "invalid_evidence") {
      throw new AppError({
        code: ERROR_CODES.ORDER_CHECKOUT_INVALID_SNAPSHOT,
        message: "error.order.review_invalid_settlement",
        statusCode: 409
      });
    }
    if (result.outcome === "already_submitted") {
      throw new AppError({
        code: ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
        message: "error.order.review_already_submitted",
        statusCode: 409
      });
    }
    throw new AppError({
      code: ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
      message: "error.idempotency.key_reused",
      statusCode: 409
    });
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

  private dependencyUnavailableError(): AppError {
    return new AppError({
      code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
      message: "error.dependency_unavailable",
      statusCode: 503
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
