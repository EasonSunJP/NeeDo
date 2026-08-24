import { describe, expect, it } from "vitest";
import source from "./DashboardPage.tsx?raw";

describe("operations dashboard real data", () => {
  it("uses only the scoped dashboard aggregate for core metrics and tables", () => {
    expect(source).toContain('backofficeRealDataApi.dashboard("backoffice")');
    expect(source).toContain("dashboard.schedule");
    expect(source).toContain("dashboard.finance");
    expect(source).toContain("dashboard.orders.map(mapBackofficeOrder)");
    expect(source).not.toContain("../../data/mock");
    expect(source).not.toContain("entityStore");
    expect(source).not.toContain("ChartPanel");
  });

  it("does not render unsupported field jobs, city war reports, risk, or health scores", () => {
    expect(source).not.toContain("fieldJobs");
    expect(source).not.toContain("cityOperatingStats");
    expect(source).not.toContain("riskTickets");
    expect(source).not.toContain("merchantHealthScores");
    expect(source).toContain("尚未启用的运营模块");
  });

  it("shows loading, permission-aware failure, retry, and empty states", () => {
    expect(source).toContain("正在加载真实经营数据");
    expect(source).toContain("重新加载经营数据");
    expect(source).toContain("当前没有真实订单");
    expect(source).toContain("当前身份没有查看经营数据的权限");
  });
});
