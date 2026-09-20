// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../../api/httpClient";
import type { AuthSession } from "../../auth/rbac";
import type { BookingOrder, BookingOrderStatus, BookingScheduleSlot } from "../booking/api";
import type { CoreTechnicianDetail } from "../core-read/api";
import type { TechnicianServicePayload } from "../pricing-mode/api";

const mocks = vi.hoisted(() => ({
  acceptAddOn: vi.fn(),
  cancelOrder: vi.fn(),
  confirmReceipt: vi.fn(),
  confirmOrder: vi.fn(),
  createTechnicianManualBooking: vi.fn(),
  createReview: vi.fn(),
  createSlot: vi.fn(),
  createAvailabilityWindow: vi.fn(),
  updateAvailabilityWindow: vi.fn(),
  deleteSlot: vi.fn(),
  endService: vi.fn(),
  exchangeOrderLinked: false,
  getCheckout: vi.fn(),
  getOrder: vi.fn(),
  getOwnReview: vi.fn(),
  listContacts: vi.fn(),
  orderResource: vi.fn(),
  rejectAddOn: vi.fn(),
  retryOrder: vi.fn(),
  retrySchedule: vi.fn(),
  scheduleResource: vi.fn(),
  startService: vi.fn(),
  updateSlot: vi.fn()
}));

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ session: technicianSession }) }));
vi.mock("../../components/client-ui/AppScaffold", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../components/client-ui/AppScaffold")>();
  return {
    ...actual,
    FeatureSegmentedTabs: ({
      items,
      onChange,
      value
    }: {
      items: Array<{ label: string; value: "calendar" | "settings" }>;
      onChange: (value: "calendar" | "settings") => void;
      value: "calendar" | "settings";
    }) => (
      <div className="client-feature-segmented-tabs" data-active-tab={value}>
        {items.map((item) => (
          <button key={item.value} onClick={() => onChange(item.value)} type="button">
            {item.label}
          </button>
        ))}
      </div>
    )
  };
});
vi.mock("../booking/useOrderRealtimeRefresh", () => ({ useOrderRealtimeRefresh: vi.fn() }));
vi.mock("../exchange/ExchangeOrderCancellationPanel", () => ({
  ExchangeOrderCancellationPanel: ({
    onCancellationChange,
    onLinkedChange,
    orderId
  }: {
    onCancellationChange?: (payload: { orderId: number; orderStatus: "cancelled" }) => void;
    onLinkedChange?: (linked: boolean) => void;
    orderId: number;
  }) => {
    useEffect(() => onLinkedChange?.(mocks.exchangeOrderLinked), [onLinkedChange]);
    return (
      <button
        onClick={() => onCancellationChange?.({ orderId, orderStatus: "cancelled" })}
        type="button"
      >
        模拟双方同意取消
      </button>
    );
  }
}));
vi.mock("../../theme/ClientThemeProvider", async () => {
  const actual = await vi.importActual<typeof import("../../theme/ClientThemeProvider")>("../../theme/ClientThemeProvider");
  return { ...actual, useClientTheme: () => ({ isNight: false, theme: "whiteGreen" }) };
});
vi.mock("../booking/api", async () => {
  const actual = await vi.importActual<typeof import("../booking/api")>("../booking/api");
  return {
    ...actual,
    bookingApi: {
      acceptAddOn: mocks.acceptAddOn,
      cancelOrder: mocks.cancelOrder,
      confirmReceipt: mocks.confirmReceipt,
      confirmOrder: mocks.confirmOrder,
      createTechnicianManualBooking: mocks.createTechnicianManualBooking,
      createReview: mocks.createReview,
      endService: mocks.endService,
      getCheckout: mocks.getCheckout,
      getOrder: mocks.getOrder,
      getOwnReview: mocks.getOwnReview,
      rejectAddOn: mocks.rejectAddOn,
      startService: mocks.startService
    }
  };
});
vi.mock("../scheduling/api", () => ({
  schedulingApi: {
    createSlot: mocks.createSlot,
    deleteSlot: mocks.deleteSlot,
    updateSlot: mocks.updateSlot
  }
}));
vi.mock("../scheduling/availability-window-api", () => ({
  availabilityWindowApi: {
    create: mocks.createAvailabilityWindow,
    update: mocks.updateAvailabilityWindow
  }
}));
vi.mock("./automation-api", () => ({
  automationApi: { listContacts: mocks.listContacts }
}));
vi.mock("./formal-resource", async () => {
  const actual = await vi.importActual<typeof import("./formal-resource")>("./formal-resource");
  return {
    ...actual,
    useFormalTechnicianOrderResource: mocks.orderResource,
    useFormalTechnicianScheduleResource: mocks.scheduleResource
  };
});
vi.mock("./FormalScheduleRangeEditor", () => ({
  FormalScheduleRangeEditor: ({
    startsAt,
    endsAt,
    onChange
  }: {
    startsAt: Date;
    endsAt: Date;
    onChange: (startsAt: Date, endsAt: Date) => void;
  }) => (
    <button
      onClick={() => onChange(
        new Date(startsAt.getTime() + 15 * 60_000),
        new Date(endsAt.getTime() + 15 * 60_000)
      )}
      type="button"
    >
      顺延15分钟
    </button>
  )
}));
vi.mock("./FormalTechnicianScheduleWorkspace", () => ({
  FormalTechnicianScheduleWorkspace: ({ profileAvatarUrl, profileName, shopId, shopName, tab, onDirtyChange }: { profileAvatarUrl?: string | null; profileName: string; shopId: number | null; shopName: string; tab?: "calendar" | "bookingSettings" | "requestSettings"; onDirtyChange?: (dirty: boolean) => void }) => (
    <section data-active-tab={tab ?? ""} data-avatar={profileAvatarUrl ?? ""} data-can-create={String(shopId !== null)} data-testid="formal-technician-schedule-workspace">{profileName}:{shopName}<button aria-label="标记设置未保存" onClick={() => onDirtyChange?.(true)} type="button" /></section>
  )
}));

import {
  TechnicianOrderDetailRoutePage,
  TechnicianScheduleDetailRoutePage,
  TechnicianScheduleEditorRoutePage,
  TechnicianScheduleIndexRoutePage,
  TechnicianScheduleTransferRoutePage
} from "./route-pages";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const technicianSession = {
  portal: "technician",
  currentIdentity: {
    id: 13,
    publicId: "s0000000031",
    scopeId: 31,
    scopeType: "technician_profile",
    type: "technician"
  }
} as AuthSession;

