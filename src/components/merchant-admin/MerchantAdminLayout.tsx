import { useEffect, useMemo, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import type { FeaturePermission } from "../../auth/featurePermissions";
import { merchantAdminDemo } from "../../data/merchantAdmin";
import { cn, yen } from "../../lib/utils";
import { defaultDayAdminTheme, defaultNightAdminTheme, detectSystemAdminTheme, normalizeAdminTheme, sharedAdminThemeOptions, type AdminTheme } from "../../theme/AdminTheme";
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

type AdminThemePreferenceMode = "auto" | "manual";

type AdminThemeState = {
  theme: AdminTheme;
  preferenceMode: AdminThemePreferenceMode;
};

const merchantAdminSections: MerchantAdminNavSection[] = [
  {
    key: "operations",
    title: "门店经营",
    items: [
      { label: "门店总览", to: "/merchant-admin", icon: "总", children: ["门店表现", "快捷入口", "经营提醒"] },
      { label: "数据 / 经营驾驶舱", to: "/merchant-admin/analytics", icon: "数", children: ["KPI", "订单漏斗", "NDP", "异常预警"] },
      { label: "订单中心", to: "/merchant-admin/orders", icon: "单", children: ["预约处理", "改期", "联系顾客"] },
      { label: "点单 / オーダー", to: "/merchant-admin/dine/orders", icon: "点", children: ["新单", "KDS", "上菜", "收银"], permission: "store.dine-in.order.view" },
      { label: "菜单 / メニュー", to: "/merchant-admin/menu", icon: "菜", children: ["商品", "售罄", "制作区", "设施限定"], permission: "store.dine-in.menu.view" },
      { label: "场控 / 店内", to: "/merchant-admin/floor", icon: "店", children: ["桌台", "包厢", "床位", "QR"], permission: "store.dine-in.floor.view" },
      { label: "场控布局", to: "/merchant-admin/stage-layout", icon: "场", children: ["区域状态", "包间利用", "预约占用"], permission: "store.stage-layout.view" },
      { label: "库存管理", to: "/merchant-admin/inventory", icon: "库", children: ["耗材余量", "预警", "补货建议"], permission: "store.inventory.view" },
      { label: "财务结算", to: "/merchant-admin/finance", icon: "¥", children: ["店铺流水", "结算单", "分账"] }
    ]
  },
  {
    key: "dispatch",
    title: "调度中心",
    items: [
      { label: "现状确认", to: "/merchant-admin/dispatch-center/current", icon: "确", children: ["周期状态", "异常处理", "confirmed slots"], permission: "store.scheduling.overview.view" },
      { label: "预约一览", to: "/merchant-admin/dispatch-center/appointments", icon: "予", children: ["日程视图", "预约详情", "联系处理"], permission: "store.scheduling.today.view" },
      { label: "排班", to: "/merchant-admin/dispatch-center/schedule", icon: "排", badge: "限定免费", children: ["手动", "自动", "智能排班"], permission: "store.scheduling.automation.edit" }
    ]
  },
  {
    key: "people",
    title: "人员与顾客",
    items: [
      { label: "员工列表", to: "/merchant-admin/people?module=staff", icon: "员", children: ["员工列表", "状态", "评价"] },
      { label: "用户管理", to: "/merchant-admin/people?module=customers", icon: "客", children: ["到店顾客", "复购", "会员种类"] },
      { label: "评价中心", to: "/merchant-admin/people?module=reviews", icon: "评", children: ["店铺评价", "员工评价", "待回复"] }
    ]
  },
  {
    key: "design",
    title: "UI装修",
    items: [
      { label: "店铺 UI 装修", to: "/merchant-admin/design", icon: "店", children: ["详情页首屏", "图文区块", "菜单布局"] },
      { label: "信息卡装修", to: "/merchant-admin/design?module=cards", icon: "卡", children: ["店铺卡", "套餐卡", "员工卡"] }
    ]
  },
  {
    key: "settings",
    title: "门店设置",
    items: [
      { label: "门店设置", to: "/merchant-admin/settings", icon: "设", children: ["营业时间", "资质文件", "管理员"] }
    ]
  }
];

function splitTo(to: string) {
  const [path, query = ""] = to.split("?");

  return { path, search: query ? `?${query}` : "" };
}

function routeMatches(item: MerchantAdminNavItem, pathname: string, search: string, sections: MerchantAdminNavSection[] = merchantAdminSections) {
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

  if (itemSearch) {
    return pathname === path && search === itemSearch;
  }

  if (hasExactQueryRoute) {
    return false;
  }

  return pathname === path || (path !== "/merchant-admin" && pathname.startsWith(`${path}/`));
}

function getSectionForRoute(pathname: string, search: string, sections: MerchantAdminNavSection[] = merchantAdminSections) {
  return sections.find((section) => section.items.some((item) => routeMatches(item, pathname, search, sections)))?.key ?? "operations";
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

  const preferenceMode = normalizeThemePreferenceMode(window.localStorage.getItem(themePreferenceModeStorageKey));
  const stored = window.localStorage.getItem(themeStorageKey);
  if (preferenceMode === "manual") {
    return {
      theme: normalizeAdminTheme(stored, defaultDayAdminTheme, sharedAdminThemeOptions, defaultNightAdminTheme),
      preferenceMode
    };
  }

  return {
    theme: detectSystemAdminTheme(defaultDayAdminTheme, defaultNightAdminTheme, sharedAdminThemeOptions),
    preferenceMode
  };
}

export function MerchantAdminLayout({ children }: { children: ReactNode }) {
  const { canAccessFeature } = useAuth();
  const [{ theme, preferenceMode }, setThemeState] = useState<AdminThemeState>(getInitialThemeState);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const visibleSections = useMemo(
    () =>
      merchantAdminSections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => !item.permission || canAccessFeature("merchant", item.permission))
        }))
        .filter((section) => section.items.length > 0),
    [canAccessFeature]
  );
  const routeSectionKey = getSectionForRoute(location.pathname, location.search, visibleSections);
  const [activeSectionKey, setActiveSectionKey] = useState(routeSectionKey);
  const activeSection = visibleSections.find((section) => section.key === activeSectionKey) ?? visibleSections[0] ?? merchantAdminSections[0];
  const pendingOrders = useMemo(() => merchantAdminDemo.orders.filter((order) => ["pending", "confirmed", "scheduled"].includes(order.status)).length, []);

  const setTheme = (nextTheme: AdminTheme) => {
    setThemeState({
      theme: nextTheme,
      preferenceMode: "manual"
    });
  };

  const openSection = (sectionKey: string) => {
    const section = visibleSections.find((item) => item.key === sectionKey) ?? visibleSections[0] ?? merchantAdminSections[0];
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

  return (
    <div className={cn("admin-shell merchant-admin-shell min-h-screen bg-paper text-ink", `admin-theme-${theme}`)}>
      <aside className="admin-sidebar fixed left-0 top-0 hidden h-screen w-64 border-r border-line bg-white p-4 lg:block">
        <div className="flex h-full flex-col">
          <div className="admin-brand rounded-lg p-4 text-white">
            <div className="flex items-center gap-3">
              <AdminAccountMenu accountName={merchantAdminDemo.store.name} fallbackEmail="store-admin@needo.jp" loginPath="/login/merchant-admin" portal="merchant" roleLabel="店铺管理员" />
              <NavLink className="min-w-0 flex-1 text-white" to="/merchant-admin">
                <p className="text-xs font-bold text-mint">NeeDo 商户后台</p>
                <h1 className="mt-1 text-lg font-black">商户后台</h1>
              </NavLink>
            </div>
          </div>

          <section className="admin-profile mt-4 rounded-lg border border-line bg-paper p-3">
            <div className="flex items-center gap-3">
              <img alt={merchantAdminDemo.store.name} className="avatar-shape h-11 w-11 object-cover" src={merchantAdminDemo.store.cover} />
              <div className="min-w-0">
                <p className="truncate text-sm font-black">{merchantAdminDemo.store.name}</p>
                <p className="mt-1 text-xs text-ink/45">{merchantAdminDemo.store.area} · {merchantAdminDemo.store.openStatus}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-md bg-white px-2 py-2">
                <p className="text-[11px] text-ink/45">待处理</p>
                <strong className="text-sm">{pendingOrders}</strong>
              </div>
              <div className="rounded-md bg-white px-2 py-2">
                <p className="text-[11px] text-ink/45">月流水</p>
                <strong className="text-sm">{yen(merchantAdminDemo.orders.reduce((sum, order) => sum + order.amount, 0))}</strong>
              </div>
            </div>
          </section>

          <section className="admin-sidebar-search mt-4 rounded-lg border border-line bg-paper p-3">
            <p className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-ink/40">店铺搜索</p>
            <label className="admin-search flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm">
              <span className="text-ink/45">⌕</span>
              <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder="搜索订单、顾客、员工、套餐" />
            </label>
          </section>

          <nav className="admin-nav mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="mb-4 rounded-lg border border-line bg-paper p-3">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-ink/40">当前模块</p>
              <h2 className="mt-1 text-xl font-black">{activeSection.title}</h2>
            </div>
            <div className="space-y-2">
              {activeSection.items.map((item) => (
                <NavLink
                  className={() =>
                    cn(
                      "focus-ring admin-nav-link flex items-start gap-3 rounded-lg px-3 py-3 text-sm font-bold transition",
                      routeMatches(item, location.pathname, location.search, visibleSections) ? "is-active text-white" : "text-ink/65 hover:bg-paper hover:text-ink"
                    )
                  }
                  end={item.to === "/merchant-admin"}
                  key={item.to}
                  to={item.to}
                >
                  <span className="admin-nav-icon mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md text-[11px]">{item.icon}</span>
                  <span className="min-w-0">
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="truncate">{item.label}</span>
                      {item.badge ? <span className="rounded-md bg-lemon/30 px-1.5 py-0.5 text-[10px] font-black text-[#795b00]">{item.badge}</span> : null}
                    </span>
                    {item.children ? <span className="mt-1 block text-[11px] font-semibold leading-4 opacity-70">{item.children.join(" / ")}</span> : null}
                  </span>
                </NavLink>
              ))}
            </div>
          </nav>

          <div className="admin-sidebar-note rounded-lg border border-line bg-paper p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="font-bold">本店经营提醒</p>
              <span className="rounded-md bg-moss px-2 py-1 text-[11px] font-black text-white">实时</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-ink/55">高频入口只保留本店自己能处理的事务，不显示平台运营后台模块。</p>
          </div>
        </div>
      </aside>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-[70] bg-black/45 lg:hidden">
          <button aria-label="关闭商户后台导航" className="absolute inset-0" onClick={() => setMobileNavOpen(false)} type="button" />
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
                    className={cn("w-full rounded-lg px-3 py-3 text-left text-sm font-black", activeSectionKey === section.key ? "bg-ink text-white" : "bg-white text-ink")}
                    onClick={() => openSection(section.key)}
                    type="button"
                  >
                    {section.title}
                  </button>
                  <div className="mt-3 space-y-2">
                    {section.items.map((item) => (
                      <NavLink
                        className={({ isActive }) => cn("block rounded-lg px-3 py-2 text-sm font-bold", isActive ? "bg-moss text-white" : "bg-white text-ink/65")}
                        key={item.to}
                        onClick={() => setMobileNavOpen(false)}
                        to={item.to}
                      >
                        <span className="inline-flex items-center gap-2">
                          {item.label}
                          {item.badge ? <span className="rounded-md bg-lemon/30 px-1.5 py-0.5 text-[10px] font-black text-[#795b00]">{item.badge}</span> : null}
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
                  <button className="focus-ring rounded-lg border border-line bg-paper px-3 py-2 text-sm font-black" onClick={() => setMobileNavOpen(true)} type="button">
                    菜单
                  </button>
                  <NavLink className="admin-mobile-brand rounded-lg bg-ink px-3 py-2 text-sm font-bold text-white" to="/merchant-admin">
                    Store
                  </NavLink>
                </div>
                <div className="admin-section-tabs scrollbar-none flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-lg border border-line bg-paper p-1">
                  {visibleSections.map((section) => (
                    <button
                      className={cn(
                        "admin-section-tab focus-ring h-8 shrink-0 rounded-md px-3 text-xs font-black transition",
                        activeSectionKey === section.key ? "is-active" : "text-ink/55 hover:bg-white hover:text-ink"
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
                  <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder="搜索订单、顾客、员工、财务" />
                </label>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <button className="focus-ring rounded-lg border border-line bg-paper px-3 py-2 text-xs font-black text-ink/65" type="button">
                  通知
                </button>
                <NavLink className="focus-ring rounded-lg border border-line bg-paper px-3 py-2 text-xs font-black text-ink/65" to="/merchant-admin/settings">
                  设置
                </NavLink>
                <LanguageSwitcher className="shrink-0" iconOnly />
                <AdminThemeMenu onThemeChange={setTheme} options={sharedAdminThemeOptions} theme={theme} />
              </div>
            </div>
            <div className="admin-subnav scrollbar-none mt-3 flex items-center gap-2 overflow-x-auto lg:hidden">
              {activeSection.items.map((item) => (
                <NavLink
                  className={({ isActive }) =>
                    cn("shrink-0 rounded-lg border px-3 py-2 text-xs font-black transition", isActive ? "border-ink bg-ink text-white" : "border-line bg-paper text-ink/60")
                  }
                  end={item.to === "/merchant-admin"}
                  key={item.to}
                  to={item.to}
                >
                  <span className="inline-flex items-center gap-2">
                    {item.label}
                    {item.badge ? <span className="rounded-md bg-lemon/30 px-1.5 py-0.5 text-[10px] font-black text-[#795b00]">{item.badge}</span> : null}
                  </span>
                </NavLink>
              ))}
            </div>
          </div>
        </header>

        <main className="admin-main w-full px-4 pb-6 pt-32 md:px-5 md:pt-36 lg:pt-28 2xl:px-6">{children}</main>
      </div>
    </div>
  );
}
