// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OfficialNoticeBell } from "./OfficialNoticeBell";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({ notifications: 0 }));

vi.mock("../../features/realtime/useRealtimeUnreadCounts", () => ({
  useRealtimeUnreadCounts: () => ({
    conversations: 0,
    friendRequests: 0,
    notifications: state.notifications,
    total: state.notifications
  })
}));

describe("OfficialNoticeBell", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    state.notifications = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders the same bell link shape for a portal inbox", () => {
    act(() => root.render(
      <MemoryRouter>
        <OfficialNoticeBell to="/merchant-admin/notifications/inbox" />
      </MemoryRouter>
    ));

    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/merchant-admin/notifications/inbox");
    expect(link?.getAttribute("aria-label")).toBe("消息");
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.textContent).not.toContain("通知");
  });

  it("shows the durable notification unread count and hides an empty badge", () => {
    state.notifications = 7;
    act(() => root.render(
      <MemoryRouter>
        <OfficialNoticeBell to="/admin/notifications" />
      </MemoryRouter>
    ));
    expect(container.textContent).toContain("7");

    state.notifications = 0;
    act(() => root.render(
      <MemoryRouter>
        <OfficialNoticeBell to="/admin/notifications" />
      </MemoryRouter>
    ));
    expect(container.textContent).not.toContain("0");
  });
});
