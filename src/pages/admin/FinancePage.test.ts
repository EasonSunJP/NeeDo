import { describe, expect, it } from "vitest";
import source from "./FinancePage.tsx?raw";

describe("FinancePage Step 12A fields", () => {
  it("loads order money timeline details and renders explicit service-income semantics", () => {
    expect(source).toContain("merchantFinanceCenterApi.getBackofficeOrderFinance");
    expect(source).toContain("serviceIncomeStatus");
    expect(source).toContain("paymentChannel");
    expect(source).toContain("technicianEstimatedIncomeJpy");
    expect(source).toContain("shopEstimatedGrossProfitJpy");
    expect(source).toContain("Money Timeline");
    expect(source).toContain("merchantPayrollCenterApi.listBackofficePayRuns");
    expect(source).toContain("merchantPayrollCenterApi.exportBackofficePayRuns");
    expect(source).toContain("工资单 / Pay Run 只读汇总");
    expect(source).toContain("导出工资 CSV");
    expect(source).not.toContain("FinanceReconciliation.actualAmount");
  });
});
