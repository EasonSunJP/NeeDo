import { describe, expect, it } from "vitest";
import source from "./MerchantStoreOperationsWorkspace.tsx?raw";

describe("MerchantStoreOperationsWorkspace finance rules", () => {
  it("uses the real merchant finance rules API in the finance module", () => {
    expect(source).toContain("merchantFinanceRulesApi.get(shopId)");
    expect(source).toContain("merchantFinanceRulesApi.update(merchantShopId");
    expect(source).toContain("merchantFinanceRulesApi.preview(merchantShopId");
    expect(source).toContain("merchantFinanceCenterApi.getOrderFinance");
    expect(source).toContain("merchantFinanceCenterApi.reportServiceIncome");
    expect(source).toContain("merchantFinanceCenterApi.updateCompensationProfile");
    expect(source).not.toContain("mapBackofficeSettlement");
  });

  it("shows merchant finance rule controls and explicit finance semantics", () => {
    expect(source).toContain("财务规则中心");
    expect(source).toContain("订单钱路 / 服务收入上报");
    expect(source).toContain("技师收入模式");
    expect(source).toContain("工资模式");
    expect(source).toContain("分成比例 %");
    expect(source).toContain("NDP 平台费承担");
    expect(source).toContain("奖金规则");
    expect(source).toContain("估算服务 GMV");
    expect(source).toContain("平台 NDP 收入");
    expect(source).toContain("未上报金额");
  });

  it("does not retain unreachable sample floor or inventory branches", () => {
    expect(source).not.toContain("merchantAdminDemo");
    expect(source).not.toContain("stageLayoutItems");
    expect(source).not.toContain("selectedInventory");
  });
});
