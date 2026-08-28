import { describe, expect, it } from "vitest";
import { translateText, type Language } from "../../i18n/translations";
import homePageSource from "./HomePage.tsx?raw";

describe("HomePage appointment reminder", () => {
  it("uses a centered blurred modal with the shared close button", () => {
    expect(homePageSource).toContain("CloseIconButton");
    expect(homePageSource).toContain('role="dialog"');
    expect(homePageSource).toContain('aria-modal="true"');
    expect(homePageSource).toContain("items-center justify-center");
    expect(homePageSource).toContain("backdrop-blur");
    expect(homePageSource).not.toContain("top-[calc(env(safe-area-inset-top)+152px)]");
  });
});

describe("HomePage technician recommendations", () => {
  it("uses technician showcase cards with 20 recommendation records", () => {
    expect(homePageSource).toContain("coreReadApi.getHomeRecommendations({ limit: 20 })");
    expect(homePageSource).toContain('recommendationTab === "technicians" ? 20');
    expect(homePageSource).toContain("TechnicianShowcaseCard");
    expect(homePageSource).toContain("getTechnicianDynamicPath(technician)");
  });

  it("disables legacy recommendations", () => {
    expect(homePageSource).toContain("homeRecommendationsQuery.data?.services.map(mapCoreServiceToServiceItem) ?? []");
    expect(homePageSource).toContain("homeRecommendationsQuery.data?.shops.map(mapCoreShopToStore) ?? []");
    expect(homePageSource).toContain("homeRecommendationsQuery.data?.technicians.map(mapCoreTechnicianToTechnician) ?? []");
    expect(homePageSource).not.toContain("legacyServices");
    expect(homePageSource).not.toContain("legacyStores");
    expect(homePageSource).not.toContain("legacyTechnicians");
  });

  it("recovers a transient formal read failure and exposes a manual reload action", () => {
    expect(homePageSource).toContain("loadCoreReadWithTransientRetry");
    expect(homePageSource).toContain("homeRecommendationsRevision");
    expect(homePageSource).toContain("[homeRecommendationsRevision]");
    expect(homePageSource).toContain("onRetry={() => setHomeRecommendationsRevision");
    expect(homePageSource).toContain("重新加载");
  });

  it.each([
    ["zh", "重新加载"],
    ["zh-Hant", "重新載入"],
    ["ja", "再読み込み"],
    ["en", "Reload"],
    ["ko", "다시 불러오기"]
  ] as Array<[Language, string]>)('translates the reload action for %s', (language, expected) => {
    expect(translateText("重新加载", language)).toBe(expected);
  });
});

describe("HomePage authenticated customer identity", () => {
  it("loads the formal customer profile instead of falling back to the first demo customer", () => {
    expect(homePageSource).toContain("getFormalCustomerProfileId(session)");
    expect(homePageSource).toContain("coreReadApi.getCustomerProfile(formalCustomerProfileId)");
    expect(homePageSource).toContain("mapCoreCustomerToCustomer(formalCustomerProfileQuery.data)");
    expect(homePageSource).not.toContain("isStaticDemoMode()");
    expect(homePageSource).toContain("const currentCustomer = formalCustomerProfileQuery.data");
    expect(homePageSource).toContain(": null;");
    expect(homePageSource).not.toContain("legacyCurrentCustomer");
  });
});

describe("HomePage quick action icon theme colors", () => {
  it("uses client theme tokens instead of a hard-coded green", () => {
    expect(homePageSource).toContain("function getQuickActionIconClassName");
    expect(homePageSource).toContain("Record<ClientTheme, string>");
    expect(homePageSource).toContain("text-[color:var(--client-accent-text)]");
    expect(homePageSource).toContain("getQuickActionIconClassName(theme)");
    expect(homePageSource).not.toContain("text-[#3c887e]");
  });
});

describe("HomePage shared theme layout", () => {
  it("uses the common floating header and recommendation cards", () => {
    expect(homePageSource).toContain("<FloatingHomeHeader");
    expect(homePageSource).toContain("floatingHeaderGlassPanelClassName");
    expect(homePageSource).toContain("<RecommendationCard");
  });
});
