import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAuthTokens } from "../../api/httpClient";
import { bookingApi } from "./api";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status
  });
}

function createBookingResponse(orderType: "booking" | "request") {
  return {
    code: 0,
    message: "success",
    data: {
      id: 88,
      orderNo: "ND202606040001",
      orderType,
      status: "pending",
      paymentStatus: "unpaid",
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
      scheduleSlotId: 33,
      serviceId: 12
    });
  });
});
