import { describe, expect, it } from "vitest";
import categoryPageSource from "./CategoryPage.tsx?raw";
import homePageSource from "./HomePage.tsx?raw";

describe("CategoryPage service preview card", () => {
  it("delegates service previews to the shared unified service-information card", () => {
    expect(categoryPageSource).toContain("UnifiedServiceInfoCard");
    expect(categoryPageSource).toContain("mapServiceItemToUnifiedData(service)");
    expect(categoryPageSource).not.toContain("getGeneratedImageThumbnailUrl(service.cover)");
    expect(categoryPageSource).toContain("<ServicePreviewCard key={service.id} language={language} service={service} />");
  });
});

describe("CategoryPage formal entity cards", () => {
  it("reuses the homepage shop and technician card components", () => {
    expect(homePageSource).toContain("SocialProfileMiniCard");
    expect(homePageSource).toContain("TechnicianShowcaseCard");
    expect(categoryPageSource).toContain("SocialProfileMiniCard");
    expect(categoryPageSource).toContain("TechnicianShowcaseCard");
    expect(categoryPageSource).not.toContain("FormalShopSearchCard");
    expect(categoryPageSource).not.toContain("FormalTechnicianSearchCard");
  });

  it("offers only store, technician, and service filters and defaults to store", () => {
    expect(categoryPageSource).not.toContain('{ value: "all", label: "全部" }');
    expect(categoryPageSource).toContain('return "store";');
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
    expect(categoryPageSource).toContain('const detailPath = `/profiles/technician/${item.profile.publicId}`');
    expect(categoryPageSource).not.toContain('const detailPath = `/profiles/technician/${item.profile.id}`');
  });

  it("adapts formal search DTOs into the shared cards without legacy mock collections", () => {
    expect(categoryPageSource).toContain("serviceSearchQuery.data?.list.map(mapCoreServiceToServiceItem) ?? []");
    expect(categoryPageSource).toContain("shopSearchQuery.data?.list ?? []");
    expect(categoryPageSource).toContain("technicianSearchQuery.data?.list ?? []");
    expect(categoryPageSource).not.toContain("mapCoreShopToStore");
    expect(categoryPageSource).not.toContain("mapCoreTechnicianToTechnician");
    expect(categoryPageSource).toContain("formalData={{");
    expect(categoryPageSource).toContain("getFavoriteStatuses(");
    expect(categoryPageSource).toContain("isFavorited: favoriteState.isFavorited");
    expect(categoryPageSource).not.toContain("EntitySearchCardActions");
    expect(categoryPageSource).not.toContain("createSystemShareAttempt");
    expect(categoryPageSource).not.toContain("formalActionSlot=");
    expect(categoryPageSource).not.toContain("DirectSearchProfileCard");
    expect(categoryPageSource).not.toContain("legacyServices");
    expect(categoryPageSource).not.toContain("legacyStores");
    expect(categoryPageSource).not.toContain("legacyTechnicians");
    expect(categoryPageSource).not.toContain("data/mock");
    expect(categoryPageSource).toContain("language={language}");
  });

  it("routes search controls, states, and accessibility labels through i18n", () => {
    expect(categoryPageSource).toContain('aria-label={t("搜索关键词")}');
    expect(categoryPageSource).toContain('placeholder={t("输入搜索关键词")}');
    expect(categoryPageSource).toContain('{t("搜索")}');
    expect(categoryPageSource).toContain('aria-label={t("关闭筛选菜单")}');
    expect(categoryPageSource).toContain('label={t("返回")}');
    expect(categoryPageSource).not.toContain('placeholder="输入关键词后添加"');
  });
});
