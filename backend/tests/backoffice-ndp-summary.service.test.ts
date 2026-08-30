import { BackofficeService } from "../src/services/backoffice.service";

describe("BackofficeService NDP summary", () => {
  it("uses the current Tokyo date and zeroes a missing formal NDP aggregate", async () => {
    const summarizeNdpByCurrency = jest.fn(async () => [
      {
        ndpCurrency: "TEST_NDP",
        bPlatformFeeActualNdp: 999,
        cRequestFeeActualNdp: 0,
        penaltyNdp: 0,
        userRewardNdp: 0,
        compensationToUserNdp: 0,
        bPlatformFeeHoldNdp: 999,
        cRequestFeeHoldNdp: 0,
        releasedNdp: 0,
        campaignDiscountNdp: 0
      }
    ]);
    const record = jest.fn(async () => undefined);
    const service = new BackofficeService(
      { summarizeNdpByCurrency } as never,
      { record } as never,
      () => new Date("2026-05-25T15:30:00.000Z")
    );

    await expect(
      service.getPlatformNdpSummary(
        {
          userId: 1,
          email: "admin@example.com",
          accessTokenJti: "finance-summary",
          accessTokenExpiresAt: 1_800_000_000,
          currentIdentityType: "platform_admin",
          currentIdentityScopeType: "global",
          currentIdentityScopeId: null,
          roles: ["admin"],
          permissions: ["backoffice:finance:list"]
        },
        { ip: "127.0.0.1", userAgent: "jest" },
        {}
      )
    ).resolves.toEqual(
      expect.objectContaining({
        period: { date: "2026-05-26", timeZone: "Asia/Tokyo" },
        todayNdpConsumption: { ndp: 0, testNdp: 999 },
        platformNetRevenue: { ndp: 0, testNdp: 999 },
        settleableNdp: 0
      })
    );
    expect(summarizeNdpByCurrency).toHaveBeenCalledWith({
      fromInclusive: new Date("2026-05-25T15:00:00.000Z"),
      toExclusive: new Date("2026-05-26T15:00:00.000Z")
    });
  });
});
