// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserFavoritesPage, type UserFavoritesApi } from "./UserFavoritesPage";

const favorite = {
  id: "7",
  bundlePublicId: "11111111-1111-4111-8111-111111111111",
  title: "backend title",
  titleKind: "single" as const,
  preview: "A: saved",
  senderNames: ["A"],
  senderCount: 1,
  itemCount: 1,
  createdAt: "2026-08-31T10:00:00.000Z",
};

function makeApi(): UserFavoritesApi {
  return {
    listChatRecordFavorites: vi.fn(async ({ page = 1 } = {}) => ({
      list: page === 1 ? [favorite] : [],
      total: 21,
      page,
      page_size: 20,
    })),
    removeChatRecordFavorite: vi.fn(async () => ({ deleted: true as const })),
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("UserFavoritesPage", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.body.innerHTML = "";
  });

  it("loads formal paginated favorites and treats one complete record as one row", async () => {
    const api = makeApi();
    await act(async () => root.render(<MemoryRouter><UserFavoritesPage api={api} language="zh" /></MemoryRouter>));
    await flush();
    expect(document.body.textContent).toContain("我的收藏");
    expect(document.body.textContent).toContain("A的聊天记录");
    expect(document.body.querySelectorAll("[data-im-chat-record-opener]")).toHaveLength(1);
    expect(api.listChatRecordFavorites).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
    const next = Array.from(document.body.querySelectorAll("button")).find((button) => button.textContent?.includes("下一页"));
    await act(async () => next?.click());
    await flush();
    expect(api.listChatRecordFavorites).toHaveBeenLastCalledWith({ page: 2, pageSize: 20 });
  });

  it("retains a favorite on remove failure and removes it only after API success", async () => {
    const api = makeApi();
    vi.mocked(api.removeChatRecordFavorite)
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ deleted: true });
    await act(async () => root.render(<MemoryRouter><UserFavoritesPage api={api} language="zh" /></MemoryRouter>));
    await flush();
    const remove = () => Array.from(document.body.querySelectorAll("button")).find((button) => button.textContent?.includes("移除收藏"));
    await act(async () => remove()?.click());
    await flush();
    expect(document.body.textContent).toContain("A的聊天记录");
    expect(document.body.textContent).toContain("移除失败");
    await act(async () => remove()?.click());
    await flush();
    expect(document.body.textContent).not.toContain("A的聊天记录");
    expect(api.removeChatRecordFavorite).toHaveBeenCalledTimes(2);
  });
});
