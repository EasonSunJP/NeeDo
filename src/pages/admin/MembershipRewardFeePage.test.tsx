import { describe, expect, it } from "vitest";
import source from "./MembershipRewardFeePage.tsx?raw";

describe("MembershipRewardFeePage", () => {
  it("uses formal versioned data, request guards, and exact write permission", () => {
    expect(source).toContain("membershipRewardFeeApi.getOverview");
    expect(source).toContain("membershipRewardFeeApi.createVersion");
    expect(source).toContain("requestId");
    expect(source).toContain('permission="button:backoffice-membership-reward-fee-create"');
    expect(source).not.toMatch(/localStorage|data\/mock|mock[A-Z]/);
  });

  it("shows Test state and explains the additive snapshot lifecycle", () => {
    expect(source).toContain("<TestFeatureBadge");
    expect(source).toContain("客户获得的 NDP 之外额外收取");
    expect(source).toContain("只影响之后新发布的卡方案版本");
    expect(source).toContain("不可变历史");
  });
});
