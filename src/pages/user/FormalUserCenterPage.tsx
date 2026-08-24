import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiClientError } from "../../api/httpClient";
import { useAuth } from "../../auth/AuthProvider";
import { PrimaryButton } from "../../components/client-ui/AppScaffold";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileShell } from "../../components/mobile/MobileShell";
import { userNavItems } from "../../components/mobile/navItems";
import { AvatarImage } from "../../components/ui/AvatarImage";
import { bookingApi, type BookingOrderStatus } from "../../features/booking/api";
import { coreReadApi, type CoreCustomerProfile } from "../../features/core-read/api";
import { walletApi, type Wallet } from "../../features/wallet/api";
import { cn } from "../../lib/utils";

const orderStatuses = ["pending", "confirmed", "inService", "completed", "cancelled"] as const satisfies readonly BookingOrderStatus[];
type OrderCounts = Record<(typeof orderStatuses)[number], number>;

const emptyOrderCounts: OrderCounts = {
  pending: 0,
  confirmed: 0,
  inService: 0,
  completed: 0,
  cancelled: 0
};

const panelClassName =
  "rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.05)]";

function describeUserCenterError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return "登录状态已失效，请重新登录";
    if (error.status === 403) return "当前身份没有读取个人数据的权限";
    if (error.status === 404) return "用户资料不存在或已不可见";
    if (error.status >= 500) return "个人数据服务暂时不可用，请稍后重试";
  }

  return "个人数据加载失败，请检查网络后重试";
}

function formatNdp(value: number) {
  return `${Math.max(0, value).toLocaleString("ja-JP")} NDP`;
}

