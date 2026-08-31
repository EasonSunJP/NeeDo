import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ApiClientError } from "../../api/httpClient";
import { useAuth, type AuthSession } from "../../auth/AuthProvider";
import { AppIcon, FeatureSegmentedTabs, IconButton } from "../../components/client-ui/AppScaffold";
import { FloatingHomeHeader, floatingHeaderGlassPanelClassName, floatingHeaderInnerClassName } from "../../components/mobile/FloatingHomeHeader";
import { ContactEventTimelinePanel } from "../../components/mobile/ContactEventTimeline";
import type { ContactEventTimelineEntry } from "../../components/mobile/ContactEventTimeline";
import { MobileShell } from "../../components/mobile/MobileShell";
import { SharedHomeHeader } from "../../components/mobile/SharedHomeHeader";
import { roleBasedTabConfig, technicianNavItems } from "../../components/mobile/navItems";
import { FormalTechnicianOrdersPanel } from "../../components/technician/FormalTechnicianOrdersPanel";
import { AvatarImage } from "../../components/ui/AvatarImage";
import { Badge } from "../../components/ui/Badge";
import { KycVerifiedBadge } from "../../components/ui/KycVerifiedBadge";
import { PrivacyModeConfirmDialog } from "../../components/ui/PrivacyModeConfirmDialog";
import { ToggleSwitch } from "../../components/ui/ToggleSwitch";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import { coreReadApi, type CoreTechnicianDetail } from "../../features/core-read/api";
import { useCoreReadQuery } from "../../features/core-read/hooks";
import type { BookingOrder, BookingScheduleSlot } from "../../features/booking/api";
import {
  technicianProfileApi,
  type TechnicianProfilePaymentMethod,
  type TechnicianProfileVisibility,
  type TechnicianSelfProfile
} from "../../features/core-read/technicianProfileApi";
import {
  pricingModeApi,
  type ShopPricingMode,
  type TechnicianServicePayload
} from "../../features/pricing-mode/api";
import { loadEveryTechnicianOrder, loadManagedScheduleWindow } from "../../features/scheduling/window-loader";
import { cn, yen } from "../../lib/utils";

type TechnicianPortalView = "tasks" | "me";
type TechnicianMeTab = "info" | "services" | "data";

const languageOptions = ["日本語", "中文", "English", "한국어", "ไทย", "Tiếng Việt", "Español"];
const paymentOptions: Array<{ value: TechnicianProfilePaymentMethod; label: string }> = [
  { value: "platform", label: "平台支付" },
  { value: "offline", label: "线下支付" },
  { value: "cash", label: "现金" },
  { value: "prepay", label: "需要预付" },
  { value: "paypay", label: "PayPay" },
  { value: "paypal", label: "PayPal" },
  { value: "wechatpay", label: "WeChat Pay" },
  { value: "alipay", label: "Alipay" }
];
const visibilityOptions: Array<{
  value: Exclude<TechnicianProfileVisibility, "public">;
  label: string;
  description: string;
}> = [
  { value: "privateAll", label: "对所有人不可见", description: "仅本人可见" },
  { value: "limited", label: "对好友可见", description: "仅好友可以看到该账号信息" },
  { value: "network", label: "对好友以及关联人可见", description: "仅好友以及关联店铺和介绍关系中的关联人可见" }
];

const surface = {
  shell: "border-[color:color-mix(in_srgb,var(--client-primary)_30%,var(--client-line))] bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--client-primary)_22%,transparent),transparent_34%),linear-gradient(145deg,color-mix(in_srgb,var(--client-surface)_90%,var(--client-bg)),color-mix(in_srgb,var(--client-bg)_94%,black))] text-[color:var(--client-text)]",
  panel: "border-[color:color-mix(in_srgb,var(--client-line)_72%,var(--client-primary)_14%)] bg-[color:color-mix(in_srgb,var(--client-elevated)_58%,var(--client-bg)_42%)]",
  metric: "border-[color:color-mix(in_srgb,var(--client-line)_70%,var(--client-primary)_16%)] bg-[color:color-mix(in_srgb,var(--client-elevated)_50%,transparent)]",
  chip: "border-[color:color-mix(in_srgb,var(--client-primary)_48%,var(--client-line))] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary-strong)]",
  muted: "text-[color:var(--client-muted)]"
};

function getFormalTechnicianProfileId(session: AuthSession | null) {
  if (
    session?.portal !== "technician" ||
    session.currentIdentity.type !== "technician" ||
    session.currentIdentity.scopeType !== "technician_profile" ||
    !session.currentIdentity.scopeId
  ) return null;
  return session.currentIdentity.scopeId;
}

function getPortalView(view: string | undefined): TechnicianPortalView {
  return view === "me" || view === "workDetail" ? "me" : "tasks";
}

function getMeTab(value: string | null): TechnicianMeTab {
  return value === "services" || value === "data" ? value : "info";
}

