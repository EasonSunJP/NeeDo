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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => { resolve = nextResolve; reject = nextReject; });
  return { promise, reject, resolve };
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

  it("clears old rows during page changes and offers retry without mixing a failed page", async () => {
    const pageTwo = deferred<Awaited<ReturnType<UserFavoritesApi["listChatRecordFavorites"]>>>();
    const api = makeApi();
    vi.mocked(api.listChatRecordFavorites).mockImplementation(async ({ page = 1 } = {}) => {
      if (page === 2) return pageTwo.promise;
      return { list: [favorite], total: 21, page, page_size: 20 };
    });
    await act(async () => root.render(<MemoryRouter><UserFavoritesPage api={api} language="zh" /></MemoryRouter>));
    await flush();
    const next = Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.includes("下一页"));
    await act(async () => next?.click());
    expect(document.body.textContent).not.toContain("A的聊天记录");
    pageTwo.reject(new Error("network"));
    await flush();
    expect(document.body.textContent).toContain("收藏读取失败");
    const retry = Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.includes("重试"));
    expect(retry).not.toBeUndefined();
    vi.mocked(api.listChatRecordFavorites).mockResolvedValueOnce({ list: [], total: 21, page: 2, page_size: 20 });
    await act(async () => retry?.click());
    await flush();
    expect(api.listChatRecordFavorites).toHaveBeenLastCalledWith({ page: 2, pageSize: 20 });
  });

  it("guards same-tick duplicate removal and ignores its late success after paging", async () => {
    const removal = deferred<{ deleted: true }>();
    const api = makeApi();
    vi.mocked(api.removeChatRecordFavorite).mockReturnValue(removal.promise);
    vi.mocked(api.listChatRecordFavorites).mockImplementation(async ({ page = 1 } = {}) => ({ list: [{ ...favorite, id: "7", preview: page === 1 ? "A: page-one" : "A: page-two" }], total: 21, page, page_size: 20 }));
    await act(async () => root.render(<MemoryRouter><UserFavoritesPage api={api} language="zh" /></MemoryRouter>));
    await flush();
    const remove = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.includes("移除收藏"))!;
    await act(async () => { remove.click(); remove.click(); });
    expect(api.removeChatRecordFavorite).toHaveBeenCalledTimes(1);
    await act(async () => Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.includes("下一页"))?.click());
    await flush();
    expect(document.body.textContent).toContain("page-two");
    removal.resolve({ deleted: true });
    await flush();
    expect(document.body.textContent).toContain("page-two");
  });

  it("returns from an emptied later page and loads the preceding page", async () => {
    const api = makeApi();
    vi.mocked(api.listChatRecordFavorites).mockImplementation(async ({ page = 1 } = {}) => ({ list: [favorite], total: page === 1 ? 21 : 1, page, page_size: 20 }));
    await act(async () => root.render(<MemoryRouter><UserFavoritesPage api={api} language="zh" /></MemoryRouter>));
    await flush();
    await act(async () => Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.includes("下一页"))?.click());
    await flush();
    await act(async () => Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.includes("移除收藏"))?.click());
    await flush();
    expect(api.listChatRecordFavorites).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 });
  });

  it("renders complete English favorites navigation and removal copy", async () => {
    const api = makeApi();
    await act(async () => root.render(<MemoryRouter><UserFavoritesPage api={api} language="en" /></MemoryRouter>));
    await flush();
    expect(document.body.textContent).toContain("My favorites");
    expect(document.body.textContent).toContain("Saved chat records");
    expect(document.body.textContent).toContain("Chat record with A");
    expect(document.body.textContent).toContain("Remove favorite");
    expect(document.body.textContent).toContain("Previous page");
    expect(document.body.textContent).toContain("Next page");
  });
});