const profile = {
  id: 31,
  publicId: "s0000000031",
  displayName: "正式技师",
  city: "东京",
  avatarUrl: null,
  reviewSummary: { ratingAverage: "5.0", reviewCount: 2, latestReviewAt: null, highlights: [] },
  age: null,
  favoriteCount: 0,
  shareCount: 0,
  completedOrderCount: 0,
  acceptanceRatePercent: 100,
  primaryService: null,
  shop: {
    id: 11,
    publicId: "b0000000011",
    name: "正式店铺",
    city: "东京",
    address: "东京都港区",
    coverUrl: null,
    reviewSummary: { ratingAverage: "4.8", reviewCount: 10, latestReviewAt: null, highlights: [] },
    completedOrderCount: 0,
    favoriteCount: 0,
    shareCount: 0,
    serviceCategories: [],
    businessKeywords: []
  },
  bio: null,
  serviceArea: "东京",
  gender: "private",
  heightCm: null,
  languages: ["日本語"],
  yearsExperience: 4,
  reviewTagSummary: {
    special: [
      { code: "appeal_max", label: "魅力max", count: 0 },
      { code: "service_max", label: "服务max", count: 0 },
      { code: "emotion_max", label: "情绪max", count: 0 },
      { code: "energy_max", label: "元气max", count: 0 }
    ],
    custom: []
  },
  mediaAssets: [],
  services: [],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
} satisfies CoreTechnicianDetail;

const service: TechnicianServicePayload = {
  id: 102,
  publicId: "00000000-0000-4000-8000-000000000102",
  shopId: 11,
  technicianId: 31,
  sourceShopServiceId: null,
  name: "Aroma 60",
  description: null,
  categoryId: 1,
  priceAmount: 10000,
  currency: "JPY",
  durationMinutes: 60,
  usageCount: 7,
  taxIncluded: true,
  coverImageUrl: null,
  images: [],
  tags: [],
  shop: { publicId: "shop0000000011", name: "正式店铺", address: "东京都港区" },
  isActive: true,
  isBookable: true,
  isRecommended: false,
  sortOrder: 1,
  reviewStatus: "approved",
  rejectionReason: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
};

const slot: BookingScheduleSlot = {
  id: 17,
  serviceId: null,
  technicianServiceId: 102,
  shopId: 11,
  technicianProfileId: 31,
  startsAt: "2026-09-01T10:00:00.000+09:00",
  endsAt: "2026-09-01T11:00:00.000+09:00",
  capacity: 1,
  bookedCount: 0,
  status: "available",
  serviceName: "Aroma 60",
  shopName: "正式店铺",
  technicianName: "正式技师",
  priceAmount: "10000.00",
  currency: "JPY",
  durationMinutes: 60
};

function makeOrder(status: BookingOrderStatus, id = 29): BookingOrder {
  return {
    id,
    orderNo: `ND20260828${String(id).padStart(4, "0")}`,
    orderType: "booking",
    status,
    paymentMethod: "onsite",
    paymentStatus: "pending",
    paymentAmountJpy: 10000,
    paymentConfirmedById: null,
    paymentConfirmedAt: null,
    paymentReference: null,
    paymentNote: null,
    paymentRefundedById: null,
    paymentRefundedAt: null,
    paymentRefundReference: null,
    paymentRefundReason: null,
    customerUserId: 71,
    customer: {
      userId: 71,
      profileId: 17,
      publicId: "u0000000071",
      displayName: "预约用户 山田",
      avatarUrl: "/images/formal/customer-71.jpg",
      membershipLevel: "premium",
      ratingAverage: "4.8",
      reviewCount: 12
    },
    serviceId: null,
    technicianServiceId: 102,
    shopId: 11,
    technicianProfileId: 31,
    scheduleSlotId: 17,
    fulfillmentMode: "store",
    serviceName: "Aroma 60",
    shopName: "正式店铺",
    technicianName: "正式技师",
    priceAmount: "10000.00",
    currency: "JPY",
    startsAt: "2026-09-01T10:00:00.000+09:00",
    endsAt: "2026-09-01T11:00:00.000+09:00",
    note: "请准备无香精用品",
    cancelReason: null,
    createdAt: "2026-08-28T01:00:00.000Z",
    updatedAt: "2026-08-28T01:00:00.000Z",
    serviceVerificationCode: "482931",
    serviceSession: status === "inService" ? {
      startedAt: "2026-09-01T10:00:00.000+09:00",
      expectedEndsAt: "2099-09-01T11:00:00.000+09:00",
      endedAt: null,
      addOns: [{
        id: 301,
        serviceId: 45,
        serviceType: "shop_service",
        status: "proposed",
        serviceNameSnapshot: "延长 30 分钟",
        priceAmountJpy: 3000,
        currency: "JPY",
        durationMinutes: 30,
        serviceSnapshot: {},
        proposedBy: "customer",
        proposedAt: "2026-09-01T10:15:00.000+09:00",
        resolvedBy: null,
        resolvedAt: null,
        resolutionReason: null
      }]
    } : null,
    statusHistory: [
      {
        id: 1,
        orderId: 29,
        fromStatus: null,
        toStatus: "pending",
        actorUserId: 71,
        reason: "用户提交",
        createdAt: "2026-08-28T01:00:00.000Z"
      },
      {
        id: 2,
        orderId: 29,
        fromStatus: "pending",
        toStatus: status,
        actorUserId: 31,
        reason: "正式状态记录",
        createdAt: "2026-08-28T02:00:00.000Z"
      }
    ]
  };
}

const checkout = {
  id: 91,
  orderId: 29,
  status: "awaitingPaymentConfirmation" as const,
  baseAmountJpy: 10000,
  addOnAmountJpy: 3000,
  travelFareAmountJpy: 0,
  discountAmountJpy: 0,
  checkoutAmountJpy: 13000,
  payableNdp: 13000,
  rate: { ruleId: 7, publicId: "rate-7", version: 3, ndpUnits: 1, jpyUnits: 1, effectiveFrom: "2026-09-01T00:00:00.000Z" },
  calculation: {
    formula: "base_plus_accepted_add_ons_plus_travel_fare_minus_discount" as const,
    baseAmountJpy: 10000,
    acceptedAddOnIds: [301],
    addOnAmountJpy: 3000,
    travelFareAmountJpy: 0,
    discountAmountJpy: 0,
    checkoutAmountJpy: 13000,
    rateFormula: "ceil(jpy_times_ndp_units_divided_by_jpy_units)" as const
  },
  paymentMethod: "cash" as const,
  paymentSelectedAt: "2026-09-01T11:00:00.000+09:00",
  otherMethod: null,
  paymentEvidence: null,
  receiptConfirmedAt: null,
  receiptConfirmationReason: null,
  createdAt: "2026-09-01T11:00:00.000+09:00",
  updatedAt: "2026-09-01T11:00:00.000+09:00"
};

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function TechnicianOrderNavigationProbe() {
  const navigate = useNavigate();
  return <button onClick={() => navigate("/technician/orders/30")} type="button">打开技师订单B</button>;
}

