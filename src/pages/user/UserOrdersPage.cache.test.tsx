// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { persistentResourceCache } from "../../lib/persistentResourceCache";
import { UserOrdersPage } from "./UserOrdersPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const testState = vi.hoisted(() => ({
  listOrders: vi.fn()
}));

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({ isAuthenticated: true })
}));

vi.mock("../../features/booking/api", () => ({
  bookingApi: { listOrders: testState.listOrders },
  mapBookingOrderToDomainOrder: (order: unknown) => order
}));

vi.mock("../../features/booking/useOrderRealtimeRefresh", () => ({
  useOrderRealtimeRefresh: () => undefined
}));

vi.mock("../../lib/persistentCacheScope", () => ({
  getAuthenticatedPersistentCacheScope: () => "account:12"
}));

vi.mock("../../theme/ClientThemeProvider", () => ({
  getClientThemeClassName: () => "",
  useClientTheme: () => ({ isNight: false, theme: "jade-light" })
}));

async function waitFor(assertion: () => void) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
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

describe("UserOrdersPage persistent cache", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    await persistentResourceCache.clearScope("account:12");
    testState.listOrders.mockReset().mockResolvedValue({
      list: [],
      page: 1,
      page_size: 100,
      total: 0
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps the cached appointment list visible across route remounts", async () => {
    await act(async () => {
      root.render(<MemoryRouter><UserOrdersPage /></MemoryRouter>);
    });
    await waitFor(() => expect(document.body.textContent).toContain("这一栏暂时还没有订单"));
    expect(testState.listOrders).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => {
      root.render(<MemoryRouter><UserOrdersPage /></MemoryRouter>);
    });

    expect(document.body.textContent).toContain("这一栏暂时还没有订单");
    expect(document.body.textContent).not.toContain("正在加载预约");
    expect(testState.listOrders).toHaveBeenCalledTimes(1);
  });
});
