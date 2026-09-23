import { BackofficeHeaderActions } from "../../features/sos/BackofficeHeaderActions";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { cn } from "../../lib/utils";
import { defaultDayAdminTheme, defaultNightAdminTheme, detectSystemAdminTheme, normalizeAdminTheme, platformAdminThemeOptions, type AdminTheme } from "../../theme/AdminTheme";
import { AdminAccountMenu } from "./AdminAccountMenu";
import { CloseIconButton } from "../ui/CloseIconButton";
import { OfficialNoticeBell } from "../ui/OfficialNoticeBell";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { contentPublicationEditorText } from "../../features/content-publication/i18n";
import { translateText } from "../../i18n/translations";
import { AdminOperatorSummary } from "./AdminOperatorSummary";
import { resolveAdminDisplayName, resolveAdminRoleLabel } from "./adminOperatorSummaryModel";
import { AdminGlobalSearch } from "./AdminGlobalSearch";

const themeStorageKey = "needo.admin.theme";
const themePreferenceModeStorageKey = "needo.admin.theme.mode";

type AdminThemePreferenceMode = "auto" | "manual";

type AdminThemeState = {
  theme: AdminTheme;
  preferenceMode: AdminThemePreferenceMode;
};

type AdminNavItem = {
  label: string;
  to: string;
  icon: string;
  permission?: string;
  children?: string[];
};

type AdminNavSection = {
  key: string;
  title: string;
  badge?: string;
  disabled?: boolean;
  items: AdminNavItem[];
};


