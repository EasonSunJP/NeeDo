// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bookingApi,
  type BookingOrder,
  type BookingScheduleSlot,
  type TechnicianServiceBookingContext
} from "../../features/booking/api";
import {
  coreReadApi,
  type CoreServiceDetail,
  type CoreTechnicianDetail
} from "../../features/core-read/api";
import { pricingModeApi } from "../../features/pricing-mode/api";
import * as exchangeApi from "../../features/exchange/api";
import type { ExchangePost } from "../../features/exchange/types";
import { ClientThemeProvider } from "../../theme/ClientThemeProvider";
import { CheckoutPage } from "./CheckoutPage";
import { ProfileDetailPage } from "./ProfileDetailPage";

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ isAuthenticated: true })
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const reviewSummary = {
  ratingAverage: "5.0",
  reviewCount: 8,
  latestReviewAt: null,
  highlights: ["服务精神"]
};

const reviewTagSummary = {
  special: [
    { code: "appeal_max" as const, label: "魅力max", count: 0 },
    { code: "service_max" as const, label: "服务max", count: 1 },
    { code: "emotion_max" as const, label: "情绪max", count: 0 },
    { code: "energy_max" as const, label: "元气max", count: 0 }
  ],
  custom: []
};

const technicianCard = {
  id: 17,
  publicId: "s0000000017",
  displayName: "Misaki",
  city: "东京都",
  avatarUrl: "/images/misaki.jpg",
  reviewSummary,
  age: 28,
  favoriteCount: 0,
  shareCount: 0,
  completedOrderCount: 12,
  acceptanceRatePercent: 100,
  primaryService: {
    id: 31,
    name: "肩颈调理",
    priceAmount: "8800.00",
    currency: "JPY",
    durationMinutes: 60
  }
};

const service: CoreServiceDetail = {
  id: 31,
  publicId: "svc0000000031",
  name: "肩颈调理",
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
    id: 7,
    publicId: "m0000000007",
    name: "GINZA Calm Body Lab",
    city: "东京都",
    address: "东京都中央区银座 1-2-3",
    coverUrl: null,
    reviewSummary,
    favoriteCount: 0,
    shareCount: 0,
    serviceCategories: [],
    businessKeywords: []
  },
  technician: technicianCard,
  city: "东京都",
  priceAmount: "8800.00",
  currency: "JPY",
  durationMinutes: 60,
  usageCount: 12,
  coverUrl: null,
  reviewSummary,
  serviceMode: "store",
  mediaAssets: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z"
};

const technicianDetail: CoreTechnicianDetail = {
  ...technicianCard,
  shop: service.shop,
  bio: "专业肩颈护理。",
  serviceArea: "银座",
  gender: "female",
  heightCm: 165,
  languages: ["日本語", "中文"],
  yearsExperience: 5,
  reviewTagSummary,
  mediaAssets: [],
  services: [service],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z"
};

const harukaDetail: CoreTechnicianDetail = {
  ...technicianDetail,
  id: 16,
  publicId: "s0000000016",
  displayName: "Haruka",
  bio: "专业芳香护理。"
};

const makeSlot = (id: number, startsAt: string, technicianProfileId = 17, technicianName = "Misaki"): BookingScheduleSlot => ({
  id,
  serviceId: 31,
  technicianServiceId: null,
  shopId: 7,
  technicianProfileId,
  startsAt,
  endsAt: new Date(new Date(startsAt).getTime() + 3_600_000).toISOString(),
  capacity: 1,
  bookedCount: 0,
  status: "available",
  serviceName: "肩颈调理",
  shopName: "GINZA Calm Body Lab",
  technicianName,
  priceAmount: "8800.00",
  currency: "JPY",
  durationMinutes: 60
});

const slots = [
  makeSlot(101, "2026-09-02T23:00:00.000Z"),
  makeSlot(102, "2026-09-03T02:30:00.000Z", 16, "Haruka"),
  makeSlot(103, "2026-09-03T02:30:00.000Z", 17, "Misaki")
];

