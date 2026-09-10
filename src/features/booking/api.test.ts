import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAuthTokens } from "../../api/httpClient";
import { bookingApi, createBookingIdempotencyKey, mapBookingOrderToDomainOrder, type BookingOrder } from "./api";

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

function requestBodyAt(index: number) {
  const [, init] = vi.mocked(fetch).mock.calls[index] ?? [];
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
      expectedPriceAmountJpy: 8800,
      fulfillmentMode: "store",
      scheduleSlotId: 33,
      serviceId: 12
    });

    expect(fetch).toHaveBeenCalledWith("/api/v1/bookings", expect.objectContaining({ method: "POST" }));
    expect(lastRequestBody()).toEqual({
      expectedPriceAmountJpy: 8800,
      fulfillmentMode: "store",
      orderType: "booking",
      paymentMethod: "onsite",
      scheduleSlotId: 33,
      serviceId: 12
    });
  });

  it("creates a technician manual booking with its explicit customer, time range, and idempotency", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(createBookingResponse("booking")));

    await bookingApi.createTechnicianManualBooking({
      customerIdentityId: 71,
      expectedPriceAmountJpy: 10_000,
      technicianServiceId: 102,
      startsAt: "2026-09-10T01:00:00.000Z",
      endsAt: "2026-09-10T02:00:00.000Z",
      paymentMethod: "onsite",
      note: "技师人工添加"
    }, "manual-booking-0000000001");

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/technician/manual-bookings",
      expect.objectContaining({
        headers: expect.objectContaining({ "Idempotency-Key": "manual-booking-0000000001" }),
        method: "POST"
      })
    );
    expect(lastRequestBody()).toEqual({
      customerIdentityId: 71,
      expectedPriceAmountJpy: 10_000,
      technicianServiceId: 102,
      startsAt: "2026-09-10T01:00:00.000Z",
      endsAt: "2026-09-10T02:00:00.000Z",
      paymentMethod: "onsite",
      note: "技师人工添加"
    });
  });

  it("loads the authenticated technician-service booking context", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      code: 0,
      message: "success",
      data: { target: { type: "technician_service", id: 51 } }
    }));

    await bookingApi.getTechnicianServiceBookingContext(51);

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/technician-services/51/booking-context",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("submits Intelligence source evidence, displayed price confirmation, and idempotency", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(createBookingResponse("booking")));

    await bookingApi.createBooking({
      exchangeIntelligencePostId: 61,
      expectedPriceAmountJpy: 8800,
      fulfillmentMode: "store",
      scheduleSlotId: 33,
      serviceId: 12
    }, "123e4567-e89b-42d3-a456-426614174000");

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(lastRequestBody()).toEqual({
      exchangeIntelligencePostId: 61,
      expectedPriceAmountJpy: 8800,
      fulfillmentMode: "store",
      orderType: "booking",
      paymentMethod: "onsite",
      scheduleSlotId: 33,
      serviceId: 12
    });
    expect(lastRequestBody()).not.toHaveProperty("priceAmount");
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe("123e4567-e89b-42d3-a456-426614174000");
  });

  it("loads official Japanese administrative children and submits home region codes", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        message: "success",
        data: {
          list: [{ code: "13", name: "東京都", level: "admin1", parentCode: null, centroid: null }]
        }
      }))
      .mockResolvedValueOnce(jsonResponse(createBookingResponse("booking")));

    await bookingApi.listAdministrativeRegions({ country: "JP", locale: "ja", parent: "13" });
    await bookingApi.createBooking({
      expectedPriceAmountJpy: 8800,
      fulfillmentMode: "home",
      scheduleSlotId: 33,
      serviceId: 12,
      serviceLocation: { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
      fulfillmentAddress: { countryCode: "JP", postalCode: "160-0022", prefecture: "東京都", city: "新宿区", addressLine1: "新宿1-1-1" },
      travelEstimatePublicId: "00000000-0000-4000-8000-000000000001"
    });

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/v1/reference/administrative-regions?country=JP&locale=ja&parent=13",
      expect.objectContaining({ method: "GET" })
    );
    expect(requestBodyAt(1)).toEqual({
      expectedPriceAmountJpy: 8800,
      fulfillmentMode: "home",
      orderType: "booking",
      paymentMethod: "onsite",
      scheduleSlotId: 33,
      serviceId: 12,
      serviceLocation: { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
      fulfillmentAddress: { countryCode: "JP", postalCode: "160-0022", prefecture: "東京都", city: "新宿区", addressLine1: "新宿1-1-1" },
      travelEstimatePublicId: "00000000-0000-4000-8000-000000000001"
    });
  });

  it("generates distinct opaque idempotency keys within the formal contract bounds", () => {
    const first = createBookingIdempotencyKey();
    const second = createBookingIdempotencyKey();

    expect(first).toMatch(/^[a-f0-9]{32}$/);
    expect(second).toMatch(/^[a-f0-9]{32}$/);
    expect(first).not.toBe(second);
  });

  it("sends an explicit insufficient-balance confirmation when accepting an order", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(createBookingResponse("booking")));
    const previewVersion = `sha256:${"b".repeat(64)}`;

    await bookingApi.confirmOrder(88, {
      insufficientBalanceConfirmation: {
        confirmed: true,
        idempotencyKey: "accept-overdraft-0001",
        previewVersion
      }
    });

    expect(fetch).toHaveBeenCalledWith("/api/v1/orders/88/confirm", expect.objectContaining({ method: "POST" }));
    expect(lastRequestBody()).toEqual({
      insufficientBalanceConfirmation: {
        confirmed: true,
        idempotencyKey: "accept-overdraft-0001",
        previewVersion
      }
    });
  });

  it("passes request order creation through to the formal bookings API", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(createBookingResponse("request")));

    await bookingApi.createBooking({
      expectedPriceAmountJpy: 8800,
      fulfillmentMode: "store",
      orderType: "request",
      scheduleSlotId: 33,
      serviceId: 12
    });

    expect(fetch).toHaveBeenCalledWith("/api/v1/bookings", expect.objectContaining({ method: "POST" }));
    expect(lastRequestBody()).toEqual({
      expectedPriceAmountJpy: 8800,
      fulfillmentMode: "store",
      orderType: "request",
      paymentMethod: "onsite",
      scheduleSlotId: 33,
      serviceId: 12
    });
  });

  it("serializes the bounded customer order window", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      code: 0,
      message: "success",
      data: { list: [], total: 0, page: 1, page_size: 100 }
    }));

    await bookingApi.listOrders({
      from: "2026-08-31T15:00:00.000Z",
      to: "2026-10-01T15:00:00.000Z",
      page: 1,
      pageSize: 100
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/orders?from=2026-08-31T15%3A00%3A00.000Z&page=1&pageSize=100&to=2026-10-01T15%3A00%3A00.000Z",
      expect.anything()
    );
  });

  it("serializes the opt-in unavailable-slot query", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      code: 0,
      message: "success",
      data: { list: [], total: 0, page: 1, page_size: 100 }
    }));

    await bookingApi.listAvailability({
      serviceId: 12,
      includeUnavailable: true,
      from: "2026-09-02T15:00:00.000Z",
      to: "2026-09-03T15:00:00.000Z",
      page: 1,
      pageSize: 100
    });

    const [requestUrl, requestInit] = vi.mocked(fetch).mock.calls[0]!;
    const parsedUrl = new URL(String(requestUrl), "http://needo.test");
    expect(parsedUrl.pathname).toBe("/api/v1/schedule/availability");
    expect(Object.fromEntries(parsedUrl.searchParams.entries())).toEqual({
      serviceId: "12",
      includeUnavailable: "true",
      from: "2026-09-02T15:00:00.000Z",
      to: "2026-09-03T15:00:00.000Z",
      page: "1",
      pageSize: "100"
    });
    expect(requestInit).toEqual(expect.objectContaining({ method: "GET" }));
  });

  it("serializes overlapping order windows for the merchant calendar", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ code: 0, message: "success", data: { list: [], total: 0, page: 1, page_size: 100 } }));
    await bookingApi.listOrders({ from: "2026-09-06T15:00:00.000Z", to: "2026-09-07T15:00:00.000Z", dateMode: "overlaps" });
    expect(String(vi.mocked(fetch).mock.calls.at(-1)?.[0])).toContain("dateMode=overlaps");
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

  it("reads and submits the current participant's formal review without fake counts", async () => {
    const review = { targetType: "technician", rating: 5, tags: ["服务精神"], comment: "很好", createdAt: "2026-09-01T12:00:00.000Z" };
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ code: 0, message: "success", data: { review: null } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, message: "success", data: { applied: true, review } }));

    await bookingApi.getOwnReview(88);
    await bookingApi.createReview(88, {
      targetType: "technician",
      rating: 5,
      tags: ["服务精神"],
      comment: "很好",
      idempotencyKey: "review-browser-key-0001"
    });

    expect(fetch).toHaveBeenNthCalledWith(1, "/api/v1/orders/88/reviews/mine", expect.objectContaining({ method: "GET" }));
    expect(fetch).toHaveBeenNthCalledWith(2, "/api/v1/orders/88/reviews", expect.objectContaining({ method: "POST" }));
    expect(requestBodyAt(1)).toEqual({ targetType: "technician", rating: 5, tags: ["服务精神"], comment: "很好", idempotencyKey: "review-browser-key-0001" });
    expect(requestBodyAt(1)).not.toHaveProperty("tagCounts");
  });

  it("persists participant order tracking comments through the formal order API", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(createBookingResponse("booking"), 201));

    await bookingApi.createTimelineComment(88, { body: "请提前五分钟联系" });

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/orders/88/timeline/comments",
      expect.objectContaining({ method: "POST" })
    );
    expect(lastRequestBody()).toEqual({ body: "请提前五分钟联系" });
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

  it("preserves the formal customer display name with a safe fallback", () => {
    const formalOrder = createBookingResponse("booking").data;
    const customer = {
      userId: formalOrder.customerUserId,
      profileId: 17,
      publicId: "u0000000005",
      displayName: "山田 花子",
      avatarUrl: null,
      membershipLevel: "regular",
      ratingAverage: "4.90",
      reviewCount: 12
    };

    expect(mapBookingOrderToDomainOrder({ ...formalOrder, customer }).customerName).toBe("山田 花子");
    expect(mapBookingOrderToDomainOrder({
      ...formalOrder,
      customer: { ...customer, displayName: "   " }
    }).customerName).toBe("NeeDo 用户");
    expect(mapBookingOrderToDomainOrder({ ...formalOrder, customer: undefined }).customerName).toBe("NeeDo 用户");
  });

  it.each(["awaitingCheckout", "awaitingPaymentConfirmation"] as const)("preserves the formal %s status for list and calendar projections", (status) => {
    const apiOrder = { ...createBookingResponse("booking").data, status };

    expect(mapBookingOrderToDomainOrder(apiOrder).status).toBe(status);
  });

  it("calls every formal fulfillment and checkout route with its strict body", async () => {
    const orderEnvelope = createBookingResponse("booking");
    const checkoutEnvelope = {
      code: 0,
      message: "success",
      data: {
        id: 91,
        orderId: 88,
        status: "pending",
        baseAmountJpy: 8800,
        addOnAmountJpy: 1200,
        travelFareAmountJpy: 0,
        discountAmountJpy: 0,
        checkoutAmountJpy: 10000,
        payableNdp: 10000,
        availablePaymentMethods: ["cash", "ndp"],
        rate: {
          ruleId: 7,
          publicId: "rate-7",
          version: 3,
          ndpUnits: 1,
          jpyUnits: 1,
          effectiveFrom: "2026-09-01T00:00:00.000Z"
        },
        calculation: {
          formula: "base_plus_accepted_add_ons_plus_travel_fare_minus_discount",
          baseAmountJpy: 8800,
          acceptedAddOnIds: [301],
          addOnAmountJpy: 1200,
          travelFareAmountJpy: 0,
          discountAmountJpy: 0,
          checkoutAmountJpy: 10000,
          rateFormula: "ceil(jpy_times_ndp_units_divided_by_jpy_units)"
        },
        paymentMethod: null,
        paymentSelectedAt: null,
        otherMethod: null,
        paymentEvidence: null,
        receiptConfirmedAt: null,
        receiptConfirmationReason: null,
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z"
      }
    };

    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(orderEnvelope))
      .mockResolvedValueOnce(jsonResponse(orderEnvelope))
      .mockResolvedValueOnce(jsonResponse(orderEnvelope))
      .mockResolvedValueOnce(jsonResponse(orderEnvelope))
      .mockResolvedValueOnce(jsonResponse(orderEnvelope))
      .mockResolvedValueOnce(jsonResponse(checkoutEnvelope))
      .mockResolvedValueOnce(jsonResponse(checkoutEnvelope))
      .mockResolvedValueOnce(jsonResponse(orderEnvelope))
      .mockResolvedValueOnce(jsonResponse(orderEnvelope));

    await bookingApi.startService(88, { actor: "technician", verificationCode: "482931", idempotencyKey: "idem-start-0000001" });
    await bookingApi.createAddOn(88, { serviceId: 45, idempotencyKey: "idem-addon-0000001" });
    await bookingApi.acceptAddOn(88, 301, { idempotencyKey: "idem-accept-000001" });
    await bookingApi.rejectAddOn(88, 302, { idempotencyKey: "idem-reject-000001" });
    await bookingApi.endService(88, { reason: "客户确认提前结束服务", idempotencyKey: "idem-ending-000001" });
    await bookingApi.getCheckout(88);
    await bookingApi.selectPaymentMethod(88, { method: "cash", idempotencyKey: "idem-method-000001" });
    await bookingApi.payWithNdp(88, { idempotencyKey: "idem-ndp-pay-00001" });
    await bookingApi.confirmReceipt(88, { reason: "已当面确认收到现金", idempotencyKey: "idem-receipt-000001" });

    expect(vi.mocked(fetch).mock.calls.map(([url, init]) => [url, (init as RequestInit).method])).toEqual([
      ["/api/v1/orders/88/service/start", "POST"],
      ["/api/v1/orders/88/add-ons", "POST"],
      ["/api/v1/orders/88/add-ons/301/accept", "POST"],
      ["/api/v1/orders/88/add-ons/302/reject", "POST"],
      ["/api/v1/orders/88/service/end", "POST"],
      ["/api/v1/orders/88/checkout", "GET"],
      ["/api/v1/orders/88/checkout/payment-method", "POST"],
      ["/api/v1/orders/88/checkout/pay/ndp", "POST"],
      ["/api/v1/orders/88/checkout/confirm-receipt", "POST"]
    ]);
    expect(requestBodyAt(0)).toEqual({ actor: "technician", verificationCode: "482931", idempotencyKey: "idem-start-0000001" });
    expect(requestBodyAt(1)).toEqual({ serviceId: 45, idempotencyKey: "idem-addon-0000001" });
    expect(requestBodyAt(2)).toEqual({ idempotencyKey: "idem-accept-000001" });
    expect(requestBodyAt(3)).toEqual({ idempotencyKey: "idem-reject-000001" });
    expect(requestBodyAt(4)).toEqual({ reason: "客户确认提前结束服务", idempotencyKey: "idem-ending-000001" });
    expect(requestBodyAt(5)).toEqual({});
    expect(requestBodyAt(6)).toEqual({ method: "cash", idempotencyKey: "idem-method-000001" });
    expect(requestBodyAt(7)).toEqual({ idempotencyKey: "idem-ndp-pay-00001" });
    expect(requestBodyAt(8)).toEqual({ reason: "已当面确认收到现金", idempotencyKey: "idem-receipt-000001" });
  });
});
