import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ApiClientError } from "../../api/httpClient";
import { useAuth, type AuthSession } from "../../auth/AuthProvider";
import { AppIcon, FeatureSegmentedTabs, IconButton, PrimaryButton, StickyBottomBar } from "../../components/client-ui/AppScaffold";
import { FloatingHomeHeader, floatingHeaderGlassPanelClassName, floatingHeaderInnerClassName } from "../../components/mobile/FloatingHomeHeader";
import { WorkStatusControls } from "../../features/technician-work-status/WorkStatusControls";
import { WorkTimeline } from "../../features/technician-work-status/WorkTimeline";
import { MobileShell } from "../../components/mobile/MobileShell";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { SharedHomeHeader } from "../../components/mobile/SharedHomeHeader";
import { roleBasedTabConfig, technicianNavItems } from "../../components/mobile/navItems";
import { FormalTechnicianOrdersPanel } from "../../components/technician/FormalTechnicianOrdersPanel";
import { TechnicianDataCenterPanel } from "../../components/technician/TechnicianDataCenterPanel";
import { Badge } from "../../components/ui/Badge";
import { KycVerifiedBadge } from "../../components/ui/KycVerifiedBadge";
import { PrivacyModeConfirmDialog } from "../../components/ui/PrivacyModeConfirmDialog";
import { ToggleSwitch } from "../../components/ui/ToggleSwitch";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import { coreReadApi, type CoreCategory, type CoreTechnicianDetail } from "../../features/core-read/api";
import { useCoreReadQuery } from "../../features/core-read/hooks";
import type { BookingOrder, BookingScheduleSlot } from "../../features/booking/api";
import {
  technicianProfileApi,
  type TechnicianPersonalCenterUpdate,
  type TechnicianProfileVisibility,
  type TechnicianSelfProfile
} from "../../features/core-read/technicianProfileApi";
import type { TechnicianDataCenterPeriod } from "../../features/core-read/technicianDataCenterApi";
import type { TechnicianDataCenterPayload } from "../../features/core-read/technicianDataCenterApi";
import {
  pricingModeApi,
  type ShopPricingMode,
  type TechnicianServicePayload
} from "../../features/pricing-mode/api";
import { TechnicianServiceCoverField } from "../../features/pricing-mode/TechnicianServiceCoverField";
import { loadEveryTechnicianOrder, loadManagedScheduleWindow } from "../../features/scheduling/window-loader";
import { getAuthenticatedPersistentCacheScope } from "../../lib/persistentCacheScope";
import { cn, yen } from "../../lib/utils";
import { walletApi, type WalletSummary } from "../../features/wallet/api";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import {
  mapTechnicianServiceToUnifiedData as fromTechnicianServicePayload,
  UnifiedServiceInfoCard
} from "../../shared/service-card";
import {
  fromTechnicianSelfProfile,
  TechnicianProfileInfoView,
  TechnicianReviewTagSummaryView
} from "../../shared/technician-profile";

type TechnicianPortalView = "tasks" | "me";
type TechnicianMeTab = "info" | "data";

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
  return value === "data" ? value : "info";
}

function getDataCenterPeriod(value: string | null): TechnicianDataCenterPeriod {
  return value === "last30days" || value === "week" || value === "month" || value === "year" ? value : "last7days";
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
    gender: profile.gender,
    age: profile.age,
    heightCm: profile.heightCm,
    languagesText: profile.languages.join("、"),
    bio: profile.bio ?? "",
    visibility: profile.visibility
  };
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
  const persistentCacheScope = getAuthenticatedPersistentCacheScope();
  const formalTechnicianSelfProfileQuery = useCoreReadQuery(
    () => formalTechnicianProfileId ? technicianProfileApi.getMine() : null,
    [formalTechnicianProfileId, revision],
    {
      enabled: Boolean(formalTechnicianProfileId),
      force: revision > 0,
      key: "technician:self",
      scope: persistentCacheScope
    }
  );
  const formalTechnicianProfileQuery = useCoreReadQuery(
    () => formalTechnicianProfileId ? coreReadApi.getTechnicianDetail(formalTechnicianProfileId) : null,
    [formalTechnicianProfileId, revision],
    {
      enabled: Boolean(formalTechnicianProfileId),
      force: revision > 0,
      key: `core:technician:${formalTechnicianProfileId ?? "missing"}`,
      scope: persistentCacheScope
    }
  );
  const formalWalletSummaryQuery = useCoreReadQuery(
    () => formalTechnicianProfileId ? walletApi.getMyWalletSummary() : null,
    [formalTechnicianProfileId, revision],
    {
      enabled: Boolean(formalTechnicianProfileId),
      force: revision > 0,
      key: `technician:wallet-summary:${formalTechnicianProfileId ?? "missing"}`,
      scope: persistentCacheScope
    }
  );
  const technician = formalTechnicianProfileQuery.data;
  const selfProfile = formalTechnicianSelfProfileQuery.data;
  const walletSummary = formalWalletSummaryQuery.data;
  const publicDetailHidden = formalTechnicianProfileQuery.error === "error.technician.not_found";
  const error = formalTechnicianSelfProfileQuery.error
    ?? formalWalletSummaryQuery.error
    ?? (publicDetailHidden ? null : formalTechnicianProfileQuery.error);

  if (!formalTechnicianProfileId || !selfProfile || !walletSummary || (!technician && !publicDetailHidden)) {
    return <ResourceState error={error} retry={() => setRevision((current) => current + 1)} />;
  }

  return <TechnicianPortalContent initialSelfProfile={selfProfile} technician={technician} walletSummary={walletSummary} />;
}