function TestRoutes() {
  return (
    <>
      <LocationProbe />
      <Routes>
        <Route path="/technician/schedule" element={<TechnicianScheduleIndexRoutePage />} />
        <Route path="/technician/schedule/new" element={<TechnicianScheduleEditorRoutePage />} />
        <Route path="/technician/schedule/events/:eventId/edit" element={<TechnicianScheduleEditorRoutePage />} />
        <Route path="/technician/schedule/events/:eventId" element={<TechnicianScheduleDetailRoutePage />} />
        <Route path="/technician/schedule/shifts/:shiftId/transfer" element={<TechnicianScheduleTransferRoutePage />} />
        <Route path="/technician/orders/:orderId" element={<TechnicianOrderDetailRoutePage />} />
      </Routes>
    </>
  );
}

function textButton(text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes(text));
  if (!button) throw new Error(`Missing button: ${text}`);
  return button;
}

async function click(text: string) {
  await act(async () => textButton(text).dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function futureAvailabilityRange() {
  const startsAt = new Date(Date.now() + 24 * 60 * 60_000);
  startsAt.setUTCMinutes(0, 0, 0);
  return {
    startsAt,
    endsAt: new Date(startsAt.getTime() + 6 * 60 * 60_000)
  };
}

async function waitFor(assertion: () => void) {
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

let container: HTMLDivElement;
let root: Root;

describe("formal technician schedule routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.scheduleResource.mockReturnValue({
      data: { profile, services: [service], shopId: 11, shopName: "正式店铺", slot },
      error: null,
      loading: false,
      retry: mocks.retrySchedule
    });
    mocks.orderResource.mockReturnValue({
      data: makeOrder("pending"), error: null, loading: false, retry: mocks.retryOrder
    });
    mocks.listContacts.mockResolvedValue({
      list: [{ identityId: 71, publicId: "u0000000071", displayName: "山田花子", avatarUrl: null }],
      total: 1,
      page: 1,
      page_size: 100
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function render(path: string) {
    await act(async () => root.render(
      <MemoryRouter initialEntries={[path]}>
        <TestRoutes />
      </MemoryRouter>
    ));
  }

  it("renders the main technician schedule route from formal resources only", async () => {
    mocks.scheduleResource.mockReturnValue({
      data: { profile, services: [service], shopId: 11, shopName: "正式店铺", slot: null },
      error: null,
      loading: false,
      retry: mocks.retrySchedule
    });

    await render("/technician/schedule?period=last7days&from=2026-08-26T15%3A00%3A00.000Z&to=2026-09-02T15%3A00%3A00.000Z");

    expect(container.textContent).not.toContain("排班与预约");
    expect(container.textContent).toContain("正式技师");
    expect(container.textContent).toContain("正式店铺");
    expect(container.querySelector('[data-testid="formal-technician-schedule-workspace"]')?.textContent).toBe("正式技师:正式店铺");
    expect(container.querySelector('button[aria-label="返回技师首页"]')).not.toBeNull();
    expect(container.querySelector('input[aria-label="搜索排班"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="关闭排班"]')).not.toBeNull();
    expect(container.querySelector("nav")).toBeNull();
    expect(mocks.scheduleResource).toHaveBeenCalledWith(technicianSession, null);

    const header = container.querySelector(".client-floating-header-host");
    expect(header).not.toBeNull();
    expect(Array.from(header?.querySelectorAll("button") ?? []).map((button) => button.textContent?.trim()))
      .toEqual(expect.arrayContaining(["我的排班", "接单设置", "抢单设置"]));
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-testid="automation-tab-corner-badge"]')).toHaveLength(2);

    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await act(async () => (container.querySelector('button[aria-label="标记设置未保存"]') as HTMLButtonElement).click());
    await click("接单设置");
    expect(container.querySelector('[data-testid="formal-technician-schedule-workspace"]')?.getAttribute("data-active-tab"))
      .toBe("calendar");
    expect(confirm).toHaveBeenCalledWith("当前设置尚未保存，确定离开吗？");
    await click("接单设置");
    expect(container.querySelector('[data-testid="formal-technician-schedule-workspace"]')?.getAttribute("data-active-tab"))
      .toBe("bookingSettings");
  });

  it("renders a numeric formal schedule detail", async () => {
    await render("/technician/schedule/events/17");
    expect(container.textContent).toContain("正式排班详情");
    expect(container.textContent).toContain("Aroma 60");
    expect(container.textContent).toContain("10:00–11:00");
  });

  it("rejects a nonnumeric event ID without loading formal or fallback data", async () => {
    await render("/technician/schedule/events/mock-slot");
    expect(container.textContent).toContain("排班记录不可用");
    expect(mocks.scheduleResource).not.toHaveBeenCalled();
    expect(mocks.updateSlot).not.toHaveBeenCalled();
  });

  it("shows a retryable load error with no fallback schedule", async () => {
    mocks.scheduleResource.mockReturnValue({
      data: null, error: "error.network.timeout", loading: false, retry: mocks.retrySchedule
    });
    await render("/technician/schedule/events/17");
    expect(container.textContent).toContain("正式排班加载失败");
    expect(container.textContent).not.toContain("Aroma 60");
    await click("重新加载");
    expect(mocks.retrySchedule).toHaveBeenCalledTimes(1);
  });

  it("renders a shop-affiliated technician schedule and keeps creation unavailable", async () => {
    mocks.scheduleResource.mockReturnValue({
      data: {
        profile: { id: 31, displayName: "店铺所属技师", avatarUrl: null },
        shopId: null,
        shopName: "合作店铺",
        services: [],
        slot: null
      },
      error: null,
      loading: false,
      retry: mocks.retrySchedule
    });

    await render("/technician/schedule");

    expect(container.textContent).toContain("店铺所属技师:合作店铺");
    expect(container.querySelector('[data-testid="formal-technician-schedule-workspace"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="formal-technician-schedule-workspace"]')?.getAttribute("data-can-create")).toBe("false");
    expect(container.querySelector('input[aria-label="搜索排班"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="关闭排班"]')).not.toBeNull();
    expect(container.querySelector("nav")).toBeNull();
  });

  it("locks a slot with the formal API and requires two clicks before deletion", async () => {
    mocks.updateSlot.mockResolvedValue({ ...slot, status: "blocked" });
    mocks.deleteSlot.mockResolvedValue(slot);
    await render("/technician/schedule/events/17");

    await click("锁定时段");
    await waitFor(() => expect(mocks.updateSlot).toHaveBeenCalledWith("technician", 17, { status: "blocked" }));
    expect(container.textContent).toContain("已锁定");

    await click("删除时段");
    expect(mocks.deleteSlot).not.toHaveBeenCalled();
    await click("再次点击确认删除");
    await waitFor(() => expect(mocks.deleteSlot).toHaveBeenCalledWith("technician", 17));
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe("/technician/schedule");
  });

  it("blocks the direct new-schedule route when the technician has no active shop", async () => {
    mocks.scheduleResource.mockReturnValue({
      data: {
        profile: { id: 31, displayName: "店铺所属技师", avatarUrl: null },
        shopId: null,
        shopName: "合作店铺",
        services: [],
        slot: null
      },
      error: null,
      loading: false,
      retry: mocks.retrySchedule
    });

    await render("/technician/schedule/new?mode=manualBooking");

    expect(container.querySelector('[role="alert"]')?.textContent).toContain("暂未关联店铺");
    expect(container.querySelector('[role="switch"][aria-label="手动预约"]')).toBeNull();
    expect(container.textContent).not.toContain("创建手动预约");
    expect(mocks.listContacts).not.toHaveBeenCalled();
  });

  it("shows a red impact warning and can cancel a booked shop schedule after explicit confirmation", async () => {
    const bookedShopSlot = {
      ...slot,
      availabilitySourceType: "shop" as const,
      bookedCount: 1,
      status: "booked" as const
    };
    mocks.scheduleResource.mockReturnValue({
      data: { profile, services: [service], shopId: 11, shopName: "正式店铺", slot: bookedShopSlot },
      error: null,
      loading: false,
      retry: mocks.retrySchedule
    });
    mocks.deleteSlot.mockResolvedValue(bookedShopSlot);
    await render("/technician/schedule/events/17");

    await click("取消排班");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("会取消已确定预约并影响您的评价");
    expect(mocks.deleteSlot).not.toHaveBeenCalled();

    await click("确认取消排班");
    await waitFor(() => expect(mocks.deleteSlot).toHaveBeenCalledWith(
      "technician",
      17,
      { impactConfirmed: true }
    ));
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe("/technician/schedule");
  });

  it("creates an arbitrary-length free availability window without creating a service slot", async () => {
    const range = futureAvailabilityRange();
    mocks.scheduleResource.mockReturnValue({
      data: { profile, services: [service], shopId: 11, shopName: "正式店铺", slot: null },
      error: null,
      loading: false,
      retry: mocks.retrySchedule
    });
    mocks.createAvailabilityWindow.mockResolvedValue({ id: 88 });
    await render(`/technician/schedule/new?mode=availability&startsAt=${encodeURIComponent(range.startsAt.toISOString())}&endsAt=${encodeURIComponent(range.endsAt.toISOString())}`);

    await click("保存可排班");
    await waitFor(() => expect(mocks.createAvailabilityWindow).toHaveBeenCalledWith(
      "technician",
      expect.objectContaining({
        startsAt: range.startsAt,
        endsAt: range.endsAt,
        capacity: 1
      })
    ));
    expect(mocks.createSlot).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe("/technician/schedule");
  });

  it("creates free availability even when the technician has no bookable service yet", async () => {
    const range = futureAvailabilityRange();
    mocks.scheduleResource.mockReturnValue({
      data: { profile, services: [], shopId: 11, shopName: "正式店铺", slot: null },
      error: null,
      loading: false,
      retry: mocks.retrySchedule
    });
    mocks.createAvailabilityWindow.mockResolvedValue({ id: 89 });
    await render(`/technician/schedule/new?mode=availability&startsAt=${encodeURIComponent(range.startsAt.toISOString())}&endsAt=${encodeURIComponent(range.endsAt.toISOString())}`);

    await click("保存可排班");
    await waitFor(() => expect(mocks.createAvailabilityWindow).toHaveBeenCalledWith(
      "technician",
      expect.objectContaining({
        startsAt: range.startsAt,
        endsAt: range.endsAt
      })
    ));
    expect(mocks.createSlot).not.toHaveBeenCalled();
  });

  it("edits an existing availability window without creating a replacement", async () => {
    mocks.scheduleResource.mockReturnValue({
      data: { profile, services: [], shopId: 11, shopName: "正式店铺", slot: null },
      error: null,
      loading: false,
      retry: mocks.retrySchedule
    });
    mocks.updateAvailabilityWindow.mockResolvedValue({ id: 89 });
    await render("/technician/schedule/new?mode=availability&availabilityWindowId=89&startsAt=2026-09-10T09%3A00%3A00.000Z&endsAt=2026-09-10T15%3A00%3A00.000Z");

    expect(container.querySelectorAll('[role="switch"]')).toHaveLength(0);
    await click("保存可排班修改");
    await waitFor(() => expect(mocks.updateAvailabilityWindow).toHaveBeenCalledWith(
      "technician",
      89,
      expect.objectContaining({
        startsAt: new Date("2026-09-10T09:00:00.000Z"),
        endsAt: new Date("2026-09-10T15:00:00.000Z")
      })
    ));
    expect(mocks.createAvailabilityWindow).not.toHaveBeenCalled();
  });

  it("creates a formal manual booking from the mutually exclusive editor mode without creating availability", async () => {
    const startsAt = new Date(Date.now() + 24 * 60 * 60_000);
    startsAt.setMilliseconds(0);
    const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
    mocks.scheduleResource.mockReturnValue({
      data: { profile, services: [service], shopId: 11, shopName: "正式店铺", slot: null },
      error: null,
      loading: false,
      retry: mocks.retrySchedule
    });
    mocks.createTechnicianManualBooking.mockResolvedValue(makeOrder("pending"));
    const query = new URLSearchParams({
      mode: "manualBooking",
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString()
    });
    await render(`/technician/schedule/new?${query.toString()}`);

    await waitFor(() => expect(container.textContent).toContain("山田花子"));
    expect(container.querySelectorAll('[role="switch"]')).toHaveLength(2);
    expect(container.querySelector('[role="switch"][aria-label="手动预约"]')?.getAttribute("aria-checked")).toBe("true");
    expect(container.querySelector('[role="switch"][aria-label="可排班"]')?.getAttribute("aria-checked")).toBe("false");

    await click("创建手动预约");
    await waitFor(() => expect(mocks.createTechnicianManualBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        customerIdentityId: 71,
        expectedPriceAmountJpy: 10_000,
        technicianServiceId: 102,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString()
      }),
      expect.stringMatching(/^[a-f0-9]{32}$/)
    ));
    expect(mocks.createSlot).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe("/technician/orders/29");
  });

  it("updates only the persisted slot time and capacity in edit mode", async () => {
    mocks.updateSlot.mockResolvedValue(slot);
    await render("/technician/schedule/events/17/edit");

    await click("顺延15分钟");
    const capacity = container.querySelector('input[name="capacity"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(capacity, "2");
      capacity.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click("保存正式排班");

    await waitFor(() => expect(mocks.updateSlot).toHaveBeenCalledWith(
      "technician",
      17,
      expect.objectContaining({ capacity: 2 })
    ));
    const payload = mocks.updateSlot.mock.calls[0]?.[2];
    expect(payload).not.toHaveProperty("technicianServiceId");
  });

  it("keeps conflict and in-use failures visible without local navigation", async () => {
    mocks.scheduleResource.mockReturnValue({
      data: { profile, services: [service], shopId: 11, shopName: "正式店铺", slot: null },
      error: null,
      loading: false,
      retry: mocks.retrySchedule
    });
    mocks.createSlot.mockRejectedValue(new ApiClientError("error.schedule.conflict", 40911, 409));
    mocks.createAvailabilityWindow.mockRejectedValue(new ApiClientError("error.availability.conflict", 40911, 409));
    await render("/technician/schedule/new");
    await click("保存可排班");
    await waitFor(() => expect(container.textContent).toContain("已有可排班日程"));
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe("/technician/schedule/new");

    mocks.scheduleResource.mockReturnValue({
      data: { profile, services: [service], shopId: 11, shopName: "正式店铺", slot },
      error: null,
      loading: false,
      retry: mocks.retrySchedule
    });
    mocks.deleteSlot.mockRejectedValue(new ApiClientError("error.schedule.slot_in_use", 40912, 409));
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(
      <MemoryRouter initialEntries={["/technician/schedule/events/17"]}>
        <TestRoutes />
      </MemoryRouter>
    ));
    await click("删除时段");
    await click("再次点击确认删除");
    await waitFor(() => expect(container.textContent).toContain("已有预约，无法修改或删除"));
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe("/technician/schedule/events/17");
  });

  it("turns the availability switch off when a shop already controls that time", async () => {
    mocks.scheduleResource.mockReturnValue({
      data: { profile, services: [service], shopId: 11, shopName: "正式店铺", slot: null },
      error: null,
      loading: false,
      retry: mocks.retrySchedule
    });
    mocks.createAvailabilityWindow.mockRejectedValue(
      new ApiClientError("error.availability.shop_control_conflict", 40911, 409)
    );
    await render("/technician/schedule/new");

    await click("保存可排班");
    await waitFor(() => expect(container.textContent).toContain("可排班开关已自动关闭"));
    expect(container.querySelector('[role="switch"][aria-label="可排班"]')?.getAttribute("aria-checked")).toBe("false");
    expect(container.querySelector('[role="switch"][aria-label="手动预约"]')?.getAttribute("aria-checked")).toBe("false");
  });

  it("shows shift transfer as an unavailable formal capability with no mutation action", async () => {
    await render("/technician/schedule/shifts/legacy-shift/transfer");
    expect(container.textContent).toContain("班次转让暂未开放");
    expect(container.querySelector('a[href="/technician/schedule"]')).not.toBeNull();
    expect(container.textContent).not.toContain("发送转让邀请");
  });
});

