import { describe, expect, it } from "vitest";
import source from "./AdminLayout.tsx?raw";
import { routeMatches } from "./AdminLayout";

describe("AdminLayout navigation", () => {
  it("does not render the obstructive bottom-left operations notice", () => {
    expect(source).not.toContain("东京城市组");
    expect(source).not.toContain("19 个待审核商家，36 个工单需要运营介入。");
    expect(source).not.toContain("admin-sidebar-note");
  });

  it("does not expose the removed operations design module", () => {
    expect(source).not.toContain('key: "design"');
    expect(source).not.toContain('title: "设计"');
    expect(source).not.toContain('to: "/admin/decoration"');
    expect(source).not.toContain('label: "装修中心"');
  });

  it("uses the unified user terminology for operations profile management", () => {
    expect(source).toContain('label: "用户资料"');
    expect(source).toContain('label: "用户 CRM"');
    expect(source).toContain('children: ["用户档案", "会员等级", "公开状态"]');
    expect(source).toContain('children: ["正式用户", "预约次数", "创建时间"]');
    expect(source).toContain('placeholder="搜索订单、用户、门店、技师"');
    expect(source).not.toContain('label: "客户资料"');
    expect(source).not.toContain("客户 CRM");
    expect(source).not.toContain("客户档案");
    expect(source).not.toContain("正式客户");
    expect(source).not.toContain("搜索订单、客户");
  });

  it("selects the specific fee-rule item instead of the Affiliate task parent", () => {
    expect(routeMatches(
      { label: "联盟营销任务", to: "/admin/afirieito", icon: "联" },
      "/admin/afirieito/fee-rules",
      ""
    )).toBe(false);
    expect(routeMatches(
      { label: "平台抽成规则", to: "/admin/afirieito/fee-rules", icon: "率" },
      "/admin/afirieito/fee-rules",
      ""
    )).toBe(true);
  });
});
