import { describe, expect, it } from "vitest";
import source from "./MerchantStoreOperationsWorkspace.tsx?raw";

describe("merchant payroll workspace", () => {
  it("renders pay run lifecycle controls from the typed payroll API", () => {
    expect(source).toContain("merchantPayrollCenterApi");
    expect(source).toContain("工资单闭环");
    expect(source).toContain("生成工资草稿");
    expect(source).toContain("发布工资单");
    expect(source).toContain("记录支付");
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
});
