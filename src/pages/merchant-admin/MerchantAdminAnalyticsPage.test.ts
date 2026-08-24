import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./MerchantAdminAnalyticsPage.tsx", import.meta.url), "utf8");

describe("MerchantAdminAnalyticsPage production boundary", () => {
  it("uses only the authenticated merchant aggregate", () => {
    expect(source).toContain('backofficeRealDataApi.dashboard("merchant-admin")');
    expect(source).toContain("dashboard.finance");
    expect(source).toContain("dashboard.schedule");
    expect(source).not.toContain("../../data/mock");
    expect(source).not.toContain("useEntityStore");
    expect(source).not.toContain("getMerchantAdminDemo");
    expect(source).not.toContain("ShopAnalyticsDashboard");
  });

  it("does not invent time series while providing resilient current data", () => {
    expect(source).toContain("店铺历史趋势尚未启用");
    expect(source).toContain("复购、留存、渠道、评价和员工排行需要正式时间序列聚合接口");
    expect(source).toContain("正在加载本店真实分析快照");
    expect(source).toContain("重新加载本店分析");
    expect(source).toContain("当前店铺没有可分析的真实订单");
  });
});
