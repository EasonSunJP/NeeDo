// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserReceivedReviews } from "./UserReceivedReviews";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.hoisted(() => ({
  listReceivedReviews: vi.fn(),
  amendReview: vi.fn(),
}));
vi.mock("./api", () => ({ platformUserManagementApi: api }));

const review = {
  reviewId: 77,
  targetType: "customer" as const,
  rating: 4,
  comment: "Service was good",
  tags: ["punctual", "polite"],
  createdAt: "2026-09-05T10:00:00.000Z",
  amendmentVersion: 1,
  amendmentHistory: [
    {
      version: 1,
      rating: 4,
      comment: "Service was good",
      tags: ["punctual", "polite"],
      reason: "Evidence confirmed",
      revisedAt: "2026-09-06T10:00:00.000Z",
      revisedBy: "Operator",
    },
  ],
  order: {
    id: 88,
    orderNo: "B-88",
    serviceName: "Home care",
    startsAt: "2026-09-05T09:00:00.000Z",
    shopName: "Tokyo care",
    durationMinutes: 60,
    note: "Doorbell is broken",
    paymentMethod: "ndp",
    paymentStatus: "refunded",
    paymentCurrency: "TEST_NDP",
    otherPaymentMethod: null,
    addOnCount: 1,
    addOnMinutes: 30,
  },
  reviewer: { needoId: "s0000000042", displayName: "Mika", avatarUrl: null },
};

async function flush() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

describe("UserReceivedReviews", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    api.listReceivedReviews
      .mockReset()
      .mockResolvedValue({ list: [review], total: 12, page: 1, page_size: 10 });
    api.amendReview.mockReset().mockResolvedValue({ reviewId: 77, version: 2 });
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

  it("loads ten-row scoped reviews and localizes known service tags", async () => {
    act(() =>
      root.render(
        <UserReceivedReviews canAmend={false} scope="merchant" userId={41} />,
      ),
    );
    await flush();
    expect(api.listReceivedReviews).toHaveBeenCalledWith("merchant", 41, {
      page: 1,
      page_size: 10,
    });
    expect(container.textContent).toContain("Home care");
    expect(container.textContent).toContain("准时");
    expect(container.textContent).toContain("礼貌");
    expect(container.textContent).toContain("下一页");
    expect(container.textContent).not.toContain("修改评价");
  });

  it("separates payment facts, accepted extra time, special tags, custom tags and notes", async () => {
    api.listReceivedReviews.mockResolvedValue({
      list: [{ ...review, tags: ["支付顺利", "魅力max", "安静交流"] }],
      total: 1,
      page: 1,
      page_size: 10,
    });
    act(() =>
      root.render(
        <UserReceivedReviews canAmend={false} scope="operations" userId={41} />,
      ),
    );
    await flush();
    for (const value of [
      "Test NDP",
      "已退款",
      "已加钟",
      "30",
      "特殊标签",
      "魅力max",
      "自定义标签",
      "安静交流",
      "评价备注",
      "Service was good",
      "预约备注",
      "Doorbell is broken",
    ]) {
      expect(container.textContent).toContain(value);
    }
    const payment = container.querySelector('[aria-label="支付信息"]');
    expect(payment?.textContent).toContain("Test NDP");
    expect(payment?.textContent).not.toContain("支付顺利");
    expect(container.textContent).not.toContain("支付顺利");
  });

  it("renders pending offline payment and explicit absent tags, add-ons and comment", async () => {
    api.listReceivedReviews.mockResolvedValue({
      list: [
        {
          ...review,
          tags: [],
          comment: null,
          order: {
            ...review.order,
            paymentMethod: "onsite",
            paymentStatus: "pending",
            paymentCurrency: null,
            addOnCount: 0,
            addOnMinutes: 0,
          },
        },
      ],
      total: 1,
      page: 1,
      page_size: 10,
    });
    act(() =>
      root.render(
        <UserReceivedReviews canAmend={false} scope="merchant" userId={41} />,
      ),
    );
    await flush();
    for (const value of [
      "线下支付",
      "待支付",
      "未加钟",
      "未填写评价备注",
      "未选择特殊标签",
      "未填写自定义标签",
    ])
      expect(container.textContent).toContain(value);
  });

  it("requires a reason and submits the current immutable version for operations", async () => {
    act(() =>
      root.render(
        <UserReceivedReviews canAmend scope="operations" userId={41} />,
      ),
    );
    await flush();
    const edit = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "修改评价",
    );
    act(() => edit?.click());
    const save = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "保存修改",
    );
    act(() => save?.click());
    expect(container.textContent).toContain("请填写修改理由");

    const textareas = container.querySelectorAll("textarea");
    const reason = textareas[textareas.length - 1];
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      setter?.call(reason, "Refund evidence confirmed");
      reason.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => save?.click());
    await flush();
    expect(api.amendReview).toHaveBeenCalledWith(
      77,
      expect.objectContaining({
        reason: "Refund evidence confirmed",
        expectedVersion: 1,
        rating: 4,
        tags: ["punctual", "polite"],
      }),
    );
  });
});
