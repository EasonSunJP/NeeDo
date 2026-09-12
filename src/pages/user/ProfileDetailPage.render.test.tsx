// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { persistentResourceCache } from "../../lib/persistentResourceCache";
import { ClientThemeProvider } from "../../theme/ClientThemeProvider";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const apiMocks = vi.hoisted(() => ({
  getTechnicianDetail: vi.fn(),
  listPublicTechnicianProfileServices: vi.fn()
}));

vi.mock("../../features/core-read/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../features/core-read/api")>();

  return {
    ...actual,
    coreReadApi: { ...actual.coreReadApi, getTechnicianDetail: apiMocks.getTechnicianDetail }
  };
});

vi.mock("../../features/pricing-mode/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../features/pricing-mode/api")>();

  return {
    ...actual,
    pricingModeApi: { ...actual.pricingModeApi, listPublicTechnicianProfileServices: apiMocks.listPublicTechnicianProfileServices }
  };
});

vi.mock("../../features/social/pages/SocialProfilePage", () => ({
  SocialProfilePage: () => <div data-testid="social-profile-page" />
}));

import { ProfileDetailPage } from "./ProfileDetailPage";

const technicianDetail = {
  acceptanceRatePercent: 97, age: 28, avatarUrl: null, bio: "认证技师简介", city: "东京", completedOrderCount: 42,
  createdAt: "2026-09-03T00:00:00.000Z", displayName: "正式技师", favoriteCount: 0, gender: "female" as const,
  heightCm: 165, id: 186, languages: ["日本語"], mediaAssets: [], primaryService: null, publicId: "s0000000186",
  reviewSummary: { highlights: [], latestReviewAt: null, ratingAverage: "4.8", reviewCount: 12 }, reviewTagSummary: { custom: [], special: [] },
  serviceArea: "东京", services: [], shareCount: 0,
  shop: { address: "东京", businessKeywords: [], city: "东京", coverUrl: null, favoriteCount: 0, id: 217, name: "正式店铺", publicId: "shop0000000217", reviewSummary: { highlights: [], latestReviewAt: null, ratingAverage: "4.8", reviewCount: 12 }, serviceCategories: [], shareCount: 0 },
  updatedAt: "2026-09-03T00:00:00.000Z", yearsExperience: 6
};

const technicianServices = {
  list: [{ categoryId: 1, coverImageUrl: null, createdAt: "2026-09-03T00:00:00.000Z", currency: "JPY", description: "正式公开服务", durationMinutes: 60, id: 501, images: [], isActive: true, isBookable: true, isRecommended: true, name: "正式服务卡", priceAmount: 8800, publicId: "ts0000000501", rejectionReason: null, reviewStatus: "approved", shop: { address: "东京", name: "正式店铺", publicId: "shop0000000217" }, shopId: 217, sortOrder: 0, sourceShopServiceId: null, tags: ["正式"], technicianId: 186, updatedAt: "2026-09-03T00:00:00.000Z", usageCount: 42 }],
  page: 1, page_size: 20, total: 1
};

describe("ProfileDetailPage formal technician rendering", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    await persistentResourceCache.clearScope("public");
    apiMocks.getTechnicianDetail.mockResolvedValue(technicianDetail);
    apiMocks.listPublicTechnicianProfileServices.mockResolvedValue(technicianServices);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("renders the formal information card and public service without a dialog", async () => {
    await act(async () => {
      root.render(<ClientThemeProvider><MemoryRouter initialEntries={["/profiles/technician/s0000000186"]}><Routes><Route element={<ProfileDetailPage />} path="/profiles/:entityType/:id" /></Routes></MemoryRouter></ClientThemeProvider>);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(apiMocks.getTechnicianDetail).toHaveBeenCalledWith("s0000000186");
    await vi.waitFor(() => {
      expect(apiMocks.listPublicTechnicianProfileServices).toHaveBeenCalledWith(186, { page: 1, pageSize: 20 });
      expect(container.querySelector('[data-testid="technician-profile-info-view"]')).not.toBeNull();
      expect(container.textContent).toContain("正式服务卡");
    });
    expect(container.textContent).toContain("详细信息卡");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("keeps the formal no-service boundary when the public portfolio is empty", async () => {
    apiMocks.listPublicTechnicianProfileServices.mockResolvedValue({ list: [], page: 1, page_size: 20, total: 0 });

    await act(async () => {
      root.render(<ClientThemeProvider><MemoryRouter initialEntries={["/profiles/technician/s0000000186"]}><Routes><Route element={<ProfileDetailPage />} path="/profiles/:entityType/:id" /></Routes></MemoryRouter></ClientThemeProvider>);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="technician-profile-services"]')?.textContent).toContain("暂无服务信息");
    });
  });

  it("keeps the optional dynamic link inside the active merchant scope", async () => {
    await act(async () => {
      root.render(<ClientThemeProvider><MemoryRouter initialEntries={["/merchant/profiles/technician/s0000000186"]}><Routes><Route element={<ProfileDetailPage />} path="/merchant/profiles/:entityType/:id" /></Routes></MemoryRouter></ClientThemeProvider>);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(container.querySelector('a[href="/merchant/moments/users/186"]')).not.toBeNull();
    });
  });

  it("retries a failed formal technician read without a fallback profile", async () => {
    apiMocks.getTechnicianDetail.mockRejectedValueOnce(new Error("temporary network failure")).mockResolvedValueOnce(technicianDetail);

    await act(async () => {
      root.render(<ClientThemeProvider><MemoryRouter initialEntries={["/profiles/technician/s0000000186"]}><Routes><Route element={<ProfileDetailPage />} path="/profiles/:entityType/:id" /></Routes></MemoryRouter></ClientThemeProvider>);
      await Promise.resolve();
      await Promise.resolve();
    });

    const retryButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "重新加载技师资料");
    expect(container.textContent).toContain("技师资料读取失败");
    expect(retryButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      (retryButton as HTMLButtonElement).click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(apiMocks.getTechnicianDetail).toHaveBeenCalledTimes(2);
      expect(container.querySelector('[data-testid="technician-profile-info-view"]')).not.toBeNull();
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});
