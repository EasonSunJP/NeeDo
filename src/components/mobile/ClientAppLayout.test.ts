import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import appScaffoldSource from "../client-ui/AppScaffold.tsx?raw";
import featureCarouselSource from "../client-ui/FeatureCarousel.tsx?raw";
import entityDetailSource from "./EntityDetailPage.tsx?raw";
import floatingHeaderSource from "./FloatingHomeHeader.tsx?raw";
import fullscreenHeaderSource from "./MobileFullscreenHeader.tsx?raw";
import fullscreenPageSource from "./MobileFullscreenPage.tsx?raw";
import mobileShellSource from "./MobileShell.tsx?raw";
import affiliateAllianceSource from "../../features/affiliate-alliance/AffiliateAlliancePage.tsx?raw";
import affiliateProfileSource from "../../features/affiliate-profile/AffiliateProfilePage.tsx?raw";
import dineInCustomerSource from "../../features/dine-in/customer-pages.tsx?raw";
import exchangeFeedSource from "../../features/exchange/ExchangeFeedPage.tsx?raw";
import accountComplianceSource from "../../features/auth/AccountCompliancePage.tsx?raw";
import announcementDetailSource from "../../features/content-publication/AffiliateAnnouncementDetailPage.tsx?raw";
import dineInMerchantSource from "../../features/dine-in/merchant-route-pages.tsx?raw";
import dispatchWorkspaceSource from "../../features/dispatch-center/components/OverviewWorkspace.tsx?raw";
import exchangeComposerSource from "../../features/exchange/ExchangeComposerShell.tsx?raw";
import exchangePostDetailSource from "../../features/exchange/ExchangePostDetailPage.tsx?raw";
import identityApplicationSource from "../../features/identity-applications/ApplicationUi.tsx?raw";
import imRecordDetailSource from "../../features/im/ImChatRecordDetailPage.tsx?raw";
import imChatHomeSource from "../../features/im/chat-home.tsx?raw";
import imComponentsSource from "../../features/im/components.tsx?raw";
import imMultiSelectSource from "../../features/im/ImMessageMultiSelectOverlay.tsx?raw";
import imPagesSource from "../../features/im/pages.tsx?raw";
import settingsSource from "../../features/settings/UnifiedSettingsPages.tsx?raw";
import socialComposerPageSource from "../../features/social/pages/SocialComposerPage.tsx?raw";
import socialProfileSource from "../../features/social/pages/SocialProfilePage.tsx?raw";
import shopMemberCenterSource from "../../features/shop-member/ShopMemberCenterPage.tsx?raw";
import unifiedComposerSource from "../../features/social/components/UnifiedComposerUi.tsx?raw";
import unifiedSocialSource from "../../features/social/components/UnifiedSocialUi.tsx?raw";
import socialQuickReplySource from "../../features/social/components/SocialQuickReplyComposer.tsx?raw";
import socialPostDetailSource from "../../features/social/pages/SocialPostDetailPage.tsx?raw";
import socialSearchSource from "../../features/social/pages/SocialSearchPage.tsx?raw";
import socialTimelineSource from "../../features/social/pages/SocialTimelinePage.tsx?raw";
import technicianScheduleSource from "../../features/technician-schedule/route-pages.tsx?raw";
import affiliateMarketplaceSource from "../../pages/mobile/AffiliateMarketplacePage.tsx?raw";
import affiliateTaskDetailSource from "../../pages/mobile/AffiliateTaskDetailPage.tsx?raw";
import businessCpsSource from "../../pages/mobile/BusinessCpsPage.tsx?raw";
import merchantOrderRoutesSource from "../../pages/mobile/MerchantOrderRoutePages.tsx?raw";
import merchantPortalSource from "../../pages/mobile/MerchantPortalPage.tsx?raw";
import merchantScheduleArrangementSource from "../../pages/mobile/MerchantScheduleArrangementRoutePage.tsx?raw";
import merchantScheduleCellSource from "../../pages/mobile/MerchantScheduleCellRoutePage.tsx?raw";
import technicianPortalSource from "../../pages/mobile/TechnicianPortalPage.tsx?raw";
import profileDetailSource from "../../pages/user/ProfileDetailPage.tsx?raw";
import categorySource from "../../pages/user/CategoryPage.tsx?raw";
import formalCheckoutSource from "../../pages/user/FormalCheckoutPage.tsx?raw";
import homeSource from "../../pages/user/HomePage.tsx?raw";
import ndpGuideSource from "../../pages/user/NdpGuidePage.tsx?raw";
import serviceDetailSource from "../../pages/user/ServiceDetailPage.tsx?raw";
import technicianInfoCardSource from "../../pages/user/TechnicianInfoCardRoutePage.tsx?raw";
import technicianServicesSource from "../../pages/user/TechnicianServicesPage.tsx?raw";
import userCenterSource from "../../pages/user/UserCenterPage.tsx?raw";
import userFavoritesSource from "../../pages/user/UserFavoritesPage.tsx?raw";
import userMembershipsSource from "../../pages/user/UserMembershipsPage.tsx?raw";
import userOrdersSource from "../../pages/user/UserOrdersPage.tsx?raw";
import userScheduleSource from "../../pages/user/UserSchedulePage.tsx?raw";
import userTechnicianScheduleSource from "../../pages/user/UserTechnicianScheduleDetailPage.tsx?raw";
import supportSource from "../../pages/user/SupportPage.tsx?raw";
import storeDetailSource from "../../pages/user/StoreDetailPage.tsx?raw";
import calendarParticipantSource from "../scheduling/CalendarParticipantFlow.tsx?raw";
import technicianScheduleSetupSource from "../scheduling/TechnicianScheduleSetupModal.tsx?raw";
import unifiedUserCalendarSource from "../scheduling/UnifiedUserCalendar.tsx?raw";