const createdOrder: BookingOrder = {
  id: 901,
  orderNo: "ND202609030901",
  orderType: "booking",
  status: "pending",
  paymentMethod: "onsite",
  paymentStatus: "pending",
  paymentAmountJpy: 8800,
  paymentConfirmedById: null,
  paymentConfirmedAt: null,
  paymentReference: null,
  paymentNote: null,
  paymentRefundedById: null,
  paymentRefundedAt: null,
  paymentRefundReference: null,
  paymentRefundReason: null,
  customerUserId: 5,
  serviceId: 31,
  technicianServiceId: null,
  shopId: 7,
  technicianProfileId: 17,
  scheduleSlotId: 103,
  fulfillmentMode: "store",
  serviceName: "肩颈调理",
  shopName: "GINZA Calm Body Lab",
  technicianName: "Misaki",
  priceAmount: "8800.00",
  currency: "JPY",
  startsAt: slots[2]!.startsAt,
  endsAt: slots[2]!.endsAt,
  note: "quiet",
  cancelReason: null,
  createdAt: "2026-09-03T00:00:00.000Z",
  updatedAt: "2026-09-03T00:00:00.000Z",
  statusHistory: []
};

const intelligencePost: ExchangePost = {
  id: 61,
  type: "intelligence",
  status: "published",
  title: "正式情报活动",
  detail: "活动时段内可预约",
  contentLocale: "zh-CN",
  areaLabel: "银座",
  serviceStartAt: "2026-09-03T02:00:00.000Z",
  serviceEndAt: "2026-09-03T04:00:00.000Z",
  expiresAt: "2026-09-03T04:00:00.000Z",
  publishedAt: "2026-09-02T12:00:00.000Z",
  publisher: { publicId: "m0000000007", identityType: "merchant_owner", displayName: "GINZA Calm Body Lab", avatarUrl: null },
  counts: { comments: 0, likes: 0, shares: 0 },
  viewer: { liked: false, canWithdraw: false, canClaim: false, canViewClaims: false },
  demand: null,
  intelligence: {
    serviceMode: "store",
    addressLabel: "东京都中央区银座 1-2-3",
    serviceAreas: ["银座"],
    originalPriceJpy: 8_800,
    campaignPriceJpy: 7_000,
    booking: {
      available: true,
      unavailableReason: null,
      target: { type: "shop_service", id: 31 },
      catalogPriceJpy: 8_800,
      campaignPriceJpy: 7_000,
      serviceName: "肩颈调理",
      durationMinutes: 60,
      serviceMode: "store",
      serviceWindow: { startsAt: "2026-09-03T02:00:00.000Z", endsAt: "2026-09-03T04:00:00.000Z" }
    },
    publisherCard: {
      type: "shop",
      publicId: "shop0000000007",
      name: "GINZA Calm Body Lab",
      avatarUrl: null,
      coverUrl: null,
      imageUrls: [],
      status: "published",
      isBookable: true,
      ratingAverage: "5.0",
      reviewCount: 8,
      address: "东京都中央区银座 1-2-3",
      serviceMode: "store",
      detailPath: "/profiles/shop/shop0000000007"
    },
    serviceCard: {
      targetType: "shop_service",
      publicId: "svc0000000031",
      name: "肩颈调理",
      description: "正式服务",
      coverUrl: null,
      imageUrls: [],
      tags: ["按摩"],
      catalogPriceJpy: 8_800,
      campaignPriceJpy: 7_000,
      currency: "JPY",
      durationMinutes: 60,
      serviceMode: "store",
      shopPublicId: "shop0000000007",
      shopAddress: "东京都中央区银座 1-2-3",
      detailPath: "/services/svc0000000031"
    }
  }
};

