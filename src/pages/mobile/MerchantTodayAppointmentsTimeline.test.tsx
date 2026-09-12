// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapBookingOrderToDomainOrder, type BookingOrder } from "../../features/booking/api";
import { translateText } from "../../i18n/translations";
import type { Order } from "../../types/domain";
import { MerchantTodayAppointmentsTimeline, MerchantWorkbenchMetrics } from "./MerchantPortalPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const localeState = vi.hoisted(() => ({ language: "zh" }));

vi.mock("../../i18n/I18nProvider", () => ({
  useOptionalI18n: () => localeState
}));

function createMappedBookingOrder({
  id,
  customerDisplayName,
  serviceName,
  shopName,
  startsAt,
  technicianName
}: {
  id: number;
  customerDisplayName: string;
  serviceName: string;
  shopName: string;
  startsAt: string;
  technicianName: string;
}) {
  const bookingOrder: BookingOrder = {
    id,
    orderNo: `NDO-${id}`,
    orderType: "booking",
    status: "confirmed",
    paymentMethod: "onsite",
    paymentStatus: "confirmed",
    paymentAmountJpy: 8_800,
    paymentConfirmedById: 9,
    paymentConfirmedAt: startsAt,
    paymentReference: null,
    paymentNote: null,
    paymentRefundedById: null,
    paymentRefundedAt: null,
    paymentRefundReference: null,
    paymentRefundReason: null,
    customerUserId: id + 100,
    customer: {
      userId: id + 100,
      profileId: id + 200,
      publicId: `u${String(id + 100).padStart(10, "0")}`,
      displayName: customerDisplayName,
      avatarUrl: null,
      membershipLevel: "regular",
      ratingAverage: "4.90",
      reviewCount: 12
    },
    serviceId: id + 300,
    technicianServiceId: null,
    shopId: 7,
    technicianProfileId: id + 400,
    scheduleSlotId: id + 500,
    fulfillmentMode: "store",
    serviceName,
    shopName,
    technicianName,
    priceAmount: "8800.00",
    currency: "JPY",
    startsAt,
    endsAt: new Date(new Date(startsAt).getTime() + 60 * 60 * 1000).toISOString(),
    note: null,
    cancelReason: null,
    createdAt: new Date(2026, 8, 1, 10).toISOString(),
    updatedAt: new Date(2026, 8, 1, 10).toISOString(),
    statusHistory: []
  };

  return mapBookingOrderToDomainOrder(bookingOrder);
}

const orders: Order[] = [
  createMappedBookingOrder({
    id: 2,
    customerDisplayName: "午后客户",
    serviceName: "午后足疗",
    shopName: "涩谷店",
    startsAt: new Date(2026, 8, 10, 15, 30).toISOString(),
    technicianName: "技师乙"
  }),
  createMappedBookingOrder({
    id: 1,
    customerDisplayName: "早间客户",
    serviceName: "早间肩颈护理",
    shopName: "新宿店",
    startsAt: new Date(2026, 8, 10, 9, 15).toISOString(),
    technicianName: "技师甲"
  })
];

let container: HTMLDivElement;
let root: Root;

function TimelineHarness({ loading = false, error = false, inputOrders = orders }: { loading?: boolean; error?: boolean; inputOrders?: Order[] }) {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <MemoryRouter>
      <MerchantTodayAppointmentsTimeline
        error={error}
        loading={loading}
        onExit={vi.fn()}
        onSearchQueryChange={setSearchQuery}
        orders={inputOrders}
        searchQuery={searchQuery}
      />
    </MemoryRouter>
  );
}

async function renderTimeline(props: { loading?: boolean; error?: boolean; inputOrders?: Order[] } = {}) {
  await act(async () => {
    root.render(<TimelineHarness {...props} />);
  });
}

