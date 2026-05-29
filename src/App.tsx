import { Component, useEffect, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, type PortalScope, useAuth } from "./auth/AuthProvider";
import type { FeaturePermission } from "./auth/featurePermissions";
import { I18nProvider, I18nRuntime } from "./i18n/I18nProvider";
import { ClientThemeProvider, getClientThemeClassName, getClientThemeModeClassName, getInitialClientThemeState, isNightClientTheme, useClientTheme } from "./theme/ClientThemeProvider";
import { defaultDayAdminTheme, defaultNightAdminTheme, detectSystemAdminTheme, isDarkAdminTheme, normalizeAdminTheme, platformAdminThemeOptions, sharedAdminThemeOptions, type AdminTheme, type AdminThemeOption } from "./theme/AdminTheme";
import { AdminLoginPage } from "./pages/auth/AdminLoginPage";
import { LoginPage } from "./pages/auth/LoginPage";
import { BusinessCpsAdminPage } from "./pages/business-cps/BusinessCpsAdminPage";
import { AnalyticsPage } from "./pages/admin/AnalyticsPage";
import { AdminDocsPage } from "./pages/admin/AdminDocsPage";
import { AdminNotificationComposePage } from "./pages/admin/AdminNotificationComposePage";
import { AdminNotificationsPage } from "./pages/admin/AdminNotificationsPage";
import { AdminSupportPage } from "./pages/admin/AdminSupportPage";
import { AvatarBadgesPage } from "./pages/admin/AvatarBadgesPage";
import { CarouselPage } from "./pages/admin/CarouselPage";
import { CitySettingsPage } from "./pages/admin/CitySettingsPage";
import { CRMPage } from "./pages/admin/CRMPage";
import { CpsPage } from "./pages/admin/CpsPage";
import { DashboardPage } from "./pages/admin/DashboardPage";
import { DataCenterPage } from "./pages/admin/DataCenterPage";
import { DecorationPage } from "./pages/admin/DecorationPage";
import { FieldJobsPage } from "./pages/admin/FieldJobsPage";
import { FinancePage } from "./pages/admin/FinancePage";
import { MarketingPage } from "./pages/admin/MarketingPage";
import { MerchantsPage } from "./pages/admin/MerchantsPage";
import { NeedoDemandAdminPage, NeedoInfoAdminPage } from "./pages/admin/NeedoExchangeAdminPage";
import { OperationTimelinePage } from "./pages/admin/OperationTimelinePage";
import { OrdersAdminPage } from "./pages/admin/OrdersAdminPage";
import { ReviewsPage } from "./pages/admin/ReviewsPage";
import { RolesPage } from "./pages/admin/RolesPage";
import { PermissionsPage } from "./pages/admin/PermissionsPage";
import { TechniciansPage } from "./pages/admin/TechniciansPage";
import { UsersPage } from "./pages/admin/UsersPage";
import { MerchantPortalPage, MerchantStaffDetailRoutePage } from "./pages/mobile/MerchantPortalPage";
import { BusinessCpsPage } from "./pages/mobile/BusinessCpsPage";
import { MerchantAutoDispatchRoutePage } from "./pages/mobile/MerchantAutoDispatchRoutePage";
import { MerchantScheduleArrangementRoutePage } from "./pages/mobile/MerchantScheduleArrangementRoutePage";
import { MerchantScheduleCellRoutePage } from "./pages/mobile/MerchantScheduleCellRoutePage";
import {
  MerchantOrderChangeRoutePage,
  MerchantOrderDetailRoutePage,
  MerchantOrderDispatchRoutePage
} from "./pages/mobile/MerchantOrderRoutePages";
import { ShopMemberCenterPage } from "./features/shop-member/ShopMemberCenterPage";
import { MomentsPage } from "./pages/mobile/MomentsPage";
import { NeedoExchangePage } from "./pages/mobile/NeedoExchangePage";
import {
  NeedoPostCustomerRoutePage,
  NeedoPostDetailRoutePage
} from "./pages/mobile/NeedoRoutePages";
import { TechnicianPortalPage } from "./pages/mobile/TechnicianPortalPage";
import { MerchantAdminDashboardPage } from "./pages/merchant-admin/MerchantAdminDashboardPage";
import { MerchantAdminAnalyticsPage } from "./pages/merchant-admin/MerchantAdminAnalyticsPage";
import {
  MerchantAdminDispatchCenterAutomationPage,
  MerchantAdminDispatchCenterAppointmentsPage,
  MerchantAdminDispatchCenterCurrentPage,
  MerchantAdminDispatchCenterIndexRedirectPage,
  MerchantAdminDispatchCenterManualPage,
  MerchantAdminDispatchCenterOverviewPage,
  MerchantAdminDispatchCenterSchedulePage
} from "./pages/merchant-admin/dispatch-center/DispatchCenterRoutePages";
import { MerchantAdminDesignPage } from "./pages/merchant-admin/MerchantAdminDesignPage";
import { MerchantAdminDocsPage } from "./pages/merchant-admin/MerchantAdminDocsPage";
import { MerchantAdminOrdersPage } from "./pages/merchant-admin/MerchantAdminOrdersPage";
import { MerchantAdminPeoplePage } from "./pages/merchant-admin/MerchantAdminPeoplePage";
import { MerchantAdminSettingsPage } from "./pages/merchant-admin/MerchantAdminSettingsPage";
import {
  MerchantAdminFinancePage,
  MerchantAdminInventoryPage,
  MerchantAdminStageLayoutPage,
  MerchantAdminStoreOpsLegacyRedirectPage
} from "./pages/merchant-admin/store-ops/StoreCapabilityRoutePages";
import {
  TechnicianScheduleDetailRoutePage,
  TechnicianScheduleEditorRoutePage,
  TechnicianOrderDetailRoutePage,
  TechnicianScheduleTransferRoutePage
} from "./features/technician-schedule/route-pages";
import { CategoryPage } from "./pages/user/CategoryPage";
import { CheckoutPage } from "./pages/user/CheckoutPage";
import { ContactsPage } from "./pages/user/ContactsPage";
import { HomePage } from "./pages/user/HomePage";
import { MessagesPage } from "./pages/user/MessagesPage";
import { ProfileDetailPage } from "./pages/user/ProfileDetailPage";
import { ServiceDetailPage } from "./pages/user/ServiceDetailPage";
import { StoreDetailPage } from "./pages/user/StoreDetailPage";
import { SupportPage } from "./pages/user/SupportPage";
import { UserCenterPage } from "./pages/user/UserCenterPage";
import { UserOrdersPage } from "./pages/user/UserOrdersPage";
import { UserOrderDetailPage } from "./pages/user/UserOrderDetailPage";
import { UserSchedulePage } from "./pages/user/UserSchedulePage";
import { UserTechnicianScheduleDetailPage } from "./pages/user/UserTechnicianScheduleDetailPage";
import {
  UserSettingsAccountPage,
  UserSettingsAboutPage,
  UserSettingsDeleteAccountPage,
  UserSettingsHelpPage,
  UserSettingsLanguagePage,
  UserSettingsNotificationsPage,
  UserSettingsNdpGuidePage,
  UserSettingsPage,
  UserSettingsPortalPage,
  UserSettingsPrivacyPage,
  UserSettingsProfileCardBackgroundPage,
  UserSettingsProfilePage,
  UserSettingsServiceRangePage,
  UserSettingsThemePage,
  UserSettingsTermsPage,
  UserSettingsVerificationPage
} from "./pages/user/UserSettingsPages";
import {
  UnifiedSettingsAboutPage,
  UnifiedSettingsAccountPage,
  UnifiedSettingsDeleteAccountPage,
  UnifiedSettingsHelpPage,
  UnifiedSettingsLanguagePage,
  UnifiedSettingsNotificationsPage,
  UnifiedSettingsPage,
  UnifiedSettingsPortalPage,
  UnifiedSettingsPrivacyPage,
  UnifiedSettingsProfileCardBackgroundPage,
  UnifiedSettingsProfilePage,
  UnifiedSettingsServiceRangePage,
  UnifiedSettingsThemePage,
  UnifiedSettingsTermsPage,
  UnifiedSettingsVerificationPage
} from "./features/settings/UnifiedSettingsPages";
import { TravelSettingsPage } from "./pages/admin/TravelSettingsPage";
import { ShareFeedbackViewport } from "./components/ui/ShareFeedbackViewport";
import { OfficialNoticeAutoPopup } from "./components/ui/OfficialNoticeAutoPopup";
import { NeedoPet, NeedoPetRunningSprite } from "./components/ui/NeedoPet";
import { clearNeedoStorage } from "./lib/browserStorage";
import { isNonFatalBrowserRuntimeError } from "./lib/share";
import { useEntityStore } from "./state/entityStore";
import {
  DineInBillPage,
  DineInCustomerMenuPage,
  DineInItemDetailPage,
  DineInOrderProgressPage,
  DineInQrRedirectPage,
  DineInReviewPage,
  DineInScanPage
} from "./features/dine-in/customer-pages";
import {
  MerchantDineFloorRoutePage,
  MerchantDineMenuRoutePage,
  MerchantDineOrderDetailRoutePage,
  MerchantDineOrderRoutePage
} from "./features/dine-in/merchant-route-pages";
import {
  MerchantAdminDineFloorRoutePage,
  MerchantAdminDineMenuRoutePage,
  MerchantAdminDineOrderRoutePage
} from "./features/dine-in/merchant-admin-route-pages";
import {
  ImBlacklistPage,
  ImContactDetailPage,
  ImContactsListPage,
  ImContactTagsPage,
  ImConversationInfoPage,
  ImConversationRoomRoutePage,
  ImFriendRequestsPage,
  ImMediaRecordsPage,
  ImMessagesEntryPage,
  ImNewConversationPage,
  ImOrganizationContactsPage,
  ImSearchPage,
  ImServiceAccountsPage
} from "./features/im/pages";
import { ImScopeProvider } from "./features/im/scope";
import { SocialProvider } from "./features/social/context";
import { SocialComposerPage } from "./features/social/pages/SocialComposerPage";
import { SocialDraftsPage } from "./features/social/pages/SocialDraftsPage";
import { SocialMediaViewerPage } from "./features/social/pages/SocialMediaViewerPage";
import { SocialNotificationsPage } from "./features/social/pages/SocialNotificationsPage";
import { SocialPostDetailPage } from "./features/social/pages/SocialPostDetailPage";
import { SocialRelationshipsPage } from "./features/social/pages/SocialRelationshipsPage";
import { SocialRepostPage } from "./features/social/pages/SocialRepostPage";
import { SocialSearchPage } from "./features/social/pages/SocialSearchPage";
import {
  backendManagementSystemBgUrl,
  businessBgUrl,
  errorBgUrl,
  loginBgUrl,
  managementBgUrl
} from "./assets/runtime/images";

