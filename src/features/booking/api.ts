import { httpClient } from "../../api/httpClient";
import type {
  ExchangeIntelligenceShopPublisherProfileProjection,
  ExchangeIntelligenceTechnicianPublisherProfileProjection
} from "../../shared/profile-card";
import type {
  TechnicianServiceBookingContextServiceCardProjection
} from "../../shared/service-card";
import type { FulfillmentMode, Order, OrderRebookDecision } from "../../types/domain";

export type BookingOrderStatus =
  | "pending"
  | "confirmed"
  | "inService"
  | "awaitingCheckout"
  | "awaitingPaymentConfirmation"
  | "completed"
  | "cancelled";
export type ManualPaymentMethod = "onsite" | "bank_transfer";
export type ManualPaymentStatus = "pending" | "confirmed" | "refundPending" | "refunded";
export type CheckoutPaymentMethod = "cash" | "ndp" | "other";
export type AvailableCheckoutPaymentMethod = "cash" | "ndp";
export type CheckoutPaymentEvidence =
  | "ndp_ledger"
  | "technician_receipt_confirmation"
  | "operations_receipt_override";
export type FulfillmentParticipant = "customer" | "technician";
export type OrderStatusActorSource =
  | "customer"
  | "merchant"
  | "technician"
  | "platform"
  | "system";

export type BookingOrderAddOn = {
  id: number;
  serviceId: number;
  serviceType: "shop_service" | "technician_service";
  status: "proposed" | "accepted" | "rejected";
  serviceNameSnapshot: string;
  priceAmountJpy: number;
  currency: "JPY";
  durationMinutes: number;
  serviceSnapshot: unknown;
  proposedBy: FulfillmentParticipant | null;
  proposedAt: string;
  resolvedBy: FulfillmentParticipant | null;
  resolvedAt: string | null;
  resolutionReason: string | null;
};

export type OrderAddOnService = {
  id: number;
  sourceType: "shop_service" | "technician_service";
  name: string;
  description: string | null;
  priceAmountJpy: number;
  currency: "JPY";
  durationMinutes: number;
  coverUrl: string | null;
};

export type BookingOrderServiceSession = {
  startedAt: string | null;
  expectedEndsAt: string | null;
  endedAt: string | null;
  addOns: BookingOrderAddOn[];
};

