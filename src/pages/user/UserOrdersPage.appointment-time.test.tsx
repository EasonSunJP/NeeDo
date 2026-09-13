// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { persistentResourceCache } from "../../lib/persistentResourceCache";
import type { Order } from "../../types/domain";
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
  getAuthenticatedPersistentCacheScope: () => "account:appointment-time"
}));

vi.mock("../../theme/ClientThemeProvider", () => ({
  getClientThemeClassName: () => "",
  useClientTheme: () => ({ isNight: false, theme: "jade-light" })
}));

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "46540",
    shopId: "7",
    orderNo: "ND202609042208537783",
    mode: "store",
    status: "pending",
    customerId: "12",
    customerName: "测试用户",
    itemName: "预约服务",
    storeName: "测试店铺",
    city: "东京",
    area: "新宿区",
    amount: 8800,
    paymentStatus: "unpaid",
    bookedAt: "2026-09-07 14:00",
    createdAt: "2026-09-04 22:08",
    source: "app",
    ...overrides
  };
}

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

describe("UserOrdersPage appointment time", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    await persistentResourceCache.clearScope("account:appointment-time");
    window.localStorage.setItem("needo.language", "zh");
    window.localStorage.setItem("needo.language.mode", "manual");
    testState.listOrders.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function renderOrders(orders: Order[]) {
    testState.listOrders.mockResolvedValue({
      list: orders,
      page: 1,
      page_size: 100,
      total: orders.length
    });
    await act(async () => {
      root.render(<MemoryRouter><UserOrdersPage /></MemoryRouter>);
    });
    await waitFor(() => expect(testState.listOrders).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(document.querySelectorAll(".user-orders-order-item")).toHaveLength(orders.length));
  }

  it("shows the real appointment date and time on the order card and omits an invalid value", async () => {
    await renderOrders([
      order(),
      order({ id: "46541", orderNo: "ND-INVALID", itemName: "非法时间服务", bookedAt: "2026-02-31 14:00", createdAt: "2026-09-03 10:00" })
    ]);

    const cards = Array.from(document.querySelectorAll<HTMLElement>(".user-orders-order-item"));
    const formalCard = cards.find((card) => card.textContent?.includes("ND202609042208537783"));
    const invalidCard = cards.find((card) => card.textContent?.includes("ND-INVALID"));
    const appointmentTime = formalCard?.querySelector("time");

    expect(formalCard?.textContent).toContain("预约时间");
    expect(appointmentTime?.textContent).toBe("2026-09-07 14:00");
    expect(appointmentTime?.getAttribute("datetime")).toBe("2026-09-07 14:00");
    expect(invalidCard?.textContent).not.toContain("预约时间");
    expect(invalidCard?.querySelector("time")).toBeNull();
  });

  it("keeps booked-time sorting and status labels unchanged", async () => {
    await renderOrders([
      order({ id: "2", orderNo: "ND-OLDER", itemName: "较早预约", bookedAt: "2026-09-06 18:00", status: "completed" }),
      order({ id: "3", orderNo: "ND-INVALID", itemName: "非法时间预约", bookedAt: "2026-02-31 14:00", createdAt: "2026-09-05 20:00", status: "cancelled" }),
      order({ id: "1", orderNo: "ND-NEWER", itemName: "较新预约", bookedAt: "2026-09-07 14:00", status: "pending" })
    ]);

    const cards = Array.from(document.querySelectorAll<HTMLElement>(".user-orders-order-item"));
    expect(cards.map((card) => card.querySelector(".user-orders-provider-card")?.textContent)).toEqual([
      expect.stringContaining("较新预约"),
      expect.stringContaining("较早预约"),
      expect.stringContaining("非法时间预约")
    ]);
    expect(cards[0]?.textContent).toContain("待确认");
    expect(cards[1]?.textContent).toContain("已完成");
    expect(cards[2]?.textContent).toContain("已取消");
  });

  it("keeps appointment metadata on its own narrow-safe row", async () => {
    await renderOrders([order()]);

    const providerCard = document.querySelector<HTMLElement>(".user-orders-provider-card");
    const providerAvatar = providerCard?.querySelector<HTMLElement>("img");
    const providerContent = providerCard?.querySelector<HTMLElement>(":scope > div");
    const providerLink = providerCard?.parentElement;
    const appointmentRow = document.querySelector<HTMLElement>(".user-orders-appointment-time");
    const appointmentLabel = appointmentRow?.querySelector<HTMLElement>("dt");
    const appointmentValue = appointmentRow?.querySelector<HTMLElement>("dd");
    const actionRow = document.querySelector<HTMLElement>(".user-orders-action-row");

    expect(providerCard?.className).toContain("grid-cols-[58px_minmax(0,1fr)]");
    expect(providerAvatar?.className).toContain("col-start-1");
    expect(providerAvatar?.className).toContain("row-start-1");
    expect(providerContent?.className).toContain("col-start-2");
    expect(providerContent?.className).toContain("row-start-1");
    expect(providerLink?.className).toContain("block");
    expect(appointmentRow?.className).toContain("grid-cols-[auto_minmax(0,1fr)]");
    expect(appointmentRow?.parentElement?.className).toContain("min-w-0");
    expect(appointmentLabel?.className).toContain("whitespace-nowrap");
    expect(appointmentValue?.className).toContain("whitespace-nowrap");
    expect(actionRow).not.toBeNull();
  });

  it("shows the JPY order total separately from the persisted payment channel and Test NDP unit", async () => {
    await renderOrders([
      order({
        amount: 14_500,
        paymentMethod: "platform",
        paymentChannel: "ndp",
        checkoutPaymentAmountNdp: 14_500,
        ndpCurrency: "TEST_NDP"
      })
    ]);

    const card = document.querySelector<HTMLElement>(".user-orders-provider-card");
    const payment = card?.querySelector<HTMLElement>(".user-orders-payment-summary");

    expect(card?.textContent).toContain("￥14,500");
    expect(payment?.textContent).toBe("14,500 Test NDP");
  });

  it("hides an unselected checkout channel and shows the selected custom label", async () => {
    await renderOrders([
      order({ id: "1", orderNo: "ND-PENDING-CHANNEL", paymentChannel: undefined }),
      order({
        id: "2",
        orderNo: "ND-CUSTOM-CHANNEL",
        paymentChannel: "other",
        otherPaymentMethodCode: "paypay",
        otherPaymentMethodLabel: "PayPay"
      })
    ]);

    const cards = Array.from(document.querySelectorAll<HTMLElement>(".user-orders-order-item"));
    const pending = cards.find((card) => card.textContent?.includes("ND-PENDING-CHANNEL"));
    const custom = cards.find((card) => card.textContent?.includes("ND-CUSTOM-CHANNEL"));

    expect(pending?.querySelector(".user-orders-payment-summary")).toBeNull();
    expect(custom?.querySelector(".user-orders-payment-summary")?.textContent).toBe("PayPay");
  });

  it("shows the formal service and shop names as explicit visual fields", async () => {
    await renderOrders([
      order({
        itemName: "ボディケア 60分",
        storeName: "LifeDance Wellness 渋谷"
      })
    ]);

    const serviceField = document.querySelector<HTMLElement>("[data-testid='user-order-service-field']");
    const shopField = document.querySelector<HTMLElement>("[data-testid='user-order-shop-field']");
    const serviceName = serviceField?.querySelector<HTMLElement>("dd");
    const shopName = shopField?.querySelector<HTMLElement>("dd");

    expect(serviceField?.querySelector("dt")?.textContent).toBe("服务");
    expect(serviceName?.textContent).toBe("ボディケア 60分");
    expect(shopField?.querySelector("dt")?.textContent).toBe("店铺");
    expect(shopName?.textContent).toBe("LifeDance Wellness 渋谷");
  });

  it("keeps long formal names bounded and exposes their complete values", async () => {
    const longServiceName = "全身コンディショニングとボディケアを組み合わせた特別な120分コース";
    const longShopName = "LifeDance Wellness 渋谷スクランブルスクエア特別フロア店";
    await renderOrders([order({ itemName: longServiceName, storeName: longShopName })]);

    const serviceName = document.querySelector<HTMLElement>("[data-testid='user-order-service-field'] dd");
    const shopName = document.querySelector<HTMLElement>("[data-testid='user-order-shop-field'] dd");

    expect(serviceName?.className).toContain("truncate");
    expect(serviceName?.getAttribute("title")).toBe(longServiceName);
    expect(shopName?.className).toContain("truncate");
    expect(shopName?.getAttribute("title")).toBe(longShopName);
  });

  it("localizes field labels, preserves API names, and handles a missing optional shop name", async () => {
    window.localStorage.setItem("needo.language", "ja");
    window.localStorage.setItem("needo.language.mode", "manual");
    await renderOrders([order({ itemName: "ボディケア 60分", storeName: "" })]);

    const serviceField = document.querySelector<HTMLElement>("[data-testid='user-order-service-field']");
    const shopField = document.querySelector<HTMLElement>("[data-testid='user-order-shop-field']");

    expect(serviceField?.querySelector("dt")?.textContent).toBe("サービス");
    expect(serviceField?.querySelector("dd")?.textContent).toBe("ボディケア 60分");
    expect(shopField?.querySelector("dt")?.textContent).toBe("店舗");
    expect(shopField?.querySelector("dd")?.textContent).toBe("未設定");
  });
});
