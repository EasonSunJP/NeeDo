// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BookingOrder, BookingScheduleSlot } from "../booking/api";

const mocks = vi.hoisted(() => ({
  loadOrders: vi.fn(),
  loadSlots: vi.fn()
}));

vi.mock("../scheduling/window-loader", () => ({
  loadEveryTechnicianOrder: mocks.loadOrders,
  loadManagedScheduleWindow: mocks.loadSlots
}));
vi.mock("../../components/technician/FormalTechnicianOrdersPanel", () => ({
  FormalTechnicianOrdersPanel: () => <div data-testid="formal-order-panel">订单正式面板</div>
}));

import { FormalTechnicianScheduleWorkspace } from "./FormalTechnicianScheduleWorkspace";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const slot: BookingScheduleSlot = {
  id: 17,
  serviceId: null,
  technicianServiceId: 102,
  shopId: 11,
  technicianProfileId: 31,
  startsAt: "2026-09-01T10:00:00+09:00",
  endsAt: "2026-09-01T11:00:00+09:00",
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

const order: BookingOrder = {
  id: 29,
  orderNo: "ND202608280029",
  orderType: "booking",
  status: "confirmed",
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
  scheduleSlotId: 18,
  fulfillmentMode: "store",
  serviceName: "指名护理",
  shopName: "正式店铺",
  technicianName: "正式技师",
  priceAmount: "12000.00",
  currency: "JPY",
  startsAt: "2026-09-01T13:00:00+09:00",
  endsAt: "2026-09-01T14:00:00+09:00",
  note: null,
  cancelReason: null,
  createdAt: "2026-08-28T01:00:00+09:00",
  updatedAt: "2026-08-28T01:00:00+09:00",
  statusHistory: []
};

let container: HTMLDivElement;
let root: Root;

async function waitFor(assertion: () => void) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => Promise.resolve());
    }
  }
  throw lastError;
}

async function click(label: string) {
  const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.trim() === label);
  if (!button) throw new Error(`Missing button: ${label}`);
  await act(async () => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

describe("FormalTechnicianScheduleWorkspace", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T09:00:00+09:00"));
    mocks.loadSlots.mockResolvedValue([slot]);
    mocks.loadOrders.mockResolvedValue([order]);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(
      <MemoryRouter>
        <FormalTechnicianScheduleWorkspace profileAvatarUrl="/media/technician.jpg" profileName="正式技师" shopName="正式店铺" />
      </MemoryRouter>
    ));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("renders the approved day, week, month and order surfaces from formal loaders", async () => {
    await waitFor(() => expect(container.querySelector('[data-testid="formal-schedule-day-timeline"]')).not.toBeNull());
    expect(container.textContent).toContain("Aroma 60");
    expect(container.textContent).toContain("指名护理");
    expect(mocks.loadSlots).toHaveBeenCalledWith("technician", expect.objectContaining({ from: expect.any(Date), to: expect.any(Date) }));
    expect(mocks.loadOrders).toHaveBeenCalledWith(expect.objectContaining({ from: expect.any(String), to: expect.any(String) }));

    await click("周");
    await waitFor(() => expect(container.querySelector('[data-testid="formal-schedule-week-grid"]')).not.toBeNull());
    await click("月");
    await waitFor(() => expect(container.querySelector('[data-testid="formal-schedule-month-grid"]')).not.toBeNull());
    await click("预约订单");
    expect(container.querySelector('[data-testid="formal-order-panel"]')).not.toBeNull();
  });

  it("keeps the approved mobile schedule hierarchy and a complete 24-hour day grid", async () => {
    await waitFor(() => expect(container.querySelector('[data-testid="formal-schedule-day-timeline"]')).not.toBeNull());

    expect(container.querySelector('[data-testid="formal-schedule-profile-row"]')?.textContent).toContain("正式技师");
    expect(container.querySelector('img[src="/media/technician.jpg"]')).not.toBeNull();
    expect(container.textContent).toContain("我的排班");
    expect(container.textContent).toContain("排班设置");
    expect(container.textContent).toContain("行程搜索");
    expect(container.textContent).toContain("1日");
    expect(container.querySelectorAll('[data-testid="formal-schedule-hour-row"]')).toHaveLength(24);
    expect(container.textContent).toContain("00:00");
    expect(container.textContent).toContain("23:00");
  });
});
