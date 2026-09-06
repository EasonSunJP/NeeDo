// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../../api/httpClient";
import { WorkStatusControls } from "./WorkStatusControls";
import { workStatusApi } from "./api";
vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  workStatusApi: { snapshot: vi.fn(), update: vi.fn() },
}));
vi.mock("./refresh", () => ({ subscribeWorkStatusRefresh: () => () => {} }));
const snapshot = {
  technicianProfileId: 31,
  status: "resting",
  version: 3,
  syncedAt: null,
  month: { lateCount: 0, earlyLeaveCount: 0, from: "", to: "" },
};
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.mocked(workStatusApi.snapshot).mockResolvedValue(snapshot as never);
  vi.mocked(workStatusApi.update).mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
describe("work status submission", () => {
  it("opens the freshly reported active service even when today's suggested order differs", async () => {
    function RouteProbe() {
      return <output>{useLocation().pathname}</output>;
    }
    await act(async () =>
      root.render(
        <MemoryRouter>
          <WorkStatusControls serviceOrderId={4} />
          <RouteProbe />
        </MemoryRouter>,
      ),
    );
    vi.mocked(workStatusApi.snapshot).mockResolvedValue({
      ...snapshot,
      status: "in_service",
      activeOrderId: 99,
    } as never);
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[data-status="in_service"]')!
        .click(),
    );
    expect(container.querySelector("output")?.textContent).toBe(
      "/technician/orders/99",
    );
    expect(workStatusApi.update).not.toHaveBeenCalled();
  });
  it("shows affected bookings before confirming early departure", async () => {
    vi.mocked(workStatusApi.update).mockRejectedValue(
      new ApiClientError("confirm", 40901, 409, {
        reason: "early_leave_confirmation_required",
        affectedOrders: [
          {
            id: 92,
            orderNo: "ND-preview-92",
            serviceName: "Care",
            startsAt: "2026-09-06T05:00:00Z",
            endsAt: "2026-09-06T06:00:00Z",
          },
        ],
      }),
    );
    await act(async () =>
      root.render(
        <MemoryRouter>
          <WorkStatusControls />
        </MemoryRouter>,
      ),
    );
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[data-status="off_duty"]')!
        .click(),
    );
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain(
      "ND-preview-92",
    );
    expect(
      container.querySelector('[role="dialog"] a')?.getAttribute("href"),
    ).toBe("/technician/orders/92");
    expect(workStatusApi.update).toHaveBeenCalledTimes(1);
    expect(
      container
        .querySelector('[data-status="resting"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
  });
  it("retries with an edited departure reason after a failed confirmation", async () => {
    vi.mocked(workStatusApi.update)
      .mockRejectedValueOnce(
        new ApiClientError("confirm", 40901, 409, {
          reason: "early_leave_confirmation_required",
        }),
      )
      .mockRejectedValue(new Error("network"));
    await act(async () =>
      root.render(
        <MemoryRouter>
          <WorkStatusControls shopId={8} />
        </MemoryRouter>,
      ),
    );
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[data-status="off_duty"]')!
        .click(),
    );
    const textarea = container.querySelector("textarea")!;
    const input = async (value: string) =>
      act(async () => {
        Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value",
        )!.set!.call(textarea, value);
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      });
    await input("First reason");
    const confirm = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'),
    ).find((b) => b.textContent?.includes("Confirm"))!;
    await act(async () => confirm.click());
    await input("Corrected reason");
    await act(async () => confirm.click());
    expect(workStatusApi.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        reason: "Corrected reason",
        shopId: 8,
        confirmEarlyLeave: true,
      }),
    );
  });
  it("submits a real button with current version and only marks success after response", async () => {
    let resolve!: (value: never) => void;
    vi.mocked(workStatusApi.update).mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    await act(async () =>
      root.render(
        <MemoryRouter>
          <WorkStatusControls />
        </MemoryRouter>,
      ),
    );
    const duty = container.querySelector<HTMLButtonElement>(
      '[data-status="on_duty"]',
    )!;
    await act(async () => duty.click());
    expect(workStatusApi.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "on_duty",
        expectedVersion: 3,
        idempotencyKey: expect.any(String),
      }),
    );
    expect(duty.getAttribute("aria-pressed")).toBe("false");
    await act(async () =>
      resolve({ ...snapshot, status: "on_duty", version: 4 } as never),
    );
    expect(duty.getAttribute("aria-pressed")).toBe("true");
  });
  it("keeps prior server state and exposes retry after failed write", async () => {
    vi.mocked(workStatusApi.update).mockRejectedValue(new Error("network"));
    await act(async () =>
      root.render(
        <MemoryRouter>
          <WorkStatusControls />
        </MemoryRouter>,
      ),
    );
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[data-status="on_duty"]')!
        .click(),
    );
    expect(
      container
        .querySelector('[data-status="resting"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Could not save",
    );
  });
});