const technicianBookingContext: TechnicianServiceBookingContext = {
  target: { type: "technician_service", id: 51 },
  serviceCard: {
    targetType: "technician_service",
    publicId: "technician-service0000000051",
    name: "技师限定肩颈调理",
    description: "技师正式服务",
    coverUrl: null,
    imageUrls: [],
    tags: ["肩颈"],
    catalogPriceJpy: 9_000,
    currency: "JPY",
    durationMinutes: 60,
    serviceMode: "store",
    serviceAreas: ["银座"],
    shopPublicId: "shop0000000007",
    shopAddress: "东京都中央区银座 1-2-3",
    detailPath: "/stores/shop0000000007/technicians/s0000000017/services"
  },
  shopCard: {
    type: "shop",
    publicId: "shop0000000007",
    name: "GINZA Calm Body Lab",
    coverUrl: null,
    imageUrls: [],
    status: "published",
    isBookable: true,
    ratingAverage: "5.0",
    reviewCount: 8,
    address: "东京都中央区银座 1-2-3",
    serviceMode: "store",
    detailPath: "/profiles/shop/shop0000000007"
  },
  technicianCard: {
    type: "technician",
    publicId: "s0000000017",
    displayName: "Misaki",
    avatarUrl: "/images/misaki.jpg",
    shop: { publicId: "shop0000000007", name: "GINZA Calm Body Lab" },
    status: "published",
    isBookable: true,
    yearsExperience: 5,
    completedOrderCount: 12,
    acceptanceRatePercent: 100,
    ratingAverage: "5.0",
    reviewCount: 8,
    serviceAreas: ["银座"],
    languages: ["日本語", "中文"],
    detailPath: "/profiles/technician/s0000000017",
    servicesPath: "/stores/shop0000000007/technicians/s0000000017/services"
  }
};

const technicianIntelligencePost: ExchangePost = {
  ...intelligencePost,
  id: 62,
  publisher: { publicId: "s0000000017", identityType: "technician", displayName: "Misaki", avatarUrl: "/images/misaki.jpg" },
  intelligence: {
    ...intelligencePost.intelligence!,
    originalPriceJpy: 9_000,
    campaignPriceJpy: 7_500,
    booking: {
      ...intelligencePost.intelligence!.booking,
      target: { type: "technician_service", id: 51 },
      catalogPriceJpy: 9_000,
      campaignPriceJpy: 7_500,
      serviceName: "技师限定肩颈调理"
    },
    publisherCard: technicianBookingContext.technicianCard,
    serviceCard: {
      ...technicianBookingContext.serviceCard,
      campaignPriceJpy: 7_500
    }
  }
};

const technicianSlot: BookingScheduleSlot = {
  ...makeSlot(151, "2026-09-03T02:30:00.000Z"),
  serviceId: null,
  technicianServiceId: 51,
  serviceName: "技师限定肩颈调理",
  priceAmount: "9000.00"
};

let container: HTMLDivElement;
let root: Root;

function LocationProbe() {
  const location = useLocation();
  const state = location.state && typeof location.state === "object"
    ? location.state as Record<string, unknown>
    : {};
  return (
    <output
      data-checkout-schedule-slot-id={String(state.checkoutScheduleSlotId ?? "")}
      data-existing-source={String(state.existingSource ?? "")}
      data-testid="location-probe"
    >
      {`${location.pathname}${location.search}`}
    </output>
  );
}

function HistoryBackControl() {
  const navigate = useNavigate();
  return <button aria-label="测试返回上一条历史" onClick={() => navigate(-1)} type="button" />;
}

async function waitFor(assertion: () => void) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
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

