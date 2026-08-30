import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiClientError } from "../../api/httpClient";
import { useAuth } from "../../auth/AuthProvider";
import { FeatureSegmentedTabs } from "../../components/client-ui/AppScaffold";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileShell } from "../../components/mobile/MobileShell";
import { TestFeatureBadge } from "../../components/ui/TestFeatureBadge";
import { cn } from "../../lib/utils";
import {
  merchantShopMembershipApi,
  type MerchantShopMembershipCard,
  type MerchantShopMembershipListItem,
  type PaginatedShopMemberships,
  type ShopMembershipActivity,
  type ShopMembershipAnalytics,
  type ShopMembershipCandidate,
  type ShopMembershipOverview
} from "./api";

type MemberSection = "overview" | "members" | "cards" | "activity" | "analytics";
type PageState<T> =
  | { status: "loading"; data: null; message: ""; requestKey?: string }
  | { status: "ready"; data: T; message: ""; requestKey?: string }
  | { status: "error"; data: null; message: string; requestKey?: string };

const sectionTabs: Array<{ label: string; value: MemberSection }> = [
  { label: "概览", value: "overview" },
  { label: "会员", value: "members" },
  { label: "会员卡", value: "cards" },
  { label: "活动", value: "activity" },
  { label: "分析", value: "analytics" }
];

const panelClassName =
  "rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_90%,var(--client-bg)_10%)] p-4 text-[color:var(--client-text)] shadow-[0_20px_52px_color-mix(in_srgb,var(--client-bg)_32%,transparent)]";
const insetClassName =
  "rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_76%,transparent)]";

function resolveSection(value?: string): MemberSection {
  if (value === "members" || value === "cards" || value === "activity" || value === "analytics") return value;
  if (value === "verify") return "activity";
  return "overview";
}

function describeError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return "登录状态已失效，请重新登录";
    if (error.status === 403) return "当前账号没有查看此会员数据的权限";
    if (error.status === 404) return "会员记录不存在或不属于当前店铺";
  }
  return "会员数据读取失败，请检查网络后重试";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExpectedSectionData(section: MemberSection, value: unknown) {
  if (!isRecord(value)) return false;
  if (section === "overview") {
    return isRecord(value.shop)
      && typeof value.activeMemberCount === "number"
      && Array.isArray(value.recentActivities);
  }
  if (section === "analytics") {
    return typeof value.activeMemberCount === "number"
      && typeof value.newMemberCount === "number"
      && Array.isArray(value.dailyNewMembers);
  }
  return Array.isArray(value.list)
    && typeof value.total === "number"
    && typeof value.page === "number"
    && typeof value.page_size === "number";
}

function formatDate(value: string | null, includeTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" as const } : {})
  }).format(date);
}

function formatJpy(value: number) {
  return new Intl.NumberFormat("ja-JP", { currency: "JPY", maximumFractionDigits: 0, style: "currency" }).format(value);
}

function StatusChip({ status }: { status: string }) {
  const label = status === "active" ? "有效" : status === "ended" ? "已结束" : status === "frozen" ? "已冻结" : status === "expired" ? "已到期" : "已作废";
  const active = status === "active";
  return (
    <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-black", active
      ? "border-[color:color-mix(in_srgb,var(--client-primary)_42%,transparent)] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary-strong)]"
      : "border-[color:var(--client-line)] bg-[color:var(--client-bg)] text-[color:var(--client-muted)]")}
    >
      {label}
    </span>
  );
}

function PageStatus({ message, onRetry, title }: { message?: string; onRetry?: () => void; title: string }) {
  return (
    <section aria-live="polite" className={cn(panelClassName, "py-10 text-center")} role={message ? "alert" : undefined}>
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-[18px] bg-[color:var(--client-primary-soft)] text-xl text-[color:var(--client-primary)]">♡</div>
      <h2 className="mt-4 text-base font-black">{title}</h2>
      {message ? <p className="mt-2 text-sm font-semibold leading-6 text-[color:var(--client-muted)]">{message}</p> : null}
      {onRetry ? (
        <button className="mt-4 min-h-11 rounded-full bg-[color:var(--client-primary)] px-6 text-sm font-black text-[color:var(--client-primary-contrast)]" onClick={onRetry} type="button">
          重新加载
        </button>
      ) : null}
    </section>
  );
}

