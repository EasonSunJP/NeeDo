import { describe, expect, it } from "vitest";
import categoryPageSource from "./CategoryPage.tsx?raw";
import formalSearchResultCardsSource from "../../features/core-read/FormalSearchResultCards.tsx?raw";

describe("CategoryPage service preview card", () => {
  it("keeps the short availability badge on one line", () => {
    expect(categoryPageSource).toContain('className="shrink-0 whitespace-nowrap" tone="green"');
  });
});

describe("CategoryPage formal entity cards", () => {
  it("routes card labels through i18n and keeps the tax-inclusive service line", () => {
    expect(formalSearchResultCardsSource).toContain('translateText("推荐服务", language)');
    expect(formalSearchResultCardsSource).toContain('translateText("接单率", language)');
    expect(formalSearchResultCardsSource).toContain('translateText("含税", language)');
    expect(formalSearchResultCardsSource).toContain("{primaryService.durationMinutes}{minuteLabel}({taxLabel})");
  });

  it("uses the approved portrait technician and horizontal shop structures", () => {
    expect(formalSearchResultCardsSource).toContain('aspect-[0.78]');
    expect(formalSearchResultCardsSource).toContain('grid-cols-[42%_1fr]');
    expect(formalSearchResultCardsSource).toContain('data-search-entity="technician"');
    expect(formalSearchResultCardsSource).toContain('data-search-entity="shop"');
  });

  it("keeps the expanded entity filter to store, technician, and service only", () => {
    expect(categoryPageSource).toContain('const entityFilterMenuTags = entityFilterTags.filter((tag) => tag.value !== "all");');
    expect(categoryPageSource).toContain('className="mt-4 grid grid-cols-3 gap-2"');
  });

  it("uses direct typed entity searches instead of deriving profiles from services", () => {
    expect(categoryPageSource).toContain("coreReadApi.searchShops");
    expect(categoryPageSource).toContain("coreReadApi.searchTechnicians");
    expect(categoryPageSource).toContain("coreReadApi.searchServices");
    expect(categoryPageSource).not.toContain('buildDisplayLabels(appliedTagIds, appliedCustomLabels).join(" ")');
    expect(categoryPageSource).not.toContain("searchQuery.data.list.flatMap");
    expect(categoryPageSource).not.toContain("matchesAllSearchKeywords");
  });

  it("routes new scoped search states through the existing i18n helper", () => {
    expect(categoryPageSource).toContain('title={`${t("店铺")} · ${t("搜索失败，请稍后重试")}`}');
    expect(categoryPageSource).toContain('title={`${t("技师")} · ${t("搜索失败，请稍后重试")}`}');
    expect(categoryPageSource).toContain('title={`${t("服务")} · ${t("搜索失败，请稍后重试")}`}');
  });

  it("shows up to 20 technician cards and routes cards to the formal profile", () => {
    expect(categoryPageSource).toContain('pageSize: 40');
    expect(categoryPageSource).toContain('entityFilter === "technician" ? 20');
    expect(formalSearchResultCardsSource).toContain('`/profiles/technician/${profile.id}`');
  });

  it("keeps direct shop and technician cards capability-neutral", () => {
    expect(categoryPageSource).toContain("serviceSearchQuery.data?.list.map(mapCoreServiceToServiceItem) ?? []");
    expect(categoryPageSource).toContain("shopSearchQuery.data?.list ?? []");
    expect(categoryPageSource).toContain("technicianSearchQuery.data?.list ?? []");
    expect(categoryPageSource).not.toContain("mapCoreShopToStore");
    expect(categoryPageSource).not.toContain("mapCoreTechnicianToTechnician");
    expect(categoryPageSource).not.toContain("TechnicianShowcaseCard");
    expect(categoryPageSource).toContain("FormalShopSearchCard");
    expect(categoryPageSource).toContain("FormalTechnicianSearchCard");
    expect(categoryPageSource).not.toContain("DirectSearchProfileCard");
    expect(categoryPageSource).not.toContain("legacyServices");
    expect(categoryPageSource).not.toContain("legacyStores");
    expect(categoryPageSource).not.toContain("legacyTechnicians");
    expect(categoryPageSource).not.toContain("data/mock");
  });
});
