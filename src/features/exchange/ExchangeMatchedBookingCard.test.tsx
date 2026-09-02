// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getExchangeMatching } from "./api";
import { ExchangeMatchedBookingCard } from "./ExchangeMatchedBookingCard";

vi.mock("./api", () => ({ getExchangeMatching: vi.fn() }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

describe("ExchangeMatchedBookingCard", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.resetAllMocks();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("renders only the provider-scoped persisted order and technician route", async () => {
    vi.mocked(getExchangeMatching).mockResolvedValue({
      exchangePostId: 42,
      status: "matched",
      version: 8,
      effectiveTargetProviderCount: 2,
      effectiveBudgetMaxJpy: 20_000,
      selectedQuoteTotalJpy: 19_000,
      matchedAt: "2026-09-03T04:00:00.000Z",
      viewer: { canSelect: false, canCreateBookings: false },
      participants: [{
        exchangeClaimId: 1,
        provider: { publicId: "NT0000001", displayName: "技师一", avatarUrl: null },
        shop: { id: 7, name: "GINZA Calm Body Lab" },
        technician: { profileId: 1, publicId: "NT0000001", displayName: "技师一" },
        service: { ref: "technician:1", name: "真实服务", durationMinutes: 60 },
        scheduleSlotId: 91,
        quoteAmountJpy: 9_000,
        currency: "JPY",
        estimatedStartsAt: "2026-09-03T04:00:00.000Z",
        estimatedEndsAt: "2026-09-03T05:00:00.000Z",
        matchedAt: "2026-09-03T04:00:00.000Z",
        booking: { orderId: 501, orderNo: "ND501", status: "pending" }
      }]
    });

    await act(async () => root.render(<ExchangeMatchedBookingCard context="technician" language="zh" postId="42" />));
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 0)));

    expect(document.body.textContent).toContain("ND501");
    expect(document.body.querySelector<HTMLAnchorElement>('a[aria-label="查看订单"]')?.getAttribute("href")).toBe("/technician/orders/501");
    expect(document.body.textContent).not.toContain("ND502");
    expect(document.body.textContent).not.toContain("其他入选者");
  });

  it("explains a matching read failure and offers an accessible retry", async () => {
    vi.mocked(getExchangeMatching).mockRejectedValueOnce(new Error("offline"));

    await act(async () => root.render(<ExchangeMatchedBookingCard context="technician" language="zh" postId="42" />));
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 0)));

    expect(document.body.querySelector('[role="alert"]')?.textContent).toBe("无法读取已匹配的预约，请重试。");
    expect(document.body.querySelector<HTMLButtonElement>("button")?.textContent).toBe("重试创建预约");
  });
});
