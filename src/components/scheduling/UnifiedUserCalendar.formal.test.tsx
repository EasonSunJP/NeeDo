// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import type { BookingScheduleSlot } from "../../features/booking/api";
import type { Customer, Store, Technician } from "../../types/domain";
import { getFormalScheduleEvents, UnifiedCalendarEventCard, UnifiedUserCalendar } from "./UnifiedUserCalendar";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const testState = vi.hoisted(() => ({
  legacyListOrders: vi.fn(),
  loadCustomerOrderWindow: vi.fn(),
  listScheduleSlots: vi.fn()
}));

vi.mock("../../features/booking/window-loaders", () => ({
  loadCustomerOrderWindow: testState.loadCustomerOrderWindow
}));

vi.mock("../../features/booking/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../features/booking/api")>();
  return {
    ...actual,
    bookingApi: {
      ...actual.bookingApi,
      listOrders: testState.legacyListOrders
    }
  };
});

vi.mock("../../features/scheduling/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../features/scheduling/api")>();
  return {
    ...actual,
    schedulingApi: {
      ...actual.schedulingApi,
      listSlots: testState.listScheduleSlots
    }
  };
});

vi.mock("../../state/entityStore", () => ({
  useEntityStore: () => ({ customers: [], stores: [], technicians: [] })
}));

vi.mock("../../state/scheduleStore", () => ({
  useScheduleStore: () => ({ schedules: [] })
}));

vi.mock("../../state/technicianScheduleStore", () => ({
  useTechnicianScheduleStore: () => ({ bookings: [] })
}));

vi.mock("../../features/dispatch-center/store", () => ({
  useDispatchCenterStore: () => ({ arrangements: [] })
}));

vi.mock("../../features/im/store", () => ({
  useImStore: () => ({
    contacts: [],
    conversations: [],
    currentUserId: "7",
    ensureDirectConversation: vi.fn(),
    users: [],
    usersById: {}
  })
}));

vi.mock("../mobile/FloatingActionButton", () => ({
  FloatingActionButton: ({ ariaLabel }: { ariaLabel: string }) => (
    <button aria-label={ariaLabel} type="button">floating action</button>
  )
}));

const customerFixture: Customer = {
  id: "7",
  systemId: "u0000000007",
  name: "Formal Customer",
  avatar: "",
  phone: "",
  memberLevel: "free",
  tags: [],
  ltv: 0,
  orderCount: 0,
  lastOrderAt: "",
  activeScore: 0,
  churnRisk: "low"
};

const technicianFixture = {
  avatar: "",
  id: "48",
  name: "山崎 俊介",
  storeId: "17"
};

function todayKey() {
  const today = new Date();
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0")
  ].join("-");
}

async function waitFor(assertion: () => void) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      });
    }
  }
  throw lastError;
}

let container: HTMLDivElement;
let root: Root;

