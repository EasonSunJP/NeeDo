import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DataCenterPage.tsx", import.meta.url), "utf8");

describe("DataCenterPage production data boundary", () => {
  it("loads every supported dataset from the protected backoffice adapter", () => {
    expect(source).toContain('backofficeRealDataApi.orders("backoffice"');
    expect(source).toContain('backofficeRealDataApi.customers("backoffice"');
    expect(source).toContain('backofficeRealDataApi.technicians("backoffice"');
    expect(source).toContain('backofficeRealDataApi.shops("backoffice"');
    expect(source).toContain('backofficeRealDataApi.services("backoffice"');
    expect(source).toContain('backofficeRealDataApi.schedule("backoffice"');
    expect(source).toContain('backofficeRealDataApi.financeSettlements("backoffice"');
  });

  it("marks formal server pages so DataTable cannot paginate, filter, or sort only the current page", () => {
    expect(source).toContain('paginationMode="server"');
    expect(source).not.toContain('footerPlacement="inline"');
  });

  it("does not mix legacy entity overlays or central mock datasets into production tables", () => {
    expect(source).not.toContain("../../data/mock");
    expect(source).not.toContain("useEntityStore");
    expect(source).not.toContain("EntitySyncEditor");
    expect(source).not.toContain("DataBigScreenPage");
    expect(source).not.toContain("当前记录为只读 mock 数据");
  });

  it("makes unsupported datasets and failure states explicit", () => {
    expect(source).toContain("库存和评价数据接口尚未启用");
    expect(source).toContain("正在从正式数据库加载数据");
    expect(source).toContain("重新加载当前数据");
    expect(source).toContain("当前数据集没有真实记录");
  });

  it("redirects every retired operations dashboard alias to the only data dashboard", () => {
    expect(source).toContain('const retiredDashboardModules = new Set(["big-screen", "charts", "fullscreen-charts"])');
    expect(source).toContain("retiredDashboardModules.has(module)");
    expect(source).toContain('return <Navigate replace to="/admin" />;');
    expect(source).not.toContain("HistoricalChartsUnavailable");
    expect(source).not.toContain("历史全屏图表尚未启用");
    expect(source).not.toContain("该入口保留");
  });

  it("shows order creation time separately from the appointment time", () => {
    expect(source).toContain('title: "下单时间"');
    expect(source).toContain('title: "预约时间"');
    expect(source).toContain("createdAt");
    expect(source).toContain("startsAt");
  });

  it("uses the canonical order-center drawer instead of exposing raw transport fields", () => {
    expect(source).toContain('to={`/admin/orders?orderId=${order.id}`}');
    expect(source).not.toContain("Object.entries(selected)");
    expect(source).not.toContain("detailValue(value)");
    expect(source).not.toContain("JSON.stringify(value)");
  });

  it("labels every remaining dataset detail with human-facing business fields", () => {
    expect(source).toContain("detailItemsFor(active, selected)");
    expect(source).toContain('label: "NeeDoID"');
    expect(source).toContain('label: "服务名称"');
    expect(source).toContain('label: "门店名称"');
    expect(source).not.toContain("customerUserId");
    expect(source).not.toContain("technicianProfileId");
  });
});
