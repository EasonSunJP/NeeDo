import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { CategoryPage } from "./CategoryPage";

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

vi.mock("../../features/core-read/hooks", () => ({
  useCoreReadQuery: (_load: unknown, deps: unknown[]) => ({
    data: deps.length === 0
      ? { list: [], total: 0, page: 1, page_size: 100 }
      : { list: [], total: 0, page: 1, page_size: 40 },
    error: null,
    loading: false
  })
}));

vi.mock("../../i18n/I18nProvider", () => ({
  useI18n: () => ({ language: "zh" }),
  useOptionalI18n: () => ({ language: "zh" })
}));

describe("CategoryPage formal category state", () => {
  it("renders the real empty state when the category API returns no records", () => {
    const html = renderToString(
      createElement(MemoryRouter, { initialEntries: ["/categories"] }, createElement(CategoryPage))
    );

    expect(html).toContain("没有找到匹配的标签或分类");
  });
});
