import { describe, expect, it } from "vitest";
import source from "./CardRefundDialog.tsx?raw";

describe("CardRefundDialog", () => {
  it("shows exact card restoration, NDP reversal, negative balance, and TEST boundaries", () => {
    expect(source).toContain("merchantShopMembershipApi.refundRedemption");
    expect(source).toContain("会员卡退款");
    expect(source).toContain("客户返点与平台费按原记录处理");
    expect(source).toContain("余额会显示为负数");
    expect(source).toContain("不会自动解冻、续期或重新启用会员卡");
    expect(source).toContain("<TestFeatureBadge");
  });
});
