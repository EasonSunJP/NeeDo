// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StoreDetailExperience, UnifiedFormalStoreDetail } from "./StoreDetailPage";
import { coreReadApi, type CoreShopDetail } from "../../features/core-read/api";
import { persistentResourceCache } from "../../lib/persistentResourceCache";
import {
  bookingApi,
  type BookingAvailabilityDateSummary,
  type BookingAvailabilityStartSummary,
  type BookingScheduleSlot
} from "../../features/booking/api";
import type { Store, Technician } from "../../types/domain";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ session: null }) }));
const locale = vi.hoisted(() => ({ language: "zh" }));
const pricingModeMock = vi.hoisted(() => ({ getBookingNavigation: vi.fn() }));
const backofficeMock = vi.hoisted(() => ({
  createService: vi.fn(),
  merchantShopPresentation: vi.fn(),
  services: vi.fn()
}));
vi.mock("../../i18n/I18nProvider", () => ({ useI18n: () => locale, useOptionalI18n: () => locale }));
vi.mock("../../state/entityStore", () => ({ useEntityStore: () => ({ customers: [], technicians: [] }) }));
vi.mock("../../features/social/context", () => ({ useSocial: () => ({ getActorForScope: () => null, getProfilePosts: () => [] }) }));
vi.mock("../../features/pricing-mode/api", () => ({ pricingModeApi: pricingModeMock }));
vi.mock("../../api/backofficeRealData", () => ({
  backofficeRealDataApi: backofficeMock
}));

let container: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  await persistentResourceCache.clearScope("public");
  locale.language = "zh";
  pricingModeMock.getBookingNavigation.mockReset().mockResolvedValue(null);
  backofficeMock.createService.mockReset();
  backofficeMock.merchantShopPresentation.mockReset().mockReturnValue(new Promise(() => {}));
  backofficeMock.services.mockReset().mockResolvedValue({ list: [], total: 0, page: 1, page_size: 100 });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });
async function render() {
  await act(async () => root.render(<MemoryRouter><UnifiedFormalStoreDetail shopId={21} scope="user" embedded /></MemoryRouter>));
}

