import { describe, expect, it } from "vitest";
import source from "./CardTopUpDialog.tsx?raw";

describe("CardTopUpDialog", () => {
  it("records only received offline principal with explicit evidence and a Test badge", () => {
    for (const copy of ["会员卡充值", "充值前本金", "充值后本金", "实际收款金额", "收款方式", "收款凭证", "不会产生 NDP", "立即到账"]) {
      expect(source).toContain(copy);
    }
    expect(source).toContain("merchantShopMembershipApi.topUpCard");
    expect(source).toContain("buildCardTopUpAttempt");
    expect(source).toContain("<TestFeatureBadge");
    expect(source).not.toContain("bonusJpy");
    expect(source).not.toContain("折扣");
  });
});
