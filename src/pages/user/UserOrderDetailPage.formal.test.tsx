// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../../api/httpClient";
import type { BookingOrder, BookingOrderStatus, OrderCheckout } from "../../features/booking/api";

const mocks = vi.hoisted(() => ({
  acceptAddOn: vi.fn(),
  cancelOrder: vi.fn(),
  createAddOn: vi.fn(),
  endService: vi.fn(),
  getCheckout: vi.fn(),
  getOrder: vi.fn(),
  listServices: vi.fn(),
  payWithNdp: vi.fn(),
  rejectAddOn: vi.fn(),
  selectPaymentMethod: vi.fn(),
  startService: vi.fn()
}));

vi.mock("../../features/booking/api", async () => {
  const actual = await vi.importActual<typeof import("../../features/booking/api")>("../../features/booking/api");
  return {
    ...actual,
    bookingApi: {
      acceptAddOn: mocks.acceptAddOn,
      cancelOrder: mocks.cancelOrder,
      createAddOn: mocks.createAddOn,
      endService: mocks.endService,
      getCheckout: mocks.getCheckout,
      getOrder: mocks.getOrder,
      payWithNdp: mocks.payWithNdp,
      rejectAddOn: mocks.rejectAddOn,
      selectPaymentMethod: mocks.selectPaymentMethod,
      startService: mocks.startService
    }
  };
});
vi.mock("../../features/core-read/api", () => ({ coreReadApi: { listServices: mocks.listServices } }));
vi.mock("../../state/userOrderStore", () => ({ useUserOrders: () => [{ id: "legacy-1", itemName: "历史服务", storeName: "历史店铺", bookedAt: "2026-08-01 10:00", status: "completed", amount: 5000, serviceId: "12" }] }));
vi.mock("../../components/client-ui/AppScaffold", () => ({
  AppTopBar: ({ title }: { title: string }) => <header>{title}</header>,
  PageScaffold: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  PrimaryButton: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => <button onClick={onClick} type="button">{children}</button>
}));
vi.mock("../../components/mobile/ContactEventTimeline", () => ({ ContactEventTimelinePanel: () => <section>状态记录</section> }));
vi.mock("../../shared/order-detail/ServiceSessionUi", () => ({ ServiceCountdownPill: ({ seconds }: { seconds: number }) => <output data-testid="countdown">{seconds}</output> }));

import { UserOrderDetailPage } from "./UserOrderDetailPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeOrder(status: BookingOrderStatus): BookingOrder {
  return {
    id: 88,
    orderNo: "ND202609010088",
    orderType: "booking",
    status,
    paymentMethod: status === "awaitingPaymentConfirmation" ? "cash" : "onsite",
    paymentStatus: status === "completed" ? "confirmed" : "pending",
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
    serviceId: 12,
    technicianServiceId: null,
    shopId: 7,
    technicianProfileId: 9,
    scheduleSlotId: 33,
    fulfillmentMode: "store",
    serviceName: "正式基础服务",
    shopName: "正式店铺",
    technicianName: "正式技师",
    priceAmount: "8800.00",
    currency: "JPY",
    startsAt: "2026-09-01T01:00:00.000Z",
    endsAt: "2026-09-01T02:00:00.000Z",
    note: null,
    cancelReason: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    serviceVerificationCode: "482931",
    serviceSession: status === "inService" ? {
      startedAt: "2026-09-01T01:00:00.000Z",
      expectedEndsAt: "2099-09-01T02:00:00.000Z",
      endedAt: null,
      addOns: [{
        id: 301,
        serviceId: 45,
        status: "proposed",
        serviceNameSnapshot: "技师建议延长",
        priceAmountJpy: 1200,
        currency: "JPY",
        durationMinutes: 30,
        serviceSnapshot: {},
        proposedBy: "technician",
        proposedAt: "2026-09-01T01:15:00.000Z",
        resolvedBy: null,
        resolvedAt: null,
        resolutionReason: null
      }]
    } : null,
    statusHistory: []
  };
}

