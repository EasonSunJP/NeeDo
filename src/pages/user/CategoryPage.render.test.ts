import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { CategoryPage } from "./CategoryPage";

type QueryKey = "categories" | "service" | "shop" | "technician";
type QueryState = {
  data: unknown;
  error: string | null;
  loading: boolean;
};

const queryHarness = vi.hoisted(() => ({
  calls: [] as QueryKey[],
  queries: {} as Partial<Record<QueryKey, unknown>>,
  states: {} as Record<QueryKey, QueryState>
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
  reviewSummary
};

const technician = {
  id: 21,
  publicId: "s0000000021",
  displayName: "橘 ひかり",
  city: "Tokyo",
  avatarUrl: null,
  reviewSummary
};

function page<T>(list: T[]) {
  return { list, total: list.length, page: 1, page_size: 40 };
}

function resetQueryStates(overrides: Partial<Record<QueryKey, QueryState>> = {}) {
  queryHarness.calls = [];
  queryHarness.queries = {};
  queryHarness.states = {
    categories: { data: page([category]), error: null, loading: false },
    shop: { data: page([shop]), error: null, loading: false },
    technician: { data: page([technician]), error: null, loading: false },
    service: { data: page([]), error: null, loading: false },
    ...overrides
  };
}

function renderCategoryPage(path: string) {
  return renderToString(
    createElement(MemoryRouter, { initialEntries: [path] }, createElement(CategoryPage))
  );
}

vi.mock("../../components/client-ui/FeatureCarousel", () => ({
  featureCarouselFrameClassName: "",
  FeatureCarousel: ({ slides }: { slides: unknown[] }) => createElement("div", { "data-slide-count": slides.length })
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

vi.mock("../../shared/profile-card", () => ({
  getTechnicianDynamicPath: (value: { id: string }) => `/profiles/technician/${value.id}`,
  TechnicianShowcaseCard: ({ technician: value }: { technician: { name: string } }) => createElement("article", null, value.name),
  UnifiedSimpleProfileCard: ({ store, technician: value }: { store?: { name: string }; technician?: { name: string } }) =>
    createElement("article", null, store?.name ?? value?.name ?? "")
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
  useI18n: () => ({ language: "zh" }),
  useOptionalI18n: () => ({ language: "zh" })
}));

describe("CategoryPage formal category state", () => {
  it("renders the real empty state when the category API returns no records", () => {
    resetQueryStates({ categories: { data: page([]), error: null, loading: false } });
    const html = renderCategoryPage("/categories");

    expect(html).toContain("没有找到匹配的标签或分类");
  });

  it("renders a shop and technician returned without a service result", () => {
    resetQueryStates();
    const html = renderCategoryPage("/categories");

    expect(html).toContain("LifeDance Wellness 渋谷");
    expect(html).toContain("橘 ひかり");
  });

  it("keeps successful sections and a scoped retry when one entity request fails", () => {
    resetQueryStates({ shop: { data: null, error: "error.network", loading: false } });
    const html = renderCategoryPage("/categories");

    expect(html).toContain("店铺搜索读取失败");
    expect(html).toContain("重试");
    expect(html).toContain("橘 ひかり");
  });

  it("loads only the adapter selected by the entity filter", () => {
    resetQueryStates();
    renderCategoryPage("/categories?type=store");

    expect(queryHarness.calls).toEqual(["categories", "shop"]);
  });

  it("passes every selected formal category as an OR query value", () => {
    resetQueryStates({
      categories: { data: page([category, movingCategory]), error: null, loading: false }
    });
    renderCategoryPage("/categories?type=store&tag=tag-massage-door&tag=tag-moving-city");

    expect(queryHarness.queries.shop).toMatchObject({ categoryIds: [3, 19] });
  });
});
