import { ERROR_CODES } from "../constants/error-codes";
import { createHash } from "node:crypto";
import { logger } from "../config/logger";
import type {
  AvailabilityWindowCreateInput,
  AvailabilityWindowListInput,
  AvailabilityWindowMutationResult,
  AvailabilityWindowPayload,
  AvailabilityWindowUpdateInput,
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
  FulfillmentParticipant,
  FulfillmentMutationResult,
  ManualPaymentMutationResult,
  ManualPaymentScope,
  OrderAcceptancePausedResult,
  OrderTransitionRepositoryInput,
  OrderTransitionRepositoryOptions,
  OrderListInput,
  OrderReviewMutationResult,
  OrderReviewPayload,
  OverdueAppointmentResolutionMutationResult,
  OverdueAppointmentResolutionPayload,
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
  StartServiceInput,
  OverdueAppointmentResolutionInput
} from "../validators/booking.validator";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import type { AuditLogService } from "./audit-log.service";
import type { BookingLedgerSettlementPort, CheckoutPaymentLedgerPort } from "./ledger.service";
import type {
  OrderRealtimeChangeType,
  OrderStatusNotificationInput,
  OrderStatusNotificationPort
} from "./realtime.service";
import { AppError } from "../utils/app-error";
import type { PaginatedResponse } from "../utils/pagination";
import {
  selectAffiliatePromotion,
  type AffiliateCheckoutService,
  type AffiliatePromotionInput
} from "./affiliate-checkout.service";
import { hasMerchantShopScope, requireMerchantShopId } from "./merchant-shop-scope";
import { exchangeIdempotencyKeySchema } from "../validators/exchange.validators";
import type { NdpExchangeRateService } from "./ndp-exchange-rate.service";
import type { UserExperienceService } from "./user-experience.service";
import type { UserPolicyEnforcementService } from "./user-policy-enforcement.service";
import type { PlatformPaymentMethod } from "../domain/platform-settings";
import type { LiveDashboardEventPublisher } from "./live-dashboard-event.gateway";
import { LiveDashboardOrderChangePublisher } from "./live-dashboard-order-change.publisher";
import type { ShopVisibilityRepositoryPort } from "./shop-visibility.service";
import type { ShopVisibilityViewer } from "../repositories/shop-visibility.repository";

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
type BookingCreateBaseInput = Omit<
  BookingCreateRepositoryInput,
  "customerUserId" | "fulfillmentMode" | "serviceLocation"
> &
  AffiliatePromotionInput & {
    orderType?: "booking" | "request";
  };

export type BookingCreateInput = BookingCreateBaseInput &
  (
    | { fulfillmentMode: "store"; serviceLocation?: never }
    | {
        fulfillmentMode: "home";
        serviceLocation: { countryCode: "JP"; admin1Code: string; admin2Code: string };
      }
  );

export type TechnicianManualBookingInput = {
  customerIdentityId: number;
  expectedPriceAmountJpy: number;
  serviceId?: number;
  technicianServiceId?: number;
  startsAt: Date;
  endsAt: Date;
  paymentMethod: "onsite" | "bank_transfer";
  note?: string;
};

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

export type OrderCheckoutViewPayload = OrderCheckoutPayload & {
  availablePaymentMethods: PlatformPaymentMethod[];
};

