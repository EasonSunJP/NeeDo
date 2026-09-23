import express from "express";
import request from "supertest";
import { BookingController } from "../src/controllers/booking.controller";
import { ERROR_CODES } from "../src/constants/error-codes";
import { errorMiddleware } from "../src/middlewares/error.middleware";
import type { BookingOrderPayload, BookingRepositoryPort } from "../src/repositories/booking.repository";
import { BookingService } from "../src/services/booking.service";

const now = new Date("2026-09-20T10:00:00.000Z");
const confirmedOrder: BookingOrderPayload = {
  id: 24419,
  orderNo: "ND202609200104226906",
  orderType: "booking",
  status: "confirmed",
  paymentMethod: "onsite",
  paymentStatus: "pending",
  paymentAmountJpy: 12_000,
  amountSource: "order_payment",
  effectivePaymentMethod: "onsite",
  otherMethodCode: null,
  otherMethodLabel: null,
  checkoutPaymentAmountNdp: null,
  ndpCurrency: null,
  paymentConfirmedById: null,
  paymentConfirmedAt: null,
  paymentReference: null,
  paymentNote: null,
  paymentRefundedById: null,
  paymentRefundedAt: null,
  paymentRefundReference: null,
  paymentRefundReason: null,
  customerUserId: 9,
  serviceId: 201,
  technicianServiceId: null,
  shopId: 16,
  technicianProfileId: 31,
  scheduleSlotId: 49020,
  fulfillmentMode: "store",
  serviceName: "Confirmed service",
  pricingModeSnapshot: "merchant",
  serviceOwnerType: "shop",
  serviceOwnerId: 201,
  serviceNameSnapshot: "Confirmed service",
  servicePriceSnapshot: "12000.00",
  serviceDurationSnapshot: 60,
  serviceSnapshot: null,
  rebook: { action: "checkout", serviceType: "shop_service", serviceId: 201, shopId: 16, technicianProfileId: 31, fulfillmentMode: "store" },
  fulfillmentAddressSnapshot: null,
  shopName: "QA shop",
  technicianName: "QA technician",
  priceAmount: "12000.00",
  currency: "JPY",
  startsAt: now,
  endsAt: new Date(now.getTime() + 3_600_000),
  note: null,
  cancelReason: null,
  affiliate: null,
  createdAt: now,
  updatedAt: now,
  statusHistory: [],
  performanceAssessment: null,
  timelineEvents: []
};

function merchantApi(editMerchantOrder: jest.Mock) {
  const bookingRepository = { editMerchantOrder } as unknown as BookingRepositoryPort;
  const controller = new BookingController(new BookingService(bookingRepository));
  const app = express();
  app.use(express.json());
  app.use((_request, response, next) => {
    response.locals.auth = {
      userId: 1,
      roles: ["merchant_owner"],
      currentIdentityType: "merchant_owner",
      currentIdentityScopeType: "shop",
      currentIdentityScopeId: 16
    };
    next();
  });
  app.patch("/api/v1/orders/:id/merchant-edit", controller.editMerchantOrder);
  app.use(errorMiddleware);
  return app;
}

describe("merchant order edit API state boundary", () => {
  it("returns 40906 for a cancelled order without converting it to not-found", async () => {
    const editMerchantOrder = jest.fn(async () => ({ outcome: "invalid_state" as const }));
    const app = merchantApi(editMerchantOrder);

    await request(app)
      .patch("/api/v1/orders/24418/merchant-edit")
      .send({ priceAmountJpy: 13_000, paymentMethod: "onsite", note: "late edit" })
      .expect(409, {
        code: ERROR_CODES.ORDER_INVALID_TRANSITION,
        message: "error.order.invalid_transition",
        data: null
      });

    expect(editMerchantOrder).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 1,
      orderId: 24418,
      shopId: 16
    }));
  });

  it("preserves confirmed-order editing through the same API", async () => {
    const editMerchantOrder = jest.fn(async () => ({ outcome: "ok" as const, order: confirmedOrder }));
    const app = merchantApi(editMerchantOrder);

    await request(app)
      .patch("/api/v1/orders/24419/merchant-edit")
      .send({ note: "confirmed edit" })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: 0,
          message: "success",
          data: { id: 24419, status: "confirmed", note: null }
        });
      });
  });
});