function TasksView({ profile, technician }: { profile: TechnicianSelfProfile; technician: CoreTechnicianDetail | null }) {
  const rating = technician ? Number(technician.reviewSummary.ratingAverage || 0) : 0;
  const shopName = technician?.shop?.name ?? (profile.shopId ? "关联店铺" : "个人技师");
  const [tasksPanelTab, setTasksPanelTab] = useState<"schedule" | "orders">("schedule");
  const cacheScope = getAuthenticatedPersistentCacheScope();
  const now = new Date();
  const todayFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayTo = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const monthFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthTo = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const todayFromIso = todayFrom.toISOString();
  const todayToIso = todayTo.toISOString();
  const monthFromIso = monthFrom.toISOString();
  const monthToIso = monthTo.toISOString();
  const tasksQuery = useCoreReadQuery(
    async () => {
      const [orderResult, slotResult] = await Promise.allSettled([
        loadEveryTechnicianOrder({ from: monthFromIso, to: monthToIso }),
        loadManagedScheduleWindow("technician", {
          from: new Date(todayFromIso),
          to: new Date(todayToIso)
        })
      ]);
      if (orderResult.status === "rejected" && slotResult.status === "rejected") {
        throw orderResult.reason instanceof Error
          ? orderResult.reason
          : new Error("error.technician_dashboard.load_failed");
      }
      return {
        orders: orderResult.status === "fulfilled" ? orderResult.value : [],
        slots: slotResult.status === "fulfilled" ? slotResult.value : []
      };
    },
    [profile.id, todayFromIso, todayToIso, monthFromIso, monthToIso],
    {
      key: `technician:tasks:${profile.id}:${todayFromIso}`,
      scope: cacheScope
    }
  );
  const orders: BookingOrder[] = tasksQuery.data?.orders ?? [];
  const slots: BookingScheduleSlot[] = tasksQuery.data?.slots ?? [];
  const loading = tasksQuery.loading;
  const loadError = tasksQuery.error ?? "";
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
  const dateTime = (value: string) => new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
  const [statusRevision, setStatusRevision] = useState(0);

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

        <WorkStatusControls
          disabled={profile.shopAccessStatus === "requires_shop"}
          serviceOrderId={(todayOrders.find(order => order.status === "inService") ?? todayOrders.find(order => order.status === "confirmed"))?.id}
          onChooseService={() => setTasksPanelTab("orders")}
          shopId={profile.shopId}
          onChanged={() => setStatusRevision(value => value + 1)}
        />

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

        <WorkTimeline target={{ scope: "technician" }} revision={statusRevision} />
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

function TechnicianInfoCard({ defaultCategoryId, defaultShopId, profile, technician, walletSummary, onSaved }: {
  defaultCategoryId: number | null;
  defaultShopId: number | null;
  profile: TechnicianSelfProfile;
  technician: CoreTechnicianDetail | null;
  walletSummary: WalletSummary;
  onSaved: (profile: TechnicianSelfProfile) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TechnicianProfileDraft>(() => profileDraft(profile));
  const [privacyConfirmOpen, setPrivacyConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setDraft(profileDraft(profile)), [profile]);
  const saveProfile = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const input: TechnicianPersonalCenterUpdate = {
        gender: draft.gender,
        age: draft.age,
        heightCm: draft.heightCm,
        languages: splitList(draft.languagesText),
        bio: draft.bio || null,
        visibility: draft.visibility
      };
      const saved = await technicianProfileApi.updateMine(input);
      onSaved(saved);
      setDraft(profileDraft(saved));
      if (saved) setEditing(false);
    } catch (mutationError) {
      setError(describeProfileMutationError(mutationError));
    } finally {
      setSaving(false);
    }
  };
  const cancelEditing = () => {
    if (saving) return;
    setEditing(false);
    setDraft(profileDraft(profile));
    setPrivacyConfirmOpen(false);
    setError("");
  };
  const privacyEnabled = draft.visibility !== "public";
  const visibilityLabel = profile.visibility === "public"
    ? "公开可见"
    : visibilityOptions.find((item) => item.value === profile.visibility)?.label ?? "隐私模式";
  const readOnlyPrivacy = (
    <section className={cn(surface.panel, "rounded-[18px] border p-3")} data-testid="technician-profile-privacy-control">
      <div className="flex items-center justify-between gap-3">
        <div><p className={cn(surface.muted, "text-xs font-bold")}>隐私模式</p><strong className="mt-1 block text-sm">{visibilityLabel}</strong></div>
        <ToggleSwitch ariaLabel="开启隐私模式" checked={profile.visibility !== "public"} disabled onChange={() => undefined} size="md" />
      </div>
    </section>
  );
  const editModel = fromTechnicianSelfProfile(profile, technician, []);

  return (
    <div className="relative z-30 space-y-4" data-testid="technician-info-card">
      <IconButton
        className={cn(
          "absolute right-4 top-4 z-50 shadow-[0_14px_30px_rgba(0,0,0,0.22)]",
          editing ? "border-red-400 bg-red-500 text-white hover:bg-red-600" : surface.metric,
          saving ? "cursor-not-allowed opacity-60" : undefined
        )}
        icon={editing ? "close" : "edit"}
        label={editing ? "取消编辑" : "编辑信息卡"}
        onClick={saving ? undefined : editing ? cancelEditing : () => { setEditing(true); setDraft(profileDraft(profile)); setError(""); }}
      />
      {editing ? (
        <section className={cn(surface.shell, "overflow-visible rounded-[28px] border p-4 shadow-[var(--client-shadow)]")}>
          <div className="pr-14">
            <h2 className="text-xl font-black">编辑基础信息</h2>
            <p className={cn(surface.muted, "mt-1 text-xs font-bold")}>评价标签由正式订单评价生成，不可自行修改。</p>
          </div>
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <label className={cn(surface.panel, "rounded-[18px] border p-3 text-xs font-bold")}><span className={surface.muted}>性别</span><select className="mt-1 w-full bg-transparent text-sm font-black outline-none" onChange={(event) => setDraft((current) => ({ ...current, gender: event.target.value as TechnicianSelfProfile["gender"] }))} value={draft.gender}><option value="female">女性</option><option value="male">男性</option><option value="private">不公开</option></select></label>
              <label className={cn(surface.panel, "rounded-[18px] border p-3 text-xs font-bold")}><span className={surface.muted}>年龄</span><input className="mt-1 w-full bg-transparent text-sm font-black outline-none" inputMode="numeric" onChange={(event) => setDraft((current) => ({ ...current, age: parseNullableNumber(event.target.value) }))} value={draft.age ?? ""} /></label>
              <label className={cn(surface.panel, "rounded-[18px] border p-3 text-xs font-bold")}><span className={surface.muted}>身高</span><input className="mt-1 w-full bg-transparent text-sm font-black outline-none" inputMode="numeric" onChange={(event) => setDraft((current) => ({ ...current, heightCm: parseNullableNumber(event.target.value) }))} value={draft.heightCm ?? ""} /></label>
            </div>
            <label className={cn(surface.panel, "block rounded-[18px] border p-3")}><span className={cn(surface.muted, "text-xs font-bold")}>语言能力</span><textarea className="mt-2 min-h-16 w-full bg-transparent text-sm font-bold outline-none" onChange={(event) => setDraft((current) => ({ ...current, languagesText: event.target.value }))} value={draft.languagesText} /></label>
            <label className={cn(surface.panel, "block rounded-[18px] border p-3")}><span className={cn(surface.muted, "text-xs font-bold")}>自我介绍</span><textarea className="mt-2 min-h-28 w-full bg-transparent text-sm font-bold leading-6 outline-none" onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))} value={draft.bio} /></label>
            <TechnicianReviewTagSummaryView model={editModel} />
            <section className={cn(surface.panel, "rounded-[18px] border p-3")} data-testid="technician-profile-privacy-control">
              <div className="flex items-center justify-between gap-3">
                <div><p className={cn(surface.muted, "text-xs font-bold")}>隐私模式</p><strong className="mt-1 block text-sm">{draft.visibility === "public" ? "公开可见" : visibilityOptions.find((item) => item.value === draft.visibility)?.label}</strong></div>
                <ToggleSwitch ariaLabel="开启隐私模式" checked={privacyEnabled} disabled={saving} onChange={(enabled) => enabled ? setPrivacyConfirmOpen(true) : setDraft((current) => ({ ...current, visibility: "public" }))} size="md" />
              </div>
              <PrivacyModeConfirmDialog onCancel={() => setPrivacyConfirmOpen(false)} onConfirm={() => { setPrivacyConfirmOpen(false); setDraft((current) => ({ ...current, visibility: "privateAll" })); }} open={privacyConfirmOpen} />
              {privacyEnabled ? <div className="mt-3 grid gap-2" data-testid="technician-privacy-options">{visibilityOptions.map((option) => <button className={cn(draft.visibility === option.value ? surface.chip : surface.metric, "rounded-[16px] border px-3 py-3 text-left")} disabled={saving} key={option.value} onClick={() => setDraft((current) => ({ ...current, visibility: option.value }))} type="button"><strong className="block text-sm">{option.label}</strong><span className={cn(surface.muted, "mt-1 block text-[11px]")}>{option.description}</span></button>)}</div> : null}
            </section>
            {error ? <p className="text-xs font-bold text-red-500" role="alert">技师资料保存失败：{error}</p> : null}
          </div>
        </section>
      ) : null}
      <div id="technician-service-information">
        <FormalTechnicianServicesPanel
          defaultCategoryId={defaultCategoryId}
          defaultShopId={defaultShopId}
          privacySlot={editing ? undefined : readOnlyPrivacy}
          profile={editing ? undefined : profile}
          technician={technician}
          walletSummary={walletSummary}
        />
      </div>
      {editing ? (
        <StickyBottomBar>
          <button className="w-full rounded-[22px] bg-[color:var(--client-primary)] px-5 py-4 text-sm font-black text-[color:var(--client-primary-contrast)] disabled:opacity-60" data-testid="technician-profile-save-action" disabled={saving} onClick={() => void saveProfile()} type="button">
            {saving ? "正在保存资料" : "保存并退出编辑模式"}
          </button>
        </StickyBottomBar>
      ) : null}
    </div>
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