type SplashPortal = "user" | "business" | "businessAdmin" | "merchant" | "technician" | "admin" | "merchantAdmin";

type RuntimeErrorSource = "render" | "window" | "async";

type RootErrorBoundaryState = {
  error: Error | null;
  errorCode: string | null;
  errorSource: RuntimeErrorSource | null;
};

function normalizeError(input: unknown) {
  if (input instanceof Error) {
    return input;
  }

  if (typeof input === "string" && input.trim()) {
    return new Error(input);
  }

  if (input && typeof input === "object" && "message" in input) {
    const message = String((input as { message?: unknown }).message ?? "");
    const name = "name" in input ? String((input as { name?: unknown }).name ?? "Error") : "Error";
    const error = new Error(message || "Unknown runtime error");
    error.name = name;

    if ("stack" in input && typeof (input as { stack?: unknown }).stack === "string") {
      error.stack = (input as { stack?: string }).stack;
    }

    return error;
  }

  try {
    return new Error(JSON.stringify(input));
  } catch {
    return new Error("Unknown runtime error");
  }
}

function hashErrorCode(source: RuntimeErrorSource, error: Error) {
  const raw = `${source}|${error.name}|${error.message}|${error.stack ?? ""}`;
  let hash = 0;

  for (const char of raw) {
    hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  }

  return hash.toString(36).toUpperCase().padStart(6, "0").slice(0, 6);
}

function classifyErrorFamily(error: Error) {
  const text = `${error.name} ${error.message} ${error.stack ?? ""}`.toLowerCase();

  if (text.includes("localstorage") || text.includes("json") || text.includes("hydrate") || text.includes("entity-store")) {
    return "STORAGE";
  }

  if (text.includes("auth") || text.includes("login") || text.includes("portal") || text.includes("session")) {
    return "AUTH";
  }

  if (
    text.includes("customer") ||
    text.includes("technician") ||
    text.includes("store") ||
    text.includes("systemid") ||
    text.includes("serviceareas") ||
    text.includes("languages")
  ) {
    return "DATA";
  }

  if (text.includes("promise") || text.includes("fetch") || text.includes("async")) {
    return "ASYNC";
  }

  return "UI";
}

function buildRuntimeErrorCode(source: RuntimeErrorSource, error: Error) {
  return `ND-${classifyErrorFamily(error)}-${source.toUpperCase()}-${hashErrorCode(source, error)}`;
}

class RootErrorBoundary extends Component<{ children: ReactNode }, RootErrorBoundaryState> {
  state: RootErrorBoundaryState = {
    error: null,
    errorCode: null,
    errorSource: null
  };

  static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    const normalized = normalizeError(error);

    return {
      error: normalized,
      errorCode: buildRuntimeErrorCode("render", normalized),
      errorSource: "render"
    };
  }

  private handleWindowError = (event: ErrorEvent) => {
    const error = normalizeError(event.error ?? event.message);

    if (isNonFatalBrowserRuntimeError(error)) {
      console.info("NeeDo ignored non-fatal runtime error", { source: "window", error });
      return;
    }

    const errorCode = buildRuntimeErrorCode("window", error);
    console.error("NeeDo runtime error", { errorCode, source: "window", error });
    this.setState({
      error,
      errorCode,
      errorSource: "window"
    });
  };

  private handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const error = normalizeError(event.reason);

    if (isNonFatalBrowserRuntimeError(error)) {
      event.preventDefault();
      console.info("NeeDo ignored non-fatal runtime rejection", { source: "async", error });
      return;
    }

    const errorCode = buildRuntimeErrorCode("async", error);
    console.error("NeeDo runtime rejection", { errorCode, source: "async", error });
    this.setState({
      error,
      errorCode,
      errorSource: "async"
    });
  };

  componentDidMount() {
    if (typeof window === "undefined") {
      return;
    }

    window.addEventListener("error", this.handleWindowError);
    window.addEventListener("unhandledrejection", this.handleUnhandledRejection);
  }

  componentDidCatch(error: Error) {
    const normalized = normalizeError(error);
    const errorCode = buildRuntimeErrorCode("render", normalized);
    console.error("NeeDo runtime error", { errorCode, source: "render", error: normalized });
  }

  componentWillUnmount() {
    if (typeof window === "undefined") {
      return;
    }

    window.removeEventListener("error", this.handleWindowError);
    window.removeEventListener("unhandledrejection", this.handleUnhandledRejection);
  }

  clearCacheAndReload() {
    if (typeof window === "undefined") {
      return;
    }

    clearNeedoStorage({ silent: true });
    window.location.reload();
  }

  reload() {
    if (typeof window === "undefined") {
      return;
    }

    window.location.reload();
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    const recoveryTheme = getInitialClientThemeState().theme;
    const isNight = isNightClientTheme(recoveryTheme);
    const themeClassName = `client-shell ${getClientThemeModeClassName(recoveryTheme)} ${getClientThemeClassName(recoveryTheme)} ${isNight ? "text-white" : "text-[color:var(--client-text)]"}`;

    return (
      <div className={`relative min-h-screen overflow-hidden bg-[color:var(--client-bg)] ${themeClassName}`}>
        <img
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
          fetchPriority="high"
          src={errorBgUrl}
        />
        <div className="fixed inset-x-0 bottom-0 z-10 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6">
          <div className="mx-auto max-h-[calc(100dvh-2.5rem)] w-full max-w-xl overflow-y-auto rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg-soft)_76%,transparent)] p-4 shadow-[0_20px_80px_rgba(0,0,0,0.32)] sm:p-5">
            <div className="flex items-start gap-3">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-accent)_52%,transparent)] bg-[color:var(--client-accent)] text-[28px] font-black text-white shadow-[0_0_0_8px_color-mix(in_srgb,var(--client-accent)_12%,transparent),0_18px_40px_color-mix(in_srgb,var(--client-accent)_34%,transparent)]">
                !
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-black tracking-[0.18em] text-[color:var(--client-primary)]">NeeDo 恢复模式</p>
                <h1 className="mt-1 text-lg font-black text-[color:var(--client-text)] sm:text-xl">页面发生运行错误，已进入恢复页</h1>
                <p className="mt-2 text-xs leading-6 text-[color:var(--client-muted)]">
                  你可以先重试；如果仍然异常，再清除 NeeDo 本地缓存后重新载入。错误编号和摘要保留在下方，方便继续定位。
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_80%,transparent)] px-4 py-3 text-[12px] leading-6 text-[color:var(--client-muted)]">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-bold text-[color:var(--client-text)]">错误编号</span>
                <span className="break-all font-black tracking-[0.08em] text-[color:var(--client-primary)]">{this.state.errorCode ?? "ND-UNKNOWN-000000"}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="font-bold text-[color:var(--client-text)]">错误来源</span>
                <span className="font-semibold uppercase tracking-[0.08em] text-[color:var(--client-text)]">{this.state.errorSource ?? "unknown"}</span>
              </div>
              <div className="mt-2">
                <span className="font-bold text-[color:var(--client-text)]">错误摘要</span>
                <p className="mt-1 break-words text-[color:var(--client-muted)]">{this.state.error.message || "Unknown runtime error"}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap justify-center gap-2.5">
              <button
                className="rounded-full bg-[color:var(--client-primary)] px-4 py-2.5 text-sm font-black text-[color:var(--client-needo-text)] shadow-[0_12px_28px_color-mix(in_srgb,var(--client-primary)_28%,transparent)]"
                onClick={() => this.reload()}
                type="button"
              >
                重新加载
              </button>
              <button
                className="rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_76%,transparent)] px-4 py-2.5 text-sm font-black text-[color:var(--client-text)]"
                onClick={() => this.clearCacheAndReload()}
                type="button"
              >
                清除本地缓存并重载
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

