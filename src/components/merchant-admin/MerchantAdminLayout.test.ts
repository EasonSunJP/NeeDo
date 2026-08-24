import { describe, expect, it } from "vitest";
import source from "./MerchantAdminLayout.tsx?raw";

describe("MerchantAdminLayout formal shop summary", () => {
  it("does not render the shared merchant shell from demo data", () => {
    expect(source).not.toContain("merchantAdminDemo");
    expect(source).not.toContain("store-admin@needo.jp");
    expect(source).not.toContain("merchantAdminDemo.orders.reduce");
  });

  it("loads shop identity and operating totals from the scoped dashboard", () => {
    expect(source).toContain('backofficeRealDataApi.dashboard("merchant-admin")');
    expect(source).toContain("dashboard.orders.filter");
    expect(source).toContain("dashboard.finance.estimatedServiceGmvJpy");
    expect(source).toContain("session?.avatarUrl");
    expect(source).toContain("服务 GMV");
  });

  it("keeps loading and retryable failure evidence visible", () => {
    expect(source).toContain("正在加载正式店铺资料");
    expect(source).toContain("店铺摘要加载失败");
    expect(source).toContain("重新加载店铺摘要");
  });
});