function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="会员数据分页" className="flex items-center justify-between gap-3 pt-1">
      <button className={cn(insetClassName, "min-h-10 px-4 text-xs font-black disabled:opacity-35")} disabled={page <= 1} onClick={() => onChange(page - 1)} type="button">上一页</button>
      <span className="text-xs font-black text-[color:var(--client-muted)]">{page} / {totalPages}</span>
      <button className={cn(insetClassName, "min-h-10 px-4 text-xs font-black disabled:opacity-35")} disabled={page >= totalPages} onClick={() => onChange(page + 1)} type="button">下一页</button>
    </nav>
  );
}

function OverviewView({ data, onEnroll, canEnroll }: { data: ShopMembershipOverview; onEnroll: () => void; canEnroll: boolean }) {
  const metrics = [
    ["有效会员", data.activeMemberCount],
    ["今日新增", data.todayNewMemberCount],
    ["有效会员卡", data.activeCardCount],
    ["即将到期", data.expiringSoonCardCount]
  ] as const;
  return (
    <div className="space-y-4">
      <section className={cn(panelClassName, "relative overflow-hidden p-0")}>
        <div className="absolute inset-y-0 left-0 w-1.5 bg-[color:var(--client-primary)]" />
        <div className="px-5 pb-5 pt-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[color:var(--client-primary)]">当前店铺</p>
              <h2 className="mt-1 text-xl font-black">{data.shop.name}</h2>
              <p className="mt-1 text-xs font-semibold text-[color:var(--client-muted)]">{data.shop.city} · 店铺私域会员</p>
            </div>
            {canEnroll ? <button className="min-h-11 rounded-full bg-[color:var(--client-primary)] px-5 text-sm font-black text-[color:var(--client-primary-contrast)] shadow-[0_12px_28px_color-mix(in_srgb,var(--client-primary)_22%,transparent)]" onClick={onEnroll} type="button">开通会员</button> : null}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {metrics.map(([label, value]) => <div className={cn(insetClassName, "p-3")} key={label}><strong className="text-2xl font-black tracking-tight">{value}</strong><p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">{label}</p></div>)}
          </div>
        </div>
      </section>

      <section className={panelClassName}>
        <div className="flex items-center justify-between"><div><p className="text-[11px] font-black uppercase tracking-[0.14em] text-[color:var(--client-primary)]">Member trail</p><h2 className="mt-1 text-lg font-black">最近活动</h2></div><span className="text-xs font-bold text-[color:var(--client-muted)]">真实审计记录</span></div>
        {data.recentActivities.length ? <div className="relative mt-4 space-y-3 before:absolute before:bottom-4 before:left-[9px] before:top-4 before:w-px before:bg-[color:var(--client-line)]">{data.recentActivities.map((activity) => <div className="relative flex gap-3" key={activity.id}><span className="relative z-10 mt-1 h-[19px] w-[19px] shrink-0 rounded-full border-4 border-[color:var(--client-surface)] bg-[color:var(--client-primary)]" /><div className={cn(insetClassName, "min-w-0 flex-1 px-3 py-2.5")}><strong className="text-sm">{activity.customerDisplayName}</strong><p className="mt-0.5 text-xs font-semibold text-[color:var(--client-muted)]">开通店铺会员 · {formatDate(activity.occurredAt, true)}</p></div></div>)}</div> : <p className="mt-4 rounded-[22px] border border-dashed border-[color:var(--client-line)] px-4 py-7 text-center text-sm font-bold text-[color:var(--client-muted)]">当前店铺暂无会员活动</p>}
      </section>

      <section className={panelClassName}><h2 className="text-base font-black">后续独立开放</h2><p className="mt-2 text-sm font-semibold leading-6 text-[color:var(--client-muted)]">开卡、充值、核销和退款会分别接入独立状态机与账本；本页当前不会修改会员卡资金或次数。</p></section>
    </div>
  );
}

function MembersView({ page, onEnroll, onPageChange, result, canEnroll }: { page: number; onEnroll: () => void; onPageChange: (page: number) => void; result: PaginatedShopMemberships<MerchantShopMembershipListItem>; canEnroll: boolean }) {
  if (!result.list.length) return <PageStatus title="当前店铺暂无会员" />;
  return <div className="space-y-3"><section className={cn(panelClassName, "flex items-center justify-between gap-3")}><div><p className="text-xs font-bold text-[color:var(--client-muted)]">当前结果</p><strong className="text-xl font-black">{result.total} 位会员</strong></div>{canEnroll ? <button className="min-h-10 rounded-full bg-[color:var(--client-primary)] px-4 text-xs font-black text-[color:var(--client-primary-contrast)]" onClick={onEnroll} type="button">开通会员</button> : null}</section>{result.list.map((member) => <article className={cn(panelClassName, "flex items-center gap-3 p-3.5")} key={member.publicId}><div className="grid h-11 w-11 shrink-0 place-items-center rounded-[17px] bg-[color:var(--client-primary-soft)] text-sm font-black text-[color:var(--client-primary)]">{member.displayName.slice(0, 1)}</div><div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-2"><strong className="truncate text-sm">{member.displayName}</strong><StatusChip status={member.status} /></div><p className="mt-1 truncate text-xs font-semibold text-[color:var(--client-muted)]">{member.customerNeedoId} · {member.cardCount} 张卡 · {formatDate(member.startedAt)}加入</p></div></article>)}<Pagination onChange={onPageChange} page={page} pageSize={result.page_size} total={result.total} /></div>;
}

function CardsView({ page, onPageChange, result }: { page: number; onPageChange: (page: number) => void; result: PaginatedShopMemberships<MerchantShopMembershipCard> }) {
  if (!result.list.length) return <PageStatus message="已开通的店铺会员仍会保留；开卡将在后续步骤开放。" title="当前店铺暂无会员卡" />;
  return <div className="space-y-3">{result.list.map((card) => <article className={cn(panelClassName, "relative overflow-hidden")} key={card.publicId}><div className="absolute inset-y-0 right-0 w-20 bg-[radial-gradient(circle_at_right,color-mix(in_srgb,var(--client-primary)_20%,transparent),transparent_65%)]" /><div className="relative flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-[color:var(--client-muted)]">{card.customerDisplayName} · {card.customerNeedoId}</p><h2 className="mt-1 text-lg font-black">{card.name}</h2></div><StatusChip status={card.status} /></div><div className="relative mt-4 flex items-end justify-between gap-3"><div><p className="font-mono text-xs font-black tracking-[0.14em] text-[color:var(--client-muted)]">{card.cardNoMasked}</p><p className="mt-1 text-xs font-semibold text-[color:var(--client-muted)]">有效期至 {formatDate(card.expiresAt)}</p></div><strong className="text-lg font-black">{card.type === "stored_value" ? formatJpy((card.principalBalanceJpy ?? 0) + (card.bonusBalanceJpy ?? 0)) : card.type === "count" ? `${card.remainingUses ?? 0} 次` : "权益卡"}</strong></div></article>)}<Pagination onChange={onPageChange} page={page} pageSize={result.page_size} total={result.total} /></div>;
}

function ActivityView({ page, onPageChange, result }: { page: number; onPageChange: (page: number) => void; result: PaginatedShopMemberships<ShopMembershipActivity> }) {
  if (!result.list.length) return <PageStatus title="当前店铺暂无会员活动" />;
  return <div className="space-y-3">{result.list.map((activity) => <article className={cn(panelClassName, "flex gap-3")} key={activity.id}><span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-[color:var(--client-primary)] shadow-[0_0_0_5px_var(--client-primary-soft)]" /><div className="min-w-0"><strong className="text-sm">{activity.customerDisplayName} 开通会员</strong><p className="mt-1 text-xs font-semibold text-[color:var(--client-muted)]">{activity.actorName} · {formatDate(activity.occurredAt, true)}</p></div></article>)}<Pagination onChange={onPageChange} page={page} pageSize={result.page_size} total={result.total} /></div>;
}

function AnalyticsView({ data }: { data: ShopMembershipAnalytics }) {
  const max = Math.max(1, ...data.dailyNewMembers.map((item) => item.count));
  return <div className="space-y-4"><section className={panelClassName}><p className="text-[11px] font-black uppercase tracking-[0.14em] text-[color:var(--client-primary)]">{formatDate(data.from)} — {formatDate(data.to)}</p><div className="mt-4 grid grid-cols-2 gap-2"><div className={cn(insetClassName, "p-4")}><strong className="text-2xl font-black">{data.activeMemberCount}</strong><p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">有效会员</p></div><div className={cn(insetClassName, "p-4")}><strong className="text-2xl font-black">+{data.newMemberCount}</strong><p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">期间新增</p></div></div></section><section className={panelClassName}><h2 className="text-base font-black">新增会员趋势</h2>{data.dailyNewMembers.length ? <div className="mt-5 flex h-32 items-end gap-1.5" aria-label="新增会员趋势图">{data.dailyNewMembers.map((item) => <div className="group flex min-w-0 flex-1 flex-col items-center justify-end" key={item.date} title={`${item.date}: ${item.count}`}><span className="mb-1 text-[9px] font-black text-[color:var(--client-muted)]">{item.count || ""}</span><span className="w-full min-w-1 rounded-t-full bg-[color:var(--client-primary)]" style={{ height: `${Math.max(item.count ? 8 : 2, item.count / max * 88)}px`, opacity: item.count ? 1 : 0.2 }} /></div>)}</div> : <p className="mt-4 text-sm font-bold text-[color:var(--client-muted)]">当前范围暂无新增会员</p>}</section></div>;
}

function EnrollmentDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [keyword, setKeyword] = useState("");
  const [search, setSearch] = useState<PageState<PaginatedShopMemberships<ShopMembershipCandidate>>>({ status: "ready", data: { list: [], total: 0, page: 1, page_size: 20 }, message: "" });
  const [savingId, setSavingId] = useState("");
  const [feedback, setFeedback] = useState("");
  const runSearch = async () => { setSearch({ status: "loading", data: null, message: "" }); try { setSearch({ status: "ready", data: await merchantShopMembershipApi.candidates({ keyword, page: 1, pageSize: 20 }), message: "" }); } catch (error) { setSearch({ status: "error", data: null, message: describeError(error) }); } };
  return <div aria-modal="true" className="fixed inset-0 z-[120] grid place-items-end bg-black/58 p-3 backdrop-blur-sm sm:place-items-center" role="dialog"><section className="max-h-[88dvh] w-full max-w-[520px] overflow-y-auto rounded-[30px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)] p-4 text-[color:var(--client-text)] shadow-[0_28px_90px_rgba(0,0,0,0.55)]"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black text-[color:var(--client-primary)]">当前店铺</p><h2 className="mt-1 text-xl font-black">开通会员</h2><p className="mt-1 text-xs font-semibold text-[color:var(--client-muted)]">仅可选择与本店有正式预约关系的用户</p></div><button aria-label="关闭开通会员" className={cn(insetClassName, "grid h-10 w-10 place-items-center text-lg font-black")} onClick={onClose} type="button">×</button></div><form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); void runSearch(); }}><input aria-label="搜索用户" className={cn(insetClassName, "min-h-11 min-w-0 flex-1 px-4 text-sm font-bold outline-none focus:border-[color:var(--client-primary)]")} onChange={(event) => setKeyword(event.target.value)} placeholder="NeeDoID 或姓名" value={keyword} /><button className="min-h-11 rounded-full bg-[color:var(--client-primary)] px-5 text-sm font-black text-[color:var(--client-primary-contrast)]" type="submit">搜索</button></form>{feedback ? <p className="mt-3 text-sm font-bold text-red-500" role="alert">{feedback}</p> : null}<div className="mt-4 space-y-2">{search.status === "loading" ? <p className="py-6 text-center text-sm font-bold text-[color:var(--client-muted)]">正在搜索正式用户</p> : null}{search.status === "error" ? <PageStatus message={search.message} onRetry={() => void runSearch()} title="候选用户读取失败" /> : null}{search.status === "ready" && keyword.trim() && !search.data.list.length ? <p className="py-6 text-center text-sm font-bold text-[color:var(--client-muted)]">没有找到可开通的用户</p> : null}{search.status === "ready" ? search.data.list.map((candidate) => <div className={cn(insetClassName, "flex items-center gap-3 p-3")} key={candidate.customerNeedoId}><div className="grid h-10 w-10 place-items-center rounded-[15px] bg-[color:var(--client-primary-soft)] font-black text-[color:var(--client-primary)]">{candidate.displayName.slice(0, 1)}</div><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{candidate.displayName}</strong><p className="mt-0.5 truncate text-xs font-semibold text-[color:var(--client-muted)]">{candidate.customerNeedoId} · 最近预约 {formatDate(candidate.lastOrderAt)}</p></div><button className="min-h-10 rounded-full border border-[color:var(--client-primary)] px-4 text-xs font-black text-[color:var(--client-primary)] disabled:opacity-40" disabled={Boolean(savingId)} onClick={async () => { setSavingId(candidate.customerNeedoId); setFeedback(""); try { await merchantShopMembershipApi.enroll(candidate.customerNeedoId); onCreated(); } catch (error) { setFeedback(error instanceof ApiClientError && error.status === 409 ? "该用户已经是当前店铺会员" : describeError(error)); setSavingId(""); } }} type="button">{savingId === candidate.customerNeedoId ? "开通中" : "开通"}</button></div>) : null}</div></section></div>;
}

function ShopMembershipSectionContent({ activeSection, canEnroll, onEnroll, revision }: { activeSection: MemberSection; canEnroll: boolean; onEnroll: () => void; revision: number }) {
  const [page, setPage] = useState(1);
  const [retryRevision, setRetryRevision] = useState(0);
  const currentRequestKey = `${activeSection}:${page}:${revision}:${retryRevision}`;
  const [state, setState] = useState<PageState<ShopMembershipOverview | PaginatedShopMemberships<MerchantShopMembershipListItem> | PaginatedShopMemberships<MerchantShopMembershipCard> | PaginatedShopMemberships<ShopMembershipActivity> | ShopMembershipAnalytics>>({ status: "loading", data: null, message: "", requestKey: currentRequestKey });

  useEffect(() => {
    let active = true;
    setState({ status: "loading", data: null, message: "", requestKey: currentRequestKey });
    const request = activeSection === "overview" ? merchantShopMembershipApi.overview()
      : activeSection === "members" ? merchantShopMembershipApi.list({ page, pageSize: 20 })
      : activeSection === "cards" ? merchantShopMembershipApi.cards({ page, pageSize: 20 })
      : activeSection === "activity" ? merchantShopMembershipApi.activities({ page, pageSize: 20 })
      : merchantShopMembershipApi.analytics("last30days");
    request.then((data) => { if (active) setState({ status: "ready", data, message: "", requestKey: currentRequestKey }); }).catch((error) => { if (active) setState({ status: "error", data: null, message: describeError(error), requestKey: currentRequestKey }); });
    return () => { active = false; };
  }, [activeSection, currentRequestKey, page]);

  const content = useMemo(() => {
    if (state.requestKey !== currentRequestKey || state.status === "loading") return <PageStatus title="正在读取会员数据" />;
    if (state.status === "error") return <PageStatus message={state.message} onRetry={() => setRetryRevision((value) => value + 1)} title="会员数据读取失败" />;
    if (!hasExpectedSectionData(activeSection, state.data)) return <PageStatus message="会员数据响应格式异常，请重新加载" onRetry={() => setRetryRevision((value) => value + 1)} title="会员数据读取失败" />;
    if (activeSection === "overview") return <OverviewView canEnroll={canEnroll} data={state.data as ShopMembershipOverview} onEnroll={onEnroll} />;
    if (activeSection === "members") return <MembersView canEnroll={canEnroll} onEnroll={onEnroll} onPageChange={setPage} page={page} result={state.data as PaginatedShopMemberships<MerchantShopMembershipListItem>} />;
    if (activeSection === "cards") return <CardsView onPageChange={setPage} page={page} result={state.data as PaginatedShopMemberships<MerchantShopMembershipCard>} />;
    if (activeSection === "activity") return <ActivityView onPageChange={setPage} page={page} result={state.data as PaginatedShopMemberships<ShopMembershipActivity>} />;
    return <AnalyticsView data={state.data as ShopMembershipAnalytics} />;
  }, [activeSection, canEnroll, currentRequestKey, onEnroll, page, state]);

  return <div className="mt-4">{content}</div>;
}

export function ShopMemberCenterPage() {
  const navigate = useNavigate();
  const { section } = useParams();
  const { hasPermission } = useAuth();
  const activeSection = resolveSection(section);
  const canEnroll = hasPermission("shop.member.create");
  const canViewActivity = hasPermission("shop.member.operation_log.view");
  const canViewAnalytics = hasPermission("shop.member.analytics.view");
  const visibleSectionTabs = sectionTabs.filter((item) =>
    item.value === "activity" ? canViewActivity : item.value === "analytics" ? canViewAnalytics : true
  );
  const [revision, setRevision] = useState(0);
  const [enrollmentOpen, setEnrollmentOpen] = useState(false);

  return <MobileShell showBottomNav={false}><MobileFullscreenHeader action={<TestFeatureBadge />} onBack={() => navigate(-1)} subtitle="店铺私域会员与会员卡状态" title="会员中心" /><main className="mx-auto w-full max-w-[880px] px-4 pb-28 pt-4"><FeatureSegmentedTabs items={visibleSectionTabs} onChange={(next) => navigate(next === "overview" ? "/merchant/member" : `/merchant/member/${next}`)} value={activeSection} variant="header" /><ShopMembershipSectionContent activeSection={activeSection} canEnroll={canEnroll} key={activeSection} onEnroll={() => setEnrollmentOpen(true)} revision={revision} /></main>{enrollmentOpen ? <EnrollmentDialog onClose={() => setEnrollmentOpen(false)} onCreated={() => { setEnrollmentOpen(false); setRevision((value) => value + 1); }} /> : null}</MobileShell>;
}
