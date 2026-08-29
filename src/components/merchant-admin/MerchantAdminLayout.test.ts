import { describe, expect, it } from "vitest";
import source from "./MerchantAdminLayout.tsx?raw";

describe("MerchantAdminLayout formal shop summary", () => {
  it("does not render the obstructive bottom-left store notice", () => {
    expect(source).not.toContain("本店经营提醒");
    expect(source).not.toContain("高频入口只保留本店自己能处理的事务，不显示平台运营后台模块。");
    expect(source).not.toContain("admin-sidebar-note");
  });

  it("does not render the shared merchant shell from demo data", () => {
    expect(source).not.toContain("merchantAdminDemo");
    expect(source).not.toContain("store-admin@needo.jp");
    expect(source).not.toContain("merchantAdminDemo.orders.reduce");
  });

  it("loads shop identity and operating totals from the scoped dashboard", () => {
    expect(source).toContain("loadMerchantAdminDashboard");
    expect(source).not.toContain('backofficeRealDataApi.dashboard("merchant-admin")');
    expect(source).toContain("dashboard.orders.filter");
    expect(source).toContain("dashboard.finance.estimatedServiceGmvJpy");
    expect(source).toContain("session?.avatarUrl");
    expect(source).toContain("服务 GMV");
  });

  it("keeps loading and retryable failure evidence visible", () => {
    expect(source).toContain("正在加载正式店铺资料");
    expect(source).toContain("店铺摘要加载失败");
    expect(source).toContain("重新加载店铺摘要");
    expect(source).toContain("invalidateMerchantAdminDashboard");
  });

  it("shares the scoped dashboard state with data pages instead of making them reload it", () => {
    expect(source).toContain("MerchantAdminDashboardResource");
    expect(source).toContain('typeof children === "function"');
    expect(source).toContain("children(dashboardResource)");
  });

  it("shows the operations preview banner, shop selector, and explicit return action", () => {
    expect(source).toContain("只读代看");
    expect(source).toContain("切换查看店铺");
    expect(source).toContain("退出只读代看");
    expect(source).toContain("setMerchantAdminPreviewShop");
    expect(source).toContain("clearMerchantAdminPreview");
  });

  it("reloads the active merchant page after a group preview shop changes", () => {
    expect(source).toContain("setMerchantAdminPreviewShop(shopId)");
    expect(source).toContain("navigate(0)");
  });

  it("does not expose the removed merchant UI decoration module", () => {
    expect(source).not.toContain('key: "design"');
    expect(source).not.toContain('title: "UI装修"');
    expect(source).not.toContain('to: "/merchant-admin/design"');
    expect(source).not.toContain('to: "/merchant-admin/design?module=cards"');
  });

  it("uses independent employee and user management navigation sections", () => {
    expect(source).toContain('key: "staff"');
    expect(source).toContain('title: "员工管理"');
    expect(source).toContain('key: "users"');
    expect(source).toContain('title: "用户管理"');
    expect(source).toContain('to: "/merchant-admin/people?module=users"');
    expect(source).not.toContain('title: "人员与顾客"');
    expect(source).not.toContain('module=customers');
  });
});
