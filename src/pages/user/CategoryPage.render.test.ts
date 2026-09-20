/** @vitest-environment jsdom */

import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { entityEngagementApi } from "../../features/entity-engagement/api";
import { ClientThemeProvider } from "../../theme/ClientThemeProvider";
import { CategoryPage } from "./CategoryPage";

type QueryKey = "categories" | "service" | "shop" | "technician";
type QueryState = {
  data: unknown;
  error: string | null;
  loading: boolean;
};
type LocationHarness = {
  config: {
    selectedLocationId: string;
    locations: Array<{
      id: string;
      coordinates?: { lat: number; lng: number };
    }>;
  };
  state: {
    promptStatus: "unrequested" | "granted" | "denied" | "unavailable" | "error";
    source: "default" | "device" | "manual";
    coordinates?: { lat: number; lng: number };
  };
};

const queryHarness = vi.hoisted(() => ({
  calls: [] as QueryKey[],
  queries: {} as Partial<Record<QueryKey, unknown>>,
  states: {} as Record<QueryKey, QueryState>
}));

const locationHarness = vi.hoisted((): LocationHarness => ({
  config: {
    selectedLocationId: "tokyo-service",
    locations: [
      {
        id: "tokyo-service",
        coordinates: { lat: 35.6555, lng: 139.7367 }
      }
    ]
  },
  state: { promptStatus: "unrequested", source: "default" }
}));

const authHarness = vi.hoisted(() => ({ isAuthenticated: false }));
const i18nHarness = vi.hoisted(() => ({
  language: "zh" as "zh" | "zh-Hant" | "ja" | "en" | "ko"
}));

const category = {
  id: 3,
  code: "wellness",
  name: "Wellness",
  nameJa: "ウェルネス",
  nameEn: "Wellness",
  parentId: null,
  iconUrl: null,
  sortOrder: 1,
  isActive: true,
  createdAt: "2026-08-31T00:00:00.000Z",
  updatedAt: "2026-08-31T00:00:00.000Z"
};

const cleaningCategory = {
  ...category,
  id: 4,
  code: "cleaning",
  name: "Cleaning",
  nameJa: "清掃",
  nameEn: "Cleaning"
};

const movingCategory = {
  ...category,
  id: 19,
  code: "moving",
  name: "Moving",
  nameJa: "引っ越し",
  nameEn: "Moving"
};

const reviewSummary = {
  ratingAverage: "0",
  reviewCount: 0,
  latestReviewAt: null,
  highlights: []
};

const shop = {
  id: 217,
  publicId: "shop0000000217",
  name: "LifeDance Wellness 渋谷",
  city: "Tokyo",
  address: "Shibuya",
  coverUrl: null,
  reviewSummary,
  favoriteCount: 2049,
  shareCount: 29,
  serviceCategories: [{ id: 3, code: "wellness", label: "放松" }],
  businessKeywords: [{ id: 31, code: "private", categoryId: 3, label: "包间" }]
};

const technician = {
  id: 21,
  publicId: "s0000000021",
  displayName: "橘 ひかり",
  city: "Tokyo",
  avatarUrl: null,
  reviewSummary,
  age: 25,
  favoriteCount: 154,
  shareCount: 8,
  completedOrderCount: 1280,
  acceptanceRatePercent: 98,
  primaryService: {
    id: 71,
    name: "肩颈调理",
    priceAmount: "8800",
    currency: "JPY",
    durationMinutes: 60
  }
};

const service = {
  id: 71,
  publicId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: "肩颈调理",
  description: "肩颈护理服务",
  category,
  shop,
  technician,
  city: "Tokyo",
  priceAmount: "8800",
  currency: "JPY",
  durationMinutes: 60,
  usageCount: 18,
  coverUrl: null,
  reviewSummary,
  serviceMode: "store"
};

function page<T>(list: T[]) {
  return { list, total: list.length, page: 1, page_size: 40 };
}

function resetQueryStates(overrides: Partial<Record<QueryKey, QueryState>> = {}) {
  queryHarness.calls = [];
  queryHarness.queries = {};
  queryHarness.states = {
    categories: { data: page([cleaningCategory, category]), error: null, loading: false },
    shop: { data: page([shop]), error: null, loading: false },
    technician: { data: page([technician]), error: null, loading: false },
    service: { data: page([]), error: null, loading: false },
    ...overrides
  };
  locationHarness.config = {
    selectedLocationId: "tokyo-service",
    locations: [
      {
        id: "tokyo-service",
        coordinates: { lat: 35.6555, lng: 139.7367 }
      }
    ]
  };
  locationHarness.state = { promptStatus: "unrequested", source: "default" };
  authHarness.isAuthenticated = false;
  i18nHarness.language = "zh";
}

function renderCategoryPage(path: string) {
  return renderToString(
    createElement(
      ClientThemeProvider,
      null,
      createElement(MemoryRouter, { initialEntries: [path] }, createElement(CategoryPage))
    )
  );
}

