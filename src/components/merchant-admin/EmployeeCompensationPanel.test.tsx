// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmployeeCompensationResult } from "../../api/employeeCompensation";
import { EmployeeCompensationPanel } from "./EmployeeCompensationPanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../i18n/I18nProvider", () => ({
  useOptionalI18n: () => ({ language: "zh", setLanguage: vi.fn() }),
}));

const compensation: EmployeeCompensationResult = {
  employee: { needoId: "s0000000047" },
  profile: {
    sourceType: "technician_override",
    name: "LifeDance 正式员工薪酬",
    wageMode: "base_plus_commission",
    baseSalaryJpy: 230_000,
    hourlyRateJpy: 1_500,
    dailyRateJpy: 0,
    fixedOrderPayJpy: 0,
    commissionRatePercent: 20,
    guaranteedMinimumJpy: 180_000,
    ndpFeeBearer: "split",
    technicianNdpSharePercent: 30,
    bonusRules: [],
    deductionRules: [],
    version: 2,
    status: "active",
    effectiveFrom: "2026-06-01T00:00:00.000Z",
    effectiveTo: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-08-29T00:00:00.000Z",
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
};

let container: HTMLDivElement;
let root: Root;

async function renderPanel(
  props: Partial<Parameters<typeof EmployeeCompensationPanel>[0]> = {},
) {
  await act(async () => {
    root.render(
      <EmployeeCompensationPanel
        error=""
        loading={false}
        onPreview={vi.fn(async () => undefined)}
        onRetry={vi.fn()}
        onSave={vi.fn(async () => undefined)}
        preview={null}
        previewing={false}
        result={compensation}
        saving={false}
        {...props}
      />,
    );
  });
}

function button(label: string) {
  const match = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button"),
  ).find((candidate) => candidate.textContent?.trim() === label);
  if (!match) throw new Error(`Button not found: ${label}`);
  return match;
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("EmployeeCompensationPanel", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("shows the persisted rule, current payroll metrics and manual-payment boundary", async () => {
    await renderPanel();

    expect(container.textContent).toContain("薪酬与结算");
    expect(container.textContent).toContain("员工单独规则");
    expect(container.textContent).toContain("固定工资 + 分成");
    expect(container.textContent).toContain("230,000");
    expect(container.textContent).toContain("20%");
    expect(container.textContent).toContain("273,500");
    expect(container.textContent).toContain("100,000");
    expect(container.textContent).toContain("173,500");
    expect(container.textContent).toContain("财务人员手动登记");
    const financeLink = container.querySelector<HTMLAnchorElement>(
      'a[href="#/merchant-admin/finance?employee=s0000000047"]',
    );
    expect(financeLink?.textContent).toContain("前往财务结算");
  });

  it("submits salary and commission edits without changing the server snapshot on failure", async () => {
    const onSave = vi.fn(async () => {
      throw new Error("conflict");
    });
    await renderPanel({ error: "薪酬保存失败", onSave });

    await act(async () => button("编辑薪酬").click());
    const baseSalary = container.querySelector<HTMLInputElement>(
      '[data-testid="employee-compensation-base-salary"]',
    )!;
    const commission = container.querySelector<HTMLInputElement>(
      '[data-testid="employee-compensation-commission"]',
    )!;
    await act(async () => {
      setInputValue(baseSalary, "240000");
      setInputValue(commission, "22");
    });
    await act(async () => button("保存薪酬规则").click());

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "LifeDance 正式员工薪酬",
        wageMode: "base_plus_commission",
        baseSalaryJpy: 240_000,
        commissionRatePercent: 22,
      }),
    );
    expect(
      container.querySelector<HTMLInputElement>(
        '[data-testid="employee-compensation-base-salary"]',
      )?.value,
    ).toBe("240000");
    expect(container.textContent).toContain("薪酬保存失败");

    await act(async () => button("取消").click());
    expect(container.textContent).toContain("230,000");
  });
});