const stylesSource = readFileSync(
  new URL("../../styles.css", import.meta.url),
  "utf8",
);

describe("shared client application width", () => {
  it("defines one application frame and gutter authority with legacy nav aliases", () => {
    expect(stylesSource).not.toContain("min-width: 320px;");
    expect(stylesSource).toContain("--client-app-max-width: 880px;");
    expect(stylesSource).toContain("--client-app-inline-gap: 12px;");
    expect(stylesSource).toContain(
      "--client-bottom-nav-max-width: var(--client-app-max-width);",
    );
    expect(stylesSource).toContain(
      "--client-bottom-nav-inline-gap: var(--client-app-inline-gap);",
    );
    expect(stylesSource).toContain(".client-app-frame {");
    expect(stylesSource).toContain(
      "max-width: var(--client-app-max-width, 880px);",
    );
    expect(stylesSource).toContain(".client-shell main.client-app-frame {");
    expect(stylesSource).toContain(".client-app-gutter {");
    expect(stylesSource).toContain(
      "padding-inline: var(--client-app-inline-gap, 12px);",
    );
    expect(stylesSource).toContain(".client-app-margin {");
    expect(stylesSource).toContain(
      "margin-inline: var(--client-app-inline-gap, 12px);",
    );
    expect(stylesSource).toContain(".client-app-breakout {");
    expect(stylesSource).toContain(".client-app-panel-frame {");
  });

  it("aligns the shared shell, floating header, fullscreen page and bottom nav", () => {
    expect(mobileShellSource).toContain(
      'className="client-app-frame client-app-content-container',
    );
    expect(mobileShellSource).toContain(
      '"safe-nav-bottom client-app-frame client-app-gutter client-bottom-nav',
    );
    expect(floatingHeaderSource).toContain(
      'export const clientAppMaxWidth = "var(--client-app-max-width, 880px)"',
    );
    expect(floatingHeaderSource).toContain(
      'export const clientAppInlineGap = "var(--client-app-inline-gap, 12px)"',
    );
    expect(floatingHeaderSource).toContain(
      'className="client-app-frame client-app-gutter pointer-events-auto"',
    );
    expect(fullscreenHeaderSource).toContain("maxWidth={maxWidth ?? clientAppMaxWidth}");
    expect(fullscreenPageSource).toContain("client-app-frame");
    expect(entityDetailSource.match(/client-app-frame/g)?.length).toBeGreaterThanOrEqual(3);
    expect(homeSource).toContain(
      '<div className="client-app-gutter space-y-5 pb-28 pt-2">',
    );
    expect(featureCarouselSource).toContain(
      'featureCarouselFrameClassName = "client-app-panel-frame relative"',
    );
  });

  it("keeps the shared page scaffold and its top bar on the same frame", () => {
    expect(appScaffoldSource).toContain(
      '"client-app-frame client-app-gutter pb-28 pt-4"',
    );
    expect(appScaffoldSource).toContain("maxWidth={clientAppMaxWidth}");
    expect(appScaffoldSource).not.toContain('maxWidth="1600px"');
    expect(appScaffoldSource).not.toContain("max-w-[1480px]");
  });

  it("uses the shared gutter on the four portal profile surfaces", () => {
    expect(userCenterSource.match(/client-app-gutter/g)?.length).toBeGreaterThanOrEqual(3);
    expect(technicianPortalSource).not.toContain('maxWidth="880px"');
    expect(technicianPortalSource).toContain(
      'cn("client-app-gutter space-y-4 pt-4",',
    );
    expect(technicianPortalSource).toContain(
      'meTab === "info" ? "pb-[calc(132px+env(safe-area-inset-bottom))]" : "pb-32"',
    );
    expect(merchantPortalSource).not.toContain('maxWidth="880px"');
    expect(merchantPortalSource).toContain(
      'cn("client-app-gutter space-y-4 pb-0"',
    );
    expect(merchantPortalSource).toContain(
      'activeView === "me" ? "client-app-margin !w-auto"',
    );
    expect(affiliateAllianceSource).toContain(
      '<main className="client-app-gutter space-y-4',
    );
    expect(affiliateProfileSource).toContain(
      '<main className="client-app-gutter space-y-4',
    );
  });

  it("removes page-level width forks from common frontend routes", () => {
    const pageLevelSources = [
      dineInCustomerSource,
      exchangeFeedSource,
      profileDetailSource,
      shopMemberCenterSource,
      socialPostDetailSource,
      socialSearchSource,
      socialTimelineSource,
      technicianScheduleSource,
      unifiedComposerSource,
      userMembershipsSource,
    ];

    for (const source of pageLevelSources) {
      expect(source).not.toMatch(
        /maxWidth="(?:680|720|880|1600)px"|max-w-\[(?:480|680|720|760|880|960|1120|1480)px\]/u,
      );
    }
  });

  it("uses the shared gutter for primary and fullscreen route bodies", () => {
    const routeBodySources = [
      affiliateMarketplaceSource,
      affiliateTaskDetailSource,
      businessCpsSource,
      merchantOrderRoutesSource,
      merchantScheduleArrangementSource,
      merchantScheduleCellSource,
      serviceDetailSource,
      technicianInfoCardSource,
      userFavoritesSource,
      userOrdersSource,
      userScheduleSource,
    ];

    for (const source of routeBodySources) {
      expect(source).toContain("client-app-gutter");
    }

    expect(affiliateTaskDetailSource).not.toContain("max-w-[480px]");
    expect(userFavoritesSource).not.toContain("max-w-[480px]");
    expect(storeDetailSource).toContain(
      'storeBottomActionRowClassName = "client-app-frame client-app-gutter flex items-center gap-3 pb-2"',
    );
    expect(storeDetailSource).not.toContain("max-w-[888px]");
  });

  it("aligns settings, messaging, scheduling, and fixed action surfaces", () => {
    const supportingRouteSources = [
      accountComplianceSource,
      announcementDetailSource,
      imRecordDetailSource,
      imPagesSource,
      socialComposerPageSource,
      technicianScheduleSetupSource,
      unifiedUserCalendarSource,
    ];

    for (const source of supportingRouteSources) {
      expect(source).toContain("client-app-gutter");
    }

    for (const source of [
      calendarParticipantSource,
      formalCheckoutSource,
      identityApplicationSource,
      ndpGuideSource,
      settingsSource,
      socialComposerPageSource,
      unifiedUserCalendarSource,
    ]) {
      expect(source).toContain("client-app-frame");
    }

    expect(imChatHomeSource).not.toContain('maxWidth="880px"');
    expect(imComponentsSource).not.toContain('maxWidth="880px"');
    expect(unifiedSocialSource).not.toContain('maxWidth="1480px"');
    expect(unifiedSocialSource).not.toContain('"sm:px-4 lg:px-5"');
    expect(imMultiSelectSource).toContain("client-app-frame client-app-gutter");
    expect(socialQuickReplySource).toContain("client-app-frame");
    expect(socialQuickReplySource).not.toContain("max-w-[720px]");
  });

  it("keeps remaining detail routes and intentional full-bleed sections on shared geometry", () => {
    for (const source of [
      categorySource,
      dineInMerchantSource,
      dispatchWorkspaceSource,
      exchangeComposerSource,
      exchangePostDetailSource,
      supportSource,
      userTechnicianScheduleSource,
    ]) {
      expect(source).toContain("client-app-gutter");
    }

    expect(technicianServicesSource).toContain("<MobileFullscreenPage>");
    expect(technicianServicesSource).toContain('className="client-app-gutter');
    expect(technicianServicesSource).not.toContain("client-app-breakout");

    for (const source of [socialProfileSource, unifiedSocialSource]) {
      expect(source).toContain("client-app-breakout");
      expect(source).not.toMatch(/-mx-4[^"\n]*sm:-mx-6/u);
    }
  });
});
