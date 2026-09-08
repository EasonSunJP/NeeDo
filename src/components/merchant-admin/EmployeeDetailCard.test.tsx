// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MerchantEmployee } from "../../features/merchant-admin/employeeApi";
import type { PayrollSchedulePolicyResult } from "../../api/payrollSchedulePolicy";
import type { EmployeeCompensationResult } from "../../api/employeeCompensation";
import { translateText } from "../../i18n/translations";
import { EmployeeDetailCard } from "./EmployeeDetailCard";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../i18n/I18nProvider", () => ({
  useOptionalI18n: () => ({ language: "zh", setLanguage: vi.fn() }),
}));

vi.mock("./EmployeeSchedulePanel", () => ({
  EmployeeSchedulePanel: ({ employee }: { employee: MerchantEmployee }) => (
    <section data-testid="employee-schedule-panel">
      员工日程 · {employee.needoId}
    </section>
  ),
}));

vi.mock("./EmployeeCompensationPanel", () => ({
  EmployeeCompensationPanel: ({
    result,
  }: {
    result: EmployeeCompensationResult | null;
  }) => (
    <section data-testid="employee-compensation-panel">
      薪酬与结算 · {result?.employee.needoId}
    </section>
  ),
}));

const employee: MerchantEmployee = {
  needoId: "NEEDO-S-47",
  displayName: "斉藤 健太",
  avatarUrl: null,
  email: "kenta@example.jp",
  phone: "+81 90 1234 5678",
  profileStatus: "verified",
  verifiedAt: "2026-08-20T00:00:00.000Z",
  profile: {
    bio: "リラクゼーション担当",
    city: "東京都渋谷区",
    serviceArea: "渋谷区・港区",
    yearsExperience: 8,
    updatedAt: "2026-08-28T00:00:00.000Z",
  },
  account: {
    isActive: true,
    lastLoginAt: "2026-08-28T01:00:00.000Z",
  },
  affiliation: {
    id: 987,
    relationshipType: "partner",
    workStatus: "active",
    startsAt: "2026-06-01T00:00:00.000Z",
    endsAt: null,
    shop: {
      id: 654,
      publicId: "NEEDO-M-16",
      name: "LifeDance 渋谷店",
    },
  },
};

