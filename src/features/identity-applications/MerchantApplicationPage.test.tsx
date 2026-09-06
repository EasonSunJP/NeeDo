// @vitest-environment jsdom
import { act, StrictMode, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Store, StorePresentationConfig } from "../../types/domain";
import type { Language } from "../../i18n/translations";
import { platformMembershipSelfApi } from "../platform-membership/api";
import { shopTaxonomyApi } from "../shop-taxonomy/api";
import { identityApplicationsApi, type IdentityApplication } from "./api";
import { MerchantApplicationPage } from "./MerchantApplicationPage";
import { merchantApplicationDraftMemory } from "./merchantApplicationDraftMemory";

const context = vi.hoisted(() => ({ accountId: 41, language: "zh" as Language, preview: null as Store | null, presentation: null as StorePresentationConfig | null }));
vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ session: { id: context.accountId }, refreshSession: vi.fn() })
}));
vi.mock("../../i18n/I18nProvider", () => ({ useI18n: () => ({ language: context.language }) }));
// Leave form controls, taxonomy, translation resolution and routing real; isolate unrelated page chrome/preview internals.
vi.mock("../../components/client-ui/SettingsDirectory", () => ({
  SettingsDetailPage: ({ children, headerOverlay }: { children: ReactNode; headerOverlay?: ReactNode }) => <><header>{headerOverlay}</header><main>{children}</main></>
}));
vi.mock("../../pages/user/StoreDetailPage", () => ({
  StoreDetailExperience: ({ store, presentationOverride }: { store: Store; presentationOverride?: StorePresentationConfig }) => { context.preview = store; context.presentation = presentationOverride ?? null; return null; }
}));

const corporateDraft: IdentityApplication = {
  id: 71, userId: 41, type: "merchant", status: "draft", version: 3, rejectionReason: null, purgeAt: null,
  technicianDetail: null,
  merchantDetail: {
    applicantKind: "corporate", corporateLegalName: "株式会社さくら", corporateLegalNameKana: "カブシキガイシャサクラ",
    representativeName: "山田太郎", representativeNameKana: "ヤマダタロウ", responsiblePersonName: "佐藤 花子",
    shopName: "さくら銀座店", businessAddress: "東京都中央区銀座", contactPhone: "0312345678",
    showcaseDraft: { responsibleFamilyName: "佐藤", responsibleGivenName: "花子", description: "地域の皆様のためのお店", priceLabel: "￥8,800 ~ ￥12,800" },
    serviceCategoryIds: [1], businessKeywordIds: [10], bankAccountId: 8, contractAcceptanceId: null,
    mediaPurposes: [], bankVerificationStatus: "verified", eKycVerified: false
  }
};

function VerificationDetour() {
  const navigate = useNavigate();
  return <button onClick={() => navigate(-1)}>Return to application</button>;
}

