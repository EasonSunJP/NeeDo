import { describe, expect, it } from "vitest";
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

  it("keeps card money and redemption mutations out of this micro-step", () => {
    expect(source).not.toContain("扫码核销");
    expect(source).not.toContain("立即充值");
    expect(source).not.toContain("申请退款");
    expect(source).not.toContain("开卡演示");
    expect(source).toContain("开通会员");
    expect(source).toContain("后续独立开放");
  });

  it("provides real loading, empty, error, retry, and permission states", () => {
    expect(source).toContain("正在读取会员数据");
    expect(source).toContain("当前店铺暂无会员");
    expect(source).toContain("会员数据读取失败");
    expect(source).toContain("重新加载");
    expect(source).toContain('hasPermission("shop.member.create")');
  });
});
