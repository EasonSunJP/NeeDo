import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode
} from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import type { BackofficeDashboardPayload, DashboardQuery } from "../../api/backofficeRealData";
import { backofficeRealDataApi } from "../../api/backofficeRealData";
import {
  getAuthCredentialSnapshot,
  subscribeAuthCredentialSnapshot
} from "../../auth/authCredentialCoordinator";
import { useAuth } from "../../auth/AuthProvider";
import type { FeaturePermission } from "../../auth/featurePermissions";
import {
  clearMerchantAdminPreview,
  getMerchantAdminPreview,
  setMerchantAdminPreviewShop
} from "../../auth/merchantAdminPreview";
import { translateMerchantBillingText } from "../../features/merchant-saas-billing/i18n";
import {
  invalidateMerchantAdminDashboard,
  invalidateMerchantAdminDashboardOwner,
  loadMerchantAdminDashboard
} from "../../features/merchant-admin/dashboardResource";
import { useI18n } from "../../i18n/I18nProvider";
import { cn, yen } from "../../lib/utils";
import {
  defaultDayAdminTheme,
  defaultNightAdminTheme,
  detectSystemAdminTheme,
  normalizeAdminTheme,
  sharedAdminThemeOptions,
  type AdminTheme
} from "../../theme/AdminTheme";
import { AdminAccountMenu } from "../admin/AdminAccountMenu";
import { AdminThemeMenu } from "../admin/AdminThemeMenu";
import { CloseIconButton } from "../ui/CloseIconButton";
import { LanguageSwitcher } from "../ui/LanguageSwitcher";

type MerchantAdminNavItem = {
  label: string;
  to: string;
  icon: string;
  children?: string[];
  badge?: string;
  permission?: FeaturePermission;
};

type MerchantAdminNavSection = {
  key: string;
  title: string;
  items: MerchantAdminNavItem[];
};

const themeStorageKey = "needo.merchant-admin.theme";
const themePreferenceModeStorageKey = "needo.merchant-admin.theme.mode";
const defaultDashboardQuery: DashboardQuery = { period: "last7days" };
const maximumManageableShopPages = 100;

type AdminThemePreferenceMode = "auto" | "manual";

type AdminThemeState = {
  theme: AdminTheme;
  preferenceMode: AdminThemePreferenceMode;
};

export type MerchantAdminDashboardResource = {
  dashboard: BackofficeDashboardPayload | null;
  error: unknown;
  query: DashboardQuery;
  reload: () => void;
  setQuery: (query: DashboardQuery) => void;
  status: "loading" | "success" | "error";
};

type MerchantAdminLayoutProps = {
  children: ReactNode | ((resource: MerchantAdminDashboardResource) => ReactNode);
};

type OwnedDashboardPayload = {
  ownerKey: string;
  payload: BackofficeDashboardPayload;
};

type ManageableShopsLoader = typeof backofficeRealDataApi.manageableMerchantShops;

export function readOwnedDashboardPayload(
  owned: OwnedDashboardPayload | null,
  currentOwnerKey: string | null
) {
  return owned?.ownerKey === currentOwnerKey ? owned.payload : null;
}

export async function resolveSelectedManageableShop(
  signal: AbortSignal,
  loadPage: ManageableShopsLoader = backofficeRealDataApi.manageableMerchantShops
) {
  const pageSize = 100;
  let page = 1;

  while (!signal.aborted && page <= maximumManageableShopPages) {
    const manageable = await loadPage(page, pageSize, { signal });
    if (signal.aborted) throw new DOMException("Shop owner was superseded", "AbortError");
    const selectedShop = manageable.list.find((shop) => shop.selected);
    if (selectedShop) return selectedShop;
    const totalPages = Math.ceil(manageable.total / manageable.page_size);
    if (page >= totalPages) break;
    page += 1;
  }

  if (signal.aborted) throw new DOMException("Shop owner was superseded", "AbortError");
  throw new Error("error.auth.merchant_shop_required");
}

