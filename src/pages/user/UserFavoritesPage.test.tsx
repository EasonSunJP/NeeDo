/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import appSource from "../../App.tsx?raw";
import type { UnifiedFavoriteItem, UnifiedFavoritePage } from "../../features/favorites/model";
import { UserFavoritesPage, type FavoritesTimelineApi } from "./UserFavoritesPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function favorite(overrides: Partial<UnifiedFavoriteItem> = {}): UnifiedFavoriteItem {
  return {
    key: "shop:shop:shop0000000001",
    type: "shop",
    itemKey: "shop:shop0000000001",
    title: "StagingTest",
    summary: "东京店铺",
    imageUrl: null,
    detailPath: "/stores/shop0000000001",
    favoritedAt: "2026-09-20T15:05:00.000Z",
    activityAt: "2026-09-20T15:05:00.000Z",
    pinnedAt: null,
    reaction: null,
    canForward: true,
    canDelete: true,
    ...overrides,
  };
}

function page(list: UnifiedFavoriteItem[]): UnifiedFavoritePage {
  return { list, total: list.length, page: 1, page_size: 20 };
}

function makeApi(rows = [favorite()]): FavoritesTimelineApi {
  return {
    list: vi.fn(async () => page(rows)),
    removeSourceFavorite: vi.fn(async () => ({ deleted: true as const })),
    setPinned: vi.fn(async (type, itemKey, active) => ({
      itemType: type,
      itemKey,
      pinnedAt: active ? "2026-09-21T00:00:00.000Z" : null,
      reaction: null,
      updatedAt: "2026-09-21T00:00:00.000Z",
    })),
    setReaction: vi.fn(async (type, itemKey, reaction) => ({
      itemType: type,
      itemKey,
      pinnedAt: null,
      reaction,
      updatedAt: "2026-09-21T00:00:00.000Z",
    })),
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("UserFavoritesPage", () => {
  it("keeps the timeline route outside the initial application bundle", () => {
    expect(appSource).toContain('lazy(() => import("./pages/user/UserFavoritesPage")');
    expect(appSource).toContain("<Suspense fallback={null}><UserFavoritesRoutePage /></Suspense>");
  });

  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("renders six header tabs and the unified Tokyo date timeline", async () => {
    const api = makeApi([
      favorite({ key: "shop:new", title: "今天项目", activityAt: "2026-09-20T15:05:00.000Z" }),
      favorite({ key: "service:old", type: "service", title: "昨天项目", activityAt: "2026-09-20T14:59:00.000Z" }),
    ]);
    await act(async () => root.render(
      <MemoryRouter>
        <UserFavoritesPage api={api} language="zh" now={() => new Date("2026-09-20T15:30:00.000Z")} />
      </MemoryRouter>,
    ));
    await flush();

    expect(Array.from(container.querySelectorAll('[role="tab"]')).map((tab) => tab.textContent)).toEqual([
      "全部", "店铺", "技师", "服务", "动态", "聊天记录",
    ]);
    expect(container.textContent).toContain("今天");
    expect(container.textContent).toContain("昨天");
    expect(container.textContent?.indexOf("今天项目")).toBeLessThan(container.textContent?.indexOf("昨天项目") ?? 0);
    expect(api.list).toHaveBeenCalledWith({ type: undefined, query: undefined, page: 1, pageSize: 20 });
  });

  it("queries the selected category and keeps the search term", async () => {
    const api = makeApi();
    await act(async () => root.render(<MemoryRouter><UserFavoritesPage api={api} language="zh" /></MemoryRouter>));
    await flush();
    const searchButton = container.querySelector<HTMLButtonElement>('button[aria-label="搜索收藏"]')!;
    await act(async () => searchButton.click());
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "东京");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flush();
    const serviceTab = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((tab) => tab.textContent === "服务")!;
    await act(async () => serviceTab.click());
    await flush();
    expect(api.list).toHaveBeenLastCalledWith({ type: "service", query: "东京", page: 1, pageSize: 20 });
  });

  it("uses the formal pin command and reloads the authoritative page", async () => {
    const api = makeApi();
    await act(async () => root.render(<MemoryRouter><UserFavoritesPage api={api} language="zh" /></MemoryRouter>));
    await flush();
    const pin = container.querySelector<HTMLButtonElement>('[data-swipe-action-key="pin"]')!;
    await act(async () => pin.click());
    await flush();
    expect(api.setPinned).toHaveBeenCalledWith("shop", "shop:shop0000000001", true);
    expect(api.list).toHaveBeenCalledTimes(2);
  });
});
