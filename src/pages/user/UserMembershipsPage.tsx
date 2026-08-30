import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiClientError } from "../../api/httpClient";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileShell } from "../../components/mobile/MobileShell";
import { TestFeatureBadge } from "../../components/ui/TestFeatureBadge";
import {
  customerShopMembershipApi,
  type CustomerShopMembershipDetail,
  type CustomerShopMembershipListItem,
  type PaginatedShopMemberships,
  type ShopMembershipCard,
  type ShopMembershipStatus
} from "../../features/shop-member/api";
import { cn } from "../../lib/utils";

type PageState<T> =
  | { status: "loading"; data: null; message: "" }
  | { status: "ready"; data: T; message: "" }
  | { status: "error"; data: null; message: string };

const panelClassName =
  "rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_90%,var(--client-bg)_10%)] p-4 text-[color:var(--client-text)] shadow-[0_20px_52px_color-mix(in_srgb,var(--client-bg)_32%,transparent)]";
const insetClassName =
  "rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_76%,transparent)]";

function describeError(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return "登录状态已失效，请重新登录";
    if (error.status === 403) return "当前身份没有查看会员数据的权限";
    if (error.status === 404) return "会员记录不存在或已不可见";
  }
  return "会员数据读取失败，请检查网络后重试";
}

function formatDate(value: string | null) {
  if (!value) return "长期有效";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(date);
}

function formatJpy(value: number) {
  return new Intl.NumberFormat("ja-JP", { currency: "JPY", maximumFractionDigits: 0, style: "currency" }).format(value);
}

function MembershipStatusChip({ status }: { status: ShopMembershipStatus }) {
  return <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-black", status === "active" ? "border-[color:color-mix(in_srgb,var(--client-primary)_42%,transparent)] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary-strong)]" : "border-[color:var(--client-line)] bg-[color:var(--client-bg)] text-[color:var(--client-muted)]")}>{status === "active" ? "有效" : "已结束"}</span>;
}

function CardStatusChip({ status }: { status: ShopMembershipCard["status"] }) {
  const label = status === "active" ? "有效" : status === "frozen" ? "已冻结" : status === "expired" ? "已到期" : "已作废";
  return <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-black", status === "active" ? "border-[color:color-mix(in_srgb,var(--client-primary)_42%,transparent)] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary-strong)]" : "border-[color:var(--client-line)] bg-[color:var(--client-bg)] text-[color:var(--client-muted)]")}>{label}</span>;
}

function StatusPanel({ message, onRetry, title }: { message?: string; onRetry?: () => void; title: string }) {
  return <section aria-live="polite" className={cn(panelClassName, "py-12 text-center")} role={message ? "alert" : undefined}><div className="mx-auto grid h-14 w-14 place-items-center rounded-[20px] bg-[color:var(--client-primary-soft)] text-2xl text-[color:var(--client-primary)]">♡</div><h2 className="mt-4 text-lg font-black">{title}</h2>{message ? <p className="mt-2 text-sm font-semibold leading-6 text-[color:var(--client-muted)]">{message}</p> : null}{onRetry ? <button className="mt-4 min-h-11 rounded-full bg-[color:var(--client-primary)] px-6 text-sm font-black text-[color:var(--client-primary-contrast)]" onClick={onRetry} type="button">重新加载</button> : null}</section>;
}

function ShopMembershipCard({ membership }: { membership: CustomerShopMembershipListItem }) {
  return <Link className={cn(panelClassName, "group relative block overflow-hidden p-0 transition hover:border-[color:var(--client-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--client-primary)]")} to={`/me/memberships/${encodeURIComponent(membership.publicId)}`}><div className="absolute inset-y-0 left-0 w-1.5 bg-[color:var(--client-primary)]" /><div className="p-5 pl-6"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-[0.14em] text-[color:var(--client-primary)]">已加入店铺</p><h2 className="mt-1 truncate text-xl font-black">{membership.shop.name}</h2><p className="mt-1 truncate text-xs font-semibold text-[color:var(--client-muted)]">{membership.shop.city} · {membership.shop.address}</p></div><MembershipStatusChip status={membership.status} /></div><div className="mt-5 grid grid-cols-3 gap-2"><div className={cn(insetClassName, "p-3")}><strong className="text-lg font-black">{membership.cardCount}</strong><p className="mt-1 text-[11px] font-bold text-[color:var(--client-muted)]">会员卡</p></div><div className={cn(insetClassName, "p-3")}><strong className="text-lg font-black">{membership.activeCardCount}</strong><p className="mt-1 text-[11px] font-bold text-[color:var(--client-muted)]">有效卡</p></div><div className={cn(insetClassName, "p-3")}><strong className="text-lg font-black">{membership.expiringSoonCardCount}</strong><p className="mt-1 text-[11px] font-bold text-[color:var(--client-muted)]">即将到期</p></div></div><div className="mt-4 flex items-center justify-between gap-3 text-xs font-bold text-[color:var(--client-muted)]"><span>{formatDate(membership.startedAt)} 加入</span><span className="text-[color:var(--client-primary)]">查看会员卡状态 ›</span></div></div></Link>;
}

