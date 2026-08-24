import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./StoreCapabilityRoutePages.tsx", import.meta.url), "utf8");
const adminSource = readFileSync(new URL("../../admin/InventoryPage.tsx", import.meta.url), "utf8");
const adminFloorplanSource = readFileSync(new URL("../../admin/FloorplanPage.tsx", import.meta.url), "utf8");
const stageLayoutSource = source.slice(
  source.indexOf("export function MerchantAdminStageLayoutPage"),
  source.indexOf("export function MerchantAdminInventoryPage")
);
const inventorySource = source.slice(
  source.indexOf("export function MerchantAdminInventoryPage"),
  source.indexOf("export function MerchantAdminFinancePage")
);

describe("MerchantAdminInventoryPage production capability gate", () => {
  it("does not render the legacy mock inventory workspace", () => {
    expect(inventorySource).not.toContain('MerchantStoreOperationsWorkspace module="inventory"');
    expect(inventorySource).not.toContain("inventoryItems");
  });

  it("lists the persisted inventory prerequisites", () => {
    expect(inventorySource).toContain("正式库存功能尚未启用");
    expect(inventorySource).toContain("InventoryItem、InventoryLocation 与 StockMovement 表");
    expect(inventorySource).toContain("采购、调拨、盘点与出入库状态机 API");
    expect(inventorySource).toContain("幂等键、库存锁与审计日志");
    expect(inventorySource).toContain("预警、聚合统计与导出合同");
    expect(inventorySource).toContain("当前不会展示模拟库存、预警或补货建议");
  });

  it("keeps the operations inventory route on the same capability boundary", () => {
    expect(adminSource).not.toContain("../../data/mock");
    expect(adminSource).not.toContain("DataTable");
    expect(adminSource).not.toContain("新建采购单");
    expect(adminSource).toContain("正式库存功能尚未启用");
    expect(adminSource).toContain("InventoryItem、InventoryLocation 与 StockMovement 表");
  });
});

describe("stage layout production capability gate", () => {
  it("does not render browser-local layout or utilization data", () => {
    expect(stageLayoutSource).not.toContain('MerchantStoreOperationsWorkspace module="stage-layout"');
    expect(stageLayoutSource).not.toContain("stageLayoutItems");
    expect(adminFloorplanSource).not.toContain("initialAreas");
    expect(adminFloorplanSource).not.toContain("setAreas");
    expect(adminFloorplanSource).not.toContain("applySmartLayout");
  });

  it("lists the persisted layout prerequisites for both permission domains", () => {
    for (const pageSource of [stageLayoutSource, adminFloorplanSource]) {
      expect(pageSource).toContain("正式场控布局尚未启用");
      expect(pageSource).toContain("FloorArea、FloorResource 与 FloorLayoutVersion 表");
      expect(pageSource).toContain("店铺范围草稿、发布、回滚与版本 API");
      expect(pageSource).toContain("坐标校验、乐观锁与变更审计");
      expect(pageSource).toContain("Booking 与 Schedule 驱动的实时占用合同");
      expect(pageSource).toContain("当前不会展示模拟区域、利用率、流水或预约占用");
    }
  });
});
