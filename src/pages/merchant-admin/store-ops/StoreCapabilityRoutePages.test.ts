import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./StoreCapabilityRoutePages.tsx", import.meta.url), "utf8");
const adminSource = readFileSync(new URL("../../admin/InventoryPage.tsx", import.meta.url), "utf8");
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