const checkout: OrderCheckout = {
  id: 91,
  orderId: 88,
  status: "awaitingCheckout",
  baseAmountJpy: 8800,
  addOnAmountJpy: 1200,
  discountAmountJpy: 500,
  checkoutAmountJpy: 9500,
  payableNdp: 19000,
  rate: { ruleId: 7, publicId: "rate-7", version: 3, ndpUnits: 2, jpyUnits: 1, effectiveFrom: "2026-09-01T00:00:00.000Z" },
  calculation: {
    formula: "base_plus_accepted_add_ons_minus_discount",
    baseAmountJpy: 8800,
    acceptedAddOnIds: [301],
    addOnAmountJpy: 1200,
    discountAmountJpy: 500,
    checkoutAmountJpy: 9500,
    rateFormula: "ceil(jpy_times_ndp_units_divided_by_jpy_units)"
  },
  paymentMethod: null,
  paymentSelectedAt: null,
  otherMethod: null,
  paymentEvidence: null,
  receiptConfirmedAt: null,
  receiptConfirmationReason: null,
  createdAt: "2026-09-01T02:00:00.000Z",
  updatedAt: "2026-09-01T02:00:00.000Z"
};

const coreService = {
  id: 45,
  name: "正式延长服务",
  description: "延长 30 分钟",
  category: { id: 1, code: "relax", name: "放松", nameJa: null, nameEn: null, parentId: null, iconUrl: null, sortOrder: 1, isActive: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
  shop: { id: 7, publicId: "b0000000007", name: "正式店铺", city: "东京", address: "东京", coverUrl: null, reviewSummary: { ratingAverage: "5.0", reviewCount: 1, latestReviewAt: null, highlights: [] } },
  technician: null,
  city: "东京",
  priceAmount: "1200.00",
  currency: "JPY",
  durationMinutes: 30,
  coverUrl: null,
  reviewSummary: { ratingAverage: "5.0", reviewCount: 1, latestReviewAt: null, highlights: [] }
};

let container: HTMLDivElement;
let root: Root;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function waitFor(assertion: () => void) {
  let lastError: unknown;
  for (let index = 0; index < 30; index += 1) {
    try { assertion(); return; } catch (error) { lastError = error; await act(async () => new Promise((resolve) => window.setTimeout(resolve, 0))); }
  }
  throw lastError;
}

async function render(path = "/orders/88") {
  await act(async () => root.render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/orders/:orderId" element={<UserOrderDetailPage />} /></Routes></MemoryRouter>));
  await waitFor(() => expect(container.textContent).not.toContain("正在加载预约详情"));
}

function button(label: string) {
  const target = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes(label));
  if (!target) throw new Error(`missing button ${label}`);
  return target;
}

async function click(label: string) {
  await act(async () => button(label).dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

describe("formal user order detail", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.listServices.mockResolvedValue({ list: [coreService], total: 1, page: 1, page_size: 100 });
    mocks.getCheckout.mockResolvedValue(checkout);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("reconstructs confirmed state and starts with the customer actor while showing the formal code", async () => {
    mocks.getOrder.mockResolvedValue(makeOrder("confirmed"));
    mocks.startService.mockResolvedValue(makeOrder("inService"));
    await render();
    expect(container.textContent).toContain("482931");
    await click("开始服务");
    await click("开始计算");
    await waitFor(() => expect(mocks.startService).toHaveBeenCalledWith(88, { actor: "customer", idempotencyKey: expect.stringMatching(/^[a-f0-9]{32}$/) }));
    expect(container.textContent).toContain("正式延长服务");
  });

  it("reconstructs countdown and real catalog, proposes and decides add-ons, then uses formal early end", async () => {
    mocks.getOrder.mockResolvedValue(makeOrder("inService"));
    mocks.createAddOn.mockResolvedValue(makeOrder("inService"));
    mocks.acceptAddOn.mockResolvedValue(makeOrder("inService"));
    mocks.rejectAddOn.mockResolvedValue(makeOrder("inService"));
    mocks.endService.mockResolvedValue(makeOrder("awaitingCheckout"));
    await render();
    expect(Number(container.querySelector('[data-testid="countdown"]')?.textContent)).toBeGreaterThan(0);
    await waitFor(() => expect(container.textContent).toContain("正式延长服务"));
    expect(mocks.listServices).toHaveBeenCalledWith({ shopId: 7, page: 1, pageSize: 100 });
    await click("正式延长服务");
    await waitFor(() => expect(mocks.createAddOn).toHaveBeenCalledWith(88, { serviceId: 45, idempotencyKey: expect.stringMatching(/^[a-f0-9]{32}$/) }));
    await click("接受追加");
    await waitFor(() => expect(mocks.acceptAddOn).toHaveBeenCalledWith(88, 301, { idempotencyKey: expect.stringMatching(/^[a-f0-9]{32}$/) }));
    await waitFor(() => expect(button("拒绝").disabled).toBe(false));
    await click("拒绝");
    await waitFor(() => expect(mocks.rejectAddOn).toHaveBeenCalledWith(88, 301, { idempotencyKey: expect.stringMatching(/^[a-f0-9]{32}$/) }));
    await waitFor(() => expect(button("提前结束服务").disabled).toBe(false));
    await click("提前结束服务");
    await click("确认结束服务");
    await waitFor(() => expect(mocks.endService).toHaveBeenCalledWith(88, { reason: "客户确认提前结束服务", idempotencyKey: expect.stringMatching(/^[a-f0-9]{32}$/) }));
  });

  it("shows immutable checkout values and moves cash to the server waiting state", async () => {
    mocks.getOrder.mockResolvedValueOnce(makeOrder("awaitingCheckout")).mockResolvedValueOnce(makeOrder("awaitingPaymentConfirmation"));
    mocks.selectPaymentMethod.mockResolvedValue({ ...checkout, status: "awaitingPaymentConfirmation", paymentMethod: "cash" });
    await render();
    await waitFor(() => expect(container.textContent).toContain("19,000 NDP"));
    expect(container.textContent).toContain("等待结账");
    expect(container.textContent).not.toContain("服务已完成");
    expect(container.textContent).toContain("2 NDP = 1 JPY");
    expect(button("现金支付")).toBeTruthy();
    expect(button("NDP 支付")).toBeTruthy();
    expect(button("其他方式")).toBeTruthy();
    await click("现金支付");
    await waitFor(() => expect(mocks.selectPaymentMethod).toHaveBeenCalledWith(88, { method: "cash", idempotencyKey: expect.stringMatching(/^[a-f0-9]{32}$/) }));
    await waitFor(() => expect(container.textContent).toContain("等待技师确认收款"));
    expect(container.textContent).not.toContain("服务与结算已完成");
  });

  it("keeps payment actions hidden while checkout is loading and until the exact pending snapshot arrives", async () => {
    const pendingCheckout = deferred<OrderCheckout>();
    mocks.getOrder.mockResolvedValue(makeOrder("awaitingCheckout"));
    mocks.getCheckout.mockReturnValue(pendingCheckout.promise);
    await render();
    expect(container.textContent).toContain("正在加载正式结算");
    expect(container.textContent).not.toContain("现金支付");
    expect(container.textContent).not.toContain("NDP 支付");
    pendingCheckout.resolve(checkout);
    await waitFor(() => expect(button("现金支付")).toBeTruthy());
  });

  it("shows checkout failure with a read-only retry and no payment actions", async () => {
    mocks.getOrder.mockResolvedValue(makeOrder("awaitingCheckout"));
    mocks.getCheckout.mockRejectedValueOnce(new ApiClientError("error.order.checkout_unavailable", 50301, 503)).mockResolvedValueOnce(checkout);
    await render();
    await waitFor(() => expect(container.textContent).toContain("正式结算加载失败"));
    expect(container.textContent).not.toContain("现金支付");
    await click("重新加载正式结算");
    await waitFor(() => expect(button("现金支付")).toBeTruthy());
    expect(mocks.getCheckout).toHaveBeenCalledTimes(2);
  });

  it("hides payment actions immediately after selection and retries only the order projection when refetch fails", async () => {
    mocks.getOrder.mockResolvedValueOnce(makeOrder("awaitingCheckout")).mockRejectedValueOnce(new Error("projection unavailable")).mockResolvedValueOnce(makeOrder("awaitingPaymentConfirmation"));
    mocks.getCheckout.mockResolvedValue(checkout);
    mocks.selectPaymentMethod.mockResolvedValue({ ...checkout, status: "awaitingPaymentConfirmation", paymentMethod: "cash" });
    await render();
    await waitFor(() => expect(button("现金支付")).toBeTruthy());
    await click("现金支付");
    await waitFor(() => expect(container.textContent).toContain("订单状态读取失败"));
    expect(container.textContent).not.toContain("NDP 支付");
    expect(mocks.selectPaymentMethod).toHaveBeenCalledTimes(1);
    await click("重新读取订单状态");
    await waitFor(() => expect(container.textContent).toContain("等待技师确认收款"));
    expect(mocks.selectPaymentMethod).toHaveBeenCalledTimes(1);
  });

  it("uses the NDP ledger endpoint and renders completed payment evidence", async () => {
    mocks.getOrder.mockResolvedValueOnce(makeOrder("awaitingCheckout")).mockResolvedValueOnce(makeOrder("completed"));
    mocks.payWithNdp.mockResolvedValue({ ...checkout, status: "completed", paymentMethod: "ndp", paymentEvidence: "ndp_ledger" });
    mocks.getCheckout.mockResolvedValueOnce(checkout).mockResolvedValue({ ...checkout, status: "completed", paymentMethod: "ndp", paymentEvidence: "ndp_ledger" });
    await render();
    await waitFor(() => expect(container.textContent).toContain("NDP 支付"));
    await click("NDP 支付");
    await waitFor(() => expect(mocks.payWithNdp).toHaveBeenCalledWith(88, { idempotencyKey: expect.stringMatching(/^[a-f0-9]{32}$/) }));
    await waitFor(() => expect(container.textContent).toContain("NDP 账本已结算"));
    expect(container.textContent).not.toContain("提交评价");
  });

  it("selects other payment as a formal waiting method without fake completion", async () => {
    mocks.getOrder.mockResolvedValueOnce(makeOrder("awaitingCheckout")).mockResolvedValueOnce(makeOrder("awaitingPaymentConfirmation"));
    mocks.selectPaymentMethod.mockResolvedValue({ ...checkout, status: "awaitingPaymentConfirmation", paymentMethod: "other", otherMethod: { code: "other_manual", label: "其他方式" } });
    await render();
    await waitFor(() => expect(container.textContent).toContain("其他方式"));
    await click("其他方式");
    await waitFor(() => expect(mocks.selectPaymentMethod).toHaveBeenCalledWith(88, {
      method: "other",
      otherMethodCode: "other_manual",
      otherMethodLabel: "其他方式",
      idempotencyKey: expect.stringMatching(/^[a-f0-9]{32}$/)
    }));
    await waitFor(() => expect(container.textContent).toContain("等待技师确认收款"));
    expect(container.textContent).not.toContain("服务与结算已完成");
  });

  it("keeps the displayed formal state unchanged when a mutation is rejected", async () => {
    mocks.getOrder.mockResolvedValue(makeOrder("confirmed"));
    mocks.startService.mockRejectedValue(new ApiClientError("error.order.invalid_transition", 40912, 409));
    await render();
    await click("开始服务");
    await click("开始计算");
    await waitFor(() => expect(container.textContent).toContain("预约状态已经变化"));
    expect(container.textContent).toContain("服务验证码");
    expect(container.textContent).not.toContain("追加正式服务");
  });

  it("reuses the same opaque key when an ambiguous start is deliberately retried", async () => {
    mocks.getOrder.mockResolvedValue(makeOrder("confirmed"));
    mocks.startService.mockRejectedValueOnce(new Error("network lost after send")).mockResolvedValueOnce(makeOrder("inService"));
    await render();
    await click("开始服务");
    await click("开始计算");
    await waitFor(() => expect(mocks.startService).toHaveBeenCalledTimes(1));
    const firstKey = mocks.startService.mock.calls[0]?.[1]?.idempotencyKey;
    await waitFor(() => expect(button("开始服务").disabled).toBe(false));
    await click("开始服务");
    await click("开始计算");
    await waitFor(() => expect(mocks.startService).toHaveBeenCalledTimes(2));
    expect(mocks.startService.mock.calls[1]?.[1]?.idempotencyKey).toBe(firstKey);
    expect(firstKey).toMatch(/^[a-f0-9]{32}$/);
  });

  it("keeps a nonnumeric legacy route read-only without formal mutation calls", async () => {
    await render("/orders/legacy-1");
    expect(container.textContent).toContain("历史只读预约");
    expect(container.textContent).toContain("不支持开始、追加、结束、结算或评价操作");
    expect(mocks.getOrder).not.toHaveBeenCalled();
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });
});
