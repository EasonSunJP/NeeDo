import { describe, expect, it } from "vitest";
import merchantPortalSource from "../pages/mobile/MerchantPortalPage.tsx?raw";
import technicianPortalSource from "../pages/mobile/TechnicianPortalPage.tsx?raw";
import userCenterSource from "../pages/user/UserCenterPage.tsx?raw";
import userOrdersSource from "../pages/user/UserOrdersPage.tsx?raw";
import profileDetailSource from "../pages/user/ProfileDetailPage.tsx?raw";
import technicianInfoCardSource from "../pages/user/TechnicianInfoCardRoutePage.tsx?raw";
import socialProfileSource from "../features/social/pages/SocialProfilePage.tsx?raw";
import settingsSource from "../features/settings/UnifiedSettingsPages.tsx?raw";
import technicianShopStaySource from "../features/technician-shop-stays/TechnicianShopStayPage.tsx?raw";

describe("front-page persistent cache coverage", () => {
  it("keeps each portal landing page on an account-scoped cached read model", () => {
    expect(userCenterSource).toContain("user-center:self:");
    expect(userOrdersSource).toContain("booking:customer-orders:");
    expect(technicianPortalSource).toContain("technician:tasks:");
    expect(merchantPortalSource).toContain("merchant:home:");
    expect(merchantPortalSource).toContain("booking:merchant-orders:");
    expect(merchantPortalSource).toContain("getAuthenticatedPersistentCacheScope");
  });

  it("reuses cached technician information cards across every front-page entry", () => {
    expect(profileDetailSource).toContain("core:technician:");
    expect(profileDetailSource).toContain("technician:public-profile-services:");
    expect(technicianInfoCardSource).toContain("core:technician:");
    expect(socialProfileSource).toContain("core:technician:");
  });

  it("uses the authenticated technician cache for settings and shop-stay pages", () => {
    expect(settingsSource.match(/technician:self/g)).toHaveLength(3);
    expect(settingsSource).toContain("getAuthenticatedPersistentCacheScope");
    expect(technicianShopStaySource).toContain("technician:self");
    expect(technicianShopStaySource).toContain("getAuthenticatedPersistentCacheScope");
  });
});
