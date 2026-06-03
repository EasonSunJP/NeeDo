import { describe, expect, it } from "vitest";
import merchantPayrollSource from "./merchantPayrollCenter.ts?raw";
import technicianPayrollSource from "./technicianPayrollCenter.ts?raw";
import staticDemoSource from "./staticDemo.ts?raw";

describe("payroll center typed API", () => {
  it("uses the formal DTO routes for merchant, technician, and static demo payroll", () => {
    expect(merchantPayrollSource).toContain("/merchant-admin/pay-runs");
    expect(merchantPayrollSource).toContain("/merchant-admin/pay-runs/export");
    expect(merchantPayrollSource).toContain("/backoffice/pay-runs/export");
    expect(merchantPayrollSource).toContain("/merchant-admin/payslips/");
    expect(merchantPayrollSource).toContain("/merchant-admin/payroll-adjustments");
    expect(merchantPayrollSource).toContain("disputeResolvedAt");
    expect(merchantPayrollSource).toContain("technicianConfirmedAt");
    expect(merchantPayrollSource).toContain("resolvePayslipDispute");
    expect(merchantPayrollSource).toContain("/resolve-dispute");
    expect(merchantPayrollSource).toContain("PayrollAdjustmentRequestPayload");
    expect(merchantPayrollSource).toContain("PayrollCsvExportPayload");
    expect(merchantPayrollSource).toContain("PayRunPayload");
    expect(technicianPayrollSource).toContain("/technician/payslips");
    expect(technicianPayrollSource).toContain("/technician/payslips/export");
    expect(technicianPayrollSource).toContain("confirmPayoutRecord");
    expect(technicianPayrollSource).toContain("/payout-records/");
    expect(technicianPayrollSource).toContain("PayrollCsvExportPayload");
    expect(technicianPayrollSource).toContain("PayslipPayload");
    expect(staticDemoSource).toContain("staticPayRunPayload");
    expect(staticDemoSource).toContain("staticPayRunCsvExport");
    expect(staticDemoSource).toContain("staticPayslipCsvExport");
    expect(staticDemoSource).toContain("staticPayrollAdjustmentPayload");
    expect(staticDemoSource).toContain("reportStaticPayslipDispute");
    expect(staticDemoSource).toContain("resolveStaticPayslipDispute");
    expect(staticDemoSource).toContain("confirmStaticPayoutRecord");
  });
});