export function FormalUserCenterPage({ customerProfileId }: { customerProfileId: number }) {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [loadStatus, setLoadStatus] = useState<"loading" | "success" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const [profile, setProfile] = useState<CoreCustomerProfile | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [orderCounts, setOrderCounts] = useState<OrderCounts>(emptyOrderCounts);

  useEffect(() => {
    let active = true;
    setLoadStatus("loading");
    setLoadError("");

    Promise.all([
      coreReadApi.getCustomerProfile(customerProfileId),
      walletApi.getMyWallet(),
      Promise.all(orderStatuses.map(async (status) => {
        const page = await bookingApi.listOrders({ page: 1, pageSize: 1, status });
        return [status, page.total] as const;
      }))
    ])
      .then(([customerProfile, currentWallet, counts]) => {
        if (!active) return;
        setProfile(customerProfile);
        setWallet(currentWallet);
        setOrderCounts({ ...emptyOrderCounts, ...Object.fromEntries(counts) });
        setLoadStatus("success");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setProfile(null);
        setWallet(null);
        setOrderCounts(emptyOrderCounts);
        setLoadError(describeUserCenterError(error));
        setLoadStatus("error");
      });

    return () => {
      active = false;
    };
  }, [customerProfileId, revision]);

  const totalOrders = useMemo(
    () => Object.values(orderCounts).reduce((sum, count) => sum + count, 0),
    [orderCounts]
  );
  const closePage = () => {
    if (typeof window.history.state?.idx === "number" && window.history.state.idx > 0) {
      navigate(-1);
      return;
    }
    navigate("/", { replace: true });
  };

  return (
    <MobileShell navItems={userNavItems}>
      <div className="client-glass-page-surface min-h-dvh">
        <MobileFullscreenHeader
          info="姓名、头像、预约统计和钱包余额均来自当前登录身份。"
          onBack={closePage}
          onClose={closePage}
          showSpacer={false}
          title="我的"
        />

        <main className="space-y-4 px-4 pb-[calc(132px+env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+86px)]">
          {loadStatus === "loading" ? (
            <section className={cn(panelClassName, "py-8 text-center")} aria-live="polite">
              <p className="text-sm font-black text-[color:var(--client-text)]">正在加载我的正式数据</p>
            </section>
          ) : null}

          {loadStatus === "error" ? (
            <section className={cn(panelClassName, "py-8 text-center")} role="alert">
              <h1 className="text-lg font-black text-[color:var(--client-text)]">我的数据加载失败</h1>
              <p className="mt-2 text-sm font-bold leading-6 text-[color:var(--client-muted)]">{loadError}</p>
              <PrimaryButton className="mt-4 w-full" onClick={() => setRevision((current) => current + 1)}>
                重新加载我的数据
              </PrimaryButton>
            </section>
          ) : null}

          {loadStatus === "success" && profile && wallet ? (
            <>
              <section className={panelClassName}>
                <div className="flex items-start gap-4">
                  <AvatarImage
                    alt={profile.displayName}
                    className="h-24 w-24 rounded-[26px]"
                    src={profile.avatarUrl ?? session?.avatarUrl ?? "/images/generated/profiles/ai-profile-30.jpg"}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-[color:var(--client-primary)]">正式用户资料</p>
                    <h1 className="mt-1 truncate text-2xl font-black text-[color:var(--client-text)]">{profile.displayName}</h1>
                    <p className="mt-1 truncate text-xs font-bold text-[color:var(--client-muted)]">{session?.email}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-[color:var(--client-primary-soft)] px-3 py-1 text-[11px] font-black text-[color:var(--client-primary-strong)]">
                        {profile.membershipLevel}
                      </span>
                      {profile.city ? (
                        <span className="rounded-full border border-[color:var(--client-line)] px-3 py-1 text-[11px] font-black text-[color:var(--client-muted)]">
                          {profile.city}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                {profile.bio ? <p className="mt-4 text-sm font-bold leading-6 text-[color:var(--client-muted)]">{profile.bio}</p> : null}
              </section>

              <section className={panelClassName}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black text-[color:var(--client-muted)]">NDP 可用余额</p>
                    <strong className="mt-1 block text-2xl font-black text-[color:var(--client-primary)]">{formatNdp(wallet.availableBalance)}</strong>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black text-[color:var(--client-muted)]">冻结余额</p>
                    <strong className="mt-1 block text-sm font-black text-[color:var(--client-text)]">{formatNdp(wallet.frozenBalance)}</strong>
                  </div>
                </div>
                <Link className="focus-ring mt-4 flex h-11 items-center justify-center rounded-full border border-[color:var(--client-line)] text-sm font-black text-[color:var(--client-text)]" to="/me/settings/ndp-guide">
                  查看 NDP 使用说明
                </Link>
              </section>

              <section className={panelClassName}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-black text-[color:var(--client-text)]">我的正式预约</h2>
                    <p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">合计 {totalOrders} 单</p>
                  </div>
                  <Link className="text-sm font-black text-[color:var(--client-primary)]" to="/orders">全部预约</Link>
                </div>
                <div className="mt-4 grid grid-cols-5 gap-2">
                  {([
                    ["pending", "待确认"],
                    ["confirmed", "待服务"],
                    ["inService", "进行中"],
                    ["completed", "已完成"],
                    ["cancelled", "已取消"]
                  ] as const).map(([status, label]) => (
                    <Link
                      className="rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-elevated)] px-1 py-3 text-center"
                      key={status}
                      to="/orders"
                    >
                      <strong className="block text-base font-black text-[color:var(--client-text)]">{orderCounts[status]}</strong>
                      <span className="mt-1 block text-[10px] font-bold text-[color:var(--client-muted)]">{label}</span>
                    </Link>
                  ))}
                </div>
              </section>

              <section className={panelClassName}>
                <h2 className="font-black text-[color:var(--client-text)]">账号与服务</h2>
                <div className="mt-3 grid gap-2">
                  {[
                    ["账号设置", "手机号、邮箱、登录密码", "/me/settings/account"],
                    ["通知设置", "预约、退款与系统提醒", "/me/settings/notifications"],
                    ["隐私与安全", "身份验证与数据授权", "/me/settings/verification"],
                    ["联系客服", "退款、改期与投诉", "/support"]
                  ].map(([label, caption, to]) => (
                    <Link className="flex items-center justify-between rounded-[18px] border border-[color:var(--client-line)] px-4 py-3" key={label} to={to}>
                      <div>
                        <strong className="text-sm font-black text-[color:var(--client-text)]">{label}</strong>
                        <p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">{caption}</p>
                      </div>
                      <span className="text-[color:var(--client-muted)]">›</span>
                    </Link>
                  ))}
                </div>
              </section>
            </>
          ) : null}
        </main>
      </div>
    </MobileShell>
  );
}
