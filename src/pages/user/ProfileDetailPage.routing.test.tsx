// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  coreReadApi,
  type CoreCustomerProfile,
  type CoreShopDetail,
  type CoreTechnicianDetail
} from "../../features/core-read/api";
import { pricingModeApi } from "../../features/pricing-mode/api";
import { persistentResourceCache } from "../../lib/persistentResourceCache";
import { ClientThemeProvider } from "../../theme/ClientThemeProvider";
import { ProfileDetailPage } from "./ProfileDetailPage";

vi.mock("../../features/social/route-pages", () => ({
  SocialAccountProfilePage: () => <main aria-label="社交资料页">社交资料页</main>
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const reviewSummary = {
  ratingAverage: "4.9",
  reviewCount: 12,
  latestReviewAt: null,
  highlights: ["专业"]
};

const customer: CoreCustomerProfile = {
  id: 23,
  publicId: "u0000000023",
  displayName: "Aoi",
  city: "东京都",
  bio: "用户简介",
  avatarUrl: null,
  gender: "female",
  age: 33,
  heightCm: 168,
  languages: ["日本語", "中文"],
  membershipLevel: "gold",
  level: 27,
  reviewSummary: {
    ratingAverage: "4.7",
    reviewCount: 18,
    latestReviewAt: "2026-09-18T03:00:00.000Z",
    highlights: ["守时", "沟通顺畅"]
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z"
};

const shop: CoreShopDetail = {
  id: 7,
  publicId: "shop0000000007",
  name: "GINZA Calm Body Lab",
  city: "东京都",
  address: "东京都中央区银座 1-2-3",
  coverUrl: null,
  reviewSummary,
  completedOrderCount: 0,
  favoriteCount: 4,
  shareCount: 2,
  serviceCategories: [],
  businessKeywords: [],
  description: "店铺简介",
  phone: null,
  latitude: null,
  longitude: null,
  mediaAssets: [],
  services: [],
  technicians: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z"
};

const technician: CoreTechnicianDetail = {
  id: 17,
  socialAccountUserId: 741,
  socialIdentityId: 1741,
  publicId: "s0000000017",
  displayName: "Misaki",
  city: "东京都",
  avatarUrl: null,
  reviewSummary,
  age: 28,
  favoriteCount: 0,
  shareCount: 0,
  completedOrderCount: 12,
  acceptanceRatePercent: 100,
  primaryService: null,
  shop: null,
  bio: "专业肩颈护理。",
  serviceArea: "银座",
  gender: "female",
  heightCm: 165,
  languages: ["日本語", "中文"],
  yearsExperience: 5,
  reviewTagSummary: { special: [], custom: [] },
  mediaAssets: [],
  services: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z"
};

let container: HTMLDivElement;
let root: Root;

async function waitFor(assertion: () => void) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    }
  }
  throw lastError;
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

async function renderRoute(path: string) {
  await act(async () => {
    root.render(
      <ClientThemeProvider>
        <MemoryRouter initialEntries={[path]} key={path}>
          <Routes>
            <Route element={<ProfileDetailPage />} path="/profiles/:entityType/:id" />
            <Route element={<ProfileDetailPage />} path="/:portal/profiles/:entityType/:id" />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </ClientThemeProvider>
    );
  });
}

beforeEach(async () => {
  await persistentResourceCache.clearScope("public");
  vi.spyOn(pricingModeApi, "listPublicTechnicianProfileServices").mockResolvedValue({
    list: [],
    total: 0,
    page: 1,
    page_size: 20
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("ProfileDetailPage routing behavior", () => {
  it("replaces a legacy numeric technician route with the canonical public ID", async () => {
    const getTechnicianDetail = vi.spyOn(coreReadApi, "getTechnicianDetail").mockResolvedValue(technician);

    await renderRoute("/profiles/technician/17?view=card");

    await waitFor(() => {
      expect(container.querySelector('[data-testid="location"]')?.textContent).toBe(
        "/profiles/technician/s0000000017?view=card"
      );
    });
    expect(getTechnicianDetail).toHaveBeenCalledWith(17);
  });

  it.each([
    "/profiles/technician/17",
    "/profiles/technician/17?view=social"
  ])("keeps %s on the formal technician information card", async (path) => {
    const getTechnicianDetail = vi.spyOn(coreReadApi, "getTechnicianDetail").mockResolvedValue(technician);

    await renderRoute(path);

    await waitFor(() => {
      expect(getTechnicianDetail).toHaveBeenCalledWith(17);
      expect(container.textContent).toContain("Misaki");
    });
    expect(container.textContent).toContain("详细信息卡");
    expect(container.querySelector('main[aria-label="社交资料页"]')).toBeNull();
  });

  it("preserves customer and shop API profile routing", async () => {
    const getCustomerProfile = vi.spyOn(coreReadApi, "getCustomerProfile").mockResolvedValue(customer);
    const getShopDetail = vi.spyOn(coreReadApi, "getShopDetail").mockResolvedValue(shop);

    await renderRoute("/profiles/user/23");
    await waitFor(() => expect(getCustomerProfile).toHaveBeenCalledWith(23));
    expect(container.textContent).toContain("用户资料");

    await renderRoute("/profiles/shop/7");
    await waitFor(() => expect(getShopDetail).toHaveBeenCalledWith(7));
    expect(container.textContent).toContain("店铺资料");
  });

  it.each([
    "/profiles/shop/shop0000000007",
    "/merchant/profiles/shop/shop0000000007",
    "/technician/profiles/shop/shop0000000007"
  ])("opens the formal shop profile from public ID route %s", async (path) => {
    const getShopDetail = vi.spyOn(coreReadApi, "getShopDetail").mockResolvedValue(shop);

    await renderRoute(path);

    await waitFor(() => expect(getShopDetail).toHaveBeenCalledWith("shop0000000007"));
    expect(container.textContent).toContain("店铺资料");
    expect(container.querySelector('main[aria-label="社交资料页"]')).toBeNull();
  });

  it("passes an intelligence source only to the shop detail request and does not offer an inaccessible store link", async () => {
    const getShopDetail = vi.spyOn(coreReadApi, "getShopDetail").mockResolvedValue(shop);

    await renderRoute("/profiles/shop/shop0000000007?sourcePostId=61");

    await waitFor(() => expect(getShopDetail).toHaveBeenCalledWith("shop0000000007", { sourcePostId: 61 }));
    expect(container.textContent).toContain("店铺资料");
    expect(container.querySelector('a[href^="/stores/"]')).toBeNull();
  });

  it("does not flash a previous source-scoped shop when navigating to another shop", async () => {
    const getShopDetail = vi.spyOn(coreReadApi, "getShopDetail").mockImplementation((id) =>
      id === "shop0000000007" ? Promise.resolve(shop) : new Promise(() => undefined)
    );
    await act(async () => root.render(
      <ClientThemeProvider>
        <MemoryRouter initialEntries={["/profiles/shop/shop0000000007?sourcePostId=61"]}>
          <Routes>
            <Route element={<ProfileDetailPage />} path="/profiles/:entityType/:id" />
          </Routes>
          <Link to="/profiles/shop/shop0000000008?sourcePostId=62">下一家店</Link>
        </MemoryRouter>
      </ClientThemeProvider>
    ));
    await waitFor(() => expect(container.textContent).toContain("GINZA Calm Body Lab"));

    await act(async () => container.querySelector<HTMLAnchorElement>('a[href="/profiles/shop/shop0000000008?sourcePostId=62"]')?.click());

    expect(getShopDetail).toHaveBeenCalledWith("shop0000000008", { sourcePostId: 62 });
    expect(container.textContent).not.toContain("GINZA Calm Body Lab");
    expect(container.textContent).toContain("正在载入店铺");
  });

  it("shows relationship-scoped customer basics and credit review history to the technician portal", async () => {
    const getCustomerProfile = vi.spyOn(coreReadApi, "getCustomerProfile").mockResolvedValue(customer);

    await renderRoute("/technician/profiles/user/23");

    await waitFor(() => expect(getCustomerProfile).toHaveBeenCalledWith(23));
    for (const value of [
      "基础信息",
      "女",
      "33",
      "168cm",
      "日本語",
      "中文",
      "黄金会员",
      "Lv.27",
      "信用评价",
      "4.7",
      "18",
      "守时",
      "沟通顺畅",
      "2026"
    ]) {
      expect(container.textContent).toContain(value);
    }
    expect(container.textContent).not.toContain("邮箱");
    expect(container.textContent).not.toContain("手机号");
    expect(container.textContent).not.toContain("地址");
  });
});
