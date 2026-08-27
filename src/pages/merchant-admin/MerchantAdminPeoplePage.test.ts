import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { translateText, type Language } from "../../i18n/translations";

const source = readFileSync(new URL("./MerchantAdminPeoplePage.tsx", import.meta.url), "utf8");

describe("MerchantAdminPeoplePage formal scoped data", () => {
  it("uses server-paginated shop-scoped technicians and customers directly", () => {
    expect(source).toContain('backofficeRealDataApi.technicians("merchant-admin"');
    expect(source).toContain('backofficeRealDataApi.customers("merchant-admin"');
    expect(source).toContain("pageSize");
    expect(source).toContain("keyword:");
    expect(source).not.toContain("CustomerManagementModule");
    expect(source).not.toContain("TechnicianListModule");
    expect(source).not.toContain("mapCustomer");
    expect(source).not.toContain("mapBackofficeOrder");
  });

  it("retries only formal list reads and never renders an empty success state after an error", () => {
    expect(source).toContain("loadCoreReadWithTransientRetry");
    expect(source).toMatch(
      /loadCoreReadWithTransientRetry\(\s*\(\) => backofficeRealDataApi\.technicians\("merchant-admin", query\)\s*\)/
    );
    expect(source).toMatch(
      /loadCoreReadWithTransientRetry\(\s*\(\) => backofficeRealDataApi\.customers\("merchant-admin", query\)\s*\)/
    );
    expect(source).toContain("describeMerchantReadError(loadError, languageRef.current)");
    expect(source).toContain('!loading && !error && module === "staff"');
    expect(source).toContain('!loading && !error && module === "customers"');
    expect(source).toContain('!loading && !error && module !== "reviews" && total > 0');
    expect(source).not.toContain(
      "setError(loadError instanceof Error ? loadError.message : String(loadError))"
    );
  });

  it("keeps supported technician mutations on audited merchant endpoints", () => {
    expect(source).toContain('backofficeRealDataApi.updateTechnician("merchant-admin"');
    expect(source).toContain('backofficeRealDataApi.approveTechnician("merchant-admin"');
    expect(source).toContain('backofficeRealDataApi.deleteTechnician("merchant-admin"');
    expect(source).toContain("再次点击确认审核技师");
    expect(source).toContain("再次点击确认移除技师");
  });

  it("loads formal selected profiles into the shared detail panels", () => {
    expect(source).toContain('backofficeRealDataApi.technician("merchant-admin"');
    expect(source).toContain('backofficeRealDataApi.customer("merchant-admin"');
    expect(source).toContain("FormalTechnicianDetailPanel");
    expect(source).toContain("FormalCustomerDetailPanel");
    expect(source).toContain("selectedTechnicianId");
    expect(source).toContain("selectedCustomerId");
    expect(source).not.toContain("DetailGrid");
  });

  it("uses the executable shared request coordinator and mutation sequence", () => {
    expect(source.match(/createFormalDetailRequestCoordinator/g)?.length).toBeGreaterThanOrEqual(3);
    expect(source).toContain("runFormalDetailMutationSequence");
    expect(source).toContain("technicianDetailRequest.load(");
    expect(source).toContain("customerDetailRequest.load(");
    expect(source).toContain("technicianDetailRequest.retry()");
    expect(source).toContain("customerDetailRequest.retry()");
    expect(source).toContain("technicianDetailRequest.invalidate()");
    expect(source).toContain("customerDetailRequest.invalidate()");
    expect(source).toContain("technicianDetailRequest.activate()");
    expect(source).toContain("customerDetailRequest.activate()");
    expect(source).toContain("technicianDetailRequest.dispose()");
    expect(source).toContain("customerDetailRequest.dispose()");
    expect(source).not.toContain("technicianDetailRequestRef");
    expect(source).not.toContain("customerDetailRequestRef");
    expect(source).not.toContain("mountedRef");
    expect(source).toMatch(/const deleteTechnician[\s\S]*?closeTechnician\(\);[\s\S]*?await load\(\);/);
  });

  it("routes every new drawer status label through the current language", () => {
    expect(source).toContain("useOptionalI18n");
    expect(source).toContain('translateText("正在读取技师正式详情...", language)');
    expect(source).toContain('translateText("正在读取客户正式详情...", language)');
    expect(source).toContain('translateText("技师正式详情读取失败", languageRef.current)');
    expect(source).toContain('translateText("客户正式详情读取失败", languageRef.current)');
    expect(source).toContain('translateText("重试", language)');
    expect(source).not.toContain(">重试</Button>");
  });

  it("does not invent reviews or customer analytics", () => {
    expect(source).not.toContain("LTV");
    expect(source).not.toContain("churnRisk");
    expect(source).not.toContain("activeScore");
    expect(source).not.toContain("../../data/mock");
    expect(source).toContain("正式评价功能尚未启用");
    expect(source).toContain("当前不会展示模拟评价、评分或回复操作");
  });
});

const expectedFormalDetailCopy: Record<Language, [string, string, string, string, string]> = {
  zh: ["正在读取技师正式详情...", "正在读取客户正式详情...", "技师正式详情读取失败", "客户正式详情读取失败", "重试"],
  "zh-Hant": ["正在讀取技師正式詳情...", "正在讀取客戶正式詳情...", "技師正式詳情讀取失敗", "客戶正式詳情讀取失敗", "重試"],
  ja: ["スタッフの正式詳細を読み込み中...", "顧客の正式詳細を読み込み中...", "スタッフの正式詳細を読み込めませんでした", "顧客の正式詳細を読み込めませんでした", "再試行"],
  en: ["Loading technician production details...", "Loading customer production details...", "Technician production details failed to load", "Customer production details failed to load", "Retry"],
  ko: ["기사 정식 상세 정보를 불러오는 중...", "고객 정식 상세 정보를 불러오는 중...", "기사 정식 상세 정보를 불러오지 못했습니다", "고객 정식 상세 정보를 불러오지 못했습니다", "다시 시도"]
};

describe("formal people drawer translations", () => {
  it.each(Object.entries(expectedFormalDetailCopy) as Array<[Language, [string, string, string, string, string]]>)(
    "resolves exact loading, error, and retry copy for %s",
    (language, expected) => {
      expect([
        translateText("正在读取技师正式详情...", language),
        translateText("正在读取客户正式详情...", language),
        translateText("技师正式详情读取失败", language),
        translateText("客户正式详情读取失败", language),
        translateText("重试", language)
      ]).toEqual(expected);
    }
  );
});
