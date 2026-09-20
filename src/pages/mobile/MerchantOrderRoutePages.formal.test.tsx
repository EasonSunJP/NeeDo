// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../../api/httpClient";
import type { BookingOrder, OrderCheckout } from "../../features/booking/api";
import type { CoreServiceDetail } from "../../features/core-read/api";
import merchantOrderRouteSource from "./MerchantOrderRoutePages.tsx?raw";

const mocks = vi.hoisted(() => ({
  cancelOrder: vi.fn(),
  editMerchantOrder: vi.fn(),
  exchangeLinked: false,
  getCheckout: vi.fn(),
  getCustomerProfile: vi.fn(),
  getOrder: vi.fn(),
  getServiceDetail: vi.fn(),
  getShopDetail: vi.fn(),
  getTechnicianDetail: vi.fn(),
  listMerchantOrders: vi.fn()
}));

vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ session: { linkedStoreId: "16" } }) }));
vi.mock("../../api/backofficeRealData", () => ({
  backofficeRealDataApi: { orders: mocks.listMerchantOrders }
}));
vi.mock("../../features/booking/api", async () => {
  const actual = await vi.importActual<typeof import("../../features/booking/api")>("../../features/booking/api");
  return {
    ...actual,
    bookingApi: {
      cancelOrder: mocks.cancelOrder,
      editMerchantOrder: mocks.editMerchantOrder,
      getCheckout: mocks.getCheckout,
      getOrder: mocks.getOrder
    }
  };
});
vi.mock("../../features/core-read/api", () => ({
  coreReadApi: {
    getCustomerProfile: mocks.getCustomerProfile,
    getServiceDetail: mocks.getServiceDetail,
    getShopDetail: mocks.getShopDetail,
    getTechnicianDetail: mocks.getTechnicianDetail
  },
  mapCoreCustomerToCustomer: (value: { id: number; displayName: string }) => ({ id: String(value.id), name: value.displayName }),
  mapCoreServiceToServiceItem: (value: { id: number; name: string }) => ({ id: String(value.id), name: value.name, tags: [] }),
  mapCoreShopToStore: (value: { id: number; name: string }) => ({ id: String(value.id), name: value.name }),
  mapCoreTechnicianToTechnician: (value: { id: number; publicId: string; displayName: string }) => ({ id: String(value.id), systemId: value.publicId, name: value.displayName })
}));
vi.mock("../../state/entityStore", () => ({ useEntityStore: () => ({ customers: [], stores: [], technicians: [] }) }));
vi.mock("../../state/scheduleStore", () => ({
  addSharedSchedules: vi.fn(),
  removeSharedSchedule: vi.fn(),
  useScheduleStore: () => ({ schedules: [] })
}));
vi.mock("../../components/mobile/MobileShell", () => ({ MobileShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../../components/mobile/MobileFullscreenPage", () => ({ MobileFullscreenPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("../../components/mobile/MobileFullscreenHeader", () => ({
  MobileFullscreenHeader: ({ action, closeLabel, onBack, onClose, title }: { action?: React.ReactNode; closeLabel?: string; onBack?: () => void; onClose?: () => void; title: string }) => (
    <header>
      <button aria-label="返回" onClick={onBack} type="button">返回</button>
      <h1>{title}</h1>
      {action}
      <button aria-label={closeLabel} onClick={onClose} type="button">关闭</button>
    </header>
  )
}));
vi.mock("../../components/mobile/MobileBottomActionBar", () => ({ MobileBottomActionBar: ({ children }: { children: React.ReactNode }) => <footer>{children}</footer> }));
vi.mock("../../components/client-ui/AppScaffold", () => ({
  AppIcon: ({ name }: { name: string }) => <span data-app-icon={name} />,
  AppTopBar: ({ actions, closeLabel, onBack, onClose, title }: { actions?: React.ReactNode; closeLabel?: string; onBack?: () => void; onClose?: () => void; title: string }) => (
    <header>
      <button aria-label="返回" onClick={onBack} type="button">返回</button>
      <h1>{title}</h1>
      {actions}
      <button aria-label={closeLabel} onClick={onClose} type="button">关闭</button>
    </header>
  ),
  PageScaffold: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));
vi.mock("../../components/mobile/ContactEventTimeline", () => ({ ContactEventTimelinePanel: ({ title }: { title: string }) => <section>{title}</section> }));
vi.mock("../../features/exchange/ExchangeOrderCancellationPanel", () => ({
  ExchangeOrderCancellationPanel: ({
    onCancellationChange,
    onLinkedChange,
    orderId
  }: {
    onCancellationChange?: (payload: { orderId: number; orderStatus: "cancelled" }) => void;
    onLinkedChange?: (linked: boolean) => void;
    orderId: number;
  }) => {
    useEffect(() => onLinkedChange?.(mocks.exchangeLinked), [onLinkedChange]);

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
vi.mock("../../components/ui/Button", () => ({
  Button: ({ children, disabled, onClick, to, variant: _variant }: { children: React.ReactNode; disabled?: boolean; onClick?: () => void; to?: string; variant?: string }) => to && !disabled ? <a href={to}>{children}</a> : <button disabled={disabled} onClick={onClick} type="button">{children}</button>
}));
vi.mock("../../shared/order-detail/OrderDynamicStatusCard", () => ({ OrderDynamicStatusCard: ({ order }: { order: { status: string } }) => <div>{order.status}</div> }));
vi.mock("../../shared/profile-card", () => ({
  SocialProfileMiniCard: ({ customer, data, store, technician }: { customer?: { name: string }; data?: { displayName: string }; store?: { name: string }; technician?: { name: string } }) => (
    <article>{customer?.name ?? data?.displayName ?? store?.name ?? technician?.name}</article>
  ),
  buildServiceMiniCardData: (service: { name: string }) => ({ displayName: service.name }),
  getScopedTechnicianDynamicPath: (scope: string, technician: { id: string; systemId?: string }) => `/${scope}/profiles/technician/${technician.systemId ?? technician.id}`
}));

import { buildFormalOrderPersonCard, MerchantOrderChangeRoutePage, MerchantOrderDetailRoutePage } from "./MerchantOrderRoutePages";

const formalOrderDetailSource = merchantOrderRouteSource.slice(
  merchantOrderRouteSource.indexOf("function FormalMerchantOrderDetailContent"),
  merchantOrderRouteSource.indexOf("function MerchantOrderDetailContent")
);

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const order: BookingOrder = {
  id: 46397,
  orderNo: "ND202609021800398191",
  orderType: "booking",
  status: "completed",
  paymentMethod: "ndp",
  paymentStatus: "confirmed",
  paymentAmountJpy: 14_500,
  paymentConfirmedById: 1,
  paymentConfirmedAt: "2026-09-02T18:39:00.000Z",
  paymentReference: null,
  paymentNote: null,
  paymentRefundedById: null,
  paymentRefundedAt: null,
  paymentRefundReference: null,
  paymentRefundReason: null,
  customerUserId: 1,
  serviceId: 463,
  technicianServiceId: null,
  shopId: 16,
  technicianProfileId: 28,
  scheduleSlotId: 1,
  fulfillmentMode: "store",
  serviceName: "ボディケア 60分",
  shopName: "LifeDance Wellness 渋谷",
  technicianName: "佐藤 美咲",
  priceAmount: "14500.00",
  currency: "JPY",
  startsAt: "2026-09-03T05:00:00.000Z",
  endsAt: "2026-09-03T06:00:00.000Z",
  note: null,
  cancelReason: null,
  createdAt: "2026-09-02T18:00:00.000Z",
  updatedAt: "2026-09-02T18:39:00.000Z",
  serviceSession: null,
  statusHistory: []
};

describe("formal merchant order detail layout", () => {
  it("keeps the action bar viewport-docked while the safe-area padded detail body scrolls independently", () => {
    expect(formalOrderDetailSource).toContain("<MobileFullscreenPage>");
    expect(formalOrderDetailSource).toContain('showSpacer={false}');
    expect(formalOrderDetailSource).toContain('data-testid="merchant-order-detail-scroll-region"');
    expect(formalOrderDetailSource).toContain("min-h-0 flex-1");
    expect(formalOrderDetailSource).toContain("overflow-y-auto");
    expect(formalOrderDetailSource).toContain("overscroll-contain");
    expect(formalOrderDetailSource).toContain("[-webkit-overflow-scrolling:touch]");
    expect(formalOrderDetailSource).toContain("pb-[calc(env(safe-area-inset-bottom,0px)+10rem)]");
    expect(formalOrderDetailSource).toContain("<MobileBottomActionBar");
    expect(formalOrderDetailSource).not.toContain("<PageScaffold");
  });
});

const checkout: OrderCheckout = {
  id: 9,
  orderId: order.id,
  status: "completed",
  baseAmountJpy: 8_000,
  addOnAmountJpy: 6_500,
  travelFareAmountJpy: 0,
  discountAmountJpy: 0,
  checkoutAmountJpy: 14_500,
  payableNdp: 14_500,
  availablePaymentMethods: ["cash", "ndp"],
  rate: { ruleId: 1, publicId: "rate-1", version: 1, ndpUnits: 1, jpyUnits: 1, effectiveFrom: "2026-09-01T00:00:00.000Z" },
  calculation: { formula: "base_plus_accepted_add_ons_plus_travel_fare_minus_discount", baseAmountJpy: 8_000, acceptedAddOnIds: [3], addOnAmountJpy: 6_500, travelFareAmountJpy: 0, discountAmountJpy: 0, checkoutAmountJpy: 14_500, rateFormula: "ceil(jpy_times_ndp_units_divided_by_jpy_units)" },
  paymentMethod: "ndp",
  paymentSelectedAt: "2026-09-02T18:39:00.000Z",
  otherMethod: null,
  paymentEvidence: "ndp_ledger",
  receiptConfirmedAt: "2026-09-02T18:39:00.000Z",
  receiptConfirmationReason: null,
  createdAt: "2026-09-02T18:38:00.000Z",
  updatedAt: "2026-09-02T18:39:00.000Z"
};

const service: CoreServiceDetail = {
  id: 463,
  publicId: "svc0000000463",
  name: order.serviceName,
  description: "正式服务说明",
  category: {
    id: 1,
    code: "massage",
    name: "按摩",
    nameJa: "マッサージ",
    nameEn: "Massage",
    parentId: null,
    iconUrl: null,
    sortOrder: 1,
    isActive: true,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt
  },
  shop: {
    id: 16,
    publicId: "shop0000000016",
    name: order.shopName,
    city: "东京都",
    address: "东京都渋谷区",
    coverUrl: null,
    reviewSummary: { ratingAverage: "5.0", reviewCount: 1, latestReviewAt: null, highlights: [] },
    completedOrderCount: 0,
    favoriteCount: 0,
    shareCount: 0,
    serviceCategories: [],
    businessKeywords: []
  },
  technician: null,
  city: "东京都",
  priceAmount: order.priceAmount,
  currency: order.currency,
  durationMinutes: 60,
  usageCount: 1,
  coverUrl: null,
  reviewSummary: { ratingAverage: "5.0", reviewCount: 1, latestReviewAt: null, highlights: [] },
  serviceMode: "store",
  mediaAssets: [],
  createdAt: order.createdAt,
  updatedAt: order.updatedAt
};

describe("MerchantOrderDetailRoutePage formal order", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.getOrder.mockResolvedValue(order);
    mocks.editMerchantOrder.mockResolvedValue(order);
    mocks.cancelOrder.mockImplementation(async () => ({ ...order, status: "cancelled" }));
    mocks.exchangeLinked = false;
    mocks.getCheckout.mockResolvedValue(checkout);
    mocks.listMerchantOrders.mockResolvedValue({
      list: [{ id: order.id, customerProfileId: 7, customerName: "LifeDance 管理员" }],
      total: 1,
      page: 1,
      page_size: 1
    });
    mocks.getCustomerProfile.mockResolvedValue({ id: 7, displayName: "LifeDance 管理员" });
    mocks.getServiceDetail.mockResolvedValue(service);
    mocks.getShopDetail.mockResolvedValue({ id: 16, name: order.shopName });
    mocks.getTechnicianDetail.mockResolvedValue({ id: 28, displayName: order.technicianName });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("loads a numeric formal order instead of reading the empty legacy order array", async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/merchant/orders/46397"]}>
          <Routes>
            <Route path="/merchant/orders/:orderId" element={<MerchantOrderDetailRoutePage />} />
          </Routes>
        </MemoryRouter>
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.getOrder).toHaveBeenCalledWith(46397);
    expect(container.textContent).toContain("ND202609021800398191");
    expect(container.textContent).toContain("LifeDance 管理员");
    expect(container.textContent).toContain("佐藤 美咲");
    expect(container.textContent).toContain("￥14,500");
    expect(container.textContent).toContain("NDP 账本已结算");
    expect(container.textContent).toContain("预约详情");
    expect(container.textContent).not.toContain("预约订单详情");
    expect(container.querySelector('[aria-label="关闭预约详情"]')).not.toBeNull();
    expect(container.textContent).toContain("联系用户");
    expect(container.textContent).toContain("联系技师");
    expect(container.textContent).not.toContain("服务验证码");
    expect(container.textContent).not.toContain("服务开始");
    expect(Array.from(container.querySelectorAll("button")).some((item) => item.textContent === "追加服务")).toBe(false);
  });

  it("requires the shared red warning before force-cancelling a normal booking", async () => {
    const confirmedOrder = {
      ...order,
      status: "confirmed" as const,
      paymentStatus: "pending" as const,
      paymentMethod: "onsite" as const,
      paymentAmountJpy: 0,
      serviceVerificationCode: "392104"
    };
    mocks.getOrder.mockResolvedValue(confirmedOrder);
    mocks.cancelOrder.mockResolvedValue({ ...confirmedOrder, status: "cancelled" });

    await act(async () => {
      root.render(<MemoryRouter initialEntries={["/merchant/orders/46397"]}><Routes><Route path="/merchant/orders/:orderId" element={<MerchantOrderDetailRoutePage />} /></Routes></MemoryRouter>);
      await Promise.resolve();
      await Promise.resolve();
    });

    const cancelButton = Array.from(container.querySelectorAll("button")).find((item) => item.textContent === "取消预约");
    expect(cancelButton).not.toBeUndefined();
    expect(container.textContent).not.toContain("服务验证码");

    await act(async () => cancelButton!.click());
    expect(container.querySelector('[role="alertdialog"]')?.textContent).toMatch(/降低接单率数值|lower the acceptance-rate metric/u);

    const confirmButton = Array.from(container.querySelectorAll("button")).find((item) => /确定取消预约|Cancel booking/u.test(item.textContent ?? ""));
    await act(async () => confirmButton!.click());

    expect(mocks.cancelOrder).toHaveBeenCalledWith(order.id, "商户从预约详情强制取消");
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it("does not offer force cancellation for an Exchange-linked booking", async () => {
    mocks.exchangeLinked = true;
    mocks.getOrder.mockResolvedValue({ ...order, status: "confirmed", paymentStatus: "pending", paymentMethod: "onsite" });

    await act(async () => {
      root.render(<MemoryRouter initialEntries={["/merchant/orders/46397"]}><Routes><Route path="/merchant/orders/:orderId" element={<MerchantOrderDetailRoutePage />} /></Routes></MemoryRouter>);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(Array.from(container.querySelectorAll("button")).some((item) => item.textContent === "取消预约")).toBe(false);
  });

  it("keeps the warning open and shows the formal API error when cancellation fails", async () => {
    mocks.getOrder.mockResolvedValue({ ...order, status: "confirmed", paymentStatus: "pending", paymentMethod: "onsite" });
    mocks.cancelOrder.mockRejectedValue(
      new ApiClientError("error.order.invalid_transition", 40912, 409)
    );

    await act(async () => {
      root.render(<MemoryRouter initialEntries={["/merchant/orders/46397"]}><Routes><Route path="/merchant/orders/:orderId" element={<MerchantOrderDetailRoutePage />} /></Routes></MemoryRouter>);
      await Promise.resolve();
      await Promise.resolve();
    });

    const cancelButton = Array.from(container.querySelectorAll("button")).find((item) => item.textContent === "取消预约");
    await act(async () => cancelButton!.click());
    const confirmButton = Array.from(container.querySelectorAll("button")).find((item) => /确定取消预约|Cancel booking/u.test(item.textContent ?? ""));
    await act(async () => confirmButton!.click());

    expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(
      /订单状态已经变化|order status(?: has changed|已经变化)/iu
    );
  });

  it("shows the order price before payment and does not invent payment selection", async () => {
    mocks.getOrder.mockResolvedValue({ ...order, status: "confirmed", paymentStatus: "pending", paymentMethod: "onsite", paymentAmountJpy: 0 });
    await act(async () => {
      root.render(<MemoryRouter initialEntries={["/merchant/orders/46397"]}><Routes><Route path="/merchant/orders/:orderId" element={<MerchantOrderDetailRoutePage />} /></Routes></MemoryRouter>);
    });
    const amountLabel = [...container.querySelectorAll("p")].find((item) => item.textContent === "金额");
    expect(amountLabel?.nextElementSibling?.textContent).toBe("￥14,500");
    expect(container.textContent).toContain("到店支付");
    expect(container.textContent).not.toContain("其他方式");
  });

  it("uses a persisted other checkout method before the original booking method", async () => {
    mocks.getCheckout.mockResolvedValue({ ...checkout, paymentMethod: "other", otherMethod: { code: "voucher", label: "店铺券" } });
    await act(async () => root.render(<MemoryRouter initialEntries={["/merchant/orders/46397"]}><Routes><Route path="/merchant/orders/:orderId" element={<MerchantOrderDetailRoutePage />} /></Routes></MemoryRouter>));
    expect(container.textContent).toContain("店铺券");
  });

  it("maps only persisted person details without generated KYC, levels or social counts", () => {
    const card = buildFormalOrderPersonCard({ id: 7, displayName: "真实客户", city: null, bio: null, avatarUrl: null, reviewSummary: { ratingAverage: "0", reviewCount: 0 } }, "user");
    expect(card.kycVerified).not.toBe(true);
    expect(card.levelLabel).toBe("");
    expect(card.regionLabel).toBe("");
    expect(card.scoreValue).toBe("—");
  });

  it("immediately adopts an accepted Exchange cancellation and keeps its terminal record visible", async () => {
    mocks.getOrder.mockResolvedValue({
      ...order,
      status: "pending",
      paymentStatus: "pending",
      paymentMethod: "onsite",
      paymentConfirmedById: null,
      paymentConfirmedAt: null
    });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/merchant/orders/46397"]}>
          <Routes>
            <Route path="/merchant/orders/:orderId" element={<MerchantOrderDetailRoutePage />} />
          </Routes>
        </MemoryRouter>
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const decision = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes("模拟双方同意取消"));
    expect(decision).not.toBeUndefined();
    await act(async () => decision!.click());

    expect(container.textContent).toContain("已取消");
    expect(container.textContent).toContain("模拟双方同意取消");
  });

  it("keeps a historical completed order visible when no checkout record exists", async () => {
    mocks.getCheckout.mockRejectedValueOnce(
      new ApiClientError("error.order.not_found", 404, 404)
    );

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/merchant/orders/46397"]}>
          <Routes>
            <Route path="/merchant/orders/:orderId" element={<MerchantOrderDetailRoutePage />} />
          </Routes>
        </MemoryRouter>
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.getOrder).toHaveBeenCalledWith(46397);
    expect(container.textContent).toContain("ND202609021800398191");
    expect(container.textContent).toContain("LifeDance 管理员");
    expect(container.textContent).not.toContain("本店订单加载失败");
    expect(container.textContent).not.toContain("正式结算");
  });

  it("hides the merchant change entry after an order is cancelled", async () => {
    mocks.getOrder.mockResolvedValue({ ...order, status: "cancelled" });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/merchant/orders/46397"]}>
          <Routes>
            <Route path="/merchant/orders/:orderId" element={<MerchantOrderDetailRoutePage />} />
          </Routes>
        </MemoryRouter>
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(Array.from(container.querySelectorAll("a")).some((item) => item.textContent === "变更")).toBe(false);
  });

  it("keeps a cancelled order read-only when the merchant opens the change URL directly", async () => {
    mocks.getOrder.mockResolvedValue({ ...order, status: "cancelled" });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/merchant/orders/46397/change"]}>
          <Routes>
            <Route path="/merchant/orders/:orderId/change" element={<MerchantOrderChangeRoutePage />} />
          </Routes>
        </MemoryRouter>
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[role="status"]')?.textContent).toContain("已取消订单不可变更业务数据");
    expect(Array.from(container.querySelectorAll("input, select, textarea")).every((field) => field.hasAttribute("disabled"))).toBe(true);
    const saveButton = Array.from(container.querySelectorAll("button")).find((item) => item.textContent === "保存变更");
    expect(saveButton?.disabled).toBe(true);
    await act(async () => saveButton?.click());
    expect(mocks.editMerchantOrder).not.toHaveBeenCalled();
  });

  it("keeps confirmed orders editable under the existing merchant rule", async () => {
    const confirmed = {
      ...order,
      status: "confirmed" as const,
      paymentMethod: "onsite" as const,
      paymentStatus: "pending" as const
    };
    mocks.getOrder.mockResolvedValue(confirmed);
    mocks.editMerchantOrder.mockResolvedValue(confirmed);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/merchant/orders/46397/change"]}>
          <Routes>
            <Route path="/merchant/orders/:orderId/change" element={<MerchantOrderChangeRoutePage />} />
            <Route path="/merchant/orders/:orderId" element={<p>saved</p>} />
          </Routes>
        </MemoryRouter>
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(Array.from(container.querySelectorAll("input, select, textarea")).every((field) => !field.hasAttribute("disabled"))).toBe(true);
    const saveButton = Array.from(container.querySelectorAll("button")).find((item) => item.textContent === "保存变更");
    expect(saveButton?.disabled).toBe(false);
    await act(async () => saveButton?.click());
    expect(mocks.editMerchantOrder).toHaveBeenCalledWith(order.id, {
      priceAmountJpy: order.paymentAmountJpy,
      paymentMethod: "onsite",
      note: null
    });
  });
});
