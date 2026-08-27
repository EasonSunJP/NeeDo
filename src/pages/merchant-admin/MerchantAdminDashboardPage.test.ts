import { describe, expect, it } from "vitest";
import source from "./MerchantAdminDashboardPage.tsx?raw";

describe("merchant dashboard real data", () => {
  it("uses only the merchant-scoped aggregate and real payload names", () => {
    expect(source).not.toContain('backofficeRealDataApi.dashboard("merchant-admin")');
    expect(source).toContain("MerchantAdminDashboardResource");
    expect(source).toContain("resource.reload");
    expect(source).toContain("dashboard.schedule");
    expect(source).toContain("dashboard.finance");
    expect(source).toContain("mapBackofficeOrder");
    expect(source).not.toContain("entityStore");
    expect(source).not.toContain("../../data/mock");
    expect(source).not.toContain("mapBackofficeStore");
    expect(source).not.toContain("mapBackofficeTechnician");
  });

  it("does not present hard-coded financial values or enabled unsupported modules", () => {
    expect(source).not.toContain('["平台分账", yen(0)]');
    expect(source).not.toContain('to="/merchant-admin/design"');
    expect(source).not.toContain('to="/merchant-admin/analytics"');
    expect(source).toContain("尚未启用的商户模块");
  });

  it("has loading, permission failure, retry, and empty order states", () => {
    expect(source).toContain("正在加载本店真实数据");
    expect(source).toContain("重新加载本店数据");
    expect(source).toContain("本店当前没有真实订单");
    expect(source).toContain("当前身份没有查看本店经营数据的权限");
  });
});
