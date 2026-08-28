import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { translateText, type Language } from "../../i18n/translations";

const source = readFileSync(
  new URL("./MerchantAdminPeoplePage.tsx", import.meta.url),
  "utf8",
);

describe("MerchantAdminPeoplePage formal scoped data", () => {
  it("uses the canonical employee API for staff and keeps customers on the scoped formal API", () => {
    expect(source).toContain("merchantEmployeeApi.list(");
    expect(source).toContain(
      'backofficeRealDataApi.customers("merchant-admin"',
    );
    expect(source).toContain("pageSize");
    expect(source).toContain("keyword:");
    expect(source).not.toContain(
      'backofficeRealDataApi.technicians("merchant-admin"',
    );
    expect(source).not.toContain("CustomerManagementModule");
    expect(source).not.toContain("TechnicianListModule");
    expect(source).not.toContain("../../data/mock");
  });

  it("retries only formal list reads and never renders an empty success state after an error", () => {
    expect(source).toContain("loadCoreReadWithTransientRetry");
    expect(source).toMatch(
      /loadCoreReadWithTransientRetry\(\s*\(\) =>\s*merchantEmployeeApi\.list\(query\),?\s*\)/,
    );
    expect(source).toMatch(
      /loadCoreReadWithTransientRetry\(\s*\(\) =>\s*backofficeRealDataApi\.customers\("merchant-admin", query\),?\s*\)/,
    );
    expect(source).toContain(
      "describeMerchantReadError(loadError, languageRef.current)",
    );
    expect(source).toContain('!loading && !error && module === "staff"');
    expect(source).toContain('!loading && !error && module === "customers"');
    expect(source).toMatch(
      /!loading\s*&&\s*!error\s*&&\s*module !== "reviews"\s*&&\s*total > 0/,
    );
  });

  it("wires real profile and relationship edits and removes legacy technician mutations", () => {
    expect(source).toContain("merchantEmployeeApi.updateProfile(");
    expect(source).toContain("merchantEmployeeApi.updateAffiliation(");
    expect(source).toContain("runFormalDetailMutationSequence");
    expect(source).toContain('setEmployeeSaving("profile")');
    expect(source).toContain('setEmployeeSaving("affiliation")');
    expect(source).not.toContain(
      'backofficeRealDataApi.updateTechnician("merchant-admin"',
    );
    expect(source).not.toContain(
      'backofficeRealDataApi.approveTechnician("merchant-admin"',
    );
    expect(source).not.toContain(
      'backofficeRealDataApi.deleteTechnician("merchant-admin"',
    );
    expect(source).not.toContain("再次点击确认审核技师");
    expect(source).not.toContain("再次点击确认移除技师");
  });

  it("presents canonical NeeDoID, relationship, work status, contact and verification columns", () => {
    expect(source).toContain("row.needoId");
    expect(source).toContain("row.affiliation.relationshipType");
    expect(source).toContain("row.affiliation.workStatus");
    expect(source).toContain("row.email");
    expect(source).toContain("row.phone");
    expect(source).toContain("row.verifiedAt");
    expect(source).not.toContain("row.employmentType");
    expect(source).not.toContain("getMerchantStaffEmploymentLabel");
  });

  it("loads the employee card by NeeDoID while preserving the customer formal panel", () => {
    expect(source).toContain("merchantEmployeeApi.detail(needoId)");
    expect(source).toContain('backofficeRealDataApi.customer("merchant-admin"');
    expect(source).toContain("EmployeeDetailCard");
    expect(source).toContain("FormalCustomerDetailPanel");
    expect(source).not.toContain("FormalTechnicianDetailPanel");
    expect(source).toContain("selectedEmployeeNeedoId");
    expect(source).toContain("selectedCustomerId");
    expect(source).not.toContain("selectedTechnicianId");
    expect(source).not.toContain("DetailGrid");
  });

  it("uses the shared request coordinator with canonical string employee identifiers", () => {
    expect(
      source.match(/createFormalDetailRequestCoordinator/g)?.length,
    ).toBeGreaterThanOrEqual(3);
    expect(source).toContain(
      "createFormalDetailRequestCoordinator<MerchantEmployee, string>",
    );
    expect(source).toContain("employeeDetailRequest.load(employee.needoId)");
    expect(source).toContain("employeeDetailRequest.retry()");
    expect(source).toContain("employeeDetailRequest.invalidate()");
    expect(source).toContain("employeeDetailRequest.activate()");
    expect(source).toContain("employeeDetailRequest.dispose()");
    expect(source).toContain("customerDetailRequest.load(customer.id)");
    expect(source).toContain("customerDetailRequest.retry()");
  });

  it("routes drawer status labels through the current language", () => {
    expect(source).toContain("useOptionalI18n");
    expect(source).toContain(
      'translateText("正在读取员工详细信息卡...", language)',
    );
    expect(source).toContain('"员工详细信息卡读取失败"');
    expect(source).toContain("translateText(fallback, language)");
    expect(source).toContain(
      'translateText("正在读取客户正式详情...", language)',
    );
    expect(source).toContain('"客户正式详情读取失败"');
    expect(source).toContain('translateText("重试", language)');
    expect(source).not.toContain(">重试</Button>");
  });

  it("does not invent reviews, payroll, schedule, or customer analytics", () => {
    expect(source).not.toContain("LTV");
    expect(source).not.toContain("churnRisk");
    expect(source).not.toContain("activeScore");
    expect(source).not.toContain("薪酬设置");
    expect(source).not.toContain("时间线");
    expect(source).not.toContain("UnifiedUserCalendar");
    expect(source).toContain("正式评价功能尚未启用");
    expect(source).toContain("当前不会展示模拟评价、评分或回复操作");
  });
});

const expectedEmployeeDetailCopy: Record<Language, [string, string]> = {
  zh: ["正在读取员工详细信息卡...", "员工详细信息卡读取失败"],
  "zh-Hant": ["正在讀取員工詳細資訊卡...", "員工詳細資訊卡讀取失敗"],
  ja: [
    "スタッフ詳細情報カードを読み込み中...",
    "スタッフ詳細情報カードを読み込めませんでした",
  ],
  en: ["Loading staff detail card...", "Staff detail card failed to load"],
  ko: [
    "스태프 상세 정보 카드를 불러오는 중...",
    "스태프 상세 정보 카드를 불러오지 못했습니다",
  ],
};

describe("employee detail drawer translations", () => {
  it.each(
    Object.entries(expectedEmployeeDetailCopy) as Array<
      [Language, [string, string]]
    >,
  )("resolves exact loading and error copy for %s", (language, expected) => {
    expect([
      translateText("正在读取员工详细信息卡...", language),
      translateText("员工详细信息卡读取失败", language),
    ]).toEqual(expected);
  });
});
