import { BackofficeRepository } from "../src/repositories/backoffice.repository";

describe("backoffice dashboard aggregate counts", () => {
  it("uses an exact technician count instead of the six-row preview length", async () => {
    const client = {
      bookingOrder: {
        count: jest.fn(async () => 1802),
        findMany: jest.fn(async () => []),
        aggregate: jest.fn(async () => ({ _sum: { priceAmount: null } }))
      },
      scheduleSlot: {
        count: jest.fn().mockResolvedValueOnce(1292).mockResolvedValueOnce(1315)
      },
      orderFinancial: {
        aggregate: jest.fn(async () => ({
          _sum: {
            serviceAmountJpy: null,
            platformCollectedServiceAmountJpy: null,
            offlineReportedServiceAmountJpy: null,
            unknownOrUnreportedServiceAmountJpy: null,
            bPlatformFeeActualNdp: null,
            cRequestFeeActualNdp: null,
            userRewardNdp: null,
            campaignDiscountNdp: null,
            bPlatformFeeHoldNdp: null,
            cRequestFeeHoldNdp: null,
            releasedNdp: null
          }
        }))
      },
      technicianProfile: {
        count: jest.fn(async () => 106),
        findMany: jest.fn(async () => [])
      },
      shop: {
        findMany: jest.fn(async () => [])
      }
    };
    const repository = new BackofficeRepository(client as never);

    const dashboard = await repository.getDashboard({ scope: "platform" });

    expect(dashboard.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "技师数量", value: "106" })
      ])
    );
    expect(client.technicianProfile.count).toHaveBeenCalledTimes(1);
    expect(dashboard.technicians).toEqual([]);
  });
});
