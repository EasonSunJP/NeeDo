import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { demoAuthAccount, type PortalScope, useAuth } from "../../auth/AuthProvider";
import {
  backendManagementSystemBgUrl,
  businessBgUrl,
  loginBgUrl,
  managementBgUrl
} from "../../assets/runtime/images";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import { cn } from "../../lib/utils";
import { getClientThemeClassName, useClientTheme } from "../../theme/ClientThemeProvider";

const frontendPortalOrder: PortalScope[] = ["user", "technician", "merchant", "business"];

const backendPortalEntries = [
  {
    id: "merchant-admin",
    label: "商户后台",
    title: "进入商户后台",
    subtitle: "店铺订单、排班、员工、财务与门店设置。",
    href: "/store-admin.html#/login/merchant-admin"
  },
  {
    id: "operations-admin",
    label: "运营后台",
    title: "进入运营后台",
    subtitle: "平台运营、店铺、技师、订单、财务与全局规则。",
    href: "/pf-admin.html#/login/admin"
  },
  {
    id: "afirieito-admin",
    label: "NDA管理后台",
    title: "进入 NDA管理后台",
    subtitle: "推广计划、归因、分佣、风险与增长数据管理。",
    href: "/afirieito-admin.html#/NDA-admin"
  }
] as const;

const portalCopy: Record<PortalScope, { label: string; title: string; subtitle: string }> = {
  user: {
    label: "用户端",
    title: "进入 NeeDo 用户端",
    subtitle: "浏览服务、预约店铺、联系技师与查看订单。"
  },
  merchant: {
    label: "店铺端",
    title: "进入 NeeDo 店铺端",
    subtitle: "处理预约、安排排班、查看通讯录与门店运营数据。"
  },
  technician: {
    label: "技师端",
    title: "进入 NeeDo 技师端",
    subtitle: "查看任务、切换状态、规划日程与处理服务工单。"
  },
  business: {
    label: "联盟营销",
    title: "进入联盟营销前端",
    subtitle: "查看推广活动、素材、归因收益与提现状态。"
  },
  admin: {
    label: "运营后台",
    title: "进入 NeeDo 运营后台",
    subtitle: "管理平台运营、店铺、技师、订单、财务与全局规则。"
  }
};

const portalEntryPath: Record<PortalScope, string> = {
  user: "/",
  merchant: "/merchant",
  technician: "/technician",
  business: "/afirieito",
  admin: "/admin"
};

const portalEntryBackgrounds: Record<PortalScope, string> = {
  user: loginBgUrl,
  merchant: managementBgUrl,
  technician: businessBgUrl,
  business: businessBgUrl,
  admin: backendManagementSystemBgUrl
};

function normalizePortal(value?: string | null): PortalScope {
  if (value === "merchant" || value === "technician" || value === "business" || value === "admin") {
    return value;
  }

  if (value === "cps" || value === "afirieito") {
    return "business";
  }

  return "user";
}

function resolvePortalEntryBackground(portal: PortalScope, redirectPath?: string | null) {
  if (portal === "admin" || redirectPath?.startsWith("/merchant-admin")) {
    return portalEntryBackgrounds.admin;
  }

  return portalEntryBackgrounds[portal];
}