const payrollPolicy: PayrollSchedulePolicyResult = {
  configured: true,
  source: "shop",
  inheritShopPolicy: true,
  shopPolicy: {
    id: 3,
    shopId: 654,
    cadence: "monthly",
    weeklySettlementWeekday: null,
    monthlySettlementDay: 25,
    holidayAdjustment: "next_business_day",
    timezone: "Asia/Tokyo",
    effectiveFrom: "2026-08-01",
    effectiveTo: null,
    status: "active",
    version: 3,
    createdById: null,
    updatedById: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
  employeeOverride: null,
  effectivePolicy: {
    id: 3,
    version: 3,
    cadence: "monthly",
    weeklySettlementWeekday: null,
    monthlySettlementDay: 25,
    holidayAdjustment: "next_business_day",
    timezone: "Asia/Tokyo",
    effectiveFrom: "2026-08-01",
    effectiveTo: null,
  },
  preview: {
    periodStart: "2026-07-26",
    periodEnd: "2026-08-25",
    naturalSettlementDate: "2026-08-25",
    plannedPaymentDate: "2026-08-25",
    adjustmentReason: null,
  },
};

const compensation: EmployeeCompensationResult = {
  employee: { needoId: "NEEDO-S-47" },
  profile: {
    sourceType: "shop_default",
    name: "店铺默认薪酬规则",
    wageMode: "commission",
    baseSalaryJpy: 0,
    hourlyRateJpy: 0,
    dailyRateJpy: 0,
    fixedOrderPayJpy: 0,
    commissionRatePercent: 30,
    extensionCommissionRatePercent: 35,
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
    payslipId: null,
    periodStart: null,
    periodEnd: null,
    status: null,
    disputeStatus: null,
    completedOrderCount: 0,
    workedMinutes: 0,
    serviceIncomeJpy: 0,
    basePayJpy: 0,
    commissionJpy: 0,
    bonusJpy: 0,
    allowanceJpy: 0,
    deductionJpy: 0,
    platformFeeShareDeductionJpy: 0,
    netPayJpy: 0,
    paidAmountJpy: 0,
    unpaidAmountJpy: 0,
    payoutRecordCount: 0,
  },
};

let container: HTMLDivElement;
let root: Root;

async function renderCard(
  props: Partial<Parameters<typeof EmployeeDetailCard>[0]> = {},
) {
  await act(async () => {
    root.render(
      <EmployeeDetailCard
        compensation={compensation}
        compensationError=""
        compensationLoading={false}
        compensationPreview={null}
        compensationPreviewing={false}
        compensationSaving={false}
        employee={employee}
        error=""
        onPreviewCompensation={vi.fn(async () => undefined)}
        onRetryCompensation={vi.fn()}
        onSaveCompensation={vi.fn(async () => undefined)}
        payrollPolicy={payrollPolicy}
        payrollPolicyError=""
        payrollPolicyLoading={false}
        payrollPolicySaving={false}
        onRetryPayrollPolicy={vi.fn()}
        onSavePayrollPolicy={vi.fn(async () => undefined)}
        onSaveAffiliation={vi.fn(async () => undefined)}
        onSaveProfile={vi.fn(async () => undefined)}
        saving={null}
        timeline={{
          list: [
            {
              id: "audit-501",
              at: "2026-08-28T15:43:00.000Z",
              actorName: "LifeDance 管理员",
              actorAvatarUrl: "/admin-avatar.png",
              actorRole: "基本资料",
              message: "更新了姓名、城市",
              tone: "accent",
            },
          ],
          total: 1,
          page: 1,
          page_size: 20,
        }}
        timelineError=""
        timelineLoading={false}
        onRetryTimeline={vi.fn()}
        onTimelinePageChange={vi.fn()}
        onTimelinePageSizeChange={vi.fn()}
        onSubmitTimelineComment={vi.fn(async () => undefined)}
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

async function setInput(testId: string, value: string) {
  const input = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[data-testid="${testId}"]`,
  );
  if (!input) throw new Error(`Input not found: ${testId}`);
  const prototype =
    input instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("EmployeeDetailCard", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("uses six mounted detail tabs and preserves an in-progress profile draft", async () => {
    await renderCard();

    expect(button("基础资料").getAttribute("aria-selected")).toBe("true");
    expect(
      container.querySelector<HTMLElement>('[data-testid="employee-schedule-panel"]')
        ?.closest<HTMLElement>('[role="tabpanel"]')?.hidden,
    ).toBe(true);

    await act(async () => button("编辑").click());
    await setInput("employee-display-name", "未提交的姓名");
    await act(async () => button("员工日程").click());
    expect(button("员工日程").getAttribute("aria-selected")).toBe("true");
    expect(
      container.querySelector<HTMLElement>('[data-testid="employee-schedule-panel"]')
        ?.closest<HTMLElement>('[role="tabpanel"]')?.hidden,
    ).toBe(false);

    await act(async () => button("基础资料").click());
    expect(
      container.querySelector<HTMLInputElement>(
        '[data-testid="employee-display-name"]',
      )?.value,
    ).toBe("未提交的姓名");
    expect(
      ["基础资料", "从属与账号", "员工日程", "薪酬与分成", "结算记录", "员工动态"].every(
        (label) => button(label).getAttribute("role") === "tab",
      ),
    ).toBe(true);
  });

  it("shows the NeeDo identity, current relationship, contact and account truth without internal ids", async () => {
    await renderCard();

    expect(container.textContent).toContain("NEEDO-S-47");
    expect(container.textContent).toContain("斉藤 健太");
    expect(container.textContent).toContain("合作技师");
    expect(container.textContent).not.toContain("雇佣形式");
    expect(container.textContent).toContain("在职");
    expect(container.textContent).toContain("LifeDance 渋谷店");
    expect(container.textContent).toContain("kenta@example.jp");
    expect(container.textContent).toContain("+81 90 1234 5678");
    expect(container.textContent).toContain("已验证");
    expect(container.textContent).toContain("启用");
    expect(container.textContent).not.toContain("987");
    expect(container.textContent).not.toContain("654");
    expect(container.textContent).not.toContain("薪酬设置");
    expect(container.textContent).toContain("薪酬与结算 · NEEDO-S-47");
    expect(container.textContent).not.toContain("时间线");
    expect(container.textContent).toContain("员工动态");
    expect(container.textContent).toContain("LifeDance 管理员（基本资料）：更新了姓名、城市");
    expect(container.textContent).toContain("员工日程 · NEEDO-S-47");
  });

  it("keeps the affiliation relationship fixed to partner", async () => {
    await renderCard();
    await act(async () => button("从属与账号").click());
    await act(async () => button("编辑从属关系").click());

    expect(container.querySelector('option[value="exclusive"]')).toBeNull();
    expect(container.textContent).not.toContain("专属技师");
  });

  it("uses the shared event timeline and persists comments through the parent", async () => {
    const onSubmitTimelineComment = vi.fn(async () => undefined);
    await renderCard({ onSubmitTimelineComment });

    await act(async () => button("评论").click());
    const textarea = container.querySelector<HTMLTextAreaElement>(
      'textarea[placeholder="写下员工档案备注..."]',
    );
    expect(textarea).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      setter?.call(textarea, "已确认本月结算。");
      textarea?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("发送").click());

    expect(onSubmitTimelineComment).toHaveBeenCalledWith("已确认本月结算。");
  });

  it("renders only lifecycle entries returned by the paginated timeline contract", async () => {
    await renderCard();
    await act(async () => button("员工动态").click());

    expect(container.textContent).toContain("更新了姓名、城市");
    expect(container.textContent).not.toContain("员工档案已通过验证");
    expect(container.textContent).not.toContain("加入店铺并建立员工从属关系");
  });

  it("submits edited basic profile fields through the real mutation contract", async () => {
    const onSaveProfile = vi.fn(async () => undefined);
    await renderCard({ onSaveProfile });

    await act(async () => button("编辑").click());
    await setInput("employee-display-name", "斉藤 健太郎");
    await setInput("employee-city", "東京都港区");
    await setInput("employee-service-area", "港区");
    await setInput("employee-years-experience", "9");
    await setInput("employee-bio", "正式资料更新");
    await act(async () => button("保存变更").click());

    expect(onSaveProfile).toHaveBeenCalledWith({
      bio: "正式资料更新",
      city: "東京都港区",
      displayName: "斉藤 健太郎",
      serviceArea: "港区",
      yearsExperience: 9,
    });
  });

  it("keeps failed edits visible and cancel restores the server snapshot", async () => {
    const onSaveProfile = vi.fn(async () => {
      throw new Error("conflict");
    });
    await renderCard({ error: "保存失败，请检查后重试", onSaveProfile });

    await act(async () => button("编辑").click());
    await setInput("employee-display-name", "未保存姓名");
    await act(async () => button("保存变更").click());

    expect(
      container.querySelector<HTMLInputElement>(
        '[data-testid="employee-display-name"]',
      )?.value,
    ).toBe("未保存姓名");
    expect(container.textContent).toContain("保存失败，请检查后重试");

    await act(async () => button("取消").click());
    expect(container.textContent).toContain("斉藤 健太");
    expect(container.textContent).not.toContain("未保存姓名");
  });

  it("updates the current shop relationship without exposing another shop schedule", async () => {
    const onSaveAffiliation = vi.fn(async () => undefined);
    await renderCard({ onSaveAffiliation });

    await act(async () => button("编辑从属关系").click());
    const relationship = container.querySelector<HTMLSelectElement>(
      '[data-testid="employee-relationship-type"]',
    )!;
    const workStatus = container.querySelector<HTMLSelectElement>(
      '[data-testid="employee-work-status"]',
    )!;
    await act(async () => {
      relationship.value = "partner";
      relationship.dispatchEvent(new Event("change", { bubbles: true }));
      workStatus.value = "on_leave";
      workStatus.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => button("保存从属关系").click());

    expect(onSaveAffiliation).toHaveBeenCalledWith({
      endsAt: null,
      relationshipType: "partner",
      startsAt: "2026-06-01T00:00:00.000Z",
      workStatus: "on_leave",
    });
  });

  it("shows the inherited payroll schedule and can save a real employee override", async () => {
    const onSavePayrollPolicy = vi.fn(async () => undefined);
    await renderCard({ onSavePayrollPolicy });

    expect(container.textContent).toContain("工资结算周期");
    expect(container.textContent).toContain("继承店铺规则");
    expect(container.textContent).toContain("2026/08/25");
    await act(async () => button("编辑结算周期").click());
    const inheritance = container.querySelector<HTMLInputElement>(
      '[data-testid="employee-payroll-inherit"]',
    )!;
    await act(async () => inheritance.click());
    const cadence = container.querySelector<HTMLSelectElement>(
      '[data-testid="payroll-cadence"]',
    )!;
    await act(async () => {
      cadence.value = "weekly";
      cadence.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => button("保存结算周期").click());

    expect(onSavePayrollPolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        inheritShopPolicy: false,
        cadence: "weekly",
        weeklySettlementWeekday: expect.any(Number),
        monthlySettlementDay: null,
        timezone: "Asia/Tokyo",
      }),
    );
  });

  it("keeps every information tab available but removes mutations in read-only order context", async () => {
    await renderCard({ readOnly: true });

    expect(button("基础资料").getAttribute("role")).toBe("tab");
    expect(button("员工日程").getAttribute("role")).toBe("tab");
    expect(container.textContent).not.toContain("编辑从属关系");
    expect(container.textContent).not.toContain("编辑结算周期");
    expect(container.textContent).not.toContain("写下员工档案备注");
    expect(
      Array.from(container.querySelectorAll("button")).some(
        (candidate) => candidate.textContent?.trim() === "编辑",
      ),
    ).toBe(false);
  });

  it("provides exact merchant-card copy in every supported non-source language", () => {
    expect(translateText("合作技师", "ja")).toBe("パートナースタッフ");
    expect(translateText("工作状态", "en")).toBe("Work Status");
    expect(translateText("保存从属关系", "ko")).toBe("소속 관계 저장");
    expect(translateText("工资结算周期", "ja")).toBe("給与締めサイクル");
    expect(translateText("计划支付日", "en")).toBe(
      "Planned payment date",
    );
  });
});
