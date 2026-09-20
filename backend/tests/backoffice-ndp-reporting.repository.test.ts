import { BackofficeRepository } from "../src/repositories/backoffice.repository";
import { ERROR_CODES } from "../src/constants/error-codes";

describe("BackofficeRepository NDP reporting", () => {
  it("maps Test NDP checkout evidence as visible non-settleable payment", async () => {
    const createdAt = new Date("2026-09-10T01:00:00.000Z");
    const findMany = jest.fn(async () => [
      {
        id: 51,
        bookingOrderId: 71,
        orderType: "booking",
        ndpCurrency: "TEST_NDP",
        customerUserId: 3,
        shopId: 10,
        technicianProfileId: null,
        serviceAmountJpy: 8_800,
        platformCollectedServiceAmountJpy: 0,
        offlineReportedServiceAmountJpy: 0,
        unknownOrUnreportedServiceAmountJpy: 0,
        paymentChannel: "platform_test_ndp",
        serviceIncomeStatus: "confirmed",
        bPlatformFeeHoldNdp: 500,
        bPlatformFeeActualNdp: 500,
        cRequestFeeHoldNdp: 0,
        cRequestFeeActualNdp: 0,
        userRewardNdp: 100,
        campaignDiscountNdp: 0,
        releasedNdp: 0,
        penaltyNdp: 0,
        compensationToUserNdp: 0,
        appliedFeeRuleIdsJson: [],
        moneyTimelineJson: [],
        settlementStatus: "settled",
        createdAt,
        bookingOrder: {
          id: 71,
          orderNo: "ND-TEST-71",
          shopId: 10,
          technicianProfileId: null,
          technicianProfile: null,
          shop: { name: "Test shop" },
          checkout: { payableNdp: 13_200 }
        }
      }
    ]);
    const repository = new BackofficeRepository({
      orderFinancial: { findMany, count: jest.fn(async () => 1) }
    } as never);

    await expect(
      repository.listFinanceSettlements({ scope: "platform", page: 1, pageSize: 20 })
    ).resolves.toMatchObject({
      list: [
        {
          ndpCurrency: "TEST_NDP",
          checkoutPaymentAmountNdp: 13_200,
          platformCollectedServiceAmountJpy: 0,
          unknownOrUnreportedServiceAmountJpy: 0,
          paymentChannel: "platform_test_ndp",
          serviceIncomeStatus: "confirmed"
        }
      ]
    });
  });

  it("keeps Test NDP rows out of formal finance settlement exports", async () => {
    const findMany = jest.fn(async () => []);
    const repository = new BackofficeRepository({ orderFinancial: { findMany } } as never);

    await repository.exportFinanceSettlements({ scope: "platform", page: 1, pageSize: 20 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ ndpCurrency: "NDP" })
      })
    );
  });

  it("groups the requested Tokyo-day UTC window by persisted NDP currency", async () => {
    const groupBy = jest.fn(async () => [
      {
        ndpCurrency: "TEST_NDP",
        _sum: {
          bPlatformFeeActualNdp: 700,
          cRequestFeeActualNdp: 300,
          penaltyNdp: 10,
          userRewardNdp: 100,
          compensationToUserNdp: 50,
          bPlatformFeeHoldNdp: 800,
          cRequestFeeHoldNdp: 350,
          releasedNdp: 25,
          campaignDiscountNdp: 40
        }
      }
    ]);
    const queryRaw = jest.fn(async () => [
      { ndpCurrency: "TEST_NDP", checkoutPaymentNdp: 17_600 }
    ]);
    const repository = new BackofficeRepository({
      orderFinancial: { groupBy },
      $queryRaw: queryRaw
    } as never);
    const fromInclusive = new Date("2026-05-24T15:00:00.000Z");
    const toExclusive = new Date("2026-05-25T15:00:00.000Z");

    await expect(
      repository.summarizeNdpByCurrency({ fromInclusive, toExclusive })
    ).resolves.toEqual([
      {
        ndpCurrency: "TEST_NDP",
        checkoutPaymentNdp: 17_600,
        bPlatformFeeActualNdp: 700,
        cRequestFeeActualNdp: 300,
        penaltyNdp: 10,
        userRewardNdp: 100,
        compensationToUserNdp: 50,
        bPlatformFeeHoldNdp: 800,
        cRequestFeeHoldNdp: 350,
        releasedNdp: 25,
        campaignDiscountNdp: 40
      }
    ]);
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ["ndpCurrency"],
        where: {
          deletedAt: null,
          createdAt: { gte: fromInclusive, lt: toExclusive }
        }
      })
    );
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it("fails closed when persisted finance rows contain an unknown currency", async () => {
    const groupBy = jest.fn(async () => [
      {
        ndpCurrency: "UNKNOWN",
        _sum: {}
      }
    ]);
    const repository = new BackofficeRepository({
      orderFinancial: { groupBy },
      $queryRaw: jest.fn(async () => [])
    } as never);

    await expect(
      repository.summarizeNdpByCurrency({
        fromInclusive: new Date("2026-05-24T15:00:00.000Z"),
        toExclusive: new Date("2026-05-25T15:00:00.000Z")
      })
    ).rejects.toMatchObject({ code: ERROR_CODES.LEDGER_CURRENCY_MISMATCH });
  });
});