describe("UnifiedUserCalendar formal-only mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: vi.fn()
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    window.localStorage.setItem("needo.user-unified-calendar.v1", JSON.stringify([{
      id: "local-fixture",
      calendarId: "user:me",
      calendarLabel: "我的行程",
      date: todayKey(),
      endDate: todayKey(),
      startTime: "10:00",
      endTime: "11:00",
      title: "local fixture event",
      location: "",
      note: "",
      url: "",
      images: [],
      reminder: "无",
      allDay: false,
      repeatRule: "none",
      syncContactIds: [],
      visibility: "未同步",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }]));
    testState.legacyListOrders.mockResolvedValue({ list: [], total: 0, page: 1, page_size: 100 });
    testState.loadCustomerOrderWindow.mockRejectedValue(new Error("schedule unavailable"));
    testState.listScheduleSlots.mockResolvedValue({ list: [], total: 0, page: 1, page_size: 100 });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  async function renderMerchant() {
    await act(async () => root.render(
      <MemoryRouter><I18nProvider><UnifiedUserCalendar
        currentStore={{ id: "17", name: "Formal Shop" } as Store}
        technicians={[{ ...technicianFixture, avatar: "/media/formal-avatar.jpg" } as Technician]}
        scope="merchant" displayMode="parallel" merchantLaneMode="appointmentStatus" formalOnly
      /></I18nProvider></MemoryRouter>
    ));
  }

  it("keeps real technician avatar headers in appointment status mode on empty days", async () => {
    await renderMerchant();
    await waitFor(() => expect(container.querySelector('img[alt="山崎 俊介"]')).not.toBeNull());
    expect(container.querySelector('img[alt="山崎 俊介"]')?.getAttribute("src")).toBe("/media/formal-avatar.jpg");
    expect(container.textContent).toContain("已排预约");
    expect(container.textContent).toContain("未排预约");
  });

  it("loads later real order pages and retains assigned orders under the status filter", async () => {
    const slot = { id: 901, startsAt: `${todayKey()}T10:00:00`, endsAt: `${todayKey()}T11:00:00`,
      status: "confirmed", orderNo: "TEST-901", serviceName: "first-page-service", technicianProfileId: 48, shopId: 17,
      capacity: 1, bookedCount: 0, priceAmount: "8800", currency: "JPY", durationMinutes: 60 };
    testState.legacyListOrders.mockImplementation(async (input) => ({
      list: [{ ...slot, id: 900 + input.page, serviceName: input.page === 1 ? "first-page-service" : "last-page-service" }],
      page: input.page, page_size: 1, total: 2
    }));
    await renderMerchant();
    await waitFor(() => expect(container.textContent).toContain("last-page-service"));
    const assigned = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "已排预约");
    await act(async () => assigned?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.textContent).toContain("last-page-service");
  });

  it("preserves historical orders when their technician is no longer in the current roster", async () => {
    testState.legacyListOrders.mockResolvedValue({ list: [{ id: 903, orderNo: "TEST-903",
      startsAt: `${todayKey()}T23:00:00`, endsAt: `${todayKey()}T23:59:00`,
      status: "confirmed", serviceName: "departed-staff-service", technicianName: "Former Staff",
      technicianProfileId: 49, shopId: 17, capacity: 1, bookedCount: 1,
      priceAmount: "8800", currency: "JPY", durationMinutes: 59
    }], total: 1, page: 1, page_size: 100 });
    await renderMerchant();
    await waitFor(() => expect(container.textContent).toContain("departed-staff-service"));
    expect(container.textContent).toContain("Former Staff");
  });

  it("splits overnight slots into daily segments and preserves an exact midnight end", () => {
    const events = getFormalScheduleEvents([{ id: 904,
      startsAt: "2026-09-06T23:00:00", endsAt: "2026-09-07T01:00:00", serviceName: "overnight"
    } as BookingScheduleSlot], "merchant");
    expect(events).toEqual([
      expect.objectContaining({ date: "2026-09-06", startTime: "23:00", endTime: "24:00" }),
      expect.objectContaining({ date: "2026-09-07", startTime: "00:00", endTime: "01:00" })
    ]);
    const midnight = getFormalScheduleEvents([{ id: 905,
      startsAt: "2026-09-06T23:00:00", endsAt: "2026-09-07T00:00:00", serviceName: "midnight"
    } as BookingScheduleSlot], "merchant");
    expect(midnight).toHaveLength(1);
    expect(midnight[0]?.endTime).toBe("24:00");
  });

  it.each([["available", "可预约"], ["booked", "已预约"], ["blocked", "已锁定"]] as const)("keeps the persisted %s slot status visible on compact cards", async (status, badge) => {
    const event = getFormalScheduleEvents([{ id: 906, status,
      startsAt: "2026-09-06T00:00:00", endsAt: "2026-09-06T01:00:00", serviceName: "正式服务"
    } as BookingScheduleSlot], "merchant")[0]!;
    await act(async () => root.render(<UnifiedCalendarEventCard event={event} compact onOpen={() => {}} />));
    expect(container.querySelector("button")?.textContent).toContain(badge);
  });

  it("does not present available staffing slots as customer appointments", async () => {
    testState.listScheduleSlots.mockResolvedValue({ list: [{ id: 999,
      startsAt: `${todayKey()}T00:00:00`, endsAt: `${todayKey()}T01:00:00`,
      status: "available", serviceName: "unbooked-staffing-slot", technicianProfileId: 48
    }], total: 1, page: 1, page_size: 100 });
    await renderMerchant();
    await waitFor(() => expect(testState.legacyListOrders).toHaveBeenCalled());
    expect(container.textContent).not.toContain("unbooked-staffing-slot");
    expect(testState.listScheduleSlots).not.toHaveBeenCalled();
  });

  it("does not replace a failed formal request with local events", async () => {
    const storageWrite = vi.spyOn(Storage.prototype, "setItem");
    await act(async () => {
      root.render(
        <MemoryRouter>
          <I18nProvider>
            <UnifiedUserCalendar currentCustomer={customerFixture} formalOnly />
          </I18nProvider>
        </MemoryRouter>
      );
    });

    await waitFor(() => expect(container.textContent).toContain("schedule unavailable"));
    expect(container.textContent).not.toContain("local fixture event");
    const retryButton = Array.from(container.querySelectorAll("button")).find((button) => /重试|再试|retry/i.test(button.textContent ?? ""));
    expect(retryButton).toBeDefined();
    expect(container.querySelector('button[aria-label="新增行程"]')).toBeNull();
    expect(testState.legacyListOrders).not.toHaveBeenCalled();
    expect(storageWrite.mock.calls.filter(([key]) => key === "needo.user-unified-calendar.v1")).toHaveLength(0);

    await act(async () => {
      retryButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await waitFor(() => expect(testState.loadCustomerOrderWindow).toHaveBeenCalledTimes(2));
  });

  it("opens the approved calendar-source menu without enabling local calendar persistence", async () => {
    testState.loadCustomerOrderWindow.mockResolvedValue([]);
    const storageWrite = vi.spyOn(Storage.prototype, "setItem");

    await act(async () => {
      root.render(
        <MemoryRouter>
          <I18nProvider>
            <UnifiedUserCalendar currentCustomer={customerFixture} formalOnly showSourceDrawer />
          </I18nProvider>
        </MemoryRouter>
      );
    });

    await waitFor(() => expect(container.querySelector('button[aria-label="打开日历来源"]')).not.toBeNull());
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="打开日历来源"]')?.click();
    });

    const menu = container.querySelector('[role="menu"]');
    expect(menu?.textContent).toContain("日历来源");
    expect(menu?.textContent).toContain("NeeDo 同步");
    expect(menu?.textContent).toContain("我的行程");
    expect(menu?.textContent).toContain("技师端行程");
    expect(menu?.textContent).toContain("商户端行程");
    expect(menu?.textContent).toContain("ToDo");
    expect(menu?.textContent).toContain("生日");
    expect(storageWrite.mock.calls.filter(([key]) => key === "needo.user-unified-calendar.v1")).toHaveLength(0);
  });

  it("keeps a formal technician search inside the selected calendar period", async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <I18nProvider>
            <UnifiedUserCalendar
              currentTechnician={technicianFixture}
              displayMode="parallel"
              formalOnly
              scope="technician"
              searchQuery="山崎"
            />
          </I18nProvider>
        </MemoryRouter>
      );
    });

    await waitFor(() => expect(testState.listScheduleSlots).toHaveBeenCalled());
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(testState.listScheduleSlots).toHaveBeenCalledTimes(1);
    const [, query] = testState.listScheduleSlots.mock.calls[0] as [string, { from: Date; to: Date }];
    expect(query.to.getTime() - query.from.getTime()).toBeLessThanOrEqual(2 * 24 * 60 * 60 * 1000);
    expect(container.textContent).toContain("搜索「山崎」");
    expect(container.textContent).toContain("00:00");
  });
});
