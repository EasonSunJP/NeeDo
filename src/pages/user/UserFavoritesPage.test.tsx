// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatLocalizedImChatRecordTitle } from "../../features/im/chat-records";
import { entityEngagementApi } from "../../features/entity-engagement/api";
import type { EntityFavoriteListItem } from "../../features/entity-engagement/api";
import type { Language } from "../../i18n/translations";
import appSource from "../../App.tsx?raw";
import pageSource from "./UserFavoritesPage.tsx?raw";
import { UserFavoritesPage, type UserFavoritesApi } from "./UserFavoritesPage";

function favoriteAt(index: number) {
  return {
    id: String(index),
    bundlePublicId: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
    title: "backend title",
    titleKind: "single" as const,
    preview: `A${index}: saved`,
    senderNames: [`A${index}`],
    senderCount: 1,
    itemCount: 1,
    createdAt: "2026-08-31T10:00:00.000Z",
  };
}

const favorite = favoriteAt(7);

function formalPage(list: ReturnType<typeof favoriteAt>[], page: number) {
  return {
    list: list.slice((page - 1) * 20, page * 20),
    total: list.length,
    page,
    page_size: 20,
  };
}

function makeApi(): UserFavoritesApi {
  let rows = Array.from({ length: 21 }, (_, index) => favoriteAt(index + 1));
  return {
    listChatRecordFavorites: vi.fn(async ({ page = 1 } = {}) =>
      formalPage(rows, page),
    ),
    removeChatRecordFavorite: vi.fn(async (favoriteId) => {
      rows = rows.filter((row) => row.id !== favoriteId);
      return { deleted: true as const };
    }),
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
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
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
    vi.restoreAllMocks();
    container.remove();
    document.body.innerHTML = "";
  });

  it.each<[Language, [string, string, string]]>([
    ["zh", ["A的聊天记录", "A和B的聊天记录", "群聊记录"]],
    ["zh-Hant", ["A的聊天記錄", "A和B的聊天記錄", "群組聊天記錄"]],
    ["ja", ["Aのチャット履歴", "AとBのチャット履歴", "グループチャット履歴"]],
    [
      "en",
      ["A's chat history", "A and B's chat history", "Group chat history"],
    ],
    ["ko", ["A의 채팅 기록", "A와 B의 채팅 기록", "그룹 채팅 기록"]],
  ])(
    "formats single, pair, and group chat-record titles in %s",
    (language, expected) => {
      expect([
        formatLocalizedImChatRecordTitle(["A"], "single", language),
        formatLocalizedImChatRecordTitle(["A", "B"], "pair", language),
        formatLocalizedImChatRecordTitle(["A", "B", "C"], "group", language),
      ]).toEqual(expected);
    },
  );

  it("loads formal paginated favorites and treats one complete record as one row", async () => {
    const api = makeApi();
    await act(async () =>
      root.render(
        <MemoryRouter>
          <UserFavoritesPage api={api} language="zh" />
        </MemoryRouter>,
      ),
    );
    await flush();
    expect(document.body.textContent).toContain("我的收藏");
    expect(document.body.textContent).toContain("A1的聊天记录");
    expect(
      document.body.querySelectorAll("[data-im-chat-record-opener]"),
    ).toHaveLength(20);
    expect(api.listChatRecordFavorites).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
    });
    const next = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("下一页"),
    );
    await act(async () => next?.click());
    await flush();
    expect(api.listChatRecordFavorites).toHaveBeenLastCalledWith({
      page: 2,
      pageSize: 20,
    });
  });

  it("loads formal entity favorites into the same unified card system", async () => {
    const api = makeApi();
    vi.spyOn(entityEngagementApi, "getFavoriteStatuses").mockResolvedValue({
      list: [
        {
          targetType: "shop",
          publicId: "shop0000000001",
          isFavorited: true,
          favoriteCount: 3,
        },
      ],
    });
    const entityApi = {
      listFavorites: vi.fn(async () => ({
        list: [
          {
            targetType: "shop" as const,
            publicId: "shop0000000001",
            isFavorited: true,
            favoriteCount: 3,
            favoritedAt: "2026-09-09T00:00:00.000Z",
            card: {
              kind: "shop" as const,
              name: "LifeDance 港区店",
              description: "深夜疗愈",
              address: "東京都港区麻布十番",
              imageUrl: null,
              rating: 4.9,
              reviewCount: 32,
              completedOrderCount: 1999,
              shareCount: 8,
            },
          },
        ],
        total: 1,
        page: 1,
        page_size: 100,
      })),
      setFavorite: vi.fn(async () => ({})),
    };

    await act(async () =>
      root.render(
        <MemoryRouter>
          <UserFavoritesPage api={api} entityApi={entityApi} language="zh" />
        </MemoryRouter>,
      ),
    );
    await flush();

    expect(entityApi.listFavorites).toHaveBeenCalledWith({
      page: 1,
      pageSize: 100,
    });
    expect(document.body.textContent).toContain("LifeDance 港区店");
    expect(document.body.textContent).toContain("東京都港区麻布十番");
    expect(document.querySelector('[data-card-kind="shop"]')).not.toBeNull();
    expect(document.body.textContent).toContain("1.9k");
    expect(document.body.textContent).not.toContain("32");
  });

  it("uses one canonical bottom-nav-free route with shared back, search, and close controls", () => {
    expect(appSource).toContain(
      '<Route path="/me/favorites" element={protect("user", <UserFavoritesRoutePage />)} />',
    );
    expect(appSource).toContain(
      '<Route path="/me/favorites/chat-records" element={protect("user", <Navigate replace to="/me/favorites" />)} />',
    );
    expect(pageSource).toContain("<MobileFullscreenHeader");
    expect(pageSource).toContain("showBottomNav={false}");
  });

  it("lists shop, technician, service, post, and chat-record favorites and filters them from the header search", async () => {
    const api = makeApi();
    const entityRows: EntityFavoriteListItem[] = [
      {
        targetType: "shop",
        publicId: "shop0000000001",
        isFavorited: true,
        favoriteCount: 3,
        favoritedAt: "2026-09-09T00:00:00.000Z",
        card: {
          kind: "shop",
          name: "LifeDance 港区店",
          description: "深夜疗愈",
          address: "東京都港区",
          imageUrl: null,
          rating: 4.9,
          reviewCount: 32,
          shareCount: 8,
        },
      },
      {
        targetType: "technician",
        publicId: "s0000000001",
        isFavorited: true,
        favoriteCount: 5,
        favoritedAt: "2026-09-09T00:00:00.000Z",
        card: {
          kind: "technician",
          name: "技师 Mika",
          description: "肩颈护理",
          imageUrl: null,
          languages: ["日本語"],
          rating: 4.8,
          completedOrderCount: 50,
          shareCount: 4,
        },
      },
      {
        targetType: "service",
        publicId: "svc000000001",
        isFavorited: true,
        favoriteCount: 7,
        favoritedAt: "2026-09-09T00:00:00.000Z",
        card: {
          kind: "service",
          name: "全身调理",
          description: "90 分钟",
          imageUrl: null,
          priceAmount: 12000,
          currency: "JPY",
          durationMinutes: 90,
          usageCount: 12,
          shareCount: 2,
          isBookable: true,
          shopPublicId: "shop0000000001",
          shopAddress: "東京都港区",
          tags: ["调理"],
        },
      },
    ];
    const entityApi = {
      listFavorites: vi.fn(async () => ({
        list: entityRows,
        total: entityRows.length,
        page: 1,
        page_size: 100,
      })),
      setFavorite: vi.fn(async () => ({})),
    };

    await act(async () =>
      root.render(
        <MemoryRouter>
          <UserFavoritesPage
            api={api}
            entityApi={entityApi}
            language="zh"
            socialFavorites={[
              {
                authorAvatar: "/avatar.webp",
                authorName: "LifeDance",
                mediaType: "video",
                mediaUrl: "/media/content/season.mp4",
                postId: "701",
                text: "季节视频公告",
              },
            ]}
          />
        </MemoryRouter>,
      ),
    );
    await flush();

    expect(container.textContent).toContain("店铺");
    expect(container.textContent).toContain("技师");
    expect(container.textContent).toContain("服务");
    expect(container.textContent).toContain("动态");
    expect(container.textContent).toContain("聊天记录");
    expect(container.querySelector('[data-card-kind="shop"]')).not.toBeNull();
    expect(container.querySelector('[data-card-kind="technician"]')).not.toBeNull();
    expect(container.querySelector('[data-card-kind="service"]')).not.toBeNull();
    expect(container.querySelector("[data-social-post-compact-card]")).not.toBeNull();
    expect(container.querySelector("[data-im-chat-record-opener]")).not.toBeNull();
    expect(container.querySelector('button[aria-label="返回个人中心"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="关闭收藏"]')).not.toBeNull();

    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('button[aria-label="搜索收藏"]')
        ?.click(),
    );
    const search = container.querySelector<HTMLInputElement>(
      'input[aria-label="搜索收藏内容"]',
    );
    expect(search).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(search, "季节视频");
      search?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(container.textContent).toContain("季节视频公告");
    expect(container.textContent).not.toContain("LifeDance 港区店");
    expect(container.textContent).not.toContain("A1的聊天记录");
  });

  it("retains a favorite on remove failure and removes it only after API success", async () => {
    const api = makeApi();
    vi.mocked(api.removeChatRecordFavorite).mockRejectedValueOnce(
      new Error("network"),
    );
    await act(async () =>
      root.render(
        <MemoryRouter>
          <UserFavoritesPage api={api} language="zh" />
        </MemoryRouter>,
      ),
    );
    await flush();
    const remove = () =>
      Array.from(document.body.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("移除收藏"),
      );
    await act(async () => remove()?.click());
    await flush();
    expect(document.body.textContent).toContain("A1的聊天记录");
    expect(document.body.textContent).toContain("移除失败");
    await act(async () => remove()?.click());
    await flush();
    expect(document.body.textContent).not.toContain("A1的聊天记录");
    expect(
      document.body.querySelectorAll("[data-im-chat-record-opener]"),
    ).toHaveLength(20);
    expect(document.body.textContent).toContain("A21的聊天记录");
    expect(api.listChatRecordFavorites).toHaveBeenCalledTimes(2);
    expect(api.removeChatRecordFavorite).toHaveBeenCalledTimes(2);
  });

  it("clears old rows during page changes and offers retry without mixing a failed page", async () => {
    const pageTwo =
      deferred<
        Awaited<ReturnType<UserFavoritesApi["listChatRecordFavorites"]>>
      >();
    const api = makeApi();
    vi.mocked(api.listChatRecordFavorites).mockImplementation(
      async ({ page = 1 } = {}) => {
        if (page === 2) return pageTwo.promise;
        return formalPage(
          Array.from({ length: 21 }, (_, index) => favoriteAt(index + 1)),
          page,
        );
      },
    );
    await act(async () =>
      root.render(
        <MemoryRouter>
          <UserFavoritesPage api={api} language="zh" />
        </MemoryRouter>,
      ),
    );
    await flush();
    const next = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("下一页"),
    );
    await act(async () => next?.click());
    expect(document.body.textContent).not.toContain("A1的聊天记录");
    pageTwo.reject(new Error("network"));
    await flush();
    expect(document.body.textContent).toContain("收藏读取失败");
    const retry = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("重试"),
    );
    expect(retry).not.toBeUndefined();
    vi.mocked(api.listChatRecordFavorites).mockResolvedValueOnce(
      formalPage(
        Array.from({ length: 21 }, (_, index) => favoriteAt(index + 1)),
        2,
      ),
    );
    await act(async () => retry?.click());
    await flush();
    expect(api.listChatRecordFavorites).toHaveBeenLastCalledWith({
      page: 2,
      pageSize: 20,
    });
  });

  it("serializes page removals so exact offset reloads stay authoritative", async () => {
    let rows = Array.from({ length: 42 }, (_, index) => favoriteAt(index + 1));
    const api = makeApi();
    vi.mocked(api.listChatRecordFavorites).mockImplementation(
      async ({ page = 1 } = {}) => formalPage(rows, page),
    );
    vi.mocked(api.removeChatRecordFavorite).mockImplementation(
      async (favoriteId) => {
        rows = rows.filter((row) => row.id !== favoriteId);
        return { deleted: true };
      },
    );
    await act(async () =>
      root.render(
        <MemoryRouter>
          <UserFavoritesPage api={api} language="zh" />
        </MemoryRouter>,
      ),
    );
    await flush();
    await act(async () =>
      Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.includes("下一页"))
        ?.click(),
    );
    await flush();
    await act(async () =>
      Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.includes("下一页"))
        ?.click(),
    );
    await flush();
    expect(document.body.textContent).toContain("A41的聊天记录");
    expect(document.body.textContent).toContain("A42的聊天记录");

    const [firstRemove, secondRemove] = Array.from(
      document.querySelectorAll<HTMLButtonElement>("button"),
    ).filter((button) => button.textContent?.includes("移除收藏"));
    await act(async () => {
      firstRemove?.click();
      secondRemove?.click();
    });
    await flush();

    expect(api.removeChatRecordFavorite).toHaveBeenCalledTimes(1);
    expect(api.removeChatRecordFavorite).toHaveBeenLastCalledWith("41");
    expect(api.listChatRecordFavorites).toHaveBeenLastCalledWith({
      page: 3,
      pageSize: 20,
    });
    expect(document.body.textContent).not.toContain("A41的聊天记录");
    expect(document.body.textContent).toContain("A42的聊天记录");

    await act(async () =>
      Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.includes("移除收藏"))
        ?.click(),
    );
    await flush();
    expect(api.removeChatRecordFavorite).toHaveBeenCalledTimes(2);
    expect(api.removeChatRecordFavorite).toHaveBeenLastCalledWith("42");
    expect(api.listChatRecordFavorites).toHaveBeenLastCalledWith({
      page: 2,
      pageSize: 20,
    });
  });

  it("guards same-tick duplicate removal and ignores its late success after paging", async () => {
    const removal = deferred<{ deleted: true }>();
    const api = makeApi();
    vi.mocked(api.removeChatRecordFavorite).mockReturnValue(removal.promise);
    let rows = Array.from({ length: 21 }, (_, index) => ({
      ...favoriteAt(index + 1),
      preview: `A: page-${index < 20 ? "one" : "later"}`,
    }));
    vi.mocked(api.removeChatRecordFavorite).mockImplementation(() =>
      removal.promise.then((result) => {
        rows = rows.filter((row) => row.id !== "1");
        return result;
      }),
    );
    vi.mocked(api.listChatRecordFavorites).mockImplementation(
      async ({ page = 1 } = {}) => formalPage(rows, page),
    );
    await act(async () =>
      root.render(
        <MemoryRouter>
          <UserFavoritesPage api={api} language="zh" />
        </MemoryRouter>,
      ),
    );
    await flush();
    const remove = Array.from(
      document.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.includes("移除收藏"))!;
    await act(async () => {
      remove.click();
      remove.click();
    });
    expect(api.removeChatRecordFavorite).toHaveBeenCalledTimes(1);
    await act(async () =>
      Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.includes("下一页"))
        ?.click(),
    );
    await flush();
    expect(document.body.textContent).toContain("page-later");
    removal.resolve({ deleted: true });
    await flush();
    expect(document.body.textContent).toContain("page-later");
    expect(
      vi
        .mocked(api.listChatRecordFavorites)
        .mock.calls.filter(([query]) => query?.page === 2),
    ).toHaveLength(1);
  });

  it("returns from an emptied later page and loads the preceding page", async () => {
    const api = makeApi();
    let rows = Array.from({ length: 21 }, (_, index) => favoriteAt(index + 1));
    vi.mocked(api.listChatRecordFavorites).mockImplementation(
      async ({ page = 1 } = {}) => formalPage(rows, page),
    );
    vi.mocked(api.removeChatRecordFavorite).mockImplementation(
      async (favoriteId) => {
        rows = rows.filter((row) => row.id !== favoriteId);
        return { deleted: true };
      },
    );
    await act(async () =>
      root.render(
        <MemoryRouter>
          <UserFavoritesPage api={api} language="zh" />
        </MemoryRouter>,
      ),
    );
    await flush();
    await act(async () =>
      Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.includes("下一页"))
        ?.click(),
    );
    await flush();
    await act(async () =>
      Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.includes("移除收藏"))
        ?.click(),
    );
    await flush();
    expect(api.listChatRecordFavorites).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 20,
    });
  });

  it("reloads the origin page when a late removal completes after leaving and returning", async () => {
    const removal = deferred<{ deleted: true }>();
    let rows = Array.from({ length: 21 }, (_, index) => favoriteAt(index + 1));
    const api = makeApi();
    vi.mocked(api.listChatRecordFavorites).mockImplementation(
      async ({ page = 1 } = {}) => formalPage(rows, page),
    );
    vi.mocked(api.removeChatRecordFavorite).mockImplementation(() =>
      removal.promise.then((result) => {
        rows = rows.filter((row) => row.id !== "1");
        return result;
      }),
    );
    await act(async () =>
      root.render(
        <MemoryRouter>
          <UserFavoritesPage api={api} language="zh" />
        </MemoryRouter>,
      ),
    );
    await flush();
    const remove = Array.from(
      document.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.includes("移除收藏"))!;
    await act(async () => remove.click());
    await act(async () =>
      Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.includes("下一页"))
        ?.click(),
    );
    await flush();
    await act(async () =>
      Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.includes("上一页"))
        ?.click(),
    );
    await flush();
    removal.resolve({ deleted: true });
    await flush();
    expect(document.body.textContent).not.toContain("A1的聊天记录");
    expect(document.body.textContent).toContain("A21的聊天记录");
    expect(
      vi
        .mocked(api.listChatRecordFavorites)
        .mock.calls.filter(([query]) => query?.page === 1),
    ).toHaveLength(3);
  });

  it("loads the updated origin page by normal paging after late success on another page", async () => {
    const removal = deferred<{ deleted: true }>();
    let rows = Array.from({ length: 21 }, (_, index) => favoriteAt(index + 1));
    const api = makeApi();
    vi.mocked(api.listChatRecordFavorites).mockImplementation(
      async ({ page = 1 } = {}) => formalPage(rows, page),
    );
    vi.mocked(api.removeChatRecordFavorite).mockImplementation(() =>
      removal.promise.then((result) => {
        rows = rows.filter((row) => row.id !== "1");
        return result;
      }),
    );
    await act(async () =>
      root.render(
        <MemoryRouter>
          <UserFavoritesPage api={api} language="zh" />
        </MemoryRouter>,
      ),
    );
    await flush();
    const remove = Array.from(
      document.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.includes("移除收藏"))!;
    await act(async () => remove.click());
    await act(async () =>
      Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.includes("下一页"))
        ?.click(),
    );
    await flush();
    removal.resolve({ deleted: true });
    await flush();
    expect(document.body.textContent).toContain("A21的聊天记录");
    expect(
      vi
        .mocked(api.listChatRecordFavorites)
        .mock.calls.filter(([query]) => query?.page === 2),
    ).toHaveLength(1);
    await act(async () =>
      Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.includes("上一页"))
        ?.click(),
    );
    await flush();
    expect(document.body.textContent).not.toContain("A1的聊天记录");
    expect(document.body.textContent).toContain("A21的聊天记录");
    expect(
      vi
        .mocked(api.listChatRecordFavorites)
        .mock.calls.filter(([query]) => query?.page === 1),
    ).toHaveLength(2);
  });

  it("renders complete English favorites navigation and removal copy", async () => {
    const api = makeApi();
    await act(async () =>
      root.render(
        <MemoryRouter>
          <UserFavoritesPage api={api} language="en" />
        </MemoryRouter>,
      ),
    );
    await flush();
    expect(document.body.textContent).toContain("My favorites");
    expect(document.body.textContent).toContain("Saved chat records");
    expect(document.body.textContent).toContain("A1's chat history");
    expect(document.body.textContent).toContain("Remove favorite");
    expect(document.body.textContent).toContain("Previous page");
    expect(document.body.textContent).toContain("Next page");
  });
});