export interface PlatformPaymentPolicyPort {
  getAvailablePaymentMethods(): Promise<PlatformPaymentMethod[]>;
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
  }
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
  private readonly platformPaymentPolicy?: PlatformPaymentPolicyPort;

  public constructor(
    private readonly repository: BookingRepositoryPort,
    private readonly ledgerService?: BookingLedgerSettlementPort &
      Partial<CheckoutPaymentLedgerPort>,
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
    rateOrExperience?:
      | Pick<NdpExchangeRateService, "resolveEffectiveRate">
      | Pick<UserExperienceService, "recordEvent">,
    experienceOrNow?: Pick<UserExperienceService, "recordEvent"> | (() => Date),
    nowOrPolicy?: (() => Date) | Pick<UserPolicyEnforcementService, "assertServiceEkyc">,
    policy?: Pick<UserPolicyEnforcementService, "assertServiceEkyc">,
    platformPaymentPolicy?: PlatformPaymentPolicyPort,
    private readonly workStatusNotifier?: { notifyTechnician: (id: number) => Promise<void> },
    private readonly liveDashboardEventPublisher?: LiveDashboardEventPublisher,
    private readonly shopVisibility?: Pick<
      ShopVisibilityRepositoryPort,
      "canView" | "buildVisibilityWhere"
    >
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
    this.platformPaymentPolicy = platformPaymentPolicy;
  }

  public async listAvailableSlots(input: AvailabilityListInput, viewer?: ShopVisibilityViewer) {
    return this.repository.listAvailableSlots(
      input,
      this.shopVisibility
        ? await this.shopVisibility.buildVisibilityWhere(viewer)
        : { visibility: "public" }
    );
  }

  private async assertShopVisible(
    shopId: number | null,
    actor: AuthenticatedBookingActor
  ): Promise<void> {
    if (
      this.shopVisibility &&
      (shopId === null ||
        !(await this.shopVisibility.canView(shopId, {
          userId: actor.userId,
          identityId: actor.currentIdentityId,
          identityType: actor.currentIdentityType,
          identityScopeType: actor.currentIdentityScopeType,
          identityScopeId: actor.currentIdentityScopeId
        })))
    ) {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.shop.not_found",
        statusCode: 404
      });
    }
  }

  public listAvailabilityWindows(
    actor: AuthenticatedAccessContext,
    input: Omit<AvailabilityWindowListInput, keyof ScheduleScope>
  ): Promise<PaginatedResponse<AvailabilityWindowPayload>> {
    if (!this.repository.listAvailabilityWindows) throw this.dependencyUnavailableError();
    return this.repository.listAvailabilityWindows({ ...input, ...this.getScheduleScope(actor) });
  }

  public async createAvailabilityWindow(
    actor: AuthenticatedAccessContext,
    input: Omit<AvailabilityWindowCreateInput, keyof ScheduleScope>,
    context: AuthRequestContext
  ): Promise<AvailabilityWindowPayload> {
    if (!this.repository.createAvailabilityWindow) throw this.dependencyUnavailableError();
    const scope = this.getScheduleScope(actor);
    const window = this.requireAvailabilityWindowMutation(
      await this.repository.createAvailabilityWindow({ ...input, ...scope })
    );
    await this.recordAvailabilityWindowMutation(actor, context, scope, "create", window);
    return window;
  }

  public async updateAvailabilityWindow(
    actor: AuthenticatedAccessContext,
    id: number,
    input: Omit<AvailabilityWindowUpdateInput, keyof ScheduleScope | "id">,
    context: AuthRequestContext
  ): Promise<AvailabilityWindowPayload> {
    if (!this.repository.updateAvailabilityWindow) throw this.dependencyUnavailableError();
    const scope = this.getScheduleScope(actor);
    const window = this.requireAvailabilityWindowMutation(
      await this.repository.updateAvailabilityWindow({ ...input, ...scope, id })
    );
    await this.recordAvailabilityWindowMutation(actor, context, scope, "update", window);
    return window;
  }

  public async deleteAvailabilityWindow(
    actor: AuthenticatedAccessContext,
    id: number,
    context: AuthRequestContext
  ): Promise<AvailabilityWindowPayload> {
    if (!this.repository.deleteAvailabilityWindow) throw this.dependencyUnavailableError();
    const scope = this.getScheduleScope(actor);
    const window = this.requireAvailabilityWindowMutation(
      await this.repository.deleteAvailabilityWindow({ ...scope, id })
    );
    await this.recordAvailabilityWindowMutation(actor, context, scope, "delete", window);
    return window;
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
    const { impactConfirmed, ...mutation } = input;
    await this.assertShopNotSuspended((await this.repository.findScheduleSlotShopId?.(id)) ?? null);
    if (impactConfirmed) {
      await this.cancelScheduleOrdersForImpact(actor, id, "技师确认修改排班，系统取消受影响预约");
    }
    const slot = this.requireScheduleMutation(
      await this.repository.updateScheduleSlot({ ...mutation, ...scope, id })
    );
    await this.recordScheduleMutation(actor, context, scope, "update", slot);
    return slot;
  }

  public async deleteScheduleSlot(
    actor: AuthenticatedAccessContext,
    id: number,
    context: AuthRequestContext,
    input: { impactConfirmed?: boolean } = {}
  ): Promise<ScheduleSlotPayload> {
    const scope = this.getScheduleScope(actor);
    if (input.impactConfirmed) {
      await this.cancelScheduleOrdersForImpact(actor, id, "技师确认取消排班，系统取消受影响预约");
    }
    const slot = this.requireScheduleMutation(
      await this.repository.deleteScheduleSlot({ ...scope, id })
    );
    await this.recordScheduleMutation(actor, context, scope, "delete", slot);
    return slot;
  }

  private async cancelScheduleOrdersForImpact(
    actor: AuthenticatedAccessContext,
    scheduleSlotId: number,
    reason: string
  ): Promise<void> {
    await this.getScheduleSlot(actor, scheduleSlotId);
    if (!this.repository.listCancellableOrdersForScheduleSlot) {
      throw this.dependencyUnavailableError();
    }
    const affected = await this.repository.listCancellableOrdersForScheduleSlot(scheduleSlotId);
    for (const order of affected) {
      await this.transition(actor, order.id, "cancel", reason);
    }
  }

  public async createBooking(
    actor: AuthenticatedBookingActor,
    input: BookingCreateInput,
    rawIdempotencyKey?: string,
    authority?: { customerUserId: number; createdByUserId: number }
  ): Promise<BookingOrderPayload> {
    if (!authority && !this.isCustomerSharedIdentity(actor)) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_FORBIDDEN,
        message: "error.auth.identity_forbidden",
        statusCode: 403
      });
    }
    await this.userPolicyEnforcementService?.assertServiceEkyc(
      authority?.customerUserId ?? actor.userId,
      input.fulfillmentMode,
      this.now()
    );
    if (
      input.fulfillmentMode === "home" &&
      (!input.fulfillmentAddress || !input.travelEstimatePublicId)
    ) {
      throw new AppError({
        code: ERROR_CODES.TRAVEL_ESTIMATE_REQUIRED,
        message: "error.travel.estimate_required",
        statusCode: 422
      });
    }
    if (
      input.fulfillmentMode === "store" &&
      (input.fulfillmentAddress !== undefined || input.travelEstimatePublicId !== undefined)
    ) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.travel.estimate_not_allowed",
        statusCode: 400
      });
    }
    const selector = selectAffiliatePromotion(input);
    let idempotencyKey: string | undefined;
    if (input.exchangeIntelligencePostId || rawIdempotencyKey !== undefined) {
      const parsedKey = exchangeIdempotencyKeySchema.safeParse(rawIdempotencyKey);
      if (!parsedKey.success || (input.exchangeIntelligencePostId && selector)) {
        throw new AppError({
          code: ERROR_CODES.VALIDATION,
          message: "error.validation",
          statusCode: 400
        });
      }
      idempotencyKey = parsedKey.data;
    }
    const targetShopId =
      (await this.repository.findScheduleSlotShopId?.(input.scheduleSlotId)) ?? null;
    await this.assertShopVisible(targetShopId, actor);
    await this.assertShopNotSuspended(targetShopId);
    const repositoryInput: BookingCreateRepositoryInput = {
      customerUserId: authority?.customerUserId ?? actor.userId,
      createdByUserId: authority?.createdByUserId ?? actor.userId,
      expectedPriceAmountJpy: input.expectedPriceAmountJpy,
      orderType: input.orderType ?? "booking",
      serviceId: input.serviceId,
      technicianServiceId: input.technicianServiceId,
      scheduleSlotId: input.scheduleSlotId,
      fulfillmentMode: input.fulfillmentMode,
      serviceLocation:
        input.fulfillmentMode === "store"
          ? { source: "SHOP_LOCATION" }
          : {
              source: "CUSTOMER_SERVICE_LOCATION",
              countryCode: input.serviceLocation.countryCode,
              admin1Code: input.serviceLocation.admin1Code,
              admin2Code: input.serviceLocation.admin2Code
            },
      paymentMethod: input.paymentMethod,
      note: input.note,
      fulfillmentAddress: input.fulfillmentAddress,
      travelEstimatePublicId: input.travelEstimatePublicId,
      exchangeIntelligencePostId: input.exchangeIntelligencePostId,
      idempotencyKey
    };
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
    if ("travelEstimateError" in result) {
      const details = {
        expired: [ERROR_CODES.TRAVEL_ESTIMATE_EXPIRED, "error.travel.estimate_expired", 409],
        consumed: [ERROR_CODES.TRAVEL_ESTIMATE_CONSUMED, "error.travel.estimate_consumed", 409],
        mismatch: [ERROR_CODES.TRAVEL_ESTIMATE_MISMATCH, "error.travel.estimate_mismatch", 422],
        invalid: [ERROR_CODES.TRAVEL_ESTIMATE_INVALID, "error.travel.estimate_invalid", 422]
      }[result.travelEstimateError] as [number, string, number];
      throw new AppError({ code: details[0], message: details[1], statusCode: details[2] });
    }
    if ("intelligenceBookingError" in result) {
      const details = {
        unavailable: [
          ERROR_CODES.EXCHANGE_INTELLIGENCE_BOOKING_UNAVAILABLE,
          "error.exchange.intelligence_booking_unavailable"
        ],
        service_mismatch: [
          ERROR_CODES.EXCHANGE_INTELLIGENCE_BOOKING_SERVICE_MISMATCH,
          "error.exchange.intelligence_booking_service_mismatch"
        ],
        idempotency_conflict: [
          ERROR_CODES.BOOKING_CREATE_IDEMPOTENCY_CONFLICT,
          "error.booking.create_idempotency_conflict"
        ]
      }[result.intelligenceBookingError] as [number, string];
      throw new AppError({ code: details[0], message: details[1], statusCode: 409 });
    }
    if ("bookingConflict" in result) {
      throw new AppError({
        code: ERROR_CODES.BOOKING_SLOT_CONCURRENT_OCCUPANCY,
        message: "error.booking.slot_concurrent_occupancy",
        statusCode: 409
      });
    }
    if ("outcome" in result) {
      throw new AppError({
        code: ERROR_CODES.BOOKING_PRICE_CHANGED,
        message: "error.booking.price_changed",
        statusCode: 409,
        data: { currentPriceAmountJpy: result.currentPriceAmountJpy }
      });
    }
    if (!("order" in result) || !("supersededOrders" in result)) {
      await this.publishLiveDashboardChangesBestEffort([result.id]);
      return result;
    }
    if (result.idempotentReplay) {
      return result.order;
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
    await this.publishLiveDashboardChangesBestEffort([
      ...result.supersededOrders.map((superseded) => superseded.order.id),
      result.order.id
    ]);
    return result.order;
  }

  public async createTechnicianManualBooking(
    actor: AuthenticatedAccessContext,
    input: TechnicianManualBookingInput,
    rawIdempotencyKey: string,
    context: AuthRequestContext
  ): Promise<BookingOrderPayload> {
    if (
      actor.currentIdentityType !== "technician" ||
      actor.currentIdentityScopeType !== "technician_profile" ||
      !actor.currentIdentityScopeId ||
      !actor.currentIdentityId ||
      !this.repository.findActiveCustomerUserIdByIdentityId
    ) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_FORBIDDEN,
        message: "error.auth.identity_forbidden",
        statusCode: 403
      });
    }
    const customerUserId = await this.repository.findActiveCustomerUserIdByIdentityId(
      input.customerIdentityId
    );
    if (!customerUserId) throw this.notFoundError();
    const scope = this.getScheduleScope(actor);
    const scheduleResult = await this.repository.createScheduleSlot({
      ...scope,
      serviceId: input.serviceId,
      technicianServiceId: input.technicianServiceId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      capacity: 1,
      createAvailability: false,
      manualBookingIdempotencyKey: rawIdempotencyKey
    });
    const slot = this.requireScheduleMutation(scheduleResult);
    if (scheduleResult.outcome === "ok" && !scheduleResult.idempotentReplay) {
      await this.recordScheduleMutation(actor, context, scope, "create", slot);
    }
    try {
      return await this.createBooking(
        actor,
        {
          expectedPriceAmountJpy: input.expectedPriceAmountJpy,
          serviceId: input.serviceId,
          technicianServiceId: input.technicianServiceId,
          scheduleSlotId: slot.id,
          fulfillmentMode: "store",
          paymentMethod: input.paymentMethod,
          note: input.note
        },
        rawIdempotencyKey,
        {
          customerUserId,
          createdByUserId: actor.userId
        }
      );
    } catch (error) {
      await this.repository.deleteScheduleSlot({ ...scope, id: slot.id }).catch(() => undefined);
      throw error;
    }
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
    const fulfillmentActor = this.getFulfillmentActor(actor, input.actor, true);
    await this.assertFulfillmentOrderAccess(actor, orderId, fulfillmentActor.actor);
    const result = await this.repository.startService({
      ...fulfillmentActor,
      orderId,
      verificationCode: input.actor === "customer" ? null : input.verificationCode,
      idempotencyKey: input.idempotencyKey,
      requestContext: this.fulfillmentRequestContext(context)
    });
    const mutation = this.requireFulfillmentMutation(result);
    if (mutation.applied) {
      if (mutation.order.technicianProfileId)
        await this.workStatusNotifier?.notifyTechnician(mutation.order.technicianProfileId);
      await this.notifyOrderStatusChangedBestEffort({
        actorUserId: actor.userId,
        orderId: mutation.order.id,
        orderNo: mutation.order.orderNo,
        fromStatus: "confirmed",
        toStatus: "inService",
        serviceName: mutation.order.serviceName,
        recipientUserIds: this.resolveOrderNotificationRecipients(actor, mutation.order)
      });
      await this.notifyOrderChangedBestEffort(actor, mutation.order, "status");
      await this.publishLiveDashboardChangesBestEffort([mutation.order.id]);
    }
    return mutation.order;
  }

  public async resolveOverdueAppointment(
    actor: AuthenticatedBookingActor,
    orderId: number,
    input: OverdueAppointmentResolutionInput,
    context: AuthRequestContext
  ): Promise<OverdueAppointmentResolutionPayload> {
    if (!actor.currentIdentityId) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_FORBIDDEN,
        message: "error.auth.identity_forbidden",
        statusCode: 403
      });
    }
    const fulfillmentActor = this.getFulfillmentActor(actor);
    await this.assertFulfillmentOrderAccess(actor, orderId, fulfillmentActor.actor);
    const requestFingerprint = createHash("sha256")
      .update(`${orderId}:${fulfillmentActor.actor}:${input.resolution}`)
      .digest("hex");
    const result = await this.repository.resolveOverdueAppointment(
      {
        ...fulfillmentActor,
        orderId,
        resolvedByIdentityId: actor.currentIdentityId,
        resolution: input.resolution,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint,
        requestContext: this.fulfillmentRequestContext(context)
      },
      {
        settle: this.ledgerService
          ? async ({ transactionClient, order, checkoutPayment }) => {
              const confirmed = order.statusHistory.find(
                (history) => history.toStatus === "confirmed"
              );
              await this.ledgerService!.settleBookingCompletion(
                {
                  bookingOrderId: order.id,
                  orderType: order.orderType,
                  shopId: order.shopId,
                  technicianProfileId: order.technicianProfileId,
                  serviceId: order.serviceId,
                  serviceAmountJpy: order.paymentAmountJpy,
                  scheduledStartAt: order.startsAt,
                  acceptedAt: confirmed?.createdAt,
                  completedAt: this.now(),
                  customerUserId: order.customerUserId,
                  actorUserId: actor.userId,
                  suppressCustomerReward: input.resolution !== "actually_completed",
                  ...(checkoutPayment ? { checkoutPayment } : {})
                },
                { transactionClient }
              );
            }
          : undefined
      }
    );
    const mutation = this.requireOverdueResolution(result);
    if (mutation.applied) {
      await this.notifyOrderChangedBestEffort(actor, mutation.resolution.order, "status");
      await this.publishLiveDashboardChangesBestEffort([mutation.resolution.order.id]);
    }
    return mutation.resolution;
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
    const mutation = this.requireFulfillmentMutation(result);
    if (mutation.applied) {
      await this.notifyOrderChangedBestEffort(actor, mutation.order, "add_on");
      await this.publishLiveDashboardChangesBestEffort([mutation.order.id]);
    }
    return mutation.order;
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
    const fulfillmentActor = this.getFulfillmentActor(actor, undefined, true);
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
      if (mutation.order.technicianProfileId)
        await this.workStatusNotifier?.notifyTechnician(mutation.order.technicianProfileId);
      await this.notifyOrderStatusChangedBestEffort({
        actorUserId: actor.userId,
        orderId: mutation.order.id,
        orderNo: mutation.order.orderNo,
        fromStatus: "inService",
        toStatus: "awaitingCheckout",
        serviceName: mutation.order.serviceName,
        recipientUserIds: this.resolveOrderNotificationRecipients(actor, mutation.order)
      });
      await this.notifyOrderChangedBestEffort(actor, mutation.order, "status");
      await this.publishLiveDashboardChangesBestEffort([mutation.order.id]);
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
      .update(
        JSON.stringify({
          orderId,
          reviewerUserId: actor.userId,
          targetType: permittedTarget,
          rating: input.rating,
          tags,
          comment
        })
      )
      .digest("hex");
    const mutation = this.requireOrderReviewMutation(
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
            reviewTargets: permittedTarget === "technician" ? ["technician", "shop"] : ["customer"],
            rating: input.rating,
            tagCount: tags.length
          }
        })
      })
    );
    if (mutation.applied) {
      const order = await this.repository.findOrderById(orderId);
      if (order) await this.notifyOrderChangedBestEffort(actor, order, "review");
    }
    return mutation;
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

  public async createOrderTimelineComment(
    actor: AuthenticatedBookingActor,
    orderId: number,
    body: string
  ): Promise<BookingOrderPayload> {
    const participant = this.getFulfillmentActor(actor);
    await this.assertFulfillmentOrderAccess(actor, orderId, participant.actor);
    if (!this.repository.createOrderTimelineComment) throw this.dependencyUnavailableError();
    const order = await this.repository.createOrderTimelineComment({
      actorUserId: actor.userId,
      body: body.normalize("NFKC").trim(),
      orderId
    });
    if (!order) throw this.notFoundError();
    await this.notifyOrderChangedBestEffort(actor, order, "timeline_comment");
    return order;
  }

  public async getCheckout(
    actor: AuthenticatedBookingActor,
    orderId: number
  ): Promise<OrderCheckoutViewPayload> {
    const availablePaymentMethods = await this.getAvailablePaymentMethods();
    const actorInput = this.checkoutActorInput(actor, orderId);
    const existing = await this.repository.getOrCreateCheckout({ ...actorInput, rate: null });
    if (existing.outcome !== "rate_required") {
      return this.withAvailablePaymentMethods(
        this.requireCheckoutMutation(existing).checkout,
        availablePaymentMethods
      );
    }
    if (!this.ndpExchangeRateService) throw this.dependencyUnavailableError();
    const resolvedAt = this.now();
    const rate = await this.ndpExchangeRateService.resolveEffectiveRate(resolvedAt);
    const created = await this.repository.getOrCreateCheckout({
      ...actorInput,
      rate: { ...rate, resolvedAt }
    });
    return this.withAvailablePaymentMethods(
      this.requireCheckoutMutation(created).checkout,
      availablePaymentMethods
    );
  }

  public async selectCheckoutPaymentMethod(
    actor: AuthenticatedBookingActor,
    orderId: number,
    input: SelectPaymentMethodInput,
    context: AuthRequestContext
  ): Promise<OrderCheckoutViewPayload> {
    this.assertOwningCustomerIdentity(actor);
    if (input.method === "other") {
      throw new AppError({
        code: ERROR_CODES.PAYMENT_PROVIDER_UNCONFIGURED,
        message: "error.payment.provider_unconfigured",
        statusCode: 503
      });
    }
    const availablePaymentMethods = await this.getAvailablePaymentMethods();
    this.assertPaymentMethodEnabled(input.method, availablePaymentMethods);
    const result = await this.repository.selectCheckoutPaymentMethod({
      ...this.checkoutActorInput(actor, orderId),
      ...input
    });
    const mutation = this.requireCheckoutMutation(result);
    if (mutation.applied) {
      await this.notifyCheckoutCompletionBestEffort(actor, mutation.checkout, context, false);
      await this.publishLiveDashboardChangesBestEffort([mutation.checkout.orderId]);
    }
    return this.withAvailablePaymentMethods(mutation.checkout, availablePaymentMethods);
  }

  public async payCheckoutWithNdp(
    actor: AuthenticatedBookingActor,
    orderId: number,
    input: PayWithNdpInput,
    context: AuthRequestContext
  ): Promise<OrderCheckoutViewPayload> {
    this.assertOwningCustomerIdentity(actor);
    const availablePaymentMethods = await this.getAvailablePaymentMethods();
    this.assertPaymentMethodEnabled("ndp", availablePaymentMethods);
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
    return this.withAvailablePaymentMethods(mutation.checkout, availablePaymentMethods);
  }

  public async confirmCheckoutReceipt(
    actor: AuthenticatedAccessContext,
    orderId: number,
    input: ConfirmReceiptInput,
    context: AuthRequestContext,
    operationsOverride = false
  ): Promise<OrderCheckoutViewPayload> {
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
    const availablePaymentMethods = await this.getAvailablePaymentMethods();
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
    const result = await this.repository.confirmCheckoutReceipt(repositoryInput, {
      settle: (checkoutContext) => this.settleCheckoutBooking(checkoutContext, actor.userId),
      settleAffiliate: (checkoutContext) =>
        this.settleCheckoutAffiliate(checkoutContext, actor.userId)
    });
    const mutation = this.requireCheckoutMutation(result);
    if (mutation.applied) {
      await this.notifyCheckoutCompletionBestEffort(actor, mutation.checkout, context, true);
    }
    return this.withAvailablePaymentMethods(mutation.checkout, availablePaymentMethods);
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
      await this.publishLiveDashboardChangesBestEffort([order.id]);
    }

    return order;
  }

  private async getAvailablePaymentMethods(): Promise<PlatformPaymentMethod[]> {
    return this.platformPaymentPolicy?.getAvailablePaymentMethods() ?? ["cash", "ndp"];
  }

  private assertPaymentMethodEnabled(
    method: PlatformPaymentMethod,
    availablePaymentMethods: PlatformPaymentMethod[]
  ): void {
    if (availablePaymentMethods.includes(method)) return;
    throw new AppError({
      code: ERROR_CODES.PLATFORM_PAYMENT_METHOD_DISABLED,
      message: "error.payment.method_disabled",
      statusCode: 409
    });
  }

  private withAvailablePaymentMethods(
    checkout: OrderCheckoutPayload,
    availablePaymentMethods: PlatformPaymentMethod[]
  ): OrderCheckoutViewPayload {
    return { ...checkout, availablePaymentMethods: [...availablePaymentMethods] };
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
    const confirmed = context.order.statusHistory.find(
      (history) => history.toStatus === "confirmed"
    );
    const hasExactServiceComponentBasis =
      context.checkout.baseAmountJpy + context.checkout.addOnAmountJpy ===
      context.checkout.checkoutAmountJpy;
    const checkoutPayment =
      context.checkout.paymentMethod === "ndp"
        ? {
            method: "ndp" as const,
            payableNdp: context.checkout.payableNdp
          }
        : (context.checkout.paymentMethod === "cash" ||
              context.checkout.paymentMethod === "other") &&
            (context.checkout.paymentEvidence === "technician_receipt_confirmation" ||
              context.checkout.paymentEvidence === "operations_receipt_override") &&
            context.checkout.receiptConfirmedAt &&
            context.checkout.receiptConfirmationReason
          ? {
              method: context.checkout.paymentMethod,
              amountJpy: context.checkout.checkoutAmountJpy,
              ...(hasExactServiceComponentBasis
                ? {
                    baseServiceAmountJpy: context.checkout.baseAmountJpy,
                    extensionAmountJpy: context.checkout.addOnAmountJpy
                  }
                : {}),
              evidence: context.checkout.paymentEvidence,
              confirmedById: actorUserId,
              confirmedAt: context.checkout.receiptConfirmedAt,
              reason: context.checkout.receiptConfirmationReason
            }
          : undefined;
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
        actorUserId,
        ...(checkoutPayment ? { checkoutPayment } : {})
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
      if (order) {
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
      }
    } catch (error) {
      logger.error(
        { error, orderId: checkout.orderId },
        "Checkout completion notification lookup failed after booking commit"
      );
    }
    await this.publishLiveDashboardChangesBestEffort([checkout.orderId]);
  }

  public async refundManualPayment(
    actor: AuthenticatedAccessContext,
    orderId: number,
    input: ManualPaymentRefundInput,
    context: AuthRequestContext
  ): Promise<BookingOrderPayload> {
    const scope = this.getManualPaymentScope(actor);
    const current = await this.getOrder(actor, orderId);
    if (current.status === "completed" && current.paymentStatus === "confirmed") {
      throw new AppError({
        code: ERROR_CODES.PAYMENT_INVALID_STATE,
        message: "error.payment.invalid_state",
        statusCode: 409
      });
    }
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
      await this.publishLiveDashboardChangesBestEffort([order.id]);
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
    await this.notifyOrderChangedBestEffort(actor, next, "status");
    await this.publishLiveDashboardChangesBestEffort([next.id]);

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
    const mutation = this.requireFulfillmentMutation(result);
    if (mutation.applied) {
      await this.notifyOrderChangedBestEffort(actor, mutation.order, "add_on");
      await this.publishLiveDashboardChangesBestEffort([mutation.order.id]);
    }
    return mutation.order;
  }

  private getFulfillmentActor(
    actor: AuthenticatedBookingActor,
    requestedActor?: FulfillmentParticipant
  ): Omit<FulfillmentActorInput, "requestContext" | "actor"> & {
    actor: FulfillmentParticipant;
  };
  private getFulfillmentActor(
    actor: AuthenticatedBookingActor,
    requestedActor: "customer" | "technician" | "merchant" | undefined,
    allowMerchant: true
  ): Omit<FulfillmentActorInput, "requestContext">;
  private getFulfillmentActor(
    actor: AuthenticatedBookingActor,
    requestedActor?: "customer" | "technician" | "merchant",
    allowMerchant = false
  ): Omit<FulfillmentActorInput, "requestContext"> {
    const actorType =
      actor.currentIdentityScopeType === "technician_profile" &&
      actor.currentIdentityScopeId &&
      actor.currentIdentityType === "technician"
        ? "technician"
        : allowMerchant && this.isMerchantShopActor(actor)
          ? "merchant"
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
        actorType === "technician" ? (actor.currentIdentityScopeId ?? null) : null,
      ...(actorType === "merchant"
        ? { shopId: requireMerchantShopId(actor as AuthenticatedAccessContext) }
        : {})
    };
  }

  private async assertFulfillmentOrderAccess(
    actor: AuthenticatedBookingActor,
    orderId: number,
    participant: "customer" | "technician" | "merchant"
  ): Promise<void> {
    const order = await this.repository.findOrderById(orderId);
    const allowed =
      order !== null &&
      order.technicianProfileId !== null &&
      (participant === "customer"
        ? order.customerUserId === actor.userId
        : participant === "technician"
          ? order.technicianProfileId === actor.currentIdentityScopeId
          : order.shopId === requireMerchantShopId(actor as AuthenticatedAccessContext));
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
    if (result.outcome === "service_start_too_early") {
      throw new AppError({
        code: ERROR_CODES.ORDER_SERVICE_START_TOO_EARLY,
        message: "error.order.service_start_too_early",
        statusCode: 409
      });
    }
    if (result.outcome === "overdue_appointment_blocked") {
      throw new AppError({
        code: ERROR_CODES.ORDER_OVERDUE_APPOINTMENT_BLOCKED,
        message: "error.order.overdue_appointment_blocked",
        statusCode: 409,
        data: { overdueAppointment: result.overdueAppointment }
      });
    }
    if (result.outcome === "service_end_too_early") {
      throw new AppError({
        code: ERROR_CODES.ORDER_SERVICE_END_TOO_EARLY,
        message: "error.order.service_end_too_early",
        statusCode: 409
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

  private requireOverdueResolution(
    result: OverdueAppointmentResolutionMutationResult
  ): Extract<OverdueAppointmentResolutionMutationResult, { outcome: "ok" }> {
    if (result.outcome === "ok") return result;
    if (result.outcome === "not_found") throw this.notFoundError();
    if (result.outcome === "conflict") {
      throw new AppError({
        code: ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
        message: "error.idempotency.key_reused",
        statusCode: 409
      });
    }
    throw new AppError({
      code: ERROR_CODES.ORDER_INVALID_TRANSITION,
      message:
        result.outcome === "already_resolved"
          ? "error.order.overdue_appointment_already_resolved"
          : "error.order.overdue_appointment_invalid_state",
      statusCode: 409
    });
  }

  private requireOrderReviewMutation(result: OrderReviewMutationResult): {
    applied: boolean;
    review: OrderReviewPayload;
  } {
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

  private async notifyOrderChangedBestEffort(
    actor: AuthenticatedBookingActor,
    order: BookingOrderPayload,
    changeType: OrderRealtimeChangeType
  ): Promise<void> {
    if (
      !this.notificationService?.notifyOrderChanged ||
      !this.repository.findOrderRealtimeRecipients
    ) {
      return;
    }
    try {
      const recipients = await this.repository.findOrderRealtimeRecipients(order.id);
      await this.notificationService.notifyOrderChanged({
        actorIdentityId: actor.currentIdentityId,
        actorUserId: actor.userId,
        changeType,
        orderId: order.id,
        orderNo: order.orderNo,
        recipients
      });
    } catch (error) {
      logger.error(
        { error, orderId: order.id, changeType },
        "Order realtime change delivery failed after booking commit"
      );
    }
  }

  private async publishLiveDashboardChangesBestEffort(orderIds: number[]): Promise<void> {
    if (!this.liveDashboardEventPublisher || !this.repository.findLiveDashboardOrderEvents) return;
    const projectionRepository = {
      findLiveDashboardOrderEvents: (ids: number[]) =>
        this.repository.findLiveDashboardOrderEvents!(ids)
    };
    await new LiveDashboardOrderChangePublisher(
      projectionRepository,
      this.liveDashboardEventPublisher
    ).publishCommittedOrderChanges(orderIds);
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
    if (result.outcome === "idempotency_conflict") {
      throw new AppError({
        code: ERROR_CODES.BOOKING_CREATE_IDEMPOTENCY_CONFLICT,
        message: "error.booking.create_idempotency_conflict",
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

  private requireAvailabilityWindowMutation(
    result: AvailabilityWindowMutationResult
  ): AvailabilityWindowPayload {
    if (result.outcome === "ok") return result.window;
    if (result.outcome === "suspended") throw this.suspendedError();
    if (result.outcome === "not_found") {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.availability.window_not_found",
        statusCode: 404
      });
    }
    throw new AppError({
      code: ERROR_CODES.SCHEDULE_CONFLICT,
      message:
        result.outcome === "shop_control_conflict"
          ? "error.availability.shop_control_conflict"
          : "error.availability.conflict",
      statusCode: 409
    });
  }

  private async recordAvailabilityWindowMutation(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    scope: ScheduleScope,
    operation: "create" | "update" | "delete",
    window: AvailabilityWindowPayload
  ): Promise<void> {
    if (!this.auditLogService) throw new Error("Availability audit log service is required");
    await this.auditLogService.record({
      actor,
      action: `${scope.scope === "merchant" ? "merchant_admin" : "technician"}.availability_window.${operation}`,
      targetType: "Availability",
      targetId: window.id,
      context,
      metadata: {
        shopId: window.shopId,
        technicianProfileId: window.technicianProfileId,
        sourceType: window.sourceType
      }
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
