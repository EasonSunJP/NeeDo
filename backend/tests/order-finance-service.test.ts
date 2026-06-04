import { ERROR_CODES } from "../src/constants/error-codes";
import {
  OrderFinanceService,
  type OrderFinanceRepositoryPort,
  type OrderFinanceRecord
} from "../src/services/order-finance.service";

const now = new Date("2026-06-03T12:00:00.000Z");
const context = { ip: "127.0.0.1", userAgent: "jest" };

const merchantActor = {
  userId: 7,
  email: "merchant@example.com",
  accessTokenJti: "jti",
  accessTokenExpiresAt: Date.now() + 60_000,
  currentIdentityScopeType: "shop",
  currentIdentityScopeId: 11,
  roles: ["merchant_owner"],
  permissions: ["merchant-admin:finance-order:read"]
};

const otherShopActor = {
  ...merchantActor,
  currentIdentityScopeId: 12
};

const orderFinanceRecord: OrderFinanceRecord = {
  bookingOrderId: 101,
  orderType: "booking",
  orderNo: "BK-20260603-0001",
  orderStatus: "COMPLETED",
  customerUserId: 4,
  shopId: 11,
  shopName: "GINZA Calm Body Lab",
  technicianProfileId: 21,
  technicianName: "Misaki",
  serviceName: "Aroma Treatment",
  priceAmountJpy: 8800,
  startsAt: "2026-06-03T10:00:00.000Z",
  endsAt: "2026-06-03T11:00:00.000Z",
  financial: {
    id: 301,
    serviceAmountJpy: 8800,
    platformCollectedServiceAmountJpy: 0,
    offlineReportedServiceAmountJpy: 0,
    unknownOrUnreportedServiceAmountJpy: 8800,
    paymentChannel: "unknown",
    serviceIncomeStatus: "unreported",
    bPlatformFeeHoldNdp: 500,
    bPlatformFeeActualNdp: 500,
    cRequestFeeHoldNdp: 0,
    cRequestFeeActualNdp: 0,
    userRewardNdp: 100,
    campaignDiscountNdp: 0,
    releasedNdp: 0,
    penaltyNdp: 0,
    compensationToUserNdp: 0,
    appliedFeeRuleIds: ["booking-default"],
    moneyTimeline: [],
    serviceIncomeReportedById: null,
    serviceIncomeReportedAt: null,
    serviceIncomeConfirmedById: null,
    serviceIncomeConfirmedAt: null,
    serviceIncomeNote: null,
    serviceIncomeProofUrl: null,
    settlementStatus: "pending",
    createdAt: "2026-06-03T11:05:00.000Z",
    updatedAt: "2026-06-03T11:05:00.000Z"
  },
  activeCompensationRule: {
    id: 1,
    sourceType: "shop_default",
    shopId: 11,
    technicianProfileId: null,
    name: "Default shop rules",
    wageMode: "base_plus_commission",
    baseSalaryJpy: 0,
    hourlyRateJpy: 0,
    dailyRateJpy: 0,
    fixedOrderPayJpy: 1000,
    commissionRatePercent: 50,
    guaranteedMinimumJpy: 0,
    ndpFeeBearer: "split",
    technicianNdpSharePercent: 30,
    bonusRules: [],
    deductionRules: []
  },
  createdAt: "2026-06-03T09:50:00.000Z",
  updatedAt: "2026-06-03T11:05:00.000Z"
};

const createRepository = (): jest.Mocked<OrderFinanceRepositoryPort> =>
  ({
    findOrderFinance: jest.fn(async () => orderFinanceRecord),
    upsertServiceIncomeReport: jest.fn(async (input) => ({
      ...orderFinanceRecord,
      financial: {
        ...orderFinanceRecord.financial!,
        serviceAmountJpy: input.serviceAmountJpy,
        platformCollectedServiceAmountJpy: input.platformCollectedServiceAmountJpy,
        offlineReportedServiceAmountJpy: input.offlineReportedServiceAmountJpy,
        unknownOrUnreportedServiceAmountJpy: input.unknownOrUnreportedServiceAmountJpy,
        paymentChannel: input.paymentChannel,
        serviceIncomeStatus: input.serviceIncomeStatus,
        serviceIncomeReportedById: input.reportedById,
        serviceIncomeReportedAt: now.toISOString(),
        serviceIncomeConfirmedById: input.confirmedById,
        serviceIncomeConfirmedAt: input.confirmedById ? now.toISOString() : null,
        serviceIncomeNote: input.note,
        serviceIncomeProofUrl: input.proofUrl,
        moneyTimeline: input.moneyTimeline
      }
    }))
  }) as unknown as jest.Mocked<OrderFinanceRepositoryPort>;