describe("MerchantTodayAppointmentsTimeline", () => {
  beforeEach(() => {
    localeState.language = "zh";
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("sorts formal orders chronologically and filters with the shared appointment search", async () => {
    await renderTimeline();

    const timelineText = container.textContent ?? "";
    expect(timelineText.indexOf("早间肩颈护理")).toBeLessThan(timelineText.indexOf("午后足疗"));
    expect(container.querySelector('a[href="/merchant/orders/1"]')).not.toBeNull();
    expect(container.querySelector('a[href="/merchant/orders/2"]')).not.toBeNull();
    expect(container.querySelector('input[aria-label="搜索今日预约"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="返回"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="关闭"]')).not.toBeNull();

    const searchInput = container.querySelector<HTMLInputElement>('input[aria-label="搜索今日预约"]')!;
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(searchInput, "午后客户");
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(container.textContent).toContain("午后足疗");
    expect(container.textContent).not.toContain("早间肩颈护理");

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(searchInput, "09:15");
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(container.textContent).toContain("早间肩颈护理");
    expect(container.textContent).not.toContain("午后足疗");
  });

  it("renders translated loading, error, and empty states", async () => {
    localeState.language = "ja";
    await renderTimeline({ loading: true });
    expect(container.textContent).toContain("本日の予約");
    expect(container.textContent).toContain("本日の予約を読み込んでいます");
    expect(container.querySelector('input[aria-label="本日の予約を検索"]')?.getAttribute("placeholder")).toBe("予約、顧客、スタッフ、状態を検索");
    expect(container.querySelector('section[aria-label="本日の予約タイムライン"]')).not.toBeNull();

    await renderTimeline({ error: true });
    expect(container.textContent).toContain("本日の予約を読み込めませんでした");

    await renderTimeline({ inputOrders: [] });
    expect(container.textContent).toContain("本日の予約はありません");
    expect(translateText("查看今日预约", "ja")).toBe("本日の予約を表示");
    expect(translateText("查看营业额", "ja")).toBe("売上を表示");
  });

  it("renders localized accessible metric links for both dashboard drilldowns", async () => {
    localeState.language = "ja";
    await act(async () => {
      root.render(
        <MemoryRouter>
          <MerchantWorkbenchMetrics
            availableScheduleSlotsValue="8"
            onlineEmployeeValue="3 人"
            revenueValue="￥24,000"
            todayAppointmentsValue="2 件"
          />
        </MemoryRouter>
      );
    });

    expect(container.querySelector('a[href="/merchant/today-appointments"]')?.getAttribute("aria-label")).toBe("本日の予約を表示");
    expect(container.querySelector('a[href="/merchant/revenue"]')?.getAttribute("aria-label")).toBe("売上を表示");
    expect(container.textContent).toContain("本日の予約");
    expect(container.textContent).toContain("売上");
    expect(container.textContent).toContain("予約可能枠");
  });

  it("distinguishes localized summary loading, failure, and empty states", async () => {
    localeState.language = "ja";
    const onRetry = vi.fn();
    const renderMetrics = async (summaryStatus: "loading" | "error" | "empty") => {
      await act(async () => {
        root.render(
          <MemoryRouter>
            <MerchantWorkbenchMetrics
              availableScheduleSlotsValue="—"
              onRetry={onRetry}
              onlineEmployeeValue="3 人"
              revenueValue="—"
              summaryStatus={summaryStatus}
              todayAppointmentsValue="—"
            />
          </MemoryRouter>
        );
      });
    };

    await renderMetrics("loading");
    expect(container.querySelector('[role="status"]')?.textContent).toBe("本日の店舗サマリーを読み込んでいます");
    expect(container.textContent).not.toContain("加载中");

    await renderMetrics("error");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("本日の店舗サマリーを読み込めませんでした");
    const retry = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "本日のサマリーを再読み込み");
    expect(retry).toBeDefined();
    await act(async () => retry?.click());
    expect(onRetry).toHaveBeenCalledTimes(1);

    await renderMetrics("empty");
    expect(container.querySelector('[role="status"]')?.textContent).toBe("本日は予約、売上、予約可能枠がありません");
  });
});
