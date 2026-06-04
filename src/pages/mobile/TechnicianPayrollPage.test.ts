import { describe, expect, it } from "vitest";
import source from "./TechnicianPayrollPage.tsx?raw";

function loadFormatDateHelper() {
  const match = source.match(/function formatDate\(value: string\) \{([\s\S]*?)\n\}/);

  expect(match, "formatDate helper should stay available for payroll period regression coverage").toBeTruthy();

  return new Function(`function formatDate(value) {${match![1]}\n}; return formatDate;`)() as (value: string) => string;
}

describe("TechnicianPayrollPage", () => {
  it("lets technicians read, confirm, and dispute payslips through the typed API", () => {
    expect(source).toContain("technicianPayrollCenterApi");
    expect(source).toContain("工资单");
    expect(source).toContain("确认工资单");
    expect(source).toContain("发起申诉");
    expect(source).toContain("确认收款");
    expect(source).toContain("confirmPayoutRecord");
    expect(source).toContain("technicianConfirmedAt");
    expect(source).toContain("technicianPayrollCenterApi.exportPayslips");
    expect(source).toContain("downloadCsvExport");
    expect(source).toContain("导出 CSV");
  });

  it("shows inclusive payroll period end dates without shifting month-end UTC timestamps", () => {
    const RealDateTimeFormat = Intl.DateTimeFormat;

    Object.defineProperty(Intl, "DateTimeFormat", {
      configurable: true,
      value: function DateTimeFormat(locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) {
        return new RealDateTimeFormat(locales, {
          ...options,
          timeZone: options?.timeZone ?? "Asia/Shanghai"
        });
      }
    });
    try {
      const formatDate = loadFormatDateHelper();

      expect(formatDate("2026-06-01T00:00:00.000Z")).toBe("06/01");
      expect(formatDate("2026-06-30T23:59:59.000Z")).toBe("06/30");
    } finally {
      Object.defineProperty(Intl, "DateTimeFormat", {
        configurable: true,
        value: RealDateTimeFormat
      });
    }
  });
});
