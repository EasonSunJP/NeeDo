// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserFulfillmentTimelineDrawer } from "./UserFulfillmentTimelineDrawer";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const api = vi.hoisted(() => ({
  getUsageTimeline: vi.fn(),
  appendUsageComment: vi.fn(),
  amendUsageRefund: vi.fn(),
}));
vi.mock("./api", () => ({ platformUserManagementApi: api }));
vi.mock("../../components/ui/Drawer", () => ({
  Drawer: ({
    children,
    open,
    title,
  }: {
    children: ReactNode;
    open: boolean;
    title: string;
  }) =>
    open ? (
      <section>
        <h1>{title}</h1>
        {children}
      </section>
    ) : null,
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

describe("UserFulfillmentTimelineDrawer", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    api.getUsageTimeline
      .mockReset()
      .mockResolvedValue({
        order: usage,
        timeline: [
          {
            id: "created:88",
            type: "order_created",
            code: "order_created",
            occurredAt: "2026-09-05T08:00:00.000Z",
            actorName: null,
            body: null,
          },
        ],
      });
    api.appendUsageComment.mockReset().mockResolvedValue({ commentId: 201 });
    api.amendUsageRefund.mockReset();
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

  it("shows immutable timeline and requires a nonblank appended comment", async () => {
    act(() =>
      root.render(
        <UserFulfillmentTimelineDrawer
          canAmendRefund
          canComment
          onClose={vi.fn()}
          scope="operations"
          usage={usage}
          userId={41}
        />,
      ),
    );
    await flush();
    expect(api.getUsageTimeline).toHaveBeenCalledWith("operations", 41, 88);
    expect(container.querySelector("h1")?.textContent).toBe("用户LOG・B-88");
    expect(container.querySelector(".admin-event-timeline > section > p")?.textContent).toBe("用户LOG");
    expect(container.textContent).toContain("预约已创建");
    expect(container.querySelector('[data-tone="green"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="追加评论"]')).not.toBeNull();
    expect(container.querySelector("textarea")).toBeNull();
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="追加评论"]')?.click());
    expect(container.textContent).toContain("修改退款信息");
    expect(container.textContent).not.toContain("删除");
    const submit = [...container.querySelectorAll("button")].reverse().find(
      (button) => button.textContent === "追加评论",
    );
    act(() => submit?.click());
    expect(container.textContent).toContain("请填写评论");
    const textarea = container.querySelector("textarea");
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      setter?.call(textarea, "Customer contacted");
      textarea?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => submit?.click());
    await flush();
    expect(api.appendUsageComment).toHaveBeenCalledWith(
      41,
      88,
      "Customer contacted",
    );
  });
});