const navSections: AdminNavSection[] = [
  {
    key: "platform",
    title: "运营",
    items: [
      { label: "数据大盘", to: "/admin", icon: "◆", permission: "menu:dashboard" },
      { label: "数据中心", to: "/admin/data", icon: "▥" },
      { label: "动态管理", to: "/admin/data?module=moments", icon: "◎" },
      { label: "用户端首页轮播图", to: "/admin/carousel", icon: "播", permission: "page:backoffice-user-home-carousel", children: ["五语言", "草稿与发布", "版本回滚"] },
      { label: "官方通知", to: "/admin/notifications", icon: "通", permission: "page:backoffice-official-notice", children: ["通知列表", "定时发送", "投递回执"] },
      { label: "运营时间线", to: "/admin/operation-timeline", icon: "线", permission: "backoffice:dashboard:read" }
    ]
  },
  {
    key: "users",
    title: "用户",
    items: [
      { label: "用户列表", to: "/admin/users", icon: "列", permission: "backoffice:users:read", children: ["全部账号", "身份", "会员与经验"] },
      { label: "用户分组", to: "/admin/user-groups", icon: "组", permission: "backoffice:user-group:read", children: ["系统分组", "自定义分组", "成员"] },
      { label: "用户全局设置", to: "/admin/user-global-settings", icon: "全", permission: "backoffice:user-policy:read", children: ["账号绑定", "eKYC", "NDP经验活动"] },
      { label: "会员等级设置", to: "/admin/membership-tiers", icon: "级", permission: "backoffice:membership-tier:read", children: ["四种会员", "卡面", "草稿发布"] },
      { label: "会员权益说明", to: "/admin/membership-benefits", icon: "益", permission: "backoffice:membership-benefit:read", children: ["八项权益", "启停", "交付能力"] }
    ]
  },
  {
    key: "technicians",
    title: "技师",
    items: [
      { label: "技师列表", to: "/admin/technicians", icon: "技", children: ["平台全量", "店铺旗下", "信息卡"] },
      { label: "员工管理", to: "/admin/employees", icon: "员", permission: "backoffice:shops:list", children: ["店铺员工", "新建员工"] },
      { label: "虚拟技师", to: "/admin/technicians?module=virtual", icon: "虚", children: ["测试账号", "冷启动", "可启停"] },
      { label: "技师榜单", to: "/admin/technicians?module=ranking", icon: "榜", children: ["服务金额", "完成订单", "工作天数"] },
      { label: "资料审核", to: "/admin/technicians?module=review", icon: "审", children: ["基本资料", "实名信息", "资质证书", "动态信息"] },
      { label: "挂件设置", to: "/admin/badges", icon: "框", children: ["头像框", "特殊标签", "发放记录"] }
    ]
  },
  {
    key: "orders",
    title: "订单",
    items: [
      { label: "订单管理", to: "/admin/orders", icon: "单", children: ["服务订单", "拒单管理", "加钟订单"] },
      { label: "需求中心", to: "/admin/orders/demands", icon: "需", permission: "backoffice:exchange:read", children: ["用户需求", "抢单响应", "匹配记录"] },
      { label: "情报中心", to: "/admin/orders/info", icon: "情", permission: "backoffice:exchange:read", children: ["商户情报", "技师情报", "匹配记录"] },
      { label: "评价管理", to: "/admin/reviews", icon: "评", permission: "backoffice:users:read", children: ["评价列表", "评价标签"] },
      { label: "订单设置", to: "/admin/settings/system?tab=basic", icon: "设", permission: "backoffice:system-settings:read" },
      { label: "上门工单", to: "/admin/field-jobs", icon: "工", permission: "backoffice:field-jobs:read" }
    ]
  },
  {
    key: "stores",
    title: "店铺",
    items: [
      { label: "店铺列表", to: "/admin/merchants", icon: "店", children: ["店铺信息卡", "营业状态", "预约能力"] },
      { label: "店铺分类", to: "/admin/merchants?module=categories", icon: "类", children: ["分类图标", "启用状态", "排序"] },
      { label: "店铺申请管理", to: "/admin/merchant-applications", icon: "审", permission: "ops:merchant-application:read" }
    ]
  },
  {
    key: "marketing",
    title: "营销",
    badge: "TEST",
    items: [
      { label: "优惠券", to: "/admin/marketing", icon: "券", children: ["能力门禁", "核销合同", "归因审计"] },
      { label: "礼品卡", to: "/admin/marketing?module=gift-cards", icon: "礼", children: ["能力门禁"] },
      { label: "文章管理", to: "/admin/marketing?module=articles", icon: "文", children: ["能力门禁"] }
    ]
  },
  {
    key: "finance",
    title: "财务",
    items: [
      { label: "财务结算", to: "/admin/finance", icon: "¥", children: ["今日营收", "待结算", "渠道手续费"] },
      { label: "会员返点平台费", to: "/admin/finance/membership-reward-fee", icon: "返", permission: "page:backoffice-membership-reward-fee", children: ["TEST", "费率快照", "版本历史"] },
      { label: "运营成本设置", to: "/admin/finance/operating-costs", icon: "本", permission: "backoffice:operating-cost:read", children: ["人件费", "服务器", "第三方 API", "店铺分摊"] },
      { label: "退款审核", to: "/admin/finance?module=refund-review", icon: "审" },
      { label: "分账规则", to: "/admin/finance?module=commission", icon: "％" },
      { label: "发票记录", to: "/admin/finance?module=invoices", icon: "票" }
    ]
  },
  {
    key: "cps",
    title: "联盟营销",
    badge: "TEST",
    items: [
      { label: "联盟营销任务", to: "/admin/afirieito", icon: "联", permission: "menu:backoffice-affiliate", children: ["任务审核", "预算状态", "范围快照"] },
      { label: "平台抽成规则", to: "/admin/afirieito/fee-rules", icon: "率", permission: "page:backoffice-affiliate-fee-rule", children: ["全局费率", "店铺覆盖", "版本历史"] },
      { label: "联盟营销公告轮播", to: "/admin/afirieito/announcements/carousel", icon: "告", permission: "page:backoffice-affiliate-notice-carousel", children: ["正式公告", "五语言", "发布与回滚"] }
    ]
  },
  {
    key: "agents",
    title: "代理商",
    badge: "TEST",
    items: [
      { label: "代理商管理", to: "/admin/agents", icon: "代", permission: "backoffice:agent:read", children: ["介绍店铺", "佣金规则", "结算与支付"] }
    ]
  },
  {
    key: "franchisees",
    title: "加盟商",
    badge: "TEST",
    disabled: true,
    items: []
  },
  {
    key: "suppliers",
    title: "供货商",
    badge: "TEST",
    disabled: true,
    items: []
  },
  {
    key: "settings",
    title: "设置",
    items: [
      { label: "系统设置", to: "/admin/settings/system", icon: "系", permission: "menu:admin-settings", children: ["基础设置", "政策和协议", "储存设置", "支付设置", "eKYC"] },
      { label: "NDP 汇率", to: "/admin/settings/ndp-exchange-rate", icon: "率", permission: "backoffice:ndp-exchange-rate:read", children: ["当前汇率", "计划汇率", "版本历史"] },
      { label: "运营服务类型设置", to: "/admin/settings/service-search", icon: "搜", permission: "backoffice:service-taxonomy:read", children: ["服务类型", "搜索标签", "关键词趋势"] },
      { label: "城市设置", to: "/admin/cities", icon: "城", children: ["城市管理", "城市投票"] },
      { label: "角色管理", to: "/admin/roles", icon: "角", permission: "menu:role-management", children: ["角色列表", "分配权限"] },
      { label: "权限管理", to: "/admin/permissions", icon: "权", permission: "menu:permission-management", children: ["权限列表", "权限树"] },
      { label: "出行能力状态", to: "/admin/travel-settings", icon: "行", permission: "backoffice:travel-fare:read", children: ["地址基础数据", "供应商未配置", "出行合同"] }
    ]
  },
  {
    key: "docs",
    title: "文档",
    items: [
      { label: "操作文档", to: "/admin/docs", icon: "文", children: ["产运后台", "商户后台", "联盟营销后台"] },
      { label: "API 文档", to: "/admin/docs/api", icon: "A", children: ["全量 API", "显示开关", "关键字段"] }
    ]
  },
  { key: "application-reviews", title: "审核", items: [{ label: "eKYC手动", to: "/admin/application-reviews/ekyc", icon: "审", permission: "ops:ekyc-application:read" }] }
];


