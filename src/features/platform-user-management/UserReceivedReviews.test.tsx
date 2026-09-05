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
  order: {
    id: 88,
    orderNo: "B-88",
    serviceName: "Home care",
    startsAt: "2026-09-05T09:00:00.000Z",
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
