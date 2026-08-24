import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAuthTokens } from "../../api/httpClient";
import { bookingApi, mapBookingOrderToDomainOrder, type BookingOrder } from "./api";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status
  });
}

function createBookingResponse(orderType: "booking" | "request"): {
  code: number;
  message: string;
  data: BookingOrder;
} {
  return {
    code: 0,
    message: "success",
    data: {
      id: 88,
      orderNo: "ND202606040001",
      orderType,
      status: "pending",
      paymentMethod: "onsite",
      paymentStatus: "pending",
      paymentAmountJpy: 8800,
      paymentConfirmedById: null,
      paymentConfirmedAt: null,
      paymentReference: null,
      paymentNote: null,
      paymentRefundedById: null,
      paymentRefundedAt: null,
      paymentRefundReference: null,
      paymentRefundReason: null,
      customerUserId: 5,
      serviceId: 12,
      technicianServiceId: null,
      shopId: 7,
      technicianProfileId: 9,
      scheduleSlotId: 33,
      fulfillmentMode: "store",
      serviceName: "Shiatsu Recovery",
      shopName: "GINZA Calm Body Lab",
      technicianName: "佐藤 美咲",
      priceAmount: "8800.00",
      currency: "JPY",
      startsAt: "2026-06-04T01:00:00.000Z",
      endsAt: "2026-06-04T02:00:00.000Z",
      note: null,
      cancelReason: null,
      createdAt: "2026-06-04T00:00:00.000Z",
      updatedAt: "2026-06-04T00:00:00.000Z",
      statusHistory: []
    }
  };
}

function lastRequestBody() {
  const [, init] = vi.mocked(fetch).mock.lastCall ?? [];
  return JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}")) as Record<string, unknown>;
}

describe("bookingApi", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    clearAuthTokens();
  });

  afterEach(() => {
    clearAuthTokens();
    vi.unstubAllGlobals();
  });

  it("keeps normal booking creation on the booking order type by default", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(createBookingResponse("booking")));

    await bookingApi.createBooking({
      fulfillmentMode: "store",
      scheduleSlotId: 33,
      serviceId: 12
    });

    expect(fetch).toHaveBeenCalledWith("/api/v1/bookings", expect.objectContaining({ method: "POST" }));
    expect(lastRequestBody()).toEqual({
      fulfillmentMode: "store",
      orderType: "booking",
      paymentMethod: "onsite",
      scheduleSlotId: 33,
      serviceId: 12
    });
  });

  it("passes request order creation through to the formal bookings API", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(createBookingResponse("request")));

    await bookingApi.createBooking({
      fulfillmentMode: "store",
      orderType: "request",
      scheduleSlotId: 33,
      serviceId: 12
    });

    expect(fetch).toHaveBeenCalledWith("/api/v1/bookings", expect.objectContaining({ method: "POST" }));
    expect(lastRequestBody()).toEqual({
      fulfillmentMode: "store",
      orderType: "request",
      paymentMethod: "onsite",
      scheduleSlotId: 33,
      serviceId: 12
    });
  });

  it("calls the scoped manual-payment confirmation and refund endpoints", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(createBookingResponse("booking")))
      .mockResolvedValueOnce(jsonResponse(createBookingResponse("booking")));

    await bookingApi.confirmManualPayment("merchant-admin", 88, {
      method: "bank_transfer",
      amountJpy: 8800,
      reference: "BANK-001"
    });
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/v1/merchant-admin/orders/88/payment/confirm",
      expect.objectContaining({ method: "POST" })
    );
    expect(lastRequestBody()).toEqual({
      amountJpy: 8800,
      method: "bank_transfer",
      reference: "BANK-001"
    });

    await bookingApi.refundManualPayment("backoffice", 88, {
      reason: "客户退款",
      reference: "REF-001"
    });
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/backoffice/orders/88/payment/refund",
      expect.objectContaining({ method: "POST" })
    );
    expect(lastRequestBody()).toEqual({ reason: "客户退款", reference: "REF-001" });
  });

  it("calls the authenticated merchant schedule-slot CRUD endpoints", async () => {
    const slot = {
      id: 33,
      serviceId: 12,
      technicianServiceId: null,
      shopId: 7,
      technicianProfileId: 9,
      startsAt: "2026-08-26T01:00:00.000Z",
      endsAt: "2026-08-26T02:00:00.000Z",
      capacity: 1,
      bookedCount: 0,
      status: "available" as const,
      serviceName: "Shiatsu Recovery",
      shopName: "GINZA Calm Body Lab",
      technicianName: "佐藤 美咲",
      priceAmount: "8800.00",
      currency: "JPY",
      durationMinutes: 60
    };
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ code: 0, message: "success", data: { list: [slot], total: 1, page: 1, page_size: 20 } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, message: "success", data: slot }, 201))
      .mockResolvedValueOnce(jsonResponse({ code: 0, message: "success", data: { ...slot, status: "blocked" } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, message: "success", data: slot }));

    await bookingApi.listManagedScheduleSlots("merchant-admin", {
      from: "2026-08-25T00:00:00.000Z",
      page: 1,
      pageSize: 20,
      to: "2026-09-25T00:00:00.000Z"
    });
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/v1/merchant-admin/schedule/slots?from=2026-08-25T00%3A00%3A00.000Z&page=1&pageSize=20&to=2026-09-25T00%3A00%3A00.000Z",
      expect.objectContaining({ method: "GET" })
    );

    await bookingApi.createManagedScheduleSlot("merchant-admin", {
      serviceId: 12,
      technicianProfileId: 9,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      capacity: 1
    });
    expect(fetch).toHaveBeenNthCalledWith(2, "/api/v1/merchant-admin/schedule/slots", expect.objectContaining({ method: "POST" }));

    await bookingApi.updateManagedScheduleSlot("merchant-admin", 33, { status: "blocked" });
    expect(fetch).toHaveBeenNthCalledWith(3, "/api/v1/merchant-admin/schedule/slots/33", expect.objectContaining({ method: "PATCH" }));

    await bookingApi.deleteManagedScheduleSlot("merchant-admin", 33);
    expect(fetch).toHaveBeenNthCalledWith(4, "/api/v1/merchant-admin/schedule/slots/33", expect.objectContaining({ method: "DELETE" }));
  });

  it("preserves formal entity IDs when mapping an API order for navigation", () => {
    const order = mapBookingOrderToDomainOrder(createBookingResponse("booking").data);

    expect(order).toMatchObject({
      serviceId: "12",
      shopId: "7",
      technicianProfileId: "9",
      scheduleSlotId: "33"
    });
  });
});
