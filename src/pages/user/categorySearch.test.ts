import { describe, expect, it } from "vitest";
import { canRunCategorySearch, parseCategorySearchDraft } from "./categorySearch";

describe("parseCategorySearchDraft", () => {
  it("keeps a multi-word entity name as one fuzzy term", () => {
    expect(parseCategorySearchDraft("  LifeDance Wellness 渋谷  ", () => null)).toEqual({
      tagIds: [],
      customLabels: ["LifeDance Wellness 渋谷"]
    });
  });

  it("splits only explicit comma separators and de-duplicates terms", () => {
    expect(parseCategorySearchDraft("家政, 家政、ひかり", () => null)).toEqual({
      tagIds: [],
      customLabels: ["家政", "ひかり"]
    });
  });

  it("resolves a whole known tag without turning it into free text", () => {
    expect(parseCategorySearchDraft(
      "上门按摩",
      (value) => value === "上门按摩" ? { id: "tag-massage-door" } : null
    )).toEqual({
      tagIds: ["tag-massage-door"],
      customLabels: []
    });
  });
});

describe("canRunCategorySearch", () => {
  it("allows a fuzzy name query even when the retained home category has no formal mapping", () => {
    expect(canRunCategorySearch({
      selectedHomeCategoryIds: ["appliance"],
      searchCategoryIds: [],
      keywords: ["Tanak"]
    })).toBe(true);
  });
});
