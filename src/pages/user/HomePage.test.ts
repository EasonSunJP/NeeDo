import { describe, expect, it } from "vitest";
// @ts-expect-error -- Vitest runs this source guard in Node; frontend tsconfig intentionally omits Node types.
import { readFileSync } from "node:fs";
import homePageSource from "./HomePage.tsx?raw";

const stylesSource = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

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

describe("HomePage quick action icon theme colors", () => {
  it("uses client theme tokens instead of a hard-coded green", () => {
    expect(homePageSource).toContain("function getQuickActionIconClassName");
    expect(homePageSource).toContain("Record<ClientTheme, string>");
    expect(homePageSource).toContain("text-[color:var(--client-accent-text)]");
    expect(homePageSource).toContain("getQuickActionIconClassName(theme)");
    expect(homePageSource).not.toContain("text-[#3c887e]");
  });
});

describe("HomePage special black layout", () => {
  it("clips the fixed header from the matching special-black page background", () => {
    expect(homePageSource).toContain("special-black-home-background");
    expect(homePageSource).toContain("special-black-home-header-clip");
    expect(homePageSource).not.toContain("special-black-home-header-clip pointer-events-none fixed inset-x-0 top-0 z-[40] h-[calc(env(safe-area-inset-top)+172px)] bg-[radial-gradient");
    expect(stylesSource).toContain("--special-black-home-background:");
    expect(stylesSource).toContain(".client-theme-special-black.special-black-home-layout");
    expect(stylesSource).toContain(".client-theme-special-black .special-black-home-background");
    expect(stylesSource).toContain(".client-theme-special-black .special-black-home-header-clip");
    expect(stylesSource).toContain(".client-theme-special-black .special-black-home-fixed-header");
    expect(stylesSource).toContain(".client-theme-special-black .special-black-home-fixed-header-fill");
    expect(stylesSource).toContain("background: var(--special-black-home-background)");
    expect(stylesSource).toContain("background-attachment: fixed");
    expect(stylesSource).toContain("height: calc(env(safe-area-inset-top) + 124px) !important;");
    expect(stylesSource).toContain("padding-top: calc(env(safe-area-inset-top) + 124px) !important;");
    expect(stylesSource).toContain("z-index: 1002 !important;");
    expect(stylesSource).not.toContain(".client-theme-special-black.special-black-home-layout::after");
    expect(homePageSource).not.toContain("special-black-home-header-cover");
    expect(stylesSource).not.toContain("special-black-home-header-cover");
    expect(stylesSource).not.toContain("background: linear-gradient(180deg, #050810 0%, #03070d 68%, #02050a 100%) !important;");
  });

  it("uses a dedicated layout branch instead of only applying special-black colors", () => {
    expect(homePageSource).toContain('theme === "special-black"');
    expect(homePageSource).toContain("special-black-home-layout");
    expect(homePageSource).toContain("special-black-project-card");
    expect(homePageSource).toContain("special-black-home-header-location");
    expect(homePageSource).toContain("SpecialBlackReminderDialog");
    expect(homePageSource).toContain("SpecialBlackIcon");
    expect(homePageSource).toContain("SpecialBlackFlatIcon");
    expect(homePageSource).toContain("getSpecialBlackQuickActionIconName");
    expect(homePageSource).toContain("special-black-home-header-clip");
    expect(homePageSource).toContain("special-black-home-fixed-header");
    expect(homePageSource).toContain("special-black-home-fixed-header-fill");
    expect(homePageSource).toContain("special-black-home-content");
    expect(homePageSource).toContain("z-[1000] h-[calc(env(safe-area-inset-top)+124px)]");
    expect(homePageSource).toContain("h-[calc(env(safe-area-inset-top)+124px)]");
    expect(homePageSource).toContain("pt-[calc(env(safe-area-inset-top)+124px)]");
    expect(homePageSource).toContain("fixed inset-x-0 top-0 z-[1002]");
    expect(homePageSource).toContain("special-black-home-avatar relative block h-12 w-12");
    expect(homePageSource).toContain("special-black-home-header-location flex h-12");
    expect(homePageSource).toContain("grid h-11 w-11");
    expect(homePageSource).toContain("flex h-10 items-center");
    expect(homePageSource).not.toContain("h-[76px] w-[76px]");
    expect(homePageSource).not.toContain("flex h-[55px] items-center");
    expect(homePageSource).toContain("grid grid-cols-4 gap-3");
    expect(homePageSource).toContain('name={item.iconName}');
    expect(homePageSource).toContain("SpecialBlackAppointmentOverviewButton");
    expect(homePageSource).toContain("special-black-appointment-overview-button");
    expect(homePageSource).toContain('aria-label="预约一览"');
    expect(homePageSource).toContain("<SpecialBlackAppointmentOverviewButton count={activeAppointmentOrders.length} />");
    expect(homePageSource).toContain('className="absolute right-2 top-2 z-10 flex gap-1.5"');
    expect(homePageSource).toContain('className="min-w-0 pr-1 pt-[44px]"');
    expect(homePageSource).toContain("getSpecialBlackVisibleTags");
    expect(homePageSource).not.toContain("appointmentCount={activeAppointmentOrders.length}");
    expect(homePageSource).not.toContain('aria-label={`${meta.title} 预约履历`}');
    expect(homePageSource).not.toContain("pr-[82px]");
    expect(homePageSource).toContain("renderSlide={({ slide }) => <SpecialBlackHeroSlide slide={slide} />}");
    expect(homePageSource).toContain("<SpecialBlackRecommendationCard");
    expect(homePageSource).toContain("<NearbyTechnicianCard");
    expect(homePageSource).toContain("<ServiceModule");
    expect(homePageSource.indexOf('theme === "special-black"')).toBeLessThan(homePageSource.indexOf("<FloatingHomeHeader"));
    expect(homePageSource).not.toContain('theme === "special-black" ? "client-theme-special-black" :');
    expect(homePageSource).not.toContain("card.store.description");
    expect(homePageSource).not.toContain("card.service.summary");
    expect(homePageSource).not.toContain("technician.skills[0]");
    expect(homePageSource).not.toContain("创建并确认今日计划");
    expect(homePageSource).not.toContain("今日时间线");
    expect(homePageSource).not.toContain("special-black-hero-card");
    expect(homePageSource).not.toContain("w-[184px] shrink-0");
    expect(homePageSource).not.toContain("t(item.to)");
  });
});