function splitTo(to: string) {
  const [path, query = ""] = to.split("?");

  return { path, search: query ? `?${query}` : "" };
}

export function routeMatches(item: AdminNavItem, pathname: string, search: string) {
  const { path, search: itemSearch } = splitTo(item.to);
  const hasExactQueryRoute = Boolean(
    search &&
      navSections.some((section) =>
        section.items.some((candidate) => {
          const candidateRoute = splitTo(candidate.to);

          return candidateRoute.path === pathname && candidateRoute.search === search;
        })
      )
  );
  const hasMoreSpecificPathRoute = navSections.some((section) =>
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

  return pathname === path || (path !== "/admin" && pathname.startsWith(`${path}/`));
}

function getSectionForRoute(pathname: string, search: string) {
  return navSections.find((section) => section.items.some((item) => routeMatches(item, pathname, search)))?.key ?? "platform";
}

function normalizeThemePreferenceMode(mode: string | null | undefined): AdminThemePreferenceMode {
  return mode === "manual" ? "manual" : "auto";
}

function getInitialAdminThemeState(): AdminThemeState {
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
      theme: normalizeAdminTheme(stored, defaultDayAdminTheme, platformAdminThemeOptions, defaultNightAdminTheme),
      preferenceMode
    };
  }

  return {
    theme: detectSystemAdminTheme(defaultDayAdminTheme, defaultNightAdminTheme, platformAdminThemeOptions),
    preferenceMode
  };
}

