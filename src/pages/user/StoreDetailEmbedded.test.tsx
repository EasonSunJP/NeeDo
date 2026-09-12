// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { UnifiedFormalStoreDetail } from "./StoreDetailPage";
import { coreReadApi, type CoreShopDetail } from "../../features/core-read/api";
import { persistentResourceCache } from "../../lib/persistentResourceCache";
import { bookingApi, type BookingScheduleSlot } from "../../features/booking/api";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ session: null }) }));
const locale = vi.hoisted(() => ({ language: "zh" }));
const pricingModeMock = vi.hoisted(() => ({ getBookingNavigation: vi.fn() }));
vi.mock("../../i18n/I18nProvider", () => ({ useI18n: () => locale, useOptionalI18n: () => locale }));
vi.mock("../../state/entityStore", () => ({ useEntityStore: () => ({ customers: [], technicians: [] }) }));
vi.mock("../../features/social/context", () => ({ useSocial: () => ({ getActorForScope: () => null, getProfilePosts: () => [] }) }));
vi.mock("../../features/pricing-mode/api", () => ({ pricingModeApi: pricingModeMock }));

let container: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  await persistentResourceCache.clearScope("public");
  locale.language = "zh";
  pricingModeMock.getBookingNavigation.mockReset().mockResolvedValue(null);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });
async function render() {
  await act(async () => root.render(<MemoryRouter><UnifiedFormalStoreDetail shopId={21} scope="user" embedded /></MemoryRouter>));
}
async function waitForText(text: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (container.textContent?.includes(text)) return;
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 0)));
  }
  expect(container.textContent).toContain(text);
}
it("keeps unavailable shop loading and retry inside the drawer", async () => {
  const request = vi.spyOn(coreReadApi, "getShopDetail").mockRejectedValue(new Error("shop unavailable"));
  await render();
  expect(container.textContent).toContain("shop unavailable");
  expect(container.querySelector("nav")).toBeNull();
  const retry = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "重新加载");
  expect(retry).toBeDefined();
  await act(async () => retry!.click());
  expect(request).toHaveBeenCalledTimes(2);
  expect(request).toHaveBeenLastCalledWith(21, { locale: "zh-CN" });
});
it("renders and switches all six public presentation tabs without a page shell", async () => {
  const shop = {
    id: 21, publicId: "S0000000021", name: "正式店铺资料", city: "東京都", address: "渋谷区",
    coverUrl: null, description: "店铺介绍", phone: null, latitude: null, longitude: null,
    reviewSummary: { ratingAverage: "0", reviewCount: 0, latestReviewAt: null, highlights: [] },
    completedOrderCount: 0, favoriteCount: 0, shareCount: 0, serviceCategories: [], businessKeywords: [], mediaAssets: [], services: [], technicians: [],
    createdAt: "2026-09-07T00:00:00Z", updatedAt: "2026-09-07T00:00:00Z"
  } satisfies CoreShopDetail;
  vi.spyOn(coreReadApi, "getShopDetail").mockResolvedValue(shop);
  await render();
  await waitForText("正式店铺资料");
  expect(container.textContent).toContain("正式店铺资料");
  for (const label of ["首页", "环境", "菜单", "动态", "情报", "地图"]) {
    let button: HTMLButtonElement | undefined;
    await vi.waitFor(() => {
      button = Array.from(container.querySelectorAll("button")).find((node) => node.textContent === label);
      expect(button, label).toBeDefined();
    });
    await act(async () => button!.click());
  }
  expect(container.querySelector("nav")).toBeNull();
});

it("localizes the embedded loading state", async () => {
  locale.language = "ja";
  vi.spyOn(coreReadApi, "getShopDetail").mockReturnValue(new Promise(() => {}));
  await render();
  expect(container.querySelector('[role="status"]')?.textContent).toBe("実店舗情報を読み込み中");
  expect(container.querySelector("nav")).toBeNull();
});

it("builds checkout actions only from an exact future formal slot", async () => {
  const service = {
    id: 31,
    publicId: "svc0000000031",
    name: "正式肩颈调理",
    description: "正式服务",
    category: {
      id: 4,
      code: "massage",
      name: "按摩",
      nameJa: "マッサージ",
      nameEn: "Massage",
      parentId: null,
      iconUrl: null,
      sortOrder: 1,
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z"
    },
    shop: {
      id: 21,
      publicId: "shop0000000021",
      name: "正式店铺资料",
      city: "東京都",
      address: "渋谷区",
      coverUrl: null,
      reviewSummary: { ratingAverage: "0", reviewCount: 0, latestReviewAt: null, highlights: [] },
      completedOrderCount: 0,
      favoriteCount: 0,
      shareCount: 0,
      serviceCategories: [],
      businessKeywords: []
    },
    technician: null,
    city: "東京都",
    priceAmount: "8800",
    currency: "JPY",
    durationMinutes: 60,
    usageCount: 0,
    coverUrl: null,
    reviewSummary: { ratingAverage: "0", reviewCount: 0, latestReviewAt: null, highlights: [] }
  };
  const shop = {
    ...service.shop,
    description: "店铺介绍",
    phone: null,
    latitude: null,
    longitude: null,
    mediaAssets: [],
    services: [service],
    technicians: [],
    createdAt: "2026-09-07T00:00:00Z",
    updatedAt: "2026-09-07T00:00:00Z"
  } satisfies CoreShopDetail;
  const formalSlot: BookingScheduleSlot = {
    id: 902,
    serviceId: 31,
    technicianServiceId: null,
    shopId: 21,
    technicianProfileId: null,
    startsAt: "2026-09-13T12:00:00.000Z",
    endsAt: "2026-09-13T13:00:00.000Z",
    capacity: 1,
    bookedCount: 0,
    status: "available",
    serviceName: "正式肩颈调理",
    shopName: "正式店铺资料",
    technicianName: null,
    priceAmount: "8800",
    currency: "JPY",
    durationMinutes: 60
  };
  vi.spyOn(Date, "now").mockReturnValue(new Date("2026-09-13T03:00:00.000Z").getTime());
  vi.spyOn(coreReadApi, "getShopDetail").mockResolvedValue(shop);
  pricingModeMock.getBookingNavigation.mockResolvedValue({
    shopId: 21,
    pricingMode: "merchant",
    technicianPricingRatePercent: 0,
    entry: "service_menu",
    services: {
      list: [{ id: 31, name: service.name, priceAmount: service.priceAmount, currency: "JPY", durationMinutes: 60, coverUrl: null, description: service.description, tags: ["按摩"], usageCount: 0 }],
      total: 1,
      page: 1,
      page_size: 20
    }
  });
  const listAvailability = vi.spyOn(bookingApi, "listAvailability").mockResolvedValue({
    list: [formalSlot],
    total: 1,
    page: 1,
    page_size: 100
  });

  await render();
  await waitForText("正式肩颈调理");
  await vi.waitFor(() => {
    expect(container.querySelector('a[href*="scheduleSlotId=902"]')).not.toBeNull();
  });

  expect(listAvailability).toHaveBeenCalledWith(expect.objectContaining({
    from: "2026-09-12T15:00:00.000Z",
    includeUnavailable: true,
    serviceId: 31,
    shopId: 21,
    to: "2026-09-13T15:00:00.000Z"
  }));
  const checkoutHref = container.querySelector<HTMLAnchorElement>('a[href*="scheduleSlotId=902"]')!.getAttribute("href")!;
  expect(checkoutHref).toContain("date=2026-09-13");
  expect(checkoutHref).toContain("time=21%3A00");
  expect(checkoutHref).not.toContain("time=00%3A00");
});
