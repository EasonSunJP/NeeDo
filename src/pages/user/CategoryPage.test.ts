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
    expect(technicianShowcaseCardSource).toContain('taxSuffix: "含税"');
    expect(technicianShowcaseCardSource).toContain('taxSuffix: "세금 포함"');
    expect(technicianShowcaseCardSource).not.toContain('taxSuffix: "税后"');
    expect(technicianShowcaseCardSource).not.toContain('taxSuffix: "세후"');
    expect(categoryPageSource).toContain("language={language}");
    expect(technicianShowcaseCardSource).toContain("{duration}{copy.minuteSuffix}({copy.taxSuffix})");
  });

  it("keeps the shared metric layout branch available for category technician cards", () => {
    expect(technicianShowcaseCardSource).toContain('metricLayout = "cluster"');
    expect(technicianShowcaseCardSource).toContain('metricLayout === "split"');
    expect(technicianShowcaseCardSource).toContain("absolute left-2 top-2 z-20 flex items-start justify-between gap-1");
    expect(technicianShowcaseCardSource).toContain('metricLayout === "split" ? "right-[5px]" : "right-2"');
  });

  it("keeps the expanded entity filter to store, technician, and service only", () => {
    expect(categoryPageSource).toContain('const entityFilterMenuTags = entityFilterTags.filter((tag) => tag.value !== "all");');
    expect(categoryPageSource).toContain('className="mt-4 grid grid-cols-3 gap-2"');
  });

  it("does not apply the default category to a custom keyword search", () => {
    expect(categoryPageSource).toContain(
      'const hasExplicitCategoryScope = Boolean(searchParams.get("category")) || appliedTagIds.length > 0;'
    );
    expect(categoryPageSource).toContain(
      'const shouldApplyCategoryScope = hasExplicitCategoryScope || (appliedCustomLabels.length === 0 && entityFilter !== "technician");'
    );
    expect(categoryPageSource).toContain(
      "const searchCategoryId = shouldApplyCategoryScope ? apiCategoryId : undefined;"
    );
  });

  it("shows up to 20 technician cards and routes cards through the technician dynamic path", () => {
    expect(categoryPageSource).toContain('pageSize: 40');
    expect(categoryPageSource).toContain('entityFilter === "technician" ? 20');
    expect(categoryPageSource).toContain("getTechnicianDynamicPath(item.technician)");
  });

  it("disables legacy category content", () => {
    expect(categoryPageSource).toContain("searchQuery.data?.list.map(mapCoreServiceToServiceItem) ?? []");
    expect(categoryPageSource).not.toContain("legacyServices");
    expect(categoryPageSource).not.toContain("legacyStores");
    expect(categoryPageSource).not.toContain("legacyTechnicians");
    expect(categoryPageSource).not.toContain("data/mock");
  });
});
