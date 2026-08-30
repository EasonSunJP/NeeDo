import { describe, expect, it } from "vitest";
import source from "./UserMembershipsPage.tsx?raw";

describe("UserMembershipsPage formal UI", () => {
  it("groups memberships by shop and displays the Test marker", () => {
    expect(source).toContain("我的会员");
    expect(source).toContain("<TestFeatureBadge");
    expect(source).toContain("customerShopMembershipApi");
    expect(source).toContain("已加入店铺");
    expect(source).toContain("会员卡状态");
  });

  it("supports real membership and card states without deferred mutations", () => {
    for (const copy of ["有效", "已结束", "已冻结", "已到期", "暂无会员卡", "查看店铺"]) {
      expect(source).toContain(copy);
    }
    expect(source).not.toContain("立即充值");
    expect(source).not.toContain("扫码核销");
    expect(source).not.toContain("申请退款");
  });

  it("has explicit loading, empty, error, and retry copy", () => {
    expect(source).toContain("正在读取我的会员");
    expect(source).toContain("还没有加入任何店铺会员");
    expect(source).toContain("会员数据读取失败");
    expect(source).toContain("重新加载");
  });
});
