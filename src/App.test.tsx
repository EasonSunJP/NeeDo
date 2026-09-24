import { describe, expect, it } from "vitest";
import appSource from "./App.tsx?raw";
import affiliateActivationSource from "./features/identity-applications/AffiliateActivationPage.tsx?raw";
import settingsSource from "./features/settings/UnifiedSettingsPages.tsx?raw";

function sliceBetween(source: string, startToken: string, endToken: string) {
  return source.slice(source.indexOf(startToken), source.indexOf(endToken));
}

describe("portal identity switching boundaries", () => {
  const requirePortalAuthSource = sliceBetween(
    appSource,
    "function RequirePortalAuth",
    "function LegacyBusinessRedirect"
  );
  const settingsPortalPageSource = sliceBetween(
    settingsSource,
    "export function UnifiedSettingsPortalPage",
    "function SettingsProfileResourceState"
  );

  it("restores remembered frontend portal authorization from protected route navigation", () => {
    expect(requirePortalAuthSource).toContain("hasRememberedPortalAuthorization(portal)");
    expect(requirePortalAuthSource).toContain("switchPortal(portal)");
    expect(requirePortalAuthSource).not.toContain("needsPortalSync");
  });

  it("always settles remembered portal restoration after StrictMode effect replay", () => {
    expect(requirePortalAuthSource).toContain("portalRestoreInFlightRef.current");
    expect(requirePortalAuthSource).toContain("const restoreRequest = switchPortal(portal);");
    expect(requirePortalAuthSource).toContain("portalRestoreInFlightRef.current = restoreRequest;");
    expect(requirePortalAuthSource).toContain(".finally(() => {");
    expect(requirePortalAuthSource).toContain("setIsPortalRestorePending(false);");
    expect(requirePortalAuthSource).not.toContain("let active = true");
    expect(requirePortalAuthSource).not.toContain("if (active)");
  });

  it("shows a retryable identity-service outage without rendering protected portal data", () => {
    expect(requirePortalAuthSource).toContain("restoreError");
    expect(requirePortalAuthSource).toContain("retrySessionRestore");
    expect(requirePortalAuthSource).toContain("身份服务暂时不可用，请稍后重试。");
    expect(requirePortalAuthSource).toContain("重新加载");
    expect(requirePortalAuthSource).toMatch(/if\s*\(\s*restoreError\s*\|\|\s*isRestoring/u);
    expect(requirePortalAuthSource.indexOf("if (restoreError && !isAuthenticated)")).toBeLessThan(
      requirePortalAuthSource.indexOf("if (isRestoring || isPortalRestorePending")
    );
  });

  it("aligns the active backend identity before rendering an already-authorized portal", () => {
    expect(requirePortalAuthSource).toContain("isSessionAlignedWithPortal(session, portal)");
    expect(requirePortalAuthSource).toContain("needsPortalAlignment");
    expect(requirePortalAuthSource).toContain("switchPortal(portal)");
    expect(requirePortalAuthSource).toContain(
      "!isSessionAlignedWithPortal(result.session, portal)"
    );
  });

  it("keeps backend and formal finance routes on direct portal access instead of remembered frontend authorization", () => {
    expect(requirePortalAuthSource).toContain(
      'const isTechnicianPayrollRoute = portal === "technician" && location.pathname.startsWith("/technician/payroll");'
    );
    expect(requirePortalAuthSource).toContain(
      "const requiresDirectPortalAccess = isBackendPortalRoute || isTechnicianPayrollRoute;"
    );
    expect(requirePortalAuthSource).toContain(
      "const hasAccess = hasDirectAccess || isOperationsMerchantPreview || (!requiresDirectPortalAccess && canEnterPortal(portal));"
    );
    expect(requirePortalAuthSource).toContain(
      "const canRestoreRememberedPortal = !requiresDirectPortalAccess && hasRememberedPortalAuthorization(portal);"
    );
  });

  it("does not include a temporary frontend bypass session", () => {
    expect(requirePortalAuthSource).not.toContain("FrontendBypass");
    expect(requirePortalAuthSource).not.toContain("frontend-bypass");
  });

  it("loads public platform settings and keeps operations available during maintenance", () => {
    expect(appSource).toContain("<PlatformSettingsProvider>");
    expect(appSource).toContain("function PlatformAvailabilityGate");
    expect(appSource).toContain('location.pathname === "/login/admin"');
    expect(appSource).toContain('location.pathname.startsWith("/admin/")');
    expect(appSource).toContain('status === "ready" && !settings.siteEnabled && !isOperationsRoute');
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
    expect(appSource).toContain(
      'path="/me/identity/technician/apply" element={protect("user", <TechnicianApplicationPage />)}'
    );
    expect(appSource).toContain(
      'path="/me/identity/merchant/apply" element={protect("user", <MerchantApplicationPage />)}'
    );
    expect(appSource).toContain(
      'path="/me/identity/affiliate/contract" element={protect("user", <AffiliateActivationPage />)}'
    );
  });

  it("shows the shop-stay prompt only on explicit technician switching without blocking the portal", () => {
    expect(appSource).toContain("function RequireTechnicianShop");
    expect(appSource).toContain("settingsSwitchedFromPortal");
    expect(appSource).toContain('settingsPortalTarget === "technician"');
    expect(appSource).toContain("technicianShopStayReturnTo");
    expect(appSource).toContain('location.pathname.startsWith("/technician/shop-stays")');
    expect(appSource).toContain('path="/technician/shop-stays"');
    expect(appSource).toContain('path="/technician/shop-stays/apply"');
    expect(appSource).toContain("<TechnicianShopStayPage />");
    expect(appSource).toContain('<TechnicianApplicationPage mode="additional-shop" />');
  });

  it("routes activated affiliates to the formal profile instead of the capability gate", () => {
    expect(appSource).toContain(
      'import { AffiliateProfilePage } from "./features/affiliate-profile/AffiliateProfilePage";'
    );
    expect(appSource).toContain(
      'path="/afirieito/me" element={protect("business", <AffiliateProfilePage />)}'
    );
    expect(
      affiliateActivationSource.match(/openPortalEntry\("business", "\/afirieito\/me"\)/g)
    ).toHaveLength(2);
    expect(affiliateActivationSource).not.toContain('window.location.assign("/afirieito');
  });
});

describe("route-level loading boundaries", () => {
  it("keeps portal art visible while authentication, shop access, or a lazy route is pending", () => {
    const portalAuth = sliceBetween(appSource, "function RequirePortalAuth", "function RequireTechnicianShopStay");
    const technicianStay = sliceBetween(appSource, "function RequireTechnicianShopStay", "function LegacyBusinessRedirect");
    expect(portalAuth).not.toContain("return null;");
    expect(technicianStay).not.toContain('if (status === "loading") return null;');
    expect(appSource).not.toContain("<Suspense fallback={null}>\n                <Routes>");
  });

  it("does not keep the cold-start splash delay when changing portals", () => {
    expect(appSource).toContain("portalTransition ? 80 : reducedPerformance ? 140 : 920");
    expect(appSource).toContain("portalTransition ? 80 : reducedPerformance ? 80 : 620");
  });

  it("keeps the merchant splash until the entry page data has settled", () => {
    expect(appSource).toContain('merchantReadyRouteKey !== location.key');
    expect(appSource).toContain('onSettled={markMerchantPortalReady}');
    expect(appSource).toContain('onDone={waitingForMerchantPortal ? undefined : completeSplash}');
  });

  it("keeps settings and legal workspaces out of the initial portal bundle", () => {
    expect(appSource).not.toContain(
      'from "./pages/user/UserSettingsPages";'
    );
    expect(appSource).not.toContain(
      'from "./features/settings/UnifiedSettingsPages";'
    );
    expect(appSource).toContain(
      'const loadUserSettingsPages = () => import("./pages/user/UserSettingsPages");'
    );
    expect(appSource).toContain(
      'const loadUnifiedSettingsPages = () => import("./features/settings/UnifiedSettingsPages");'
    );
    expect(appSource).toContain("<Suspense fallback={null}>");
    expect(appSource).toContain("<Routes>");
  });
});

describe("user profile settings compatibility route", () => {
  it("redirects the retired duplicate profile editor to the personal center", () => {
    expect(appSource).toContain(
      '<Route path="/me/settings/profile" element={protect("user", <Navigate replace to="/me" />)} />'
    );
    expect(appSource).not.toContain("UserSettingsProfilePage");
  });
});

describe("user payment-method settings route", () => {
  it("mounts a dedicated protected page without redirecting to checkout or account security", () => {
    expect(appSource).toContain("UserSettingsPaymentMethodsPage");
    expect(appSource).toContain(
      'path="/me/settings/payment-methods" element={protect("user", <UserSettingsPaymentMethodsPage />)}',
    );
    expect(appSource).not.toContain(
      '<Route path="/me/settings/payment-methods" element={<Navigate',
    );
  });
});

describe("legal document catalog routes", () => {
  it("keeps merchant and Affiliate agreement catalog links on real protected pages", () => {
    expect(appSource).toContain('path="/me/settings/merchant-agreement"');
    expect(appSource).toContain('path="/me/settings/affiliate-agreement"');
    expect(appSource).toContain("<UnifiedSettingsMerchantAgreementPage");
    expect(appSource).toContain("<UnifiedSettingsAffiliateAgreementPage");
  });
});

describe("production route chunk boundaries", () => {
  it("loads the customer order detail only after entering its protected route", () => {
    expect(appSource).not.toContain(
      'import { UserOrderDetailPage } from "./pages/user/UserOrderDetailPage";'
    );
    expect(appSource).toContain(
      'const UserOrderDetailPage = lazy(() => import("./pages/user/UserOrderDetailPage")'
    );
    expect(appSource).toContain(
      'path="/orders/:orderId" element={protect("user", <Suspense fallback={null}><UserOrderDetailPage /></Suspense>)}'
    );
  });

  it("protects the formal NDP exchange-rate operations route with read permission", () => {
    expect(appSource).toContain(
      'import { NdpExchangeRatePage } from "./pages/admin/NdpExchangeRatePage";'
    );
    expect(appSource).toContain(
      'path="/admin/settings/ndp-exchange-rate" element={protectPermission("admin", "backoffice:ndp-exchange-rate:read", <NdpExchangeRatePage />)}'
    );
  });

  it("mounts one operations data dashboard and redirects the legacy analytics route", () => {
    expect(appSource.match(/path="\/admin" element=/g)).toHaveLength(1);
    expect(appSource).toContain(
      'path="/admin" element={protectPermission("admin", "page:dashboard", <Suspense fallback={null}><DashboardPage /></Suspense>)}'
    );
    expect(appSource).toContain(
      'const DashboardMetricDetailPage = lazy(() => import("./pages/admin/DashboardMetricDetailPage")'
    );
    expect(appSource).toContain(
      'path="/admin/analytics/metrics/:metricKey" element={protectPermission("admin", "backoffice:dashboard-detail:read", <Suspense fallback={null}><DashboardMetricDetailPage /></Suspense>)}'
    );
    expect(appSource).toContain(
      'const MembershipAnalyticsPage = lazy(() => import("./pages/admin/MembershipAnalyticsPage")'
    );
    expect(appSource).toContain(
      'path="/admin/analytics/members" element={protectPermission("admin", "backoffice.member.analytics.view", <Suspense fallback={null}><MembershipAnalyticsPage scope="backoffice" /></Suspense>)}'
    );
    expect(appSource).toContain(
      'path="/merchant-admin/analytics/members" element={protectPermission("merchant", "shop.member.analytics.view", <Suspense fallback={null}><MembershipAnalyticsPage scope="merchant-admin" /></Suspense>)}'
    );
    expect(appSource).not.toContain('import { AnalyticsPage } from "./pages/admin/AnalyticsPage";');
    expect(appSource).toContain(
      'path="/admin/analytics" element={protectPermission("admin", "page:dashboard", <Navigate replace to="/admin" />)}'
    );
    expect(appSource).not.toContain("<AnalyticsPage />");
    expect(appSource).toContain(
      'path="/admin/live-screen" element={protectPermission("admin", "page:dashboard", <Suspense fallback={null}><LiveDashboardPage /></Suspense>)}'
    );
  });

  it("mounts one merchant data dashboard and redirects the legacy analytics route", () => {
    const oldAnalyticsPath = ["/merchant-admin", "analytics"].join("/");
    expect(appSource.match(/path="\/merchant-admin" element=/g)).toHaveLength(1);
    expect(appSource).toContain(
      'path="/merchant-admin" element={protect("merchant", <Suspense fallback={null}><MerchantAdminDashboardPage /></Suspense>)}'
    );
    expect(appSource).not.toContain('import { MerchantAdminAnalyticsPage }');
    expect(appSource).not.toContain("<MerchantAdminAnalyticsPage />");
    expect(appSource).toContain(
      `path="${oldAnalyticsPath}" element={protect("merchant", <Navigate replace to="/merchant-admin" />)}`
    );
  });

  it("loads the large technician portal only after entering a technician route", () => {
    expect(appSource).not.toContain(
      'import { TechnicianPortalPage } from "./pages/mobile/TechnicianPortalPage";'
    );
    expect(appSource).toContain('lazy(() => import("./pages/mobile/TechnicianPortalPage")');
    expect(
      appSource.match(/<Suspense fallback=\{null\}><TechnicianPortalPage \/><\/Suspense>/g)
    ).toHaveLength(2);
  });

  it("loads application review workspaces only after entering their protected routes", () => {
    expect(appSource).not.toContain(
      'import { EkycReviewPage } from "./features/settings/EkycReviewPage";'
    );
    expect(appSource).not.toContain(
      'import { MerchantBackofficeApplicationReviewPage, OperationsShopApplicationReviewPage } from "./features/identity-applications/BackofficeReviewPages";'
    );
    expect(appSource).toContain(
      'const EkycReviewPage = lazy(() => import("./features/settings/EkycReviewPage")'
    );
    expect(appSource).toContain(
      'const MerchantBackofficeApplicationReviewPage = lazy(() => import("./features/identity-applications/BackofficeReviewPages")'
    );
    expect(appSource).toContain(
      'const OperationsShopApplicationReviewPage = lazy(() => import("./features/identity-applications/BackofficeReviewPages")'
    );
    expect(appSource).toContain(
      'path="/admin/application-reviews/ekyc" element={protectPermission("admin", "ops:ekyc-application:read", <Suspense fallback={null}><EkycReviewPage /></Suspense>)}'
    );
    expect(appSource).toContain(
      'path="/admin/merchant-applications" element={protectPermission("admin", "ops:merchant-application:read", <Suspense fallback={null}><OperationsShopApplicationReviewPage /></Suspense>)}'
    );
    expect(appSource).toContain(
      'path="/merchant-admin/employee-applications" element={protectPermission("merchant", "merchant:technician-application:read", <Suspense fallback={null}><MerchantBackofficeApplicationReviewPage /></Suspense>)}'
    );
  });

  it("loads the operations timeline only after entering its protected route", () => {
    expect(appSource).not.toContain(
      'import { OperationTimelinePage } from "./pages/admin/OperationTimelinePage";',
    );
    expect(appSource).toContain(
      'const OperationTimelinePage = lazy(() => import("./pages/admin/OperationTimelinePage")',
    );
    expect(appSource).toContain(
      'path="/admin/operation-timeline" element={protectPermission("admin", "backoffice:dashboard:read", <Suspense fallback={null}><OperationTimelinePage /></Suspense>)}',
    );
  });

  it("loads the carousel editor only after entering its protected route", () => {
    expect(appSource).not.toContain(
      'import { CarouselPage } from "./pages/admin/CarouselPage";',
    );
    expect(appSource).toContain(
      'const CarouselPage = lazy(() => import("./pages/admin/CarouselPage")',
    );
    expect(appSource).toContain(
      'path="/admin/carousel" element={protectPermission("admin", "page:backoffice-user-home-carousel", <Suspense fallback={null}><CarouselPage /></Suspense>)}',
    );
  });

  it("loads the operations order workspace only after entering its route", () => {
    expect(appSource).not.toContain(
      'import { OrdersAdminPage } from "./pages/admin/OrdersAdminPage";',
    );
    expect(appSource).toContain(
      'const OrdersAdminPage = lazy(() => import("./pages/admin/OrdersAdminPage")',
    );
    expect(appSource).toContain(
      'path="/admin/orders" element={protect("admin", <Suspense fallback={null}><OrdersAdminPage /></Suspense>)}',
    );
  });

  it("routes the accepted technician schedule index directly to the formal-only page", () => {
    expect(appSource).toContain(
      'path="/technician/schedule" element={protect("technician", <TechnicianScheduleIndexRoutePage />)}'
    );
  });

  it("exposes the same account social page in user, merchant, and technician portals", () => {
    expect(appSource).toContain(
      'path="/moments/users/:userId" element={protect("user", <SocialAccountProfilePage />)}'
    );
    expect(appSource).toContain(
      'path="/merchant/moments/users/:userId" element={protect("merchant", <SocialAccountProfilePage />)}'
    );
    expect(appSource).toContain(
      'path="/technician/moments/users/:userId" element={protect("technician", <SocialAccountProfilePage />)}'
    );
  });

  it("redirects every historical full reply route without mounting the post detail page directly", () => {
    expect(appSource).toContain("SocialLegacyReplyRedirectPage,");
    expect(appSource).toContain(
      'path="/moments/posts/:postId/replies" element={protect("user", <SocialLegacyReplyRedirectPage />)}'
    );
    expect(appSource).toContain(
      'path="/merchant/moments/posts/:postId/replies" element={protect("merchant", <SocialLegacyReplyRedirectPage />)}'
    );
    expect(appSource).toContain(
      'path="/technician/moments/posts/:postId/replies" element={protect("technician", <SocialLegacyReplyRedirectPage />)}'
    );
    expect(appSource).not.toContain(
      'path="/moments/posts/:postId/replies" element={protect("user", <SocialPostDetailPage />)}'
    );
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

describe("Affiliate marketplace routes", () => {
  it("mounts the real task list and detail pages behind the Affiliate portal", () => {
    expect(appSource).toContain(
      'import { AffiliateMarketplacePage } from "./pages/mobile/AffiliateMarketplacePage";'
    );
    expect(appSource).toContain(
      'import { AffiliateTaskDetailPage } from "./pages/mobile/AffiliateTaskDetailPage";'
    );
    expect(appSource).toContain(
      'path="/afirieito/plan" element={protect("business", <AffiliateMarketplacePage />)}'
    );
    expect(appSource).toContain(
      'path="/afirieito/tasks/:taskId" element={protect("business", <AffiliateTaskDetailPage />)}'
    );
    expect(appSource).not.toContain(
      'path="/afirieito/plan" element={protect("business", <BusinessCpsPage />)}'
    );
  });
});