const merchantAdminSections: MerchantAdminNavSection[] = [
  {
    key: "operations",
    title: "门店经营",
    items: [
      {
        label: "数据大盘",
        to: "/merchant-admin",
        icon: "总",
        children: ["经营指标", "趋势", "NDP"]
      },
      {
        label: "订单中心",
        to: "/merchant-admin/orders",
        icon: "单",
        children: ["预约处理", "改期", "联系用户"]
      },
      {
        label: "点单 / オーダー",
        to: "/merchant-admin/dine/orders",
        icon: "点",
        children: ["新单", "KDS", "上菜", "收银"],
        permission: "store.dine-in.order.view"
      },
      {
        label: "菜单 / メニュー",
        to: "/merchant-admin/menu",
        icon: "菜",
        children: ["商品", "售罄", "制作区", "设施限定"],
        permission: "store.dine-in.menu.view"
      },
      {
        label: "场控 / 店内",
        to: "/merchant-admin/floor",
        icon: "店",
        children: ["桌台", "包厢", "床位", "QR"],
        permission: "store.dine-in.floor.view"
      },
      {
        label: "场控布局",
        to: "/merchant-admin/stage-layout",
        icon: "场",
        children: ["能力门禁", "版本 API", "占用合同"],
        permission: "store.stage-layout.view"
      },
      {
        label: "库存管理",
        to: "/merchant-admin/inventory",
        icon: "库",
        children: ["能力门禁", "库存锁", "移动审计"],
        permission: "store.inventory.view"
      },
      {
        label: "财务结算",
        to: "/merchant-admin/finance",
        icon: "¥",
        children: ["店铺流水", "结算单", "分账"]
      }
    ]
  },
  {
    key: "dispatch",
    title: "调度中心",
    items: [
      {
        label: "现状确认",
        to: "/merchant-admin/dispatch-center/current",
        icon: "确",
        children: ["周期状态", "异常处理", "confirmed slots"],
        permission: "store.scheduling.overview.view"
      },
      {
        label: "预约一览",
        to: "/merchant-admin/dispatch-center/appointments",
        icon: "予",
        children: ["日程视图", "预约详情", "联系处理"],
        permission: "store.scheduling.today.view"
      },
      {
        label: "排班",
        to: "/merchant-admin/dispatch-center/schedule",
        icon: "排",
        badge: "限定免费",
        children: ["手动", "自动", "智能排班"],
        permission: "store.scheduling.automation.edit"
      }
    ]
  },
  {
    key: "staff",
    title: "员工管理",
    items: [
      {
        label: "员工列表",
        to: "/merchant-admin/people?module=staff",
        icon: "员",
        children: ["正式员工", "状态", "店铺范围"]
      }
    ]
  },
  {
    key: "users",
    title: "用户管理",
    items: [
      {
        label: "用户列表",
        to: "/merchant-admin/people?module=users",
        icon: "用",
        children: ["正式用户", "预约次数", "公开状态"]
      },
      {
        label: "评价中心",
        to: "/merchant-admin/people?module=reviews",
        icon: "评",
        children: ["能力门禁", "Review 表", "回复审计"]
      }
    ]
  },
  {
    key: "settings",
    title: "门店设置",
    items: [
      {
        label: "门店设置",
        to: "/merchant-admin/settings",
        icon: "设",
        children: ["基础资料", "数据库状态", "待接入能力"]
      }
    ]
  },
  {
    key: "docs",
    title: "文档",
    items: [
      {
        label: "操作文档",
        to: "/merchant-admin/docs",
        icon: "文",
        children: ["后台流程", "权限口径", "结算复核"]
      },
      {
        label: "API 文档",
        to: "/merchant-admin/docs/api",
        icon: "A",
        children: ["产运开启", "店铺接口", "关键字段"]
      }
    ]
  }
];

function splitTo(to: string) {
  const [path, query = ""] = to.split("?");

  return { path, search: query ? `?${query}` : "" };
}

