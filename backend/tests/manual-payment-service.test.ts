import { ERROR_CODES } from "../src/constants/error-codes";
import type {
  BookingOrderPayload,
  BookingRepositoryPort,
  ManualPaymentMutationResult
} from "../src/repositories/booking.repository";
import type { AuthRequestContext, AuthenticatedAccessContext } from "../src/services/auth.service";
import type { AuditLogService } from "../src/services/audit-log.service";
import { BookingService } from "../src/services/booking.service";

const now = new Date("2026-08-25T00:00:00.000Z");
const requestContext: AuthRequestContext = { ip: "127.0.0.1", userAgent: "jest" };

const merchantActor: AuthenticatedAccessContext = {
  userId: 20,
  email: "merchant@example.com",
  accessTokenJti: "merchant-jti",
  accessTokenExpiresAt: Math.floor(now.getTime() / 1000) + 900,
  roles: ["merchant_owner"],
  permissions: ["merchant-admin:order-payment:write"],
  currentIdentityId: 20,
  currentIdentityType: "merchant",
  currentIdentityScopeType: "shop",
  currentIdentityScopeId: 7
};

const backofficeActor: AuthenticatedAccessContext = {
  userId: 1,
  email: "operator@example.com",
  accessTokenJti: "operator-jti",
  accessTokenExpiresAt: Math.floor(now.getTime() / 1000) + 900,
  roles: ["operator"],
  permissions: ["backoffice:order-payment:write"],
  currentIdentityId: 1,
  currentIdentityType: "platform",
  currentIdentityScopeType: "global",
  currentIdentityScopeId: null
};

const order = (overrides: Partial<BookingOrderPayload> = {}): BookingOrderPayload => ({
  id: 91,
  orderNo: "ND202608250091",
  orderType: "booking",
  status: "confirmed",
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
  customerUserId: 9,
  serviceId: 2,
  technicianServiceId: null,
  shopId: 7,
  technicianProfileId: 4,
  scheduleSlotId: 12,
  fulfillmentMode: "store",
  serviceName: "Shiatsu Recovery",
  pricingModeSnapshot: "merchant",
  serviceOwnerType: "shop",
  serviceOwnerId: 2,
  serviceNameSnapshot: "Shiatsu Recovery",
  servicePriceSnapshot: "8800.00",
  serviceDurationSnapshot: 60,
  fulfillmentAddressSnapshot: null,
  serviceSnapshot: null,
  shopName: "Aoyama Care Studio",
  technicianName: "Mika Tanaka",
  priceAmount: "8800.00",
  currency: "JPY",
  startsAt: now,
  endsAt: new Date(now.getTime() + 60 * 60 * 1000),
  note: null,
  cancelReason: null,
  createdAt: now,
  updatedAt: now,
  statusHistory: [],
  performanceAssessment: null,
  timelineEvents: [],
  affiliate: null,
  ...overrides
});

const repository = (result: ManualPaymentMutationResult): jest.Mocked<BookingRepositoryPort> =>
  ({
    findOrderById: jest.fn(async () =>
      order({ status: "cancelled", paymentStatus: "refundPending" })
    ),
    confirmManualPayment: jest.fn(async () => result),
    refundManualPayment: jest.fn(async () => result)
  }) as unknown as jest.Mocked<BookingRepositoryPort>;

const auditLogService = (): jest.Mocked<Pick<AuditLogService, "record">> => ({
  record: jest.fn(async (input) => {
    void input;
  })
});