function getSplashPortal(pathname: string): SplashPortal | null {
  if (pathname.startsWith("/login")) {
    return null;
  }

  // Check the more specific merchant-admin route first so it gets its own entry art.
  if (pathname.startsWith("/merchant-admin")) {
    return "merchantAdmin";
  }

  if (pathname.startsWith("/admin")) {
    return "admin";
  }

  if (pathname.startsWith("/NDA-admin") || pathname.startsWith("/nda-admin") || pathname.startsWith("/afirieito-admin") || pathname.startsWith("/CPS-admin") || pathname.startsWith("/cps-admin") || pathname.startsWith("/business-admin")) {
    return "businessAdmin";
  }

  if (pathname.startsWith("/afirieito") || pathname.startsWith("/cps") || pathname.startsWith("/business")) {
    return "business";
  }

  if (pathname.startsWith("/merchant")) {
    return "merchant";
  }

  if (pathname.startsWith("/shop")) {
    return "merchant";
  }

  if (pathname.startsWith("/technician")) {
    return "technician";
  }

  return "user";
}

function ScrollToTop() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname, location.search, location.hash]);

  return null;
}

function EntityStoreBootstrap() {
  useEntityStore();

  return null;
}

function CategoryListRedirect({ type }: { type: "store" | "service" }) {
  const location = useLocation();
  const sourceParams = new URLSearchParams(location.search);
  const nextParams = new URLSearchParams();

  nextParams.set("type", type);

  if (type === "service") {
    const category = sourceParams.get("category");

    if (category) {
      nextParams.set("category", category);
    }
  }

  return <Navigate replace to={`/categories?${nextParams.toString()}`} />;
}

const splashCopy: Record<SplashPortal, { title: string }> = {
  user: {
    title: "NeeDo 用户端"
  },
  business: {
    title: "NeeDoAfirieito"
  },
  businessAdmin: {
    title: "NDA管理后台"
  },
  merchant: {
    title: "NeeDo 商户端"
  },
  technician: {
    title: "NeeDo 技师端"
  },
  admin: {
    title: "NeeDo 运营后台"
  },
  merchantAdmin: {
    title: "商户后台"
  }
};

const splashImages: Record<SplashPortal, string> = {
  user: loginBgUrl,
  business: businessBgUrl,
  businessAdmin: backendManagementSystemBgUrl,
  merchant: managementBgUrl,
  technician: businessBgUrl,
  admin: backendManagementSystemBgUrl,
  merchantAdmin: backendManagementSystemBgUrl
};

const splashVersionLabel = "0.001";
const splashCopyrightText = "Copyright © 2026 LifeDance. All rights reserved.";

const splashAdminThemeConfig = {
  admin: {
    themeStorageKey: "needo.admin.theme",
    themePreferenceModeStorageKey: "needo.admin.theme.mode",
    options: platformAdminThemeOptions,
    dayTheme: defaultDayAdminTheme,
    nightTheme: defaultNightAdminTheme,
    legacyDarkTheme: defaultNightAdminTheme
  },
  merchantAdmin: {
    themeStorageKey: "needo.merchant-admin.theme",
    themePreferenceModeStorageKey: "needo.merchant-admin.theme.mode",
    options: sharedAdminThemeOptions,
    dayTheme: defaultDayAdminTheme,
    nightTheme: defaultNightAdminTheme,
    legacyDarkTheme: defaultNightAdminTheme
  },
  businessAdmin: {
    themeStorageKey: "needo.afirieito-admin.theme",
    themePreferenceModeStorageKey: "needo.afirieito-admin.theme.mode",
    options: sharedAdminThemeOptions,
    dayTheme: defaultDayAdminTheme,
    nightTheme: defaultNightAdminTheme,
    legacyDarkTheme: defaultNightAdminTheme
  }
} satisfies Record<Extract<SplashPortal, "admin" | "merchantAdmin" | "businessAdmin">, {
  themeStorageKey: string;
  themePreferenceModeStorageKey: string;
  options: readonly AdminThemeOption[];
  dayTheme: AdminTheme;
  nightTheme: AdminTheme;
  legacyDarkTheme: AdminTheme;
}>;

const portalEntryPath: Record<PortalScope, string> = {
  user: "/",
  merchant: "/merchant",
  technician: "/technician",
  business: "/afirieito",
  admin: "/admin"
};