export function LoginPage() {
  const { portal } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { isNight, theme } = useClientTheme();
  const { isAuthenticated, login, logout, session } = useAuth();
  const requestedPortal = normalizePortal(portal);
  const redirectPath = searchParams.get("redirect");
  const [activePortal, setActivePortal] = useState<PortalScope>(requestedPortal);
  const [username, setUsername] = useState<string>(demoAuthAccount.username);
  const [password, setPassword] = useState<string>(demoAuthAccount.password);
  const [error, setError] = useState("");

  useEffect(() => {
    setActivePortal(requestedPortal);
  }, [requestedPortal]);

  const nextPath = useMemo(() => redirectPath || portalEntryPath[activePortal], [activePortal, redirectPath]);
  const copy = portalCopy[activePortal];
  const heroBackground = useMemo(() => resolvePortalEntryBackground(activePortal, redirectPath), [activePortal, redirectPath]);
  const portalTileBaseClass = isNight
    ? "border-white/14 bg-black/16 text-white/78 hover:bg-white/10"
    : "border-white/18 bg-[rgba(255,255,255,0.12)] text-white/84 hover:bg-[rgba(255,255,255,0.18)]";
  const portalTileActiveClass = isNight
    ? "border-[rgba(193,255,22,0.54)] bg-[rgba(193,255,22,0.18)] text-white shadow-[0_18px_40px_rgba(0,0,0,0.24)]"
    : "border-[rgba(60,136,126,0.42)] bg-[rgba(60,136,126,0.18)] text-white shadow-[0_18px_40px_rgba(21,57,51,0.16)]";
  const heroAccountPanelClass = isNight
    ? "border-white/18 bg-black/18"
    : "border-white/22 bg-[rgba(255,255,255,0.14)]";
  const heroAccountItemClass = isNight ? "bg-white/10" : "bg-[rgba(255,255,255,0.12)]";

  const switchPortal = (nextPortal: PortalScope) => {
    setActivePortal(nextPortal);
    setError("");

    const query = redirectPath ? `?redirect=${encodeURIComponent(redirectPath)}` : "";
    const nextLoginPortal = nextPortal === "business" ? "afirieito" : nextPortal;
    const currentLoginPortal = activePortal === "business" ? "afirieito" : activePortal;
    navigate(`/login/${nextLoginPortal}${query}`, { replace: location.pathname === `/login/${currentLoginPortal}` });
  };

  const openBackendEntry = (href: string) => {
    setError("");
    window.location.assign(href);
  };

  const handleLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!login(activePortal, username, password)) {
      setError(`账号或密码不正确，请使用测试账号 ${demoAuthAccount.username} / ${demoAuthAccount.password}。`);
      return;
    }

    navigate(nextPath, { replace: true });
  };

  return (
    <div
      className={cn(
        "client-shell min-h-screen px-4 py-6",
        isNight ? "client-theme-night text-white" : "client-theme-day text-[color:var(--client-text)]",
        getClientThemeClassName(theme)
      )}
    >
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-6xl gap-5 lg:grid-cols-[1.15fr,0.85fr]">
        <section
          className="relative overflow-hidden rounded-[32px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] px-6 py-7 text-white shadow-[var(--client-shadow)]"
        >
          <img
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
            fetchPriority="high"
            loading="eager"
            src={heroBackground}
          />
          <div className={cn("absolute inset-0", isNight ? "bg-black/20" : "bg-white/10")} />
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                isNight
                  ? "radial-gradient(circle at 16% 18%, rgba(193,255,22,0.18), transparent 24%), linear-gradient(90deg, rgba(0,0,0,0.7) 0%, rgba(7,20,29,0.6) 100%), linear-gradient(180deg, rgba(8,14,18,0.2) 0%, rgba(5,7,10,0.5) 100%)"
                  : "radial-gradient(circle at 16% 18%, rgba(60,136,126,0.2), transparent 24%), linear-gradient(90deg, rgba(255,255,255,0.18) 0%, rgba(60,136,126,0.12) 100%), linear-gradient(180deg, rgba(8,14,18,0.08) 0%, rgba(5,7,10,0.28) 100%)"
            }}
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.22),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(60,136,126,0.14),transparent_26%)]" />
          <div className="relative flex h-full flex-col justify-between gap-8">
            <div>
              <p className="text-sm font-black tracking-[0.12em] text-white/72">NeeDo 账号</p>
              <TitleWithInfo
                as="h1"
                className="mt-4"
                info={copy.subtitle}
                label={`${copy.title}说明`}
                title={copy.title}
                titleClassName="text-3xl font-black leading-tight md:text-4xl"
                variant="dark"
              />
            </div>

            <div className="space-y-5">
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-white/70">前台身份</p>
                  <span className="h-px min-w-8 flex-1 bg-white/18" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {frontendPortalOrder.map((item) => (
                    <button
                      className={cn(
                        "rounded-[24px] border px-4 py-4 text-left backdrop-blur transition",
                        item === activePortal ? portalTileActiveClass : portalTileBaseClass
                      )}
                      key={item}
                      onClick={() => switchPortal(item)}
                      type="button"
                    >
                      <strong className="block text-base font-black">{portalCopy[item].label}</strong>
                      <span className="mt-2 block text-xs leading-5 text-white/78">{portalCopy[item].subtitle}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-white/70">后台管理入口</p>
                  <span className="h-px min-w-8 flex-1 bg-white/18" />
                </div>
                <div className="grid gap-3 lg:grid-cols-3">
                  {backendPortalEntries.map((entry) => (
                    <button
                      aria-label={entry.title}
                      className={cn(
                        "rounded-[20px] border px-4 py-3 text-left backdrop-blur transition",
                        isNight
                          ? "border-white/18 bg-black/28 text-white hover:bg-white/12"
                          : "border-white/28 bg-[rgba(255,255,255,0.22)] text-white hover:bg-[rgba(255,255,255,0.3)]"
                      )}
                      key={entry.id}
                      onClick={() => openBackendEntry(entry.href)}
                      type="button"
                    >
                      <strong className="block text-sm font-black">{entry.label}</strong>
                      <span className="mt-2 block text-[11px] leading-5 text-white/76">{entry.subtitle}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className={cn("rounded-[26px] border p-4 backdrop-blur", heroAccountPanelClass)}>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-white/70">测试账号</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className={cn("rounded-[20px] px-4 py-3", heroAccountItemClass)}>
                  <p className="text-xs font-bold text-white/65">账号 ID</p>
                  <strong className="mt-1 block text-xl font-black">{demoAuthAccount.username}</strong>
                </div>
                <div className={cn("rounded-[20px] px-4 py-3", heroAccountItemClass)}>
                  <p className="text-xs font-bold text-white/65">密码</p>
                  <strong className="mt-1 block text-xl font-black">{demoAuthAccount.password}</strong>
                </div>
              </div>
              <p className="mt-3 text-xs leading-6 text-white/75">同一组测试账号可用于用户端、技师端、店铺端和联盟营销前端。商户后台、运营后台与 NDA管理后台已放到独立管理入口，避免和前台身份混在一起。</p>
            </div>
          </div>
        </section>

        <section className="rounded-[32px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,var(--client-bg)_18%)] p-5 shadow-[var(--client-shadow)] backdrop-blur-xl md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[color:var(--client-primary)]">{portalCopy[activePortal].label}</p>
              <TitleWithInfo
                as="h2"
                className="mt-2"
                info="先登录，再进入对应端口。未登录时访问页面会自动跳转到这里。"
                label="账号登录说明"
                title="账号登录"
                titleClassName="text-2xl font-black text-[color:var(--client-text)]"
              />
            </div>
            {isAuthenticated ? (
              <button className="rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,var(--client-bg)_26%)] px-3 py-2 text-xs font-black text-[color:var(--client-muted)]" onClick={logout} type="button">
                退出登录
              </button>
            ) : null}
          </div>

          {isAuthenticated ? (
            <div className="mt-6 rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-primary)_38%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--client-primary)_12%,var(--client-bg)_88%)] p-4">
              <p className="text-sm font-black text-[color:var(--client-primary-strong)]">当前已登录</p>
              <p className="mt-2 text-sm text-[color:var(--client-muted)]">
                账号：<strong className="text-[color:var(--client-text)]">{session?.username}</strong>
              </p>
              <p className="mt-1 text-sm text-[color:var(--client-muted)]">
                最近登录端口：<strong className="text-[color:var(--client-text)]">{portalCopy[session?.portal ?? activePortal].label}</strong>
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button className="rounded-[18px] bg-[color:var(--client-primary)] px-4 py-3 text-sm font-black text-[color:var(--client-needo-text)]" onClick={() => navigate(nextPath, { replace: true })} type="button">
                  继续进入 {portalCopy[activePortal].label}
                </button>
                <button className="rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,var(--client-bg)_26%)] px-4 py-3 text-sm font-black text-[color:var(--client-muted)]" onClick={logout} type="button">
                  退出并重新登录
                </button>
              </div>
            </div>
          ) : (
            <form className="mt-6 space-y-4" onSubmit={handleLogin}>
              <label className="block">
                <span className="text-sm font-black text-[color:var(--client-muted)]">账号 ID</span>
                <input
                  autoComplete="username"
                  className="mt-2 h-12 w-full rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,var(--client-bg)_26%)] px-4 text-base font-black text-[color:var(--client-text)] outline-none transition placeholder:text-[color:var(--client-soft-muted)] focus:border-[color:var(--client-primary)]"
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="请输入账号 ID"
                  value={username}
                />
              </label>
              <label className="block">
                <span className="text-sm font-black text-[color:var(--client-muted)]">密码</span>
                <input
                  autoComplete="current-password"
                  className="mt-2 h-12 w-full rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,var(--client-bg)_26%)] px-4 text-base font-black text-[color:var(--client-text)] outline-none transition placeholder:text-[color:var(--client-soft-muted)] focus:border-[color:var(--client-primary)]"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="请输入密码"
                  type="password"
                  value={password}
                />
              </label>
              {error ? <p className="rounded-[18px] bg-[color:color-mix(in_srgb,var(--client-accent)_16%,var(--client-bg)_84%)] px-4 py-3 text-sm font-bold text-[color:var(--client-accent)]">{error}</p> : null}
              <button className="w-full rounded-[18px] bg-[color:var(--client-primary)] px-4 py-3 text-base font-black text-[color:var(--client-needo-text)] transition hover:opacity-92" type="submit">
                登录并进入 {portalCopy[activePortal].label}
              </button>
            </form>
          )}

          <div className="mt-6 rounded-[24px] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,var(--client-bg)_28%)] p-4">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[color:var(--client-soft-muted)]">登录说明</p>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-[color:var(--client-muted)]">
              <li>1. 用户端、技师端、店铺端和联盟营销是前台身份；商户后台、运营后台、NDA管理后台在左侧独立入口进入。</li>
              <li>2. 直接访问任意端口时，如果未登录，会自动跳到对应登录页。</li>
              <li>3. 登录后再次进入其他端口，不需要重复输入账号密码。</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
