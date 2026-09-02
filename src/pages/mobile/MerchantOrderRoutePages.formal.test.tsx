// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BookingOrder, OrderCheckout } from "../../features/booking/api";

const mocks = vi.hoisted(() => ({
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
  mapCoreTechnicianToTechnician: (value: { id: number; displayName: string }) => ({ id: String(value.id), name: value.displayName })
}));
vi.mock("../../state/entityStore", () => ({ useEntityStore: () => ({ customers: [], stores: [], technicians: [] }) }));
vi.mock("../../state/scheduleStore", () => ({
  addSharedSchedules: vi.fn(),
  removeSharedSchedule: vi.fn(),
  useScheduleStore: () => ({ schedules: [] })
}));
vi.mock("../../components/mobile/MobileShell", () => ({ MobileShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../../components/mobile/MobileFullscreenPage", () => ({ MobileFullscreenPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("../../components/mobile/MobileFullscreenHeader", () => ({ MobileFullscreenHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("../../components/mobile/MobileBottomActionBar", () => ({ MobileBottomActionBar: ({ children }: { children: React.ReactNode }) => <footer>{children}</footer> }));
vi.mock("../../components/mobile/ContactEventTimeline", () => ({ ContactEventTimelinePanel: ({ title }: { title: string }) => <section>{title}</section> }));
vi.mock("../../components/ui/Button", () => ({
  Button: ({ children, to }: { children: React.ReactNode; to?: string }) => to ? <a href={to}>{children}</a> : <button type="button">{children}</button>
}));
vi.mock("../../shared/order-detail/OrderDynamicStatusCard", () => ({ OrderDynamicStatusCard: ({ order }: { order: { status: string } }) => <div>{order.status}</div> }));
vi.mock("../../shared/profile-card", () => ({
  SocialProfileMiniCard: ({ customer, data, store, technician }: { customer?: { name: string }; data?: { displayName: string }; store?: { name: string }; technician?: { name: string } }) => (
    <article>{customer?.name ?? data?.displayName ?? store?.name ?? technician?.name}</article>
  ),
  buildServiceMiniCardData: (service: { name: string }) => ({ displayName: service.name })
}));

import { MerchantOrderDetailRoutePage } from "./MerchantOrderRoutePages";

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

const checkout: OrderCheckout = {
  id: 9,
  orderId: order.id,
  status: "completed",
  baseAmountJpy: 8_000,
  addOnAmountJpy: 6_500,
  discountAmountJpy: 0,
  checkoutAmountJpy: 14_500,
  payableNdp: 14_500,
  rate: { ruleId: 1, publicId: "rate-1", version: 1, ndpUnits: 1, jpyUnits: 1, effectiveFrom: "2026-09-01T00:00:00.000Z" },
  calculation: { formula: "base_plus_accepted_add_ons_minus_discount", baseAmountJpy: 8_000, acceptedAddOnIds: [3], addOnAmountJpy: 6_500, discountAmountJpy: 0, checkoutAmountJpy: 14_500, rateFormula: "ceil(jpy_times_ndp_units_divided_by_jpy_units)" },
  paymentMethod: "ndp",
  paymentSelectedAt: "2026-09-02T18:39:00.000Z",
  otherMethod: null,
  paymentEvidence: "ndp_ledger",
  receiptConfirmedAt: "2026-09-02T18:39:00.000Z",
  receiptConfirmationReason: null,
  createdAt: "2026-09-02T18:38:00.000Z",
  updatedAt: "2026-09-02T18:39:00.000Z"
};

describe("MerchantOrderDetailRoutePage formal order", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.getOrder.mockResolvedValue(order);
    mocks.getCheckout.mockResolvedValue(checkout);
    mocks.listMerchantOrders.mockResolvedValue({
      list: [{ id: order.id, customerProfileId: 7, customerName: "LifeDance 管理员" }],
      total: 1,
      page: 1,
      page_size: 1
    });
    mocks.getCustomerProfile.mockResolvedValue({ id: 7, displayName: "LifeDance 管理员" });
    mocks.getServiceDetail.mockResolvedValue({ id: 463, name: order.serviceName });
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
  });
});
