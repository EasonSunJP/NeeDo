// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../../api/httpClient";
import type { AuthSession } from "../../auth/rbac";
import type { BookingOrder, BookingOrderStatus, BookingScheduleSlot } from "../booking/api";
import type { CoreTechnicianDetail } from "../core-read/api";
import type { TechnicianServicePayload } from "../pricing-mode/api";

const mocks = vi.hoisted(() => ({
  cancelOrder: vi.fn(),
  completeOrder: vi.fn(),
  confirmOrder: vi.fn(),
  createSlot: vi.fn(),
  deleteSlot: vi.fn(),
  orderResource: vi.fn(),
  retryOrder: vi.fn(),
  retrySchedule: vi.fn(),
  scheduleResource: vi.fn(),
  startOrder: vi.fn(),
  updateSlot: vi.fn()
}));

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ session: technicianSession }) }));
vi.mock("../../theme/ClientThemeProvider", async () => {
  const actual = await vi.importActual<typeof import("../../theme/ClientThemeProvider")>("../../theme/ClientThemeProvider");
  return { ...actual, useClientTheme: () => ({ isNight: false, theme: "whiteGreen" }) };
});
vi.mock("../booking/api", async () => {
  const actual = await vi.importActual<typeof import("../booking/api")>("../booking/api");
  return {
    ...actual,
    bookingApi: {
      cancelOrder: mocks.cancelOrder,
      completeOrder: mocks.completeOrder,
      confirmOrder: mocks.confirmOrder,
      startOrder: mocks.startOrder
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
  FormalTechnicianScheduleWorkspace: ({ profileAvatarUrl, profileName, shopName }: { profileAvatarUrl?: string | null; profileName: string; shopName: string }) => (
    <section data-avatar={profileAvatarUrl ?? ""} data-testid="formal-technician-schedule-workspace">{profileName}:{shopName}</section>
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
  shop: {
    id: 11,
    publicId: "b0000000011",
    name: "正式店铺",
    city: "东京",
    address: "东京都港区",
    coverUrl: null,
    reviewSummary: { ratingAverage: "4.8", reviewCount: 10, latestReviewAt: null, highlights: [] }
  },
  bio: null,
  serviceArea: "东京",
  yearsExperience: 4,
  mediaAssets: [],
  services: [],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
} satisfies CoreTechnicianDetail;

const service: TechnicianServicePayload = {
  id: 102,
  shopId: 11,
  technicianId: 31,
  sourceShopServiceId: null,
  name: "Aroma 60",
  description: null,
  categoryId: 1,
  priceAmount: 10000,
  currency: "JPY",
  durationMinutes: 60,
  taxIncluded: true,
  coverImageUrl: null,
  images: [],
  tags: [],
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

function makeOrder(status: BookingOrderStatus): BookingOrder {
  return {
    id: 29,
    orderNo: "ND202608280029",
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

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
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
      data: { profile, services: [service], shopId: 11, slot },
      error: null,
      loading: false,
      retry: mocks.retrySchedule
    });
    mocks.orderResource.mockReturnValue({
      data: makeOrder("pending"), error: null, loading: false, retry: mocks.retryOrder
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
      data: { profile, services: [service], shopId: 11, slot: null },
      error: null,
      loading: false,
      retry: mocks.retrySchedule
    });

    await render("/technician/schedule?period=last7days&from=2026-08-26T15%3A00%3A00.000Z&to=2026-09-02T15%3A00%3A00.000Z");

    expect(container.textContent).not.toContain("排班与预约");
    expect(container.textContent).toContain("正式技师");
    expect(container.textContent).toContain("正式店铺");
    expect(container.querySelector('[data-testid="formal-technician-schedule-workspace"]')?.textContent).toBe("正式技师:正式店铺");
    expect(mocks.scheduleResource).toHaveBeenCalledWith(technicianSession, null);
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

  it("explains that an unassigned technician must link a shop before scheduling", async () => {
    mocks.scheduleResource.mockReturnValue({
      data: null,
      error: "error.technician.shop_required",
      loading: false,
      retry: mocks.retrySchedule
    });

    await render("/technician/schedule");

    expect(container.textContent).toContain("暂未关联店铺");
    expect(container.textContent).toContain("关联店铺并配置正式服务后即可使用排班");
    expect(container.textContent).not.toContain("error.technician.shop_required");
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

  it("creates a slot from real services and navigates to its persisted numeric ID", async () => {
    mocks.scheduleResource.mockReturnValue({
      data: { profile, services: [service], shopId: 11, slot: null },
      error: null,
      loading: false,
      retry: mocks.retrySchedule
    });
    mocks.createSlot.mockResolvedValue(slot);
    await render("/technician/schedule/new");

    await click("保存正式排班");
    await waitFor(() => expect(mocks.createSlot).toHaveBeenCalledWith(
      "technician",
      expect.objectContaining({ technicianServiceId: 102, capacity: 1 })
    ));
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe("/technician/schedule/events/17");
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
      data: { profile, services: [service], shopId: 11, slot: null },
      error: null,
      loading: false,
      retry: mocks.retrySchedule
    });
    mocks.createSlot.mockRejectedValue(new ApiClientError("error.schedule.conflict", 40911, 409));
    await render("/technician/schedule/new");
    await click("保存正式排班");
    await waitFor(() => expect(container.textContent).toContain("时间与已有排班冲突"));
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe("/technician/schedule/new");

    mocks.scheduleResource.mockReturnValue({
      data: { profile, services: [service], shopId: 11, slot },
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

  it("shows shift transfer as an unavailable formal capability with no mutation action", async () => {
    await render("/technician/schedule/shifts/legacy-shift/transfer");
    expect(container.textContent).toContain("班次转让暂未开放");
    expect(container.querySelector('a[href="/technician/schedule"]')).not.toBeNull();
    expect(container.textContent).not.toContain("发送转让邀请");
  });
});

describe("formal technician order detail route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("renders persisted order, payment, note, and every history row", async () => {
    await renderOrder(makeOrder("confirmed"));
    expect(container.textContent).toContain("ND202608280029");
    expect(container.textContent).toContain("Aroma 60");
    expect(container.textContent).toContain("正式店铺");
    expect(container.textContent).toContain("10:00–11:00");
    expect(container.textContent).toContain("现场支付");
    expect(container.textContent).toContain("请准备无香精用品");
    expect(container.textContent).toContain("用户提交");
    expect(container.textContent).toContain("正式状态记录");
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

  it.each([
    ["pending", "确认接单", "confirmOrder"],
    ["confirmed", "开始服务", "startOrder"],
    ["inService", "完成服务", "completeOrder"]
  ] as const)("runs the formal %s transition and uses the returned order", async (status, label, method) => {
    const current = makeOrder(status);
    const updated = makeOrder(status === "pending" ? "confirmed" : status === "confirmed" ? "inService" : "completed");
    mocks[method].mockResolvedValue(updated);
    await renderOrder(current);

    await click(label);
    await waitFor(() => expect(mocks[method]).toHaveBeenCalledWith(29));
    expect(container.textContent).toContain(updated.status === "confirmed" ? "已确认" : updated.status === "inService" ? "服务中" : "已完成");
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
