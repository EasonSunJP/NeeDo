// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  backofficeRealDataApi,
  type BackofficeOrderPayload
} from "../../api/backofficeRealData";
import { OrdersAdminPage } from "./OrdersAdminPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../components/admin/AdminLayout", () => ({
  AdminLayout: ({ children }: { children: ReactNode }) => <main>{children}</main>
}));

vi.mock("../../components/admin/ModuleShell", () => ({
  ModuleShell: ({ actions, children, title }: { actions?: ReactNode; children: ReactNode; title: string }) => (
    <section><h1>{title}</h1>{actions}{children}</section>
  )
}));

vi.mock("../../components/admin/AdminEventTimeline", () => ({
  AdminEventTimeline: () => null
}));

vi.mock("../../components/admin/DetailGrid", () => ({
  DetailGrid: () => null
}));

vi.mock("../../components/admin/OrderRelatedEntityDrawer", () => ({
  OrderRelatedEntityDrawer: () => null
}));

vi.mock("../../components/ui/Badge", () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>
}));

vi.mock("../../components/ui/Drawer", () => ({
  Drawer: () => null
}));

function order(id: number): BackofficeOrderPayload {
  return {
    id,
    orderNo: `ND${String(id).padStart(12, "0")}`,
    status: "pending",
    paymentStatus: "pending",
    customerUserId: 1000 + id,
    customerProfileId: 2000 + id,
    customerName: `Customer ${id}`,
    serviceId: 3000 + id,
    serviceName: `Service ${id}`,
    shopId: 4000 + id,
    shopName: `Shop ${id}`,
    technicianProfileId: null,
    technicianNeedoId: null,
    technicianName: null,
    fulfillmentMode: "store",
    priceAmount: 8800,
    totalAmountJpy: 8800,
    amountSource: "order_payment",
    currency: "JPY",
    paymentMethod: "onsite",
    effectivePaymentMethod: "onsite",
    otherMethodCode: null,
    otherMethodLabel: null,
    checkoutPaymentAmountNdp: null,
    ndpCurrency: null,
    startsAt: "2026-09-13T01:00:00.000Z",
    endsAt: "2026-09-13T02:00:00.000Z",
    note: null,
    cancelReason: null,
    createdAt: "2026-09-12T23:00:00.000Z",
    updatedAt: "2026-09-12T23:00:00.000Z"
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function buttons(label: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).filter(
    (button) => button.textContent?.trim() === label
  );
}

let container: HTMLDivElement;
let root: Root;

describe("OrdersAdminPage server pagination", () => {
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

  it("renders only the authoritative server paginator and never a current-page total", async () => {
    vi.spyOn(backofficeRealDataApi, "orders").mockResolvedValue({
      list: [order(1), order(2)],
      total: 20_476,
      page: 1,
      page_size: 20
    });

    await act(async () => root.render(<MemoryRouter><OrdersAdminPage /></MemoryRouter>));
    await flush();

    expect(container.textContent).toContain("服务器共 20476 条，第 1 / 1024 页");
    expect(container.textContent).not.toContain("共 2 条，第 1 / 1 页");
    expect(buttons("上一页")).toHaveLength(1);
    expect(buttons("下一页")).toHaveLength(1);
    expect(buttons("下一页")[0]?.disabled).toBe(false);
    expect(container.querySelector('[aria-label="订单编号 排序与筛选"]')).toBeNull();
  });

  it("loads successive server pages and uses the response page size for the page count", async () => {
    vi.spyOn(backofficeRealDataApi, "orders").mockImplementation(async (_scope, query) => {
      const page = Number(query?.page ?? 1);
      return {
        list: Array.from({ length: page === 3 ? 1 : 10 }, (_, index) => order((page - 1) * 10 + index + 1)),
        total: 21,
        page,
        page_size: 10
      };
    });

    await act(async () => root.render(<MemoryRouter><OrdersAdminPage /></MemoryRouter>));
    await flush();
    expect(container.textContent).toContain("服务器共 21 条，第 1 / 3 页");

    await act(async () => buttons("下一页")[0]?.click());
    await flush();
    expect(backofficeRealDataApi.orders).toHaveBeenLastCalledWith("backoffice", {
      page: 2,
      pageSize: 20,
      status: undefined
    });
    expect(container.textContent).toContain("服务器共 21 条，第 2 / 3 页");

    await act(async () => buttons("下一页")[0]?.click());
    await flush();
    expect(backofficeRealDataApi.orders).toHaveBeenLastCalledWith("backoffice", {
      page: 3,
      pageSize: 20,
      status: undefined
    });
    expect(container.textContent).toContain("服务器共 21 条，第 3 / 3 页");
    expect(buttons("下一页")[0]?.disabled).toBe(true);
  });
});
