import type { ForwardContact } from "../../lib/forwardContacts";
import type { MessageCenterContext } from "../../lib/messageCenter";
import type { Language } from "../../i18n/translations";
import { MobileShell } from "../../components/mobile/MobileShell";
import { merchantNavItems, technicianNavItems, userNavItems } from "../../components/mobile/navItems";

export type ExchangePost = {
  id: string;
  type: "demand" | "reverse";
  author: string;
  role: string;
  title: string;
  time: string;
  area: string;
  budget: number;
  budgetLabel?: string;
  detail: string;
  tags: string[];
  offers: number;
  image: string;
  publishedAt: string;
  expiresAt: string;
};

export type DemandDetail = {
  paymentLabel: string;
  paymentStatus: string;
  prepaidAmount: number;
  cashAmount: number;
  customer: {
    systemId: string;
    name: string;
    avatar: string;
    memberLevel: string;
    rating: number;
    reviewCount: number;
    completedOrders: number;
    noShowRate: string;
    languages: string;
    tags: string[];
    note: string;
  };
  reviews: Array<{
    id: string;
    rating: number;
    service: string;
    commenterName: string;
    commenterAvatar: string;
    content: string;
    date: string;
  }>;
  moments: Array<{
    id: string;
    title: string;
    content: string;
    date: string;
  }>;
};

const needoRemarkTagPattern = /#([^\s，,]+)/gu;
const unavailableErrorKey = "error.feature_unavailable";

function normalizeNeedoRemarkTag(value: string) {
  return value.replace(/^#+/u, "").trim();
}

export function extractNeedoRemarkTags(text: string) {
  const tags: string[] = [];

  for (const match of text.matchAll(needoRemarkTagPattern)) {
    const tag = normalizeNeedoRemarkTag(match[1] ?? "");

    if (tag && !tags.includes(tag)) {
      tags.push(tag);
    }
  }

  return tags;
}

export function stripNeedoRemarkTags(text: string) {
  return text
    .replace(needoRemarkTagPattern, "")
    .replace(/[^\S\r\n]{2,}/gu, " ")
    .replace(/[^\S\r\n]+([，,。；;！？!?])/gu, "$1")
    .replace(/([，,])[^\S\r\n]+/gu, "$1")
    .replace(/[，,]{2,}/gu, "，")
    .replace(/\n{3,}/gu, "\n\n")
    .replace(/^[，,\s]+|[，,\s]+$/gu, "")
    .trim();
}

export function buildNeedoPostTags(_baseTags: string[], _title: string, detail: string) {
  return Array.from(
    new Set(
      extractNeedoRemarkTags(detail)
        .map(normalizeNeedoRemarkTag)
        .filter((tag) => tag.length > 0),
    ),
  );
}

function rejectUnavailableMutation(): never {
  throw new Error(unavailableErrorKey);
}

export function submitNeedoDemandApplication(_context: MessageCenterContext, _postId: string): never {
  return rejectUnavailableMutation();
}

export function confirmNeedoReverseBooking(_context: MessageCenterContext, _postId: string): never {
  return rejectUnavailableMutation();
}

export function markNeedoPostViewed(_context: MessageCenterContext, _postId: string) {
  // No local read state is persisted while the formal capability is disabled.
}

export function useNeedoDemandApplications(_context: MessageCenterContext): string[] {
  return [];
}

export function useNeedoReverseBookings(_context: MessageCenterContext): string[] {
  return [];
}

export function useNeedoViewedPosts(_context: MessageCenterContext): string[] {
  return [];
}

export function getNeedoBasePath(context: MessageCenterContext = "user") {
  if (context === "merchant") {
    return "/merchant/needo";
  }

  if (context === "technician") {
    return "/technician/needo";
  }

  return "/needo";
}

export function getNeedoPostDetailPath(context: MessageCenterContext, postId: string) {
  return `${getNeedoBasePath(context)}/posts/${postId}`;
}

export function getNeedoPostCustomerPath(context: MessageCenterContext, postId: string) {
  return `${getNeedoPostDetailPath(context, postId)}/customer`;
}

export function getNeedoFeedPosts(_context: MessageCenterContext = "user"): ExchangePost[] {
  return [];
}

export function findNeedoPost(_context: MessageCenterContext, _postId?: string): ExchangePost | null {
  return null;
}

export function getExchangeServiceLabel(post: ExchangePost) {
  return post.type === "demand" ? "预约需求" : "服务情报";
}

export function formatCountdown(ms: number, language: Language) {
  if (ms <= 0) {
    return language === "en" ? "Expired" : "已结束";
  }

  const minutes = Math.ceil(ms / 60_000);
  return language === "en" ? `${minutes} min` : `${minutes} 分钟`;
}

export function formatExpiryDate(iso: string, language: Language) {
  const locale = language === "en" ? "en-US" : language === "ja" ? "ja-JP" : "zh-CN";
  return new Date(iso).toLocaleString(locale, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function getCountdownTone(ms: number) {
  if (ms <= 0) return "expired";
  if (ms <= 60 * 60 * 1_000) return "urgent";
  if (ms <= 6 * 60 * 60 * 1_000) return "soon";
  return "active";
}

export function getPostLikeCount(_post: ExchangePost) {
  return 0;
}

export function getPostReplyCount(_post: ExchangePost) {
  return 0;
}

export function getDemandDetail(_post: ExchangePost): DemandDetail {
  return rejectUnavailableMutation();
}

export function storeForwardedExchange(
  _context: MessageCenterContext,
  _post: ExchangePost,
  _contact: ForwardContact,
): never {
  return rejectUnavailableMutation();
}

function getNavItems(context: MessageCenterContext) {
  if (context === "merchant") return merchantNavItems;
  if (context === "technician") return technicianNavItems;
  return userNavItems;
}

export function NeedoExchangePage({ context = "user" }: { context?: MessageCenterContext }) {
  return (
    <MobileShell navItems={getNavItems(context)}>
      <main className="mx-auto flex min-h-[calc(100dvh-96px)] w-full max-w-3xl items-center justify-center px-5 py-24 text-center">
        <section className="w-full rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-6 shadow-panel">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[color:var(--client-primary)]">NeeDo Exchange</p>
          <h1 className="mt-3 text-2xl font-black text-[color:var(--client-text)]">正式需求与情报功能尚未启用</h1>
          <p className="mt-3 text-sm font-semibold leading-7 text-[color:var(--client-muted)]">
            当前不会展示或创建模拟需求、情报、发布者、身份 ID、评分、订单、互动或支付数据。完成正式数据库、身份权限、状态机和审计接口后再开放。
          </p>
        </section>
      </main>
    </MobileShell>
  );
}
