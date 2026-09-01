import { describe, expect, it } from "vitest";
import source from "./AdminLayout.tsx?raw";
import { routeMatches } from "./AdminLayout";

describe("AdminLayout navigation", () => {
  it("exposes one read-permission-filtered NDP exchange-rate settings item", () => {
    expect(source.match(/to: "\/admin\/settings\/ndp-exchange-rate"/g)).toHaveLength(1);
    expect(source).toContain('label: "NDP 汇率"');
    expect(source).toContain('permission: "backoffice:ndp-exchange-rate:read"');
    expect(routeMatches(
      { label: "NDP 汇率", to: "/admin/settings/ndp-exchange-rate", icon: "率" },
      "/admin/settings/ndp-exchange-rate",
      ""
    )).toBe(true);
    expect(routeMatches(
      { label: "系统设置", to: "/admin/roles?module=system", icon: "系" },
      "/admin/settings/ndp-exchange-rate",
      ""
    )).toBe(false);
  });

  it("exposes exactly one operations data dashboard entry", () => {
    expect(source.match(/label: "数据大盘"/g)).toHaveLength(1);
    expect(source).toContain('{ label: "数据大盘", to: "/admin"');
    expect(source).not.toContain('to: "/admin/analytics"');
    expect(source).not.toContain("分析中心");
    expect(source).not.toContain("数据大屏");
    expect(source).not.toContain("module=big-screen");
  });

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

  it("exposes exactly the five formal user-management workspaces", () => {
    for (const [label, to] of [
      ["用户列表", "/admin/users"],
      ["用户分组", "/admin/user-groups"],
      ["用户全局设置", "/admin/user-global-settings"],
      ["会员等级设置", "/admin/membership-tiers"],
      ["会员权益说明", "/admin/membership-benefits"]
    ]) {
      expect(source).toContain(`label: "${label}", to: "${to}"`);
    }
    expect(source.match(/permission: "backoffice:[^"]+:read"/g)?.length).toBeGreaterThanOrEqual(5);
    expect(source).toContain('placeholder="搜索订单、用户、门店、技师"');
    expect(source).not.toContain('label: "账号管理"');
    expect(source).not.toContain('label: "用户资料"');
    expect(source).not.toContain('label: "用户 CRM"');
    expect(source).not.toContain('label: "用户数据"');
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
