// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { coreReadApi, type CoreTechnicianDetail } from "../../features/core-read/api";
import { technicianProfileApi, type TechnicianSelfProfile } from "../../features/core-read/technicianProfileApi";
import { pricingModeApi, type TechnicianServicePayload } from "../../features/pricing-mode/api";
import { TechnicianProfileInfoView, fromTechnicianSelfProfile } from "../../shared/technician-profile";
import { TechnicianPortalPage } from "./TechnicianPortalPage";
import source from "./TechnicianPortalPage.tsx?raw";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const portalTestState = vi.hoisted(() => ({
  session: {
    portal: "technician",
    loginMethod: "password",
    currentIdentity: {
      id: 181,
      publicId: "s0000000081",
      scopeId: 81,
      scopeType: "technician_profile",
      type: "technician"
    }
  }
}));

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ session: portalTestState.session })
}));

vi.mock("../../theme/ClientThemeProvider", () => ({
  getClientThemeClassName: () => "",
  useClientTheme: () => ({ isNight: false, theme: "jade-light" })
}));

vi.mock("../../features/realtime/useRealtimeUnreadCounts", () => ({
  useRealtimeUnreadCounts: () => ({ conversations: 0, friendRequests: 0, notifications: 0 })
}));

vi.mock("../../i18n/I18nProvider", () => ({
  useI18n: () => ({ language: "zh" })
}));

const profile: TechnicianSelfProfile = {
  id: 81,
  publicId: "s0000000081",
  userId: 181,
  shopId: 71,
  displayName: "小林技师",
  avatarUrl: "/avatar.jpg",
  bio: "预约前请联系。",
  city: "東京都",
  gender: "female",
  age: 29,
  heightCm: 168,
  languages: ["日本語", "中文"],
  serviceAreas: ["港区"],
  specialTags: [],
  profileTags: [],
  reviewTagSummary: {
    special: [
      { code: "appeal_max", label: "魅力max", count: 4 },
      { code: "service_max", label: "服务max", count: 3 },
      { code: "emotion_max", label: "情绪max", count: 2 },
      { code: "energy_max", label: "元气max", count: 1 }
    ],
    custom: [{ label: "手法细致", count: 1 }, { label: "沟通耐心", count: 2 }]
  },
  canServeForeigners: true,
  bidBudgetMinJpy: 5000,
  bidBudgetMaxJpy: 18000,
  paymentMethods: ["platform"],
  serviceBase: null,
  visibility: "limited",
  employmentType: "full_time",
  yearsExperience: 8,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-03T00:00:00.000Z"
};

const service: TechnicianServicePayload = {
  id: 901,
  publicId: "service0000000901",
  shopId: 71,
  technicianId: 81,
  sourceShopServiceId: null,
  categoryId: 8,
  name: "肩颈调理",
  description: "肩颈放松",
  priceAmount: 8800,
  currency: "JPY",
  durationMinutes: 60,
  usageCount: 18,
  coverImageUrl: "/service.jpg",
  images: [],
  tags: ["放松"],
  shop: { publicId: "shop0000000071", name: "港区店", address: "東京都港区" },
  taxIncluded: true,
  sortOrder: 0,
  isActive: true,
  isBookable: true,
  isRecommended: false,
  reviewStatus: "approved",
  rejectionReason: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-03T00:00:00.000Z"
};

const technician: CoreTechnicianDetail = {
  id: 81,
  publicId: profile.publicId,
  displayName: profile.displayName,
  avatarUrl: profile.avatarUrl,
  gender: profile.gender,
  age: profile.age,
  heightCm: profile.heightCm,
  bio: profile.bio,
  city: profile.city,
  languages: profile.languages,
  yearsExperience: profile.yearsExperience,
  acceptanceRatePercent: 98,
  completedOrderCount: 1281,
  favoriteCount: 0,
  shareCount: 0,
  primaryService: null,
  reviewSummary: { ratingAverage: "4.80", reviewCount: 132, latestReviewAt: null, highlights: [] },
  reviewTagSummary: profile.reviewTagSummary,
  shop: null,
  serviceArea: "港区",
  mediaAssets: [],
  services: [],
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-03T00:00:00.000Z"
};

