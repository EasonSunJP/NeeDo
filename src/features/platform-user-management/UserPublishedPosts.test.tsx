// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { UserPublishedPosts } from "./UserPublishedPosts";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("../../i18n/I18nProvider", () => ({ useOptionalI18n: () => ({ language: "zh" }) }));
const list = vi.hoisted(() => vi.fn());
vi.mock("./api", () => ({ platformUserManagementApi: { listAccountPosts: list } }));
it("reads the selected account's paginated formal posts with text and media", async () => {
  list.mockResolvedValue({ page: 1, page_size: 10, total: 11, list: [{ id: 9, authorUserId: 41, content: "Published update", createdAt: "2026-09-01T00:00:00Z", visibility: "public", replyCount: 0, replyToPostId: null, media: { items: [{ id: "img", type: "image", url: "/photo.jpg" }] } }] });
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<UserPublishedPosts account={{ scope: "operations", subject: "users", id: 41 }} />));
    expect(list).toHaveBeenLastCalledWith({ scope: "operations", subject: "users", id: 41 }, 1, expect.any(AbortSignal));
    expect(host.textContent).toContain("Published update"); expect(host.querySelector('img[src="/photo.jpg"]')).not.toBeNull();
    await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === "下一页")!.click());
    expect(list).toHaveBeenLastCalledWith({ scope: "operations", subject: "users", id: 41 }, 2, expect.any(AbortSignal));
  } finally { act(() => root.unmount()); host.remove(); }
});
