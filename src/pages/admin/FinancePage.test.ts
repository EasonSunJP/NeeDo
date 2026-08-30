import { describe, expect, it } from "vitest";
import source from "./FinancePage.tsx?raw";
import ndpCopySource from "./financeNdpCopy.ts?raw";

describe("FinancePage Step 12A fields", () => {
  it("loads order money timeline details and renders explicit service-income semantics", () => {
    expect(source).toContain("merchantFinanceCenterApi.getBackofficeOrderFinance");
    expect(source).toContain("serviceIncomeStatus");
    expect(source).toContain("paymentChannel");
    expect(source).toContain("technicianEstimatedIncomeJpy");
    expect(source).toContain("shopEstimatedGrossProfitJpy");
    expect(source).toContain("requestFeeNdpRevenue");
    expect(source).toContain("Request 费用");
    expect(source).toContain("Money Timeline");
    expect(source).toContain("merchantPayrollCenterApi.listBackofficePayRuns");
    expect(source).toContain("merchantPayrollCenterApi.exportBackofficePayRuns");
    expect(source).toContain("downloadCsvExport");
    expect(source).toContain("runCsvExport");
    expect(source).toContain("工资单 / Pay Run 只读汇总");
    expect(source).toContain("导出工资 CSV");
    expect(source).toContain("backofficeRealDataApi.ndpSummary");
    expect(source).toContain("NdpMetricValue");
    expect(source).toContain("getFinanceNdpCopy");
    expect(ndpCopySource).toContain("今日 NDP 消费额");
    expect(ndpCopySource).toContain("正式可结算");
    expect(ndpCopySource).toContain("Test NDP 不参与结算");
    expect(source).toContain('timeZone: "Asia/Tokyo"');
    expect(source).not.toContain("settlementRows.reduce((sum, row) => sum + row.platformNdpRevenue");
    expect(source).not.toContain("FinanceReconciliation.actualAmount");
  });
});