describe("formal technician order detail route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.exchangeOrderLinked = false;
    mocks.getCheckout.mockResolvedValue(checkout);
    mocks.getOwnReview.mockResolvedValue({ review: null });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function renderOrder(order: BookingOrder | null, error: string | null = null) {
    mocks.orderResource.mockReturnValue({
      data: order, error, loading: false, retry: mocks.retryOrder
    });
    await act(async () => root.render(
      <MemoryRouter initialEntries={["/technician/orders/29"]}>
        <TestRoutes />
      </MemoryRouter>
    ));
  }

  it("renders persisted order details and display-safe history semantics", async () => {
    await renderOrder(makeOrder("confirmed"));
    expect(container.textContent).toContain("ND202608280029");
    expect(container.textContent).toContain("Aroma 60");
    expect(container.textContent).toContain("正式店铺");
    expect(container.textContent).toContain("10:00–11:00");
    expect(container.textContent).toContain("现场支付");
    expect(container.textContent).toContain("请准备无香精用品");
    expect(container.textContent).toContain("预约待确认");
    expect(container.textContent).toContain("预约已确认");
    expect(container.textContent).not.toContain("用户提交");
    expect(container.textContent).not.toContain("正式状态记录");
    expect(container.textContent).toContain("订单追踪信息");
  });

  it("shows the authoritative completed total, checkout breakdown, and accepted add-on timeline", async () => {
    const completedCheckout = {
      ...checkout,
      status: "completed" as const,
      baseAmountJpy: 8_000,
      addOnAmountJpy: 6_500,
      checkoutAmountJpy: 14_500,
      payableNdp: 14_500,
      paymentMethod: "ndp" as const,
      paymentEvidence: "ndp_ledger" as const,
      calculation: {
        ...checkout.calculation,
        baseAmountJpy: 8_000,
        addOnAmountJpy: 6_500,
        checkoutAmountJpy: 14_500
      }
    };
    const completedOrder = {
      ...makeOrder("completed"),
      amountSource: "checkout" as const,
      paymentAmountJpy: 14_500,
      priceAmount: "8000.00",
      serviceSession: {
        startedAt: "2026-09-01T10:00:00.000+09:00",
        expectedEndsAt: "2026-09-01T11:30:00.000+09:00",
        endedAt: "2026-09-01T11:30:00.000+09:00",
        addOns: [{
          id: 301,
          serviceId: 45,
          serviceType: "shop_service" as const,
          status: "accepted" as const,
          serviceNameSnapshot: "加钟 30 分钟",
          priceAmountJpy: 6_500,
          currency: "JPY" as const,
          durationMinutes: 30,
          serviceSnapshot: {},
          proposedBy: "technician" as const,
          proposedAt: "2026-09-01T10:15:00.000+09:00",
          resolvedBy: "customer" as const,
          resolvedAt: "2026-09-01T10:17:00.000+09:00",
          resolutionReason: null
        }]
      }
    };
    mocks.getCheckout.mockResolvedValue(completedCheckout);

    await renderOrder(completedOrder);
    await waitFor(() => expect(container.textContent).toContain("顾客支付总额"));

    expect(container.textContent).toContain("¥14,500");
    expect(container.textContent).toContain("基础服务金额");
    expect(container.textContent).toContain("¥8,000");
    expect(container.textContent).toContain("加钟金额");
    expect(container.textContent).toContain("¥6,500");
    expect(container.textContent).toContain("提出加钟");
    expect(container.textContent).toContain("加钟已确认");
  });

  it("renders the formal customer with the unified user name-card fields", async () => {
    await renderOrder(makeOrder("confirmed"));

    expect(container.textContent).toContain("用户");
    expect(container.textContent).toContain("预约用户 山田");
    expect(container.textContent).not.toContain("u0000000071");
    expect(container.textContent).not.toContain("客户账号");
    expect(container.querySelector("dl")?.textContent).not.toContain("#71");
    expect(container.querySelector('a[href="/technician/profiles/user/17"]')).not.toBeNull();
  });

  it("keeps the existing formal pending confirmation transition", async () => {
    mocks.confirmOrder.mockResolvedValue(makeOrder("confirmed"));
    await renderOrder(makeOrder("pending"));
    await click("确认接单");
    await waitFor(() => expect(mocks.confirmOrder).toHaveBeenCalledWith(29));
    expect(container.textContent).toContain("已确认");
  });

  it("immediately adopts an accepted Exchange cancellation and removes stale provider actions", async () => {
    mocks.exchangeOrderLinked = true;
    await renderOrder(makeOrder("pending"));
    expect(container.textContent).toContain("确认接单");
    expect(Array.from(container.querySelectorAll("button")).some((item) => item.textContent === "取消预约")).toBe(false);

    await click("模拟双方同意取消");

    await waitFor(() => expect(container.textContent).toContain("已取消"));
    expect(container.textContent).not.toContain("确认接单");
    expect(Array.from(container.querySelectorAll("button")).some((item) => item.textContent === "取消预约")).toBe(false);
    expect(container.textContent).toContain("模拟双方同意取消");
  });

  it("requires an explicit second confirmation when the shop platform-fee balance is insufficient", async () => {
    const previewVersion = `sha256:${"c".repeat(64)}`;
    mocks.confirmOrder
      .mockRejectedValueOnce(new ApiClientError(
        "error.platform_fee.insufficient_balance_confirmation_required",
        40936,
        409,
        {
          availableBalanceNdp: 0,
          feeAmountNdp: 100,
          payerType: "shop",
          previewVersion,
          shortfallNdp: 100,
          walletOwnerType: "shop"
        }
      ))
      .mockResolvedValueOnce(makeOrder("confirmed"));
    await renderOrder(makeOrder("pending"));

    await click("确认接单");
    await waitFor(() => expect(container.textContent).toContain("店铺可用余额 0 NDP"));
    expect(container.textContent).toContain("还差 100 NDP");
    expect(mocks.confirmOrder).toHaveBeenNthCalledWith(1, 29);

    await click("余额不足，仍确认接单");
    await waitFor(() => expect(mocks.confirmOrder).toHaveBeenNthCalledWith(2, 29, {
      insufficientBalanceConfirmation: {
        confirmed: true,
        idempotencyKey: expect.stringMatching(/^[a-f0-9]{32}$/),
        previewVersion
      }
    }));
    expect(container.textContent).toContain("已确认");
  });

  it("renders public performance revisions in the shared timeline without operations-only notes", async () => {
    const order = {
      ...makeOrder("cancelled"),
      timelineEvents: [
        {
          id: "status:2",
          type: "ORDER_STATUS_CHANGED" as const,
          createdAt: "2026-08-28T02:00:00.000Z",
          actorUserId: 31,
          fromStatus: "pending" as const,
          toStatus: "cancelled" as const,
          publicReason: "技师端取消正式预约"
        },
        {
          id: "performance:3",
          type: "SPECIAL_CANCELLATION_APPLIED" as const,
          createdAt: "2026-08-28T03:00:00.000Z",
          actorUserId: 1,
          publicReason: "已核实不可抗力",
          internalNote: "技师端绝不能显示"
        },
        {
          id: "performance:4",
          type: "SPECIAL_CANCELLATION_REVOKED" as const,
          createdAt: "2026-08-28T04:00:00.000Z",
          actorUserId: 1,
          publicReason: "用户投诉后复核恢复计入",
          internalNote: "投诉工单仅运营可见"
        }
      ]
    } as BookingOrder;

    await renderOrder(order);

    expect(container.textContent).toContain("特殊取消已生效");
    expect(container.textContent).toContain("已核实不可抗力");
    expect(container.textContent).toContain("特殊取消已撤销");
    expect(container.textContent).toContain("用户投诉后复核恢复计入");
    expect(container.textContent).not.toContain("技师端绝不能显示");
    expect(container.textContent).not.toContain("投诉工单仅运营可见");
  });

  it("requires the exact technician code input without projecting the customer code", async () => {
    mocks.startService.mockResolvedValue(makeOrder("inService"));
    await renderOrder(makeOrder("confirmed"));
    expect(container.textContent).not.toContain("482931");
    const code = container.querySelector('input[aria-label="六位服务验证码"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(code, "482931");
      code.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click("验证并开始服务");
    await waitFor(() => expect(mocks.startService).toHaveBeenCalledWith(29, {
      actor: "technician",
      verificationCode: "482931",
      idempotencyKey: expect.stringMatching(/^[a-f0-9]{32}$/)
    }));
    expect(container.textContent).toContain("服务中");
  });

  it("reuses a retained start key only while the verification-code semantics are unchanged", async () => {
    mocks.startService.mockRejectedValue(new Error("ambiguous start"));
    await renderOrder(makeOrder("confirmed"));
    const code = container.querySelector('input[aria-label="六位服务验证码"]') as HTMLInputElement;
    const setCode = async (value: string) => act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(code, value);
      code.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await setCode("482931");
    await click("验证并开始服务");
    await waitFor(() => expect(mocks.startService).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(textButton("验证并开始服务").disabled).toBe(false));
    await click("验证并开始服务");
    await waitFor(() => expect(mocks.startService).toHaveBeenCalledTimes(2));
    const firstKey = mocks.startService.mock.calls[0]?.[1]?.idempotencyKey;
    expect(mocks.startService.mock.calls[1]?.[1]?.idempotencyKey).toBe(firstKey);
    await waitFor(() => expect(textButton("验证并开始服务").disabled).toBe(false));
    await setCode("111111");
    await click("验证并开始服务");
    await waitFor(() => expect(mocks.startService).toHaveBeenCalledTimes(3));
    expect(mocks.startService.mock.calls[2]?.[1]?.idempotencyKey).not.toBe(firstKey);
  });

  it("accepts a customer add-on and ends service through formal endpoints", async () => {
    mocks.acceptAddOn.mockResolvedValue(makeOrder("inService"));
    mocks.rejectAddOn.mockResolvedValue(makeOrder("inService"));
    mocks.endService.mockResolvedValue(makeOrder("awaitingCheckout"));
    await renderOrder(makeOrder("inService"));
    expect(container.textContent).toContain("延长 30 分钟");
    await click("接受追加");
    await waitFor(() => expect(mocks.acceptAddOn).toHaveBeenCalledWith(29, 301, {
      idempotencyKey: expect.stringMatching(/^[a-f0-9]{32}$/)
    }));
    await waitFor(() => expect(textButton("拒绝").disabled).toBe(false));
    await click("拒绝");
    await waitFor(() => expect(mocks.rejectAddOn).toHaveBeenCalledWith(29, 301, {
      idempotencyKey: expect.stringMatching(/^[a-f0-9]{32}$/)
    }));
    await waitFor(() => expect(textButton("提前结束服务").disabled).toBe(false));
    await click("提前结束服务");
    await click("再次点击确认结束");
    await waitFor(() => expect(mocks.endService).toHaveBeenCalledWith(29, {
      reason: "技师确认提前结束服务",
      idempotencyKey: expect.stringMatching(/^[a-f0-9]{32}$/)
    }));
    expect(container.textContent).toContain("等待客户结账");
  });

  it("confirms a cash receipt with a visible reason and keeps rejected state unchanged", async () => {
    mocks.getCheckout.mockResolvedValue(checkout);
    const completed = { ...makeOrder("completed"), serviceVerificationCode: undefined };
    mocks.confirmReceipt.mockResolvedValue({ ...checkout, status: "completed", paymentEvidence: "technician_receipt_confirmation", receiptConfirmedAt: "2026-09-01T11:01:00.000+09:00", receiptConfirmationReason: "现金已当面清点确认" });
    mocks.getOrder.mockResolvedValue(completed);
    await renderOrder(makeOrder("awaitingPaymentConfirmation"));
    await waitFor(() => expect(container.textContent).toContain("确认已经收款"));
    const reason = container.querySelector('textarea[aria-label="收款确认理由"]') as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(reason, "现金已当面清点确认");
      reason.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click("确认收款并完成订单");
    await waitFor(() => expect(mocks.confirmReceipt).toHaveBeenCalledWith(29, {
      reason: "现金已当面清点确认",
      idempotencyKey: expect.stringMatching(/^[a-f0-9]{32}$/)
    }));
    expect(mocks.getOrder).toHaveBeenCalledWith(29);
    expect(container.textContent).toContain("订单已完成");

    mocks.startService.mockRejectedValue(new ApiClientError("error.order.verification_failed", 40012, 400));
    await act(async () => root.unmount());
    root = createRoot(container);
    await renderOrder(makeOrder("confirmed"));
    const code = container.querySelector('input[aria-label="六位服务验证码"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(code, "111111");
      code.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click("验证并开始服务");
    await waitFor(() => expect(container.textContent).toContain("提交内容不符合要求，请检查后重试"));
    expect(container.textContent).toContain("已确认");
    expect(container.textContent).not.toContain("服务中");
  });

  it("reuses a retained receipt key only while the visible reason is unchanged", async () => {
    mocks.confirmReceipt.mockRejectedValue(new Error("ambiguous receipt"));
    await renderOrder(makeOrder("awaitingPaymentConfirmation"));
    await waitFor(() => expect(container.textContent).toContain("确认已经收款"));
    const reason = container.querySelector('textarea[aria-label="收款确认理由"]') as HTMLTextAreaElement;
    const setReason = async (value: string) => act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(reason, value);
      reason.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await setReason("现金已当面确认");
    await click("确认收款并完成订单");
    await waitFor(() => expect(mocks.confirmReceipt).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(textButton("确认收款并完成订单").disabled).toBe(false));
    await click("确认收款并完成订单");
    await waitFor(() => expect(mocks.confirmReceipt).toHaveBeenCalledTimes(2));
    const firstKey = mocks.confirmReceipt.mock.calls[0]?.[1]?.idempotencyKey;
    expect(mocks.confirmReceipt.mock.calls[1]?.[1]?.idempotencyKey).toBe(firstKey);
    await waitFor(() => expect(textButton("确认收款并完成订单").disabled).toBe(false));
    await setReason("PayPay 到账确认");
    await click("确认收款并完成订单");
    await waitFor(() => expect(mocks.confirmReceipt).toHaveBeenCalledTimes(3));
    expect(mocks.confirmReceipt.mock.calls[2]?.[1]?.idempotencyKey).not.toBe(firstKey);
  });

  it("submits the assigned technician's completed-order review toward the customer", async () => {
    const completedCheckout = { ...checkout, status: "completed" as const, paymentEvidence: "technician_receipt_confirmation" as const, receiptConfirmedAt: "2026-09-01T11:01:00.000+09:00", receiptConfirmationReason: "现金已确认" };
    mocks.getCheckout.mockResolvedValue(completedCheckout);
    mocks.createReview.mockResolvedValue({ applied: true, review: { targetType: "customer", rating: 5, tags: ["礼貌友好"], comment: "谢谢", createdAt: "2026-09-01T12:00:00.000Z" } });
    await renderOrder(makeOrder("completed"));
    await waitFor(() => expect(container.textContent).toContain("礼貌友好"));
    expect(mocks.getOwnReview).toHaveBeenCalledWith(29);
    await click("礼貌友好");
    const comment = container.querySelector('textarea[aria-label="评价留言"]') as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(comment, "谢谢");
      comment.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click("提交评价");
    await waitFor(() => expect(mocks.createReview).toHaveBeenCalledWith(29, {
      targetType: "customer",
      rating: 5,
      tags: ["礼貌友好"],
      comment: "谢谢",
      idempotencyKey: expect.stringMatching(/^[a-f0-9]{32}$/)
    }));
    await waitFor(() => expect(container.textContent).not.toContain("提交评价"));
  });

  it("supports retry, edited-command key rotation, local skip, and existing-review hiding", async () => {
    const completedCheckout = { ...checkout, status: "completed" as const, paymentEvidence: "ndp_ledger" as const, paymentMethod: "ndp" as const, receiptConfirmedAt: null, receiptConfirmationReason: null };
    mocks.getCheckout.mockResolvedValue(completedCheckout);
    mocks.createReview.mockRejectedValue(new Error("ambiguous review"));
    await renderOrder(makeOrder("completed"));
    await waitFor(() => expect(container.textContent).toContain("提交评价"));
    await click("提交评价");
    await waitFor(() => expect(container.textContent).toContain("评价提交失败"));
    const firstKey = mocks.createReview.mock.calls[0]?.[1]?.idempotencyKey;
    await click("提交评价");
    await waitFor(() => expect(mocks.createReview).toHaveBeenCalledTimes(2));
    expect(mocks.createReview.mock.calls[1]?.[1]?.idempotencyKey).toBe(firstKey);
    const fourStars = container.querySelector('[aria-label="4星"]') as HTMLButtonElement;
    await waitFor(() => expect(fourStars.disabled).toBe(false));
    await act(async () => fourStars.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await click("提交评价");
    await waitFor(() => expect(mocks.createReview).toHaveBeenCalledTimes(3));
    expect(mocks.createReview.mock.calls[2]?.[1]?.idempotencyKey).not.toBe(firstKey);
    await waitFor(() => expect(textButton("跳过不评价").disabled).toBe(false));
    await click("跳过不评价");
    expect(mocks.createReview).toHaveBeenCalledTimes(3);
    expect(container.textContent).not.toContain("提交评价");

    await act(async () => root.unmount());
    root = createRoot(container);
    mocks.getOwnReview.mockResolvedValue({ review: { targetType: "customer", rating: 5, tags: [], comment: null, createdAt: "2026-09-01T12:00:00.000Z" } });
    await renderOrder(makeOrder("completed"));
    await waitFor(() => expect(mocks.getOwnReview).toHaveBeenCalled());
    expect(container.textContent).not.toContain("提交评价");
  });

  it("resets skipped review state and retained commands when the mounted technician route changes orders", async () => {
    const completedCheckout = { ...checkout, status: "completed" as const, paymentEvidence: "ndp_ledger" as const, paymentMethod: "ndp" as const, receiptConfirmedAt: null, receiptConfirmationReason: null };
    const completedOrders = new Map([
      [29, makeOrder("completed", 29)],
      [30, makeOrder("completed", 30)]
    ]);
    mocks.orderResource.mockImplementation((_session: AuthSession | null, id: number) => ({
      data: completedOrders.get(id) ?? null, error: null, loading: false, retry: mocks.retryOrder
    }));
    mocks.getCheckout.mockImplementation(async (id: number) => ({ ...completedCheckout, orderId: id }));
    mocks.createReview
      .mockRejectedValueOnce(new Error("ambiguous order A review"))
      .mockResolvedValueOnce({ applied: true, review: { targetType: "customer", rating: 5, tags: [], comment: null, createdAt: "2026-09-01T12:00:00.000Z" } });

    await act(async () => root.render(
      <MemoryRouter initialEntries={["/technician/orders/29"]}>
        <TechnicianOrderNavigationProbe />
        <TestRoutes />
      </MemoryRouter>
    ));
    await waitFor(() => expect(container.textContent).toContain("提交评价"));
    await click("提交评价");
    await waitFor(() => expect(container.textContent).toContain("评价提交失败"));
    const orderAKey = mocks.createReview.mock.calls[0]?.[1]?.idempotencyKey;
    await click("跳过不评价");
    expect(container.textContent).not.toContain("提交评价");

    await click("打开技师订单B");
    await waitFor(() => expect(mocks.getOwnReview).toHaveBeenCalledWith(30));
    await waitFor(() => expect(container.textContent).toContain("提交评价"));
    await click("提交评价");
    await waitFor(() => expect(mocks.createReview).toHaveBeenCalledTimes(2));
    expect(mocks.createReview.mock.calls[1]?.[0]).toBe(30);
    expect(mocks.createReview.mock.calls[1]?.[1]?.idempotencyKey).not.toBe(orderAKey);
  });

  it.each(["resolve", "reject"] as const)("ignores an in-flight technician order A review %s after order B has submitted", async (settlement) => {
    const completedCheckout = { ...checkout, status: "completed" as const, paymentEvidence: "ndp_ledger" as const, paymentMethod: "ndp" as const, receiptConfirmedAt: null, receiptConfirmationReason: null };
    const completedOrders = new Map([
      [29, makeOrder("completed", 29)],
      [30, makeOrder("completed", 30)]
    ]);
    const orderAReview = { applied: true, review: { targetType: "customer" as const, rating: 5, tags: [], comment: "订单A", createdAt: "2026-09-01T12:00:00.000Z" } };
    const orderACommand = deferred<typeof orderAReview>();
    mocks.orderResource.mockImplementation((_session: AuthSession | null, id: number) => ({
      data: completedOrders.get(id) ?? null, error: null, loading: false, retry: mocks.retryOrder
    }));
    mocks.getCheckout.mockImplementation(async (id: number) => ({ ...completedCheckout, orderId: id }));
    mocks.createReview.mockImplementation((id: number) => id === 29
      ? orderACommand.promise
      : Promise.reject(new Error("ambiguous order B review")));

    await act(async () => root.render(
      <MemoryRouter initialEntries={["/technician/orders/29"]}>
        <TechnicianOrderNavigationProbe />
        <TestRoutes />
      </MemoryRouter>
    ));
    await waitFor(() => expect(container.textContent).toContain("提交评价"));
    await click("提交评价");
    expect(textButton("提交评价").disabled).toBe(true);

    await click("打开技师订单B");
    await waitFor(() => expect(mocks.getOwnReview).toHaveBeenCalledWith(30));
    await waitFor(() => expect(textButton("提交评价").disabled).toBe(false));
    await click("提交评价");
    await waitFor(() => expect(container.textContent).toContain("评价提交失败：订单操作失败，请检查网络后重试"));
    const orderBKey = mocks.createReview.mock.calls[1]?.[1]?.idempotencyKey;

    await act(async () => {
      if (settlement === "resolve") orderACommand.resolve(orderAReview);
      else orderACommand.reject(new ApiClientError("error.order.invalid_transition", 40912, 409));
      await Promise.resolve();
    });

    expect(container.textContent).toContain("评价提交失败：订单操作失败，请检查网络后重试");
    expect(container.textContent).toContain("提交评价");
    expect(textButton("提交评价").disabled).toBe(false);
    await click("提交评价");
    await waitFor(() => expect(mocks.createReview).toHaveBeenCalledTimes(3));
    expect(mocks.createReview.mock.calls[2]?.[0]).toBe(30);
    expect(mocks.createReview.mock.calls[2]?.[1]?.idempotencyKey).toBe(orderBKey);
  });

  it("retries a failed technician own-review lookup in place", async () => {
    const completedCheckout = { ...checkout, status: "completed" as const, paymentEvidence: "ndp_ledger" as const, paymentMethod: "ndp" as const, receiptConfirmedAt: null, receiptConfirmationReason: null };
    mocks.getCheckout.mockResolvedValue(completedCheckout);
    mocks.getOwnReview.mockRejectedValueOnce(new Error("review projection unavailable")).mockResolvedValueOnce({ review: null });
    await renderOrder(makeOrder("completed"));

    await waitFor(() => expect(container.textContent).toContain("订单操作失败，请检查网络后重试"));
    expect(container.textContent).not.toContain("提交评价");
    await click("重新读取评价状态");
    await waitFor(() => expect(mocks.getOwnReview).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(container.textContent).toContain("提交评价"));
  });

  it("does not query or render a review for a status-only completion without evidence", async () => {
    mocks.getCheckout.mockResolvedValue({ ...checkout, status: "completed", paymentEvidence: null });
    await renderOrder(makeOrder("completed"));
    await waitFor(() => expect(mocks.getCheckout).toHaveBeenCalledWith(29));
    expect(mocks.getOwnReview).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("提交评价");
  });

  it("requires two clicks to cancel and keeps the returned persisted order", async () => {
    const cancelled = makeOrder("cancelled");
    mocks.cancelOrder.mockResolvedValue(cancelled);
    await renderOrder(makeOrder("pending"));

    await click("取消预约");
    expect(mocks.cancelOrder).not.toHaveBeenCalled();
    await click("再次点击确认取消");
    await waitFor(() => expect(mocks.cancelOrder).toHaveBeenCalledWith(29, "技师端取消正式预约"));
    expect(container.textContent).toContain("已取消");
  });

  it("shows safe not-found and retry states without legacy orders", async () => {
    await renderOrder(null, "error.schedule.slot_not_found");
    expect(container.textContent).toContain("正式订单加载失败");
    expect(container.textContent).not.toContain("ND202608280029");
    await click("重新加载");
    expect(mocks.retryOrder).toHaveBeenCalledTimes(1);
  });
});