function routeMatches(
  item: MerchantAdminNavItem,
  pathname: string,
  search: string,
  sections: MerchantAdminNavSection[] = merchantAdminSections
) {
  const { path, search: itemSearch } = splitTo(item.to);
  const hasExactQueryRoute = Boolean(
    search &&
    sections.some((section) =>
      section.items.some((candidate) => {
        const candidateRoute = splitTo(candidate.to);

        return candidateRoute.path === pathname && candidateRoute.search === search;
      })
    )
  );
  const hasMoreSpecificPathRoute = sections.some((section) =>
    section.items.some((candidate) => {
      const candidateRoute = splitTo(candidate.to);

      return (
        candidateRoute.path !== path &&
        candidateRoute.path.startsWith(`${path}/`) &&
        (pathname === candidateRoute.path || pathname.startsWith(`${candidateRoute.path}/`))
      );
    })
  );

  if (itemSearch) {
    return pathname === path && search === itemSearch;
  }

  if (hasMoreSpecificPathRoute) {
    return false;
  }

  if (hasExactQueryRoute) {
    return false;
  }

  return pathname === path || (path !== "/merchant-admin" && pathname.startsWith(`${path}/`));
}

function getSectionForRoute(
  pathname: string,
  search: string,
  sections: MerchantAdminNavSection[] = merchantAdminSections
) {
  return (
    sections.find((section) =>
      section.items.some((item) => routeMatches(item, pathname, search, sections))
    )?.key ?? "operations"
  );
}

function normalizeThemePreferenceMode(mode: string | null | undefined): AdminThemePreferenceMode {
  return mode === "manual" ? "manual" : "auto";
}

function getInitialThemeState(): AdminThemeState {
  if (typeof window === "undefined") {
    return {
      theme: "pink-purple-black",
      preferenceMode: "auto"
    };
  }

  const preferenceMode = normalizeThemePreferenceMode(
    window.localStorage.getItem(themePreferenceModeStorageKey)
  );
  const stored = window.localStorage.getItem(themeStorageKey);
  if (preferenceMode === "manual") {
    return {
      theme: normalizeAdminTheme(
        stored,
        defaultDayAdminTheme,
        sharedAdminThemeOptions,
        defaultNightAdminTheme
      ),
      preferenceMode
    };
  }

  return {
    theme: detectSystemAdminTheme(
      defaultDayAdminTheme,
      defaultNightAdminTheme,
      sharedAdminThemeOptions
    ),
    preferenceMode
  };
}

