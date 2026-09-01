// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bookingApi, type BookingOrder } from "../../features/booking/api";
import { UserOrderDetailPage } from "./UserOrderDetailPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../components/client-ui/AppScaffold", () => ({
  AppIcon: () => <span>icon</span>,
  AppTopBar: ({ title }: { title: string }) => <header>{title}</header>,
  IconButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
  PageScaffold: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  PrimaryButton: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>
}));

vi.mock("../../shared/order-detail/OrderDynamicStatusCard", () => ({
  OrderDynamicStatusCard: () => <section>订单状态卡</section>
}));

const baseOrder: BookingOrder = {
  id: 31,
  orderNo: "ND202605250001",
  orderType: "booking",
  status: "cancelled",
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
  customerUserId: 101,
  serviceId: 1,
  technicianServiceId: null,
  shopId: 11,
  technicianProfileId: 301,
  scheduleSlotId: 501,
  fulfillmentMode: "store",
  serviceName: "Shiatsu Recovery",
  shopName: "Aoyama Care Studio",
  technicianName: "Mika Tanaka",
  priceAmount: "8800.00",
  currency: "JPY",
  startsAt: "2026-05-25T01:00:00.000Z",
  endsAt: "2026-05-25T02:00:00.000Z",
  note: null,
  cancelReason: "技师临时无法到达",
  createdAt: "2026-05-24T23:00:00.000Z",
  updatedAt: "2026-05-25T04:00:00.000Z",
  statusHistory: [
    {
      id: 11,
      orderId: 31,
      fromStatus: "pending",
      toStatus: "cancelled",
      actorUserId: 301,
      reason: "技师临时无法到达",
      createdAt: "2026-05-25T02:00:00.000Z"
    }
  ],
  performanceAssessment: {
    id: 81,
    bookingOrderId: 31,
    technicianProfileId: 301,
    outcome: "technician_cancelled",
    treatment: "counted",
    version: 3,
    currentRevisionId: 93,
    createdAt: "2026-05-25T02:00:00.000Z",
    updatedAt: "2026-05-25T04:00:00.000Z"
  },
  timelineEvents: [
    {
      id: "status:11",
      type: "ORDER_STATUS_CHANGED",
      createdAt: "2026-05-25T02:00:00.000Z",
      actorUserId: 301,
      fromStatus: "pending",
      toStatus: "cancelled",
      publicReason: "技师临时无法到达"
    },
    {
      id: "performance:92",
      type: "SPECIAL_CANCELLATION_APPLIED",
      createdAt: "2026-05-25T03:00:00.000Z",
      actorUserId: 1,
      publicReason: "已核实不可抗力"
    },
    {
      id: "performance:93",
      type: "SPECIAL_CANCELLATION_REVOKED",
      createdAt: "2026-05-25T04:00:00.000Z",
      actorUserId: 1,
      publicReason: "用户投诉后复核恢复计入"
    }
  ]
};

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

let container: HTMLDivElement;
let root: Root;

describe("UserOrderDetailPage formal performance timeline", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("renders status, apply, and later revoke events without operations-only notes", async () => {
    vi.spyOn(bookingApi, "getOrder").mockResolvedValue({
      ...baseOrder,
      timelineEvents: baseOrder.timelineEvents?.map((event) =>
        event.type === "SPECIAL_CANCELLATION_APPLIED"
          ? ({ ...event, internalNote: "用户端绝不能显示" } as typeof event)
          : event
      )
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/orders/31"]}>
          <Routes>
            <Route path="/orders/:orderId" element={<UserOrderDetailPage />} />
          </Routes>
        </MemoryRouter>
      );
    });
    await flush();

    expect(container.textContent).toContain("预约状态");
    expect(container.textContent).toContain("技师临时无法到达");
    expect(container.textContent).toContain("特殊取消已生效");
    expect(container.textContent).toContain("已核实不可抗力");
    expect(container.textContent).toContain("特殊取消已撤销");
    expect(container.textContent).toContain("用户投诉后复核恢复计入");
    expect(container.textContent).not.toContain("用户端绝不能显示");
  });

  it("falls back to legacy statusHistory when an older backend omits timelineEvents", async () => {
    vi.spyOn(bookingApi, "getOrder").mockResolvedValue({
      ...baseOrder,
      timelineEvents: undefined
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/orders/31"]}>
          <Routes>
            <Route path="/orders/:orderId" element={<UserOrderDetailPage />} />
          </Routes>
        </MemoryRouter>
      );
    });
    await flush();

    expect(container.textContent).toContain("预约状态");
    expect(container.textContent).toContain("技师临时无法到达");
  });
});