vi.mock("../../components/client-ui/FeatureCarousel", () => ({
  featureCarouselFrameClassName: "",
  FeatureCarousel: ({ slides }: { slides: unknown[] }) => createElement("div", { "data-slide-count": slides.length })
}));

vi.mock("../../features/content-publication/PublishedCarousel", () => ({
  PublishedCarousel: ({ scene }: { scene: string }) => createElement("div", { "data-carousel-scene": scene })
}));

vi.mock("../../auth/AuthProvider", () => ({
  useOptionalAuth: () => authHarness
}));

vi.mock("../../components/mobile/FloatingHomeHeader", () => ({
  FloatingHomeHeader: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  floatingHeaderGlassPanelClassName: "",
  floatingHeaderPillSurfaceClassName: "",
  floatingHeaderSearchFieldClassName: "",
  floatingHeaderSearchIconClassName: "",
  floatingHeaderSearchInputClassName: ""
}));

vi.mock("../../components/mobile/MobileShell", () => ({
  MobileShell: ({ children }: { children: ReactNode }) => createElement("main", null, children)
}));

vi.mock("../../features/core-read/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../features/core-read/api")>();
  const marker = (key: QueryKey) => {
    queryHarness.calls.push(key);
    return { __queryKey: key };
  };

  return {
    ...actual,
    coreReadApi: {
      ...actual.coreReadApi,
      listCategories: () => marker("categories"),
      searchServices: (query: unknown) => {
        queryHarness.queries.service = query;
        return marker("service");
      },
      searchShops: (query: unknown) => {
        queryHarness.queries.shop = query;
        return marker("shop");
      },
      searchTechnicians: (query: unknown) => {
        queryHarness.queries.technician = query;
        return marker("technician");
      }
    }
  };
});

vi.mock("../../features/core-read/hooks", () => ({
  useCoreReadQuery: (load: () => { __queryKey: QueryKey } | null) => {
    const request = load();
    return request ? queryHarness.states[request.__queryKey] : { data: null, error: null, loading: false };
  }
}));

vi.mock("../../i18n/I18nProvider", () => ({
  useI18n: () => ({ language: i18nHarness.language }),
  useOptionalI18n: () => ({ language: i18nHarness.language })
}));

vi.mock("../../state/homeLayoutStore", () => ({
  useHomeLayoutStore: () => ({ config: locationHarness.config })
}));

vi.mock("../../state/homeLocationStore", () => ({
  useHomeLocationPreference: () => ({ state: locationHarness.state })
}));

