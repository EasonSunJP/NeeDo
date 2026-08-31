import { describe, expect, it } from "vitest";
import source from "./AnalyticsPage.tsx?raw";

describe("operations analytics formal snapshot", () => {
  it("uses the protected aggregate without mock trends or entity overlays", () => {
    expect(source).toContain('backofficeRealDataApi.dashboard("backoffice", { period: "last7days" })');
    expect(source).toContain("dashboard.finance");
    expect(source).toContain("dashboard.schedule");
    expect(source).not.toContain("../../data/mock");
    expect(source).not.toContain("entityStore");
    expect(source).not.toContain("ChartPanel");
    expect(source).not.toContain("DataBigScreenPage");
  });

  it("marks unavailable time-series analysis as disabled instead of rendering fake charts", () => {
    expect(source).toContain("历史趋势尚未启用");
    expect(source).toContain("复购、留存、渠道、评价和城市趋势需要正式时间序列聚合接口");
    expect(source).not.toContain("analysisCards");
  });

  it("has loading, permission failure, retry, and empty states", () => {
    expect(source).toContain("正在加载真实分析快照");
    expect(source).toContain("重新加载分析快照");
    expect(source).toContain("当前没有可分析的真实订单");
    expect(source).toContain("当前身份没有查看分析数据的权限");
  });
});
