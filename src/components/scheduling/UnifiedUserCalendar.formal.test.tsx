// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import type { Customer } from "../../types/domain";
import { UnifiedUserCalendar } from "./UnifiedUserCalendar";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const testState = vi.hoisted(() => ({
  legacyListOrders: vi.fn(),
  loadCustomerOrderWindow: vi.fn()
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
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    window.localStorage.clear();
    vi.restoreAllMocks();
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
});
