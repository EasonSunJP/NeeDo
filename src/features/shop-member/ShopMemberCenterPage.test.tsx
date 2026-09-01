import { describe, expect, it } from "vitest";
import adjustmentActionSource from "./IssuedCardAdjustmentAction.tsx?raw";
import source from "./ShopMemberCenterPage.tsx?raw";

describe("ShopMemberCenterPage formal UI", () => {
  it("restores the five real-data views with a Test marker", () => {
    for (const copy of ["会员中心", "概览", "会员", "会员卡", "活动", "分析"]) {
      expect(source).toContain(copy);
    }
    expect(source).toContain("<TestFeatureBadge");
    expect(source).toContain("merchantShopMembershipApi");
    expect(source).not.toContain("等待正式会员数据库与权限接口");
    expect(source).not.toContain("shopMemberStore");
  });

  it("opens formal top-up and redemption while refund remains separate", () => {
    expect(source).not.toContain("申请退款");
    expect(source).not.toContain("开卡演示");
    expect(source).not.toContain("开卡将在后续");
    expect(source).toContain("开通会员");
    expect(source).toContain("充值记录");
    expect(source).toContain("<CardTopUpDialog");
    expect(source).toContain("<CardTopUpHistory");
    expect(source).toContain("<CardRedemptionDialog");
    expect(source).toContain("<CardRedemptionHistory");
    expect(source).toContain('hasPermission("shop.member.card.topup.create")');
    expect(source).toContain('hasPermission("shop.member.card.redeem")');
    expect(source).toContain("核销记录");
    expect(source).toContain("核销 TEST");
    expect(source).toContain("核销已接入正式数据库、审计、通知与 NDP 账本");
    expect(source).not.toContain("充值、核销、退款仍会分别接入");
  });

  it("splits issued cards from card plans and uses exact plan permissions", () => {
    expect(source).toContain("已发会员卡");
    expect(source).toContain("卡方案");
    expect(source).toContain("<CardPlanWorkspace");
    expect(source).toContain('hasPermission("shop.member.card_plan.manage")');
    expect(source).toContain('hasPermission("shop.member.card_plan.publish")');
    expect(source).toContain('hasPermission("shop.member.card.issue")');
    expect(source).toContain("<CardIssuanceDialog");
    expect(source).toContain("开卡");
    expect(source).toContain("<IssuedCardAdjustmentAction");
    expect(adjustmentActionSource).toContain("申请调整");
    expect(adjustmentActionSource).toContain("已有调整等待客户确认");
    expect(source).toContain("<CardAdjustmentRequestDialog");
    expect(source).toContain("<CardAdjustmentRequestList");
    expect(source).toContain('hasPermission("shop.member.card.adjust.request")');
  });

  it("provides real loading, empty, error, retry, and permission states", () => {
    expect(source).toContain("正在读取会员数据");
    expect(source).toContain("当前店铺暂无会员");
    expect(source).toContain("会员数据读取失败");
    expect(source).toContain("重新加载");
    expect(source).toContain('hasPermission("shop.member.create")');
    expect(source).toContain('hasPermission("shop.member.analytics.view")');
    expect(source).toContain('hasPermission("shop.member.operation_log.view")');
  });

  it("does not render a newly selected section with the previous response shape", () => {
    expect(source).toContain("currentRequestKey");
    expect(source).toContain("state.requestKey !== currentRequestKey");
    expect(source).toContain("key={activeSection}");
    expect(source).toContain("hasExpectedSectionData");
    expect(source).toContain("会员数据响应格式异常");
  });
});
