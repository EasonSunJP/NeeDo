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

  it("requests and renders formal metrics for an independent technician without a shop", async () => {
    vi.spyOn(technicianProfileApi, "getMine").mockResolvedValue(independentProfile);
    const detailRequest = vi.spyOn(coreReadApi, "getTechnicianDetail").mockResolvedValue(technician);

    await renderPortal();
    await flushUntil(() => expect(container.textContent).toContain("完成订单数1,281"));

    expect(detailRequest).toHaveBeenCalledWith(81);
    expect(container.textContent).toContain("接单率98%");
    expect(container.textContent).toContain("评价4.8/5");
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
});
