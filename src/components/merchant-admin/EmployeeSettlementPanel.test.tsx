// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmployeeCompensationResult } from "../../api/employeeCompensation";
import { EmployeeSettlementPanel } from "./EmployeeSettlementPanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../i18n/I18nProvider", () => ({
  useOptionalI18n: () => ({ language: "zh", setLanguage: vi.fn() }),
}));

const result = {
  employee: { needoId: "s0000000047" },
  profile: {
    sourceType: "technician_override",
    name: "正式薪酬规则",
    wageMode: "commission",
    baseSalaryJpy: 0,
    hourlyRateJpy: 0,
    dailyRateJpy: 0,
    fixedOrderPayJpy: 0,
    commissionRatePercent: 20,
    extensionCommissionRatePercent: 25,
    nominationFeeJpy: 1_000,
    guaranteedMinimumJpy: 0,
    ndpFeeBearer: "shop",
    technicianNdpSharePercent: 0,
    bonusRules: [],
    deductionRules: [],
    version: 1,
    status: "active",
    effectiveFrom: "2026-08-01T00:00:00.000Z",
    effectiveTo: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
  payrollSummary: {
    payslipId: 801,
    periodStart: "2026-08-01T00:00:00.000Z",
    periodEnd: "2026-08-31T23:59:59.999Z",
    status: "scheduled",
    disputeStatus: "none",
    completedOrderCount: 12,
    workedMinutes: 720,
    serviceIncomeJpy: 200_000,
    basePayJpy: 230_000,
    commissionJpy: 40_000,
    bonusJpy: 5_000,
    allowanceJpy: 0,
    deductionJpy: 1_000,
    platformFeeShareDeductionJpy: 500,
    netPayJpy: 273_500,
    paidAmountJpy: 100_000,
    unpaidAmountJpy: 173_500,
    payoutRecordCount: 1,
  },
} as EmployeeCompensationResult;

let container: HTMLDivElement;
let root: Root;

describe("EmployeeSettlementPanel", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("shows payable, paid and unpaid totals and links to manual finance settlement", async () => {
    await act(async () => {
      root.render(
        <EmployeeSettlementPanel
          error=""
          loading={false}
          onRetry={vi.fn()}
          result={result}
        />,
      );
    });

    expect(container.textContent).toContain("273,500");
    expect(container.textContent).toContain("100,000");
    expect(container.textContent).toContain("173,500");
    expect(container.textContent).toContain("系统不会发起自动转账");
    expect(
      container.querySelector<HTMLAnchorElement>(
        'a[href="#/merchant-admin/finance?employee=s0000000047"]',
      ),
    ).not.toBeNull();
  });
});