function readSplashStorage(key: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function getSplashAdminTheme(portal: Extract<SplashPortal, "admin" | "merchantAdmin" | "businessAdmin">) {
  const config = splashAdminThemeConfig[portal];
  const preferenceMode = readSplashStorage(config.themePreferenceModeStorageKey);

  if (preferenceMode === "manual") {
    return normalizeAdminTheme(readSplashStorage(config.themeStorageKey), config.dayTheme, config.options, config.legacyDarkTheme);
  }

  return detectSystemAdminTheme(config.dayTheme, config.nightTheme, config.options);
}

function getSplashThemeClassName(portal: SplashPortal, clientTheme: ReturnType<typeof useClientTheme>["theme"]) {
  if (portal === "admin" || portal === "merchantAdmin" || portal === "businessAdmin") {
    const adminTheme = getSplashAdminTheme(portal);

    return [
      "needo-splash-theme",
      "needo-splash-theme-admin",
      "admin-shell",
      `admin-theme-${adminTheme}`,
      isDarkAdminTheme(adminTheme) ? "needo-splash-theme-dark" : "needo-splash-theme-light"
    ].join(" ");
  }

  return [
    "needo-splash-theme",
    "needo-splash-theme-client",
    getClientThemeModeClassName(clientTheme),
    getClientThemeClassName(clientTheme),
    isNightClientTheme(clientTheme) ? "needo-splash-theme-dark" : "needo-splash-theme-light"
  ].join(" ");
}

function SplashScreen({ onDone, portal }: { onDone: () => void; portal: SplashPortal }) {
  const { theme } = useClientTheme();
  const splashImage = splashImages[portal];
  const copy = splashCopy[portal];
  const themeClassName = getSplashThemeClassName(portal, theme);
  const [imageReady, setImageReady] = useState(false);
  const [minimumElapsed, setMinimumElapsed] = useState(false);

  useEffect(() => {
    setImageReady(false);
    setMinimumElapsed(false);

    const preload = new Image();
    let active = true;

    const markReady = () => {
      if (active) {
        setImageReady(true);
      }
    };

    preload.onload = markReady;
    preload.onerror = markReady;
    preload.src = splashImage;

    if (preload.complete) {
      markReady();
    }

    const timer = window.setTimeout(() => {
      if (active) {
        setMinimumElapsed(true);
      }
    }, 920);

    return () => {
      active = false;
      preload.onload = null;
      preload.onerror = null;
      window.clearTimeout(timer);
    };
  }, [splashImage]);

  useEffect(() => {
    if (!imageReady || !minimumElapsed) {
      return;
    }

    const timer = window.setTimeout(onDone, 620);

    return () => window.clearTimeout(timer);
  }, [imageReady, minimumElapsed, onDone]);

  return (
    <div
      className="fixed inset-0 z-[999] overflow-hidden bg-[#090806]"
      data-needo-splash-version={splashVersionLabel}
      style={{
        backgroundImage: `url('${splashImage}')`,
        backgroundPosition: "center",
        backgroundSize: "cover"
      }}
    >
      <img
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
        decoding="sync"
        fetchPriority="high"
        loading="eager"
        src={splashImage}
      />
      <div className={`relative h-full ${themeClassName}`}>
        <div className="absolute inset-0 bg-[color:var(--needo-splash-image-tint)]" />
        <div aria-hidden="true" className="needo-splash-gradient absolute inset-0" />
        <img
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover opacity-[0.02]"
          decoding="sync"
          loading="eager"
          src={splashImage}
        />
        <div className="needo-splash-version-badge" aria-label={`版本 ${splashVersionLabel}`}>
          ver：{splashVersionLabel}
        </div>

        <div className="fixed inset-x-0 bottom-0 z-[1001] w-full px-5 pb-[max(1.4rem,env(safe-area-inset-bottom))] sm:px-8 sm:pb-7">
          <div className="needo-splash-content-frame mx-auto flex max-h-[calc(100dvh-5.5rem)] w-full max-w-xl flex-col items-stretch overflow-y-auto">
            <h1 className="text-[clamp(2rem,7vw,4.5rem)] font-black leading-[0.95] tracking-normal text-[color:var(--needo-splash-text)]">{copy.title}</h1>

            <div
              className={`needo-splash-loading mt-8 ${minimumElapsed ? "needo-splash-loading-complete" : ""}`}
              style={{ "--needo-splash-progress": minimumElapsed ? "100%" : "24%" } as CSSProperties}
            >
              <div className="needo-splash-runner" aria-hidden="true">
                <NeedoPetRunningSprite />
              </div>
              <p className="needo-splash-loading-label">Loading</p>
              <div className="needo-splash-progress-track" aria-hidden="true">
                <div className="needo-splash-progress-fill" />
              </div>
            </div>

            <p className="mt-7 text-center text-xs leading-5 text-[color:var(--needo-splash-soft)]">{splashCopyrightText}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function isBusinessAdminPath(pathname: string) {
  return (
    pathname.startsWith("/NDA-admin") ||
    pathname.startsWith("/nda-admin") ||
    pathname.startsWith("/afirieito-admin") ||
    pathname.startsWith("/CPS-admin") ||
    pathname.startsWith("/cps-admin") ||
    pathname.startsWith("/business-admin")
  );
}

function RequirePortalAuth({
  portal,
  children
}: {
  portal: PortalScope;
  children: ReactElement;
}) {
  const { isAuthenticated, isRestoring, canAccess, canEnterPortal, session, switchPortal } = useAuth();
  const location = useLocation();
  const hasDirectAccess = canAccess(portal);
  const isBackendPortalRoute =
    portal === "admin" ||
    (portal === "merchant" && location.pathname.startsWith("/merchant-admin")) ||
    (portal === "business" && isBusinessAdminPath(location.pathname));
  const hasAccess = hasDirectAccess || (!isBackendPortalRoute && canEnterPortal(portal));
  const needsPortalSync = isAuthenticated && hasDirectAccess && session?.portal !== portal;

  useEffect(() => {
    if (!needsPortalSync) {
      return;
    }

    // Keep the active session portal aligned with the matched route.
    switchPortal(portal);
  }, [needsPortalSync, portal, switchPortal]);

  if (isRestoring) {
    return null;
  }

  if (!isAuthenticated || !hasAccess) {
    const redirect = `${location.pathname}${location.search}${location.hash}`;
    const loginPath = portal === "merchant" && location.pathname.startsWith("/merchant-admin")
      ? "/login/merchant-admin"
      : portal === "business" && isBusinessAdminPath(location.pathname)
        ? "/login/afirieito-admin"
      : portal === "business"
        ? "/login/afirieito"
        : `/login/${portal}`;

    return <Navigate replace to={`${loginPath}?redirect=${encodeURIComponent(redirect)}`} />;
  }

  if (needsPortalSync) {
    return null;
  }

  return children;
}

function LegacyBusinessRedirect() {
  const location = useLocation();
  const targetPath = location.pathname.replace(/^\/(?:business|cps)(?=\/|$)/, "/afirieito");

  return <Navigate replace to={`${targetPath}${location.search}${location.hash}`} />;
}

function LegacyNdaAdminRedirect() {
  const location = useLocation();
  const targetPath = location.pathname.replace(/^\/(?:CPS-admin|cps-admin|business-admin|nda-admin|afirieito-admin)(?=\/|$)/i, "/NDA-admin");

  return <Navigate replace to={`${targetPath}${location.search}${location.hash}`} />;
}

function LegacyAdminAfirieitoRedirect() {
  const location = useLocation();
  const targetPath = location.pathname.replace(/^\/admin\/cps(?=\/|$)/, "/admin/afirieito");

  return <Navigate replace to={`${targetPath}${location.search}${location.hash}`} />;
}

function RequireFeaturePermission({
  portal,
  permission,
  fallbackTo,
  children
}: {
  portal: PortalScope;
  permission: FeaturePermission;
  fallbackTo?: string;
  children: ReactElement;
}) {
  const { canAccessFeature } = useAuth();

  if (!canAccessFeature(portal, permission)) {
    return <Navigate replace to={fallbackTo ?? portalEntryPath[portal]} />;
  }

  return children;
}

function ForbiddenScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-6 text-center text-ink">
      <section className="max-w-md rounded-lg border border-line bg-white p-6 shadow-panel">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-ink/45">403</p>
        <h1 className="mt-3 text-2xl font-black">没有访问权限</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-ink/55">当前账号没有访问此后台功能所需的权限，请联系管理员调整角色。</p>
      </section>
    </main>
  );
}

function RequirePermission({
  permission,
  children
}: {
  permission: string;
  children: ReactElement;
}) {
  const { hasPermission, isRestoring } = useAuth();

  if (isRestoring) {
    return null;
  }

  if (!hasPermission(permission)) {
    return <ForbiddenScreen />;
  }

  return children;
}

export default function App() {
  const location = useLocation();
  const currentPortal = getSplashPortal(location.pathname);
  const [splashPortal, setSplashPortal] = useState<SplashPortal | null>(currentPortal);
  const [lastPortal, setLastPortal] = useState<SplashPortal | null>(null);
  const protect = (portal: PortalScope, element: ReactElement) => <RequirePortalAuth portal={portal}>{element}</RequirePortalAuth>;
  const protectPermission = (portal: PortalScope, permission: string, element: ReactElement) =>
    protect(
      portal,
      <RequirePermission permission={permission}>
        {element}
      </RequirePermission>
    );
  const protectFeature = (portal: PortalScope, permission: FeaturePermission, element: ReactElement, fallbackTo?: string) =>
    protect(
      portal,
      <RequireFeaturePermission fallbackTo={fallbackTo} permission={permission} portal={portal}>
        {element}
      </RequireFeaturePermission>
    );

  useEffect(() => {
    if (!currentPortal) {
      setSplashPortal(null);
      setLastPortal(null);
      return;
    }

    if (currentPortal !== lastPortal) {
      setSplashPortal(currentPortal);
      setLastPortal(currentPortal);
    }
  }, [currentPortal, lastPortal]);

  const completeSplash = () => {
    setSplashPortal(null);
  };

  return (
    <RootErrorBoundary>
      <AuthProvider>
        <I18nProvider>
          <ClientThemeProvider>
            <I18nRuntime>
              <EntityStoreBootstrap />
              <SocialProvider>
                {splashPortal ? <SplashScreen onDone={completeSplash} portal={splashPortal} /> : null}
                <ScrollToTop />
                <ShareFeedbackViewport />
                <OfficialNoticeAutoPopup disabled={Boolean(splashPortal)} />
                <NeedoPet disabled={Boolean(splashPortal)} />
                <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/login/admin" element={<AdminLoginPage portal="admin" />} />
              <Route path="/login/merchant-admin" element={<AdminLoginPage portal="merchant-admin" />} />
              <Route path="/login/NDA-admin" element={<AdminLoginPage portal="afirieito-admin" />} />
              <Route path="/login/nda-admin" element={<AdminLoginPage portal="afirieito-admin" />} />
              <Route path="/login/afirieito-admin" element={<AdminLoginPage portal="afirieito-admin" />} />
              <Route path="/login/CPS-admin" element={<AdminLoginPage portal="afirieito-admin" />} />
              <Route path="/login/cps-admin" element={<AdminLoginPage portal="afirieito-admin" />} />
              <Route path="/login/business-admin" element={<AdminLoginPage portal="afirieito-admin" />} />
              <Route path="/login/:portal" element={<LoginPage />} />

              <Route path="/" element={protect("user", <HomePage />)} />
              <Route path="/categories" element={protect("user", <CategoryPage />)} />
              <Route path="/services" element={protect("user", <CategoryListRedirect type="service" />)} />
              <Route path="/services/:id" element={protect("user", <ServiceDetailPage />)} />
              <Route path="/stores" element={protect("user", <CategoryListRedirect type="store" />)} />
              <Route path="/stores/:id" element={protect("user", <StoreDetailPage />)} />
              <Route path="/profiles/:entityType/:id/followers" element={protect("user", <SocialRelationshipsPage />)} />
              <Route path="/profiles/:entityType/:id/following" element={protect("user", <SocialRelationshipsPage />)} />
              <Route path="/profiles/:entityType/:id" element={protect("user", <ProfileDetailPage />)} />
              <Route path="/checkout/:serviceId" element={protect("user", <CheckoutPage />)} />
              <Route path="/schedule" element={protect("user", <UserSchedulePage />)} />
              <Route path="/schedule/technicians/:technicianId" element={protect("user", <UserTechnicianScheduleDetailPage />)} />
              <Route path="/schedule/new" element={protect("user", <Navigate replace to="/schedule" />)} />
              <Route path="/schedule/events/:eventId/edit" element={protect("user", <Navigate replace to="/schedule" />)} />
              <Route path="/schedule/events/:eventId" element={protect("user", <Navigate replace to="/schedule" />)} />
              <Route path="/scan" element={protect("user", <DineInScanPage />)} />
              <Route path="/q/:token" element={protect("user", <DineInQrRedirectPage />)} />
              <Route path="/dine/:sessionId/menu" element={protect("user", <DineInCustomerMenuPage />)} />
              <Route path="/dine/:sessionId/bill" element={protect("user", <DineInBillPage />)} />
              <Route path="/dine/orders/:orderId" element={protect("user", <DineInOrderProgressPage />)} />
              <Route path="/dine/items/:itemId" element={protect("user", <DineInItemDetailPage />)} />
              <Route path="/reviews/new" element={protect("user", <DineInReviewPage />)} />
              <Route path="/messages" element={protect("user", <MessagesPage />)} />
              <Route path="/messages/new" element={protect("user", <ImScopeProvider scope="user"><ImNewConversationPage /></ImScopeProvider>)} />
              <Route path="/messages/:conversationId/info" element={protect("user", <ImScopeProvider scope="user"><ImConversationInfoPage /></ImScopeProvider>)} />
              <Route path="/messages/:conversationId/media" element={protect("user", <ImScopeProvider scope="user"><ImMediaRecordsPage /></ImScopeProvider>)} />
              <Route path="/messages/:conversationId" element={protect("user", <ImScopeProvider scope="user"><ImConversationRoomRoutePage /></ImScopeProvider>)} />
              <Route path="/contacts" element={protect("user", <ContactsPage />)} />
              <Route path="/contacts/requests" element={protect("user", <ImScopeProvider scope="user"><ImFriendRequestsPage /></ImScopeProvider>)} />
              <Route path="/contacts/blacklist" element={protect("user", <ImScopeProvider scope="user"><ImBlacklistPage /></ImScopeProvider>)} />
              <Route path="/contacts/tags" element={protect("user", <ImScopeProvider scope="user"><ImContactTagsPage /></ImScopeProvider>)} />
              <Route path="/contacts/service-accounts" element={protect("user", <ImScopeProvider scope="user"><ImServiceAccountsPage /></ImScopeProvider>)} />
              <Route path="/contacts/:contactId" element={protect("user", <ImScopeProvider scope="user"><ImContactDetailPage /></ImScopeProvider>)} />
              <Route path="/im/search" element={protect("user", <ImScopeProvider scope="user"><ImSearchPage /></ImScopeProvider>)} />
              <Route path="/moments/compose" element={protect("user", <SocialComposerPage />)} />
              <Route path="/moments/drafts" element={protect("user", <SocialDraftsPage />)} />
              <Route path="/moments/search" element={protect("user", <SocialSearchPage />)} />
              <Route path="/moments/tags/:tag" element={protect("user", <SocialSearchPage />)} />
              <Route path="/moments/notifications" element={protect("user", <SocialNotificationsPage />)} />
              <Route path="/moments/posts/:postId/replies" element={protect("user", <SocialPostDetailPage />)} />
              <Route path="/moments/posts/:postId/repost" element={protect("user", <SocialRepostPage />)} />
              <Route path="/moments/posts/:postId/media/:mediaId" element={protect("user", <SocialMediaViewerPage />)} />
              <Route path="/moments/posts/:postId" element={protect("user", <SocialPostDetailPage />)} />
              <Route path="/moments" element={protect("user", <MomentsPage />)} />
              <Route path="/needo/posts/:postId/customer" element={protect("user", <NeedoPostCustomerRoutePage />)} />
              <Route path="/needo/posts/:postId" element={protect("user", <NeedoPostDetailRoutePage />)} />
              <Route path="/needo" element={protect("user", <NeedoExchangePage />)} />
              <Route path="/afirieito" element={protect("business", <BusinessCpsPage />)} />
              <Route path="/afirieito/more" element={protect("business", <BusinessCpsPage />)} />
              <Route path="/afirieito/plan" element={protect("business", <BusinessCpsPage />)} />
              <Route path="/afirieito/data" element={protect("business", <BusinessCpsPage />)} />
              <Route path="/afirieito/organization" element={protect("business", <BusinessCpsPage />)} />
              <Route path="/afirieito/promotions" element={protect("business", <BusinessCpsPage />)} />
              <Route path="/afirieito/links" element={protect("business", <BusinessCpsPage />)} />
              <Route path="/afirieito/materials" element={protect("business", <BusinessCpsPage />)} />
              <Route path="/afirieito/referrals" element={protect("business", <BusinessCpsPage />)} />
              <Route path="/afirieito/team" element={protect("business", <BusinessCpsPage />)} />
              <Route path="/afirieito/earnings" element={protect("business", <BusinessCpsPage />)} />
              <Route path="/afirieito/reporting" element={protect("business", <BusinessCpsPage />)} />
              <Route path="/afirieito/risk" element={protect("business", <BusinessCpsPage />)} />
              <Route path="/afirieito/notifications" element={protect("business", <BusinessCpsPage />)} />
              <Route path="/afirieito/me" element={protect("business", <BusinessCpsPage />)} />
              <Route path="/afirieito/settings" element={protect("business", <UnifiedSettingsPage portal="business" />)} />
              <Route path="/afirieito/settings/theme" element={protect("business", <UnifiedSettingsThemePage portal="business" />)} />
              <Route path="/afirieito/settings/language" element={protect("business", <UnifiedSettingsLanguagePage portal="business" />)} />
              <Route path="/afirieito/settings/portal" element={protect("business", <UnifiedSettingsPortalPage portal="business" />)} />
              <Route path="/afirieito/settings/account" element={protect("business", <UnifiedSettingsAccountPage portal="business" />)} />
              <Route path="/afirieito/settings/notifications" element={protect("business", <UnifiedSettingsNotificationsPage portal="business" />)} />
              <Route path="/afirieito/settings/help" element={protect("business", <UnifiedSettingsHelpPage portal="business" />)} />
              <Route path="/afirieito/settings/about" element={protect("business", <UnifiedSettingsAboutPage portal="business" />)} />
              <Route path="/afirieito/settings/terms" element={protect("business", <UnifiedSettingsTermsPage portal="business" />)} />
              <Route path="/afirieito/settings/privacy" element={protect("business", <UnifiedSettingsPrivacyPage portal="business" />)} />
              <Route path="/afirieito/settings/delete-account" element={protect("business", <UnifiedSettingsDeleteAccountPage portal="business" />)} />
              <Route path="/cps/*" element={<LegacyBusinessRedirect />} />
              <Route path="/business/*" element={<LegacyBusinessRedirect />} />
              <Route path="/NDA-admin" element={<BusinessCpsAdminPage />} />
              <Route path="/NDA-admin/*" element={<BusinessCpsAdminPage />} />
              <Route path="/nda-admin/*" element={<LegacyNdaAdminRedirect />} />
              <Route path="/afirieito-admin/*" element={<LegacyNdaAdminRedirect />} />
              <Route path="/CPS-admin/*" element={<LegacyNdaAdminRedirect />} />
              <Route path="/cps-admin/*" element={<LegacyNdaAdminRedirect />} />
              <Route path="/business-admin/*" element={<LegacyNdaAdminRedirect />} />
              <Route path="/orders" element={protect("user", <UserOrdersPage />)} />
              <Route path="/orders/:orderId" element={protect("user", <UserOrderDetailPage />)} />
              <Route path="/me" element={protect("user", <UserCenterPage />)} />
              <Route path="/me/settings" element={protect("user", <UserSettingsPage />)} />
              <Route path="/me/settings/theme" element={protect("user", <UserSettingsThemePage />)} />
              <Route path="/me/settings/language" element={protect("user", <UserSettingsLanguagePage />)} />
              <Route path="/me/settings/portal" element={protect("user", <UserSettingsPortalPage />)} />
              <Route path="/me/settings/home-shortcuts" element={protect("user", <Navigate replace to="/me/settings" />)} />
              <Route path="/me/settings/profile" element={protect("user", <UserSettingsProfilePage />)} />
              <Route path="/me/settings/profile-card-background" element={protect("user", <UserSettingsProfileCardBackgroundPage />)} />
              <Route path="/me/settings/verification" element={protect("user", <UserSettingsVerificationPage />)} />
              <Route path="/me/settings/service-range" element={protect("user", <UserSettingsServiceRangePage />)} />
              <Route path="/me/settings/account" element={protect("user", <UserSettingsAccountPage />)} />
              <Route path="/me/settings/notifications" element={protect("user", <UserSettingsNotificationsPage />)} />
              <Route path="/me/settings/help" element={protect("user", <UserSettingsHelpPage />)} />
              <Route path="/me/settings/about" element={protect("user", <UserSettingsAboutPage />)} />
              <Route path="/me/settings/terms" element={protect("user", <UserSettingsTermsPage />)} />
              <Route path="/me/settings/privacy" element={protect("user", <UserSettingsPrivacyPage />)} />
              <Route path="/me/settings/ndp-guide" element={protect("user", <UserSettingsNdpGuidePage />)} />
              <Route path="/me/settings/delete-account" element={protect("user", <UserSettingsDeleteAccountPage />)} />
              <Route path="/support" element={protect("user", <SupportPage />)} />

              <Route path="/merchant" element={protect("merchant", <MerchantPortalPage />)} />
              <Route path="/merchant/messages" element={protect("merchant", <ImScopeProvider scope="merchant"><ImMessagesEntryPage /></ImScopeProvider>)} />
              <Route path="/merchant/messages/new" element={protect("merchant", <ImScopeProvider scope="merchant"><ImNewConversationPage /></ImScopeProvider>)} />
              <Route path="/merchant/messages/:conversationId/info" element={protect("merchant", <ImScopeProvider scope="merchant"><ImConversationInfoPage /></ImScopeProvider>)} />
              <Route path="/merchant/messages/:conversationId/media" element={protect("merchant", <ImScopeProvider scope="merchant"><ImMediaRecordsPage /></ImScopeProvider>)} />
              <Route path="/merchant/messages/:conversationId" element={protect("merchant", <ImScopeProvider scope="merchant"><ImConversationRoomRoutePage /></ImScopeProvider>)} />
              <Route path="/merchant/contacts" element={protect("merchant", <ImScopeProvider scope="merchant"><ImContactsListPage /></ImScopeProvider>)} />
              <Route path="/merchant/contacts/requests" element={protect("merchant", <ImScopeProvider scope="merchant"><ImFriendRequestsPage /></ImScopeProvider>)} />
              <Route path="/merchant/contacts/organization" element={protect("merchant", <ImScopeProvider scope="merchant"><ImOrganizationContactsPage /></ImScopeProvider>)} />
              <Route path="/merchant/contacts/blacklist" element={protect("merchant", <ImScopeProvider scope="merchant"><ImBlacklistPage /></ImScopeProvider>)} />
              <Route path="/merchant/contacts/tags" element={protect("merchant", <ImScopeProvider scope="merchant"><ImContactTagsPage /></ImScopeProvider>)} />
              <Route path="/merchant/contacts/service-accounts" element={protect("merchant", <ImScopeProvider scope="merchant"><ImServiceAccountsPage /></ImScopeProvider>)} />
              <Route path="/merchant/contacts/:contactId" element={protect("merchant", <ImScopeProvider scope="merchant"><ImContactDetailPage /></ImScopeProvider>)} />
              <Route path="/merchant/im/search" element={protect("merchant", <ImScopeProvider scope="merchant"><ImSearchPage /></ImScopeProvider>)} />
              <Route path="/merchant/needo/posts/:postId/customer" element={protect("merchant", <NeedoPostCustomerRoutePage context="merchant" />)} />
              <Route path="/merchant/needo/posts/:postId" element={protect("merchant", <NeedoPostDetailRoutePage context="merchant" />)} />
              <Route path="/merchant/needo" element={protect("merchant", <NeedoExchangePage context="merchant" />)} />
              <Route path="/merchant/moments/compose" element={protect("merchant", <SocialComposerPage />)} />
              <Route path="/merchant/moments/drafts" element={protect("merchant", <SocialDraftsPage />)} />
              <Route path="/merchant/moments/search" element={protect("merchant", <SocialSearchPage />)} />
              <Route path="/merchant/moments/tags/:tag" element={protect("merchant", <SocialSearchPage />)} />
              <Route path="/merchant/moments/notifications" element={protect("merchant", <SocialNotificationsPage />)} />
              <Route path="/merchant/moments/posts/:postId/replies" element={protect("merchant", <SocialPostDetailPage />)} />
              <Route path="/merchant/moments/posts/:postId/repost" element={protect("merchant", <SocialRepostPage />)} />
              <Route path="/merchant/moments/posts/:postId/media/:mediaId" element={protect("merchant", <SocialMediaViewerPage />)} />
              <Route path="/merchant/moments/posts/:postId" element={protect("merchant", <SocialPostDetailPage />)} />
              <Route path="/merchant/moments" element={protect("merchant", <MomentsPage context="merchant" />)} />
              <Route path="/merchant/schedule/auto-dispatch" element={protect("merchant", <MerchantAutoDispatchRoutePage />)} />
              <Route path="/merchant/schedule/arrangements/:orderId" element={protect("merchant", <MerchantScheduleArrangementRoutePage />)} />
              <Route path="/merchant/schedule/cells/:date/:slot/:technicianId" element={protect("merchant", <MerchantScheduleCellRoutePage />)} />
              <Route path="/merchant/orders" element={protect("merchant", <Navigate replace to="/merchant/schedule?tab=appointments" />)} />
              <Route path="/merchant/orders/:orderId/change" element={protect("merchant", <MerchantOrderChangeRoutePage />)} />
              <Route path="/merchant/orders/:orderId/dispatch" element={protect("merchant", <MerchantOrderDispatchRoutePage />)} />
              <Route path="/merchant/orders/:orderId" element={protect("merchant", <MerchantOrderDetailRoutePage />)} />
              <Route path="/merchant/dine" element={protectFeature("merchant", "store.dine-in.order.view", <Navigate replace to="/merchant/dine/orders" />, "/merchant")} />
              <Route path="/merchant/dine/orders" element={protectFeature("merchant", "store.dine-in.order.view", <MerchantDineOrderRoutePage view="orders" />, "/merchant")} />
              <Route path="/merchant/dine/orders/:orderId" element={protectFeature("merchant", "store.dine-in.order.view", <MerchantDineOrderDetailRoutePage />, "/merchant")} />
              <Route path="/merchant/dine/kds" element={protectFeature("merchant", "store.dine-in.order.manage", <MerchantDineOrderRoutePage view="kds" />, "/merchant")} />
              <Route path="/merchant/dine/serve" element={protectFeature("merchant", "store.dine-in.order.manage", <MerchantDineOrderRoutePage view="serve" />, "/merchant")} />
              <Route path="/merchant/dine/cashier" element={protectFeature("merchant", "store.dine-in.order.manage", <MerchantDineOrderRoutePage view="cashier" />, "/merchant")} />
              <Route path="/merchant/menu" element={protectFeature("merchant", "store.dine-in.menu.view", <MerchantDineMenuRoutePage />, "/merchant")} />
              <Route path="/merchant/menu/items" element={protectFeature("merchant", "store.dine-in.menu.view", <MerchantDineMenuRoutePage />, "/merchant")} />
              <Route path="/merchant/menu/availability" element={protectFeature("merchant", "store.dine-in.menu.view", <MerchantDineMenuRoutePage />, "/merchant")} />
              <Route path="/merchant/floor" element={protectFeature("merchant", "store.dine-in.floor.view", <MerchantDineFloorRoutePage />, "/merchant")} />
              <Route path="/merchant/floor/facilities" element={protectFeature("merchant", "store.dine-in.floor.view", <MerchantDineFloorRoutePage />, "/merchant")} />
              <Route path="/merchant/floor/assignments" element={protectFeature("merchant", "store.dine-in.floor.view", <MerchantDineFloorRoutePage />, "/merchant")} />
              <Route path="/merchant/floor/qr" element={protectFeature("merchant", "store.dine-in.qr.manage", <MerchantDineFloorRoutePage />, "/merchant")} />
              <Route path="/merchant/floor/service-calls" element={protectFeature("merchant", "store.dine-in.floor.view", <MerchantDineFloorRoutePage />, "/merchant")} />
              <Route path="/merchant/staff/:staffId" element={protect("merchant", <MerchantStaffDetailRoutePage />)} />
              <Route path="/merchant/member" element={protectFeature("merchant", "shop.member.view", <ShopMemberCenterPage />, "/merchant")} />
              <Route path="/merchant/member/:section" element={protectFeature("merchant", "shop.member.view", <ShopMemberCenterPage />, "/merchant")} />
              <Route path="/shop/member" element={protectFeature("merchant", "shop.member.view", <ShopMemberCenterPage />, "/merchant")} />
              <Route path="/shop/member/:section" element={protectFeature("merchant", "shop.member.view", <ShopMemberCenterPage />, "/merchant")} />
              <Route path="/merchant/profiles/:entityType/:id/followers" element={protect("merchant", <SocialRelationshipsPage />)} />
              <Route path="/merchant/profiles/:entityType/:id/following" element={protect("merchant", <SocialRelationshipsPage />)} />
              <Route path="/merchant/profiles/:entityType/:id" element={protect("merchant", <ProfileDetailPage />)} />
              <Route path="/merchant/stores/:id" element={protect("merchant", <StoreDetailPage scope="merchant" />)} />
              <Route path="/merchant/settings" element={protect("merchant", <UnifiedSettingsPage portal="merchant" />)} />
              <Route path="/merchant/settings/theme" element={protect("merchant", <UnifiedSettingsThemePage portal="merchant" />)} />
              <Route path="/merchant/settings/language" element={protect("merchant", <UnifiedSettingsLanguagePage portal="merchant" />)} />
              <Route path="/merchant/settings/portal" element={protect("merchant", <UnifiedSettingsPortalPage portal="merchant" />)} />
              <Route path="/merchant/settings/profile" element={protect("merchant", <UnifiedSettingsProfilePage portal="merchant" />)} />
              <Route path="/merchant/settings/profile-card-background" element={protect("merchant", <UnifiedSettingsProfileCardBackgroundPage portal="merchant" />)} />
              <Route path="/merchant/settings/verification" element={protect("merchant", <UnifiedSettingsVerificationPage portal="merchant" />)} />
              <Route path="/merchant/settings/service-range" element={protect("merchant", <UnifiedSettingsServiceRangePage portal="merchant" />)} />
              <Route path="/merchant/settings/account" element={protect("merchant", <UnifiedSettingsAccountPage portal="merchant" />)} />
              <Route path="/merchant/settings/notifications" element={protect("merchant", <UnifiedSettingsNotificationsPage portal="merchant" />)} />
              <Route path="/merchant/settings/help" element={protect("merchant", <UnifiedSettingsHelpPage portal="merchant" />)} />
              <Route path="/merchant/settings/about" element={protect("merchant", <UnifiedSettingsAboutPage portal="merchant" />)} />
              <Route path="/merchant/settings/terms" element={protect("merchant", <UnifiedSettingsTermsPage portal="merchant" />)} />
              <Route path="/merchant/settings/privacy" element={protect("merchant", <UnifiedSettingsPrivacyPage portal="merchant" />)} />
              <Route path="/merchant/settings/delete-account" element={protect("merchant", <UnifiedSettingsDeleteAccountPage portal="merchant" />)} />
              <Route path="/merchant/:view" element={protect("merchant", <MerchantPortalPage />)} />
              <Route path="/merchant-admin" element={protect("merchant", <MerchantAdminDashboardPage />)} />
              <Route path="/merchant-admin/analytics" element={protect("merchant", <MerchantAdminAnalyticsPage />)} />
              <Route path="/merchant-admin/orders" element={protect("merchant", <MerchantAdminOrdersPage />)} />
              <Route path="/merchant-admin/orders/:orderId" element={protect("merchant", <MerchantOrderDetailRoutePage />)} />
              <Route path="/merchant-admin/dine" element={protectFeature("merchant", "store.dine-in.order.view", <Navigate replace to="/merchant-admin/dine/orders" />, "/merchant-admin")} />
              <Route path="/merchant-admin/dine/orders" element={protectFeature("merchant", "store.dine-in.order.view", <MerchantAdminDineOrderRoutePage view="orders" />, "/merchant-admin")} />
              <Route path="/merchant-admin/dine/kds" element={protectFeature("merchant", "store.dine-in.order.manage", <MerchantAdminDineOrderRoutePage view="kds" />, "/merchant-admin")} />
              <Route path="/merchant-admin/dine/serve" element={protectFeature("merchant", "store.dine-in.order.manage", <MerchantAdminDineOrderRoutePage view="serve" />, "/merchant-admin")} />
              <Route path="/merchant-admin/dine/cashier" element={protectFeature("merchant", "store.dine-in.order.manage", <MerchantAdminDineOrderRoutePage view="cashier" />, "/merchant-admin")} />
              <Route path="/merchant-admin/menu" element={protectFeature("merchant", "store.dine-in.menu.view", <MerchantAdminDineMenuRoutePage />, "/merchant-admin")} />
              <Route path="/merchant-admin/menu/items" element={protectFeature("merchant", "store.dine-in.menu.view", <MerchantAdminDineMenuRoutePage />, "/merchant-admin")} />
              <Route path="/merchant-admin/menu/availability" element={protectFeature("merchant", "store.dine-in.menu.view", <MerchantAdminDineMenuRoutePage />, "/merchant-admin")} />
              <Route path="/merchant-admin/floor" element={protectFeature("merchant", "store.dine-in.floor.view", <MerchantAdminDineFloorRoutePage />, "/merchant-admin")} />
              <Route path="/merchant-admin/floor/facilities" element={protectFeature("merchant", "store.dine-in.floor.view", <MerchantAdminDineFloorRoutePage />, "/merchant-admin")} />
              <Route path="/merchant-admin/floor/assignments" element={protectFeature("merchant", "store.dine-in.floor.view", <MerchantAdminDineFloorRoutePage />, "/merchant-admin")} />
              <Route path="/merchant-admin/floor/qr" element={protectFeature("merchant", "store.dine-in.qr.manage", <MerchantAdminDineFloorRoutePage />, "/merchant-admin")} />
              <Route path="/merchant-admin/floor/service-calls" element={protectFeature("merchant", "store.dine-in.floor.view", <MerchantAdminDineFloorRoutePage />, "/merchant-admin")} />
              <Route path="/merchant-admin/schedule" element={protect("merchant", <Navigate replace to="/merchant-admin/dispatch-center/current" />)} />
              <Route path="/merchant-admin/store" element={protect("merchant", <MerchantAdminStoreOpsLegacyRedirectPage />)} />
              <Route path="/merchant-admin/scheduling" element={protect("merchant", <Navigate replace to="/merchant-admin/dispatch-center/current" />)} />
              <Route path="/merchant-admin/scheduling/overview" element={protect("merchant", <Navigate replace to="/merchant-admin/dispatch-center/current" />)} />
              <Route path="/merchant-admin/scheduling/overview/current-schedule" element={protect("merchant", <Navigate replace to="/merchant-admin/dispatch-center/current" />)} />
              <Route path="/merchant-admin/scheduling/overview/today-shifts" element={protect("merchant", <Navigate replace to="/merchant-admin/dispatch-center/appointments" />)} />
              <Route path="/merchant-admin/scheduling/overview/technician-status" element={protect("merchant", <Navigate replace to="/merchant-admin/dispatch-center/current" />)} />
              <Route path="/merchant-admin/scheduling/automation" element={protect("merchant", <Navigate replace to="/merchant-admin/dispatch-center/schedule?mode=auto" />)} />
              <Route path="/merchant-admin/scheduling/automation/template-settings" element={protect("merchant", <Navigate replace to="/merchant-admin/dispatch-center/schedule?mode=auto" />)} />
              <Route path="/merchant-admin/scheduling/automation/rule-settings" element={protect("merchant", <Navigate replace to="/merchant-admin/dispatch-center/schedule?mode=auto" />)} />
              <Route path="/merchant-admin/scheduling/automation/special-rules" element={protect("merchant", <Navigate replace to="/merchant-admin/dispatch-center/schedule?mode=auto" />)} />
              <Route path="/merchant-admin/scheduling/automation/priority-rules" element={protect("merchant", <Navigate replace to="/merchant-admin/dispatch-center/schedule?mode=auto" />)} />
              <Route path="/merchant-admin/scheduling/automation/notification-rules" element={protect("merchant", <Navigate replace to="/merchant-admin/dispatch-center/schedule?mode=auto" />)} />
              <Route path="/merchant-admin/scheduling/automation/auto-confirm" element={protect("merchant", <Navigate replace to="/merchant-admin/dispatch-center/schedule?mode=auto" />)} />
              <Route path="/merchant-admin/scheduling/manual" element={protect("merchant", <Navigate replace to="/merchant-admin/dispatch-center/schedule?mode=manual" />)} />
              <Route path="/merchant-admin/dispatch-center" element={protect("merchant", <MerchantAdminDispatchCenterIndexRedirectPage />)} />
              <Route path="/merchant-admin/dispatch-center/current" element={protectFeature("merchant", "store.scheduling.overview.view", <MerchantAdminDispatchCenterCurrentPage />, "/merchant-admin")} />
              <Route path="/merchant-admin/dispatch-center/appointments" element={protectFeature("merchant", "store.scheduling.today.view", <MerchantAdminDispatchCenterAppointmentsPage />, "/merchant-admin/dispatch-center/current")} />
              <Route path="/merchant-admin/dispatch-center/schedule" element={protectFeature("merchant", "store.scheduling.automation.edit", <MerchantAdminDispatchCenterSchedulePage />, "/merchant-admin/dispatch-center/current")} />
              <Route path="/merchant-admin/dispatch-center/overview" element={protectFeature("merchant", "store.scheduling.overview.view", <MerchantAdminDispatchCenterOverviewPage />, "/merchant-admin")} />
              <Route path="/merchant-admin/dispatch-center/automation" element={protectFeature("merchant", "store.scheduling.automation.edit", <MerchantAdminDispatchCenterAutomationPage />, "/merchant-admin/dispatch-center/current")} />
              <Route path="/merchant-admin/dispatch-center/manual" element={protectFeature("merchant", "store.scheduling.batch-confirm.run", <MerchantAdminDispatchCenterManualPage />, "/merchant-admin/dispatch-center/current")} />
              <Route path="/merchant-admin/stage-layout" element={protectFeature("merchant", "store.stage-layout.view", <MerchantAdminStageLayoutPage />, "/merchant-admin")} />
              <Route path="/merchant-admin/inventory" element={protectFeature("merchant", "store.inventory.view", <MerchantAdminInventoryPage />, "/merchant-admin")} />
              <Route path="/merchant-admin/finance" element={protect("merchant", <MerchantAdminFinancePage />)} />
              <Route path="/merchant-admin/people" element={protect("merchant", <MerchantAdminPeoplePage />)} />
              <Route path="/merchant-admin/design" element={protect("merchant", <MerchantAdminDesignPage />)} />
              <Route path="/merchant-admin/docs" element={protect("merchant", <MerchantAdminDocsPage />)} />
              <Route path="/merchant-admin/docs/api" element={protect("merchant", <MerchantAdminDocsPage />)} />
              <Route path="/merchant-admin/settings" element={protect("merchant", <MerchantAdminSettingsPage />)} />

              <Route path="/technician" element={protect("technician", <TechnicianPortalPage />)} />
              <Route path="/technician/schedule/new" element={protect("technician", <TechnicianScheduleEditorRoutePage />)} />
              <Route path="/technician/schedule/events/:eventId/edit" element={protect("technician", <TechnicianScheduleEditorRoutePage />)} />
              <Route path="/technician/schedule/events/:eventId" element={protect("technician", <TechnicianScheduleDetailRoutePage />)} />
              <Route path="/technician/schedule/shifts/:shiftId/transfer" element={protect("technician", <TechnicianScheduleTransferRoutePage />)} />
              <Route path="/technician/orders/:orderId" element={protect("technician", <TechnicianOrderDetailRoutePage />)} />
              <Route path="/technician/messages" element={protect("technician", <ImScopeProvider scope="technician"><ImMessagesEntryPage /></ImScopeProvider>)} />
              <Route path="/technician/messages/new" element={protect("technician", <ImScopeProvider scope="technician"><ImNewConversationPage /></ImScopeProvider>)} />
              <Route path="/technician/messages/:conversationId/info" element={protect("technician", <ImScopeProvider scope="technician"><ImConversationInfoPage /></ImScopeProvider>)} />
              <Route path="/technician/messages/:conversationId/media" element={protect("technician", <ImScopeProvider scope="technician"><ImMediaRecordsPage /></ImScopeProvider>)} />
              <Route path="/technician/messages/:conversationId" element={protect("technician", <ImScopeProvider scope="technician"><ImConversationRoomRoutePage /></ImScopeProvider>)} />
              <Route path="/technician/contacts" element={protect("technician", <ImScopeProvider scope="technician"><ImContactsListPage /></ImScopeProvider>)} />
              <Route path="/technician/contacts/requests" element={protect("technician", <ImScopeProvider scope="technician"><ImFriendRequestsPage /></ImScopeProvider>)} />
              <Route path="/technician/contacts/organization" element={protect("technician", <ImScopeProvider scope="technician"><ImOrganizationContactsPage /></ImScopeProvider>)} />
              <Route path="/technician/contacts/blacklist" element={protect("technician", <ImScopeProvider scope="technician"><ImBlacklistPage /></ImScopeProvider>)} />
              <Route path="/technician/contacts/tags" element={protect("technician", <ImScopeProvider scope="technician"><ImContactTagsPage /></ImScopeProvider>)} />
              <Route path="/technician/contacts/service-accounts" element={protect("technician", <ImScopeProvider scope="technician"><ImServiceAccountsPage /></ImScopeProvider>)} />
              <Route path="/technician/contacts/:contactId" element={protect("technician", <ImScopeProvider scope="technician"><ImContactDetailPage /></ImScopeProvider>)} />
              <Route path="/technician/im/search" element={protect("technician", <ImScopeProvider scope="technician"><ImSearchPage /></ImScopeProvider>)} />
              <Route path="/technician/needo/posts/:postId/customer" element={protect("technician", <NeedoPostCustomerRoutePage context="technician" />)} />
              <Route path="/technician/needo/posts/:postId" element={protect("technician", <NeedoPostDetailRoutePage context="technician" />)} />
              <Route path="/technician/needo" element={protect("technician", <NeedoExchangePage context="technician" />)} />
              <Route path="/technician/moments/compose" element={protect("technician", <SocialComposerPage />)} />
              <Route path="/technician/moments/drafts" element={protect("technician", <SocialDraftsPage />)} />
              <Route path="/technician/moments/search" element={protect("technician", <SocialSearchPage />)} />
              <Route path="/technician/moments/tags/:tag" element={protect("technician", <SocialSearchPage />)} />
              <Route path="/technician/moments/notifications" element={protect("technician", <SocialNotificationsPage />)} />
              <Route path="/technician/moments/posts/:postId/replies" element={protect("technician", <SocialPostDetailPage />)} />
              <Route path="/technician/moments/posts/:postId/repost" element={protect("technician", <SocialRepostPage />)} />
              <Route path="/technician/moments/posts/:postId/media/:mediaId" element={protect("technician", <SocialMediaViewerPage />)} />
              <Route path="/technician/moments/posts/:postId" element={protect("technician", <SocialPostDetailPage />)} />
              <Route path="/technician/moments" element={protect("technician", <MomentsPage context="technician" />)} />
              <Route path="/technician/profiles/:entityType/:id/followers" element={protect("technician", <SocialRelationshipsPage />)} />
              <Route path="/technician/profiles/:entityType/:id/following" element={protect("technician", <SocialRelationshipsPage />)} />
              <Route path="/technician/profiles/:entityType/:id" element={protect("technician", <ProfileDetailPage />)} />
              <Route path="/technician/settings" element={protect("technician", <UnifiedSettingsPage portal="technician" />)} />
              <Route path="/technician/settings/theme" element={protect("technician", <UnifiedSettingsThemePage portal="technician" />)} />
              <Route path="/technician/settings/language" element={protect("technician", <UnifiedSettingsLanguagePage portal="technician" />)} />
              <Route path="/technician/settings/portal" element={protect("technician", <UnifiedSettingsPortalPage portal="technician" />)} />
              <Route path="/technician/settings/profile" element={protect("technician", <UnifiedSettingsProfilePage portal="technician" />)} />
              <Route path="/technician/settings/profile-card-background" element={protect("technician", <UnifiedSettingsProfileCardBackgroundPage portal="technician" />)} />
              <Route path="/technician/settings/verification" element={protect("technician", <UnifiedSettingsVerificationPage portal="technician" />)} />
              <Route path="/technician/settings/service-range" element={protect("technician", <UnifiedSettingsServiceRangePage portal="technician" />)} />
              <Route path="/technician/settings/account" element={protect("technician", <UnifiedSettingsAccountPage portal="technician" />)} />
              <Route path="/technician/settings/notifications" element={protect("technician", <UnifiedSettingsNotificationsPage portal="technician" />)} />
              <Route path="/technician/settings/help" element={protect("technician", <UnifiedSettingsHelpPage portal="technician" />)} />
              <Route path="/technician/settings/about" element={protect("technician", <UnifiedSettingsAboutPage portal="technician" />)} />
              <Route path="/technician/settings/terms" element={protect("technician", <UnifiedSettingsTermsPage portal="technician" />)} />
              <Route path="/technician/settings/privacy" element={protect("technician", <UnifiedSettingsPrivacyPage portal="technician" />)} />
              <Route path="/technician/settings/delete-account" element={protect("technician", <UnifiedSettingsDeleteAccountPage portal="technician" />)} />
              <Route path="/technician/:view" element={protect("technician", <TechnicianPortalPage />)} />

              <Route path="/admin" element={protectPermission("admin", "page:dashboard", <DashboardPage />)} />
              <Route path="/admin/operation-timeline" element={protect("admin", <OperationTimelinePage />)} />
              <Route path="/admin/analytics" element={protect("admin", <AnalyticsPage />)} />
              <Route path="/admin/carousel" element={protect("admin", <CarouselPage />)} />
              <Route path="/admin/notifications/compose" element={protect("admin", <AdminNotificationComposePage />)} />
              <Route path="/admin/notifications" element={protect("admin", <AdminNotificationsPage />)} />
              <Route path="/admin/support" element={protect("admin", <AdminSupportPage />)} />
              <Route path="/admin/docs" element={protect("admin", <AdminDocsPage />)} />
              <Route path="/admin/docs/api" element={protect("admin", <AdminDocsPage />)} />
              <Route path="/admin/data" element={protect("admin", <DataCenterPage />)} />
              <Route path="/admin/cities" element={protect("admin", <CitySettingsPage />)} />
              <Route path="/admin/badges" element={protect("admin", <AvatarBadgesPage />)} />
              <Route path="/admin/decoration" element={protect("admin", <DecorationPage />)} />
              <Route path="/admin/technicians" element={protect("admin", <TechniciansPage />)} />
              <Route path="/admin/orders" element={protect("admin", <OrdersAdminPage />)} />
              <Route path="/admin/orders/demands" element={protect("admin", <NeedoDemandAdminPage />)} />
              <Route path="/admin/orders/info" element={protect("admin", <NeedoInfoAdminPage />)} />
              <Route path="/admin/dispatch" element={protect("admin", <Navigate replace to="/merchant-admin/dispatch-center/current" />)} />
              <Route path="/admin/field-jobs" element={protect("admin", <FieldJobsPage />)} />
              <Route path="/admin/crm" element={protect("admin", <CRMPage />)} />
              <Route path="/admin/users" element={protectPermission("admin", "page:user-management", <UsersPage />)} />
              <Route path="/admin/afirieito" element={protect("admin", <CpsPage />)} />
              <Route path="/admin/cps" element={protect("admin", <LegacyAdminAfirieitoRedirect />)} />
              <Route path="/admin/marketing" element={protect("admin", <MarketingPage />)} />
              <Route path="/admin/finance" element={protect("admin", <FinancePage />)} />
              <Route path="/admin/reviews" element={protect("admin", <ReviewsPage />)} />
              <Route path="/admin/merchants" element={protect("admin", <MerchantsPage />)} />
              <Route path="/admin/inventory" element={protect("admin", <Navigate replace to="/merchant-admin/inventory" />)} />
              <Route path="/admin/floorplan" element={protect("admin", <Navigate replace to="/merchant-admin/stage-layout" />)} />
              <Route path="/admin/roles" element={protectPermission("admin", "page:role-management", <RolesPage />)} />
              <Route path="/admin/permissions" element={protectPermission("admin", "page:permission-management", <PermissionsPage />)} />
              <Route path="/admin/travel-settings" element={protect("admin", <TravelSettingsPage />)} />

                  <Route path="*" element={<Navigate replace to="/" />} />
                </Routes>
              </SocialProvider>
            </I18nRuntime>
          </ClientThemeProvider>
        </I18nProvider>
      </AuthProvider>
    </RootErrorBoundary>
  );
}