describe("BookingService manual payment", () => {
  it("confirms an onsite payment in the authenticated merchant shop scope", async () => {
    const confirmed = order({
      paymentStatus: "confirmed",
      paymentConfirmedById: merchantActor.userId,
      paymentConfirmedAt: now
    });
    const bookingRepository = repository({ outcome: "ok", order: confirmed, applied: true });
    const audit = auditLogService();
    const service = new BookingService(bookingRepository, undefined, undefined, audit);

    const result = await service.confirmManualPayment(
      merchantActor,
      91,
      { method: "onsite", amountJpy: 8800, reference: "POS-20260825", note: "现金收款" },
      requestContext
    );

    expect(result.paymentStatus).toBe("confirmed");
    expect(bookingRepository.confirmManualPayment).toHaveBeenCalledWith({
      orderId: 91,
      actorUserId: merchantActor.userId,
      scope: "merchant",
      shopId: 7,
      method: "onsite",
      amountJpy: 8800,
      reference: "POS-20260825",
      note: "现金收款"
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "merchant_admin.order_payment.confirm",
        targetType: "BookingOrder",
        targetId: 91
      })
    );
  });

  it("does not duplicate the audit event when an identical confirmation is retried", async () => {
    const confirmed = order({ paymentStatus: "confirmed" });
    const bookingRepository = repository({ outcome: "ok", order: confirmed, applied: false });
    const audit = auditLogService();
    const service = new BookingService(bookingRepository, undefined, undefined, audit);

    await service.confirmManualPayment(
      backofficeActor,
      91,
      { method: "bank_transfer", amountJpy: 8800, reference: "BANK-001" },
      requestContext
    );

    expect(audit.record).not.toHaveBeenCalled();
  });

  it.each([
    ["not_found", ERROR_CODES.NOT_FOUND, "error.order.not_found"],
    ["invalid_state", ERROR_CODES.PAYMENT_INVALID_STATE, "error.payment.invalid_state"],
    ["amount_mismatch", ERROR_CODES.PAYMENT_AMOUNT_MISMATCH, "error.payment.amount_mismatch"],
    ["conflict", ERROR_CODES.PAYMENT_CONFLICT, "error.payment.conflict"]
  ] as const)("maps %s repository outcomes to stable errors", async (outcome, code, message) => {
    const service = new BookingService(
      repository({ outcome }),
      undefined,
      undefined,
      auditLogService()
    );

    await expect(
      service.confirmManualPayment(
        merchantActor,
        91,
        { method: "onsite", amountJpy: 8800 },
        requestContext
      )
    ).rejects.toMatchObject({ code, message });
  });

  it("marks a cancelled paid order refunded through the backoffice scope", async () => {
    const refunded = order({ status: "cancelled", paymentStatus: "refunded" });
    const bookingRepository = repository({ outcome: "ok", order: refunded, applied: true });
    const audit = auditLogService();
    const service = new BookingService(bookingRepository, undefined, undefined, audit);

    const result = await service.refundManualPayment(
      backofficeActor,
      91,
      { reason: "客户退款", reference: "REF-001" },
      requestContext
    );

    expect(result.paymentStatus).toBe("refunded");
    expect(bookingRepository.refundManualPayment).toHaveBeenCalledWith({
      orderId: 91,
      actorUserId: backofficeActor.userId,
      scope: "backoffice",
      reason: "客户退款",
      reference: "REF-001"
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "backoffice.order_payment.refund" })
    );
  });

  it("maps a direct-refund compare-and-swap conflict without writing an audit", async () => {
    const bookingRepository = repository({ outcome: "conflict" });
    const audit = auditLogService();
    const service = new BookingService(bookingRepository, undefined, undefined, audit);

    await expect(
      service.refundManualPayment(
        backofficeActor,
        91,
        { reason: "cancelled before completion", reference: "REF-CAS-CONFLICT" },
        requestContext
      )
    ).rejects.toMatchObject({
      code: ERROR_CODES.PAYMENT_CONFLICT,
      message: "error.payment.conflict",
      statusCode: 409
    });

    expect(bookingRepository.refundManualPayment).toHaveBeenCalledTimes(1);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it.each([
    ["merchant-admin", merchantActor],
    ["backoffice", backofficeActor]
  ] as const)(
    "rejects a completed confirmed payment before the %s direct-refund repository mutation",
    async (_portal, actor) => {
      const completed = order({ status: "completed", paymentStatus: "confirmed" });
      const bookingRepository = repository({ outcome: "ok", order: completed, applied: true });
      bookingRepository.findOrderById.mockResolvedValue(completed);
      const audit = auditLogService();
      const service = new BookingService(bookingRepository, undefined, undefined, audit);

      await expect(
        service.refundManualPayment(
          actor,
          91,
          { reason: "must use the completed-order refund case", reference: "REF-BYPASS" },
          requestContext
        )
      ).rejects.toMatchObject({
        code: ERROR_CODES.PAYMENT_INVALID_STATE,
        message: "error.payment.invalid_state",
        statusCode: 409
      });

      expect(bookingRepository.refundManualPayment).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    }
  );

  it("rejects payment mutations from customer identities", async () => {
    const customerActor: AuthenticatedAccessContext = {
      ...merchantActor,
      userId: 9,
      roles: ["customer"],
      currentIdentityType: "customer",
      currentIdentityScopeType: "customer_profile",
      currentIdentityScopeId: 9
    };
    const bookingRepository = repository({ outcome: "ok", order: order(), applied: true });
    const service = new BookingService(bookingRepository, undefined, undefined, auditLogService());

    await expect(
      service.confirmManualPayment(
        customerActor,
        91,
        { method: "onsite", amountJpy: 8800 },
        requestContext
      )
    ).rejects.toMatchObject({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.identity.forbidden"
    });
    expect(bookingRepository.confirmManualPayment).not.toHaveBeenCalled();
  });

  it("publishes manual confirmation and refund only for applied mutations", async () => {
    const confirmed = order({ paymentStatus: "confirmed" });
    const refunded = order({ status: "cancelled", paymentStatus: "refunded" });
    const bookingRepository = repository({ outcome: "ok", order: confirmed, applied: true });
    bookingRepository.confirmManualPayment
      .mockResolvedValueOnce({ outcome: "ok", order: confirmed, applied: true })
      .mockResolvedValueOnce({ outcome: "ok", order: confirmed, applied: false });
    bookingRepository.refundManualPayment
      .mockResolvedValueOnce({ outcome: "ok", order: refunded, applied: true })
      .mockResolvedValueOnce({ outcome: "ok", order: refunded, applied: false });
    bookingRepository.findLiveDashboardOrderEvents = jest.fn(async () => [
      {
        orderId: 91,
        scope: { countryCode: "JP" as const, admin1Code: "13", admin2Code: "13104" },
        orderNo: confirmed.orderNo,
        status: confirmed.status,
        serviceName: confirmed.serviceName,
        amountJpy: 8_800
      }
    ]);
    const publisher = { publish: jest.fn(async () => null) };
    const service = new BookingService(
      bookingRepository,
      undefined,
      undefined,
      auditLogService(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      publisher
    );

    await service.confirmManualPayment(
      backofficeActor,
      91,
      { method: "bank_transfer", amountJpy: 8_800, reference: "BANK-LIVE-1" },
      requestContext
    );
    await service.confirmManualPayment(
      backofficeActor,
      91,
      { method: "bank_transfer", amountJpy: 8_800, reference: "BANK-LIVE-1" },
      requestContext
    );
    await service.refundManualPayment(
      backofficeActor,
      91,
      { reason: "refund", reference: "REF-LIVE-1" },
      requestContext
    );
    await service.refundManualPayment(
      backofficeActor,
      91,
      { reason: "refund", reference: "REF-LIVE-1" },
      requestContext
    );

    expect(bookingRepository.findLiveDashboardOrderEvents).toHaveBeenCalledTimes(2);
    expect(bookingRepository.findLiveDashboardOrderEvents).toHaveBeenCalledWith([91]);
    expect(publisher.publish).toHaveBeenCalledTimes(4);
  });
});
