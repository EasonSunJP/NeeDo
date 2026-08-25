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

  it("does not mix legacy entity overlays or central mock datasets into production tables", () => {
    expect(source).not.toContain("../../data/mock");
    expect(source).not.toContain("useEntityStore");
    expect(source).not.toContain("EntitySyncEditor");
    expect(source).not.toContain("DataBigScreenPage");
    expect(source).not.toContain("当前记录为只读 mock 数据");
  });

  it("makes unsupported datasets and failure states explicit", () => {
    expect(source).toContain("库存和评价数据接口尚未启用");
    expect(source).toContain("历史全屏图表尚未启用");
    expect(source).toContain("正在从正式数据库加载数据");
    expect(source).toContain("重新加载当前数据");
    expect(source).toContain("当前数据集没有真实记录");
  });

  it("shows order creation time separately from the appointment time", () => {
    expect(source).toContain('title: "下单时间"');
    expect(source).toContain('title: "预约时间"');
    expect(source).toContain("createdAt");
    expect(source).toContain("startsAt");
  });
});
