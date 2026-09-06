// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  availability: vi.fn(), send: vi.fn(), count: vi.fn(), list: vi.fn(), resolve: vi.fn(),
  owner: "customer-1", canResolve: true, onEvent: null as null | ((event: { type: string }) => void)
}));
vi.mock("../../i18n/I18nProvider", () => ({ useOptionalI18n: () => ({ language: "zh" }) }));
vi.mock("./api", () => ({ sosApi: state }));
vi.mock("./useSosScope", () => ({ useSosScope: () => ({ ownerKey: state.owner, canCreate: true, canRead: true, canResolve: state.canResolve }) }));
vi.mock("../realtime/api", () => ({ subscribeRealtimeEvents: ({ onEvent }: { onEvent: typeof state.onEvent }) => { state.onEvent = onEvent; return () => {}; } }));
import { BookingSosButton } from "./BookingSosButton";
import { SosAlertsButton } from "./SosAlertsButton";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
const alert = { id: 11, orderId: 12, orderNo: "ND12", shopId: 1, shopName: "Shop A", serviceName: "Massage", senderName: "Customer A", senderType: "customer", status: "pending", createdAt: "2026-09-06T00:00:00Z", resolvedAt: null, resolvedByName: null };
const availability = { canSend: true, serverNow: "2026-09-06T00:00:00Z", expiresAt: null, activeAlertId: null };
async function render(element: React.ReactNode) { await act(async () => { root.render(element); }); }
async function click(label: string) {
  const button = [...document.querySelectorAll("button")].find((item) => item.getAttribute("aria-label") === label || item.textContent === label);
  expect(button, label).toBeTruthy();
  await act(async () => { button!.click(); });
}
beforeEach(() => {
  vi.useFakeTimers();
  state.owner = "customer-1"; state.canResolve = true;
  state.availability.mockReset().mockResolvedValue(availability);
  state.send.mockReset().mockResolvedValue({ alert, replayed: false });
  state.count.mockReset().mockResolvedValue({ pending: 1 });
  state.list.mockReset().mockResolvedValue({ list: [alert], total: 1, page: 1, page_size: 20 });
  state.resolve.mockReset().mockResolvedValue({ alert: { ...alert, status: "resolved" }, replayed: false });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); });