function CardFace({ card }: { card: ShopMembershipCard }) {
  const value = card.type === "stored_value" ? formatJpy((card.principalBalanceJpy ?? 0) + (card.bonusBalanceJpy ?? 0)) : card.type === "count" ? `剩余 ${card.remainingUses ?? 0} 次` : "权益会员卡";
  return <article className="relative overflow-hidden rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-primary)_30%,var(--client-line))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--client-primary)_20%,var(--client-elevated)),var(--client-surface))] p-5 shadow-[0_20px_52px_color-mix(in_srgb,var(--client-primary)_12%,transparent)]"><div aria-hidden="true" className="absolute -right-8 -top-8 h-32 w-32 rounded-full border-[22px] border-[color:color-mix(in_srgb,var(--client-primary)_10%,transparent)]" /><div className="relative flex items-start justify-between gap-3"><div><p className="text-[11px] font-black uppercase tracking-[0.15em] text-[color:var(--client-primary)]">会员卡状态</p><h3 className="mt-1 text-lg font-black">{card.name}</h3></div><CardStatusChip status={card.status} /></div><strong className="relative mt-7 block text-2xl font-black tracking-tight">{value}</strong><div className="relative mt-5 flex items-end justify-between gap-3"><div><p className="font-mono text-xs font-black tracking-[0.16em] text-[color:var(--client-muted)]">{card.cardNoMasked}</p><p className="mt-1 text-xs font-semibold text-[color:var(--client-muted)]">有效期至 {formatDate(card.expiresAt)}</p></div><span className="text-2xl text-[color:var(--client-primary)]">♡</span></div></article>;
}

function MembershipDetailView({ detail }: { detail: CustomerShopMembershipDetail }) {
  return <div className="space-y-4"><section className={panelClassName}><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-black uppercase tracking-[0.14em] text-[color:var(--client-primary)]">店铺会员</p><h1 className="mt-1 text-2xl font-black">{detail.shop.name}</h1><p className="mt-1 text-sm font-semibold text-[color:var(--client-muted)]">{detail.shop.city} · {formatDate(detail.startedAt)} 加入</p></div><MembershipStatusChip status={detail.status} /></div><Link className="mt-5 inline-flex min-h-11 items-center rounded-full border border-[color:var(--client-primary)] px-5 text-sm font-black text-[color:var(--client-primary)]" to={`/stores/${detail.shop.id}`}>查看店铺</Link></section><section><div className="mb-3 flex items-center justify-between px-1"><div><p className="text-xs font-black text-[color:var(--client-primary)]">CARD WALLET</p><h2 className="mt-0.5 text-lg font-black text-[color:var(--client-text)]">会员卡状态</h2></div><span className="text-xs font-bold text-[color:var(--client-muted)]">{detail.cards.length} 张</span></div>{detail.cards.length ? <div className="space-y-3">{detail.cards.map((card) => <CardFace card={card} key={card.publicId} />)}</div> : <StatusPanel message="店铺会员关系已生效；开卡会在后续独立步骤开放。" title="暂无会员卡" />}</section></div>;
}

export function UserMembershipsPage() {
  const navigate = useNavigate();
  const { membershipPublicId } = useParams();
  const [status, setStatus] = useState<ShopMembershipStatus>("active");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<PageState<PaginatedShopMemberships<CustomerShopMembershipListItem> | CustomerShopMembershipDetail>>({ status: "loading", data: null, message: "" });

  useEffect(() => {
    let active = true;
    setState({ status: "loading", data: null, message: "" });
    const request = membershipPublicId ? customerShopMembershipApi.detail(membershipPublicId) : customerShopMembershipApi.list({ page, pageSize: 20, status });
    request.then((data) => { if (active) setState({ status: "ready", data, message: "" }); }).catch((error) => { if (active) setState({ status: "error", data: null, message: describeError(error) }); });
    return () => { active = false; };
  }, [membershipPublicId, page, revision, status]);

  let content;
  if (state.status === "loading") content = <StatusPanel title="正在读取我的会员" />;
  else if (state.status === "error") content = <StatusPanel message={state.message} onRetry={() => setRevision((value) => value + 1)} title="会员数据读取失败" />;
  else if (membershipPublicId) content = <MembershipDetailView detail={state.data as CustomerShopMembershipDetail} />;
  else {
    const result = state.data as PaginatedShopMemberships<CustomerShopMembershipListItem>;
    content = result.list.length ? <div className="space-y-3">{result.list.map((membership) => <ShopMembershipCard key={membership.publicId} membership={membership} />)}{result.total > result.page_size ? <div className="flex items-center justify-between pt-1"><button className={cn(insetClassName, "min-h-10 px-4 text-xs font-black disabled:opacity-35")} disabled={page <= 1} onClick={() => setPage((value) => value - 1)} type="button">上一页</button><span className="text-xs font-black text-[color:var(--client-muted)]">{page} / {Math.ceil(result.total / result.page_size)}</span><button className={cn(insetClassName, "min-h-10 px-4 text-xs font-black disabled:opacity-35")} disabled={page >= Math.ceil(result.total / result.page_size)} onClick={() => setPage((value) => value + 1)} type="button">下一页</button></div> : null}</div> : <StatusPanel message="加入店铺会员后，这里会按店铺展示关系和会员卡状态。" title="还没有加入任何店铺会员" />;
  }

  return <MobileShell showBottomNav={false}><MobileFullscreenHeader action={<TestFeatureBadge />} onBack={() => navigate(membershipPublicId ? "/me/memberships" : "/me")} subtitle="已加入店铺与会员卡状态" title="我的会员" /><main className="mx-auto w-full max-w-[760px] px-4 pb-28 pt-4">{!membershipPublicId ? <div className="mb-4 flex rounded-full border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-1"><button className={cn("min-h-10 flex-1 rounded-full text-sm font-black", status === "active" ? "bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)]" : "text-[color:var(--client-muted)]")} onClick={() => { setStatus("active"); setPage(1); }} type="button">有效会员</button><button className={cn("min-h-10 flex-1 rounded-full text-sm font-black", status === "ended" ? "bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)]" : "text-[color:var(--client-muted)]")} onClick={() => { setStatus("ended"); setPage(1); }} type="button">已结束</button></div> : null}{content}</main></MobileShell>;
}
