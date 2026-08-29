import { describe, expect, it } from "vitest";
import source from "./MerchantStoreOperationsWorkspace.tsx?raw";
import { translateText } from "../../i18n/translations";

describe("merchant payroll workspace", () => {
  it("renders pay run lifecycle controls from the typed payroll API", () => {
    expect(source).toContain("merchantPayrollCenterApi");
    expect(source).toContain("工资单闭环");
    expect(source).toContain("生成工资草稿");
    expect(source).toContain("发布工资单");
    expect(source).toContain("记录支付");
    expect(source).toContain("merchantPayrollCenterApi.exportPayRuns");
    expect(source).toContain("downloadCsvExport");
    expect(source).toContain("导出工资 CSV");
  });

  it("connects payroll adjustment requests to the merchant payroll controls", () => {
    expect(source).toContain("工资调整申请");
    expect(source).toContain("申请奖金/扣款");
    expect(source).toContain("merchantPayrollCenterApi.listPayrollAdjustments");
    expect(source).toContain("merchantPayrollCenterApi.createPayrollAdjustment");
    expect(source).toContain("merchantPayrollCenterApi.submitPayrollAdjustment");
    expect(source).toContain("merchantPayrollCenterApi.approvePayrollAdjustment");
    expect(source).toContain("merchantPayrollCenterApi.rejectPayrollAdjustment");
  });

  it("connects payroll dispute resolution to the merchant payroll controls", () => {
    expect(source).toContain("申诉处理");
    expect(source).toContain("处理申诉");
    expect(source).toContain("merchantPayrollCenterApi.resolvePayslipDispute");
    expect(source).toContain("disputeResolutionNote");
  });

  it("records real manual settlement details without a hard-coded transfer", () => {
    expect(source).toContain("仅登记已在 NeeDo 外部完成的支付结果，不会自动转账");
    expect(source).toContain("本次支付金额");
    expect(source).toContain("实际支付日");
    expect(source).toContain("支付方式");
    expect(source).toContain("外部凭证号");
    expect(source).toContain("payoutForm");
    expect(source).toContain("recordActivePayout");
    expect(source).toContain("activePayslip.unpaidAmountJpy");
    expect(source).not.toContain("STATIC-PAYOUT-001");
    expect(source).not.toContain('payoutDate: "2026-07-10T00:00:00.000Z"');
  });

  it("selects a public NeeDoID employee and exposes individual payslips and payout history", () => {
    expect(source).toContain('searchParams.get("employee")');
    expect(source).toContain("technicianNeedoId");
    expect(source).toContain("员工工资单");
    expect(source).toContain("支付登记记录");
    expect(source).toContain("setActivePayslip");
  });

  it("translates the manual settlement controls in every supported non-Chinese language", () => {
    expect(translateText("人工支付登记", "ja")).toBe("手動支払登録");
    expect(translateText("记录支付", "en")).toBe("Record payment");
    expect(translateText("支付登记记录", "ko")).toBe("지급 등록 기록");
    expect(translateText("实际支付日", "zh-Hant")).toBe("實際支付日");
  });

  it("surfaces Request finance fees in the merchant order money route", () => {
    expect(source).toContain("requestFeeNdpRevenue");
    expect(source).toContain("cRequestFeeHoldNdp");
    expect(source).toContain("Request 费用");
  });
});
