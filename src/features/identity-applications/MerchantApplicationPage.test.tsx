// @vitest-environment jsdom
import { act, StrictMode, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Store } from "../../types/domain";
import type { Language } from "../../i18n/translations";
import { platformMembershipSelfApi } from "../platform-membership/api";
import { shopTaxonomyApi } from "../shop-taxonomy/api";
import { identityApplicationsApi, type IdentityApplication } from "./api";
import { MerchantApplicationPage } from "./MerchantApplicationPage";

const context = vi.hoisted(() => ({ accountId: 41, language: "zh" as Language, preview: null as Store | null }));
vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ session: { id: context.accountId }, refreshSession: vi.fn() })
}));
vi.mock("../../i18n/I18nProvider", () => ({ useI18n: () => ({ language: context.language }) }));
// Leave form controls, taxonomy, translation resolution and routing real; isolate unrelated page chrome/preview internals.
vi.mock("../../components/client-ui/SettingsDirectory", () => ({
  SettingsDetailPage: ({ children }: { children: ReactNode }) => <main>{children}</main>
}));
vi.mock("../../pages/user/StoreDetailPage", () => ({
  StoreDetailExperience: ({ store }: { store: Store }) => { context.preview = store; return null; }
}));

const corporateDraft: IdentityApplication = {
  id: 71, userId: 41, type: "merchant", status: "draft", version: 3, rejectionReason: null, purgeAt: null,
  technicianDetail: null,
  merchantDetail: {
    applicantKind: "corporate", corporateLegalName: "株式会社さくら", corporateLegalNameKana: "カブシキガイシャサクラ",
    representativeName: "山田太郎", representativeNameKana: "ヤマダタロウ", responsiblePersonName: "佐藤花子",
    shopName: "さくら銀座店", businessAddress: "東京都中央区銀座", contactPhone: "0312345678",
    showcaseDraft: { description: "地域の皆様のためのお店", priceLabel: "￥8,800 ~ ￥12,800" },
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
      theme: { detailAccentColor: "#000000", detailSurfaceColor: "#000000", detailItemSurfaceColor: "#000000", detailOuterBorderColor: "#000000", detailItemBorderColor: "#000000", detailAvatarBorderColor: "#000000", simpleTopColor: "#000000", simpleBottomColor: "#000000" }
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
      ["申请人", "佐藤花子"], ["法人或代表者姓名片假名", "カブシキガイシャシンテン"],
      ["法人或代表者姓名", "株式会社新店"], ["店铺名称", "新店"], ["店铺地址", "東京都千代田区"], ["联系电话", "0398765432"]
    ]) await enter(label, value);
    await act(async () => {
      const textarea = container.querySelector("textarea")!;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "新しいお店の紹介");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("按摩").click());
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

    expect(input("申请人").value).toBe("佐藤花子");
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
      showcaseDraft: { description: "新しいお店の紹介", priceLabel: "￥8,800 ~ ￥12,800" }
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
    expect(input("申请人").value).toBe("");
    expect(input("店铺名称").value).toBe("");
    expect(input("最低费用").value).toBe("");
    expect(input("最高费用").value).toBe("");
    expect(container.querySelector("textarea")?.value).toBe("");
    expect(button("按摩").getAttribute("aria-pressed")).toBe("false");
    expect(container.textContent).not.toContain("first-shop.png");
    expect(context.preview?.tags).toEqual([]);
    context.accountId = originalAccountId;
    await render();
    expect(input("申请人").value).toBe("佐藤花子");
    expect(input("最低费用").value).toBe("5000");
    expect(container.textContent).toContain("first-shop.png");
    context.accountId += 1;
  });

  it("consumes the retained draft on restoration and does not replay it on a later ordinary remount", async () => {
    await render();
    await enter("申请人", "一次限りの申請者");
    await act(async () => button("本人确认（eKYC）").click());
    await act(async () => button("Return to application").click());
    expect(input("申请人").value).toBe("一次限りの申請者");
    await act(async () => root.unmount());
    root = createRoot(container);
    await render();
    expect(input("申请人").value).toBe("");
  });

  it("preserves the detour draft through StrictMode mount replay without writing browser storage", async () => {
    const storageWrite = vi.spyOn(Storage.prototype, "setItem");
    await render(true);
    await enter("申请人", "StrictMode の申請者");
    await act(async () => button("本人确认（eKYC）").click());
    await act(async () => button("Return to application").click());
    expect(input("申请人").value).toBe("StrictMode の申請者");
    expect(storageWrite).not.toHaveBeenCalled();
  });

  it("resets the mounted form when the authenticated account changes", async () => {
    await render();
    await enter("申请人", "前のアカウント");
    context.accountId += 1;
    await render();
    expect(input("申请人").value).toBe("");
  });

  it("clears an outstanding detour draft after a successful first-step save", async () => {
    let finishSave!: (application: IdentityApplication) => void;
    vi.mocked(identityApplicationsApi.createMerchantDraft).mockReturnValue(new Promise((resolve) => { finishSave = resolve; }));
    await render();
    await enterNewCorporateDraft();
    await act(async () => button("下一步：银行与身份").click());
    await act(async () => button("本人确认（eKYC）").click());
    await act(async () => finishSave(corporateDraft));
    await act(async () => button("Return to application").click());
    expect(input("申请人").value).toBe("");
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
