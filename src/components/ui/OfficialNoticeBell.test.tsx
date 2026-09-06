// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OfficialNoticeBell } from "./OfficialNoticeBell";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({ notifications: 0, listInbox: vi.fn() }));

vi.mock("../../features/realtime/useRealtimeUnreadCounts", () => ({
  useRealtimeUnreadCounts: () => ({
    conversations: 0,
    friendRequests: 0,
    notifications: state.notifications,
    total: state.notifications
  })
}));
vi.mock("../../i18n/I18nProvider", () => ({
  useOptionalI18n: () => ({ language: "ja" })
}));
vi.mock("../../api/officialNotices", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/officialNotices")>()),
  officialNoticesApi: { listInbox: state.listInbox }
}));

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe("OfficialNoticeBell", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    state.notifications = 0;
    state.listInbox.mockReset().mockResolvedValue({ list: [], total: 0, page: 1, page_size: 1 });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders the same bell link shape for a portal inbox", async () => {
    act(() => root.render(
      <MemoryRouter>
        <OfficialNoticeBell to="/merchant-admin/notifications/inbox" />
      </MemoryRouter>
    ));
    await flush();

    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/merchant-admin/notifications/inbox");
    expect(link?.getAttribute("aria-label")).toBe("消息");
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.textContent).not.toContain("通知");
  });

  it("shows the official-notice unread count instead of the generic notification count", async () => {
    state.notifications = 7;
    state.listInbox.mockResolvedValueOnce({ list: [], total: 3, page: 1, page_size: 1 });
    act(() => root.render(
      <MemoryRouter>
        <OfficialNoticeBell to="/admin/notifications/inbox" />
      </MemoryRouter>
    ));
    await flush();
    expect(state.listInbox).toHaveBeenCalledWith({ locale: "ja", unreadOnly: true, page: 1, pageSize: 1 });
    expect(container.textContent).toContain("3");
    expect(container.textContent).not.toContain("7");

    state.notifications = 8;
    state.listInbox.mockResolvedValueOnce({ list: [], total: 0, page: 1, page_size: 1 });
    act(() => root.render(
      <MemoryRouter>
        <OfficialNoticeBell to="/admin/notifications/inbox" />
      </MemoryRouter>
    ));
    await flush();
    expect(container.textContent).not.toContain("0");
    expect(container.textContent).not.toContain("8");
  });

  it("refreshes the official-notice badge after an inbox read", async () => {
    state.listInbox
      .mockResolvedValueOnce({ list: [], total: 2, page: 1, page_size: 1 })
      .mockResolvedValueOnce({ list: [], total: 1, page: 1, page_size: 1 });
    act(() => root.render(
      <MemoryRouter>
        <OfficialNoticeBell to="/merchant-admin/notifications/inbox" />
      </MemoryRouter>
    ));
    await flush();
    expect(container.textContent).toContain("2");

    act(() => window.dispatchEvent(new Event("official-notice:changed")));
    await flush();
    expect(container.textContent).toContain("1");
  });
});