export function AdminLayout({ children }: { children: ReactNode }) {
  const [{ theme, preferenceMode }, setThemeState] = useState<AdminThemeState>(getInitialAdminThemeState);
  const location = useLocation();
  const navigate = useNavigate();
  const { canAccessMenu, hasPermission, session } = useAuth();
  const { language } = useOptionalI18n();
  const accountName = session ? resolveAdminDisplayName(session) : "—";
  const roleLabel = session
    ? resolveAdminRoleLabel(session, translateText("运营后台成员", language))
    : translateText("运营后台成员", language);
  const visibleNavSections = useMemo(
    () =>
      navSections
        .map((section) => ({
          ...section,
          items: section.items
            .filter((item) => !item.permission || canAccessMenu(item.permission))
            .map((item) => ({
              ...item,
              label:
                item.to === "/admin/carousel"
                  ? contentPublicationEditorText("userHomeMenu", language)
                  : item.to === "/admin/afirieito/announcements/carousel"
                    ? contentPublicationEditorText("affiliateNoticeMenu", language)
                    : item.label
            }))
        }))
        .filter((section) => section.disabled || section.items.length > 0),
    [canAccessMenu, language]
  );
  const routeSectionKey = getSectionForRoute(location.pathname, location.search);
  const [activeSectionKey, setActiveSectionKey] = useState(routeSectionKey);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const activeSection = visibleNavSections.find((section) => section.key === activeSectionKey) ?? visibleNavSections[0] ?? navSections[0];

  const setTheme = (nextTheme: AdminTheme) => {
    setThemeState({
      theme: nextTheme,
      preferenceMode: "manual"
    });
  };

  const openSection = (sectionKey: string) => {
    const section = visibleNavSections.find((item) => item.key === sectionKey) ?? visibleNavSections[0] ?? navSections[0];
    if (section.disabled) return;
    setActiveSectionKey(section.key);
    navigate(section.items[0]?.to ?? "/admin");
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
    <div className={cn("admin-shell min-h-screen bg-paper text-ink", `admin-theme-${theme}`)}>
      <aside className="admin-sidebar fixed left-0 top-0 z-[90] hidden h-screen w-64 border-r border-line bg-white p-4 lg:block">
        <div className="flex h-full flex-col">
          <div className="admin-brand rounded-lg p-4 text-white">
            <div className="flex items-center gap-3">
              <AdminAccountMenu accountName={accountName} loginPath="/login/admin" portal="admin" roleLabel={roleLabel} />
              <NavLink className="min-w-0 flex-1 text-white" to="/">
                <p className="text-xs font-bold text-mint">NeeDo 运营后台</p>
                <h1 className="mt-1 text-lg font-black">运营后台</h1>
              </NavLink>
            </div>
          </div>

          <AdminOperatorSummary hasPermission={hasPermission} language={language} session={session} />

          <AdminGlobalSearch hasPermission={hasPermission} />

          <nav className="admin-nav mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="mb-4 rounded-lg border border-line bg-paper p-3">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-ink/40">当前插页</p>
              <h2 className="mt-1 text-xl font-black">{activeSection.title}</h2>
            </div>
            <div className="space-y-2">
              {activeSection.items.map((item) => (
                <NavLink
                  className={() =>
                    cn(
                      "focus-ring admin-nav-link flex items-start gap-3 rounded-lg px-3 py-3 text-sm font-bold transition",
                      routeMatches(item, location.pathname, location.search) ? "is-active text-white" : "text-ink/65 hover:bg-paper hover:text-ink"
                    )
                  }
                  end={item.to === "/admin"}
                  key={item.to}
                  to={item.to}
                >
                  <span aria-hidden="true" className="admin-nav-icon mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md text-[11px]" data-no-i18n>
                    {item.icon}
                  </span>
                  <span className="min-w-0">
                    <span className="block">{item.label}</span>
                    {item.children && (
                      <span className="mt-1 line-clamp-2 block text-[11px] font-semibold leading-4 opacity-70">
                        {item.children.join(" / ")}
                      </span>
                    )}
                  </span>
                </NavLink>
              ))}
            </div>
          </nav>

        </div>
      </aside>
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-[70] bg-black/45 lg:hidden">
          <button aria-label="关闭运营后台导航" className="absolute inset-0" onClick={() => setMobileNavOpen(false)} type="button" />
          <aside className="absolute left-0 top-0 h-full w-[86vw] max-w-[320px] overflow-y-auto border-r border-line bg-white p-4 shadow-soft">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-mint">NeeDo 运营后台</p>
                <h2 className="mt-1 text-lg font-black">运营后台导航</h2>
              </div>
              <CloseIconButton label="关闭运营后台导航" onClick={() => setMobileNavOpen(false)} />
            </div>
            <div className="mt-4 space-y-4">
              {visibleNavSections.map((section) => (
                <section className="rounded-lg border border-line bg-paper p-3" key={section.key}>
                  <button
                    aria-disabled={section.disabled}
                    aria-label={section.badge ? `${section.title} ${section.badge}` : section.title}
                    className={cn("relative w-full rounded-lg px-3 py-3 text-left text-sm font-black", activeSectionKey === section.key ? "bg-ink text-white" : "bg-white text-ink", section.disabled && "cursor-not-allowed opacity-55")}
                    disabled={section.disabled}
                    onClick={() => openSection(section.key)}
                    type="button"
                  >
                    {section.title}
                    {section.badge ? (
                      <span aria-hidden="true" className="absolute right-2 top-2 rounded-full bg-coral px-1.5 py-0.5 text-[8px] font-black leading-none tracking-[0.08em] text-white" data-no-i18n>
                        {section.badge}
                      </span>
                    ) : null}
                  </button>
                  <div className="mt-3 space-y-2">
                    {section.items.map((item) => (
                      <NavLink
                        className={() =>
                          cn(
                            "block rounded-lg px-3 py-2 text-sm font-bold",
                            routeMatches(item, location.pathname, location.search) ? "bg-moss text-white" : "bg-white text-ink/65"
                          )
                        }
                        key={item.to}
                        to={item.to}
                        onClick={() => setMobileNavOpen(false)}
                      >
                        {item.label}
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
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex items-center gap-2 lg:hidden">
                  <button className="focus-ring rounded-lg border border-line bg-paper px-3 py-2 text-sm font-black" onClick={() => setMobileNavOpen(true)} type="button">
                    菜单
                  </button>
                  <NavLink className="admin-mobile-brand rounded-lg bg-ink px-3 py-2 text-sm font-bold text-white" to="/">
                    NeeDo
                  </NavLink>
                </div>
                <div className="admin-section-tabs scrollbar-none flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-lg border border-line bg-paper px-1 py-2">
                  {visibleNavSections.map((section) => (
                    <button
                      aria-disabled={section.disabled}
                      aria-label={section.badge ? `${section.title} ${section.badge}` : section.title}
                      className={cn(
                        "admin-section-tab focus-ring relative h-8 shrink-0 rounded-md px-3 text-xs font-black transition",
                        activeSectionKey === section.key ? "is-active" : "text-ink/55 hover:bg-white hover:text-ink",
                        section.disabled && "cursor-not-allowed opacity-55 hover:bg-transparent"
                      )}
                      disabled={section.disabled}
                      key={section.key}
                      onClick={() => openSection(section.key)}
                      type="button"
                    >
                      {section.title}
                      {section.badge ? (
                        <span aria-hidden="true" className="absolute -right-1 -top-2 rounded-full bg-coral px-1.5 py-0.5 text-[8px] font-black leading-none tracking-[0.08em] text-white shadow-sm" data-no-i18n>
                          {section.badge}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>

              </div>
              <BackofficeHeaderActions
                theme={theme}
                onThemeChange={setTheme}
                themeOptions={platformAdminThemeOptions}
                messageAction={<OfficialNoticeBell to="/admin/notifications/inbox" />}
                supportTo="/admin/support"
              />
            </div>
            <div className="admin-subnav scrollbar-none mt-3 flex items-center gap-2 overflow-x-auto lg:hidden">
              {activeSection.items.map((item) => (
                <NavLink
                  className={() =>
                    cn(
                      "shrink-0 rounded-lg border px-3 py-2 text-xs font-black transition",
                      routeMatches(item, location.pathname, location.search) ? "border-ink bg-ink text-white" : "border-line bg-paper text-ink/60"
                    )
                  }
                  end={item.to === "/admin"}
                  key={item.to}
                  to={item.to}
                >
                  {item.label}
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