function parseNullableNumber(value: string) {
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function splitList(value: string) {
  return Array.from(new Set(value.split(/[,，、\n]/).map((item) => item.trim()).filter(Boolean)));
}

function profileAvatarSrc(profile: TechnicianSelfProfile) {
  if (profile.avatarUrl) return profile.avatarUrl;
  const label = (profile.displayName.trim().slice(0, 1) || "技").replace(/[<>&'\"]/g, "") || "技";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="60" fill="#dff5e8"/><text x="60" y="76" text-anchor="middle" font-size="52" font-family="sans-serif" font-weight="700" fill="#176b45">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function profileDraft(profile: TechnicianSelfProfile) {
  return {
    displayName: profile.displayName,
    avatar: profile.avatarUrl ?? "",
    age: profile.age === null ? "" : String(profile.age),
    heightCm: profile.heightCm === null ? "" : String(profile.heightCm),
    languages: [...profile.languages],
    bio: profile.bio ?? "",
    serviceAreasText: profile.serviceAreas.join("、"),
    profileTagsText: profile.profileTags.join("、"),
    canServeForeigners: profile.canServeForeigners,
    bidBudgetMinJpy: profile.bidBudgetMinJpy === null ? "" : String(profile.bidBudgetMinJpy),
    bidBudgetMaxJpy: profile.bidBudgetMaxJpy === null ? "" : String(profile.bidBudgetMaxJpy),
    paymentMethods: [...profile.paymentMethods]
  };
}

function ProfileAvatar({ profile, editing, onSelect }: {
  profile: TechnicianSelfProfile;
  editing?: boolean;
  onSelect?: () => void;
}) {
  const content = profile.avatarUrl ? (
    <AvatarImage alt={profile.displayName} className="h-full w-full rounded-[28px]" src={profile.avatarUrl} />
  ) : (
    <span className="grid h-full w-full place-items-center rounded-[28px] bg-[color:var(--client-primary-soft)] text-4xl font-black text-[color:var(--client-primary-strong)]">
      {profile.displayName.trim().slice(0, 1) || "技"}
    </span>
  );
  return (
    <div className="relative h-36 w-36 overflow-hidden rounded-[28px] border-[3px] border-[color:color-mix(in_srgb,var(--client-primary)_48%,var(--client-line))] shadow-[0_18px_36px_rgba(0,0,0,0.28)]">
      {content}
      {editing ? (
        <button aria-label="更换头像" className="absolute bottom-2 right-2 grid h-10 w-10 place-items-center rounded-full border border-white/30 bg-black/55 text-white" onClick={onSelect} type="button">
          <AppIcon className="h-4 w-4" name="edit" />
        </button>
      ) : null}
    </div>
  );
}

function ResourceState({ error, retry }: { error?: string | null; retry?: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-[color:var(--client-bg)] px-6 text-center text-[color:var(--client-text)]">
      <div>
        <h1 className="text-xl font-black">{error ? "技师资料加载失败" : "正在加载技师资料"}</h1>
        <p className="mt-2 text-sm font-semibold text-[color:var(--client-muted)]">
          {error ? error : "正在同步当前技师与所属店铺，请稍候。"}
        </p>
        {error && retry ? <button className="mt-4 rounded-full bg-[color:var(--client-primary)] px-5 py-2 text-sm font-black text-[color:var(--client-needo-text)]" onClick={retry} type="button">重新加载</button> : null}
      </div>
    </main>
  );
}

export function TechnicianPortalPage() {
  return <TechnicianPortalDataGate />;
}

function TechnicianPortalDataGate() {
  const { session } = useAuth();
  const [revision, setRevision] = useState(0);
  const formalTechnicianProfileId = getFormalTechnicianProfileId(session);
  const formalTechnicianSelfProfileQuery = useCoreReadQuery(
    () => formalTechnicianProfileId ? technicianProfileApi.getMine() : null,
    [formalTechnicianProfileId, revision]
  );
  const formalTechnicianProfileQuery = useCoreReadQuery(
    () => formalTechnicianProfileId && formalTechnicianSelfProfileQuery.data?.shopId
      ? coreReadApi.getTechnicianDetail(formalTechnicianProfileId)
      : null,
    [formalTechnicianProfileId, formalTechnicianSelfProfileQuery.data?.shopId, revision]
  );
  const technician = formalTechnicianProfileQuery.data;
  const selfProfile = formalTechnicianSelfProfileQuery.data;
  const error = formalTechnicianSelfProfileQuery.error;

  if (!formalTechnicianProfileId || !selfProfile) {
    return <ResourceState error={error} retry={() => setRevision((current) => current + 1)} />;
  }

  return <TechnicianPortalContent initialSelfProfile={selfProfile} technician={technician} />;
}

function TasksView({ profile, technician }: { profile: TechnicianSelfProfile; technician: CoreTechnicianDetail | null }) {
  const navigate = useNavigate();
  const rating = technician ? Number(technician.reviewSummary.ratingAverage || 0) : 0;
  const shopName = technician?.shop?.name ?? (profile.shopId ? "关联店铺" : "个人技师");
  const [orders, setOrders] = useState<BookingOrder[]>([]);
  const [slots, setSlots] = useState<BookingScheduleSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [tasksPanelTab, setTasksPanelTab] = useState<"schedule" | "orders">("schedule");

  useEffect(() => {
    let active = true;
    const now = new Date();
    const todayFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayTo = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const monthFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthTo = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    setLoading(true);
    setLoadError("");
    Promise.allSettled([
      loadEveryTechnicianOrder({ from: monthFrom.toISOString(), to: monthTo.toISOString() }),
      loadManagedScheduleWindow("technician", { from: todayFrom, to: todayTo })
    ]).then(([orderResult, slotResult]) => {
      if (!active) return;
      if (orderResult.status === "fulfilled") setOrders(orderResult.value);
      if (slotResult.status === "fulfilled") setSlots(slotResult.value);
      if (orderResult.status === "rejected" && slotResult.status === "rejected") {
        const reason = orderResult.reason instanceof Error ? orderResult.reason.message : "error.technician_dashboard.load_failed";
        setLoadError(reason);
      }
      setLoading(false);
    });

    return () => { active = false; };
  }, []);

  const todayKey = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const todayOrders = orders
    .filter((order) => new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(order.startsAt)) === todayKey)
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  const acceptedOrders = orders.filter((order) => ["confirmed", "inService", "completed"].includes(order.status));
  const decidedOrders = orders.filter((order) => order.status !== "pending");
  const completedRevenue = orders
    .filter((order) => order.status === "completed")
    .reduce((sum, order) => sum + (Number(order.priceAmount) || 0), 0);
  const acceptRate = decidedOrders.length > 0 ? Math.round(acceptedOrders.length / decidedOrders.length * 100) : null;
  const nextOrder = todayOrders.find((order) => order.status === "inService")
    ?? todayOrders.find((order) => order.status === "confirmed" || order.status === "pending")
    ?? todayOrders.find((order) => order.status !== "cancelled")
    ?? null;
  const nextSlot = slots
    .filter((slot) => slot.status !== "blocked")
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt))[0] ?? null;
  const nowMs = Date.now();
  const activeOrder = todayOrders.find((order) => order.status === "inService");
  const insideConfirmedOrder = todayOrders.some((order) =>
    order.status === "confirmed" && new Date(order.startsAt).getTime() <= nowMs && nowMs < new Date(order.endsAt).getTime()
  );
  const insideAvailableSlot = slots.some((slot) =>
    slot.status === "available" && new Date(slot.startsAt).getTime() <= nowMs && nowMs < new Date(slot.endsAt).getTime()
  );
  const hasRemainingWork = todayOrders.some((order) => order.status !== "cancelled" && new Date(order.endsAt).getTime() > nowMs)
    || slots.some((slot) => slot.status !== "blocked" && new Date(slot.endsAt).getTime() > nowMs);
  const currentStatus = activeOrder ? "服务中" : insideConfirmedOrder || insideAvailableSlot ? "出勤" : hasRemainingWork ? "休息" : "退勤";
  const statusButtons = [
    { label: "出勤", icon: "●", tone: "duty", caption: "已进入正式排班或可预约时段" },
    { label: "移动中", icon: "↗", tone: "travel", caption: "移动状态需要正式位置状态接口" },
    { label: "服务中", icon: "▶", tone: "service", caption: "存在进行中的正式订单" },
    { label: "休息", icon: "☾", tone: "rest", caption: "当前没有进行中的正式服务" },
    { label: "退勤", icon: "■", tone: "off", caption: "今天已没有后续正式安排" }
  ] as const;
  const currentStatusCaption = statusButtons.find((item) => item.label === currentStatus)?.caption ?? "按正式排班与订单自动同步";
  const dateTime = (value: string) => new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
  const statusTimelineEntries = orders.flatMap((order) =>
    order.statusHistory.map((history) => {
      const role = history.toStatus === "pending"
        ? "预约创建"
        : history.toStatus === "confirmed"
          ? "服务方接单"
          : history.toStatus === "inService"
            ? "开始服务"
            : history.toStatus === "completed"
              ? "结束服务"
              : "取消 / 异常";
      const reason = history.reason?.trim() ?? "";
      const isProblem = history.toStatus === "cancelled" || /迟到|异常|失败|冲突|拒绝|取消/.test(reason);
      const actorIsTechnician = history.actorUserId === profile.userId;
      const createdAt = new Date(history.createdAt);
      const atLabel = Number.isFinite(createdAt.getTime())
        ? new Intl.DateTimeFormat("zh-CN", {
            day: "numeric",
            hour: "2-digit",
            hour12: false,
            minute: "2-digit",
            month: "numeric",
            second: "2-digit",
            year: "numeric"
          }).format(createdAt)
        : history.createdAt;
      const action = history.toStatus === "pending"
        ? "已创建预约"
        : history.toStatus === "confirmed"
          ? "已确认接单"
          : history.toStatus === "inService"
            ? "已开始服务"
            : history.toStatus === "completed"
              ? "已结束服务"
              : "预约已取消";

      return {
        entry: {
          actorAvatarSrc: actorIsTechnician ? profile.avatarUrl ?? undefined : undefined,
          actorName: actorIsTechnician ? profile.displayName : "系统",
          actorRole: role,
          atLabel,
          id: `order-${order.id}-history-${history.id}`,
          message: (
            <>
              {action}：订单
              <Link
                className="font-black text-[color:var(--client-primary)] underline decoration-[color:color-mix(in_srgb,var(--client-primary)_42%,transparent)] decoration-2 underline-offset-2"
                to={`/technician/orders/${order.id}`}
              >
                {order.orderNo}
              </Link>
              ，项目 {order.serviceName}，预约时间 {dateTime(order.startsAt)}{reason ? `，${reason}` : ""}。
            </>
          ),
          preserveAtLabel: true,
          title: role,
          tone: isProblem ? "red" : "green"
        } satisfies ContactEventTimelineEntry,
        sortAt: Number.isFinite(createdAt.getTime()) ? createdAt.getTime() : 0
      };
    })
  ).sort((left, right) => right.sortAt - left.sortAt).slice(0, 24).map(({ entry }) => entry);
  const statusRecordTarget = nextOrder ?? orders[0] ?? null;

  return (
    <>
      <FloatingHomeHeader panelClassName={floatingHeaderGlassPanelClassName}>
        <div className={floatingHeaderInnerClassName}>
          <SharedHomeHeader
            avatarAlt={profile.displayName}
            avatarLabel="打开我的页面"
            avatarSrc={profileAvatarSrc(profile)}
            avatarTo="/technician/me"
            locationCaption="当前服务区域"
            locationLabel={profile.serviceAreas[0] ?? profile.city ?? "服务区域未设置"}
            locationTo="/technician/settings/service-range"
            settingsLabel="打开技师设置"
            settingsTo="/technician/settings"
          />
        </div>
      </FloatingHomeHeader>
      <div className="space-y-4 px-4 pb-28 pt-2">
        <section className="client-feature-panel overflow-hidden rounded-[28px] border text-white shadow-[var(--client-shadow)]" data-testid="technician-formal-income-dashboard">
          <div className="relative p-5">
            <div className="client-feature-aura absolute inset-0" />
            <div className="relative">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-xs font-bold text-white/60">{shopName}</p>
                    <Badge tone="green">{profile.employmentType === "independent" ? "个人技师" : "店铺所属"}</Badge>
                  </div>
                  <p className="mt-4 text-xs font-bold text-white/50">本月收入</p>
                  <p className="mt-1 text-[34px] font-black tracking-[-0.05em]">{yen(completedRevenue)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <KycVerifiedBadge size="label" />
                  <span className="max-w-[112px] truncate text-xs font-black text-white/70">{profile.displayName}</span>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-3 rounded-[20px] border border-white/10 bg-white/[0.08] py-3 backdrop-blur">
                {[
                  ["接单率", acceptRate === null ? "—" : `${acceptRate}%`],
                  ["服务评价", rating > 0 ? rating.toFixed(2) : "—"],
                  ["本月订单", `${orders.length} 单`]
                ].map(([label, value], index) => (
                  <div className={cn("min-w-0 px-2 text-center", index > 0 && "border-l border-white/10")} key={label}>
                    <p className="truncate text-[10px] font-bold text-white/50">{label}</p>
                    <strong className="mt-1.5 block truncate text-base font-black">{value}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className={cn(surface.shell, "rounded-[28px] border p-4 shadow-[var(--client-shadow)]")} data-testid="technician-formal-status-sync">
          <div className="flex items-center justify-between gap-3">
            <TitleWithInfo
              as="h2"
              info="把当前出勤状态同步给门店与调度，首页会高亮当前已同步状态。"
              label="状态同步 简介"
              title="状态同步"
              titleClassName="text-lg font-bold text-[color:var(--client-text)]"
              variant="paper"
            />
            <Link className="inline-flex h-11 items-center gap-2 rounded-full bg-[color:var(--client-primary)] px-4 text-sm font-black text-[color:var(--client-needo-text)]" to="/technician/schedule">
              <AppIcon className="h-4 w-4" name="calendar" />排班
            </Link>
          </div>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {statusButtons.map((item) => {
              const active = item.label === currentStatus;
              return (
                <div
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "technician-work-status-button flex min-h-[88px] min-w-0 flex-col items-center justify-center rounded-[20px] border px-1.5 py-3 text-center",
                    `technician-work-status--${item.tone}`,
                    active ? "technician-work-status-button--active" : "technician-work-status-button--idle"
                  )}
                  key={item.label}
                >
                  <span className="technician-work-status-icon inline-flex h-9 w-9 items-center justify-center rounded-[14px] text-base font-black">{item.icon}</span>
                  <span className="mt-2 flex min-h-[28px] w-full items-center justify-center overflow-hidden">
                    <strong className="w-full text-[12px] font-black leading-[14px] tracking-normal">{item.label}</strong>
                  </span>
                </div>
              );
            })}
          </div>
          <div className={cn(surface.panel, "mt-3 rounded-[20px] border px-4 py-3")}>
            <p className={cn(surface.muted, "text-[11px] font-bold")}>当前已同步状态</p>
            <p className="mt-1 text-sm font-black">{currentStatus}： <span className={cn(surface.muted, "text-xs")}>{currentStatusCaption}</span></p>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <TitleWithInfo
              as="h2"
              info="默认先看今天的仅排班展示，下一单会补充用户资料、地址、导航和沟通入口，也可以切回今日订单处理。"
              label="今日安排 简介"
              title="今日安排"
              titleClassName="text-lg font-bold text-[color:var(--client-text)]"
              variant="paper"
            />
          </div>
          <FeatureSegmentedTabs
            items={[{ label: "今日仅排班展示", value: "schedule" }, { label: "今日订单", value: "orders" }]}
            onChange={setTasksPanelTab}
            value={tasksPanelTab}
          />
          {tasksPanelTab === "orders" ? (
            <section className="client-feature-panel rounded-[28px] border p-4 text-white shadow-[var(--client-shadow)]">
              <FormalTechnicianOrdersPanel />
            </section>
          ) : (
            <>
              {loading ? <div className={cn(surface.shell, "rounded-[28px] border p-8 text-center text-sm font-black")}>正在同步今日正式安排</div> : null}
              {loadError ? <div className={cn(surface.shell, "rounded-[28px] border p-5 text-sm font-black text-red-500")}>今日安排读取失败：{loadError}</div> : null}
              {!loading && !loadError && nextOrder ? (
                <Link className="client-feature-panel block rounded-[28px] border p-4 text-white shadow-[var(--client-shadow)]" to={`/technician/orders/${nextOrder.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={nextOrder.status === "inService" ? "green" : "yellow"}>{nextOrder.status === "inService" ? "进行中" : "今日预约"}</Badge>
                        <Badge tone="neutral">{nextOrder.fulfillmentMode === "home" ? "上门服务" : "到店服务"}</Badge>
                      </div>
                      <h3 className="mt-3 text-lg font-black">{nextOrder.serviceName}</h3>
                      <p className="mt-2 text-xs font-bold text-white/55">开始时间：{dateTime(nextOrder.startsAt)}</p>
                      <p className="mt-1 text-xs font-bold text-white/55">预计结束：{dateTime(nextOrder.endsAt)}</p>
                    </div>
                    <div className="rounded-[18px] border border-white/10 bg-white/[0.08] px-4 py-3 text-right">
                      <p className="text-[10px] font-bold text-white/50">预估收入</p>
                      <strong className="mt-1 block text-lg font-black text-[color:var(--client-primary)]">{yen(Number(nextOrder.priceAmount) || 0)}</strong>
                    </div>
                  </div>
                  <div className="mt-4 rounded-[20px] border border-white/10 bg-black/20 px-4 py-3">
                    <p className="text-[11px] font-bold text-white/50">预约用户</p>
                    <p className="mt-1 text-sm font-black">NeeDo 用户 #{nextOrder.customerUserId}</p>
                    <p className="mt-1 text-xs font-bold text-white/50">{nextOrder.shopName} · {nextOrder.orderNo}</p>
                  </div>
                </Link>
              ) : null}
              {!loading && !loadError && !nextOrder && nextSlot ? (
                <Link className={cn(surface.shell, "block rounded-[28px] border p-5 shadow-[var(--client-shadow)]")} to={`/technician/schedule/events/${nextSlot.id}`}>
                  <Badge tone="blue">正式可预约时段</Badge>
                  <h3 className="mt-3 text-lg font-black">{nextSlot.serviceName}</h3>
                  <p className={cn(surface.muted, "mt-2 text-xs font-bold")}>{dateTime(nextSlot.startsAt)}–{dateTime(nextSlot.endsAt)}</p>
                </Link>
              ) : null}
              {!loading && !loadError && !nextOrder && !nextSlot ? (
                <div className={cn(surface.shell, "rounded-[28px] border border-dashed p-8 text-center")}>
                  <p className="text-sm font-black">当前没有今日正式安排</p>
                  <p className={cn(surface.muted, "mt-2 text-xs font-bold")}>新订单与排班变更会从服务器同步到这里。</p>
                </div>
              ) : null}
            </>
          )}
        </section>

        <ContactEventTimelinePanel
          commentAuthorAvatarSrc={profile.avatarUrl ?? undefined}
          commentAuthorName={profile.displayName}
          commentAuthorRole="补充记录"
          commentButtonLabel="补充记录"
          commentPlaceholder="记录执行经过、异常原因或后续处理..."
          emptyLabel="暂无执行 / 异常记录"
          events={statusTimelineEntries}
          layout="three-column"
          onCommentButtonClick={statusRecordTarget ? () => navigate(`/technician/orders/${statusRecordTarget.id}`) : undefined}
          showCommentComposer={Boolean(statusRecordTarget)}
          title="状态记录"
        />
      </div>
    </>
  );
}

type TechnicianProfileDraft = ReturnType<typeof profileDraft>;

function describeProfileMutationError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 400) return "请检查资料内容后重试";
    if (error.status === 401) return "登录状态已失效，请重新登录技师账号后再操作";
    if (error.status === 403) return "当前技师身份没有资料编辑权限";
    if (error.status === 409) return "资料已在其他位置更新，请重新加载后再保存";
  }
  if (error instanceof Error && !error.message.startsWith("error.")) return error.message;
  return "暂时无法保存，请稍后重试";
}

function TechnicianInfoCard({ profile, onSaved }: {
  profile: TechnicianSelfProfile;
  onSaved: (profile: TechnicianSelfProfile) => void;
}) {
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TechnicianProfileDraft>(() => profileDraft(profile));
  const [privacyMenuOpen, setPrivacyMenuOpen] = useState(false);
  const [privacyConfirmOpen, setPrivacyConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setDraft(profileDraft(profile)), [profile]);
  const mutate = async (input: Parameters<typeof technicianProfileApi.updateMine>[0]) => {
    if (saving) return null;
    setSaving(true);
    setError("");
    try {
      const saved = await technicianProfileApi.updateMine(input);
      onSaved(saved);
      setDraft(profileDraft(saved));
      return saved;
    } catch (mutationError) {
      setError(describeProfileMutationError(mutationError));
      return null;
    } finally {
      setSaving(false);
    }
  };
  const saveProfile = async () => {
    const saved = await mutate({
      displayName: draft.displayName.trim() || profile.displayName,
      ...(draft.avatar.startsWith("data:image/") ? { avatarDataUrl: draft.avatar } : {}),
      age: parseNullableNumber(draft.age),
      heightCm: parseNullableNumber(draft.heightCm),
      languages: draft.languages,
      bio: draft.bio.trim() || null,
      serviceAreas: splitList(draft.serviceAreasText),
      profileTags: splitList(draft.profileTagsText),
      canServeForeigners: draft.canServeForeigners,
      bidBudgetMinJpy: parseNullableNumber(draft.bidBudgetMinJpy),
      bidBudgetMaxJpy: parseNullableNumber(draft.bidBudgetMaxJpy),
      paymentMethods: draft.paymentMethods
    });
    if (saved) setEditing(false);
  };
  const persistVisibility = async (visibility: TechnicianProfileVisibility, openMenu = false) => {
    const saved = await mutate({ visibility });
    if (saved) setPrivacyMenuOpen(openMenu && saved.visibility !== "public");
  };
  const handleAvatarUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setDraft((current) => ({ ...current, avatar: reader.result as string }));
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };
  const toggleLanguage = (language: string) => setDraft((current) => ({
    ...current,
    languages: current.languages.includes(language) ? current.languages.filter((item) => item !== language) : [...current.languages, language]
  }));
  const togglePaymentMethod = (method: TechnicianProfilePaymentMethod) => setDraft((current) => ({
    ...current,
    paymentMethods: current.paymentMethods.includes(method) ? current.paymentMethods.filter((item) => item !== method) : [...current.paymentMethods, method]
  }));
  const privacyEnabled = profile.visibility !== "public";
  const visibilityLabel = profile.visibility === "public" ? "公开可见" : visibilityOptions.find((item) => item.value === profile.visibility)?.label ?? "隐私模式";
  const displayedProfile = { ...profile, avatarUrl: editing && draft.avatar ? draft.avatar : profile.avatarUrl };

  return (
    <section className={cn(surface.shell, "relative z-30 overflow-visible rounded-[28px] border p-4 shadow-[var(--client-shadow)]")} data-testid="technician-info-card">
      <input accept="image/*" className="hidden" onChange={handleAvatarUpload} ref={avatarInputRef} type="file" />
      <IconButton className={cn(surface.metric, "absolute right-4 top-4 z-10")} icon={editing ? "close" : "edit"} label={editing ? "取消编辑" : "编辑信息卡"} onClick={() => { setEditing((current) => !current); setDraft(profileDraft(profile)); setError(""); }} />
      <div className="flex min-w-0 items-start gap-3 pr-12">
        <ProfileAvatar editing={editing} onSelect={() => avatarInputRef.current?.click()} profile={displayedProfile} />
        <div className="flex min-h-36 min-w-0 flex-1 flex-col">
          {editing ? (
            <input className="w-full bg-transparent text-[21px] font-black outline-none" onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))} value={draft.displayName} />
          ) : (
            <h2 className="truncate text-[21px] font-black">{profile.displayName} <KycVerifiedBadge className="inline-flex align-middle" size="label" /></h2>
          )}
          <Badge className="mt-2 w-fit" tone="green">{profile.employmentType === "independent" ? "个人技师" : "店铺所属"}</Badge>
          <p className={cn(surface.muted, "mt-1 truncate text-xs font-bold")}>ID：{profile.publicId}</p>
          <div className={cn(surface.panel, "relative mt-auto rounded-[18px] border p-3")} data-testid="technician-profile-privacy-control">
            <div className="flex items-center justify-between gap-3">
              <button aria-expanded={privacyMenuOpen} className="min-w-0 flex-1 text-left" disabled={!privacyEnabled || saving} onClick={() => setPrivacyMenuOpen((current) => !current)} type="button"><p className={cn(surface.muted, "text-[11px] font-bold")}>隐私模式</p><strong className="mt-1 block truncate text-sm">{visibilityLabel}</strong></button>
              <ToggleSwitch ariaLabel="开启隐私模式" checked={privacyEnabled} disabled={saving} onChange={(enabled) => enabled ? setPrivacyConfirmOpen(true) : void persistVisibility("public")} size="md" />
            </div>
            <PrivacyModeConfirmDialog onCancel={() => setPrivacyConfirmOpen(false)} onConfirm={() => { setPrivacyConfirmOpen(false); void persistVisibility("privateAll", true); }} open={privacyConfirmOpen} />
            {privacyEnabled && privacyMenuOpen ? (
              <div className={cn(surface.shell, "absolute right-0 top-[calc(100%+8px)] z-[90] grid w-[min(320px,calc(100vw-48px))] gap-2 rounded-[20px] border p-2 shadow-[0_22px_48px_rgba(0,0,0,0.34)]")} data-testid="technician-privacy-options">
                {visibilityOptions.map((option) => <button className={cn(profile.visibility === option.value ? surface.chip : surface.panel, "rounded-[16px] border px-3 py-3 text-left")} disabled={saving} key={option.value} onClick={() => void persistVisibility(option.value)} type="button"><strong className="block text-sm">{option.label}</strong><span className={cn(surface.muted, "mt-1 block text-[11px]")}>{option.description}</span></button>)}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className={cn(surface.metric, "rounded-[18px] border p-3")}><p className={cn(surface.muted, "text-xs font-bold")}>从业年限</p><strong className="mt-1 block text-xl">{profile.yearsExperience} 年</strong></div>
        <div className={cn(surface.metric, "rounded-[18px] border p-3")}><p className={cn(surface.muted, "text-xs font-bold")}>服务城市</p><strong className="mt-1 block truncate text-xl">{profile.city}</strong></div>
      </div>

      <div className="my-4 h-px bg-[color:var(--client-line)]" />
      <h2 className="text-lg font-black">基础信息</h2>
      {editing ? (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className={cn(surface.panel, "rounded-[18px] border p-3 text-xs font-bold")}><span className={surface.muted}>年龄</span><input className="mt-1 w-full bg-transparent text-sm font-black outline-none" inputMode="numeric" onChange={(event) => setDraft((current) => ({ ...current, age: event.target.value }))} value={draft.age} /></label>
            <label className={cn(surface.panel, "rounded-[18px] border p-3 text-xs font-bold")}><span className={surface.muted}>身高（cm）</span><input className="mt-1 w-full bg-transparent text-sm font-black outline-none" inputMode="decimal" onChange={(event) => setDraft((current) => ({ ...current, heightCm: event.target.value }))} value={draft.heightCm} /></label>
          </div>
          <div className={cn(surface.panel, "rounded-[18px] border p-3")}><p className={cn(surface.muted, "text-xs font-bold")}>语言能力</p><div className="mt-2 flex flex-wrap gap-1.5">{languageOptions.map((language) => <button className={cn(draft.languages.includes(language) ? surface.chip : surface.metric, "rounded-full border px-2.5 py-1 text-xs font-black")} key={language} onClick={() => toggleLanguage(language)} type="button">{language}</button>)}</div></div>
          <label className={cn(surface.panel, "block rounded-[18px] border p-3")}><span className={cn(surface.muted, "text-xs font-bold")}>服务范围</span><textarea className="mt-2 min-h-16 w-full bg-transparent text-sm font-bold outline-none" onChange={(event) => setDraft((current) => ({ ...current, serviceAreasText: event.target.value }))} value={draft.serviceAreasText} /></label>
          <label className={cn(surface.panel, "block rounded-[18px] border p-3")}><span className={cn(surface.muted, "text-xs font-bold")}>标签</span><textarea className="mt-2 min-h-16 w-full bg-transparent text-sm font-bold outline-none" onChange={(event) => setDraft((current) => ({ ...current, profileTagsText: event.target.value }))} value={draft.profileTagsText} /></label>
          <label className={cn(surface.panel, "block rounded-[18px] border p-3")}><span className={cn(surface.muted, "text-xs font-bold")}>自我介绍</span><textarea className="mt-2 min-h-28 w-full bg-transparent text-sm font-bold leading-6 outline-none" onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))} value={draft.bio} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className={cn(surface.panel, "rounded-[18px] border p-3 text-xs font-bold")}><span className={surface.muted}>接单预算下限</span><input className="mt-1 w-full bg-transparent text-sm font-black outline-none" inputMode="numeric" onChange={(event) => setDraft((current) => ({ ...current, bidBudgetMinJpy: event.target.value }))} value={draft.bidBudgetMinJpy} /></label>
            <label className={cn(surface.panel, "rounded-[18px] border p-3 text-xs font-bold")}><span className={surface.muted}>接单预算上限</span><input className="mt-1 w-full bg-transparent text-sm font-black outline-none" inputMode="numeric" onChange={(event) => setDraft((current) => ({ ...current, bidBudgetMaxJpy: event.target.value }))} value={draft.bidBudgetMaxJpy} /></label>
          </div>
          <div className={cn(surface.panel, "rounded-[18px] border p-3")}><p className={cn(surface.muted, "text-xs font-bold")}>支持支付方式</p><div className="mt-2 flex flex-wrap gap-1.5">{paymentOptions.map((method) => <button className={cn(draft.paymentMethods.includes(method.value) ? surface.chip : surface.metric, "rounded-full border px-2.5 py-1 text-xs font-black")} key={method.value} onClick={() => togglePaymentMethod(method.value)} type="button">{method.label}</button>)}</div></div>
          <label className={cn(surface.panel, "flex items-center justify-between rounded-[18px] border p-3 text-sm font-black")}><span>服务外国人</span><ToggleSwitch ariaLabel="服务外国人" checked={draft.canServeForeigners} onChange={(checked) => setDraft((current) => ({ ...current, canServeForeigners: checked }))} /></label>
          {error ? <p className="text-xs font-bold text-red-500" role="alert">技师资料保存失败：{error}</p> : null}
          <button className={cn(surface.chip, "w-full rounded-[18px] border px-4 py-3 text-sm font-black")} disabled={saving} onClick={() => void saveProfile()} type="button">{saving ? "保存中…" : "保存"}</button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className={cn(surface.panel, "rounded-[18px] border p-3")}><p className={cn(surface.muted, "text-xs font-bold")}>年龄 / 身高</p><strong className="mt-1 block text-sm">{profile.age ?? "未设置"} / {profile.heightCm ? `${profile.heightCm}cm` : "未设置"}</strong></div>
            <div className={cn(surface.panel, "rounded-[18px] border p-3")}><p className={cn(surface.muted, "text-xs font-bold")}>接待范围</p><strong className="mt-1 block text-sm">{profile.canServeForeigners ? "服务外国人" : "不服务外国人"}</strong></div>
          </div>
          <div className={cn(surface.panel, "rounded-[18px] border p-3")}><p className={cn(surface.muted, "text-xs font-bold")}>语言能力</p><div className="mt-2 flex flex-wrap gap-1.5">{profile.languages.map((language) => <span className={cn(surface.chip, "rounded-full border px-2.5 py-1 text-xs font-black")} key={language}>{language}</span>)}</div></div>
          <div className={cn(surface.panel, "rounded-[18px] border p-3")}><p className={cn(surface.muted, "text-xs font-bold")}>服务范围</p><p className="mt-2 text-sm font-bold leading-6">{profile.serviceAreas.join("、") || "未设置"}</p></div>
          <div className={cn(surface.panel, "rounded-[18px] border p-3")}><p className={cn(surface.muted, "text-xs font-bold")}>接单预算</p><strong className="mt-1 block text-sm">{profile.bidBudgetMinJpy === null && profile.bidBudgetMaxJpy === null ? "未设置" : `${profile.bidBudgetMinJpy?.toLocaleString("ja-JP") ?? "—"}–${profile.bidBudgetMaxJpy?.toLocaleString("ja-JP") ?? "—"} 円`}</strong></div>
          <div className={cn(surface.panel, "rounded-[18px] border p-3")}><p className={cn(surface.muted, "text-xs font-bold")}>支持支付方式</p><p className="mt-2 text-sm font-bold leading-6">{profile.paymentMethods.map((value) => paymentOptions.find((item) => item.value === value)?.label ?? value).join("、") || "未设置"}</p></div>
          <div className={cn(surface.panel, "rounded-[18px] border p-3")}><p className={cn(surface.muted, "text-xs font-bold")}>自我介绍</p><p className="mt-2 text-sm font-bold leading-6">{profile.bio || "未设置"}</p></div>
          <div className={cn(surface.panel, "rounded-[18px] border p-3")} data-testid="technician-info-tags"><p className={cn(surface.muted, "text-xs font-bold")}>标签</p><div className="mt-2 flex flex-wrap gap-1.5">{profile.profileTags.map((tag) => <span className={cn(surface.chip, "rounded-full border px-2.5 py-1 text-xs font-black")} key={tag}>{tag}</span>)}</div></div>
          {error ? <p className="text-xs font-bold text-red-500" role="alert">技师资料保存失败：{error}</p> : null}
        </div>
      )}
    </section>
  );
}

function describeServiceError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return "登录状态已失效，请重新登录技师账号后再操作";
    if (error.status === 403) return "当前技师身份没有服务编辑权限";
    if (error.status === 409) return "服务状态已经变化，请重新加载";
  }
  return error instanceof Error ? error.message : "error.technician_service.failed";
}

function FormalTechnicianServicesPanel({ shopId, defaultCategoryId }: { shopId: number; defaultCategoryId: number | null }) {
  const [services, setServices] = useState<TechnicianServicePayload[]>([]);
  const [pricingMode, setPricingMode] = useState<ShopPricingMode | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [deleteArmedId, setDeleteArmedId] = useState<number | null>(null);
  const [draft, setDraft] = useState({ name: "", priceAmount: "", durationMinutes: "60", description: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [serviceResult, modeResult] = await Promise.all([
        pricingModeApi.listTechnicianServices(shopId, { page: 1, pageSize: 100 }),
        pricingModeApi.getShopPricingMode(shopId)
      ]);
      setServices(serviceResult.list);
      setPricingMode(modeResult.pricingMode);
    } catch (loadError) {
      setServices([]);
      setPricingMode(null);
      setError(describeServiceError(loadError));
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => { void load(); }, [load]);
  const openEditor = (service?: TechnicianServicePayload) => {
    setEditingId(service?.id ?? "new");
    setDeleteArmedId(null);
    setError("");
    setDraft(service ? { name: service.name, priceAmount: String(service.priceAmount), durationMinutes: String(service.durationMinutes), description: service.description ?? "" } : { name: "", priceAmount: "", durationMinutes: "60", description: "" });
  };
  const save = async () => {
    if (saving || editingId === null) return;
    const priceAmount = Number(draft.priceAmount);
    const durationMinutes = Number(draft.durationMinutes);
    if (!draft.name.trim() || !Number.isInteger(priceAmount) || priceAmount < 0 || !Number.isInteger(durationMinutes) || durationMinutes < 1) {
      setError("请填写有效的服务名称、价格和时长");
      return;
    }
    const existing = typeof editingId === "number" ? services.find((item) => item.id === editingId) : null;
    const categoryId = existing?.categoryId ?? defaultCategoryId;
    if (!categoryId) { setError("当前没有可用的正式服务分类，暂时无法新增服务"); return; }
    setSaving(true);
    setError("");
    try {
      const body = { name: draft.name.trim(), priceAmount, durationMinutes, description: draft.description.trim() || null, categoryId, currency: "JPY" };
      const saved = existing ? await pricingModeApi.updateTechnicianService(shopId, existing.id, body) : await pricingModeApi.createTechnicianService(shopId, { ...body, sortOrder: services.length });
      setServices((current) => existing ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved]);
      setEditingId(null);
    } catch (saveError) {
      setError(describeServiceError(saveError));
    } finally {
      setSaving(false);
    }
  };
  const remove = async (service: TechnicianServicePayload) => {
    if (saving) return;
    if (deleteArmedId !== service.id) { setDeleteArmedId(service.id); return; }
    setSaving(true);
    setError("");
    try {
      await pricingModeApi.deleteTechnicianService(shopId, service.id);
      setServices((current) => current.filter((item) => item.id !== service.id));
      setEditingId(null);
      setDeleteArmedId(null);
    } catch (deleteError) {
      setError(describeServiceError(deleteError));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <section className={cn(surface.shell, "rounded-[28px] border p-6 text-center text-sm font-black")}>正在加载正式服务</section>;
  return (
    <section className={cn(surface.shell, "rounded-[28px] border p-4 shadow-[var(--client-shadow)]")}>
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-lg font-black">服务信息</h2><p className={cn(surface.muted, "mt-1 text-xs font-bold")}>店铺当前定价模式：{pricingMode === "technician" ? "技师定价" : pricingMode === "merchant" ? "店铺定价" : "未读取"}</p></div>
        {services.length < 5 ? <button className={cn(surface.chip, "rounded-full border px-3 py-2 text-xs font-black")} disabled={saving || editingId !== null} onClick={() => openEditor()} type="button">添加服务 {services.length}/5</button> : null}
      </div>
      {error ? <p className="mt-3 text-xs font-bold text-red-500" role="alert">{error}</p> : null}
      <div className="mt-4 space-y-3">
        {services.length === 0 && editingId !== "new" ? <div className={cn(surface.panel, "rounded-[20px] border px-4 py-7 text-center text-sm font-bold")}>当前没有已保存的正式技师服务</div> : null}
        {[...services, ...(editingId === "new" ? [null] : [])].map((service) => {
          const editing = editingId === (service?.id ?? "new");
          return (
            <article className={cn(surface.panel, "relative rounded-[22px] border p-4")} data-testid="technician-service-card" key={service?.id ?? "new"}>
              {editing ? (
                <div className="space-y-3">
                  <label className="block text-xs font-bold"><span className={surface.muted}>服务名称</span><input className={cn(surface.metric, "mt-1 h-10 w-full rounded-[14px] border px-3 text-sm font-black outline-none")} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} value={draft.name} /></label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-xs font-bold"><span className={surface.muted}>价格</span><input className={cn(surface.metric, "mt-1 h-10 w-full rounded-[14px] border px-3 text-sm font-black outline-none")} inputMode="numeric" onChange={(event) => setDraft((current) => ({ ...current, priceAmount: event.target.value }))} value={draft.priceAmount} /></label>
                    <label className="block text-xs font-bold"><span className={surface.muted}>时长（分钟）</span><input className={cn(surface.metric, "mt-1 h-10 w-full rounded-[14px] border px-3 text-sm font-black outline-none")} inputMode="numeric" onChange={(event) => setDraft((current) => ({ ...current, durationMinutes: event.target.value }))} value={draft.durationMinutes} /></label>
                  </div>
                  <label className="block text-xs font-bold"><span className={surface.muted}>描述</span><textarea className={cn(surface.metric, "mt-1 min-h-20 w-full rounded-[14px] border px-3 py-2 text-sm font-bold outline-none")} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} value={draft.description} /></label>
                  <div className="grid grid-cols-2 gap-2"><button className={cn(surface.metric, "rounded-[16px] border px-3 py-2.5 text-sm font-black")} disabled={saving} onClick={() => { setEditingId(null); setDeleteArmedId(null); }} type="button">取消</button><button className={cn(surface.chip, "rounded-[16px] border px-3 py-2.5 text-sm font-black")} disabled={saving} onClick={() => void save()} type="button">{saving ? "保存中…" : "保存"}</button></div>
                  {service ? <button className="w-full rounded-[16px] border border-red-500/40 px-3 py-2.5 text-sm font-black text-red-500" disabled={saving} onClick={() => void remove(service)} type="button">{deleteArmedId === service.id ? "再次点击确认删除" : "删除该服务"}</button> : null}
                </div>
              ) : service ? (
                <>
                  <IconButton className={cn(surface.metric, "absolute right-3 top-3 h-9 w-9")} icon="edit" label="编辑服务" onClick={() => openEditor(service)} />
                  <div className="pr-12"><p className={cn(surface.muted, "text-[11px] font-bold")}>服务名称</p><h3 className="mt-1 text-[17px] font-black">{service.name}</h3></div>
                  <div className="mt-3 grid grid-cols-2 gap-2"><div className={cn(surface.metric, "rounded-[16px] border p-3")}><p className={cn(surface.muted, "text-[11px] font-bold")}>价格</p><strong className="mt-1 block">{yen(service.priceAmount)}</strong></div><div className={cn(surface.metric, "rounded-[16px] border p-3")}><p className={cn(surface.muted, "text-[11px] font-bold")}>时长</p><strong className="mt-1 block">{service.durationMinutes} 分钟</strong></div></div>
                  <p className={cn(surface.muted, "mt-3 text-sm font-bold leading-6")}>{service.description || "未填写描述"}</p>
                </>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function TechnicianShopRequiredPanel() {
  return (
    <section className={cn(surface.shell, "rounded-[28px] border p-6 text-center shadow-[var(--client-shadow)]")}>
      <h2 className="text-lg font-black">暂未关联店铺</h2>
      <p className={cn(surface.muted, "mt-2 text-sm font-bold leading-6")}>关联店铺后即可管理正式服务；当前不会创建演示服务或临时数据。</p>
    </section>
  );
}

function DataCenter({ profile, technician }: { profile: TechnicianSelfProfile; technician: CoreTechnicianDetail | null }) {
  const rating = technician ? Number(technician.reviewSummary.ratingAverage || 0) : 0;
  const reviewCount = technician ? String(technician.reviewSummary.reviewCount) : "—";
  return (
    <div className="space-y-4">
      <section className={cn(surface.shell, "rounded-[28px] border p-4 shadow-[var(--client-shadow)]")}>
        <p className={cn(surface.muted, "text-xs font-black")}>服务数据</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[["服务评分", rating > 0 ? rating.toFixed(1) : "—"], ["评价数量", reviewCount], ["从业年限", `${profile.yearsExperience} 年`], ["资料更新时间", new Date(profile.updatedAt).toLocaleDateString("zh-CN")]].map(([label, value]) => <div className={cn(surface.metric, "rounded-[18px] border p-3")} key={label}><p className={cn(surface.muted, "text-xs font-bold")}>{label}</p><strong className="mt-1 block text-xl">{value}</strong></div>)}
        </div>
      </section>
      <section className={cn(surface.panel, "rounded-[24px] border p-4 text-sm font-bold leading-6 text-[color:var(--client-muted)]")}>收入、工时与履约趋势仅在正式统计接口返回真实聚合数据后展示；当前页面不会生成演示统计。</section>
    </div>
  );
}

function TechnicianPortalContent({ initialSelfProfile, technician }: {
  initialSelfProfile: TechnicianSelfProfile;
  technician: CoreTechnicianDetail | null;
}) {
  const { view } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selfProfile, setSelfProfile] = useState(initialSelfProfile);
  const activeView = getPortalView(view);
  const meTab = getMeTab(searchParams.get("meTab"));
  const shopId = technician?.shop?.id ?? selfProfile.shopId;
  const technicianPortalConfig = roleBasedTabConfig.technician;
  const updateMeTab = (tab: TechnicianMeTab) => {
    const next = new URLSearchParams(searchParams);
    next.set("meTab", tab);
    setSearchParams(next, { replace: true });
  };
  const defaultCategoryId = technician?.services[0]?.category.id ?? null;

  return (
    <MobileShell navItems={technicianNavItems} navPanelStyle={activeView === "me" ? "plain" : "default"}>
      {activeView === "tasks" ? <TasksView profile={selfProfile} technician={technician} /> : null}
      {activeView === "me" ? (
        <>
          <FloatingHomeHeader panelClassName="relative overflow-hidden" stacked>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {selfProfile.avatarUrl ? <AvatarImage alt={selfProfile.displayName} className="h-12 w-12" src={selfProfile.avatarUrl} /> : <span className="grid h-12 w-12 place-items-center rounded-full bg-[color:var(--client-primary-soft)] text-lg font-black">{selfProfile.displayName.slice(0, 1)}</span>}
                <div className="min-w-0"><h1 className="truncate text-[22px] font-black tracking-[-0.04em]">{selfProfile.displayName}</h1><p className={cn(surface.muted, "mt-1 text-xs font-semibold")}>信息卡与数据中心</p></div>
              </div>
              <IconButton icon="settings" label="打开技师设置" to={technicianPortalConfig.settingsPath} />
            </div>
            <FeatureSegmentedTabs items={[{ label: "信息卡", value: "info" }, { label: "服务信息", value: "services" }, { label: "数据中心", value: "data" }]} onChange={(value) => updateMeTab(value as TechnicianMeTab)} value={meTab} variant="header" />
          </FloatingHomeHeader>
          <div className="space-y-4 px-4 pb-32 pt-1">
            {meTab === "info" ? <TechnicianInfoCard onSaved={setSelfProfile} profile={selfProfile} /> : null}
            {meTab === "services" ? shopId
              ? <FormalTechnicianServicesPanel defaultCategoryId={defaultCategoryId} shopId={shopId} />
              : <TechnicianShopRequiredPanel /> : null}
            {meTab === "data" ? <DataCenter profile={selfProfile} technician={technician} /> : null}
          </div>
        </>
      ) : null}
    </MobileShell>
  );
}
