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

  it("keeps legacy recommendations exclusive to explicit static-demo mode", () => {
    expect(homePageSource).toContain("const allowLegacyCoreReadData = isStaticDemoMode();");
    expect(homePageSource).toContain("allowLegacyCoreReadData ? legacyServices : []");
    expect(homePageSource).toContain("allowLegacyCoreReadData ? legacyStores : []");
    expect(homePageSource).toContain("allowLegacyCoreReadData ? legacyTechnicians : []");
    expect(homePageSource).toContain("if (!allowLegacyCoreReadData)");
  });
});

describe("HomePage authenticated customer identity", () => {
  it("loads the formal customer profile instead of falling back to the first demo customer", () => {
    expect(homePageSource).toContain("getFormalCustomerProfileId(session)");
    expect(homePageSource).toContain("coreReadApi.getCustomerProfile(formalCustomerProfileId)");
    expect(homePageSource).toContain("mapCoreCustomerToCustomer(formalCustomerProfileQuery.data)");
    expect(homePageSource).toContain("isStaticDemoMode()");
    expect(homePageSource).toContain("const currentCustomer = formalCustomerProfileQuery.data");
    expect(homePageSource).toContain(": legacyCurrentCustomer");
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
