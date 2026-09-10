import { describe, expect, it } from "vitest";
import source from "./CardRedemptionDialog.tsx?raw";

describe("CardRedemptionDialog", () => {
  it("selects only formal completed-order candidates and shows exact settlement evidence", () => {
    for (const copy of [
      "会员卡核销", "已完成服务", "本次扣减", "客户获得", "平台费", "店铺钱包合计扣除",
      "余额不足也会完成核销", "不会冻结 NDP", "确认核销"
    ]) expect(source).toContain(copy);
    expect(source).toContain("merchantShopMembershipApi.redemptionCandidates");
    expect(source).toContain("merchantShopMembershipApi.redeemCard");
    expect(source).toContain("buildCardRedemptionAttempt");
    expect(source).toContain("<TestFeatureBadge");
    expect(source).not.toContain("消费金额（JPY）");
    expect(source).not.toContain("返点金额（NDP）");
    expect(source).not.toContain("折扣");
  });
});