const employedTechnician: CoreTechnicianDetail = {
  ...technician,
  shop: {
    id: 71,
    publicId: "shop0000000071",
    name: "港区店",
    city: "東京都",
    address: "東京都港区",
    coverUrl: null,
    reviewSummary: { ratingAverage: "4.90", reviewCount: 88, latestReviewAt: null, highlights: [] },
    favoriteCount: 0,
    shareCount: 0,
    serviceCategories: [],
    businessKeywords: []
  }
};

const independentProfile: TechnicianSelfProfile = {
  ...profile,
  shopId: null,
  employmentType: "independent"
};

let container: HTMLDivElement;
let root: Root | null;

async function flushUntil(assertion: () => void) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => new Promise((resolve) => window.setTimeout(resolve, 0)));
    }
  }
  throw lastError;
}

async function renderPortal() {
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <MemoryRouter initialEntries={["/technician/me?meTab=info"]}>
        <Routes><Route element={<TechnicianPortalPage />} path="/technician/:view" /></Routes>
      </MemoryRouter>
    );
  });
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function setInputValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function findButton(label: string) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => button.textContent?.trim() === label);
}

function findInput(label: string) {
  const field = Array.from(container.querySelectorAll<HTMLLabelElement>("label"))
    .find((candidate) => candidate.textContent?.includes(label));
  return field?.querySelector<HTMLInputElement>('input:not([type="file"])');
}

async function selectServiceCover(file: File) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  expect(input).not.toBeNull();
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => input?.dispatchEvent(new Event("change", { bubbles: true })));
}

function mockServiceEditorContext(initialServices: TechnicianServicePayload[]) {
  vi.spyOn(technicianProfileApi, "getMine").mockResolvedValue(profile);
  vi.spyOn(coreReadApi, "getTechnicianDetail").mockResolvedValue({
    ...employedTechnician,
    services: [{ category: { id: 8 } } as CoreTechnicianDetail["services"][number]]
  });
  vi.mocked(pricingModeApi.listMyTechnicianServices).mockResolvedValue({
    list: initialServices,
    total: initialServices.length,
    page: 1,
    page_size: 5
  });
  vi.spyOn(pricingModeApi, "getBookingNavigation").mockResolvedValue({
    shopId: 71,
    pricingMode: "technician",
    technicianPricingRatePercent: 100,
    entry: "technician_list",
    technicians: { list: [], total: 0, page: 1, page_size: 1 }
  });
}

async function openNewServiceEditor() {
  await renderPortal();
  await flushUntil(() => expect(findButton("添加服务 0/5")).toBeDefined());
  await act(async () => findButton("添加服务 0/5")?.click());
  const name = findInput("服务名称");
  const price = findInput("价格");
  expect(name).toBeDefined();
  expect(price).toBeDefined();
  await act(async () => {
    if (name) setInputValue(name, "新增封面服务");
    if (price) setInputValue(price, "9800");
  });
}
function renderProfile() {
  const model = fromTechnicianSelfProfile(profile, technician, [service]);
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(TechnicianProfileInfoView, {
        model,
        privacySlot: createElement("div", { "data-testid": "technician-profile-privacy-control" }, "隐私模式")
      })
    )
  );
}

