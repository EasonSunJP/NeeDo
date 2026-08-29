import { describe, expect, it } from "vitest";
import appSource from "./App.tsx?raw";
import affiliateActivationSource from "./features/identity-applications/AffiliateActivationPage.tsx?raw";
import settingsSource from "./features/settings/UnifiedSettingsPages.tsx?raw";

function sliceBetween(source: string, startToken: string, endToken: string) {
  return source.slice(source.indexOf(startToken), source.indexOf(endToken));
}

describe("portal identity switching boundaries", () => {
  const requirePortalAuthSource = sliceBetween(appSource, "function RequirePortalAuth", "function LegacyBusinessRedirect");
  const settingsPortalPageSource = sliceBetween(
    settingsSource,
    "export function UnifiedSettingsPortalPage",
    "function UserProfileSettingsPage"
  );

  it("restores remembered frontend portal authorization from protected route navigation", () => {
    expect(requirePortalAuthSource).toContain("hasRememberedPortalAuthorization(portal)");
    expect(requirePortalAuthSource).toContain("switchPortal(portal)");
    expect(requirePortalAuthSource).not.toContain("needsPortalSync");
  });

  it("aligns the active backend identity before rendering an already-authorized portal", () => {
    expect(requirePortalAuthSource).toContain("isSessionAlignedWithPortal(session, portal)");
    expect(requirePortalAuthSource).toContain("needsPortalAlignment");
    expect(requirePortalAuthSource).toContain("switchPortal(portal)");
    expect(requirePortalAuthSource).toContain("!isSessionAlignedWithPortal(result.session, portal)");
  });

  it("keeps backend and formal finance routes on direct portal access instead of remembered frontend authorization", () => {
    expect(requirePortalAuthSource).toContain('const isTechnicianPayrollRoute = portal === "technician" && location.pathname.startsWith("/technician/payroll");');
    expect(requirePortalAuthSource).toContain("const requiresDirectPortalAccess = isBackendPortalRoute || isTechnicianPayrollRoute;");
    expect(requirePortalAuthSource).toContain("const hasAccess = hasDirectAccess || isOperationsMerchantPreview || (!requiresDirectPortalAccess && canEnterPortal(portal));");
    expect(requirePortalAuthSource).toContain("const canRestoreRememberedPortal = !requiresDirectPortalAccess && hasRememberedPortalAuthorization(portal);");
  });

  it("does not include a temporary frontend bypass session", () => {
    expect(requirePortalAuthSource).not.toContain("FrontendBypass");
    expect(requirePortalAuthSource).not.toContain("frontend-bypass");
  });

  it("admits an authenticated operations admin only when a read-only merchant preview is active", () => {
    expect(requirePortalAuthSource).toContain("getMerchantAdminPreview");
    expect(requirePortalAuthSource).toContain("isOperationsMerchantPreview");
    expect(requirePortalAuthSource).toContain('canAccess("admin")');
  });

  it("keeps explicit identity switching inside the settings identity page", () => {
    expect(settingsPortalPageSource).toContain("const result = await switchPortal(nextPortal);");
    expect(settingsPortalPageSource).toContain("if (!result.ok)");
    expect(settingsPortalPageSource).toContain("settingsPortalTarget: nextPortal");
  });

  it("keeps all three ordinary-user application flows behind user authentication", () => {
    expect(appSource).toContain('path="/me/identity/technician/apply" element={protect("user", <TechnicianApplicationPage />)}');
    expect(appSource).toContain('path="/me/identity/merchant/apply" element={protect("user", <MerchantApplicationPage />)}');
    expect(appSource).toContain('path="/me/identity/affiliate/contract" element={protect("user", <AffiliateActivationPage />)}');
  });

  it("routes activated affiliates to the formal profile instead of the capability gate", () => {
    expect(appSource).toContain(
      'import { AffiliateProfilePage } from "./features/affiliate-profile/AffiliateProfilePage";'
    );
    expect(appSource).toContain(
      'path="/afirieito/me" element={protect("business", <AffiliateProfilePage />)}'
    );
    expect(
      affiliateActivationSource.match(
        /openPortalEntry\("business", "\/afirieito\/me"\)/g,
      ),
    ).toHaveLength(2);
    expect(affiliateActivationSource).not.toContain(
      'window.location.assign("/afirieito',
    );
  });
});

describe("production route chunk boundaries", () => {
  it("loads the large technician portal only after entering a technician route", () => {
    expect(appSource).not.toContain('import { TechnicianPortalPage } from "./pages/mobile/TechnicianPortalPage";');
    expect(appSource).toContain('lazy(() => import("./pages/mobile/TechnicianPortalPage")');
    expect(appSource.match(/<Suspense fallback=\{null\}><TechnicianPortalPage \/><\/Suspense>/g)).toHaveLength(2);
  });

  it("exposes the same account social page in user, merchant, and technician portals", () => {
    expect(appSource).toContain('path="/moments/users/:userId" element={protect("user", <SocialAccountProfilePage />)}');
    expect(appSource).toContain('path="/merchant/moments/users/:userId" element={protect("merchant", <SocialAccountProfilePage />)}');
    expect(appSource).toContain('path="/technician/moments/users/:userId" element={protect("technician", <SocialAccountProfilePage />)}');
  });
});

describe("Affiliate announcement route", () => {
  it("registers the localized announcement detail inside the protected Affiliate portal", () => {
    expect(appSource).toContain(
      'import { AffiliateAnnouncementDetailPage } from "./features/content-publication/AffiliateAnnouncementDetailPage";'
    );
    expect(appSource).toContain(
      'path="/afirieito/announcements/:announcementPublicId" element={protect("business", <AffiliateAnnouncementDetailPage />)}'
    );
  });
});
