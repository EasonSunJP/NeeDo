// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../../api/httpClient";
import { ShopServiceTaxonomyEditor } from "./ShopServiceTaxonomyEditor";
import type { ShopTaxonomyApi } from "./api";

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

const category = (id: number, label: string) => ({
  id,
  code: `category_${id}`,
  label,
  qualificationPolicy: "OPEN"
});

const keyword = (id: number, categoryId: number, label: string) => ({
  id,
  code: `keyword_${id}`,
  categoryId,
  label,
  qualificationPolicy: "OPEN"
});

function button(container: HTMLElement, label: string) {
  const target = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes(label));
  if (!target) throw new Error(`missing button ${label}`);
  return target;
}

describe("ShopServiceTaxonomyEditor", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let api: ShopTaxonomyApi;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    api = {
      listCategories: vi.fn(async () => ({ list: [category(1, "按摩"), category(2, "家政")], total: 2, page: 1, page_size: 100 })),
      listKeywords: vi.fn(async (categoryId) => ({
        list: categoryId === 1 ? [keyword(10, 1, "上门按摩")] : [keyword(20, 2, "深度保洁")],
        total: 1,
        page: 1,
        page_size: 100
      })),
      getMine: vi.fn(async () => ({
        revision: 3,
        categoryLimit: 5,
        keywordLimit: 5,
        selectedCategories: [category(1, "按摩")],
        selectedKeywords: [keyword(10, 1, "上门按摩")],
        removedKeywordIds: []
      })),
      replaceMine: vi.fn(async (_locale, input) => ({
        revision: 4,
        categoryLimit: 5,
        keywordLimit: 5,
        selectedCategories: input.categoryIds.map((id: number) => category(id, id === 1 ? "按摩" : "家政")),
        selectedKeywords: input.keywordIds.map((id: number) => keyword(id, id === 10 ? 1 : 2, id === 10 ? "上门按摩" : "深度保洁")),
        removedKeywordIds: []
      }))
    };
  });

  it("selects keywords only under selected categories and saves the full replacement", async () => {
    const onSavedKeywords = vi.fn();
    await act(async () => root.render(<ShopServiceTaxonomyEditor api={api} language="zh" onSavedKeywords={onSavedKeywords} />));
    await flush();

    expect(container.textContent).toContain("已选关键词 1/5");
    expect(container.textContent).toContain("上门按摩");
    expect(container.textContent).not.toContain("深度保洁");

    await act(async () => button(container, "家政").click());
    await flush();
    await act(async () => button(container, "深度保洁").click());
    await act(async () => button(container, "保存服务标签").click());
    await flush();

    expect(api.replaceMine).toHaveBeenCalledWith("zh-CN", expect.objectContaining({
      categoryIds: [1, 2],
      keywordIds: [10, 20],
      expectedRevision: 3,
      idempotencyKey: expect.any(String)
    }));
    expect(onSavedKeywords).toHaveBeenCalledWith(["上门按摩", "深度保洁"]);
  });

  it("shows dependent removal and preserves the draft while refreshing revision after a conflict", async () => {
    vi.mocked(api.replaceMine).mockRejectedValueOnce(new ApiClientError("error.version_conflict", 40901, 409));
    vi.mocked(api.getMine)
      .mockResolvedValueOnce({
        revision: 3,
        categoryLimit: 5,
        keywordLimit: 5,
        selectedCategories: [category(1, "按摩")],
        selectedKeywords: [keyword(10, 1, "上门按摩")],
        removedKeywordIds: []
      })
      .mockResolvedValueOnce({
        revision: 8,
        categoryLimit: 5,
        keywordLimit: 5,
        selectedCategories: [category(1, "按摩")],
        selectedKeywords: [keyword(10, 1, "上门按摩")],
        removedKeywordIds: []
      });

    await act(async () => root.render(<ShopServiceTaxonomyEditor api={api} language="zh" />));
    await flush();
    await act(async () => button(container, "按摩").click());
    expect(container.textContent).toContain("将同时移除 1 个关键词");
    await act(async () => button(container, "保存服务标签").click());
    await flush();

    expect(container.textContent).toContain("服务器资料已更新");
    expect(container.textContent).toContain("已选服务种类 0/5");
    expect(api.getMine).toHaveBeenCalledTimes(2);
  });
});