describe("TechnicianPortalPage approved personal-center profile", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = null;
    vi.spyOn(pricingModeApi, "listMyTechnicianServices").mockResolvedValue({ list: [], total: 0, page: 1, page_size: 5 });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:service-cover") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    container.remove();
  });

  it("uses the shared formal profile composition", () => {
    expect(source).toContain("fromTechnicianSelfProfile(profile, technician, services)");
    expect(source).toContain("<TechnicianProfileInfoView");
  });

  it("renders approved metrics, basic fields, review counts, privacy, then services", () => {
    const markup = renderProfile();
    const text = markup.replace(/<[^>]+>/g, "");
    const labels = ["从业年数", "接单率", "评价", "完成订单数", "性别", "年龄", "身高", "语言能力", "自我介绍", "特殊标签", ">标签<", "隐私模式", "服务信息"];
    const positions = labels.map((label) => markup.indexOf(label));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(text).toContain("魅力max×4");
    expect(text).toContain("服务max×3");
    expect(text).toContain("情绪max×2");
    expect(text).toContain("元气max×1");
    expect(text).toContain("手法细致");
    expect(text).not.toContain("手法细致 ×1");
    expect(text).toContain("沟通耐心 ×2");
  });

  it("keeps the service section borderless while each shared service body remains framed", () => {
    const markup = renderProfile();
    const serviceSectionAt = markup.indexOf('data-testid="technician-profile-services"');
    const serviceSectionTag = markup.slice(markup.lastIndexOf("<section", serviceSectionAt), markup.indexOf(">", serviceSectionAt) + 1);
    const serviceCardAt = markup.indexOf('data-testid="unified-service-info-card"');
    const serviceCardTag = markup.slice(markup.lastIndexOf("<article", serviceCardAt), markup.indexOf(">", serviceCardAt) + 1);

    expect(serviceSectionTag).not.toContain("border");
    expect(serviceCardTag).toContain("border");
  });

  it("renders formal technician services without requesting the merchant-scoped pricing endpoint", async () => {
    vi.spyOn(technicianProfileApi, "getMine").mockResolvedValue(profile);
    vi.spyOn(coreReadApi, "getTechnicianDetail").mockResolvedValue(employedTechnician);
    vi.mocked(pricingModeApi.listMyTechnicianServices).mockResolvedValue({
      list: [service],
      total: 1,
      page: 1,
      page_size: 5
    });
    const merchantPricingRequest = vi
      .spyOn(pricingModeApi, "getShopPricingMode")
      .mockRejectedValue(new Error("error.identity.forbidden"));
    const publicPricingRequest = vi.spyOn(pricingModeApi, "getBookingNavigation").mockResolvedValue({
      shopId: 71,
      pricingMode: "merchant",
      technicianPricingRatePercent: 100,
      entry: "service_menu",
      services: { list: [], total: 0, page: 1, page_size: 1 }
    });

    await renderPortal();
    await flushUntil(() => expect(container.textContent).toContain("肩颈调理"));

    expect(publicPricingRequest).toHaveBeenCalledWith(71, { page: 1, pageSize: 1 });
    expect(merchantPricingRequest).not.toHaveBeenCalled();
    expect(container.textContent).toContain("店铺当前定价模式：店铺定价");
    expect(container.textContent).not.toContain("error.identity.forbidden");
  });

  it("discards an edited draft on close and exits edit mode after a successful save", async () => {
    vi.spyOn(technicianProfileApi, "getMine").mockResolvedValue(profile);
    const updateRequest = vi.spyOn(technicianProfileApi, "updateMine").mockResolvedValue(profile);
    vi.spyOn(coreReadApi, "getTechnicianDetail").mockResolvedValue(employedTechnician);
    vi.spyOn(pricingModeApi, "getBookingNavigation").mockResolvedValue({
      shopId: 71,
      pricingMode: "merchant",
      technicianPricingRatePercent: 100,
      entry: "service_menu",
      services: { list: [], total: 0, page: 1, page_size: 1 }
    });

    await renderPortal();
    await flushUntil(() => expect(container.textContent).toContain("语言能力日本語中文"));

    const editButton = container.querySelector<HTMLButtonElement>('button[aria-label="编辑信息卡"]');
    expect(editButton).not.toBeNull();
    await act(async () => editButton?.click());

    const languageDraft = Array.from(container.querySelectorAll<HTMLTextAreaElement>("textarea"))
      .find((textarea) => textarea.value === "日本語、中文");
    expect(languageDraft).toBeDefined();
    await act(async () => languageDraft && setTextareaValue(languageDraft, "QA-DRAFT-NOT-SAVED"));
    expect(container.textContent).toContain("QA-DRAFT-NOT-SAVED");

    const closeButton = container.querySelector<HTMLButtonElement>('button[aria-label="取消编辑"]');
    expect(closeButton).not.toBeNull();
    await act(async () => closeButton?.click());
    expect(container.textContent).not.toContain("QA-DRAFT-NOT-SAVED");
    expect(container.textContent).toContain("语言能力日本語中文");
    expect(updateRequest).not.toHaveBeenCalled();

    await act(async () => editButton?.click());
    const saveButton = container.querySelector<HTMLButtonElement>('[data-testid="technician-profile-save-action"]');
    expect(saveButton?.textContent).toContain("保存并退出编辑模式");
    await act(async () => saveButton?.click());
    await flushUntil(() => expect(updateRequest).toHaveBeenCalledTimes(1));

    expect(updateRequest).toHaveBeenCalledWith({
      gender: "female",
      age: 29,
      heightCm: 168,
      languages: ["日本語", "中文"],
      bio: "预约前请联系。",
      visibility: "limited"
    });
    expect(container.querySelector('[data-testid="technician-profile-save-action"]')).toBeNull();
    expect(container.querySelector('button[aria-label="编辑信息卡"]')).not.toBeNull();
  });

  it("requests and renders formal metrics for an independent technician without a shop", async () => {
    vi.spyOn(technicianProfileApi, "getMine").mockResolvedValue(independentProfile);
    const detailRequest = vi.spyOn(coreReadApi, "getTechnicianDetail").mockResolvedValue(technician);

    await renderPortal();
    await flushUntil(() => expect(container.textContent).toContain("完成订单数1,281"));

    expect(detailRequest).toHaveBeenCalledWith(81);
    expect(container.textContent).toContain("接单率98%");
    expect(container.textContent).toContain("评价4.8/5");
  });

  it("keeps the authenticated private self portal usable when the public detail is hidden", async () => {
    vi.spyOn(technicianProfileApi, "getMine").mockResolvedValue(profile);
    vi.spyOn(coreReadApi, "getTechnicianDetail").mockRejectedValue(new Error("error.technician.not_found"));

    await renderPortal();
    await flushUntil(() => expect(container.textContent).toContain("基础信息"));

    expect(container.textContent).not.toContain("技师资料加载失败");
    expect(container.textContent).toContain("接单率未读取");
    expect(container.textContent).toContain("评价未读取");
    expect(container.textContent).toContain("完成订单数未读取");
  });
  it("shows an honest retry state when formal technician metrics fail to load", async () => {
    vi.spyOn(technicianProfileApi, "getMine").mockResolvedValue(independentProfile);
    vi.spyOn(coreReadApi, "getTechnicianDetail").mockRejectedValue(new Error("formal technician detail unavailable"));

    await renderPortal();
    await flushUntil(() => expect(container.textContent).toContain("formal technician detail unavailable"));

    expect(container.textContent).toContain("技师资料加载失败");
    expect(container.textContent).toContain("重新加载");
    expect(container.textContent).not.toContain("接单率0%");
    expect(container.textContent).not.toContain("完成订单数0");
  });

  it("retries a failed formal detail read and renders authoritative metrics after recovery", async () => {
    vi.spyOn(technicianProfileApi, "getMine").mockResolvedValue(independentProfile);
    const detailRequest = vi.spyOn(coreReadApi, "getTechnicianDetail")
      .mockRejectedValueOnce(new Error("formal technician detail unavailable"))
      .mockResolvedValue(technician);

    await renderPortal();
    await flushUntil(() => expect(container.textContent).toContain("formal technician detail unavailable"));

    expect(container.textContent).not.toContain("接单率0%");
    expect(container.textContent).not.toContain("完成订单数0");
    const retryButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("重新加载"));
    expect(retryButton).toBeDefined();

    await act(async () => retryButton?.click());
    await flushUntil(() => expect(container.textContent).toContain("完成订单数1,281"));

    expect(detailRequest).toHaveBeenCalledTimes(2);
    expect(container.textContent).not.toContain("formal technician detail unavailable");
    expect(container.textContent).toContain("接单率98%");
    expect(container.textContent).toContain("评价4.8/5");
    expect(container.textContent).toContain("完成订单数1,281");
  });
  it("creates a service first and then uploads its selected cover", async () => {
    mockServiceEditorContext([]);
    const created = { ...service, id: 902, publicId: "service0000000902", name: "新增封面服务", coverImageUrl: null };
    const createRequest = vi.spyOn(pricingModeApi, "createTechnicianService").mockResolvedValue(created);
    const uploadRequest = vi.spyOn(pricingModeApi, "uploadTechnicianServiceCover")
      .mockResolvedValue({ ...created, coverImageUrl: "/uploaded-cover.jpg" });

    await openNewServiceEditor();
    const file = new File([new Uint8Array([0xff, 0xd8])], "cover.jpg", { type: "image/jpeg" });
    await selectServiceCover(file);
    await act(async () => findButton("保存")?.click());
    await flushUntil(() => expect(uploadRequest).toHaveBeenCalledTimes(1));

    expect(createRequest).toHaveBeenCalledTimes(1);
    expect(uploadRequest).toHaveBeenCalledWith(71, 902, file);
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it("uses the authenticated technician service category when public detail services are unavailable", async () => {
    vi.spyOn(technicianProfileApi, "getMine").mockResolvedValue(profile);
    vi.spyOn(coreReadApi, "getTechnicianDetail").mockResolvedValue(employedTechnician);
    vi.mocked(pricingModeApi.listMyTechnicianServices).mockResolvedValue({
      list: [service],
      total: 1,
      page: 1,
      page_size: 5
    });
    vi.spyOn(pricingModeApi, "getBookingNavigation").mockResolvedValue({
      shopId: 71,
      pricingMode: "technician",
      technicianPricingRatePercent: 100,
      entry: "technician_list",
      technicians: { list: [], total: 0, page: 1, page_size: 1 }
    });
    const createRequest = vi.spyOn(pricingModeApi, "createTechnicianService")
      .mockResolvedValue({ ...service, id: 902, publicId: "service0000000902", name: "正式新增服务" });

    await renderPortal();
    await flushUntil(() => expect(findButton("添加服务 1/5")).toBeDefined());
    await act(async () => findButton("添加服务 1/5")?.click());
    const name = findInput("服务名称");
    const price = findInput("价格");
    expect(name).toBeDefined();
    expect(price).toBeDefined();
    await act(async () => {
      if (name) setInputValue(name, "正式新增服务");
      if (price) setInputValue(price, "9800");
    });
    await act(async () => findButton("保存")?.click());
    await flushUntil(() => expect(createRequest).toHaveBeenCalledTimes(1));

    expect(createRequest).toHaveBeenCalledWith(71, expect.objectContaining({
      categoryId: 8,
      name: "正式新增服务",
      priceAmount: 9800
    }));
    expect(container.textContent).not.toContain("当前没有可用的正式服务分类");
  });

  it("updates service text before replacing an existing cover", async () => {
    mockServiceEditorContext([service]);
    const updated = { ...service, name: "肩颈调理" };
    const updateRequest = vi.spyOn(pricingModeApi, "updateTechnicianService").mockResolvedValue(updated);
    const uploadRequest = vi.spyOn(pricingModeApi, "uploadTechnicianServiceCover")
      .mockResolvedValue({ ...updated, coverImageUrl: "/replacement-cover.jpg" });

    await renderPortal();
    await flushUntil(() => expect(container.textContent).toContain("肩颈调理"));
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="编辑"]')?.click());
    const file = new File([new Uint8Array([1, 2, 3])], "replacement.webp", { type: "image/webp" });
    await selectServiceCover(file);
    await act(async () => findButton("保存")?.click());
    await flushUntil(() => expect(uploadRequest).toHaveBeenCalledTimes(1));

    expect(updateRequest).toHaveBeenCalledTimes(1);
    expect(uploadRequest).toHaveBeenCalledWith(71, 901, file);
  });

  it("updates service text before removing an existing cover", async () => {
    mockServiceEditorContext([service]);
    const updateRequest = vi.spyOn(pricingModeApi, "updateTechnicianService").mockResolvedValue(service);
    const removeCoverRequest = vi.spyOn(pricingModeApi, "removeTechnicianServiceCover")
      .mockResolvedValue({ ...service, coverImageUrl: null });

    await renderPortal();
    await flushUntil(() => expect(container.textContent).toContain("肩颈调理"));
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="编辑"]')?.click());
    await act(async () => findButton("移除图片")?.click());
    await act(async () => findButton("保存")?.click());
    await flushUntil(() => expect(removeCoverRequest).toHaveBeenCalledTimes(1));

    expect(updateRequest).toHaveBeenCalledTimes(1);
    expect(removeCoverRequest).toHaveBeenCalledWith(71, 901);
  });

  it("keeps a removal draft after partial success and retries only the failed removal", async () => {
    mockServiceEditorContext([service]);
    const persisted = { ...service, name: "服务端已保存名称" };
    const updateRequest = vi.spyOn(pricingModeApi, "updateTechnicianService").mockResolvedValue(persisted);
    const removeCoverRequest = vi
      .spyOn(pricingModeApi, "removeTechnicianServiceCover")
      .mockRejectedValueOnce(new Error("remove unavailable"))
      .mockResolvedValue({ ...persisted, coverImageUrl: null });
    const uploadRequest = vi.spyOn(pricingModeApi, "uploadTechnicianServiceCover");

    await renderPortal();
    await flushUntil(() => expect(container.textContent).toContain("肩颈调理"));
    await act(async () =>
      container.querySelector<HTMLButtonElement>('button[aria-label="编辑"]')?.click()
    );
    await act(async () => findButton("移除图片")?.click());
    await act(async () => findButton("保存")?.click());
    await flushUntil(() =>
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        "服务已保存，封面移除失败，请重试"
      )
    );

    expect(updateRequest).toHaveBeenCalledTimes(1);
    expect(removeCoverRequest).toHaveBeenCalledTimes(1);
    expect(uploadRequest).not.toHaveBeenCalled();
    expect(findButton("重试移除封面")).toBeDefined();

    await act(async () => findButton("重试移除封面")?.click());
    await flushUntil(() => expect(removeCoverRequest).toHaveBeenCalledTimes(2));

    expect(updateRequest).toHaveBeenCalledTimes(1);
    expect(uploadRequest).not.toHaveBeenCalled();
  });

  it("cancels a selected cover without issuing a service or cover request", async () => {
    mockServiceEditorContext([]);
    const createRequest = vi.spyOn(pricingModeApi, "createTechnicianService");
    const uploadRequest = vi.spyOn(pricingModeApi, "uploadTechnicianServiceCover");

    await openNewServiceEditor();
    await selectServiceCover(new File([new Uint8Array([1])], "cancel.png", { type: "image/png" }));
    await act(async () => findButton("取消")?.click());

    expect(createRequest).not.toHaveBeenCalled();
    expect(uploadRequest).not.toHaveBeenCalled();
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it("keeps a cover draft after partial success and retries only the failed upload", async () => {
    mockServiceEditorContext([]);
    const created = {
      ...service,
      id: 902,
      publicId: "service0000000902",
      name: "服务端规范名称",
      description: "服务端说明",
      priceAmount: 10800,
      durationMinutes: 75,
      coverImageUrl: null
    };
    const createRequest = vi.spyOn(pricingModeApi, "createTechnicianService").mockResolvedValue(created);
    const updateRequest = vi.spyOn(pricingModeApi, "updateTechnicianService");
    const uploadRequest = vi.spyOn(pricingModeApi, "uploadTechnicianServiceCover")
      .mockRejectedValueOnce(new Error("upload unavailable"))
      .mockResolvedValue({ ...created, coverImageUrl: "/retry-cover.jpg" });
    const deleteRequest = vi.spyOn(pricingModeApi, "deleteTechnicianService");

    await openNewServiceEditor();
    const file = new File([new Uint8Array([0xff, 0xd8])], "retry.jpg", { type: "image/jpeg" });
    await selectServiceCover(file);
    await act(async () => findButton("保存")?.click());
    await flushUntil(() => expect(container.querySelector('[role="alert"]')?.textContent).toContain("服务已保存，封面上传失败，请重试"));

    expect(createRequest).toHaveBeenCalledTimes(1);
    expect(updateRequest).not.toHaveBeenCalled();
    expect(deleteRequest).not.toHaveBeenCalled();
    expect(uploadRequest).toHaveBeenCalledTimes(1);
    expect(findButton("重试上传封面")).toBeDefined();
    expect(findInput("服务名称")).toMatchObject({ disabled: true, value: "服务端规范名称" });
    expect(findInput("价格")).toMatchObject({ disabled: true, value: "10800" });
    expect(findInput("时长（分钟）")).toMatchObject({ disabled: true, value: "75" });
    expect(container.querySelector<HTMLTextAreaElement>('[data-testid="technician-service-card"] textarea'))
      .toMatchObject({ disabled: true, value: "服务端说明" });
    expect(findButton("删除该服务")).toBeUndefined();

    await act(async () => findButton("重试上传封面")?.click());
    await flushUntil(() => expect(uploadRequest).toHaveBeenCalledTimes(2));

    expect(createRequest).toHaveBeenCalledTimes(1);
    expect(updateRequest).not.toHaveBeenCalled();
    expect(deleteRequest).not.toHaveBeenCalled();
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it("clears stale cover failure copy and offers a neutral completion after discarding the retry", async () => {
    mockServiceEditorContext([]);
    const created = {
      ...service,
      id: 902,
      publicId: "service0000000902",
      coverImageUrl: null
    };
    const createRequest = vi
      .spyOn(pricingModeApi, "createTechnicianService")
      .mockResolvedValue(created);
    const uploadRequest = vi
      .spyOn(pricingModeApi, "uploadTechnicianServiceCover")
      .mockRejectedValue(new Error("upload unavailable"));

    await openNewServiceEditor();
    await selectServiceCover(
      new File([new Uint8Array([0xff, 0xd8])], "discarded-retry.jpg", { type: "image/jpeg" })
    );
    await act(async () => findButton("保存")?.click());
    await flushUntil(() =>
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        "服务已保存，封面上传失败，请重试"
      )
    );

    await act(async () => findButton("移除图片")?.click());

    expect(container.querySelector('[role="alert"]')?.textContent ?? "").not.toContain("封面上传失败");
    expect(findButton("重试上传封面")).toBeUndefined();
    expect(findButton("重试移除封面")).toBeUndefined();
    expect(findButton("完成并关闭")).toBeDefined();

    await act(async () => findButton("完成并关闭")?.click());
    await flushUntil(() => expect(container.querySelector('input[type="file"]')).toBeNull());

    expect(createRequest).toHaveBeenCalledTimes(1);
    expect(uploadRequest).toHaveBeenCalledTimes(1);
  });

  it("retries an existing service cover without updating its persisted text twice", async () => {
    mockServiceEditorContext([service]);
    const persisted = {
      ...service,
      name: "服务端已保存名称",
      description: "服务端已保存说明",
      priceAmount: 9200,
      durationMinutes: 70
    };
    const updateRequest = vi.spyOn(pricingModeApi, "updateTechnicianService").mockResolvedValue(persisted);
    const uploadRequest = vi.spyOn(pricingModeApi, "uploadTechnicianServiceCover")
      .mockRejectedValueOnce(new Error("upload unavailable"))
      .mockResolvedValue({ ...persisted, coverImageUrl: "/retry-existing-cover.jpg" });
    const createRequest = vi.spyOn(pricingModeApi, "createTechnicianService");

    await renderPortal();
    await flushUntil(() => expect(container.textContent).toContain("肩颈调理"));
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="编辑"]')?.click());
    const name = findInput("服务名称");
    expect(name).toBeDefined();
    await act(async () => name && setInputValue(name, "客户端编辑名称"));
    const file = new File([new Uint8Array([1, 2, 3])], "retry-existing.webp", { type: "image/webp" });
    await selectServiceCover(file);
    await act(async () => findButton("保存")?.click());
    await flushUntil(() => expect(container.querySelector('[role="alert"]')?.textContent).toContain("服务已保存，封面上传失败，请重试"));

    expect(updateRequest).toHaveBeenCalledTimes(1);
    expect(createRequest).not.toHaveBeenCalled();
    expect(uploadRequest).toHaveBeenCalledTimes(1);
    expect(findInput("服务名称")).toMatchObject({ disabled: true, value: "服务端已保存名称" });
    expect(findButton("重试上传封面")).toBeDefined();
    expect(findButton("删除该服务")).toBeUndefined();

    await act(async () => findButton("重试上传封面")?.click());
    await flushUntil(() => expect(uploadRequest).toHaveBeenCalledTimes(2));

    expect(updateRequest).toHaveBeenCalledTimes(1);
    expect(createRequest).not.toHaveBeenCalled();
  });
});