function upsertTechnicianService(
  current: TechnicianServicePayload[],
  saved: TechnicianServicePayload
) {
  const existingIndex = current.findIndex((service) => service.id === saved.id);
  if (existingIndex < 0) return [...current, saved];
  return current.map((service) => service.id === saved.id ? saved : service);
}
export function FormalTechnicianServicesPanel({ defaultShopId, defaultCategoryId, privacySlot, profile, technician = null, walletSummary = null }: {
  defaultShopId: number | null;
  defaultCategoryId: number | null;
  privacySlot?: ReactNode;
  profile?: TechnicianSelfProfile;
  technician?: CoreTechnicianDetail | null;
  walletSummary?: WalletSummary | null;
}) {
  const [services, setServices] = useState<TechnicianServicePayload[]>([]);
  const [categories, setCategories] = useState<CoreCategory[]>([]);
  const [pricingMode, setPricingMode] = useState<ShopPricingMode | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [deleteArmedId, setDeleteArmedId] = useState<number | null>(null);
  const [draft, setDraft] = useState({ name: "", priceAmount: "", durationMinutes: "60", description: "", categoryId: defaultCategoryId ?? 0 });
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [removeCover, setRemoveCover] = useState(false);
  const [persistedAfterPartialSave, setPersistedAfterPartialSave] = useState<TechnicianServicePayload | null>(null);
  const pendingCoverOperation: "upload" | "remove" | "none" = coverFile
    ? "upload"
    : removeCover
      ? "remove"
      : "none";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const serviceResult = await pricingModeApi.listMyTechnicianServices({
        page: 1,
        pageSize: 5,
        activeOnly: false
      });
      const [modeResult, categoryResult] = await Promise.allSettled([
        defaultShopId
          ? pricingModeApi.getBookingNavigation(defaultShopId, { page: 1, pageSize: 1 })
          : Promise.resolve(null),
        coreReadApi.listCategories({ page: 1, pageSize: 100 })
      ]);
      setServices(serviceResult.list);
      setPricingMode(modeResult.status === "fulfilled" ? modeResult.value?.pricingMode ?? null : null);
      setCategories(
        categoryResult.status === "fulfilled"
          ? categoryResult.value.list.filter((category) => category.isActive)
          : []
      );
    } catch (loadError) {
      setServices([]);
      setCategories([]);
      setPricingMode(null);
      setError(describeServiceError(loadError));
    } finally {
      setLoading(false);
    }
  }, [defaultShopId]);

  useEffect(() => { void load(); }, [load]);
  const closeAndResetServiceEditor = () => {
    setEditingId(null);
    setDeleteArmedId(null);
    setCoverFile(null);
    setRemoveCover(false);
    setPersistedAfterPartialSave(null);
  };
  const openEditor = (service?: TechnicianServicePayload) => {
    setEditingId(service?.id ?? "new");
    setDeleteArmedId(null);
    setError("");
    setCoverFile(null);
    setRemoveCover(false);
    setPersistedAfterPartialSave(null);
    setDraft(service
      ? { name: service.name, priceAmount: String(service.priceAmount), durationMinutes: String(service.durationMinutes), description: service.description ?? "", categoryId: service.categoryId }
      : { name: "", priceAmount: "", durationMinutes: "60", description: "", categoryId: defaultCategoryId ?? 0 });
  };
  const save = async () => {
    if (saving || editingId === null) return;
    if (persistedAfterPartialSave) {
      setSaving(true);
      setError("");
      try {
        let saved = persistedAfterPartialSave;
        if (pendingCoverOperation === "upload" && coverFile && saved.shopId) {
          saved = await pricingModeApi.uploadTechnicianServiceCover(saved.shopId, saved.id, coverFile);
        } else if (pendingCoverOperation === "remove" && saved.coverImageUrl && saved.shopId) {
          saved = await pricingModeApi.removeTechnicianServiceCover(saved.shopId, saved.id);
        }
        const completedService = saved;
        setServices((current) => upsertTechnicianService(current, completedService));
        closeAndResetServiceEditor();
      } catch {
        setError(
          pendingCoverOperation === "remove"
            ? "封面移除失败，请重试"
            : pendingCoverOperation === "upload"
              ? "封面上传失败，请重试"
              : ""
        );
      } finally {
        setSaving(false);
      }
      return;
    }
    if (editingId === "new" && services.length >= 5) {
      setError("服务数量已达到 5 个上限");
      return;
    }
    const priceAmount = Number(draft.priceAmount);
    const durationMinutes = Number(draft.durationMinutes);
    if (!draft.name.trim() || !Number.isInteger(priceAmount) || priceAmount < 0 || !Number.isInteger(durationMinutes) || durationMinutes < 1) {
      setError("请填写有效的服务名称、价格和时长");
      return;
    }
    const existing = typeof editingId === "number" ? services.find((item) => item.id === editingId) : null;
    const categoryId = draft.categoryId || existing?.categoryId || defaultCategoryId || services[0]?.categoryId;
    if (!categoryId) { setError("当前没有可用的正式服务分类，暂时无法新增服务"); return; }
    setSaving(true);
    setError("");
    try {
      const body = { name: draft.name.trim(), priceAmount, durationMinutes, description: draft.description.trim() || null, categoryId, currency: "JPY" };
      let saved = existing ?? persistedAfterPartialSave;
      if (!persistedAfterPartialSave) {
        try {
          saved = existing
            ? await pricingModeApi.updateMyTechnicianService(existing.id, body)
            : defaultShopId
              ? await pricingModeApi.createTechnicianService(defaultShopId, { ...body, sortOrder: services.length })
              : await pricingModeApi.createMyTechnicianService({ ...body, sortOrder: services.length });
          const persistedService = saved;
          setServices((current) => upsertTechnicianService(current, persistedService));
        } catch (saveError) {
          setError(describeServiceError(saveError));
          return;
        }
      }
      if (!saved) return;
      try {
        if (pendingCoverOperation === "upload" && coverFile && saved.shopId) {
          saved = await pricingModeApi.uploadTechnicianServiceCover(saved.shopId, saved.id, coverFile);
        } else if (pendingCoverOperation === "remove" && saved.coverImageUrl && saved.shopId) {
          saved = await pricingModeApi.removeTechnicianServiceCover(saved.shopId, saved.id);
        }
        const completedService = saved;
        setServices((current) => upsertTechnicianService(current, completedService));
        closeAndResetServiceEditor();
      } catch {
        setDraft({
          name: saved.name,
          priceAmount: String(saved.priceAmount),
          durationMinutes: String(saved.durationMinutes),
          description: saved.description ?? "",
          categoryId: saved.categoryId
        });
        setPersistedAfterPartialSave(saved);
        setEditingId(saved.id);
        setError(
          pendingCoverOperation === "remove"
            ? "服务已保存，封面移除失败，请重试"
            : pendingCoverOperation === "upload"
              ? "服务已保存，封面上传失败，请重试"
              : ""
        );
      }
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
      await pricingModeApi.deleteMyTechnicianService(service.id);
      setServices((current) => current.filter((item) => item.id !== service.id));
      closeAndResetServiceEditor();
    } catch (deleteError) {
      setError(describeServiceError(deleteError));
    } finally {
      setSaving(false);
    }
  };
  const moveService = async (index: number, direction: -1 | 1) => {
    if (saving) return;
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= services.length) return;
    const reordered = [...services];
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
    if (!globalThis.crypto?.randomUUID) {
      setError("当前环境无法安全保存服务排序");
      return;
    }
    setSaving(true);
    setError("");
    try {
      setServices(await pricingModeApi.reorderMyTechnicianServices(
        reordered.map((item) => item.id),
        globalThis.crypto.randomUUID()
      ));
    } catch (reorderError) {
      setError(describeServiceError(reorderError));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <section className="space-y-3 py-6 text-center text-sm font-black">正在加载正式服务</section>;

  const serviceAction = (_service: ReturnType<typeof fromTechnicianServicePayload>, index: number) => {
    const rawService = services[index];
    if (!rawService) return null;
    return (
      <div className="flex gap-2">
        <IconButton className={cn("h-9 w-9", index === 0 || saving ? "opacity-40" : undefined)} disabled={index === 0 || saving} icon="up" label="上移" onClick={() => void moveService(index, -1)} />
        <IconButton className={cn("h-9 w-9", index === services.length - 1 || saving ? "opacity-40" : undefined)} disabled={index === services.length - 1 || saving} icon="down" label="下移" onClick={() => void moveService(index, 1)} />
        <IconButton className={cn("h-9 w-9", saving ? "opacity-40" : undefined)} disabled={saving} icon="edit" label="编辑" onClick={() => openEditor(rawService)} />
      </div>
    );
  };
  const editorService = typeof editingId === "number" ? services.find((service) => service.id === editingId) ?? null : null;
  const editor = editingId !== null ? (
    <article className={cn(surface.panel, "rounded-[22px] border p-4")} data-testid="technician-service-card">
      <div className="space-y-3">
        {editorService?.shopId || defaultShopId ? (
          <TechnicianServiceCoverField
            disabled={saving}
            onFileChange={(file) => { setCoverFile(file); setError(""); }}
            onRemovePersisted={(remove) => { setRemoveCover(remove); setError(""); }}
            onValidationError={setError}
            persistedUrl={editorService?.coverImageUrl ?? null}
            removePersisted={removeCover}
            selectedFile={coverFile}
          />
        ) : null}
        <label className="block text-xs font-bold"><span className={surface.muted}>服务分类</span><select aria-label="服务分类" className={cn(surface.metric, "mt-1 h-10 w-full rounded-[14px] border px-3 text-sm font-black outline-none disabled:opacity-60")} disabled={saving || Boolean(persistedAfterPartialSave)} onChange={(event) => setDraft((current) => ({ ...current, categoryId: Number(event.target.value) }))} value={draft.categoryId}><option value={0}>服务分类</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label className="block text-xs font-bold"><span className={surface.muted}>服务名称</span><input className={cn(surface.metric, "mt-1 h-10 w-full rounded-[14px] border px-3 text-sm font-black outline-none disabled:opacity-60")} disabled={saving || Boolean(persistedAfterPartialSave)} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} value={draft.name} /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs font-bold"><span className={surface.muted}>价格</span><input className={cn(surface.metric, "mt-1 h-10 w-full rounded-[14px] border px-3 text-sm font-black outline-none disabled:opacity-60")} disabled={saving || Boolean(persistedAfterPartialSave)} inputMode="numeric" onChange={(event) => setDraft((current) => ({ ...current, priceAmount: event.target.value }))} value={draft.priceAmount} /></label>
          <label className="block text-xs font-bold"><span className={surface.muted}>时长（分钟）</span><input className={cn(surface.metric, "mt-1 h-10 w-full rounded-[14px] border px-3 text-sm font-black outline-none disabled:opacity-60")} disabled={saving || Boolean(persistedAfterPartialSave)} inputMode="numeric" onChange={(event) => setDraft((current) => ({ ...current, durationMinutes: event.target.value }))} value={draft.durationMinutes} /></label>
        </div>
        <label className="block text-xs font-bold"><span className={surface.muted}>描述</span><textarea className={cn(surface.metric, "mt-1 min-h-20 w-full rounded-[14px] border px-3 py-2 text-sm font-bold outline-none disabled:opacity-60")} disabled={saving || Boolean(persistedAfterPartialSave)} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} value={draft.description} /></label>
        <div className="grid grid-cols-2 gap-2"><button className={cn(surface.metric, "rounded-[16px] border px-3 py-2.5 text-sm font-black")} disabled={saving} onClick={closeAndResetServiceEditor} type="button">取消</button><button className={cn(surface.chip, "rounded-[16px] border px-3 py-2.5 text-sm font-black")} disabled={saving} onClick={() => void save()} type="button">{saving ? "保存中…" : persistedAfterPartialSave ? pendingCoverOperation === "remove" ? "重试移除封面" : pendingCoverOperation === "upload" ? "重试上传封面" : "完成并关闭" : "保存"}</button></div>
        {editorService && !persistedAfterPartialSave ? <button className="w-full rounded-[16px] border border-red-500/40 px-3 py-2.5 text-sm font-black text-red-500" disabled={saving} onClick={() => void remove(editorService)} type="button">{deleteArmedId === editorService.id ? "再次点击确认删除" : "删除该服务"}</button> : null}
      </div>
    </article>
  ) : null;
  const addAndState = (
    <div className="space-y-3" data-testid="technician-service-management-controls">
      <div className="flex items-center justify-between gap-3">
        <p className={cn(surface.muted, "text-xs font-bold")}>店铺当前定价模式：{pricingMode === "technician" ? "技师定价" : pricingMode === "merchant" ? "店铺定价" : defaultShopId ? "未设置" : "个人定价"}</p>
        {services.length < 5 ? <button className={cn(surface.chip, "rounded-full border px-3 py-2 text-xs font-black")} disabled={saving || editingId !== null} onClick={() => openEditor()} type="button">添加服务 {services.length}/5</button> : null}
      </div>
      {error ? <div className="flex items-center justify-between gap-3" role="alert"><p className="text-xs font-bold text-red-500">{error}</p><button className="shrink-0 rounded-full border px-3 py-2 text-xs font-black" disabled={saving} onClick={() => void load()} type="button">重新加载服务</button></div> : null}
      {services.length === 0 && editingId !== "new" ? <p className={cn(surface.muted, "px-1 py-4 text-center text-sm font-bold")}>当前没有已保存的正式技师服务</p> : null}
      {editor}
    </div>
  );

  if (profile) {
    return (
      <div className="space-y-3">
        <TechnicianProfileInfoView
          model={fromTechnicianSelfProfile(profile, technician, services)}
          privacySlot={privacySlot}
          serviceAction={serviceAction}
          walletSummary={walletSummary}
        />
        {addAndState}
      </div>
    );
  }

  return (
    <section className="space-y-3" data-testid="technician-profile-services">
      <h2 className="px-1 text-lg font-black">服务信息</h2>
      {services.map((service, index) => (
        <UnifiedServiceInfoCard actionSlot={serviceAction(fromTechnicianServicePayload(service), index)} data={fromTechnicianServicePayload(service)} key={service.id} />
      ))}
      {addAndState}
    </section>
  );
}

