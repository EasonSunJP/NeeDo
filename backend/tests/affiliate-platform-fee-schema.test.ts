import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("affiliate platform fee schema contract", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

  it("stores versioned global or shop fee rules with immutable task snapshots", () => {
    expect(schema).toContain("enum AffiliatePlatformFeeScopeType");
    expect(schema).toMatch(
      /model AffiliatePlatformFeeRule \{[\s\S]*scopeType\s+AffiliatePlatformFeeScopeType[\s\S]*shopId\s+Int\?[\s\S]*feeBps\s+Int[\s\S]*version\s+Int[\s\S]*effectiveFrom\s+DateTime[\s\S]*effectiveTo\s+DateTime\?[\s\S]*activeKey\s+String\?[\s\S]*reason\s+String[\s\S]*createdAt[\s\S]*updatedAt[\s\S]*deletedAt/
    );
    expect(schema).toMatch(
      /model AffiliateTask \{[\s\S]*platformFeeRuleId\s+Int\?[\s\S]*platformFeeBps\s+Int[\s\S]*platformFeeReserveNdp\s+Int[\s\S]*settledPlatformFeeNdp\s+Int[\s\S]*releasedPlatformFeeNdp\s+Int/
    );
  });

  it("separates commission capacity from the gross frozen fee reserve", () => {
    expect(schema).toMatch(
      /model AffiliateBudgetReservation \{[\s\S]*totalFrozenNdp\s+Int[\s\S]*commissionFrozenNdp\s+Int[\s\S]*platformFeeFrozenNdp\s+Int[\s\S]*allocatedNdp\s+Int[\s\S]*capturedNdp\s+Int[\s\S]*platformFeeCapturedNdp\s+Int[\s\S]*releasedNdp\s+Int[\s\S]*platformFeeReleasedNdp\s+Int/
    );
  });

  it("records the immutable platform allocation on each reward", () => {
    expect(schema).toMatch(
      /model AffiliateReward \{[\s\S]*platformWalletId\s+Int\?[\s\S]*rewardNdp\s+Int[\s\S]*platformFeeNdp\s+Int/
    );
    expect(schema).toMatch(
      /model AffiliateReward \{[\s\S]*platformWallet\s+Wallet\?[\s\S]*@relation\("AffiliateRewardPlatformWallet"/
    );
  });
});
