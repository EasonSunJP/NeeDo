// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserUsageList } from "./UserUsageList";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const api = vi.hoisted(() => ({ listUsage: vi.fn() }));
vi.mock("./api", () => ({ platformUserManagementApi: api }));
vi.mock("./UserFulfillmentTimelineDrawer", () => ({
  UserFulfillmentTimelineDrawer: ({
    usage,
  }: {
    usage: { orderNo: string } | null;
  }) => (usage ? <aside>timeline:{usage.orderNo}</aside> : null),
}));

const usage = {
  id: 88,
  orderNo: "B-88",
  status: "completed",
  paymentStatus: "refunded",
  serviceName: "Home care",
  shopName: "LifeDance",
  technicianName: "Mika",
  startsAt: "2026-09-05T09:00:00.000Z",
  endsAt: "2026-09-05T10:00:00.000Z",
  priceAmount: 12000,
  currency: "JPY",
  refund: {
    exists: true,
    displayReference: "RF-1",
    note: "Confirmed",
    amendmentVersion: 0,
  },
};

async function flush() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

describe("UserUsageList", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    api.listUsage
      .mockReset()
      .mockResolvedValue({ list: [usage], total: 11, page: 1, page_size: 10 });
    window.localStorage.setItem("needo.language", "zh");
    window.localStorage.setItem("needo.language.mode", "manual");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.localStorage.clear();
  });

  it("renders all date presets, fixed paging, and opens each fulfillment timeline", async () => {
    act(() =>
      root.render(
        <UserUsageList
          canComment
          canRefundAmend
          scope="operations"
          userId={41}
        />,
      ),
    );
    await flush();
    for (const label of [
      "近7天",
      "本周",
      "近30天",
      "本月",
      "今年",
      "自定义日期",
    ]) {
      expect(
        [...container.querySelectorAll("button")].some(
          (button) => button.textContent === label,
        ),
      ).toBe(true);
    }
    expect(api.listUsage).toHaveBeenCalledWith("operations", 41, {
      page: 1,
      page_size: 10,
      period: "last30days",
    });
    expect(container.textContent).toContain("下一页");
    const row = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Home care"),
    );
    act(() => row?.click());
    expect(container.textContent).toContain("timeline:B-88");
    expect(container.textContent).not.toContain("删除");
  });
});
