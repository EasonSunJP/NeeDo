import {
  calculateAgentCommission,
  calculateProfitShare,
  calculatePureProfit
} from "../src/services/agent-settlement.service";

describe("agent settlement arithmetic", () => {
  it("calculates shop pure profit from every required evidence component", () => {
    expect(
      calculatePureProfit({
        orderPlatformFeesJpy: 100_000,
        saasFeesJpy: 20_000,
        userRebatesJpy: 10_000,
        refundsAndReversalsJpy: 5_000,
        channelFeesJpy: 3_000,
        consumptionTaxJpy: 8_000,
        allocatedOperatingCostsJpy: 14_000
      })
    ).toBe(80_000);
  });

  it("floors negative profit at zero for profit share but preserves the negative evidence", () => {
    const pureProfit = calculatePureProfit({
      orderPlatformFeesJpy: 10_000,
      saasFeesJpy: 0,
      userRebatesJpy: 4_000,
      refundsAndReversalsJpy: 2_000,
      channelFeesJpy: 1_000,
      consumptionTaxJpy: 1_000,
      allocatedOperatingCostsJpy: 5_000
    });
    expect(pureProfit).toBe(-3_000);
    expect(calculateProfitShare(1_500, pureProfit)).toBe(0);
    expect(calculateAgentCommission(50_000, 1_500, pureProfit)).toBe(50_000);
  });

  it("uses exact integer floor arithmetic and rejects unsafe or invalid values", () => {
    expect(calculateProfitShare(1_500, 80_003)).toBe(12_000);
    expect(calculateAgentCommission(50_000, 1_500, 80_000)).toBe(62_000);
    expect(() => calculateProfitShare(10_001, 1_000)).toThrow(
      "agent_settlement_calculation_invalid"
    );
    expect(() =>
      calculatePureProfit({
        orderPlatformFeesJpy: Number.MAX_SAFE_INTEGER,
        saasFeesJpy: Number.MAX_SAFE_INTEGER,
        userRebatesJpy: 0,
        refundsAndReversalsJpy: 0,
        channelFeesJpy: 0,
        consumptionTaxJpy: 0,
        allocatedOperatingCostsJpy: 0
      })
    ).toThrow("agent_settlement_calculation_invalid");
  });
});