describe("CategoryPage formal category state", () => {
  it("defaults an unscoped search entry to shops instead of all entities", () => {
    resetQueryStates();
    const html = renderCategoryPage("/categories");

    expect(queryHarness.calls).toEqual(["categories", "shop"]);
    expect(html).toContain("店铺");
    expect(html).not.toContain(">全部<");
  });

  it("renders Japanese search controls and result-card accessibility copy without mixed Chinese", () => {
    resetQueryStates({ service: { data: page([service]), error: null, loading: false } });
    i18nHarness.language = "ja";

    const html = renderCategoryPage("/categories?type=service");

    expect(html).toContain('placeholder="キーワードを入力"');
    expect(html).toContain('aria-label="キーワードを検索"');
    expect(html).toContain(">検索</button>");
    expect(html).toContain('aria-label="完了件数"');
    expect(html).toContain('aria-label="現在地から"');
    expect(html).toContain('aria-label="サービスを見る 肩颈调理"');
    expect(html).not.toMatch(/に追加|完特異|距離你|正在|搜索|载入|读取/u);
  });

  it("renders the page-level loading state in Japanese", () => {
    resetQueryStates({
      categories: { data: null, error: null, loading: true },
      service: { data: null, error: null, loading: true },
      shop: { data: null, error: null, loading: true },
      technician: { data: null, error: null, loading: true }
    });
    i18nHarness.language = "ja";

    const html = renderCategoryPage("/categories");

    expect(html).toContain("検索結果を読み込んでいます");
    expect(html).toContain("サービスとカテゴリを検索しています。");
    expect(html).not.toMatch(/正在|载入|读取/u);
  });

  it("renders the real empty state when the category API returns no records", () => {
    resetQueryStates({ categories: { data: page([]), error: null, loading: false } });
    const html = renderCategoryPage("/categories");

    expect(html).toContain("没有找到匹配结果");
  });

  it("renders only shops on the default search scope", () => {
    resetQueryStates();
    const html = renderCategoryPage("/categories");

    expect(html).toContain("LifeDance Wellness 渋谷");
    expect(html).not.toContain("橘 ひかり");
    expect(html).not.toContain('data-testid="technician-showcase-card"');
    expect(html).not.toContain("肩颈调理");
    expect(html).toContain("包间");
    expect(html).not.toContain(">放松<");
  });

  it("keeps older search responses usable without inventing missing card metrics", () => {
    const {
      businessKeywords: _businessKeywords,
      favoriteCount: _shopFavoriteCount,
      shareCount: _shopShareCount,
      ...olderShop
    } = shop;
    const {
      acceptanceRatePercent: _acceptanceRatePercent,
      age: _age,
      favoriteCount: _technicianFavoriteCount,
      primaryService: _primaryService,
      shareCount: _technicianShareCount,
      ...olderTechnician
    } = technician;
    resetQueryStates({
      shop: { data: page([olderShop]), error: null, loading: false },
      technician: { data: page([olderTechnician]), error: null, loading: false }
    });

    const html = renderCategoryPage("/categories");

    expect(html).toContain("LifeDance Wellness 渋谷");
    expect(html).toContain("收藏");
    expect(html).toContain("分享");
    expect(html).toContain(">-<");
    expect(html).not.toContain("未读取");
  });

  it("keeps the bare category route unfiltered within the default shop scope", () => {
    resetQueryStates();
    renderCategoryPage("/categories");

    expect(queryHarness.queries.shop).toMatchObject({ categoryIds: [] });
    expect(queryHarness.queries.technician).toBeUndefined();
    expect(queryHarness.queries.service).toBeUndefined();
    expect(queryHarness.queries.shop).not.toHaveProperty("latitude");
  });

  it("keeps a service module fulfillment mode in the category-page API queries", () => {
    resetQueryStates();
    renderCategoryPage("/categories?type=service&category=cleaning&mode=home");

    expect(queryHarness.queries.service).toMatchObject({
      categoryIds: [4],
      serviceMode: "home",
    });
  });

  it("shows location guidance separately when technician ranking has no origin", () => {
    resetQueryStates();
    locationHarness.config = {
      selectedLocationId: "tokyo-service",
      locations: [{ id: "tokyo-service", coordinates: undefined }]
    };
    locationHarness.state = { promptStatus: "denied", source: "default" };

    const html = renderCategoryPage("/categories?type=technician");

    expect(queryHarness.queries.technician).not.toHaveProperty("latitude");
    expect(html).toContain("开启首页服务位置或设备定位后，可查看附近技师排名。");
    expect(html).toContain("橘 ひかり");
  });

  it("keeps a scoped retry when the selected entity request fails", () => {
    resetQueryStates({ shop: { data: null, error: "error.network", loading: false } });
    const html = renderCategoryPage("/categories");

    expect(html).toContain("店铺 · 搜索失败，请稍后重试");
    expect(html).toContain("重试");
    expect(html).not.toContain("橘 ひかり");
  });

  it.each([
    ["store", "shop"],
    ["technician", "technician"],
    ["service", "service"]
  ] as const)("loads all %s results without silently applying the cleaning category", (entityType, queryKey) => {
    resetQueryStates();
    renderCategoryPage(`/categories?type=${entityType}`);

    expect(queryHarness.calls).toEqual(["categories", queryKey]);
    expect(queryHarness.queries[queryKey]).toMatchObject({ categoryIds: [] });
  });

  it("does not present cleaning as an active filter on an entity-only entry", () => {
    resetQueryStates();
    const html = renderCategoryPage("/categories?type=store");
    const container = document.createElement("div");
    container.innerHTML = html;
    const cleaningTag = [...container.querySelectorAll("button")].find((button) => button.textContent === "家政");

    expect(cleaningTag?.querySelector("span")?.className).toContain("var(--client-text)");
    expect(cleaningTag?.querySelector("span")?.className).not.toContain("var(--client-primary)");
  });

  it("reuses the formal homepage carousel above search results", () => {
    resetQueryStates();
    const html = renderCategoryPage("/categories?type=store");

    expect(html).toContain('data-carousel-scene="user-home"');
  });

  it("passes every selected formal category as an OR query value", () => {
    resetQueryStates({
      categories: { data: page([category, movingCategory]), error: null, loading: false }
    });
    renderCategoryPage("/categories?type=store&tag=tag-massage-door&tag=tag-moving-city");

    expect(queryHarness.queries.shop).toMatchObject({ categoryIds: [3, 19] });
  });

  it("loads favorite status for all visible shops and technicians in one page-level batch", async () => {
    resetQueryStates();
    authHarness.isAuthenticated = true;
    const getFavoriteStatuses = vi.spyOn(entityEngagementApi, "getFavoriteStatuses").mockResolvedValue({
      list: [
        {
          targetType: "shop",
          publicId: shop.publicId,
          favoriteCount: 2050,
          isFavorited: true
        },
        {
          targetType: "technician",
          publicId: technician.publicId,
          favoriteCount: 154,
          isFavorited: false
        }
      ]
    });
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          createElement(
            ClientThemeProvider,
            null,
            createElement(MemoryRouter, { initialEntries: ["/categories"] }, createElement(CategoryPage))
          )
        );
        await Promise.resolve();
      });

      expect(getFavoriteStatuses).toHaveBeenCalledTimes(1);
      expect(getFavoriteStatuses).toHaveBeenCalledWith([
        { targetType: "shop", publicId: shop.publicId }
      ]);
      await expect
        .poll(() =>
          container.querySelector(
            'button[aria-label="取消收藏 LifeDance Wellness 渋谷"]',
          ),
        )
        .not.toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
      (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
      vi.restoreAllMocks();
    }
  });
});