function DataCenter({ period, onPeriodChange, onRangeLoaded }: {
  period: TechnicianDataCenterPeriod;
  onPeriodChange: (period: TechnicianDataCenterPeriod) => void;
  onRangeLoaded: (range: TechnicianDataCenterPayload["range"]) => void;
}) {
  return <TechnicianDataCenterPanel onPeriodChange={onPeriodChange} onRangeLoaded={onRangeLoaded} period={period} />;
}

function TechnicianPortalContent({ initialSelfProfile, technician, walletSummary }: {
  initialSelfProfile: TechnicianSelfProfile;
  technician: CoreTechnicianDetail | null;
  walletSummary: WalletSummary;
}) {
  const { view } = useParams();
  const navigate = useNavigate();
  const { language } = useI18n();
  const t = (source: string) => translateText(source, language);
  const [searchParams, setSearchParams] = useSearchParams();
  const [selfProfile, setSelfProfile] = useState(initialSelfProfile);
  const [dataCenterRange, setDataCenterRange] = useState<TechnicianDataCenterPayload["range"] | null>(null);
  const activeView = getPortalView(view);
  const meTab = getMeTab(searchParams.get("meTab"));
  const dataCenterPeriod = getDataCenterPeriod(searchParams.get("period"));
  const shopId = technician?.shop?.id ?? selfProfile.shopId;
  const technicianPortalConfig = roleBasedTabConfig.technician;
  const updateMeTab = (tab: TechnicianMeTab) => {
    const next = new URLSearchParams(searchParams);
    next.set("meTab", tab);
    setSearchParams(next, { replace: true });
  };
  const updateDataCenterPeriod = (period: TechnicianDataCenterPeriod) => {
    const next = new URLSearchParams(searchParams);
    next.set("meTab", "data");
    next.set("period", period);
    setSearchParams(next, { replace: true });
  };
  const defaultCategoryId = technician?.services[0]?.category.id ?? technician?.shop?.serviceCategories[0]?.id ?? null;

  useEffect(() => {
    if (searchParams.get("meTab") === "services") {
      const next = new URLSearchParams(searchParams);
      next.set("meTab", "info");
      setSearchParams(next, { replace: true });
      globalThis.requestAnimationFrame(() => {
        document.getElementById("technician-service-information")?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      });
    }
  }, [searchParams, setSearchParams]);

  return (
    <MobileShell navItems={technicianNavItems} navPanelStyle={activeView === "me" ? "plain" : "default"} showBottomNav={activeView !== "me"}>
      {activeView === "tasks" ? <TasksView profile={selfProfile} technician={technician} /> : null}
      {activeView === "me" ? (
        <>
          <MobileFullscreenHeader
            footer={<FeatureSegmentedTabs items={[{ label: "信息卡", value: "info" }, { label: "数据中心", value: "data" }]} onChange={(value) => updateMeTab(value as TechnicianMeTab)} value={meTab} variant="header" />}
            maxWidth="880px"
            onBack={() => navigate("/technician")}
            onClose={() => navigate("/technician")}
            title="个人中心"
          />
          <div className="space-y-4 px-4 pb-32 pt-4">
            {meTab === "info" ? (
              <>
                <Link className={cn(surface.panel, "mb-4 flex min-h-16 items-center justify-between rounded-[18px] border px-4 py-3")} to="/technician/shop-stays">
                  <span>
                    <span className="block text-sm font-black text-[color:var(--client-text)]">{t("入住店铺")}</span>
                    <span className={cn(surface.muted, "mt-1 block text-xs font-bold")}>
                      {selfProfile.shopAffiliations.length} {t("家有效合作店铺")}
                    </span>
                  </span>
                  <AppIcon className="h-5 w-5 rotate-180 text-[color:var(--client-primary)]" name="back" />
                </Link>
                <TechnicianInfoCard
                  defaultCategoryId={defaultCategoryId}
                  defaultShopId={shopId}
                  onSaved={setSelfProfile}
                  profile={selfProfile}
                  technician={technician}
                  walletSummary={walletSummary}
                />
              </>
            ) : null}
             {meTab === "data" ? <DataCenter onPeriodChange={updateDataCenterPeriod} onRangeLoaded={setDataCenterRange} period={dataCenterPeriod} /> : null}
          </div>
           {meTab === "data" && dataCenterRange ? (
             <div className="safe-nav-bottom pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex justify-center pb-3 pt-2" data-testid="technician-data-center-schedule-action">
               <div className="client-nav-aligned-panel pointer-events-auto">
               <PrimaryButton className="w-full" onClick={() => navigate(`/technician/schedule?period=${dataCenterPeriod}&from=${encodeURIComponent(dataCenterRange.startsAt)}&to=${encodeURIComponent(dataCenterRange.endsAt)}`)}>
                确认详细排班记录
              </PrimaryButton>
               </div>
            </div>
          ) : null}
        </>
      ) : null}
    </MobileShell>
  );
}
