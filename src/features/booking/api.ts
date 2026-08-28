import { httpClient } from "../../api/httpClient";
import type { FulfillmentMode, Order } from "../../types/domain";

export type BookingOrderStatus = "pending" | "confirmed" | "inService" | "completed" | "cancelled";
export type ManualPaymentMethod = "onsite" | "bank_transfer";
export type ManualPaymentStatus = "pending" | "confirmed" | "refundPending" | "refunded";

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
};

export type BookingOrder = {
  id: number;
  orderNo: string;
  orderType: "booking" | "request";
  status: BookingOrderStatus;
  paymentMethod: ManualPaymentMethod;
  paymentStatus: ManualPaymentStatus;
  paymentAmountJpy: number;
  paymentConfirmedById: number | null;
  paymentConfirmedAt: string | null;
  paymentReference: string | null;
  paymentNote: string | null;
  paymentRefundedById: number | null;
  paymentRefundedAt: string | null;
  paymentRefundReference: string | null;
  paymentRefundReason: string | null;
  customerUserId: number;
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
  statusHistory: Array<{
    id: number;
    orderId: number;
    fromStatus: BookingOrderStatus | null;
    toStatus: BookingOrderStatus;
    actorUserId: number | null;
    reason: string | null;
    createdAt: string;
  }>;
};

export type PaginatedBookingData<TItem> = {
  list: TItem[];
  total: number;
  page: number;
  page_size: number;
};

export type AvailabilityQuery = {
  from: string;
  page?: number;
  pageSize?: number;
  serviceId?: number;
  technicianServiceId?: number;
  shopId?: number;
  technicianId?: number;
  to: string;
};

export type OrderListQuery = {
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

export type CreateBookingInput = {
  fulfillmentMode: FulfillmentMode;
  note?: string;
  orderType?: "booking" | "request";
  paymentMethod?: ManualPaymentMethod;
  scheduleSlotId: number;
} & ({ serviceId: number; technicianServiceId?: never } | { serviceId?: never; technicianServiceId: number });

export function isBookingApiId(value: string | number | null | undefined) {
  return typeof value === "number" ? Number.isInteger(value) && value > 0 : Boolean(value && /^[1-9]\d*$/.test(value));
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
    customerName: "NeeDo 用户",
    itemName: order.serviceName,
    storeName: order.shopName,
    technicianName: order.technicianName ?? undefined,
    city: "东京",
    area: order.shopName,
    amount: Number.parseFloat(order.priceAmount) || 0,
    paymentStatus:
      order.paymentStatus === "confirmed" || order.paymentStatus === "refundPending"
        ? "paid"
        : order.paymentStatus === "refunded"
          ? "refunded"
          : "unpaid",
    paymentMethod: order.paymentMethod === "onsite" ? "cash" : "offline",
    bookedAt: formatApiOrderDateTime(order.startsAt),
    createdAt: formatApiOrderDateTime(order.createdAt),
    source: "app",
    remark: order.note ?? undefined
  };
}

export const bookingApi = {
  listAvailability(query: AvailabilityQuery) {
    return httpClient.request<PaginatedBookingData<BookingScheduleSlot>>("/schedule/availability", {
      auth: false,
      query
    });
  },
  createBooking(input: CreateBookingInput) {
    return httpClient.request<BookingOrder>("/bookings", {
      body: {
        ...input,
        orderType: input.orderType ?? "booking",
        paymentMethod: input.paymentMethod ?? "onsite"
      }
    });
  },
  listOrders(query: OrderListQuery = {}) {
    return httpClient.request<PaginatedBookingData<BookingOrder>>("/orders", {
      query: {
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
  confirmOrder(id: number) {
    return httpClient.request<BookingOrder>(`/orders/${id}/confirm`, { method: "POST" });
  },
  cancelOrder(id: number, reason?: string) {
    return httpClient.request<BookingOrder>(`/orders/${id}/cancel`, {
      body: { reason },
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
