import { describe, expect, it } from "vitest";
import source from "./UserMembershipsPage.tsx?raw";

describe("UserMembershipsPage formal UI", () => {
  it("groups memberships by shop and displays the Test marker", () => {
    expect(source).toContain("我的会员");
    expect(source).toContain("<TestFeatureBadge");
    expect(source).toContain("customerShopMembershipApi");
    expect(source).toContain("已加入店铺");
    expect(source).toContain("会员卡状态");
    expect(source).toContain("<MembershipCardAdjustmentInbox");
  });

  it("supports real membership, card states, and read-only top-up history", () => {
    for (const copy of ["有效", "已结束", "已冻结", "已到期", "暂无会员卡", "查看店铺"]) {
      expect(source).toContain(copy);
    }
    expect(source).not.toContain("扫码核销");
    expect(source).not.toContain("申请退款");
    expect(source).not.toContain("开卡会在后续");
    for (const copy of ["方案版本", "开卡时间", "开卡来源", "线下已付款", "历史补卡", "人工发放", "平台费率快照", "开卡不会自动产生 NDP"]) {
      expect(source).toContain(copy);
    }
    expect(source).toContain("<CardTopUpHistory");
    expect(source).toContain('mode="customer"');
  });

  it("has explicit loading, empty, error, and retry copy", () => {
    expect(source).toContain("正在读取我的会员");
    expect(source).toContain("还没有加入任何店铺会员");
    expect(source).toContain("会员数据读取失败");
    expect(source).toContain("重新加载");
  });

  it("remounts when navigation changes between the list and a detail response shape", () => {
    expect(source).toContain("function UserMembershipsPageContent");
    expect(source).toContain('key={membershipPublicId ?? "list"}');
  });
});
