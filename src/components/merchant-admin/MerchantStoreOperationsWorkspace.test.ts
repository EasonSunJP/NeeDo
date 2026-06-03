import { describe, expect, it } from "vitest";
import source from "./MerchantStoreOperationsWorkspace.tsx?raw";

describe("MerchantStoreOperationsWorkspace finance rules", () => {
  const financeSource = source.slice(
    source.indexOf("finance: {"),
    source.indexOf("  }[module];")
  );

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
    expect(financeSource).toContain("财务规则中心");
    expect(financeSource).toContain("订单钱路 / 服务收入上报");
    expect(financeSource).toContain("技师收入模式");
    expect(financeSource).toContain("工资模式");
    expect(financeSource).toContain("分成比例 %");
    expect(financeSource).toContain("NDP 平台费承担");
    expect(financeSource).toContain("奖金规则");
    expect(financeSource).toContain("估算服务 GMV");
    expect(financeSource).toContain("平台 NDP 收入");
    expect(financeSource).toContain("未上报金额");
  });
});
