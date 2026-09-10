import { allocatePeriod } from "../src/services/operating-cost.service";

describe("operating cost exact allocation", () => {
  it("allocates equal shares and assigns integer remainders by numeric shop id", async () => {
    const allocations = await allocatePeriod({
      amountJpy: 1_000,
      allocationMode: "equal_active_shops",
      shops: [{ shopId: 3 }, { shopId: 1 }, { shopId: 2 }]
    });

    expect(allocations).toEqual([
      { shopId: 1, amountJpy: 334 },
      { shopId: 2, amountJpy: 333 },
      { shopId: 3, amountJpy: 333 }
    ]);
  });

  it("allocates proportional shares from settled platform income exactly", async () => {
    const allocations = await allocatePeriod({
      amountJpy: 1_000,
      allocationMode: "platform_income_proportional",
      shops: [
        { shopId: 8, settledPlatformIncomeJpy: 300 },
        { shopId: 9, settledPlatformIncomeJpy: 100 }
      ]
    });

    expect(allocations).toEqual([
      { shopId: 8, amountJpy: 750 },
      { shopId: 9, amountJpy: 250 }
    ]);
  });

  it("allocates direct JPY assignments only when they sum exactly", async () => {
    await expect(
      allocatePeriod({
        amountJpy: 1_000,
        allocationMode: "direct_shops",
        directAssignments: [{ shopId: 8, amountJpy: 1_000 }]
      })
    ).resolves.toEqual([{ shopId: 8, amountJpy: 1_000 }]);

    await expect(
      allocatePeriod({
        amountJpy: 1_000,
        allocationMode: "direct_shops",
        directAssignments: [{ shopId: 8, amountJpy: 999 }]
      })
    ).rejects.toThrow("operating_cost_allocation_invalid");
  });

  it("allocates direct 10000-bps shares with the same deterministic remainder rule", async () => {
    await expect(
      allocatePeriod({
        amountJpy: 1_001,
        allocationMode: "direct_shops",
        directAssignments: [
          { shopId: 9, shareBps: 2_500 },
          { shopId: 8, shareBps: 7_500 }
        ]
      })
    ).resolves.toEqual([
      { shopId: 8, amountJpy: 751 },
      { shopId: 9, amountJpy: 250 }
    ]);
  });

  it("rejects a zero proportional basis rather than silently falling back to equal", async () => {
    await expect(
      allocatePeriod({
        amountJpy: 1_000,
        allocationMode: "platform_income_proportional",
        shops: [
          { shopId: 8, settledPlatformIncomeJpy: 0 },
          { shopId: 9, settledPlatformIncomeJpy: 0 }
        ]
      })
    ).rejects.toThrow("operating_cost_allocation_invalid");
  });

  it("rejects duplicate shops, unsafe integers and empty scopes", async () => {
    await expect(
      allocatePeriod({
        amountJpy: 1_000,
        allocationMode: "equal_active_shops",
        shops: [{ shopId: 8 }, { shopId: 8 }]
      })
    ).rejects.toThrow("operating_cost_allocation_invalid");

    await expect(
      allocatePeriod({
        amountJpy: Number.MAX_SAFE_INTEGER + 1,
        allocationMode: "equal_active_shops",
        shops: [{ shopId: 8 }]
      })
    ).rejects.toThrow("operating_cost_allocation_invalid");

    await expect(
      allocatePeriod({
        amountJpy: 1_000,
        allocationMode: "equal_active_shops",
        shops: []
      })
    ).rejects.toThrow("operating_cost_allocation_invalid");
  });
});
