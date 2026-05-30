import { describe, expect, it } from "vitest";
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

  it("keeps static home content visible when core-read data is unavailable", () => {
    expect(homePageSource).toContain("homeRecommendationsQuery.data?.services.map(mapCoreServiceToServiceItem) ?? legacyServices");
    expect(homePageSource).toContain("homeRecommendationsQuery.data?.shops.map(mapCoreShopToStore) ?? legacyStores");
    expect(homePageSource).toContain("homeRecommendationsQuery.data?.technicians.map(mapCoreTechnicianToTechnician) ?? legacyTechnicians");
    expect(homePageSource).toContain("hasStaticHomeContent ? null : homeRecommendationsQuery.error");
  });
});
