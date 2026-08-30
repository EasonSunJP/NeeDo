import { BackofficeRepository } from "../src/repositories/backoffice.repository";
import { ERROR_CODES } from "../src/constants/error-codes";

describe("BackofficeRepository NDP reporting", () => {
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
    const repository = new BackofficeRepository({ orderFinancial: { groupBy } } as never);
    const fromInclusive = new Date("2026-05-24T15:00:00.000Z");
    const toExclusive = new Date("2026-05-25T15:00:00.000Z");

    await expect(
      repository.summarizeNdpByCurrency({ fromInclusive, toExclusive })
    ).resolves.toEqual([
      {
        ndpCurrency: "TEST_NDP",
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
  });

  it("fails closed when persisted finance rows contain an unknown currency", async () => {
    const groupBy = jest.fn(async () => [
      {
        ndpCurrency: "UNKNOWN",
        _sum: {}
      }
    ]);
    const repository = new BackofficeRepository({ orderFinancial: { groupBy } } as never);

    await expect(
      repository.summarizeNdpByCurrency({
        fromInclusive: new Date("2026-05-24T15:00:00.000Z"),
        toExclusive: new Date("2026-05-25T15:00:00.000Z")
      })
    ).rejects.toMatchObject({ code: ERROR_CODES.LEDGER_CURRENCY_MISMATCH });
  });
});
