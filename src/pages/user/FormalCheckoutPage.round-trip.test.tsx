// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bookingApi, type BookingOrder, type BookingScheduleSlot } from "../../features/booking/api";
import {
  coreReadApi,
  type CoreServiceDetail,
  type CoreTechnicianDetail
} from "../../features/core-read/api";
import { pricingModeApi } from "../../features/pricing-mode/api";
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

    const technicianLink = container.querySelector<HTMLAnchorElement>('a[href="/profiles/technician/17?view=card"]')!;
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
      id === 16 ? harukaDetail : technicianDetail
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
      expect(container.querySelector('a[href="/profiles/technician/16?view=card"]')).not.toBeNull();
      expect(container.querySelector('a[href="/profiles/technician/17?view=card"]')).toBeNull();
    });

    await click(container.querySelector<HTMLAnchorElement>('a[href="/profiles/technician/16?view=card"]')!);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="location-probe"]')?.textContent).toBe("/profiles/technician/16?view=card");
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