describe("Booking SOS", () => {
  it("keeps the capsule visible before service starts and after status refresh", async () => {
    state.availability.mockResolvedValueOnce({ ...availability, canSend: false });
    await render(<BookingSosButton orderId={12} revision="pending" />);
    expect(container.querySelector("button")?.textContent).toBe("SOS");
    await render(<BookingSosButton orderId={12} revision="inService" />);
    expect(container.querySelector("button")?.textContent).toBe("SOS");
    expect(container.querySelector("button")?.className).toContain("booking-sos-capsule");
  });
  it("does not hide at a former server deadline even when the local clock differs", async () => {
    vi.setSystemTime(new Date("2036-01-01T00:00:00Z"));
    state.availability.mockResolvedValue({ ...availability, expiresAt: "2026-09-06T00:00:01Z" });
    await render(<BookingSosButton orderId={12} />);
    expect(container.querySelector("button")).not.toBeNull();
    await act(async () => vi.advanceTimersByTime(1000));
    expect(container.querySelector("button")?.textContent).toBe("SOS");
  });
  it("can send while the status request is unavailable", async () => {
    state.availability.mockRejectedValue(new Error("offline"));
    await render(<BookingSosButton orderId={12} />);
    await click("发送 SOS 求救");
    expect(state.send).toHaveBeenCalledTimes(1);
    expect(container.querySelector("button")?.disabled).toBe(true);
    await click("发送 SOS 求救");
    expect(state.send).toHaveBeenCalledTimes(1);
  });
  it("submits on one click and prevents duplicate sends while pending", async () => {
    let finish!: (value: unknown) => void;
    state.send.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    await render(<BookingSosButton orderId={12} />);
    await click("发送 SOS 求救");
    expect(state.send).toHaveBeenCalledTimes(1);
    expect(container.querySelector("button")?.disabled).toBe(true);
    await act(async () => finish({ alert, replayed: false }));
    expect(container.textContent).toContain("求救已发送");
  });
  it("preserves the idempotency key after an ambiguous error", async () => {
    state.send.mockRejectedValueOnce(new Error("connection lost"));
    await render(<BookingSosButton orderId={12} />);
    await click("发送 SOS 求救");
    expect(container.textContent).toContain("发送失败");
    await click("发送 SOS 求救");
    expect(state.send.mock.calls[1][1]).toBe(state.send.mock.calls[0][1]);
  });
  it("clears the former identity immediately and ignores its late response", async () => {
    let finish!: (value: unknown) => void;
    state.availability.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await render(<BookingSosButton orderId={12} />);
    state.owner = "customer-2";
    state.availability.mockResolvedValue({ ...availability, canSend: false });
    await render(<BookingSosButton orderId={12} />);
    await act(async () => finish({ ...availability, activeAlertId: 11 }));
    expect(container.querySelector("button")?.disabled).toBe(false);
    expect(container.querySelector("button")?.textContent).toBe("SOS");
  });
  it("uses a fresh key after an uncertain send is confirmed pending and then resolved", async () => {
    state.send.mockRejectedValueOnce(new Error("response lost"));
    await render(<BookingSosButton orderId={12} />);
    await click("发送 SOS 求救");
    state.availability.mockResolvedValue({ ...availability, activeAlertId: 11 });
    await act(async () => { state.onEvent?.({ type: "sos.created" }); });
    state.availability.mockResolvedValue(availability);
    await act(async () => { state.onEvent?.({ type: "sos.resolved" }); });
    await click("发送 SOS 求救");
    expect(state.send.mock.calls[1][1]).not.toBe(state.send.mock.calls[0][1]);
  });
  it("ends the retry attempt when pending is confirmed before its POST times out", async () => {
    let fail!: (error: Error) => void;
    state.send.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    await render(<BookingSosButton orderId={12} />);
    await click("发送 SOS 求救");
    state.availability.mockResolvedValue({ ...availability, activeAlertId: 11 });
    await act(async () => { state.onEvent?.({ type: "sos.created" }); });
    await act(async () => fail(new Error("response timed out")));
    state.availability.mockResolvedValue(availability);
    await act(async () => { state.onEvent?.({ type: "sos.resolved" }); });
    await click("发送 SOS 求救");
    expect(state.send.mock.calls[1][1]).not.toBe(state.send.mock.calls[0][1]);
  });
});

describe("SOS inbox", () => {
  it("lights from the durable pending count and opening never resolves a request", async () => {
    await render(<SosAlertsButton />);
    expect(container.querySelector("button")?.getAttribute("data-active")).toBe("true");
    await click("求救通知");
    expect(document.body.textContent).toContain("Customer A");
    expect(state.resolve).not.toHaveBeenCalled();
    state.count.mockResolvedValue({ pending: 0 });
    state.list.mockResolvedValue({ list: [], total: 0, page: 1, page_size: 20 });
    await click("标记已处理");
    expect(state.resolve).toHaveBeenCalledWith(11);
    expect(container.querySelector("button")?.getAttribute("data-active")).toBe("false");
  });
  it("preserves an alert count on disconnection and exposes retry instead of zero", async () => {
    await render(<SosAlertsButton />);
    state.count.mockRejectedValue(new Error("offline"));
    await act(async () => { state.onEvent?.({ type: "connected" }); });
    expect(container.querySelector("button")?.getAttribute("data-active")).toBe("true");
    await click("求救通知");
    expect(document.body.textContent).toContain("连接异常");
  });
  it("refreshes an open list on SOS events and does not expose resolution without permission", async () => {
    state.canResolve = false;
    await render(<SosAlertsButton />);
    await click("求救通知");
    const previous = state.list.mock.calls.length;
    await act(async () => { state.onEvent?.({ type: "sos.created" }); });
    expect(state.list.mock.calls.length).toBeGreaterThan(previous);
    expect(document.body.textContent).not.toContain("标记已处理");
  });
  it("keeps loaded results when clicking the already selected first-page filter", async () => {
    await render(<SosAlertsButton />);
    await click("求救通知");
    await click("待处理");
    expect(document.body.textContent).toContain("Customer A");
    expect(document.body.textContent).not.toContain("正在加载求救通知");
  });
});