async function renderFormalMerchantPreview(
  technicianCount = 1,
  scope: "merchant" | "user" = "merchant"
) {
  const store = {
    id: "21",
    systemId: "shop7507769538",
    merchantId: "merchant-21",
    name: "麻布十番超级按摩",
    area: "東京都",
    address: "港区",
    rating: 0,
    reviewCount: 0,
    priceLabel: "预约确认",
    tags: [],
    openStatus: "open",
    nextSlot: "可预约",
    alwaysBookable: true,
    cover: "/images/generated/stores/store-cafe-consult.jpg",
    gallery: ["/images/generated/stores/store-cafe-consult.jpg"],
    description: "正式店铺",
    rankLabel: "公开店铺",
    businessHours: "请以店铺确认为准",
    mode: "store",
    paymentMethods: []
  } satisfies Store;
  const technicians = Array.from({ length: technicianCount }, (_, index) => ({
    id: String(501 + index),
    systemId: `s${String(501 + index).padStart(10, "0")}`,
    name: index === 0 ? "正式技师一号" : `正式技师${index + 1}号`,
    storeId: "21",
    role: "therapist" as const,
    status: "available" as const,
    rating: 0,
    orderCount: 0,
    income: 0,
    skills: [],
    serviceAreas: ["東京都"],
    acceptRate: 0,
    cancelRate: 0,
    reviewCount: 0,
    favoriteCount: 0,
    shareCount: 0,
    languages: ["日本語"],
    avatar: `/images/generated/profiles/ai-profile-${String(index + 1).padStart(2, "0")}.jpg`
  })) satisfies Technician[];

  await act(async () => root.render(
    <MemoryRouter>
      <StoreDetailExperience
        embedded
        formalApiOnly
        presentationOverride={{
          subtitle: "legacy",
          favoriteCount: 0,
          distance: "legacy",
          station: "legacy",
          access: "legacy",
          seatLabel: "环境",
          menuLabel: "服务项目",
          peopleLabel: "预约人数",
          paymentMethods: [],
          equipment: [],
          parking: "legacy",
          routeGuide: "legacy",
          seatFilters: [],
          offers: [],
          menuCards: [{
            id: "legacy-service",
            sourceServiceId: "svc-fallback",
            name: "标准到店服务",
            subtitle: "legacy",
            duration: "60 分钟",
            priceLabel: "￥0",
            audience: "legacy",
            tags: ["可预约"],
            cover: store.cover,
            highlights: []
          }]
        }}
        scope={scope}
        serviceCardsOverride={[]}
        store={store}
        techniciansOverride={technicians}
      />
    </MemoryRouter>
  ));
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

it("shows pending availability without authoritative unavailable markers", async () => {
  pricingModeMock.getBookingNavigation.mockReturnValue(new Promise(() => {}));

  await renderFormalMerchantPreview(1, "user");

  expect(container.textContent).toContain("正在读取可约日期");
  expect(container.textContent).toContain("正在读取可预约时间");
  expect(container.textContent).toContain("正在读取可预约服务");
  expect(container.querySelector(".availability-calendar-dash")).toBeNull();
  expect(container.textContent).not.toContain("暂无可预约时间");
  expect(container.textContent).not.toContain("暂无可预约服务");
  const pendingTechnicianButton = container.querySelector<HTMLButtonElement>('button[aria-label="正在读取可预约状态…"]');
  expect(pendingTechnicianButton?.disabled).toBe(true);
  expect(container.querySelector('button[aria-label="当前时间不可约"]')).toBeNull();
});

it("localizes the embedded loading state", async () => {
  locale.language = "ja";
  vi.spyOn(coreReadApi, "getShopDetail").mockReturnValue(new Promise(() => {}));
  await render();
  expect(container.querySelector('[role="status"]')?.textContent).toBe("実店舗情報を読み込み中");
  expect(container.querySelector("nav")).toBeNull();
});

it("rejects legacy service cards while keeping the formal technician projection in merchant preview", async () => {
  await renderFormalMerchantPreview();

  expect(container.textContent).toContain("正式技师一号");
  expect(container.textContent).toContain("暂无可预约服务");
  expect(container.textContent).not.toContain("标准到店服务");
  expect(container.textContent).not.toContain("￥0");
  expect(container.querySelector('a[href*="svc-fallback"]')).toBeNull();
});

it("renders the complete merchant technician roster when more than eight employees are returned", async () => {
  await renderFormalMerchantPreview(10);

  expect(container.textContent).toContain("正式技师一号");
  expect(container.textContent).toContain("正式技师9号");
  expect(container.textContent).toContain("正式技师10号");
  expect(container.textContent?.match(/正式技师(?:一号|\d+号)/g)).toHaveLength(10);
});

it("renders the complete public technician roster instead of truncating it to eight entries", async () => {
  await renderFormalMerchantPreview(26, "user");

  expect(container.textContent).toContain("正式技师一号");
  expect(container.textContent).toContain("正式技师9号");
  expect(container.textContent).toContain("正式技师26号");
  expect(container.textContent?.match(/正式技师(?:一号|\d+号)/g)).toHaveLength(26);
});

it("uses the complete merchant catalog count and keeps service creation available below twenty", async () => {
  locale.language = "ja";
  const catalog = [79, 80, 81].map((id) => ({
    id,
    categoryId: 4,
    categoryName: "マッサージ",
    shopId: 21,
    shopName: "正式店铺",
    technicianProfileId: null,
    name: `サービス ${id}`,
    description: "正式サービス",
    city: "東京都",
    serviceMode: "store",
    priceAmount: 8_800,
    currency: "JPY",
    durationMinutes: 60,
    status: "published",
    isRecommended: false,
    sortOrder: id,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z"
  }));
  const content = {
    storeName: "正式店铺",
    description: "正式资料",
    address: "港区",
    area: "東京都",
    rankLabel: "",
    businessHours: "10:00-20:00",
    subtitle: "",
    station: "",
    distance: "",
    parking: "",
    routeGuide: "",
    paymentMethods: [],
    equipment: [],
    carousel: [],
    serviceMenus: catalog.map((service) => ({
      serviceId: service.id,
      name: service.name,
      description: service.description,
      audience: "",
      tags: [],
      highlights: [],
      coverMediaAssetPublicId: null
    }))
  };
  backofficeMock.services.mockResolvedValue({ list: catalog, total: 3, page: 1, page_size: 100 });
  vi.spyOn(coreReadApi, "listCategories").mockResolvedValue({
    list: [{
      id: 4,
      code: "massage",
      name: "マッサージ",
      nameJa: "マッサージ",
      nameEn: "Massage",
      parentId: null,
      iconUrl: null,
      sortOrder: 1,
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }],
    total: 1,
    page: 1,
    page_size: 100
  });
  backofficeMock.createService.mockResolvedValue({
    ...catalog[0],
    id: 82,
    name: "新サービス",
    description: "新しい正式サービス",
    sortOrder: 3
  });
  backofficeMock.merchantShopPresentation.mockResolvedValue({
    shopId: 21,
    locales: Object.fromEntries(["ja", "en", "ko", "zh-CN", "zh-TW"].map((code) => [code, {
      locale: code,
      lockVersion: 1,
      content,
      updatedAt: "2026-09-01T00:00:00.000Z"
    }])),
    media: {},
    services: catalog.map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description,
      priceAmount: String(service.priceAmount),
      currency: service.currency,
      durationMinutes: service.durationMinutes,
      coverMediaAssetPublicId: null
    }))
  });

  const store = {
    id: "21", systemId: "shop7507769538", merchantId: "merchant-21", name: "正式店铺",
    area: "東京都", address: "港区", rating: 0, reviewCount: 0, priceLabel: "予約確認",
    tags: [], openStatus: "open", nextSlot: "予約可", alwaysBookable: true,
    cover: "/images/generated/stores/store-cafe-consult.jpg",
    gallery: ["/images/generated/stores/store-cafe-consult.jpg"], description: "正式资料",
    rankLabel: "", businessHours: "10:00-20:00", mode: "store", paymentMethods: []
  } satisfies Store;
  const serviceCards = catalog.map((service) => ({
    id: String(service.id), coverUrl: null, name: service.name, priceAmount: service.priceAmount,
    currency: service.currency, durationMinutes: service.durationMinutes, completedOrderCount: 0,
    shopPublicId: "shop7507769538", shopAddress: "港区", description: service.description, tags: []
  }));

  await act(async () => root.render(
    <MemoryRouter>
      <StoreDetailExperience embedded formalApiOnly scope="merchant" serviceCardsOverride={serviceCards} store={store} techniciansOverride={[]} />
    </MemoryRouter>
  ));
  await waitForText("サービスを追加 3/20");
  const addButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("サービスを追加 3/20"));
  expect(addButton).toBeDefined();
  expect(addButton?.disabled).toBe(false);
  expect(container.textContent).not.toContain("サービス上限 20/20");

  await act(async () => addButton!.click());
  expect(container.textContent).toContain("新しいサービスを作成");
  const editor = container.querySelector<HTMLElement>('[data-testid="merchant-shop-service-create-editor"]')!;
  await vi.waitFor(() => expect(editor.querySelectorAll("option")).toHaveLength(2));
  const [nameInput, priceInput, durationInput] = Array.from(editor.querySelectorAll<HTMLInputElement>("input"));
  await act(async () => {
    for (const [input, value] of [[nameInput, "新サービス"], [priceInput, "9800"], [durationInput, "75"]] as const) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  const createButton = Array.from(editor.querySelectorAll("button")).find((button) => button.textContent === "作成して追加");
  await act(async () => createButton!.click());
  await waitForText("サービスを追加 4/20");
  expect(backofficeMock.createService).toHaveBeenCalledWith("merchant-admin", expect.objectContaining({
    categoryId: 4,
    technicianProfileId: null,
    name: "新サービス",
    priceAmount: 9_800,
    durationMinutes: 75,
    status: "published"
  }));
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
    serviceMode: "store",
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
  const formalStartSummary: BookingAvailabilityStartSummary = {
    startsAt: formalSlot.startsAt,
    options: [{
      scheduleSlotId: formalSlot.id,
      technicianProfileId: formalSlot.technicianProfileId,
      technicianServiceId: formalSlot.technicianServiceId,
      serviceId: formalSlot.serviceId
    }]
  };
  const formalDateSummary: BookingAvailabilityDateSummary = {
    startsAt: formalSlot.startsAt,
    availableStartCount: 1,
    availableTechnicianCount: 1
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
  const listAvailability = vi.spyOn(bookingApi, "listAvailability").mockImplementation(async (query) => ({
    list: query.summaryByDate ? [formalDateSummary] : query.summaryByStart ? [formalStartSummary] : [formalSlot],
    total: 1,
    page: 1,
    page_size: 100
  }) as never);

  await render();
  await waitForText("正式肩颈调理");
  await vi.waitFor(() => {
    expect(container.querySelector('a[href*="scheduleSlotId=902"]')).not.toBeNull();
  });

  expect(listAvailability).toHaveBeenCalledWith(expect.objectContaining({
    from: "2026-09-12T15:00:00.000Z",
    serviceId: 31,
    shopId: 21,
    summaryByStart: true,
    to: "2026-09-13T15:00:00.000Z"
  }));
  const checkoutHref = container.querySelector<HTMLAnchorElement>('a[href*="scheduleSlotId=902"]')!.getAttribute("href")!;
  expect(checkoutHref).toContain("date=2026-09-13");
  expect(checkoutHref).toContain("time=21%3A00");
  expect(checkoutHref).not.toContain("time=00%3A00");
});

it("routes an available technician selection to services using only 30-minute customer starts", async () => {
  const visitDate = new Date();
  visitDate.setDate(visitDate.getDate() + 1);
  const dateKey = [
    visitDate.getFullYear(),
    String(visitDate.getMonth() + 1).padStart(2, "0"),
    String(visitDate.getDate()).padStart(2, "0")
  ].join("-");
  const makeTechnicianStart = (scheduleSlotId: number, technicianProfileId: number, time: string): BookingAvailabilityStartSummary => ({
    startsAt: new Date(`${dateKey}T${time}:00+09:00`).toISOString(),
    options: [{
      scheduleSlotId,
      technicianProfileId,
      technicianServiceId: 200 + technicianProfileId,
      serviceId: null
    }]
  });
  pricingModeMock.getBookingNavigation.mockResolvedValue({
    shopId: 21,
    pricingMode: "technician",
    technicianPricingRatePercent: 0,
    entry: "technician_list",
    technicians: { list: [], total: 2, page: 1, page_size: 20 }
  });
  const technicianStarts = [
    makeTechnicianStart(951, 501, "09:45"),
    makeTechnicianStart(952, 501, "10:00"),
    makeTechnicianStart(953, 502, "10:30")
  ];
  vi.spyOn(bookingApi, "listAvailability").mockImplementation(async (query) => ({
    list: query.summaryByDate ? [{
      startsAt: technicianStarts[1]!.startsAt,
      availableStartCount: 2,
      availableTechnicianCount: 2
    }] : technicianStarts,
    total: query.summaryByDate ? 1 : 3,
    page: 1,
    page_size: 100
  }) as never);

  await renderFormalMerchantPreview(2, "user");
  await vi.waitFor(() => {
    const timeSelect = container.querySelectorAll("select")[1];
    expect(Array.from(timeSelect?.options ?? []).map((option) => option.value)).toEqual(["10:00", "10:30"]);
  });
  const unavailableTechnician = container.querySelector<HTMLButtonElement>('button[aria-label="当前时间不可约"]');
  expect(unavailableTechnician?.disabled).toBe(true);
  const selectTechnician = container.querySelector<HTMLButtonElement>('button[aria-label="待选技师"]');
  expect(selectTechnician).not.toBeNull();
  await act(async () => selectTechnician!.click());

  await vi.waitFor(() => {
    const bookingLink = Array.from(container.querySelectorAll<HTMLAnchorElement>("a"))
      .find((link) => link.textContent?.includes("立即预约"));
    expect(bookingLink?.getAttribute("href")).toContain(`/stores/21/technicians/501/services?date=${dateKey}`);
    expect(bookingLink?.getAttribute("href")).toContain("time=10%3A00");
  });
  expect(container.textContent).not.toContain("暂无可预约服务");
});
