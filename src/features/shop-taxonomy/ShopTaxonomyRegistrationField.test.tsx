// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { ShopTaxonomyRegistrationField } from "./ShopTaxonomyRegistrationField";

describe("ShopTaxonomyRegistrationField", () => {
  it("loads keywords only after their service category is selected", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const api = {
      listCategories: vi.fn(async () => ({
        list: [{ id: 1, code: "massage", label: "按摩", qualificationPolicy: "OPEN" }],
        total: 1,
        page: 1,
        page_size: 100
      })),
      listKeywords: vi.fn(async () => ({
        list: [{ id: 10, code: "massage_home", categoryId: 1, label: "上门按摩", qualificationPolicy: "OPEN" }],
        total: 1,
        page: 1,
        page_size: 100
      })),
      getMine: vi.fn(),
      replaceMine: vi.fn()
    };
    const onChange = vi.fn();

    await act(async () => root.render(
      <ShopTaxonomyRegistrationField api={api} language="zh" onChange={onChange} value={{ serviceCategoryIds: [], businessKeywordIds: [] }} />
    ));
    await act(async () => { await Promise.resolve(); });
    expect(api.listKeywords).not.toHaveBeenCalled();

    const categoryButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("按摩"));
    await act(async () => categoryButton?.click());
    expect(onChange).toHaveBeenCalledWith({ serviceCategoryIds: [1], businessKeywordIds: [] });
  });
});
