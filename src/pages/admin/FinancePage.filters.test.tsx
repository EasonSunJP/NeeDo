// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  backofficeRealDataApi,
  type BackofficeFinanceSettlementPayload
} from "../../api/backofficeRealData";
import { merchantPayrollCenterApi } from "../../api/merchantPayrollCenter";
import { FinancePage } from "./FinancePage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../components/admin/AdminLayout", () => ({
  AdminLayout: ({ children }: { children: ReactNode }) => <main>{children}</main>
}));

vi.mock("../../components/admin/ModuleShell", () => ({
  ModuleShell: ({ actions, children, title }: { actions?: ReactNode; children: ReactNode; title: string }) => (
    <section><h1>{title}</h1>{actions}{children}</section>
  )
}));

vi.mock("../../components/admin/DetailGrid", () => ({ DetailGrid: () => null }));
vi.mock("../../components/ui/Drawer", () => ({ Drawer: () => null }));
vi.mock("../../components/admin/NdpMetricValue", () => ({ NdpMetricValue: () => null }));
vi.mock("../../i18n/I18nProvider", () => ({ useI18n: () => ({ language: "zh" }) }));

function settlement(id: number, orderNo = `ND${String(id).padStart(18, "0")}`): BackofficeFinanceSettlementPayload {
  return {
    id,
    bookingOrderId: 1000 + id,
    orderType: "booking",
    orderNo,
    referenceType: "booking_order",
    referenceId: 1000 + id,
    status: "ready_for_payroll",
    shopId: 2000 + id,
    shopName: `Shop ${id}`,
    technicianProfileId: null,
    technicianName: null,
    ndpCurrency: "NDP",
    checkoutPaymentAmountNdp: null,
    estimatedServiceGmvJpy: 8800,
    platformCollectedServiceAmountJpy: 0,
    offlineReportedServiceAmountJpy: 8800,
    unknownOrUnreportedServiceAmountJpy: 0,
    serviceIncomeStatus: "confirmed",
    paymentChannel: "onsite",
    platformNdpRevenue: 500,
    cRequestFeeHoldNdp: 0,
    cRequestFeeActualNdp: 0,
    requestFeeNdpRevenue: 0,
    userRewardNdpCost: 100,
    pendingHoldNdp: 0,
    campaignDiscountNdp: 0,
    releasedNdp: 0,
    penaltyNdp: 0,
    compensationToUserNdp: 0,
    technicianEstimatedIncomeJpy: 4000,
    shopEstimatedGrossProfitJpy: 4300,
    appliedFeeRuleIds: [],
    moneyTimeline: [],
    moneyTimelineStatus: "complete",
    createdAt: "2026-09-10T03:00:00.000Z"
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function changeValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  act(() => {
    const descriptor = Object.getOwnPropertyDescriptor(
      element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype,
      "value"
    );
    descriptor?.set?.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLInputElement ? "input" : "change", { bubbles: true }));
  });
}

let container: HTMLDivElement;
let root: Root;

describe("FinancePage formal settlement filters", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    vi.spyOn(backofficeRealDataApi, "financeSettlements").mockImplementation(async (_scope, query) => {
      if (query?.keyword === "不存在的文本") {
        return { list: [], total: 0, page: 1, page_size: 20 };
      }

      return {
        list: [settlement(Number(query?.page ?? 1), "ND202609101341243926")],
        total: 41,
        page: Number(query?.page ?? 1),
        page_size: 20
      };
    });
    vi.spyOn(backofficeRealDataApi, "ndpSummary").mockResolvedValue({
      period: { date: "2026-09-13", timeZone: "Asia/Tokyo" },
      todayNdpConsumption: { ndp: 0, testNdp: 0 },
      platformNetRevenue: { ndp: 0, testNdp: 0 },
      requestFeeRevenue: { ndp: 0, testNdp: 0 },
      userRewardCost: { ndp: 0, testNdp: 0 },
      pendingHold: { ndp: 0, testNdp: 0 },
      campaignDiscount: { ndp: 0, testNdp: 0 },
      settleableNdp: 0
    });
    vi.spyOn(merchantPayrollCenterApi, "listBackofficePayRuns").mockResolvedValue({
      list: [], total: 0, page: 1, page_size: 20
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("submits settlement search and all three real filters to the formal API", async () => {
    await act(async () => root.render(<MemoryRouter><FinancePage /></MemoryRouter>));
    await flush();

    const search = container.querySelector<HTMLInputElement>('[aria-label="搜索结算"]');
    const status = container.querySelector<HTMLSelectElement>('[aria-label="状态"]');
    const period = container.querySelector<HTMLSelectElement>('[aria-label="周期"]');
    const city = container.querySelector<HTMLSelectElement>('[aria-label="城市"]');
    expect(search).not.toBeNull();
    expect(status).not.toBeNull();
    expect(period).not.toBeNull();
    expect(city).not.toBeNull();

    changeValue(search!, "ND202609101341243926");
    await act(async () => search!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" })));
    await flush();
    changeValue(status!, "ready_for_payroll");
    await flush();
    changeValue(period!, "week");
    await flush();
    changeValue(city!, "東京都");
    await flush();

    expect(backofficeRealDataApi.financeSettlements).toHaveBeenLastCalledWith("backoffice", {
      page: 1,
      pageSize: 20,
      keyword: "ND202609101341243926",
      status: "ready_for_payroll",
      period: "week",
      city: "東京都"
    });
  });

  it("uses authoritative server totals and resets pagination when a search is submitted", async () => {
    await act(async () => root.render(<MemoryRouter><FinancePage /></MemoryRouter>));
    await flush();

    const paginator = container.querySelector<HTMLElement>('[aria-label="结算分页"]');
    expect(paginator?.textContent).toContain("服务器共 41 条，第 1 / 3 页");
    const next = Array.from(paginator?.querySelectorAll("button") ?? []).find((button) => button.textContent === "下一页");
    await act(async () => next?.click());
    await flush();
    expect(backofficeRealDataApi.financeSettlements).toHaveBeenLastCalledWith(
      "backoffice",
      expect.objectContaining({ page: 2, pageSize: 20 })
    );

    const search = container.querySelector<HTMLInputElement>('[aria-label="搜索结算"]');
    changeValue(search!, "不存在的文本");
    await act(async () => search!.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" })));
    await flush();
    expect(backofficeRealDataApi.financeSettlements).toHaveBeenLastCalledWith(
      "backoffice",
      expect.objectContaining({ keyword: "不存在的文本", page: 1 })
    );
    expect(container.textContent).toContain("当前没有符合条件的正式结算记录");
    expect(container.textContent).toContain("服务器共 0 条，第 1 / 1 页");
    expect(container.textContent).not.toContain("ND202609101341243926");
  });
});
