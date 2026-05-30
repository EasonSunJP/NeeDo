import { describe, expect, it } from "vitest";
import categoryPageSource from "./CategoryPage.tsx?raw";
import technicianShowcaseCardSource from "../../shared/profile-card/TechnicianShowcaseCard.tsx?raw";

describe("CategoryPage service preview card", () => {
  it("keeps the short availability badge on one line", () => {
    expect(categoryPageSource).toContain('className="shrink-0 whitespace-nowrap" tone="green"');
  });
});

describe("CategoryPage technician showcase card", () => {
  it("uses localized Simplified Chinese labels instead of Japanese card UI copy", () => {
    expect(technicianShowcaseCardSource).toContain('recommended: "推荐"');
    expect(technicianShowcaseCardSource).toContain('recommendedService: "推荐服务"');
    expect(technicianShowcaseCardSource).toContain('taxSuffix: "税后"');
    expect(categoryPageSource).toContain("language={language}");
    expect(technicianShowcaseCardSource).toContain("{duration}{copy.minuteSuffix}({copy.taxSuffix})");
  });

  it("keeps the expanded entity filter to store, technician, and service only", () => {
    expect(categoryPageSource).toContain('const entityFilterMenuTags = entityFilterTags.filter((tag) => tag.value !== "all");');
    expect(categoryPageSource).toContain('className="mt-4 grid grid-cols-3 gap-2"');
  });

  it("shows up to 20 technician cards and routes cards through the technician dynamic path", () => {
    expect(categoryPageSource).toContain('pageSize: 40');
    expect(categoryPageSource).toContain('entityFilter === "technician" ? 20');
    expect(categoryPageSource).toContain('const searchCategoryId = entityFilter === "technician" && !hasExplicitCategoryScope ? undefined : apiCategoryId;');
    expect(categoryPageSource).toContain("getTechnicianDynamicPath(item.technician)");
  });

  it("keeps static category content visible when core-read data is unavailable", () => {
    expect(categoryPageSource).toContain("searchQuery.data?.list.map(mapCoreServiceToServiceItem) ?? legacyServices");
    expect(categoryPageSource).toContain("return legacyStores;");
    expect(categoryPageSource).toContain("return legacyTechnicians;");
    expect(categoryPageSource).toContain("hasStaticSearchContent ? null : categoryQuery.error ?? searchQuery.error");
  });
});
