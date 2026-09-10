// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { translateText } from "../../i18n/translations";
import type { Order } from "../../types/domain";
import { MerchantTodayAppointmentsTimeline } from "./MerchantPortalPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const localeState = vi.hoisted(() => ({ language: "zh" }));

vi.mock("../../i18n/I18nProvider", () => ({
  useOptionalI18n: () => localeState
}));

const orders: Order[] = [
  {
    id: "order-late",
    orderNo: "NDO-LATE",
    mode: "store",
    status: "confirmed",
    customerId: "customer-late",
    customerName: "午后客户",
    itemName: "午后足疗",
    technicianName: "技师乙",
    city: "東京都",
    area: "涩谷",
    amount: 6800,
    paymentStatus: "paid",
    bookedAt: "2026-09-10 15:30",
    createdAt: "2026-09-01 10:00",
    source: "app"
  },
  {
    id: "order-early",
    orderNo: "NDO-EARLY",
    mode: "home",
    status: "scheduled",
    customerId: "customer-early",
    customerName: "早间客户",
    itemName: "早间肩颈护理",
    technicianName: "技师甲",
    city: "東京都",
    area: "新宿",
    amount: 8800,
    paymentStatus: "paid",
    bookedAt: "2026-09-10 09:15",
    createdAt: "2026-09-01 10:00",
    source: "web"
  }
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
    expect(container.querySelector('a[href="/merchant/orders/order-early"]')).not.toBeNull();
    expect(container.querySelector('a[href="/merchant/orders/order-late"]')).not.toBeNull();
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
});