describe("MerchantApplicationPage behavior", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    context.accountId += 1;
    context.language = "zh";
    context.preview = null;
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    Object.defineProperty(URL, "createObjectURL", { configurable: true, writable: true, value: vi.fn(() => "blob:shop-cover") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: vi.fn() });
    vi.spyOn(identityApplicationsApi, "listMine").mockResolvedValue({ list: [], total: 0, page: 1, page_size: 20 });
    vi.spyOn(identityApplicationsApi, "createMerchantDraft").mockResolvedValue({ ...corporateDraft, version: 1 });
    vi.spyOn(identityApplicationsApi, "updateMerchantShowcase").mockResolvedValue({ ...corporateDraft, version: 4 });
    vi.spyOn(identityApplicationsApi, "uploadMedia").mockResolvedValue({ id: 81, applicationVersion: 5 });
    vi.spyOn(platformMembershipSelfApi, "getMine").mockResolvedValue({
      tierCode: "free", tierVersionPublicId: "tier-free", multiplier: 1, expiresAt: null, ekycVerified: false, benefits: [],
      theme: { detailAccentColor: "#000000", detailSurfaceColor: "#000000", detailSurfaceMiddleColor: "#000000", detailSurfaceBottomColor: "#000000", detailItemSurfaceColor: "#000000", detailOuterBorderColor: "#000000", detailItemBorderColor: "#000000", detailAvatarBorderColor: "#000000", simpleTopColor: "#000000", simpleBottomColor: "#000000" }
    });
    vi.spyOn(shopTaxonomyApi, "listCategories").mockResolvedValue({ list: [
      { id: 1, code: "massage", label: "按摩", qualificationPolicy: "REVIEW_REQUIRED" }
    ], total: 1, page: 1, page_size: 100 });
    vi.spyOn(shopTaxonomyApi, "listKeywords").mockResolvedValue({ list: [
      { id: 10, categoryId: 1, code: "home", label: "上门按摩", qualificationPolicy: "OPEN" }
    ], total: 1, page: 1, page_size: 100 });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function render(strict = false) {
    const router = (
      <MemoryRouter initialEntries={["/apply"]}>
        <Routes>
          <Route path="/apply" element={<MerchantApplicationPage />} />
          <Route path="/me/settings/verification" element={<VerificationDetour />} />
        </Routes>
      </MemoryRouter>
    );
    await act(async () => root.render(strict ? <StrictMode>{router}</StrictMode> : router));
  }

  function button(text: string) {
    const found = Array.from(container.querySelectorAll("button")).find((item) => item.textContent === text);
    expect(found, text).toBeDefined();
    return found!;
  }

  function input(label: string) {
    const field = Array.from(container.querySelectorAll("label")).find((item) => item.firstElementChild?.textContent?.startsWith(label));
    const found = field?.querySelector("input");
    expect(found, label).toBeTruthy();
    return found!;
  }

  async function enter(label: string, value: string) {
    await act(async () => {
      const field = input(label);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  async function enterNewCorporateDraft() {
    await act(async () => button("法人名义").click());
    for (const [label, value] of [
      ["姓", "佐藤"], ["名", "花子"], ["法人或代表者姓名片假名", "カブシキガイシャシンテン"],
      ["法人或代表者姓名", "株式会社新店"], ["店铺名称", "新店"], ["店铺地址", "東京都千代田区"], ["联系电话", "0398765432"]
    ]) await enter(label, value);
    await act(async () => {
      const textarea = container.querySelector("textarea")!;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "新しいお店の紹介");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("按摩").click());
  }

  async function chooseBank(code: string) {
    const trigger = container.querySelector<HTMLButtonElement>('[role="combobox"][aria-label="银行名称"]');
    expect(trigger).not.toBeNull();
    if (trigger!.getAttribute("aria-expanded") !== "true") await act(async () => trigger!.click());
    const option = container.querySelector<HTMLButtonElement>(`[role="option"][data-value="${code}"]`);
    expect(option).not.toBeNull();
    await act(async () => option!.click());
  }

  async function chooseCover() {
    const file = new File(["selected image bytes"], "first-shop.png", { type: "image/png" });
    await act(async () => {
      const field = container.querySelector('input[type="file"]')!;
      Object.defineProperty(field, "files", { configurable: true, value: [file] });
      field.dispatchEvent(new Event("change", { bubbles: true }));
    });
    return file;
  }

  it("keeps an unconfigured station empty instead of displaying the legacy Ginza example", async () => {
    await render();
    expect(input("最近车站").value).toBe("");
    expect(input("交通说明").value).toBe("");
    expect(context.presentation).toMatchObject({ station: "未填写", distance: "", favoriteCount: 0 });
    expect(JSON.stringify(context.presentation)).not.toContain("银座");
  });

  it("restores, previews and saves station access in the formal showcase draft", async () => {
    const saved = { ...corporateDraft, merchantDetail: { ...corporateDraft.merchantDetail!, showcaseDraft: {
      ...corporateDraft.merchantDetail!.showcaseDraft, nearestStation: "新宿駅 南口", stationAccess: "南口を右へ", stationTravelMinutes: 5
    } } };
    vi.mocked(identityApplicationsApi.listMine).mockResolvedValue({ list: [saved], total: 1, page: 1, page_size: 20 });
    await render();
    expect(input("最近车站").value).toBe("新宿駅 南口");
    expect(context.presentation).toMatchObject({ station: "新宿駅 南口", distance: "5 分钟" });
    expect(input("到店时间").value).toBe("5");
    await enter("到店时间", "３");
    await enter("最近车站", "  東京駅 八重洲口  ");
    await enter("交通说明", "  徒歩3分  ");
    expect(context.presentation).toMatchObject({ station: "東京駅 八重洲口", distance: "3 分钟" });
    await act(async () => button("本人确认（eKYC）").click());
    await act(async () => button("Return to application").click());
    expect(input("最近车站").value.trim()).toBe("東京駅 八重洲口");
    expect(input("交通说明").value.trim()).toBe("徒歩3分");
    await act(async () => button("下一步：银行与身份").click());
    expect(identityApplicationsApi.updateMerchantShowcase).toHaveBeenCalledWith(71, expect.objectContaining({
      showcaseDraft: expect.objectContaining({ nearestStation: "東京駅 八重洲口", stationAccess: "徒歩3分", stationTravelMinutes: 3 })
    }));
  });

  it.each(["individual", "corporate"] as const)("continues the %s bank step without requesting a representative photo", async (applicantKind) => {
    vi.mocked(identityApplicationsApi.listMine).mockResolvedValue({ list: [{ ...corporateDraft, merchantDetail: {
      ...corporateDraft.merchantDetail!, applicantKind
    } }], total: 1, page: 1, page_size: 20 });
    vi.spyOn(identityApplicationsApi, "bindMerchantBankAccount").mockResolvedValue({ applicationVersion: 6, accountNumberMasked: "•••4567", holderMatched: true });
    vi.spyOn(identityApplicationsApi, "getCurrentContract").mockResolvedValue({ type: "merchant", version: "1", effectiveAt: "2026-08-01T00:00:00Z", language: "zh-CN", text: "合同", contentHash: "a".repeat(64) });
    await render();
    await act(async () => button("下一步：银行与身份").click());
    expect(container.textContent).not.toContain("法人或代表者证件照片");
    await chooseBank("0005");
    for (const [label, value] of [["支店代码", "００１"], ["支店名称", "本店"], ["账号", "1234567"], ["账户名义人", "カ）サクラ"]]) await enter(label, value);
    if (applicantKind === "corporate") {
      const fileInput = container.querySelector('input[type="file"]')!;
      Object.defineProperty(fileInput, "files", { configurable: true, value: [new File(["registration"], "registration.png", { type: "image/png" })] });
      await act(async () => fileInput.dispatchEvent(new Event("change", { bubbles: true })));
    }
    await act(async () => button("下一步：收费规则与合同").click());
    expect(identityApplicationsApi.bindMerchantBankAccount).toHaveBeenCalled();
    expect(button("提交申请")).toBeTruthy();
    expect(vi.mocked(identityApplicationsApi.uploadMedia).mock.calls.some((call) => call[1] === "representative_identity")).toBe(false);
  });

  it("shows dismissible bank errors in the header overlay instead of the form flow", async () => {
    vi.mocked(identityApplicationsApi.listMine).mockResolvedValue({ list: [{ ...corporateDraft, merchantDetail: {
      ...corporateDraft.merchantDetail!, applicantKind: "individual"
    } }], total: 1, page: 1, page_size: 20 });
    await render();
    await act(async () => button("下一步：银行与身份").click());
    await act(async () => button("下一步：收费规则与合同").click());
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("请选择银行");
    expect(alert?.closest("header")).not.toBeNull();
    expect(container.querySelector("main [role=alert]")).toBeNull();
    const dismiss = alert?.querySelector("button");
    expect(dismiss).toBeTruthy();
    await act(async () => dismiss!.click());
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await act(async () => button("下一步：收费规则与合同").click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("请选择银行");
  });

  it("selects real Japanese banks, fills their code, and identifies a missing holder", async () => {
    vi.mocked(identityApplicationsApi.listMine).mockResolvedValue({ list: [{ ...corporateDraft, merchantDetail: { ...corporateDraft.merchantDetail!, applicantKind: "individual" } }], total: 1, page: 1, page_size: 20 });
    await render();
    await act(async () => button("下一步：银行与身份").click());
    await act(async () => container.querySelector<HTMLButtonElement>('[role="combobox"][aria-label="银行名称"]')!.click());
    const bankSelect = container.querySelector('[role="listbox"]');
    expect(bankSelect?.textContent).toContain("三井住友銀行");
    expect(bankSelect?.textContent).toContain("楽天銀行");
    expect(bankSelect?.textContent).toContain("PayPay銀行");
    expect(bankSelect?.textContent).toContain("GMOあおぞらネット銀行");
    expect(bankSelect?.textContent).toContain("ドコモSMTBネット銀行");
    await chooseBank("0009");
    expect(input("银行代码").value).toBe("0009");
    expect(input("银行代码").readOnly).toBe(true);
    for (const [label, value] of [["支店代码", "００１"], ["支店名称", "本店"], ["账号", "１２３４５６７"]]) await enter(label, value);
    await act(async () => button("下一步：收费规则与合同").click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("请输入账户名义人");
    expect(input("支店代码").value).toBe("001");
    expect(input("账号").value).toBe("1234567");
    await enter("账户名义人", "ヤマダタロウ");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await chooseBank("0036");
    expect(input("银行代码").value).toBe("0036");
    expect(input("支店代码").value).toBe("");
    expect(input("支店名称").value).toBe("");
    expect(input("账号").value).toBe("");
  });

  it("keeps unlisted financial institutions available through manual entry", async () => {
    vi.mocked(identityApplicationsApi.listMine).mockResolvedValue({ list: [{ ...corporateDraft, merchantDetail: { ...corporateDraft.merchantDetail!, applicantKind: "individual" } }], total: 1, page: 1, page_size: 20 });
    await render();
    await act(async () => button("下一步：银行与身份").click());
    await chooseBank("custom");
    await enter("金融机构名称", "信用金庫");
    await enter("银行代码", "１２３４");
    expect(input("银行代码").value).toBe("1234");
    expect(input("银行代码").readOnly).toBe(false);
    await chooseBank("0009");
    expect(input("银行代码").readOnly).toBe(true);
    expect(container.querySelector('input[aria-label="金融机构名称"]')).toBeNull();
  });

  it("keeps the saved showcase version when its image upload fails", async () => {
    vi.mocked(identityApplicationsApi.listMine).mockResolvedValue({ list: [corporateDraft], total: 1, page: 1, page_size: 20 });
    vi.mocked(identityApplicationsApi.uploadMedia).mockRejectedValue(new Error("error.network.timeout"));
    await render();
    await chooseCover();
    await act(async () => button("下一步：银行与身份").click());
    expect(identityApplicationsApi.updateMerchantShowcase).toHaveBeenLastCalledWith(71, expect.objectContaining({ expectedVersion: 3 }));
    await act(async () => button("下一步：银行与身份").click());
    expect(identityApplicationsApi.updateMerchantShowcase).toHaveBeenLastCalledWith(71, expect.objectContaining({ expectedVersion: 4 }));
  });

  it("shows the eKYC rejection clearly and retains the bank inputs", async () => {
    vi.mocked(identityApplicationsApi.listMine).mockResolvedValue({ list: [{ ...corporateDraft, merchantDetail: { ...corporateDraft.merchantDetail!, applicantKind: "individual" } }], total: 1, page: 1, page_size: 20 });
    vi.spyOn(identityApplicationsApi, "bindMerchantBankAccount").mockRejectedValue(new Error("error.identity_application.ekyc_required"));
    await render();
    await act(async () => button("下一步：银行与身份").click());
    await chooseBank("0009");
    for (const [label, value] of [["支店代码", "001"], ["支店名称", "本店"], ["账号", "1234567"], ["账户名义人", "ヤマダタロウ"]]) await enter(label, value);
    await act(async () => button("下一步：收费规则与合同").click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("未找到可用于银行账户核验的 eKYC 认证资料");
    expect(container.querySelector('[role="alert"]')?.textContent).not.toContain("error.");
    expect(input("账号").value).toBe("1234567");
    expect(input("账户名义人").value).toBe("ヤマダタロウ");
  });

  it("retains the successful upload version when bank binding fails and is retried", async () => {
    vi.mocked(identityApplicationsApi.listMine).mockResolvedValue({ list: [corporateDraft], total: 1, page: 1, page_size: 20 });
    vi.spyOn(identityApplicationsApi, "bindMerchantBankAccount").mockRejectedValue(new Error("error.bank_account.holder_name_mismatch"));
    await render();
    await act(async () => button("下一步：银行与身份").click());
    await chooseBank("0009");
    for (const [label, value] of [["支店代码", "001"], ["支店名称", "本店"], ["账号", "1234567"], ["账户名义人", "カ）サクラ"]]) await enter(label, value);
    const fileInput = container.querySelector('input[type="file"]')!;
    Object.defineProperty(fileInput, "files", { configurable: true, value: [new File(["registration"], "registration.png", { type: "image/png" })] });
    await act(async () => fileInput.dispatchEvent(new Event("change", { bubbles: true })));
    await act(async () => button("下一步：收费规则与合同").click());
    expect(identityApplicationsApi.uploadMedia).toHaveBeenLastCalledWith(71, "corporate_registration", 4, expect.any(File));
    expect(identityApplicationsApi.bindMerchantBankAccount).toHaveBeenLastCalledWith(71, expect.objectContaining({ expectedVersion: 5 }));
    await act(async () => button("下一步：收费规则与合同").click());
    expect(identityApplicationsApi.uploadMedia).toHaveBeenLastCalledWith(71, "corporate_registration", 5, expect.any(File));
  });

  it("round-trips existing distinct corporate and representative names in the save payload", async () => {
    vi.mocked(identityApplicationsApi.listMine).mockResolvedValue({ list: [corporateDraft], total: 1, page: 1, page_size: 20 });
    await render();
    expect(input("法人或代表者姓名").value).toBe("山田太郎");
    await act(async () => button("下一步：银行与身份").click());
    expect(identityApplicationsApi.updateMerchantShowcase).toHaveBeenCalledWith(71, expect.objectContaining({
      corporateLegalName: "株式会社さくら", corporateLegalNameKana: "カブシキガイシャサクラ",
      representativeName: "山田太郎", representativeNameKana: "ヤマダタロウ", expectedVersion: 3
    }));
    expect(button("下一步：收费规则与合同")).toBeTruthy();
    const accountType = container.querySelector<HTMLButtonElement>('[role="combobox"][aria-label="账户类型"]')!;
    await act(async () => accountType.click());
    expect([...container.querySelectorAll('[role="option"]')].map(option => option.textContent)).toEqual(["普通預金", "当座預金", "貯蓄預金", "その他"]);
  });

  it("validates and saves a new corporate identity using the approved visible legal fields", async () => {
    await render();
    await enterNewCorporateDraft();
    await act(async () => button("下一步：银行与身份").click());
    expect(identityApplicationsApi.createMerchantDraft).toHaveBeenCalledWith(expect.objectContaining({
      applicantKind: "corporate", corporateLegalName: "株式会社新店", corporateLegalNameKana: "カブシキガイシャシンテン",
      representativeName: "株式会社新店", representativeNameKana: "カブシキガイシャシンテン"
    }));
    expect(button("下一步：收费规则与合同")).toBeTruthy();
  });

  it("restores all first-step values and the exact File after an eKYC detour for the same account", async () => {
    await render();
    await enterNewCorporateDraft();
    await enter("最低费用", "8800");
    await enter("最高费用", "12800");
    await act(async () => button("上门按摩").click());
    const file = await chooseCover();
    const preview = context.preview;
    await act(async () => button("本人确认（eKYC）").click());
    expect(container.querySelector("textarea")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:shop-cover");
    await act(async () => button("Return to application").click());

    expect(input("姓").value).toBe("佐藤");
    expect(input("法人或代表者姓名").value).toBe("株式会社新店");
    expect(input("法人或代表者姓名片假名").value).toBe("カブシキガイシャシンテン");
    expect(input("店铺名称").value).toBe("新店");
    expect(input("店铺地址").value).toBe("東京都千代田区");
    expect(input("联系电话").value).toBe("0398765432");
    expect(input("最低费用").value).toBe("8800");
    expect(input("最高费用").value).toBe("12800");
    expect(container.querySelector("textarea")?.value).toBe("新しいお店の紹介");
    expect(button("按摩").getAttribute("aria-pressed")).toBe("true");
    expect(button("上门按摩").getAttribute("aria-pressed")).toBe("true");
    expect(container.textContent).toContain("first-shop.png");
    expect(context.preview).toEqual(preview);
    expect(platformMembershipSelfApi.getMine).toHaveBeenCalledTimes(2);
    expect(button("本人确认（eKYC）")).toBeTruthy();
    expect(container.textContent).not.toContain("已本人确认");
    await act(async () => button("下一步：银行与身份").click());
    expect(identityApplicationsApi.createMerchantDraft).toHaveBeenCalledWith(expect.objectContaining({
      applicantKind: "corporate", serviceCategoryIds: [1], businessKeywordIds: [10],
      showcaseDraft: { responsibleFamilyName: "佐藤", responsibleGivenName: "花子", description: "新しいお店の紹介", priceLabel: "￥8,800 ~ ￥12,800", nearestStation: "", stationAccess: "", stationTravelMinutes: null }
    }));
    expect(vi.mocked(identityApplicationsApi.uploadMedia).mock.calls[0]?.[3]).toBe(file);
  });

  it("does not overwrite restored unsaved edits with the persisted draft response", async () => {
    vi.mocked(identityApplicationsApi.listMine).mockResolvedValue({ list: [corporateDraft], total: 1, page: 1, page_size: 20 });
    await render();
    await enter("店铺名称", "未保存の新名称");
    await act(async () => button("本人确认（eKYC）").click());
    await act(async () => button("Return to application").click());
    expect(input("店铺名称").value).toBe("未保存の新名称");
    await act(async () => button("下一步：银行与身份").click());
    expect(identityApplicationsApi.updateMerchantShowcase).toHaveBeenCalledWith(71, expect.objectContaining({
      shopName: "未保存の新名称", corporateLegalName: "株式会社さくら", expectedVersion: 3
    }));
  });

  it.each([
    ["a newer version", [{ ...corporateDraft, version: 4 }]],
    ["a different application ID", [{ ...corporateDraft, id: 72 }]],
    ["a removed application", []]
  ] as const)("preserves the retained base and reports a conflict for %s without saving stale fields", async (_case, refreshedList) => {
    vi.mocked(identityApplicationsApi.listMine).mockResolvedValue({ list: [corporateDraft], total: 1, page: 1, page_size: 20 });
    await render();
    await enter("店铺名称", "別タブと競合する未保存の名称");
    await enter("最低费用", "5000");
    const file = await chooseCover();
    await act(async () => button("本人确认（eKYC）").click());
    expect.soft(merchantApplicationDraftMemory.read(context.accountId)).toEqual(expect.objectContaining({
      baseApplication: { id: 71, version: 3 }, showcaseImage: file
    }));
    vi.mocked(identityApplicationsApi.listMine).mockResolvedValue({ list: [...refreshedList], total: refreshedList.length, page: 1, page_size: 20 });
    await act(async () => button("Return to application").click());
    expect.soft(container.textContent).toContain("店铺申请草稿已发生变更。本页未保存资料已保留，请复制后重新打开申请。");
    expect.soft(input("店铺名称").value).toBe("別タブと競合する未保存の名称");
    expect.soft(input("最低费用").value).toBe("5000");
    expect.soft(container.textContent).toContain("first-shop.png");
    expect.soft(context.preview?.systemId).toBe("application-71");
    await act(async () => button("下一步：银行与身份").click());
    expect.soft(identityApplicationsApi.updateMerchantShowcase).not.toHaveBeenCalled();
    expect.soft(identityApplicationsApi.createMerchantDraft).not.toHaveBeenCalled();
    expect.soft(identityApplicationsApi.uploadMedia).not.toHaveBeenCalled();
  });

  it("does not attach a retained new form to an application created during the detour", async () => {
    await render();
    await enterNewCorporateDraft();
    await act(async () => button("本人确认（eKYC）").click());
    vi.mocked(identityApplicationsApi.listMine).mockResolvedValue({ list: [corporateDraft], total: 1, page: 1, page_size: 20 });
    await act(async () => button("Return to application").click());
    expect.soft(input("店铺名称").value).toBe("新店");
    expect.soft(context.preview?.systemId).toBe("application-new");
    expect.soft(container.textContent).toContain("店铺申请草稿已发生变更。本页未保存资料已保留，请复制后重新打开申请。");
    await act(async () => button("下一步：银行与身份").click());
    expect.soft(identityApplicationsApi.updateMerchantShowcase).not.toHaveBeenCalled();
    expect.soft(identityApplicationsApi.createMerchantDraft).not.toHaveBeenCalled();
  });

  it("waits for the retained application base to be checked before allowing save", async () => {
    vi.mocked(identityApplicationsApi.listMine).mockResolvedValue({ list: [corporateDraft], total: 1, page: 1, page_size: 20 });
    await render();
    await enter("店铺名称", "照合待ちの名称");
    await act(async () => button("本人确认（eKYC）").click());
    let finishRead!: (page: Awaited<ReturnType<typeof identityApplicationsApi.listMine>>) => void;
    vi.mocked(identityApplicationsApi.listMine).mockReturnValue(new Promise((resolve) => { finishRead = resolve; }));
    await act(async () => button("Return to application").click());
    expect(button("下一步：银行与身份").disabled).toBe(true);
    await act(async () => button("下一步：银行与身份").click());
    expect(identityApplicationsApi.updateMerchantShowcase).not.toHaveBeenCalled();
    await act(async () => finishRead({ list: [corporateDraft], total: 1, page: 1, page_size: 20 }));
    expect(button("下一步：银行与身份").disabled).toBe(false);
    expect(input("店铺名称").value).toBe("照合待ちの名称");
  });

  it("does not restore another account's fields, taxonomy, price or image", async () => {
    const originalAccountId = context.accountId;
    await render();
    await enterNewCorporateDraft();
    await enter("最低费用", "5000");
    await enter("最高费用", "9000");
    await act(async () => button("上门按摩").click());
    await chooseCover();
    await act(async () => button("本人确认（eKYC）").click());
    context.accountId += 1;
    await act(async () => button("Return to application").click());
    expect(input("姓").value).toBe("");
    expect(input("店铺名称").value).toBe("");
    expect(input("最低费用").value).toBe("");
    expect(input("最高费用").value).toBe("");
    expect(container.querySelector("textarea")?.value).toBe("");
    expect(button("按摩").getAttribute("aria-pressed")).toBe("false");
    expect(container.textContent).not.toContain("first-shop.png");
    expect(context.preview?.tags).toEqual([]);
    context.accountId = originalAccountId;
    await render();
    expect(input("姓").value).toBe("佐藤");
    expect(input("最低费用").value).toBe("5000");
    expect(container.textContent).toContain("first-shop.png");
    context.accountId += 1;
  });

  it("consumes the retained draft on restoration and does not replay it on a later ordinary remount", async () => {
    await render();
    await enter("姓", "一次限りの申請者");
    await act(async () => button("本人确认（eKYC）").click());
    await act(async () => button("Return to application").click());
    expect(input("姓").value).toBe("一次限りの申請者");
    await act(async () => root.unmount());
    root = createRoot(container);
    await render();
    expect(input("姓").value).toBe("");
  });

  it("preserves the detour draft through StrictMode mount replay without writing browser storage", async () => {
    const storageWrite = vi.spyOn(Storage.prototype, "setItem");
    await render(true);
    await enter("姓", "StrictMode の申請者");
    await act(async () => button("本人确认（eKYC）").click());
    await act(async () => button("Return to application").click());
    expect(input("姓").value).toBe("StrictMode の申請者");
    expect(storageWrite).not.toHaveBeenCalled();
  });

  it("resets the mounted form when the authenticated account changes", async () => {
    await render();
    await enter("姓", "前のアカウント");
    context.accountId += 1;
    await render();
    expect(input("姓").value).toBe("");
  });

  it("disables the eKYC detour during a pending save so it cannot create or replace a snapshot", async () => {
    let finishSave!: (application: IdentityApplication) => void;
    vi.mocked(identityApplicationsApi.createMerchantDraft).mockReturnValue(new Promise((resolve) => { finishSave = resolve; }));
    const retainDraft = vi.spyOn(merchantApplicationDraftMemory, "retain");
    await render();
    await enterNewCorporateDraft();
    await act(async () => button("下一步：银行与身份").click());
    expect.soft(button("本人确认（eKYC）").disabled).toBe(true);
    await act(async () => button("本人确认（eKYC）").click());
    expect.soft(container.querySelector("textarea")?.value).toBe("新しいお店の紹介");
    expect.soft(retainDraft).not.toHaveBeenCalled();
    expect.soft(merchantApplicationDraftMemory.read(context.accountId)).toBeUndefined();
    await act(async () => finishSave(corporateDraft));
    expect(button("下一步：收费规则与合同")).toBeTruthy();
    await act(async () => button("上一步").click());
    expect(button("本人确认（eKYC）").disabled).toBe(false);
    await act(async () => button("本人确认（eKYC）").click());
    expect(merchantApplicationDraftMemory.read(context.accountId)).toEqual(expect.objectContaining({
      baseApplication: { id: 71, version: 3 }, form: expect.objectContaining({ shopName: "新店" })
    }));
  });

  it.each([false, true])("preserves a newer remount snapshot after an old unmounted save resolves (old mount restored: %s)", async (restoreOldMount) => {
    vi.mocked(identityApplicationsApi.listMine).mockResolvedValue({ list: [corporateDraft], total: 1, page: 1, page_size: 20 });
    await render();
    if (restoreOldMount) {
      await enter("店铺名称", "最初の復元スナップショット");
      await act(async () => button("本人确认（eKYC）").click());
      await act(async () => button("Return to application").click());
    }
    let finishOldSave!: (application: IdentityApplication) => void;
    vi.mocked(identityApplicationsApi.updateMerchantShowcase).mockReturnValue(new Promise((resolve) => { finishOldSave = resolve; }));
    await enter("店铺名称", "古い保存リクエストの名称");
    await act(async () => button("下一步：银行与身份").click());
    expect(button("本人确认（eKYC）").disabled).toBe(true);

    await act(async () => root.unmount());
    root = createRoot(container);
    await render();
    await enter("姓", "新しい申請者");
    await enter("店铺名称", "再マウント後の新しい名称");
    await enter("最低费用", "9500");
    await enter("最高费用", "15500");
    const newerFile = await chooseCover();
    await act(async () => button("本人确认（eKYC）").click());
    const newerSnapshot = merchantApplicationDraftMemory.read(context.accountId);
    expect(newerSnapshot).toBeDefined();
    expect(newerSnapshot?.showcaseImage).toBe(newerFile);

    const savedOldApplication = {
      ...corporateDraft, version: 4,
      merchantDetail: { ...corporateDraft.merchantDetail!, shopName: "古い保存リクエストの名称" }
    };
    await act(async () => finishOldSave(savedOldApplication));
    expect.soft(merchantApplicationDraftMemory.read(context.accountId)).toBe(newerSnapshot);
    vi.mocked(identityApplicationsApi.listMine).mockResolvedValue({ list: [savedOldApplication], total: 1, page: 1, page_size: 20 });
    await act(async () => button("Return to application").click());
    expect.soft(input("姓").value).toBe("新しい申請者");
    expect.soft(input("店铺名称").value).toBe("再マウント後の新しい名称");
    expect.soft(input("最低费用").value).toBe("9500");
    expect.soft(input("最高费用").value).toBe("15500");
    expect.soft(container.textContent).toContain("first-shop.png");
    expect.soft(button("下一步：银行与身份").disabled).toBe(true);
    expect.soft(container.textContent).toContain("店铺申请草稿已发生变更。本页未保存资料已保留，请复制后重新打开申请。");
    expect(merchantApplicationDraftMemory.read(context.accountId)).toBeUndefined();
  });

  it.each([
    ["zh-Hant", "選擇店鋪展示圖", "費用區間說明"],
    ["ja", "店舗画像を選択", "料金帯の説明"],
    ["en", "Choose shop image", "About Price range"],
    ["ko", "매장 이미지 선택", "요금 범위 안내"]
  ] as const)("renders the resolved upload action and accessible section label in %s", async (language, upload, section) => {
    context.language = language;
    await render();
    expect.soft(container.querySelector('input[type="file"]')?.closest("label")?.textContent).toContain(upload);
    expect.soft(container.querySelector(`button[aria-label="${section}"]`)).not.toBeNull();
  });
});