export type OrderCheckout = {
  id: number;
  orderId: number;
  status: BookingOrderStatus;
  baseAmountJpy: number;
  addOnAmountJpy: number;
  travelFareAmountJpy: number;
  discountAmountJpy: number;
  checkoutAmountJpy: number;
  payableNdp: number;
  availablePaymentMethods: AvailableCheckoutPaymentMethod[];
  rate: {
    ruleId: number;
    publicId: string;
    version: number;
    ndpUnits: number;
    jpyUnits: number;
    effectiveFrom: string;
  };
  calculation: {
    formula: "base_plus_accepted_add_ons_plus_travel_fare_minus_discount";
    baseAmountJpy: number;
    acceptedAddOnIds: number[];
    addOnAmountJpy: number;
    travelFareAmountJpy: number;
    discountAmountJpy: number;
    checkoutAmountJpy: number;
    rateFormula: "ceil(jpy_times_ndp_units_divided_by_jpy_units)";
  };
  paymentMethod: CheckoutPaymentMethod | null;
  paymentSelectedAt: string | null;
  otherMethod: { code: string; label: string } | null;
  paymentEvidence: CheckoutPaymentEvidence | null;
  receiptConfirmedAt: string | null;
  receiptConfirmationReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BookingIdempotencyInput = { idempotencyKey: string };
export type OrderConfirmInput = {
  insufficientBalanceConfirmation?: {
    confirmed: true;
    idempotencyKey: string;
    previewVersion: string;
  };
};
export type StartServiceInput = BookingIdempotencyInput & (
  | { actor: "customer"; verificationCode?: never }
  | { actor: "technician"; verificationCode: string }
  | { actor: "merchant"; verificationCode: string }
);
export type OverdueAppointmentResolutionKind =
  | "actually_completed"
  | "customer_no_show"
  | "technician_no_show";
export type OverdueAppointmentBlock = {
  orderId: number;
  orderNo: string;
  serviceName: string;
  startsAt: string;
  endsAt: string;
};
export type OverdueAppointmentResolution = {
  orderId: number;
  orderNo: string;
  resolution: OverdueAppointmentResolutionKind;
  resolvedAt: string;
  systemReviewId: number | null;
  order: BookingOrder;
};
export type CreateAddOnInput = BookingIdempotencyInput & { serviceId: number };
export type EndServiceInput = BookingIdempotencyInput & { reason: string };
export type SelectCheckoutPaymentMethodInput = BookingIdempotencyInput & (
  | { method: "cash"; otherMethodCode?: never; otherMethodLabel?: never }
  | { method: "ndp"; otherMethodCode?: never; otherMethodLabel?: never }
);
export type ConfirmCheckoutReceiptInput = BookingIdempotencyInput & { reason: string };
export type OrderReviewTargetType = "customer" | "technician";
export type OrderReview = {
  targetType: OrderReviewTargetType;
  rating: number;
  tags: string[];
  comment: string | null;
  createdAt: string;
};
export type CreateOrderReviewInput = BookingIdempotencyInput & {
  targetType: OrderReviewTargetType;
  rating: number;
  tags: string[];
  comment: string | null;
};

export type BookingOrderPerformanceAssessment = {
  id: number;
  bookingOrderId: number;
  technicianProfileId: number;
  outcome: "technician_cancelled" | "technician_uncompleted";
  treatment: "counted" | "special_excluded";
  version: number;
  currentRevisionId: number | null;
  createdAt: string;
  updatedAt: string;
};

export type BookingOrderCustomer = {
  userId: number;
  profileId: number | null;
  publicId: string;
  displayName: string;
  avatarUrl: string | null;
  membershipLevel: string;
  ratingAverage: string;
  reviewCount: number;
};

export type BookingOrderTimelineEvent =
  | {
      type: "ORDER_COMMENT_ADDED";
      id: string;
      createdAt: string;
      actorUserId: number;
      actorDisplayName: string;
      actorAvatarUrl: string | null;
      body: string;
    }
  | {
      type: "ORDER_STATUS_CHANGED";
      id: string;
      createdAt: string;
      actorUserId: number | null;
      actorIdentityId?: number | null;
      actorSource?: OrderStatusActorSource;
      actorDisplayName?: string | null;
      fromStatus: BookingOrderStatus | null;
      toStatus: BookingOrderStatus;
      publicReason: string | null;
    }
  | {
      type:
        | "TECHNICIAN_CANCEL_CLASSIFIED"
        | "TECHNICIAN_UNCOMPLETED_CLASSIFIED"
        | "SPECIAL_CANCELLATION_APPLIED"
        | "SPECIAL_CANCELLATION_REVOKED";
      id: string;
      createdAt: string;
      actorUserId: number | null;
      publicReason: string | null;
    };

export type BookingScheduleSlot = {
  id: number;
  serviceId: number | null;
  technicianServiceId: number | null;
  shopId: number;
  technicianProfileId: number | null;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedCount: number;
  status: "available" | "booked" | "blocked";
  serviceName: string;
  shopName: string;
  technicianName: string | null;
  priceAmount: string;
  currency: string;
  durationMinutes: number;
  nominationFeeJpy?: number;
  availabilitySourceType?: "shop" | "technician" | null;
};

export type AdministrativeRegionReference = {
  code: string;
  name: string;
  level: "country" | "admin1" | "admin2";
  parentCode: string | null;
  centroid: { lat: number; lng: number } | null;
};

export type AdministrativeRegionListInput = {
  country: "JP";
  locale?: "zh-CN" | "zh-TW" | "ja" | "en" | "ko";
  parent?: string;
};

export type BookingOrder = {
  id: number;
  orderNo: string;
  orderType: "booking" | "request";
  status: BookingOrderStatus;
  paymentMethod: ManualPaymentMethod | CheckoutPaymentMethod;
  paymentStatus: ManualPaymentStatus;
  paymentAmountJpy: number;
  amountSource?: "order_payment" | "order_price" | "accepted_add_ons" | "checkout";
  effectivePaymentMethod?: ManualPaymentMethod | CheckoutPaymentMethod | null;
  otherMethodCode?: string | null;
  otherMethodLabel?: string | null;
  checkoutPaymentAmountNdp?: number | null;
  ndpCurrency?: "NDP" | "TEST_NDP" | null;
  paymentConfirmedById: number | null;
  paymentConfirmedAt: string | null;
  paymentReference: string | null;
  paymentNote: string | null;
  paymentRefundedById: number | null;
  paymentRefundedAt: string | null;
  paymentRefundReference: string | null;
  paymentRefundReason: string | null;
  customerUserId: number;
  exchangeIntelligencePostId?: number | null;
  customer?: BookingOrderCustomer;
  serviceId: number | null;
  technicianServiceId: number | null;
  shopId: number;
  technicianProfileId: number | null;
  scheduleSlotId: number;
  fulfillmentMode: FulfillmentMode;
  serviceName: string;
  pricingModeSnapshot?: "merchant" | "technician";
  serviceOwnerType?: "shop" | "technician";
  serviceOwnerId?: number | null;
  serviceNameSnapshot?: string | null;
  servicePriceSnapshot?: string | null;
  serviceDurationSnapshot?: number | null;
  serviceSnapshot?: unknown;
  rebook?: OrderRebookDecision;
  shopName: string;
  technicianName: string | null;
  priceAmount: string;
  currency: string;
  startsAt: string;
  endsAt: string;
  note: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  serviceVerificationCode?: string;
  serviceSession?: BookingOrderServiceSession | null;
  statusHistory: Array<{
    id: number;
    orderId: number;
    fromStatus: BookingOrderStatus | null;
    toStatus: BookingOrderStatus;
    actorUserId: number | null;
    actorIdentityId?: number | null;
    actorSource?: OrderStatusActorSource;
    actorDisplayName?: string | null;
    reason: string | null;
    createdAt: string;
  }>;
  performanceAssessment?: BookingOrderPerformanceAssessment | null;
  timelineEvents?: BookingOrderTimelineEvent[];
};

export type PaginatedBookingData<TItem> = {
  list: TItem[];
  total: number;
  page: number;
  page_size: number;
};

export type AvailabilityQuery = {
  from: string;
  includeUnavailable?: boolean;
  page?: number;
  pageSize?: number;
  serviceId?: number;
  technicianServiceId?: number;
  shopId?: number;
  technicianId?: number;
  to: string;
};

export type OrderListQuery = {
  dateMode?: "startsWithin" | "overlaps";
  from?: string;
  page?: number;
  pageSize?: number;
  status?: BookingOrderStatus;
  to?: string;
};

export type ManagedScheduleScope = "merchant-admin" | "technician";

export type ManagedScheduleSlotQuery = {
  from: string;
  page?: number;
  pageSize?: number;
  serviceId?: number;
  technicianProfileId?: number;
  technicianServiceId?: number;
  status?: BookingScheduleSlot["status"];
  to: string;
};

export type CreateManagedScheduleSlotInput = {
  capacity?: number;
  endsAt: string;
  serviceId?: number;
  startsAt: string;
  technicianProfileId?: number | null;
  technicianServiceId?: number;
};

export type UpdateManagedScheduleSlotInput = {
  capacity?: number;
  endsAt?: string;
  startsAt?: string;
  status?: "available" | "blocked";
};

type CreateBookingBaseInput = {
  exchangeIntelligencePostId?: number;
  expectedPriceAmountJpy: number;
  note?: string;
  orderType?: "booking" | "request";
  paymentMethod?: ManualPaymentMethod;
  scheduleSlotId: number;
  scheduleSlotIds?: number[];
  nominatedTechnicianProfileId?: number;
} &
  (
    | { serviceId: number; technicianServiceId?: never; technicianServiceIds?: never }
    | { serviceId?: never; technicianServiceId: number; technicianServiceIds?: number[] }
  );

export type CreateBookingInput = CreateBookingBaseInput &
  (
    | { fulfillmentMode: "store"; serviceLocation?: never; fulfillmentAddress?: never; travelEstimatePublicId?: never }
    | {
        fulfillmentMode: "home";
        fulfillmentAddress: import("../../api/travelFare").JapaneseRouteAddress;
        travelEstimatePublicId: string;
        serviceLocation: { countryCode: "JP"; admin1Code: string; admin2Code: string };
      }
  );

export type CreateTechnicianManualBookingInput = {
  customerIdentityId: number;
  expectedPriceAmountJpy: number;
  startsAt: string;
  endsAt: string;
  paymentMethod?: ManualPaymentMethod;
  note?: string;
} &
  ({ serviceId: number; technicianServiceId?: never } | { serviceId?: never; technicianServiceId: number });

export type TechnicianServiceBookingContext = {
  target: { type: "technician_service"; id: number };
  serviceCard: TechnicianServiceBookingContextServiceCardProjection;
  shopCard: Omit<ExchangeIntelligenceShopPublisherProfileProjection, "avatarUrl" | "serviceMode"> & {
    type: "shop";
    serviceMode: "store" | "onsite" | "flexible";
  };
  technicianCard: ExchangeIntelligenceTechnicianPublisherProfileProjection;
};

export function isBookingApiId(value: string | number | null | undefined) {
  return typeof value === "number" ? Number.isInteger(value) && value > 0 : Boolean(value && /^[1-9]\d*$/.test(value));
}

export function createBookingIdempotencyKey() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export function formatApiOrderDateTime(value: string) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day} ${hour}:${minute}`;
}

export function mapBookingOrderToDomainOrder(order: BookingOrder): Order {
  return {
    id: String(order.id),
    serviceId: order.serviceId ? String(order.serviceId) : undefined,
    technicianServiceId: order.technicianServiceId
      ? String(order.technicianServiceId)
      : undefined,
    shopId: String(order.shopId),
    technicianProfileId: order.technicianProfileId
      ? String(order.technicianProfileId)
      : undefined,
    scheduleSlotId: String(order.scheduleSlotId),
    orderNo: order.orderNo,
    mode: order.fulfillmentMode,
    status: order.status,
    customerId: String(order.customerUserId),
    customerName: order.customer?.displayName.trim() || "NeeDo 用户",
    itemName: order.serviceName,
    storeName: order.shopName,
    technicianName: order.technicianName ?? undefined,
    city: "东京",
    area: order.shopName,
    amount: order.paymentAmountJpy,
    paymentStatus:
      order.paymentStatus === "confirmed" || order.paymentStatus === "refundPending"
        ? "paid"
        : order.paymentStatus === "refunded"
          ? "refunded"
          : "unpaid",
    paymentMethod:
      order.paymentMethod === "onsite" || order.paymentMethod === "cash"
        ? "cash"
        : order.paymentMethod === "ndp"
          ? "platform"
          : "offline",
    paymentChannel: order.effectivePaymentMethod ?? undefined,
    otherPaymentMethodCode: order.otherMethodCode ?? undefined,
    otherPaymentMethodLabel: order.otherMethodLabel ?? undefined,
    checkoutPaymentAmountNdp: order.checkoutPaymentAmountNdp ?? undefined,
    ndpCurrency: order.ndpCurrency ?? undefined,
    bookedAt: formatApiOrderDateTime(order.startsAt),
    createdAt: formatApiOrderDateTime(order.createdAt),
    source: "app",
    remark: order.note ?? undefined,
    rebook: order.rebook
  };
}

export const bookingApi = {
  listAdministrativeRegions(input: AdministrativeRegionListInput) {
    return httpClient.request<{ list: AdministrativeRegionReference[] }>(
      "/reference/administrative-regions",
      {
        auth: false,
        query: {
          country: input.country,
          locale: input.locale ?? "ja",
          parent: input.parent
        }
      }
    );
  },
  listAvailability(query: AvailabilityQuery) {
    return httpClient.request<PaginatedBookingData<BookingScheduleSlot>>("/schedule/availability", {
      query
    });
  },
  getTechnicianServiceBookingContext(id: number) {
    return httpClient.request<TechnicianServiceBookingContext>(`/technician-services/${id}/booking-context`);
  },
  createBooking(input: CreateBookingInput, idempotencyKey?: string) {
    return httpClient.request<BookingOrder>("/bookings", {
      body: {
        ...input,
        orderType: input.orderType ?? "booking",
        paymentMethod: input.paymentMethod ?? "onsite"
      },
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined
    });
  },
  createTechnicianManualBooking(input: CreateTechnicianManualBookingInput, idempotencyKey: string) {
    return httpClient.request<BookingOrder>("/technician/manual-bookings", {
      body: {
        ...input,
        paymentMethod: input.paymentMethod ?? "onsite"
      },
      headers: { "Idempotency-Key": idempotencyKey },
      method: "POST"
    });
  },
  listOrders(query: OrderListQuery = {}) {
    return httpClient.request<PaginatedBookingData<BookingOrder>>("/orders", {
      query: {
        dateMode: query.dateMode,
        from: query.from,
        page: query.page,
        pageSize: query.pageSize,
        status: query.status,
        to: query.to
      }
    });
  },
  getOrder(id: number) {
    return httpClient.request<BookingOrder>(`/orders/${id}`);
  },
  assignOrderTechnician(id: number, technicianProfileId: number) {
    return httpClient.request<BookingOrder>(`/orders/${id}/assign-technician`, {
      body: { technicianProfileId },
      method: "POST"
    });
  },
  editMerchantOrder(id: number, input: { priceAmountJpy?: number; paymentMethod?: ManualPaymentMethod; note?: string | null }) {
    return httpClient.request<BookingOrder>(`/orders/${id}/merchant-edit`, {
      body: input,
      method: "PATCH"
    });
  },
  confirmOrder(id: number, input?: OrderConfirmInput) {
    return httpClient.request<BookingOrder>(`/orders/${id}/confirm`, {
      body: input,
      method: "POST"
    });
  },
  cancelOrder(id: number, reason?: string) {
    return httpClient.request<BookingOrder>(`/orders/${id}/cancel`, {
      body: { reason },
      method: "POST"
    });
  },
  startService(id: number, input: StartServiceInput) {
    return httpClient.request<BookingOrder>(`/orders/${id}/service/start`, {
      body: input,
      method: "POST"
    });
  },
  resolveOverdueAppointment(
    id: number,
    input: BookingIdempotencyInput & { resolution: OverdueAppointmentResolutionKind }
  ) {
    return httpClient.request<OverdueAppointmentResolution>(`/orders/${id}/overdue-resolution`, {
      body: input,
      method: "POST"
    });
  },
  createAddOn(id: number, input: CreateAddOnInput) {
    return httpClient.request<BookingOrder>(`/orders/${id}/add-ons`, {
      body: input,
      method: "POST"
    });
  },
  listAddOnServices(id: number, query: { page?: number; pageSize?: number } = {}) {
    return httpClient.request<PaginatedBookingData<OrderAddOnService>>(
      `/orders/${id}/add-on-services`,
      { query }
    );
  },
  acceptAddOn(id: number, addOnId: number, input: BookingIdempotencyInput) {
    return httpClient.request<BookingOrder>(`/orders/${id}/add-ons/${addOnId}/accept`, {
      body: input,
      method: "POST"
    });
  },
  rejectAddOn(id: number, addOnId: number, input: BookingIdempotencyInput) {
    return httpClient.request<BookingOrder>(`/orders/${id}/add-ons/${addOnId}/reject`, {
      body: input,
      method: "POST"
    });
  },
  endService(id: number, input: EndServiceInput) {
    return httpClient.request<BookingOrder>(`/orders/${id}/service/end`, {
      body: input,
      method: "POST"
    });
  },
  getCheckout(id: number) {
    return httpClient.request<OrderCheckout>(`/orders/${id}/checkout`);
  },
  selectPaymentMethod(id: number, input: SelectCheckoutPaymentMethodInput) {
    return httpClient.request<OrderCheckout>(`/orders/${id}/checkout/payment-method`, {
      body: input,
      method: "POST"
    });
  },
  payWithNdp(id: number, input: BookingIdempotencyInput) {
    return httpClient.request<OrderCheckout>(`/orders/${id}/checkout/pay/ndp`, {
      body: input,
      method: "POST"
    });
  },
  confirmReceipt(id: number, input: ConfirmCheckoutReceiptInput) {
    return httpClient.request<OrderCheckout>(`/orders/${id}/checkout/confirm-receipt`, {
      body: input,
      method: "POST"
    });
  },
  getOwnReview(id: number) {
    return httpClient.request<{ review: OrderReview | null }>(`/orders/${id}/reviews/mine`);
  },
  createTimelineComment(id: number, input: { body: string }) {
    return httpClient.request<BookingOrder>(`/orders/${id}/timeline/comments`, {
      body: input,
      method: "POST"
    });
  },
  createReview(id: number, input: CreateOrderReviewInput) {
    return httpClient.request<{ applied: boolean; review: OrderReview }>(`/orders/${id}/reviews`, {
      body: input,
      method: "POST"
    });
  },
  startOrder(id: number) {
    return httpClient.request<BookingOrder>(`/orders/${id}/start`, { method: "POST" });
  },
  completeOrder(id: number) {
    return httpClient.request<BookingOrder>(`/orders/${id}/complete`, { method: "POST" });
  },
  confirmManualPayment(
    surface: "merchant-admin" | "backoffice",
    id: number,
    input: {
      method: ManualPaymentMethod;
      amountJpy: number;
      reference?: string | null;
      note?: string | null;
    }
  ) {
    return httpClient.request<BookingOrder>(`/${surface}/orders/${id}/payment/confirm`, {
      body: input,
      method: "POST"
    });
  },
  refundManualPayment(
    surface: "merchant-admin" | "backoffice",
    id: number,
    input: { reason: string; reference?: string | null }
  ) {
    return httpClient.request<BookingOrder>(`/${surface}/orders/${id}/payment/refund`, {
      body: input,
      method: "POST"
    });
  },
  listManagedScheduleSlots(scope: ManagedScheduleScope, query: ManagedScheduleSlotQuery) {
    return httpClient.request<PaginatedBookingData<BookingScheduleSlot>>(`/${scope}/schedule/slots`, { query });
  },
  createManagedScheduleSlot(scope: ManagedScheduleScope, input: CreateManagedScheduleSlotInput) {
    return httpClient.request<BookingScheduleSlot>(`/${scope}/schedule/slots`, {
      body: input,
      method: "POST"
    });
  },
  updateManagedScheduleSlot(scope: ManagedScheduleScope, id: number, input: UpdateManagedScheduleSlotInput) {
    return httpClient.request<BookingScheduleSlot>(`/${scope}/schedule/slots/${id}`, {
      body: input,
      method: "PATCH"
    });
  },
  deleteManagedScheduleSlot(scope: ManagedScheduleScope, id: number) {
    return httpClient.request<BookingScheduleSlot>(`/${scope}/schedule/slots/${id}`, {
      method: "DELETE"
    });
  }
};
