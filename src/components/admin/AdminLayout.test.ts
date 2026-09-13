import { describe, expect, it } from "vitest";
import source from "./AdminLayout.tsx?raw";
import globalSearchSource from "./AdminGlobalSearch.tsx?raw";
import { routeMatches } from "./AdminLayout";

describe("AdminLayout navigation", () => {
  it("uses the shared formal notice bell without a hard-coded unread count", () => {
    expect(source).toContain("<OfficialNoticeBell to=\"/admin/notifications/inbox\"");
    expect(source).not.toContain("count={12}");
  });

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

  it("routes order settings to the permission-gated formal platform settings workspace", () => {
    expect(source).toContain(
      '{ label: "订单设置", to: "/admin/settings/system?tab=basic", icon: "设", permission: "backoffice:system-settings:read" }'
    );
    expect(source).not.toContain('/admin/orders?module=settings');
    expect(source).not.toContain('/admin/finance?module=refunds');
    expect(routeMatches(
      { label: "订单设置", to: "/admin/settings/system?tab=basic", icon: "设" },
      "/admin/settings/system",
      "?tab=basic"
    )).toBe(true);
    expect(routeMatches(
      { label: "系统设置", to: "/admin/settings/system", icon: "系" },
      "/admin/settings/system",
      "?tab=basic"
    )).toBe(false);
  });

  it("renames operations and keeps disabled TEST partner sections in the top navigation", () => {
    expect(source).toContain('title: "运营"');
    expect(source).toContain('title: "加盟商"');
    expect(source).toContain('title: "供货商"');
    expect(source.match(/badge: "TEST"/g)?.length).toBe(5);
    expect(source.match(/disabled: true/g)).toHaveLength(2);
    expect(source).toContain("section.disabled || section.items.length > 0");
    expect(source).toContain("if (section.disabled) return;");
    expect(source).toContain("disabled={section.disabled}");
    expect(source).toContain("aria-disabled={section.disabled}");
    expect(source).not.toContain('section.title === "平台运营" ? "PF運営" : section.title');
  });

  it("links the formal agent and operating-cost workspaces with read permissions", () => {
    expect(source).toContain('label: "代理商管理", to: "/admin/agents"');
    expect(source).toContain('permission: "backoffice:agent:read"');
    expect(source).toContain(
      'label: "运营成本设置", to: "/admin/finance/operating-costs"'
    );
    expect(source).toContain('permission: "backoffice:operating-cost:read"');
    expect(
      routeMatches(
        { label: "代理商管理", to: "/admin/agents", icon: "代" },
        "/admin/agents/11111111-1111-4111-8111-111111111111",
        ""
      )
    ).toBe(true);
  });

  it("does not render the obstructive bottom-left operations notice", () => {
    expect(source).not.toContain("东京城市组");
    expect(source).not.toContain("19 个待审核商家，36 个工单需要运营介入。");
    expect(source).not.toContain("admin-sidebar-note");
  });

  it("renders the formal operator summary without demo profile constants", () => {
    expect(source).toContain("<AdminOperatorSummary");
    expect(source).toContain("resolveAdminDisplayName");
    expect(source).toContain("resolveAdminRoleLabel");
    expect(source).not.toContain("David Stainberry");
    expect(source).not.toContain("profile-03.jpg");
    expect(source).not.toContain("admin@needo.jp");
    expect(source).not.toContain(">36<");
    expect(source).not.toContain(">19<");
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
    expect(source).toContain("<AdminGlobalSearch hasPermission={hasPermission}");
    expect(globalSearchSource).toContain('translateText("搜索订单、用户、门店、技师", language)');
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