async function click(element: Element) {
  await act(async () => element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
}

beforeEach(() => {
  window.history.replaceState({ idx: 1 }, "", "/");
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      media: "",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.spyOn(pricingModeApi, "listPublicTechnicianServices").mockResolvedValue({
    list: [],
    page: 1,
    page_size: 20,
    total: 0
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("formal checkout technician-card round trip", () => {
  it("locks a shop Intelligence checkout to its target, activity price, window, and idempotent source submission", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-09-02T22:00:00.000Z").getTime());
    vi.spyOn(coreReadApi, "getServiceDetail").mockResolvedValue(service);
    vi.spyOn(coreReadApi, "getTechnicianDetail").mockResolvedValue(harukaDetail);
    vi.spyOn(exchangeApi, "getExchangePost").mockResolvedValue(intelligencePost);
    vi.spyOn(bookingApi, "listAvailability").mockResolvedValue({
      list: slots,
      total: slots.length,
      page: 1,
      page_size: 100
    });
    const createBooking = vi.spyOn(bookingApi, "createBooking").mockResolvedValue({
      ...createdOrder,
      exchangeIntelligencePostId: 61,
      paymentAmountJpy: 7_000,
      priceAmount: "7000.00",
      scheduleSlotId: 102
    });

    await act(async () => {
      root.render(
        <ClientThemeProvider>
          <MemoryRouter initialEntries={["/checkout/31?date=2026-09-03&time=11%3A30&exchangePost=61"]}>
            <Routes>
              <Route element={<CheckoutPage />} path="/checkout/:serviceId" />
              <Route element={<LocationProbe />} path="/orders/:orderId" />
            </Routes>
          </MemoryRouter>
        </ClientThemeProvider>
      );
    });

    await waitFor(() => expect(container.textContent).toContain("来源情报 · #61"));
    expect(container.textContent).toContain("￥7,000");
    expect(container.textContent).toContain("￥8,800");
    expect(container.textContent).not.toContain("08:00");

    const confirm = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("确定预约"))!;
    await click(confirm);

    await waitFor(() => expect(createBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        exchangeIntelligencePostId: 61,
        scheduleSlotId: 102,
        serviceId: 31
      }),
      expect.stringMatching(/^[a-f0-9]{32}$/)
    ));
    expect(createBooking.mock.calls[0]?.[0]).not.toHaveProperty("priceAmount");
  });

  it("fails closed when the Intelligence target does not match the checkout route", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-09-02T22:00:00.000Z").getTime());
    vi.spyOn(coreReadApi, "getServiceDetail").mockResolvedValue(service);
    vi.spyOn(exchangeApi, "getExchangePost").mockResolvedValue({
      ...intelligencePost,
      intelligence: {
        ...intelligencePost.intelligence!,
        booking: {
          ...intelligencePost.intelligence!.booking,
          target: { type: "shop_service", id: 999 }
        }
      }
    });
    vi.spyOn(bookingApi, "listAvailability").mockResolvedValue({ list: slots, total: 3, page: 1, page_size: 100 });
    const createBooking = vi.spyOn(bookingApi, "createBooking");

    await act(async () => {
      root.render(
        <ClientThemeProvider>
          <MemoryRouter initialEntries={["/checkout/31?date=2026-09-03&exchangePost=61"]}>
            <Routes><Route element={<CheckoutPage />} path="/checkout/:serviceId" /></Routes>
          </MemoryRouter>
        </ClientThemeProvider>
      );
    });

    await waitFor(() => expect(container.textContent).toContain("来源情报与当前正式服务不一致"));
    expect(container.textContent).not.toContain("确定预约");
    expect(createBooking).not.toHaveBeenCalled();
  });

  it("directly reloads the explicit technician-service route and submits the exact Intelligence target", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-09-02T22:00:00.000Z").getTime());
    const getContext = vi.spyOn(bookingApi, "getTechnicianServiceBookingContext").mockResolvedValue(technicianBookingContext);
    vi.spyOn(exchangeApi, "getExchangePost").mockResolvedValue(technicianIntelligencePost);
    vi.spyOn(bookingApi, "listAvailability").mockResolvedValue({ list: [technicianSlot], total: 1, page: 1, page_size: 100 });
    const createBooking = vi.spyOn(bookingApi, "createBooking").mockResolvedValue({
      ...createdOrder,
      exchangeIntelligencePostId: 62,
      serviceId: null,
      technicianServiceId: 51,
      scheduleSlotId: 151,
      serviceName: "技师限定肩颈调理",
      paymentAmountJpy: 7_500,
      priceAmount: "7500.00"
    });

    await act(async () => {
      root.render(
        <ClientThemeProvider>
          <MemoryRouter initialEntries={["/checkout/technician-service/51?date=2026-09-03&time=11%3A30&exchangePost=62"]}>
            <Routes>
              <Route element={<CheckoutPage />} path="/checkout/technician-service/:technicianServiceId" />
              <Route element={<LocationProbe />} path="/orders/:orderId" />
            </Routes>
          </MemoryRouter>
        </ClientThemeProvider>
      );
    });

    await waitFor(() => expect(container.textContent).toContain("技师限定肩颈调理"));
    expect(getContext).toHaveBeenCalledWith(51);
    expect(container.textContent).toContain("s0000000017");
    expect(container.textContent).toContain("￥7,500");
    expect(container.textContent).toContain("￥9,000");
    expect(container.querySelector('a[href="/profiles/technician/s0000000017"]')).not.toBeNull();

    const confirm = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("确定预约"))!;
    await click(confirm);
    await waitFor(() => expect(createBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        exchangeIntelligencePostId: 62,
        scheduleSlotId: 151,
        technicianServiceId: 51
      }),
      expect.stringMatching(/^[a-f0-9]{32}$/)
    ));
    expect(createBooking.mock.calls[0]?.[0]).not.toHaveProperty("serviceId");
  });

  it("reuses the same Intelligence idempotency key after an uncertain network failure", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-09-02T22:00:00.000Z").getTime());
    vi.spyOn(coreReadApi, "getServiceDetail").mockResolvedValue(service);
    vi.spyOn(coreReadApi, "getTechnicianDetail").mockResolvedValue(harukaDetail);
    vi.spyOn(exchangeApi, "getExchangePost").mockResolvedValue(intelligencePost);
    vi.spyOn(bookingApi, "listAvailability").mockResolvedValue({ list: slots, total: 3, page: 1, page_size: 100 });
    const createBooking = vi.spyOn(bookingApi, "createBooking")
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({ ...createdOrder, exchangeIntelligencePostId: 61, scheduleSlotId: 102 });

    await act(async () => {
      root.render(
        <ClientThemeProvider>
          <MemoryRouter initialEntries={["/checkout/31?date=2026-09-03&time=11%3A30&exchangePost=61"]}>
            <Routes>
              <Route element={<CheckoutPage />} path="/checkout/:serviceId" />
              <Route element={<LocationProbe />} path="/orders/:orderId" />
            </Routes>
          </MemoryRouter>
        </ClientThemeProvider>
      );
    });
    await waitFor(() => expect(container.textContent).toContain("来源情报 · #61"));
    const confirm = () => Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("确定预约"))!;

    await click(confirm());
    await waitFor(() => expect(container.textContent).toContain("预约页加载失败，请检查网络后重试"));
    await click(confirm());
    await waitFor(() => expect(createBooking).toHaveBeenCalledTimes(2));

    expect(createBooking.mock.calls[0]?.[1]).toBe(createBooking.mock.calls[1]?.[1]);
  });

  it("keeps the exact second same-time formal slot and existing history state across the technician-card round trip", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-09-02T22:00:00.000Z").getTime());
    vi.spyOn(coreReadApi, "getServiceDetail").mockResolvedValue(service);
    vi.spyOn(coreReadApi, "getTechnicianDetail").mockResolvedValue(technicianDetail);
    vi.spyOn(bookingApi, "listAvailability").mockResolvedValue({
      list: slots,
      total: slots.length,
      page: 1,
      page_size: 100
    });
    const createBooking = vi.spyOn(bookingApi, "createBooking").mockResolvedValue(createdOrder);

    await act(async () => {
      root.render(
        <ClientThemeProvider>
          <MemoryRouter
            initialEntries={[
              "/origin",
              {
                pathname: "/checkout/31",
                search: "?date=2026-09-03&time=08%3A00&mode=store&people=2%E5%90%8D&remark=quiet&coupon=keep",
                state: { existingSource: "recommendation" }
              }
            ]}
            initialIndex={1}
          >
            <LocationProbe />
            <HistoryBackControl />
            <Routes>
              <Route element={<CheckoutPage />} path="/checkout/:serviceId" />
              <Route element={<ProfileDetailPage />} path="/profiles/:entityType/:id" />
              <Route element={<LocationProbe />} path="/orders/:orderId" />
            </Routes>
          </MemoryRouter>
        </ClientThemeProvider>
      );
    });

    await waitFor(() => expect(container.querySelector<HTMLButtonElement>('button[aria-label="选择预约时间"]')?.textContent).toContain("08:00"));
    await click(container.querySelector<HTMLButtonElement>('button[aria-label="选择预约时间"]')!);
    const elevenThirty = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="option"]'))
      .filter((option) => option.textContent?.trim() === "11:30")[1]!;
    await click(elevenThirty);

    await waitFor(() => {
      const probe = container.querySelector<HTMLOutputElement>('[data-testid="location-probe"]')!;
      const current = probe.textContent ?? "";
      expect(current).toContain("time=11%3A30");
      expect(current).toContain("date=2026-09-03");
      expect(current).toContain("mode=store");
      expect(current).toContain("people=2%E5%90%8D");
      expect(current).toContain("remark=quiet");
      expect(current).toContain("coupon=keep");
      expect(probe.dataset.checkoutScheduleSlotId).toBe("103");
      expect(probe.dataset.existingSource).toBe("recommendation");
    });

    const technicianLink = container.querySelector<HTMLAnchorElement>('a[href="/profiles/technician/s0000000017?view=card"]')!;
    await click(technicianLink);
    await waitFor(() => expect(document.body.textContent).toContain("详细信息卡"));
    await click(document.body.querySelector<HTMLButtonElement>('button[aria-label="返回"]')!);

    await waitFor(() => expect(container.querySelector<HTMLButtonElement>('button[aria-label="选择预约时间"]')?.textContent).toContain("11:30"));
    await click(container.querySelector<HTMLButtonElement>('button[aria-label="选择预约时间"]')!);
    const returnedOptions = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="option"]'));
    expect(returnedOptions[2]?.getAttribute("aria-selected")).toBe("true");
    await click(container.querySelector<HTMLButtonElement>('button[aria-label="选择预约时间"]')!);
    const confirm = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("确定预约"))!;
    await click(confirm);

    await waitFor(() => expect(createBooking).toHaveBeenCalledWith(expect.objectContaining({
      serviceId: 31,
      scheduleSlotId: 103
    })));
    await click(container.querySelector<HTMLButtonElement>('button[aria-label="测试返回上一条历史"]')!);
    await waitFor(() => expect(container.querySelector('[data-testid="location-probe"]')?.textContent).toBe("/origin"));
  });

  it("loads the selected Haruka slot technician card instead of the service-default Misaki card", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-09-02T22:00:00.000Z").getTime());
    vi.spyOn(coreReadApi, "getServiceDetail").mockResolvedValue(service);
    const getTechnicianDetail = vi.spyOn(coreReadApi, "getTechnicianDetail").mockImplementation(async (id) => (
      id === 16 || id === "s0000000016" ? harukaDetail : technicianDetail
    ));
    vi.spyOn(bookingApi, "listAvailability").mockResolvedValue({
      list: slots,
      total: slots.length,
      page: 1,
      page_size: 100
    });
    const createBooking = vi.spyOn(bookingApi, "createBooking").mockResolvedValue({
      ...createdOrder,
      scheduleSlotId: 102,
      technicianProfileId: 16,
      technicianName: "Haruka",
      startsAt: slots[1]!.startsAt,
      endsAt: slots[1]!.endsAt
    });

    await act(async () => {
      root.render(
        <ClientThemeProvider>
          <MemoryRouter
            initialEntries={["/origin", "/checkout/31?date=2026-09-03&time=08%3A00&mode=store"]}
            initialIndex={1}
          >
            <LocationProbe />
            <Routes>
              <Route element={<CheckoutPage />} path="/checkout/:serviceId" />
              <Route element={<ProfileDetailPage />} path="/profiles/:entityType/:id" />
              <Route element={<LocationProbe />} path="/orders/:orderId" />
            </Routes>
          </MemoryRouter>
        </ClientThemeProvider>
      );
    });

    await waitFor(() => expect(container.querySelector<HTMLButtonElement>('button[aria-label="选择预约时间"]')?.textContent).toContain("08:00"));
    await click(container.querySelector<HTMLButtonElement>('button[aria-label="选择预约时间"]')!);
    const harukaSlot = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="option"]'))
      .filter((option) => option.textContent?.trim() === "11:30")[0]!;
    await click(harukaSlot);

    await waitFor(() => {
      expect(getTechnicianDetail).toHaveBeenCalledWith(16);
      expect(container.textContent).toContain("Haruka");
      expect(container.querySelector('a[href="/profiles/technician/s0000000016?view=card"]')).not.toBeNull();
      expect(container.querySelector('a[href="/profiles/technician/s0000000017?view=card"]')).toBeNull();
    });

    await click(container.querySelector<HTMLAnchorElement>('a[href="/profiles/technician/s0000000016?view=card"]')!);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="location-probe"]')?.textContent).toBe("/profiles/technician/s0000000016?view=card");
      expect(document.body.textContent).toContain("Haruka");
    });
    await click(document.body.querySelector<HTMLButtonElement>('button[aria-label="返回"]')!);
    await waitFor(() => expect(container.textContent).toContain("Haruka"));

    const confirm = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("确定预约"))!;
    await click(confirm);
    await waitFor(() => expect(createBooking).toHaveBeenCalledWith(expect.objectContaining({
      serviceId: 31,
      scheduleSlotId: 102
    })));
  });

  it("expires the selected slot at its start boundary and never submits the stale selection", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T22:59:59.000Z"));
    vi.spyOn(coreReadApi, "getServiceDetail").mockResolvedValue(service);
    vi.spyOn(coreReadApi, "getTechnicianDetail").mockResolvedValue(technicianDetail);
    vi.spyOn(bookingApi, "listAvailability").mockResolvedValue({
      list: slots,
      total: slots.length,
      page: 1,
      page_size: 100
    });
    const createBooking = vi.spyOn(bookingApi, "createBooking").mockResolvedValue(createdOrder);

    await act(async () => {
      root.render(
        <ClientThemeProvider>
          <MemoryRouter initialEntries={["/checkout/31?date=2026-09-03&time=08%3A00&mode=store"]}>
            <Routes>
              <Route element={<CheckoutPage />} path="/checkout/:serviceId" />
            </Routes>
          </MemoryRouter>
        </ClientThemeProvider>
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const timeTrigger = container.querySelector<HTMLButtonElement>('button[aria-label="选择预约时间"]')!;
    expect(timeTrigger.textContent).toContain("08:00");
    await click(timeTrigger);
    const selectedOption = container.querySelector<HTMLButtonElement>('[role="option"][aria-selected="true"]')!;
    expect(selectedOption.textContent?.trim()).toBe("08:00");
    expect(selectedOption.disabled).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_001);
    });

    expect(selectedOption.disabled).toBe(true);
    expect(container.querySelector('[role="option"][aria-selected="true"]')).toBeNull();
    expect(timeTrigger.textContent).toContain("—");
    const confirm = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("确定预约"))!;
    expect(confirm.disabled).toBe(true);
    await click(confirm);
    expect(createBooking).not.toHaveBeenCalled();
  });
});