export function MerchantAdminLayout({ children }: MerchantAdminLayoutProps) {
  const { canAccessFeature, session } = useAuth();
  const { language } = useI18n();
  const t = (source: string) => translateMerchantBillingText(source, language);
  const [{ theme, preferenceMode }, setThemeState] =
    useState<AdminThemeState>(getInitialThemeState);
  const [preview, setPreview] = useState(getMerchantAdminPreview);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [ownedDashboard, setOwnedDashboard] = useState<OwnedDashboardPayload | null>(null);
  const [summaryStatus, setSummaryStatus] = useState<"loading" | "success" | "error">("loading");
  const [summaryError, setSummaryError] = useState<unknown>(null);
  const [summaryRevision, setSummaryRevision] = useState(0);
  const [dashboardQuery, setDashboardQuery] = useState<DashboardQuery>(defaultDashboardQuery);
  const [resolvedShop, setResolvedShop] = useState<{
    ownerKey: string;
    shopPublicId: string;
  } | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const readOnlyPreview = preview && session?.allowedPortals.includes("admin") ? preview : null;
  const credentialEpoch = useSyncExternalStore(
    subscribeAuthCredentialSnapshot,
    () => getAuthCredentialSnapshot().credentialVersion,
    () => getAuthCredentialSnapshot().credentialVersion
  );
  const shopResolutionOwnerKey = session
    ? JSON.stringify([session.id, session.currentIdentity.id, credentialEpoch])
    : null;
  const confirmedSessionShopPublicId = session?.merchantShopPublicId;
  const resolvedShopPublicId =
    confirmedSessionShopPublicId && /^shop\d{10}$/.test(confirmedSessionShopPublicId)
      ? confirmedSessionShopPublicId
      : resolvedShop?.ownerKey === shopResolutionOwnerKey
        ? resolvedShop.shopPublicId
        : null;
  const dashboardOwner = useMemo(
    () =>
      session && resolvedShopPublicId
        ? {
            credentialEpoch,
            identityId: session.currentIdentity.id,
            shopPublicId: resolvedShopPublicId,
            userId: session.id
          }
        : null,
    [credentialEpoch, resolvedShopPublicId, session]
  );
  const dashboardOwnerKey = dashboardOwner
    ? JSON.stringify([
        dashboardOwner.userId,
        dashboardOwner.identityId,
        dashboardOwner.shopPublicId,
        dashboardOwner.credentialEpoch
      ])
    : null;
  const dashboard = readOwnedDashboardPayload(ownedDashboard, dashboardOwnerKey);
  const visibleSections = useMemo(
    () =>
      merchantAdminSections
        .map((section) => ({
          ...section,
          items: section.items.filter(
            (item) =>
              !item.permission || readOnlyPreview || canAccessFeature("merchant", item.permission)
          )
        }))
        .filter((section) => section.items.length > 0),
    [canAccessFeature, readOnlyPreview]
  );
  const routeSectionKey = getSectionForRoute(location.pathname, location.search, visibleSections);
  const [activeSectionKey, setActiveSectionKey] = useState(routeSectionKey);
  const activeSection =
    visibleSections.find((section) => section.key === activeSectionKey) ??
    visibleSections[0] ??
    merchantAdminSections[0];
  const currentShop = dashboard?.shop ?? null;
  const accountName = currentShop?.name ?? session?.username ?? "当前店铺";
  const pendingOrders = dashboard ? dashboard.summary.pendingOrders : null;
  const shopStatus = currentShop
    ? `${currentShop.city} · ${currentShop.status}`
    : summaryStatus === "loading"
      ? "正在加载正式店铺资料"
      : "店铺摘要加载失败";

  const setTheme = (nextTheme: AdminTheme) => {
    setThemeState({
      theme: nextTheme,
      preferenceMode: "manual"
    });
  };

  const openSection = (sectionKey: string) => {
    const section =
      visibleSections.find((item) => item.key === sectionKey) ??
      visibleSections[0] ??
      merchantAdminSections[0];
    setActiveSectionKey(section.key);
    navigate(section.items[0]?.to ?? "/merchant-admin");
    setMobileNavOpen(false);
  };

  useEffect(() => {
    window.localStorage.setItem(themeStorageKey, theme);
    window.localStorage.setItem(themePreferenceModeStorageKey, preferenceMode);
  }, [preferenceMode, theme]);

  useEffect(() => {
    setActiveSectionKey(routeSectionKey);
  }, [routeSectionKey]);

  useLayoutEffect(() => {
    let activeRequest = true;
    const controller = new AbortController();
    if (confirmedSessionShopPublicId && /^shop\d{10}$/.test(confirmedSessionShopPublicId)) {
      setResolvedShop(null);
      return () => {
        activeRequest = false;
      };
    }

    setResolvedShop(null);
    if (!session || !shopResolutionOwnerKey) {
      return () => {
        activeRequest = false;
      };
    }

    setSummaryStatus("loading");
    setSummaryError(null);
    void resolveSelectedManageableShop(controller.signal)
      .then((selectedShop) => {
        if (!activeRequest) return;
        setResolvedShop({
          ownerKey: shopResolutionOwnerKey,
          shopPublicId: selectedShop.publicId
        });
      })
      .catch((error: unknown) => {
        if (!activeRequest) return;
        setSummaryError(error);
        setSummaryStatus("error");
      });

    return () => {
      activeRequest = false;
      controller.abort();
    };
  }, [confirmedSessionShopPublicId, session, shopResolutionOwnerKey]);

  useLayoutEffect(() => {
    if (!dashboardOwner || !dashboardOwnerKey) {
      setOwnedDashboard(null);
      return;
    }

    let activeRequest = true;
    setSummaryStatus("loading");
    setSummaryError(null);

    loadMerchantAdminDashboard(dashboardOwner, dashboardQuery)
      .then((payload) => {
        if (!activeRequest) return;
        setOwnedDashboard({ ownerKey: dashboardOwnerKey, payload });
        setSummaryStatus("success");
      })
      .catch((error: unknown) => {
        if (!activeRequest) return;
        setOwnedDashboard(null);
        setSummaryError(error);
        setSummaryStatus("error");
      });

    return () => {
      activeRequest = false;
      invalidateMerchantAdminDashboardOwner(dashboardOwner);
    };
  }, [dashboardOwner, dashboardOwnerKey, dashboardQuery, summaryRevision]);

  const reloadDashboard = () => {
    if (!dashboardOwner) return;
    invalidateMerchantAdminDashboard(dashboardOwner, dashboardQuery);
    setSummaryRevision((current) => current + 1);
  };

  const dashboardResource: MerchantAdminDashboardResource = {
    dashboard,
    error: summaryError,
    query: dashboardQuery,
    reload: reloadDashboard,
    setQuery: setDashboardQuery,
    status: summaryStatus
  };

  const changePreviewShop = (shopId: number) => {
    const next = setMerchantAdminPreviewShop(shopId);
    if (!next) return;
    setPreview(next);
    navigate(0);
  };

  const exitPreview = () => {
    const returnTo = readOnlyPreview?.returnTo ?? "/admin/merchants";
    clearMerchantAdminPreview();
    setPreview(null);
    navigate(returnTo);
  };

  return (
    <div
      className={cn(
        "admin-shell merchant-admin-shell min-h-screen bg-paper text-ink",
        `admin-theme-${theme}`
      )}
    >
      <aside className="admin-sidebar fixed left-0 top-0 hidden h-screen w-64 border-r border-line bg-white p-4 lg:block">
        <div className="flex h-full flex-col">
          <div className="admin-brand rounded-lg p-4 text-white">
            <div className="flex items-center gap-3">
              <AdminAccountMenu
                accountName={accountName}
                fallbackEmail={session?.email}
                loginPath="/login/merchant-admin"
                portal="merchant"
                roleLabel="店铺管理员"
              />
              <NavLink className="min-w-0 flex-1 text-white" to="/merchant-admin">
                <p className="text-xs font-bold text-mint">NeeDo 商户后台</p>
                <h1 className="mt-1 text-lg font-black">商户后台</h1>
              </NavLink>
            </div>
          </div>

          <section className="admin-profile mt-4 rounded-lg border border-line bg-paper p-3">
            <div className="flex items-center gap-3">
              {session?.avatarUrl ? (
                <img
                  alt={accountName}
                  className="avatar-shape h-11 w-11 object-cover"
                  src={session.avatarUrl}
                />
              ) : (
                <span
                  className="avatar-shape grid h-11 w-11 shrink-0 place-items-center bg-moss text-sm font-black text-white"
                  aria-hidden="true"
                >
                  {accountName.trim().slice(0, 1).toUpperCase() || "店"}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-black">{accountName}</p>
                <p className="mt-1 text-xs text-ink/45">{shopStatus}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-md bg-white px-2 py-2">
                <p className="text-[11px] text-ink/45">待处理</p>
                <strong className="text-sm">{pendingOrders ?? "—"}</strong>
              </div>
              <div className="rounded-md bg-white px-2 py-2">
                <p className="text-[11px] text-ink/45">服务 GMV</p>
                <strong className="text-sm">
                  {dashboard ? yen(dashboard.summary.serviceGmvJpy) : "—"}
                </strong>
              </div>
            </div>
            {summaryStatus === "error" ? (
              <button
                className="mt-2 w-full rounded-md border border-coral/30 bg-coral/5 px-2 py-2 text-xs font-black text-coral"
                onClick={reloadDashboard}
                type="button"
              >
                重新加载店铺摘要
              </button>
            ) : null}
          </section>

          <section className="admin-sidebar-search mt-4 rounded-lg border border-line bg-paper p-3">
            <p className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-ink/40">
              店铺搜索
            </p>
            <label className="admin-search flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm">
              <span className="text-ink/45">⌕</span>
              <input
                className="min-w-0 flex-1 bg-transparent outline-none"
                placeholder="搜索订单、用户、员工、套餐"
              />
            </label>
          </section>

          <nav className="admin-nav mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="mb-4 rounded-lg border border-line bg-paper p-3">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-ink/40">
                当前模块
              </p>
              <h2 className="mt-1 text-xl font-black">{activeSection.title}</h2>
            </div>
            <div className="space-y-2">
              {activeSection.items.map((item) => (
                <NavLink
                  className={() =>
                    cn(
                      "focus-ring admin-nav-link flex items-start gap-3 rounded-lg px-3 py-3 text-sm font-bold transition",
                      routeMatches(item, location.pathname, location.search, visibleSections)
                        ? "is-active text-white"
                        : "text-ink/65 hover:bg-paper hover:text-ink"
                    )
                  }
                  end={item.to === "/merchant-admin"}
                  key={item.to}
                  to={item.to}
                >
                  <span className="admin-nav-icon mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md text-[11px]">
                    {item.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="truncate">{item.label}</span>
                      {item.badge ? (
                        <span className="rounded-md bg-lemon/30 px-1.5 py-0.5 text-[10px] font-black text-[#795b00]">
                          {item.badge}
                        </span>
                      ) : null}
                    </span>
                    {item.children ? (
                      <span className="mt-1 block text-[11px] font-semibold leading-4 opacity-70">
                        {item.children.join(" / ")}
                      </span>
                    ) : null}
                  </span>
                </NavLink>
              ))}
            </div>
          </nav>
        </div>
      </aside>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-[70] bg-black/45 lg:hidden">
          <button
            aria-label="关闭商户后台导航"
            className="absolute inset-0"
            onClick={() => setMobileNavOpen(false)}
            type="button"
          />
          <aside className="absolute left-0 top-0 h-full w-[86vw] max-w-[320px] overflow-y-auto border-r border-line bg-white p-4 shadow-soft">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-mint">NeeDo 商户后台</p>
                <h2 className="mt-1 text-lg font-black">商户后台导航</h2>
              </div>
              <CloseIconButton label="关闭商户后台导航" onClick={() => setMobileNavOpen(false)} />
            </div>
            <div className="mt-4 space-y-4">
              {visibleSections.map((section) => (
                <section className="rounded-lg border border-line bg-paper p-3" key={section.key}>
                  <button
                    className={cn(
                      "w-full rounded-lg px-3 py-3 text-left text-sm font-black",
                      activeSectionKey === section.key ? "bg-ink text-white" : "bg-white text-ink"
                    )}
                    onClick={() => openSection(section.key)}
                    type="button"
                  >
                    {section.title}
                  </button>
                  <div className="mt-3 space-y-2">
                    {section.items.map((item) => (
                      <NavLink
                        className={({ isActive }) =>
                          cn(
                            "block rounded-lg px-3 py-2 text-sm font-bold",
                            isActive ? "bg-moss text-white" : "bg-white text-ink/65"
                          )
                        }
                        key={item.to}
                        onClick={() => setMobileNavOpen(false)}
                        to={item.to}
                      >
                        <span className="inline-flex items-center gap-2">
                          {item.label}
                          {item.badge ? (
                            <span className="rounded-md bg-lemon/30 px-1.5 py-0.5 text-[10px] font-black text-[#795b00]">
                              {item.badge}
                            </span>
                          ) : null}
                        </span>
                      </NavLink>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header className="admin-topbar fixed inset-x-0 top-0 z-[60] border-b border-line bg-white/90 backdrop-blur lg:left-64">
          <div className="w-full px-4 py-3 md:px-5 2xl:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 lg:hidden">
                  <button
                    className="focus-ring rounded-lg border border-line bg-paper px-3 py-2 text-sm font-black"
                    onClick={() => setMobileNavOpen(true)}
                    type="button"
                  >
                    菜单
                  </button>
                  <NavLink
                    className="admin-mobile-brand rounded-lg bg-ink px-3 py-2 text-sm font-bold text-white"
                    to="/merchant-admin"
                  >
                    Store
                  </NavLink>
                </div>
                <div className="admin-section-tabs scrollbar-none flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-lg border border-line bg-paper p-1">
                  {visibleSections.map((section) => (
                    <button
                      className={cn(
                        "admin-section-tab focus-ring h-8 shrink-0 rounded-md px-3 text-xs font-black transition",
                        activeSectionKey === section.key
                          ? "is-active"
                          : "text-ink/55 hover:bg-white hover:text-ink"
                      )}
                      key={section.key}
                      onClick={() => openSection(section.key)}
                      type="button"
                    >
                      {section.title}
                    </button>
                  ))}
                </div>
                <label className="admin-search flex h-10 min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm xl:max-w-[320px]">
                  <span className="text-ink/45">⌕</span>
                  <input
                    className="min-w-0 flex-1 bg-transparent outline-none"
                    placeholder="搜索订单、用户、员工、财务"
                  />
                </label>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <button
                  className="focus-ring rounded-lg border border-line bg-paper px-3 py-2 text-xs font-black text-ink/65"
                  type="button"
                >
                  通知
                </button>
                <NavLink
                  className="focus-ring rounded-lg border border-line bg-paper px-3 py-2 text-xs font-black text-ink/65"
                  to="/merchant-admin/settings"
                >
                  设置
                </NavLink>
                <LanguageSwitcher className="shrink-0" iconOnly />
                <AdminThemeMenu
                  onThemeChange={setTheme}
                  options={sharedAdminThemeOptions}
                  theme={theme}
                />
              </div>
            </div>
            <div className="admin-subnav scrollbar-none mt-3 flex items-center gap-2 overflow-x-auto lg:hidden">
              {activeSection.items.map((item) => (
                <NavLink
                  className={({ isActive }) =>
                    cn(
                      "shrink-0 rounded-lg border px-3 py-2 text-xs font-black transition",
                      isActive ? "border-ink bg-ink text-white" : "border-line bg-paper text-ink/60"
                    )
                  }
                  end={item.to === "/merchant-admin"}
                  key={item.to}
                  to={item.to}
                >
                  <span className="inline-flex items-center gap-2">
                    {item.label}
                    {item.badge ? (
                      <span className="rounded-md bg-lemon/30 px-1.5 py-0.5 text-[10px] font-black text-[#795b00]">
                        {item.badge}
                      </span>
                    ) : null}
                  </span>
                </NavLink>
              ))}
            </div>
          </div>
        </header>

        <main className="admin-main w-full px-4 pb-6 pt-32 md:px-5 md:pt-36 lg:pt-28 2xl:px-6">
          {readOnlyPreview ? (
            <section className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-sky/35 bg-sky/10 px-4 py-3 shadow-panel">
              <span className="shrink-0 rounded-full bg-sky px-3 py-1 text-xs font-black text-white">
                {t("只读代看")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-ink">
                  {readOnlyPreview.subjectName}
                </p>
                <p className="mt-0.5 text-xs font-semibold text-ink/55">
                  {t("可查看真实数据，所有修改请求都会被系统拦截")}
                </p>
              </div>
              {readOnlyPreview.shops.length > 1 ? (
                <label className="flex items-center gap-2 text-xs font-black text-ink/60">
                  {t("切换查看店铺")}
                  <select
                    className="focus-ring h-9 max-w-[240px] rounded-lg border border-line bg-white px-3 text-xs font-bold text-ink"
                    value={readOnlyPreview.selectedShopId}
                    onChange={(event) => changePreviewShop(Number(event.target.value))}
                  >
                    {readOnlyPreview.shops.map((shop) => (
                      <option key={shop.id} value={shop.id}>
                        {shop.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <button
                className="focus-ring h-9 shrink-0 rounded-full border border-sky/40 bg-white px-4 text-xs font-black text-[#245a80]"
                onClick={exitPreview}
                type="button"
              >
                {t("退出只读代看")}
              </button>
            </section>
          ) : null}
          {typeof children === "function" ? children(dashboardResource) : children}
        </main>
      </div>
    </div>
  );
}
