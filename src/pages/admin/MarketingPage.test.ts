import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./MarketingPage.tsx", import.meta.url), "utf8");

describe("MarketingPage production capability gate", () => {
  it("does not expose mock coupons, campaigns, statistics, or local creation", () => {
    expect(source).not.toContain("../../data/mock");
    expect(source).not.toContain("campaigns");
    expect(source).not.toContain("coupons");
    expect(source).not.toContain("DataTable");
    expect(source).not.toContain("新建活动");
    expect(source).not.toContain("创建活动");
    expect(source).not.toContain("24,200");
    expect(source).not.toContain("¥52.4M");
  });

  it("separates general marketing from the existing fee-campaign calculation model", () => {
    expect(source).toContain("正式营销与优惠券功能尚未启用");
    expect(source).toContain("Campaign、Coupon 与 Redemption 表和 migration");
    expect(source).toContain("创建、审核、启停与预算状态机 API");
    expect(source).toContain("领取、核销、归因与审计链路");
    expect(source).toContain("聚合统计与导出合同");
    expect(source).toContain("FeeCampaign 仅用于平台费用计算");
  });
});