describe("OrderFinanceService", () => {
  it("returns order money timeline and estimated technician income from the active compensation rule", async () => {
    const service = new OrderFinanceService(createRepository(), { record: jest.fn() });

    const detail = await service.getMerchantOrderFinance(merchantActor, context, 101);

    expect(detail).toMatchObject({
      bookingOrderId: 101,
      orderNo: "BK-20260603-0001",
      shopId: 11,
      serviceIncomeStatus: "unreported",
      paymentChannel: "unknown",
      estimatedServiceGmvJpy: 8800,
      unknownOrUnreportedServiceAmountJpy: 8800,
      platformNdpRevenue: 400,
      technicianIncomePreview: {
        technicianGrossIncomeJpy: 5400,
        technicianNdpShareNdp: 150,
        technicianNetIncomeJpy: 5250,
        shopEstimatedGrossProfitJpy: 3050
      }
    });
    expect(detail.moneyTimeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "order_created", status: "completed" }),
        expect.objectContaining({ type: "platform_fee_captured", amountNdp: 500 }),
        expect.objectContaining({ type: "user_reward_granted", amountNdp: 100 }),
        expect.objectContaining({ type: "service_income_unreported", amountJpy: 8800 }),
        expect.objectContaining({ type: "technician_income_estimated", amountJpy: 5250 })
      ])
    );
  });

  it("includes Request fee hold and capture in the money timeline and platform revenue", async () => {
    const repository = createRepository();
    repository.findOrderFinance.mockResolvedValueOnce({
      ...orderFinanceRecord,
      orderType: "request",
      orderNo: "RQ-20260603-0001",
      financial: {
        ...orderFinanceRecord.financial!,
        bPlatformFeeHoldNdp: 500,
        bPlatformFeeActualNdp: 500,
        cRequestFeeHoldNdp: 300,
        cRequestFeeActualNdp: 300,
        userRewardNdp: 100
      }
    } as OrderFinanceRecord);
    const service = new OrderFinanceService(repository, { record: jest.fn() });

    const detail = await service.getMerchantOrderFinance(merchantActor, context, 101);

    expect(detail).toMatchObject({
      orderType: "request",
      cRequestFeeHoldNdp: 300,
      cRequestFeeActualNdp: 300,
      requestFeeNdpRevenue: 300,
      platformNdpRevenue: 700,
      pendingHoldNdp: 0
    });
    expect(detail.moneyTimeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "request_fee_hold",
          amountNdp: 300,
          status: "captured"
        }),
        expect.objectContaining({
          type: "request_fee_captured",
          amountNdp: 300,
          status: "captured"
        })
      ])
    );
  });

  it("updates service income report, confirms it when requested, and records an audit log", async () => {
    const repository = createRepository();
    const auditLogService = { record: jest.fn(async () => undefined) };
    const service = new OrderFinanceService(repository, auditLogService);

    const detail = await service.reportMerchantServiceIncome(merchantActor, context, 101, {
      serviceAmountJpy: 8800,
      platformCollectedServiceAmountJpy: 0,
      offlineReportedServiceAmountJpy: 8800,
      paymentChannel: "offline_cash",
      confirmNow: true,
      note: "店铺现金收款，收银台已确认",
      proofUrl: "https://example.test/proof/BK-20260603-0001"
    });

    expect(repository.upsertServiceIncomeReport).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingOrderId: 101,
        serviceAmountJpy: 8800,
        offlineReportedServiceAmountJpy: 8800,
        unknownOrUnreportedServiceAmountJpy: 0,
        paymentChannel: "offline_cash",
        serviceIncomeStatus: "confirmed",
        reportedById: 7,
        confirmedById: 7
      })
    );
    expect(detail).toMatchObject({
      serviceIncomeStatus: "confirmed",
      paymentChannel: "offline_cash",
      offlineReportedServiceAmountJpy: 8800,
      unknownOrUnreportedServiceAmountJpy: 0,
      serviceIncomeNote: "店铺现金收款，收银台已确认"
    });
    expect(detail.moneyTimeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "service_income_reported", amountJpy: 8800 }),
        expect.objectContaining({ type: "service_income_confirmed", amountJpy: 8800 })
      ])
    );
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: merchantActor,
        action: "merchant_admin.finance_order.service_income_report",
        targetType: "booking_order",
        targetId: 101
      })
    );
  });

  it("rejects merchant finance order access outside the current shop scope", async () => {
    const service = new OrderFinanceService(createRepository(), { record: jest.fn() });

    await expect(
      service.getMerchantOrderFinance(otherShopActor, context, 101)
    ).rejects.toMatchObject({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.identity.forbidden"
    });
  });
});
