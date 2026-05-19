import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import { FeatureSegmentedTabs } from "../../components/client-ui/AppScaffold";
import { FloatingActionButton } from "../../components/mobile/FloatingActionButton";
import { FloatingHomeHeader } from "../../components/mobile/FloatingHomeHeader";
import { MobileBottomActionBar } from "../../components/mobile/MobileBottomActionBar";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileFullscreenPage } from "../../components/mobile/MobileFullscreenPage";
import { MobileShell } from "../../components/mobile/MobileShell";
import { MomentActionBar } from "../../components/mobile/MomentActionBar";
import { OfferInfoCard } from "../../components/mobile/OfferInfoCard";
import { SectionTitle } from "../../components/mobile/SectionTitle";
import { merchantNavItems, technicianNavItems, userNavItems } from "../../components/mobile/navItems";
import { AvatarImage } from "../../components/ui/AvatarImage";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { ClientActionDialog } from "../../components/ui/ClientActionDialog";
import { HighlightedTagText } from "../../components/ui/HighlightedTagText";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import { customers, imageBank, orders, stores, technicians } from "../../data/mock";
import { useI18n } from "../../i18n/I18nProvider";
import { languageLocales, type Language } from "../../i18n/translations";
import { getForwardContacts, type ForwardContact } from "../../lib/forwardContacts";
import { getForwardStorageKey, getMessagePath, type MessageCenterContext } from "../../lib/messageCenter";
import { readNeedoExternalInfoPosts } from "../../lib/needoExchangeBridge";
import { emitShareFeedback } from "../../lib/shareFeedback";
import { hashSystemId } from "../../lib/systemIds";
import { cn, yen } from "../../lib/utils";
import { SocialPostMenuActionIcon } from "../../features/social/components/UnifiedSocialUi";
import { resolveCustomerMembership } from "../../shared/profile-card/customerMembership";

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

type InfoComposerDraft = {
  title: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  recruitEndDate: string;
  recruitEndTime: string;
  serviceMode: "store" | "onsite";
  address: string;
  serviceAreas: string;
  originalPrice: string;
  campaignPrice: string;
  detail: string;
  visibilityMode: "public" | "person" | "category" | "group";
  visibilityTarget: string;
  relatedVisible: boolean;
};

type DemandComposerDraft = {
  title: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  area: string;
  budgetMin: string;
  budgetMax: string;
  detail: string;
};

type PublishSuccessState = {
  typeLabel: string;
  ndpCost: number;
  expiresInHours: number;
};

const exchangeServiceKeywordMap = [
  { label: "肩颈调理", keywords: ["肩颈"] },
  { label: "睡眠放松", keywords: ["睡眠"] },
  { label: "足部护理", keywords: ["足部"] },
  { label: "双人护理", keywords: ["双人房", "双人"] },
  { label: "深度保洁", keywords: ["保洁", "清洁"] },
  { label: "上门按摩", keywords: ["按摩"] },
  { label: "美甲护理", keywords: ["美甲"] },
  { label: "美睫护理", keywords: ["美睫"] },
  { label: "到店护理", keywords: ["到店", "护理"] }
];

const composedPostsStorageKeyPrefix = "needo.exchange.composed.v1";
const demandApplicationsStorageKeyPrefix = "needo.exchange.demand-applications.v1";
const demandApplicationsChangedEventName = "needo:demand-applications-changed";
const reverseBookingsStorageKeyPrefix = "needo.exchange.reverse-bookings.v1";
const reverseBookingsChangedEventName = "needo:reverse-bookings-changed";
const viewedPostsStorageKeyPrefix = "needo.exchange.viewed-posts.v1";
const viewedPostsChangedEventName = "needo:viewed-posts-changed";
const fullscreenHeaderClassName =
  "";

function getComposedPostsStorageKey(context: MessageCenterContext) {
  return `${composedPostsStorageKeyPrefix}.${context}`;
}

function getDemandApplicationsStorageKey(context: MessageCenterContext) {
  return `${demandApplicationsStorageKeyPrefix}.${context}`;
}

function getReverseBookingsStorageKey(context: MessageCenterContext) {
  return `${reverseBookingsStorageKeyPrefix}.${context}`;
}

function getViewedPostsStorageKey(context: MessageCenterContext) {
  return `${viewedPostsStorageKeyPrefix}.${context}`;
}

function isExchangePost(value: unknown): value is ExchangePost {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ExchangePost>;

  return (
    (candidate.type === "demand" || candidate.type === "reverse") &&
    typeof candidate.id === "string" &&
    typeof candidate.author === "string" &&
    typeof candidate.role === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.time === "string" &&
    typeof candidate.area === "string" &&
    typeof candidate.budget === "number" &&
    typeof candidate.detail === "string" &&
    Array.isArray(candidate.tags) &&
    typeof candidate.offers === "number" &&
    typeof candidate.image === "string" &&
    typeof candidate.publishedAt === "string" &&
    typeof candidate.expiresAt === "string"
  );
}

function readNeedoComposedPosts(context: MessageCenterContext) {
  if (typeof window === "undefined") {
    return [] as ExchangePost[];
  }

  try {
    const raw = window.localStorage.getItem(getComposedPostsStorageKey(context));

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isExchangePost);
  } catch {
    return [];
  }
}

function writeNeedoComposedPosts(context: MessageCenterContext, posts: ExchangePost[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(getComposedPostsStorageKey(context), JSON.stringify(posts));
}

function appendNeedoComposedPost(context: MessageCenterContext, post: ExchangePost) {
  writeNeedoComposedPosts(context, [post, ...readNeedoComposedPosts(context)]);
}

function readNeedoDemandApplications(context: MessageCenterContext) {
  if (typeof window === "undefined") {
    return [] as string[];
  }

  try {
    const raw = window.localStorage.getItem(getDemandApplicationsStorageKey(context));

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return Array.from(new Set(parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0)));
  } catch {
    return [];
  }
}

function writeNeedoDemandApplications(context: MessageCenterContext, postIds: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(getDemandApplicationsStorageKey(context), JSON.stringify(Array.from(new Set(postIds))));
}

function notifyNeedoDemandApplicationsChanged(context: MessageCenterContext) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent<{ context: MessageCenterContext }>(demandApplicationsChangedEventName, { detail: { context } }));
}

function readNeedoReverseBookings(context: MessageCenterContext) {
  if (typeof window === "undefined") {
    return [] as string[];
  }

  try {
    const raw = window.localStorage.getItem(getReverseBookingsStorageKey(context));

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return Array.from(new Set(parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0)));
  } catch {
    return [];
  }
}

function writeNeedoReverseBookings(context: MessageCenterContext, postIds: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(getReverseBookingsStorageKey(context), JSON.stringify(Array.from(new Set(postIds))));
}

function notifyNeedoReverseBookingsChanged(context: MessageCenterContext) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent<{ context: MessageCenterContext }>(reverseBookingsChangedEventName, { detail: { context } }));
}

function readNeedoViewedPosts(context: MessageCenterContext) {
  if (typeof window === "undefined") {
    return [] as string[];
  }

  try {
    const raw = window.localStorage.getItem(getViewedPostsStorageKey(context));

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return Array.from(new Set(parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0)));
  } catch {
    return [];
  }
}

function writeNeedoViewedPosts(context: MessageCenterContext, postIds: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(getViewedPostsStorageKey(context), JSON.stringify(Array.from(new Set(postIds))));
}

function notifyNeedoViewedPostsChanged(context: MessageCenterContext) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent<{ context: MessageCenterContext }>(viewedPostsChangedEventName, { detail: { context } }));
}

export function submitNeedoDemandApplication(context: MessageCenterContext, postId: string) {
  if (!postId.trim()) {
    return false;
  }

  const current = readNeedoDemandApplications(context);

  if (current.includes(postId)) {
    return false;
  }

  writeNeedoDemandApplications(context, [...current, postId]);
  notifyNeedoDemandApplicationsChanged(context);
  return true;
}

export function confirmNeedoReverseBooking(context: MessageCenterContext, postId: string) {
  if (!postId.trim()) {
    return false;
  }

  const current = readNeedoReverseBookings(context);

  if (current.includes(postId)) {
    return false;
  }

  writeNeedoReverseBookings(context, [...current, postId]);
  notifyNeedoReverseBookingsChanged(context);
  return true;
}

export function markNeedoPostViewed(context: MessageCenterContext, postId: string) {
  if (!postId.trim()) {
    return false;
  }

  const current = readNeedoViewedPosts(context);

  if (current.includes(postId)) {
    return false;
  }

  writeNeedoViewedPosts(context, [...current, postId]);
  notifyNeedoViewedPostsChanged(context);
  return true;
}

export function useNeedoDemandApplications(context: MessageCenterContext) {
  const [appliedPostIds, setAppliedPostIds] = useState<string[]>(() => readNeedoDemandApplications(context));

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const sync = () => {
      setAppliedPostIds(readNeedoDemandApplications(context));
    };

    const storageKey = getDemandApplicationsStorageKey(context);
    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== storageKey) {
        return;
      }

      sync();
    };
    const handleChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ context?: MessageCenterContext }>).detail;

      if (detail?.context && detail.context !== context) {
        return;
      }

      sync();
    };

    sync();
    window.addEventListener("storage", handleStorage);
    window.addEventListener(demandApplicationsChangedEventName, handleChanged as EventListener);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(demandApplicationsChangedEventName, handleChanged as EventListener);
    };
  }, [context]);

  return appliedPostIds;
}

export function useNeedoReverseBookings(context: MessageCenterContext) {
  const [bookedPostIds, setBookedPostIds] = useState<string[]>(() => readNeedoReverseBookings(context));

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const sync = () => {
      setBookedPostIds(readNeedoReverseBookings(context));
    };

    const storageKey = getReverseBookingsStorageKey(context);
    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== storageKey) {
        return;
      }

      sync();
    };
    const handleChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ context?: MessageCenterContext }>).detail;

      if (detail?.context && detail.context !== context) {
        return;
      }

      sync();
    };

    sync();
    window.addEventListener("storage", handleStorage);
    window.addEventListener(reverseBookingsChangedEventName, handleChanged as EventListener);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(reverseBookingsChangedEventName, handleChanged as EventListener);
    };
  }, [context]);

  return bookedPostIds;
}

export function useNeedoViewedPosts(context: MessageCenterContext) {
  const [viewedPostIds, setViewedPostIds] = useState<string[]>(() => readNeedoViewedPosts(context));

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const sync = () => {
      setViewedPostIds(readNeedoViewedPosts(context));
    };

    const storageKey = getViewedPostsStorageKey(context);
    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== storageKey) {
        return;
      }

      sync();
    };
    const handleChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ context?: MessageCenterContext }>).detail;

      if (detail?.context && detail.context !== context) {
        return;
      }

      sync();
    };

    sync();
    window.addEventListener("storage", handleStorage);
    window.addEventListener(viewedPostsChangedEventName, handleChanged as EventListener);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(viewedPostsChangedEventName, handleChanged as EventListener);
    };
  }, [context]);

  return viewedPostIds;
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

function getComposerTypeByContext(context: MessageCenterContext): "demand" | "reverse" {
  return context === "user" ? "demand" : "reverse";
}

function getComposerRoleByContext(context: MessageCenterContext) {
  return {
    user: "需求",
    merchant: "情报",
    technician: "情报"
  }[context];
}

function getDefaultInfoDraft(): InfoComposerDraft {
  const now = new Date();
  const startAt = new Date(now);
  startAt.setHours(22, 0, 0, 0);

  if (startAt.getTime() <= now.getTime()) {
    startAt.setDate(startAt.getDate() + 1);
  }

  const endAt = new Date(startAt.getTime() + 3 * 60 * 60 * 1000);
  const recruitEndAt = new Date(startAt.getTime() + 90 * 60 * 1000);

  return {
    title: "今晚 22 点后可预约，限定折扣开放中",
    startDate: toDateInputValue(startAt),
    startTime: toTimeInputValue(startAt),
    endDate: toDateInputValue(endAt),
    endTime: toTimeInputValue(endAt),
    recruitEndDate: toDateInputValue(recruitEndAt),
    recruitEndTime: toTimeInputValue(recruitEndAt),
    serviceMode: "store",
    address: "东京都港区六本木 3-2-1 Prince Tower 12F",
    serviceAreas: "新宿 / 六本木 / 涩谷 / 银座",
    originalPrice: "16000",
    campaignPrice: "12800",
    detail: "今晚到深夜还有空档，可中文 / 日语沟通，支持平台内确认后快速到店或预约。",
    visibilityMode: "public",
    visibilityTarget: "",
    relatedVisible: false
  };
}

function padTwo(value: number) {
  return String(value).padStart(2, "0");
}

function toDateInputValue(date: Date) {
  return `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}-${padTwo(date.getDate())}`;
}

function toTimeInputValue(date: Date) {
  return `${padTwo(date.getHours())}:${padTwo(date.getMinutes())}`;
}

function toDateTimeInputValue(date: string, time: string) {
  return `${date}T${time}`;
}

function parseComposerDateTime(date: string, time: string) {
  const parsed = new Date(`${date}T${time}`);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatMonthDayTime(date: Date) {
  return `${date.getMonth() + 1}月${date.getDate()}日 ${padTwo(date.getHours())}:${padTwo(date.getMinutes())}`;
}

function formatComposerDateRange(startDate: string, startTime: string, endDate: string, endTime: string) {
  const startAt = parseComposerDateTime(startDate, startTime);
  const endAt = parseComposerDateTime(endDate, endTime);

  if (!startAt || !endAt) {
    return `${startDate} ${startTime} ~ ${endDate} ${endTime}`;
  }

  return `${formatMonthDayTime(startAt)} ~ ${formatMonthDayTime(endAt)}`;
}

function getComposerDurationMs(startDate: string, startTime: string, endDate: string, endTime: string) {
  const startAt = parseComposerDateTime(startDate, startTime);
  const endAt = parseComposerDateTime(endDate, endTime);

  if (!startAt || !endAt) {
    return null;
  }

  return endAt.getTime() - startAt.getTime();
}

function getDefaultDemandDraft(context: MessageCenterContext): DemandComposerDraft {
  const now = new Date();
  const startAt = new Date(now);
  startAt.setHours(22, 0, 0, 0);

  if (startAt.getTime() <= now.getTime()) {
    startAt.setDate(startAt.getDate() + 1);
  }

  const endAt = new Date(startAt.getTime() + 2 * 60 * 60 * 1000);

  return {
    title: context === "user" ? "今晚六本木酒店需要 2 位技师" : "今晚 22 点后有空闲，可 8 折预约",
    startDate: toDateInputValue(startAt),
    startTime: toTimeInputValue(startAt),
    endDate: toDateInputValue(endAt),
    endTime: toTimeInputValue(endAt),
    area: context === "user" ? "六本木 · 王子酒店" : "新宿 / 六本木",
    budgetMin: context === "user" ? "42000" : "12800",
    budgetMax: context === "user" ? "52000" : "16000",
    detail: context === "user" ? "需要 2 位技师，偏好中文沟通，预算可谈。" : "可移动到附近区域，支持平台内通话确认。"
  };
}

function clampDemandDraftDuration(draft: DemandComposerDraft) {
  const startAt = parseComposerDateTime(draft.startDate, draft.startTime);
  const endAt = parseComposerDateTime(draft.endDate, draft.endTime);

  if (!startAt || !endAt) {
    return draft;
  }

  const maxEndAt = new Date(startAt.getTime() + 24 * 60 * 60 * 1000);
  let nextEndAt = endAt;

  if (endAt.getTime() <= startAt.getTime()) {
    nextEndAt = new Date(startAt.getTime() + 60 * 60 * 1000);
  } else if (endAt.getTime() > maxEndAt.getTime()) {
    nextEndAt = maxEndAt;
  }

  if (nextEndAt.getTime() === endAt.getTime()) {
    return draft;
  }

  return {
    ...draft,
    endDate: toDateInputValue(nextEndAt),
    endTime: toTimeInputValue(nextEndAt)
  };
}

function getDemandDurationHours(draft: DemandComposerDraft) {
  const startAt = parseComposerDateTime(draft.startDate, draft.startTime);
  const endAt = parseComposerDateTime(draft.endDate, draft.endTime);

  if (!startAt || !endAt || endAt.getTime() <= startAt.getTime()) {
    return 1;
  }

  return Math.min(24, Math.max(1, Math.ceil((endAt.getTime() - startAt.getTime()) / (60 * 60 * 1000))));
}

function getDemandMaxEndInputValue(draft: DemandComposerDraft) {
  const startAt = parseComposerDateTime(draft.startDate, draft.startTime);

  if (!startAt) {
    return undefined;
  }

  const maxEndAt = new Date(startAt.getTime() + 24 * 60 * 60 * 1000);

  return toDateTimeInputValue(toDateInputValue(maxEndAt), toTimeInputValue(maxEndAt));
}

function formatDemandBudgetRange(draft: Pick<DemandComposerDraft, "budgetMin" | "budgetMax">) {
  const left = Number(draft.budgetMin) || 0;
  const right = Number(draft.budgetMax) || left;
  const min = Math.min(left, right);
  const max = Math.max(left, right);

  if (min === 0 && max === 0) {
    return "未填写预算";
  }

  return min === max ? yen(min) : `${yen(min)} ~ ${yen(max)}`;
}

function getDemandBudgetValue(draft: DemandComposerDraft) {
  return Math.max(Number(draft.budgetMin) || 0, Number(draft.budgetMax) || 0);
}

function getPublishNdpCost(type: ExchangePost["type"], budget: number) {
  if (type === "reverse") {
    return 6;
  }

  return Math.min(36, Math.max(12, 8 + Math.ceil(budget / 10000) * 2));
}

function getContextSeedCopy(context: MessageCenterContext) {
  return {
    user: {
      primaryTab: "all" as const,
      author: customers[0].name,
      role: "客户"
    },
    merchant: {
      primaryTab: "demand" as const,
      author: stores[0].name,
      role: "店铺"
    },
    technician: {
      primaryTab: "demand" as const,
      author: technicians[0].nickname ?? technicians[0].name,
      role: "个人技师"
    }
  }[context];
}

function getSeedPosts(): ExchangePost[] {
  const now = Date.now();
  const inHours = (hours: number) => new Date(now + hours * 60 * 60 * 1000).toISOString();
  const agoHours = (hours: number) => new Date(now - hours * 60 * 60 * 1000).toISOString();
  return [
  {
    id: "demand-1",
    type: "demand",
    author: "匿名客人 A",
    role: "需求",
    title: "今晚六本木王子酒店需要 2 位技师",
    time: "22:00 - 24:00",
    area: "六本木 · 王子酒店",
    budget: 42000,
    detail: "需要肩颈和腿部放松，偏好会中文或英文，身高 160cm 以上，外形清爽，酒店前台可登记。",
    tags: ["2 位技师", "酒店", "中文 OK", "预算明确"],
    offers: 12,
    image: imageBank.massage,
    publishedAt: agoHours(1.5),
    expiresAt: inHours(4)
  },
  {
    id: "reverse-1",
    type: "reverse",
    author: technicians[0].nickname ?? technicians[0].name,
    role: "情报",
    title: "今晚新宿到六本木可移动，临时 8 折",
    time: "22:00 - 01:00",
    area: "新宿 / 六本木 / 涩谷",
    budget: 12800,
    detail: "肩颈调理、睡眠放松可接，女性技师，可中文沟通，平台内通话确认后出发。",
    tags: ["8 折", "女性可选", "可移动", "中文"],
    offers: 38,
    image: technicians[0].avatar,
    publishedAt: agoHours(2),
    expiresAt: inHours(5.5)
  },
  {
    id: "demand-2",
    type: "demand",
    author: "Mia Chen",
    role: "需求",
    title: "明天银座门店护理，希望有双人房",
    time: "明天 19:30",
    area: "银座",
    budget: 36000,
    detail: "两人到店，想要 90 分钟肩颈和睡眠护理，希望环境安静，可以英文沟通。",
    tags: ["到店", "双人", "英文", "安静环境"],
    offers: 7,
    image: imageBank.salon,
    publishedAt: agoHours(3),
    expiresAt: inHours(18)
  },
  {
    id: "reverse-2",
    type: "reverse",
    author: stores[0].name,
    role: "情报",
    title: "20:30 后还有 3 个空档，会员 8 折",
    time: "20:30 - 23:00",
    area: "银座",
    budget: 9800,
    detail: "肩颈、足部、睡眠护理都可以约，支持双人房，店内有中文员工。",
    tags: ["店铺空档", "8 折", "双人房", "中文员工"],
    offers: 26,
    image: stores[0].cover,
    publishedAt: agoHours(1),
    expiresAt: inHours(3.5)
  }
  ];
}

function getExtraPosts() {
  const now = Date.now();
  const toIso = (offsetHours: number) => new Date(now + offsetHours * 60 * 60 * 1000).toISOString();
  return Array.from({ length: 24 }, (_, index): ExchangePost => {
    const demand = index % 2 === 0;
    const area = ["新宿", "涩谷", "银座", "池袋", "品川", "六本木"][index % 6];
    const publishOffset = -((index % 5) + 1);
    const expireOffset = demand ? 2 + (index % 9) : 4 + (index % 12);

    return {
      id: `operated-${index + 1}`,
      type: demand ? "demand" : "reverse",
      author:
        demand
          ? `客人 ${String.fromCharCode(65 + (index % 8))}`
          : index % 3 === 0
            ? stores[index % stores.length].name
            : technicians[index % technicians.length].nickname ?? technicians[index % technicians.length].name,
      role: demand ? "需求" : "情报",
      title: demand ? `${area} 临时预约 ${index % 3 === 0 ? "双人按摩" : "深度保洁"}` : `${area} 今晚有空档，可随时预约`,
      time: `${18 + (index % 5)}:00 - ${20 + (index % 4)}:30`,
      area,
      budget: demand ? 18000 + index * 900 : 7800 + index * 350,
      detail: demand
        ? "希望响应快、评价高，能提前确认交通和到达时间。接受平台担保和加急费用。"
        : "当前有空闲时段，可接近距离订单，支持平台内通话确认后快速锁定。",
      tags: demand ? ["急单", "评价优先", "平台担保"] : ["空闲", "限时价", "可沟通"],
      offers: 3 + (index % 18),
      image: demand ? imageBank.home : index % 3 === 0 ? stores[index % stores.length].cover : technicians[index % technicians.length].avatar,
      publishedAt: toIso(publishOffset),
      expiresAt: toIso(expireOffset)
    };
  });
}

export function getNeedoFeedPosts(context: MessageCenterContext = "user") {
  return [...readNeedoComposedPosts(context), ...readNeedoExternalInfoPosts(), ...getSeedPosts(), ...getExtraPosts()].sort(
    (left, right) => new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime()
  );
}

export function findNeedoPost(context: MessageCenterContext, postId?: string) {
  return getNeedoFeedPosts(context).find((post) => post.id === postId) ?? null;
}

export function getExchangeServiceLabel(post: ExchangePost) {
  const haystack = `${post.title} ${post.detail} ${post.tags.join(" ")}`;
  const matchedLabel = exchangeServiceKeywordMap.find(({ keywords }) => keywords.some((keyword) => haystack.includes(keyword)))?.label;

  if (matchedLabel) {
    return matchedLabel;
  }

  const tagHint = post.tags.find((tag) => /护理|调理|保洁|按摩|美甲|美睫|清洗|放松/.test(tag));

  if (tagHint) {
    return tagHint;
  }

  if (post.type === "demand") {
    return "预约需求";
  }

  const isStorePost = post.role.includes("店铺") || stores.some((store) => store.name === post.author);

  return isStorePost ? "店铺服务" : "个人服务";
}

function getNeedoCardRoleLabel(post: ExchangePost) {
  return post.type === "demand" ? "需求" : "情报";
}

export function formatCountdown(ms: number, language: Language) {
  if (ms <= 0) {
    return {
      zh: "已过期",
      "zh-Hant": "已過期",
      ja: "掲載終了",
      en: "Expired",
      ko: "만료됨"
    }[language];
  }

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return {
      zh: `剩余 ${days}天 ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
      "zh-Hant": `剩餘 ${days}天 ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
      ja: `残り ${days}日 ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
      en: `${days}d ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")} left`,
      ko: `${days}일 ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")} 남음`
    }[language];
  }

  return {
    zh: `剩余 ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
    "zh-Hant": `剩餘 ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
    ja: `残り ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
    en: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")} left`,
    ko: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")} 남음`
  }[language];
}

export function formatExpiryDate(iso: string, language: Language) {
  return new Date(iso).toLocaleString(languageLocales[language], {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function getCountdownTone(ms: number) {
  if (ms <= 0) {
    return "expired";
  }

  if (ms <= 60 * 60 * 1000) {
    return "urgent";
  }

  if (ms <= 6 * 60 * 60 * 1000) {
    return "soon";
  }

  return "active";
}

const customerAvatars = [
  "/images/generated/profiles/profile-08.jpg",
  "/images/generated/profiles/profile-09.jpg",
  "/images/generated/profiles/profile-10.jpg",
  "/images/generated/profiles/profile-11.jpg"
];

const reviewTemplates = [
  {
    service: "上门按摩",
    commenterName: technicians[0].nickname ?? technicians[0].name,
    commenterAvatar: technicians[0].avatar,
    content: "预约前沟通很清楚，地址和时间确认及时，服务完成后付款也很顺利。",
    date: "2026-04-09"
  },
  {
    service: "家庭保洁",
    commenterName: technicians[1].nickname ?? technicians[1].name,
    commenterAvatar: technicians[1].avatar,
    content: "客人提前整理了动线，现场配合度高，特殊要求写得很具体。",
    date: "2026-04-02"
  },
  {
    service: "到店护理",
    commenterName: stores[0].name,
    commenterAvatar: stores[0].cover,
    content: "按时到店，备注里的语言偏好和房型要求都提前说明了。",
    date: "2026-03-26"
  }
];

const momentTemplates = [
  {
    title: "最近收藏了夜间护理",
    content: "晚上 22 点后更方便预约，希望能提前确认交通和担当者。",
    date: "4 月 11 日"
  },
  {
    title: "服务偏好更新",
    content: "偏好中文或英文沟通，酒店上门需要先确认前台登记方式。",
    date: "4 月 7 日"
  },
  {
    title: "给服务人员的提醒",
    content: "到达前 10 分钟用平台内通话联系即可，不方便接私人电话。",
    date: "3 月 29 日"
  }
];

function getPostSeed(post: ExchangePost) {
  return Array.from(post.id).reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

export function getPostLikeCount(post: ExchangePost) {
  return post.offers + 18 + (getPostSeed(post) % 41);
}

export function getPostReplyCount(post: ExchangePost) {
  return Math.max(1, Math.floor(post.offers / 2) + 2 + (getPostSeed(post) % 5));
}

export function getDemandDetail(post: ExchangePost): DemandDetail {
  const seed = getPostSeed(post);
  const prepaid = seed % 3 !== 0;
  const fullyPrepaid = prepaid && seed % 2 === 0;
  const prepaidAmount = prepaid ? (fullyPrepaid ? post.budget : Math.round(post.budget * 0.3)) : 0;
  const cashAmount = Math.max(0, post.budget - prepaidAmount);
  const rating = 4.6 + ((seed % 4) * 0.1);
  const customerName = post.author.startsWith("匿名") ? "已实名客人（昵称隐藏）" : post.author;
  const matchedCustomer = customers.find((customer) => customer.name === customerName);
  const memberLevel = matchedCustomer ? resolveCustomerMembership(matchedCustomer.memberLevel).label : seed % 2 === 0 ? "钻石会员" : "黄金会员";

  return {
    paymentLabel: prepaid ? fullyPrepaid ? "已全额预付" : "已预付定金" : "现金支付",
    paymentStatus: prepaid
      ? fullyPrepaid
        ? "平台担保已锁定全款，服务完成后自动结算。"
        : "平台担保已锁定定金，尾款可通过平台或现金确认。"
      : "客人选择到场现金支付，平台会保留订单确认和沟通记录。",
    prepaidAmount,
    cashAmount,
    customer: {
      systemId: matchedCustomer?.systemId ?? hashSystemId("u", `${post.id}-${post.author}`),
      name: customerName,
      avatar: matchedCustomer?.avatar ?? customerAvatars[seed % customerAvatars.length],
      memberLevel,
      rating: Number(rating.toFixed(1)),
      reviewCount: matchedCustomer ? Math.max(18, matchedCustomer.orderCount * 2) : 18 + (seed % 42),
      completedOrders: matchedCustomer?.orderCount ?? 24 + (seed % 76),
      noShowRate: `${seed % 3}%`,
      languages: seed % 2 === 0 ? "中文 / 日本語" : "English / 日本語",
      tags: matchedCustomer ? matchedCustomer.tags.slice(0, 3) : ["平台实名", "沟通及时", seed % 2 === 0 ? "预付偏好" : "现金偏好"],
      note: "该客人历史履约稳定，平台建议接单前确认到达方式、服务人数和酒店登记规则。"
    },
    reviews: reviewTemplates.map((review, index) => ({
      ...review,
      id: `${post.id}-review-${index}`,
      rating: Number((4.7 + ((seed + index) % 3) * 0.1).toFixed(1))
    })),
    moments: momentTemplates.map((moment, index) => ({
      ...moment,
      id: `${post.id}-moment-${index}`
    }))
  };
}

function getNavItems(context: MessageCenterContext) {
  if (context === "merchant") {
    return merchantNavItems;
  }

  if (context === "technician") {
    return technicianNavItems;
  }

  return userNavItems;
}

export function storeForwardedExchange(context: MessageCenterContext, post: ExchangePost, contact: ForwardContact) {
  if (typeof window === "undefined") {
    return;
  }

  const key = getForwardStorageKey(context);
  const content = `【NeeDo转发】${post.type === "demand" ? "需求" : "情报"} · ${post.title}\n时间：${post.time}\n地点：${post.area}\n预算：${post.budgetLabel ?? yen(post.budget)}\n${post.detail}`;

  try {
    const stored = window.localStorage.getItem(key);
    const current = stored ? JSON.parse(stored) as Array<{ id: string; conversationId: string; content: string; at: string }> : [];
    window.localStorage.setItem(key, JSON.stringify([
      ...current,
      {
        id: `exchange-forward-${post.id}-${Date.now()}`,
        conversationId: contact.conversationId,
        content,
        at: "刚刚"
      }
    ]));
  } catch {
    window.localStorage.setItem(key, JSON.stringify([
      {
        id: `exchange-forward-${post.id}-${Date.now()}`,
        conversationId: contact.conversationId,
        content,
        at: "刚刚"
      }
    ]));
  }
}

function NeedoComposerIcon() {
  return (
    <svg aria-hidden="true" className="h-[42px] w-[42px] overflow-visible" fill="none" viewBox="0 0 32 32">
      <defs>
        <mask id="needo-compose-bubble-gap" maskUnits="userSpaceOnUse">
          <rect fill="white" height="32" width="32" />
          <path d="M14.4 18.2 25.15 8.35" stroke="black" strokeLinecap="round" strokeWidth="4.5" />
        </mask>
      </defs>
      <path d="M10 9.6h10.6a3.1 3.1 0 0 1 3.1 3.1v4.9a3.1 3.1 0 0 1-3.1 3.1h-5.7l-5.1 3.35a.7.7 0 0 1-1.09-.58v-2.9A3.1 3.1 0 0 1 6.9 17.6v-4.9A3.1 3.1 0 0 1 10 9.6Z" mask="url(#needo-compose-bubble-gap)" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.65" />
      <path d="m11.15 15.15 3.25 3.05L25.15 8.35" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.85" />
    </svg>
  );
}

function NeedoUploadIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M12 16V7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="m8.5 10.5 3.5-3.5 3.5 3.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M5 16.5v1a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-1" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <rect height="14" rx="3" stroke="currentColor" strokeWidth="2" width="18" x="3" y="5" />
    </svg>
  );
}

function NeedoUploadTile({
  image,
  index,
  onClick
}: {
  image?: string;
  index: number;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "relative aspect-square overflow-hidden rounded-lg border text-left transition",
        image
          ? "border-line bg-paper"
          : "border-dashed border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] text-[color:var(--client-muted)] hover:border-[color:var(--client-primary)] hover:text-[color:var(--client-primary)]"
      )}
      onClick={onClick}
      type="button"
    >
      {image ? (
        <>
          <img alt={`展示图 ${index + 1}`} className="h-full w-full object-cover" src={image} />
          <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-1 text-[10px] font-black text-white backdrop-blur-sm">
            第 {index + 1} 张
          </span>
        </>
      ) : (
        <span className="flex h-full flex-col items-center justify-center gap-2 px-2 text-center">
          <NeedoUploadIcon className="h-6 w-6" />
          <span className="text-[11px] font-black tracking-[0.04em]">上传</span>
        </span>
      )}
    </button>
  );
}

function NeedoExchangeCardActionMenu({
  translated,
  onTranslate,
  onReport,
  onBlock
}: {
  translated: boolean;
  onTranslate: () => void;
  onReport: () => void;
  onBlock: () => void;
}) {
  const menuItemClassName =
    "flex w-full items-center gap-2 rounded-[14px] px-3 py-2 text-left text-sm font-semibold transition hover:bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)]";
  const runMenuAction = (event: MouseEvent<HTMLButtonElement>, action: () => void) => {
    event.stopPropagation();
    event.currentTarget.closest("details")?.removeAttribute("open");
    action();
  };

  return (
    <details className="relative" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <summary
        aria-label="更多操作"
        className="cursor-pointer list-none rounded-full p-2 text-[color:var(--client-muted)] transition hover:bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] [&::-webkit-details-marker]:hidden"
      >
        <span className="sr-only">更多操作</span>
        <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
          <path d="M12 6.5a1.5 1.5 0 1 0 0 .01M12 12a1.5 1.5 0 1 0 0 .01M12 17.5a1.5 1.5 0 1 0 0 .01" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
        </svg>
      </summary>
      <div className="absolute right-0 top-[calc(100%+8px)] z-30 min-w-[184px] rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_94%,transparent)] p-2 text-[color:var(--client-text)] shadow-[0_18px_42px_rgba(0,0,0,0.16)] backdrop-blur-xl">
        <button className={cn(menuItemClassName, translated ? "text-[color:var(--client-primary)]" : undefined)} onClick={(event) => runMenuAction(event, onTranslate)} type="button">
          <SocialPostMenuActionIcon name="translate" />
          <span>翻译</span>
        </button>
        <button className={menuItemClassName} onClick={(event) => runMenuAction(event, onReport)} type="button">
          <SocialPostMenuActionIcon name="report" />
          <span>举报</span>
        </button>
        <button className={menuItemClassName} onClick={(event) => runMenuAction(event, onBlock)} type="button">
          <SocialPostMenuActionIcon className="text-[color:var(--client-text)]" name="block" />
          <span>屏蔽</span>
        </button>
      </div>
    </details>
  );
}

export function NeedoExchangePage({ context = "user" }: { context?: MessageCenterContext }) {
  const navigate = useNavigate();
  const copy = getContextSeedCopy(context);
  const { language } = useI18n();
  const [searchParams] = useSearchParams();
  const demandImageInputRef = useRef<HTMLInputElement | null>(null);
  const infoImageInputRef = useRef<HTMLInputElement | null>(null);
  const requestedTab = searchParams.get("tab");
  const initialActiveType =
    requestedTab === "all" || requestedTab === "demand" || requestedTab === "reverse" ? requestedTab : copy.primaryTab;
  const [activeType, setActiveType] = useState<"all" | "demand" | "reverse">(initialActiveType);
  const [posts, setPosts] = useState<ExchangePost[]>(() => getNeedoFeedPosts(context));
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showComposer, setShowComposer] = useState(false);
  const [composerStep, setComposerStep] = useState<"edit" | "preview">("edit");
  const [publishSuccess, setPublishSuccess] = useState<PublishSuccessState | null>(null);
  const [sharePost, setSharePost] = useState<ExchangePost | null>(null);
  const [sharedContact, setSharedContact] = useState<ForwardContact | null>(null);
  const [likedPostIds, setLikedPostIds] = useState<string[]>([]);
  const [translatedPostIds, setTranslatedPostIds] = useState<string[]>([]);
  const [blockedPostIds, setBlockedPostIds] = useState<string[]>([]);
  const [replyBoosts, setReplyBoosts] = useState<Record<string, number>>({});
  const appliedDemandPostIds = useNeedoDemandApplications(context);
  const bookedReversePostIds = useNeedoReverseBookings(context);
  const viewedPostIds = useNeedoViewedPosts(context);
  const [draft, setDraft] = useState<DemandComposerDraft>(() => getDefaultDemandDraft(context));
  const [demandImages, setDemandImages] = useState<string[]>([]);
  const [infoDraft, setInfoDraft] = useState<InfoComposerDraft>(getDefaultInfoDraft);
  const [infoImages, setInfoImages] = useState<string[]>([
    imageBank.home,
    imageBank.salon,
    stores[0].cover
  ]);
  const blockedPostIdSet = useMemo(() => new Set(blockedPostIds), [blockedPostIds]);
  const visiblePosts = posts.filter((post) => (activeType === "all" || post.type === activeType) && !blockedPostIdSet.has(post.id));
  const composerType = getComposerTypeByContext(context);
  const canComposeOnActiveTab = activeType === "all" || activeType === composerType;
  const forwardContacts = getForwardContacts(context);
  const homePath = context === "merchant" ? "/merchant" : context === "technician" ? "/technician" : "/";
  const nearbyStoresPath = "/categories?type=store";
  const nearbyTechniciansPath = "/categories?type=technician";
  const infoEndAt = `${infoDraft.endDate}T${infoDraft.endTime}`;
  const infoRecruitEndAt = `${infoDraft.recruitEndDate}T${infoDraft.recruitEndTime}`;
  const infoRecruitInvalid = new Date(infoRecruitEndAt).getTime() > new Date(infoEndAt).getTime();
  const infoDurationMs = getComposerDurationMs(infoDraft.startDate, infoDraft.startTime, infoDraft.endDate, infoDraft.endTime);
  const infoDurationInvalid = infoDurationMs === null || infoDurationMs <= 0 || infoDurationMs > 24 * 60 * 60 * 1000;
  const infoTargetLabel = infoDraft.visibilityMode === "public"
    ? "公开"
    : infoDraft.visibilityMode === "person"
      ? "仅指定对象"
      : infoDraft.visibilityMode === "category"
        ? "仅指定分类"
        : "仅指定群组";
  const composerTypeLabel = composerType === "demand" ? "需求" : "情报";
  const demandTimeLabel = formatComposerDateRange(draft.startDate, draft.startTime, draft.endDate, draft.endTime);
  const demandBudgetLabel = formatDemandBudgetRange(draft);
  const appliedDemandPostIdSet = useMemo(() => new Set(appliedDemandPostIds), [appliedDemandPostIds]);
  const bookedReversePostIdSet = useMemo(() => new Set(bookedReversePostIds), [bookedReversePostIds]);
  const viewedPostIdSet = useMemo(() => new Set(viewedPostIds), [viewedPostIds]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (requestedTab === "all" || requestedTab === "demand" || requestedTab === "reverse") {
      setActiveType(requestedTab);
    }
  }, [requestedTab]);

  const postRuntime = useMemo(() => {
    return Object.fromEntries(
      posts.map((post) => {
        const remainingMs = new Date(post.expiresAt).getTime() - nowMs;
        return [
          post.id,
          {
            remainingMs,
            expired: remainingMs <= 0,
            label: formatCountdown(remainingMs, language),
            tone: getCountdownTone(remainingMs)
          }
        ];
      })
    );
  }, [language, nowMs, posts]);

  const openDemandDetail = (post: ExchangePost) => {
    markNeedoPostViewed(context, post.id);
    navigate(getNeedoPostDetailPath(context, post.id));
  };

  const togglePostLike = (postId: string) => {
    setLikedPostIds((current) =>
      current.includes(postId) ? current.filter((item) => item !== postId) : [...current, postId]
    );
  };

  const togglePostTranslation = (postId: string) => {
    setTranslatedPostIds((current) =>
      current.includes(postId) ? current.filter((item) => item !== postId) : [...current, postId]
    );
  };

  const reportPost = (post: ExchangePost) => {
    emitShareFeedback({
      type: "toast",
      message: `已收到${post.type === "demand" ? "需求" : "情报"}举报`
    });
  };

  const blockPost = (post: ExchangePost) => {
    setBlockedPostIds((current) => (current.includes(post.id) ? current : [...current, post.id]));
    emitShareFeedback({
      type: "toast",
      message: `已屏蔽这条${post.type === "demand" ? "需求" : "情报"}`
    });
  };

  const bumpPostReply = (postId: string) => {
    setReplyBoosts((current) => ({ ...current, [postId]: (current[postId] ?? 0) + 1 }));
  };

  const updateDemandDraft = (patch: Partial<DemandComposerDraft>) => {
    setDraft((current) => clampDemandDraftDuration({ ...current, ...patch }));
  };

  const resetInfoComposer = () => {
    setInfoDraft(getDefaultInfoDraft());
    setInfoImages([imageBank.home, imageBank.salon, stores[0].cover]);
    setComposerStep("edit");
  };

  const closeComposer = () => {
    if (composerType === "reverse") {
      const shouldDiscard = window.confirm("要放弃本次投稿吗？当前填写的内容将不会保留。");

      if (!shouldDiscard) {
        return;
      }

      resetInfoComposer();
    }

    setShowComposer(false);
  };

  const handleDemandImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(0, 3 - demandImages.length);

    if (files.length === 0) {
      return;
    }

    const nextImages = files.map((file) => URL.createObjectURL(file));
    setDemandImages((current) => [...current, ...nextImages].slice(0, 3));
    event.target.value = "";
  };

  const handleInfoImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).slice(0, 9 - infoImages.length);

    if (files.length === 0) {
      return;
    }

    const nextImages = files.map((file) => URL.createObjectURL(file));
    setInfoImages((current) => [...current, ...nextImages].slice(0, 9));
    event.target.value = "";
  };

  const publish = () => {
    if (composerType === "demand" && !draft.title.trim()) {
      return;
    }

    if (composerType === "reverse" && (!infoDraft.title.trim() || infoRecruitInvalid || infoDurationInvalid)) {
      return;
    }

    const nextPostType = getComposerTypeByContext(context);
    const normalizedDemandDraft = clampDemandDraftDuration(draft);
    const demandBudgetValue = getDemandBudgetValue(normalizedDemandDraft);
    const publishedDurationHours = nextPostType === "demand" ? getDemandDurationHours(normalizedDemandDraft) : 6;
    const ndpCost = getPublishNdpCost(nextPostType, nextPostType === "demand" ? demandBudgetValue : Number(infoDraft.campaignPrice) || 0);
    const createdPost: ExchangePost = {
      id: `exchange-${Date.now()}`,
      type: nextPostType,
      author: copy.author,
      role: getComposerRoleByContext(context),
      title: nextPostType === "demand" ? normalizedDemandDraft.title : infoDraft.title,
      time: nextPostType === "demand" ? formatComposerDateRange(normalizedDemandDraft.startDate, normalizedDemandDraft.startTime, normalizedDemandDraft.endDate, normalizedDemandDraft.endTime) : formatComposerDateRange(infoDraft.startDate, infoDraft.startTime, infoDraft.endDate, infoDraft.endTime),
      area: nextPostType === "demand" ? normalizedDemandDraft.area : infoDraft.serviceMode === "store" ? infoDraft.address : infoDraft.serviceAreas,
      budget: nextPostType === "demand" ? demandBudgetValue : Number(infoDraft.campaignPrice) || 0,
      budgetLabel: nextPostType === "demand" ? formatDemandBudgetRange(normalizedDemandDraft) : undefined,
      detail: nextPostType === "demand" ? normalizedDemandDraft.detail : infoDraft.detail,
      tags: nextPostType === "demand" ? ["新需求", "等待抢单", "平台担保"] : ["情报", "空档", "可立即约"],
      offers: 0,
      image:
        nextPostType === "reverse"
          ? infoImages[0] ?? (context === "merchant" ? stores[0].cover : technicians[0].avatar)
          : demandImages[0] ?? (context === "merchant" ? stores[0].cover : context === "technician" ? technicians[0].avatar : imageBank.home),
      publishedAt: new Date().toISOString(),
      expiresAt: nextPostType === "demand"
        ? new Date(Date.now() + publishedDurationHours * 60 * 60 * 1000).toISOString()
        : new Date(`${infoDraft.recruitEndDate}T${infoDraft.recruitEndTime}`).toISOString()
    };

    appendNeedoComposedPost(context, createdPost);
    setPosts((current) => [createdPost, ...current]);
    setPublishSuccess({
      typeLabel: nextPostType === "demand" ? "需求" : "情报",
      ndpCost,
      expiresInHours: nextPostType === "demand" ? publishedDurationHours : Math.max(1, Math.ceil((new Date(createdPost.expiresAt).getTime() - Date.now()) / (60 * 60 * 1000)))
    });
    if (nextPostType === "reverse") {
      resetInfoComposer();
    }
    setShowComposer(false);
  };

  const forwardExchangePost = (contact: ForwardContact) => {
    if (!sharePost) {
      return;
    }

    storeForwardedExchange(context, sharePost, contact);
    setSharedContact(contact);
  };

  const navigateFromPublishSuccess = (to: string) => {
    setPublishSuccess(null);
    navigate(to);
  };

  return (
    <MobileShell navItems={getNavItems(context)}>
      <FloatingHomeHeader
        className="relative z-10"
        panelClassName="relative overflow-hidden border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--client-surface)_92%,transparent),color-mix(in_srgb,var(--client-bg)_72%,var(--client-primary)_12%))] shadow-[0_18px_40px_rgba(0,0,0,0.1)]"
      >
        <FeatureSegmentedTabs
          className="client-feature-segmented-tabs--single-frame"
          items={[
            { label: "全部", value: "all" },
            { label: "需求", value: "demand" },
            { label: "情报", value: "reverse" }
          ]}
          onChange={(nextValue) => setActiveType(nextValue)}
          value={activeType}
        />
      </FloatingHomeHeader>

      <div className="space-y-4 px-4 pb-4">

        {showComposer && (
          <MobileFullscreenPage>
            <MobileFullscreenHeader
              className={fullscreenHeaderClassName}
              onClose={closeComposer}
              title={composerType === "demand" ? "发送需求" : composerStep === "preview" ? "预览情报" : "发送情报"}
            />

            {composerType === "demand" ? (
              <>
                <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-28">
                  <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
                    <TitleWithInfo
                      as="h3"
                      info="写清楚时间、地点、人数、预算和偏好，个人、技师或店铺就能抢单。"
                      label="告诉平台你想要什么说明"
                      title="告诉平台你想要什么"
                      titleClassName="font-black"
                      variant="paper"
                    />
                  </section>

                  <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
                    <div className="grid gap-3">
                      <label className="block text-xs font-black text-ink/55">
                        类型
                        <div className="mt-1 flex h-11 w-full items-center rounded-lg border border-line bg-paper px-3 text-sm font-black text-ink">
                          {composerTypeLabel}
                        </div>
                      </label>
                      <label className="block text-xs font-black text-ink/55">
                        标题
                        <input
                          className="mt-1 h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none"
                          onChange={(event) => updateDemandDraft({ title: event.target.value })}
                          value={draft.title}
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="block text-xs font-black text-ink/55">
                          开始时间
                          <input
                            className="mt-1 h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none"
                            onChange={(event) => {
                              const [startDate, startTime] = event.target.value.split("T");
                              if (startDate && startTime) {
                                updateDemandDraft({ startDate, startTime });
                              }
                            }}
                            type="datetime-local"
                            value={toDateTimeInputValue(draft.startDate, draft.startTime)}
                          />
                        </label>
                        <label className="block text-xs font-black text-ink/55">
                          结束时间
                          <input
                            className="mt-1 h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none"
                            max={getDemandMaxEndInputValue(draft)}
                            min={toDateTimeInputValue(draft.startDate, draft.startTime)}
                            onChange={(event) => {
                              const [endDate, endTime] = event.target.value.split("T");
                              if (endDate && endTime) {
                                updateDemandDraft({ endDate, endTime });
                              }
                            }}
                            type="datetime-local"
                            value={toDateTimeInputValue(draft.endDate, draft.endTime)}
                          />
                        </label>
                      </div>
                      <label className="block text-xs font-black text-ink/55">
                        地点
                        <input
                          className="mt-1 h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none"
                          onChange={(event) => updateDemandDraft({ area: event.target.value })}
                          value={draft.area}
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <label className="block text-xs font-black text-ink/55">
                          预算下限（日元）
                          <input
                            className="mt-1 h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none"
                            inputMode="numeric"
                            onChange={(event) => updateDemandDraft({ budgetMin: event.target.value })}
                            value={draft.budgetMin}
                          />
                        </label>
                        <label className="block text-xs font-black text-ink/55">
                          预算上限（日元）
                          <input
                            className="mt-1 h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none"
                            inputMode="numeric"
                            onChange={(event) => updateDemandDraft({ budgetMax: event.target.value })}
                            value={draft.budgetMax}
                          />
                        </label>
                      </div>
                      <label className="block text-xs font-black text-ink/55">
                        详细要求
                        <textarea
                          className="mt-1 min-h-36 w-full resize-none rounded-lg border border-line bg-paper p-3 text-sm leading-6 outline-none"
                          onChange={(event) => updateDemandDraft({ detail: event.target.value })}
                          placeholder="例如：到店前请先平台内联系，支持中文沟通 #夜间可约 #六本木"
                          value={draft.detail}
                        />
                      </label>
                    </div>
                  </section>

                  <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
                    <TitleWithInfo
                      as="h3"
                      info="可上传现场照片、位置示意或服务参考图，首张会作为卡片封面。"
                      label="上传参考图说明"
                      title="上传参考图"
                      titleClassName="font-black"
                      variant="paper"
                    />
                    <input accept="image/*" className="hidden" multiple onChange={handleDemandImageUpload} ref={demandImageInputRef} type="file" />
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {Array.from({ length: 3 }, (_, index) => (
                        <NeedoUploadTile
                          image={demandImages[index]}
                          index={index}
                          key={`demand-image-${index}`}
                          onClick={() => demandImageInputRef.current?.click()}
                        />
                      ))}
                    </div>
                  </section>

                  <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
                    <h3 className="font-black">发布前确认</h3>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {[
                        ["类型", composerTypeLabel],
                        ["地点", draft.area],
                        ["时间", demandTimeLabel],
                        ["预算", demandBudgetLabel]
                      ].map(([label, value]) => (
                        <div className="rounded-lg bg-paper p-3" key={label}>
                          <p className="text-[11px] font-bold text-ink/45">{label}</p>
                          <strong className="mt-1 block text-sm leading-5 text-ink">{value}</strong>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 rounded-lg bg-paper p-3">
                      <p className="text-[11px] font-bold text-ink/45">备注</p>
                      <div className="mt-2">
                        <HighlightedTagText className="text-sm font-semibold leading-6 text-ink" text={draft.detail || "未填写备注"} />
                      </div>
                    </div>
                  </section>
                </div>

                <MobileBottomActionBar contentClassName="flex justify-center">
                  <Button className="pointer-events-auto h-12 min-w-[240px] px-8 shadow-soft" disabled={!draft.title.trim()} onClick={publish}>
                    发送到 NeeDo
                  </Button>
                </MobileBottomActionBar>
              </>
            ) : composerStep === "edit" ? (
              <>
                <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-28">
                  <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
                    <TitleWithInfo
                      as="h3"
                      info="先填写活动标题、时间、价格、图片和可见范围，再进入下一步预览发送。"
                      label="填写活动情报说明"
                      title="填写活动情报"
                      titleClassName="font-black"
                      variant="paper"
                    />
                  </section>

                  <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
                    <div className="grid gap-3">
                      <label className="block text-xs font-black text-ink/55">
                        类型
                        <div className="mt-1 flex h-11 w-full items-center rounded-lg border border-line bg-paper px-3 text-sm font-black text-ink">
                          {composerTypeLabel}
                        </div>
                      </label>
                      <label className="block text-xs font-black text-ink/55">
                        标题
                        <input
                          className="mt-1 h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none"
                          onChange={(event) => setInfoDraft((current) => ({ ...current, title: event.target.value }))}
                          value={infoDraft.title}
                        />
                      </label>

                      <div className="grid grid-cols-2 gap-3">
                        <label className="block text-xs font-black text-ink/55">
                          活动开始日期
                          <input
                            className="mt-1 h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none"
                            onChange={(event) => setInfoDraft((current) => ({ ...current, startDate: event.target.value }))}
                            type="date"
                            value={infoDraft.startDate}
                          />
                        </label>
                        <label className="block text-xs font-black text-ink/55">
                          活动开始时间
                          <input
                            className="mt-1 h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none"
                            onChange={(event) => setInfoDraft((current) => ({ ...current, startTime: event.target.value }))}
                            type="time"
                            value={infoDraft.startTime}
                          />
                        </label>
                        <label className="block text-xs font-black text-ink/55">
                          活动结束日期
                          <input
                            className="mt-1 h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none"
                            onChange={(event) => setInfoDraft((current) => ({ ...current, endDate: event.target.value }))}
                            type="date"
                            value={infoDraft.endDate}
                          />
                        </label>
                        <label className="block text-xs font-black text-ink/55">
                          活动结束时间
                          <input
                            className={`mt-1 h-11 w-full rounded-lg border px-3 text-sm font-bold outline-none ${infoDurationInvalid ? "border-coral bg-coral/5 text-coral" : "border-line bg-paper"}`}
                            onChange={(event) => setInfoDraft((current) => ({ ...current, endTime: event.target.value }))}
                            type="time"
                            value={infoDraft.endTime}
                          />
                        </label>
                      </div>
                      {infoDurationInvalid ? (
                        <p className="text-xs font-bold text-coral">活动开始到结束必须大于 0 小时，且最多 24 小时。</p>
                      ) : null}

                      <div className="grid grid-cols-2 gap-3">
                        <label className="block text-xs font-black text-ink/55">
                          募集结束日期
                          <input
                            className="mt-1 h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none"
                            onChange={(event) => setInfoDraft((current) => ({ ...current, recruitEndDate: event.target.value }))}
                            type="date"
                            value={infoDraft.recruitEndDate}
                          />
                        </label>
                        <label className="block text-xs font-black text-ink/55">
                          募集结束时间
                          <input
                            className={`mt-1 h-11 w-full rounded-lg border px-3 text-sm font-bold outline-none ${infoRecruitInvalid ? "border-coral bg-coral/5 text-coral" : "border-line bg-paper"}`}
                            onChange={(event) => setInfoDraft((current) => ({ ...current, recruitEndTime: event.target.value }))}
                            type="time"
                            value={infoDraft.recruitEndTime}
                          />
                        </label>
                      </div>
                      {infoRecruitInvalid ? (
                        <p className="text-xs font-bold text-coral">募集结束时间不能晚于活动结束时间。</p>
                      ) : null}

                      <div className="grid grid-cols-2 gap-2 rounded-lg bg-paper p-1">
                        {[
                          ["store", "到店活动"],
                          ["onsite", "上门服务"]
                        ].map(([key, label]) => (
                          <button
                            className={`rounded-lg px-3 py-2 text-sm font-black ${infoDraft.serviceMode === key ? "bg-white text-ink shadow-sm" : "text-ink/45"}`}
                            key={key}
                            onClick={() => setInfoDraft((current) => ({ ...current, serviceMode: key as "store" | "onsite" }))}
                            type="button"
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      {infoDraft.serviceMode === "store" ? (
                        <label className="block text-xs font-black text-ink/55">
                          地址
                          <input
                            className="mt-1 h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none"
                            onChange={(event) => setInfoDraft((current) => ({ ...current, address: event.target.value }))}
                            value={infoDraft.address}
                          />
                        </label>
                      ) : (
                        <label className="block text-xs font-black text-ink/55">
                          可服务区域
                          <input
                            className="mt-1 h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none"
                            onChange={(event) => setInfoDraft((current) => ({ ...current, serviceAreas: event.target.value }))}
                            value={infoDraft.serviceAreas}
                          />
                        </label>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <label className="block text-xs font-black text-ink/55">
                          原价
                          <input
                            className="mt-1 h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none"
                            onChange={(event) => setInfoDraft((current) => ({ ...current, originalPrice: event.target.value }))}
                            value={infoDraft.originalPrice}
                          />
                        </label>
                        <label className="block text-xs font-black text-ink/55">
                          活动价格
                          <input
                            className="mt-1 h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none"
                            onChange={(event) => setInfoDraft((current) => ({ ...current, campaignPrice: event.target.value }))}
                            value={infoDraft.campaignPrice}
                          />
                        </label>
                      </div>

                      <label className="block text-xs font-black text-ink/55">
                        详细内容
                        <textarea
                          className="mt-1 min-h-36 w-full resize-none rounded-lg border border-line bg-paper p-3 text-sm leading-6 outline-none"
                          onChange={(event) => setInfoDraft((current) => ({ ...current, detail: event.target.value }))}
                          placeholder="例如：到店前可先平台内沟通，限时价仅今晚有效 #夜间可约 #银座"
                          value={infoDraft.detail}
                        />
                      </label>
                    </div>
                  </section>

                  <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
                    <div>
                      <div>
                        <h3 className="font-black">展示图片</h3>
                        <span className="mt-1 block text-xs font-bold text-ink/45">最多 9 张</span>
                      </div>
                    </div>
                    <input accept="image/*" className="hidden" multiple onChange={handleInfoImageUpload} ref={infoImageInputRef} type="file" />
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {Array.from({ length: 9 }, (_, index) => {
                        const image = infoImages[index];

                        return (
                          <NeedoUploadTile
                            image={image}
                            index={index}
                            key={`info-image-${index}`}
                            onClick={() => infoImageInputRef.current?.click()}
                          />
                        );
                      })}
                    </div>
                  </section>

                  <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
                    <h3 className="font-black">可见对象</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {[
                        ["public", "公开"],
                        ["person", "仅某人可见"],
                        ["category", "仅某分类可见"],
                        ["group", "仅某群可见"]
                      ].map(([key, label]) => (
                        <button
                          className={`rounded-full border px-3 py-2 text-xs font-black ${infoDraft.visibilityMode === key ? "border-moss bg-moss text-white" : "border-line bg-paper text-ink/55"}`}
                          key={key}
                          onClick={() => setInfoDraft((current) => ({ ...current, visibilityMode: key as InfoComposerDraft["visibilityMode"] }))}
                          type="button"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {infoDraft.visibilityMode !== "public" ? (
                      <>
                        <label className="mt-3 block text-xs font-black text-ink/55">
                          指定对象 / 分类 / 群组
                          <input
                            className="mt-1 h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none"
                            onChange={(event) => setInfoDraft((current) => ({ ...current, visibilityTarget: event.target.value }))}
                            placeholder="例如：VIP客人组 / 银座常客 / Mia Chen"
                            value={infoDraft.visibilityTarget}
                          />
                        </label>
                        <label className="mt-3 flex items-center gap-3 rounded-lg bg-paper px-3 py-3 text-sm font-bold text-ink/65">
                          <input
                            checked={infoDraft.relatedVisible}
                            className="h-4 w-4 accent-[var(--moss)]"
                            onChange={(event) => setInfoDraft((current) => ({ ...current, relatedVisible: event.target.checked }))}
                            type="checkbox"
                          />
                          允许该对象 / 分类 / 群组的关联可见
                        </label>
                      </>
                    ) : null}
                  </section>
                </div>

                <MobileBottomActionBar contentClassName="flex justify-center">
                  <Button
                    className="pointer-events-auto h-12 min-w-[240px] px-8 shadow-soft"
                    disabled={!infoDraft.title.trim() || infoRecruitInvalid || infoDurationInvalid}
                    onClick={() => setComposerStep("preview")}
                  >
                    下一步
                  </Button>
                </MobileBottomActionBar>
              </>
            ) : (
              <>
                <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-28">
                  <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
                    <div className="flex items-center justify-between gap-3">
                      <Badge tone="green">情报预览</Badge>
                      <span className="text-xs font-bold text-ink/45">{infoTargetLabel}</span>
                    </div>
                    <h2 className="mt-3 text-xl font-black">{infoDraft.title}</h2>
                    <p className="mt-2 text-xs font-bold text-moss">
                      {formatComposerDateRange(infoDraft.startDate, infoDraft.startTime, infoDraft.endDate, infoDraft.endTime)}
                    </p>
                    <p className="mt-1 text-xs text-ink/50">
                      募集截止：{infoDraft.recruitEndDate} {infoDraft.recruitEndTime}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-ink/65">
                      {infoDraft.serviceMode === "store" ? infoDraft.address : infoDraft.serviceAreas}
                    </p>
                  </section>

                  <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-paper p-3">
                        <p className="text-[11px] font-bold text-ink/45">原价</p>
                        <strong className="mt-1 block text-base text-ink/35 line-through">{yen(Number(infoDraft.originalPrice) || 0)}</strong>
                      </div>
                      <div className="rounded-lg bg-paper p-3">
                        <p className="text-[11px] font-bold text-ink/45">活动价</p>
                        <strong className="mt-1 block text-lg text-[color:var(--client-primary)]">{yen(Number(infoDraft.campaignPrice) || 0)}</strong>
                      </div>
                    </div>
                    <div className="mt-3">
                      <HighlightedTagText className="text-sm font-semibold leading-6 text-ink" text={infoDraft.detail} />
                    </div>
                  </section>

                  <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
                    <div className="grid grid-cols-3 gap-2">
                      {infoImages.map((image, index) => (
                        <div className="aspect-square overflow-hidden rounded-lg bg-paper" key={`preview-image-${index}`}>
                          <img alt={`预览图 ${index + 1}`} className="h-full w-full object-cover" src={image} />
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
                    <div className="grid gap-2 text-sm">
                      {[
                        ["类型", "情报"],
                        ["服务方式", infoDraft.serviceMode === "store" ? "到店活动" : "上门服务"],
                        ["可见对象", infoTargetLabel],
                        ["关联可见", infoDraft.relatedVisible ? "是" : "否"],
                        ["指定对象", infoDraft.visibilityTarget || "公开无需指定"]
                      ].map(([label, value]) => (
                        <div className="flex items-center justify-between rounded-lg bg-paper px-3 py-3" key={label}>
                          <span className="text-ink/55">{label}</span>
                          <strong className="max-w-[58%] truncate text-right">{value}</strong>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>

                <MobileBottomActionBar contentClassName="grid grid-cols-3 gap-2">
                  <Button variant="secondary" onClick={() => setComposerStep("edit")}>修改</Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const shouldDiscard = window.confirm("要放弃本次投稿吗？当前填写的内容将不会保留。");

                      if (!shouldDiscard) {
                        return;
                      }

                      resetInfoComposer();
                      setShowComposer(false);
                    }}
                  >
                    放弃
                  </Button>
                  <Button onClick={publish}>发送</Button>
                </MobileBottomActionBar>
              </>
            )}
          </MobileFullscreenPage>
        )}

        <ClientActionDialog
          closeOnBackdrop={false}
          description={
            publishSuccess
              ? `本次${publishSuccess.typeLabel}信息将于匹配成功或 ${publishSuccess.expiresInHours}小时后自动消除。`
              : undefined
          }
          open={Boolean(publishSuccess)}
          title={publishSuccess ? `发送成功，本次消耗 ${publishSuccess.ndpCost}NDP` : ""}
          actions={
            <div className="grid grid-cols-3 gap-2">
              <Button className="h-12 px-2 text-[13px]" variant="secondary" onClick={() => navigateFromPublishSuccess(homePath)}>
                回到首页
              </Button>
              <Button className="h-12 px-2 text-[13px]" onClick={() => navigateFromPublishSuccess(nearbyStoresPath)}>
                附近店铺
              </Button>
              <Button className="h-12 px-2 text-[13px]" onClick={() => navigateFromPublishSuccess(nearbyTechniciansPath)}>
                附近技师
              </Button>
            </div>
          }
        />

        <section className="space-y-3">
          {visiblePosts.map((post) => {
            const serviceLabel = getExchangeServiceLabel(post);
            const isApplied = post.type === "demand" && appliedDemandPostIdSet.has(post.id);
            const isBooked = post.type === "reverse" && bookedReversePostIdSet.has(post.id);
            const isNew = nowMs - new Date(post.publishedAt).getTime() <= 24 * 60 * 60 * 1000 && !viewedPostIdSet.has(post.id);
            const titleBadge = !isApplied && !isBooked && isNew ? "NEW" : undefined;
            const cornerBadge = isBooked ? "已预约" : isApplied ? "应募中" : undefined;
            const cornerBadgeClassName = isBooked
              ? "!border-[#2a815d] !bg-[#173b2b] !text-[#d9ffe8] shadow-[0_10px_24px_rgba(36,122,85,0.22)]"
              : undefined;
            const budgetDisplay = post.budgetLabel ?? yen(post.budget);
            const budgetDisplayClassName = cn(
              "font-black leading-tight",
              post.budgetLabel ? "text-[15px]" : "text-[24px] tracking-[-0.04em]"
            );

            return (
              <article key={post.id}>
                {post.type === "reverse" ? (
                  <div
                    className="focus-ring min-w-0 cursor-pointer text-left"
                    onClick={() => openDemandDetail(post)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openDemandDetail(post);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <OfferInfoCard
                      cornerBadge={cornerBadge}
                      cornerBadgeClassName={cornerBadgeClassName}
                      expiryValue={formatExpiryDate(post.expiresAt, language)}
                      expiryCountdown={postRuntime[post.id]?.label}
                      fields={[
                        { label: "利用条件", value: post.time },
                        { label: "适用范围", value: post.area }
                      ]}
                      footer={
                        <div onClick={(event) => event.stopPropagation()}>
                          <MomentActionBar
                            bordered={false}
                            likeCount={getPostLikeCount(post) + (likedPostIds.includes(post.id) ? 1 : 0)}
                            liked={likedPostIds.includes(post.id)}
                            onForward={() => {
                              setSharePost(post);
                              setSharedContact(null);
                            }}
                            onLike={() => togglePostLike(post.id)}
                            onReply={() => {
                              bumpPostReply(post.id);
                              openDemandDetail(post);
                            }}
                            onTranslate={() => togglePostTranslation(post.id)}
                            replyCount={getPostReplyCount(post) + (replyBoosts[post.id] ?? 0)}
                            translated={translatedPostIds.includes(post.id)}
                          />
                        </div>
                      }
                      image={post.image}
                      imageAlt={post.author}
                      imageLabel={getNeedoCardRoleLabel(post)}
                      topRightAction={
                        <NeedoExchangeCardActionMenu
                          onBlock={() => blockPost(post)}
                          onReport={() => reportPost(post)}
                          onTranslate={() => togglePostTranslation(post.id)}
                          translated={translatedPostIds.includes(post.id)}
                        />
                      }
                      eyebrow={
                        post.budget > 0 ? (
                          <span className={budgetDisplayClassName}>{budgetDisplay}</span>
                        ) : (
                          "最新情报"
                        )
                      }
                      noteValue={post.detail}
                      titlePrefix={serviceLabel ? `#${serviceLabel}` : undefined}
                      titleBadge={titleBadge}
                      title={post.title}
                    />
                  </div>
                ) : (
                  <div
                    className="focus-ring min-w-0 cursor-pointer text-left"
                    onClick={() => openDemandDetail(post)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openDemandDetail(post);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <OfferInfoCard
                      cornerBadge={cornerBadge}
                      cornerBadgeClassName={cornerBadgeClassName}
                      expiryValue={formatExpiryDate(post.expiresAt, language)}
                      expiryCountdown={postRuntime[post.id]?.label}
                      fields={[
                        { label: "利用条件", value: post.time },
                        { label: "适用范围", value: post.area }
                      ]}
                      footer={
                        <div onClick={(event) => event.stopPropagation()}>
                          <MomentActionBar
                            bordered={false}
                            likeCount={getPostLikeCount(post) + (likedPostIds.includes(post.id) ? 1 : 0)}
                            liked={likedPostIds.includes(post.id)}
                            onForward={() => {
                              setSharePost(post);
                              setSharedContact(null);
                            }}
                            onLike={() => togglePostLike(post.id)}
                            onReply={() => {
                              bumpPostReply(post.id);
                              openDemandDetail(post);
                            }}
                            onTranslate={() => togglePostTranslation(post.id)}
                            replyCount={getPostReplyCount(post) + (replyBoosts[post.id] ?? 0)}
                            translated={translatedPostIds.includes(post.id)}
                          />
                        </div>
                      }
                      image={post.image}
                      imageAlt={post.author}
                      imageLabel={getNeedoCardRoleLabel(post)}
                      topRightAction={
                        <NeedoExchangeCardActionMenu
                          onBlock={() => blockPost(post)}
                          onReport={() => reportPost(post)}
                          onTranslate={() => togglePostTranslation(post.id)}
                          translated={translatedPostIds.includes(post.id)}
                        />
                      }
                      eyebrow={<span className={budgetDisplayClassName}>{budgetDisplay}</span>}
                      noteValue={post.detail}
                      titlePrefix={serviceLabel ? `#${serviceLabel}` : undefined}
                      titleBadge={titleBadge}
                      title={post.title}
                      tone="demand"
                    />
                  </div>
                )}
              </article>
            );
          })}
        </section>

        {sharePost && (
          <MobileFullscreenPage className="z-[70]">
            <MobileFullscreenHeader className={fullscreenHeaderClassName} onClose={() => setSharePost(null)} title="转发 NeeDo 卡片" />
            <main className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <section className="rounded-lg bg-white p-4 shadow-panel">
                <Badge tone={sharePost.type === "demand" ? "yellow" : "green"}>{sharePost.type === "demand" ? "需求" : "情报"}</Badge>
                <h3 className="mt-2 text-lg font-black">{sharePost.title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink/60">{sharePost.time} · {sharePost.area} · {yen(sharePost.budget)}</p>
              </section>
              <section className="rounded-lg bg-white p-4 shadow-panel">
                <h3 className="font-black">选择通讯录联系人</h3>
                <div className="mt-3 space-y-2">
                  {forwardContacts.map((contact) => (
                    <button
                      className="flex w-full items-center gap-3 rounded-lg bg-paper p-3 text-left"
                      key={contact.conversationId}
                      onClick={() => forwardExchangePost(contact)}
                      type="button"
                    >
                      <AvatarImage alt={contact.name} className="h-12 w-12" src={contact.avatar} />
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm">{contact.name}</strong>
                        <span className="mt-1 block text-xs text-ink/50">{contact.role}</span>
                      </span>
                      <span className="text-lg font-black text-ink/30">›</span>
                    </button>
                  ))}
                </div>
              </section>
              {sharedContact ? (
                <section className="rounded-lg bg-lemon p-4 text-black shadow-panel">
                  <h3 className="font-black">已通过聊天发送</h3>
                  <p className="mt-2 text-sm leading-6 text-black/70">已发送给 {sharedContact.name}，进入聊天页可以查看刚转发的 NeeDo 卡片。</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button variant="secondary" onClick={() => setSharePost(null)}>继续浏览</Button>
                    <Link className="focus-ring inline-flex h-10 items-center justify-center rounded-full bg-ink px-4 text-sm font-semibold text-white" to={getMessagePath(context, sharedContact.conversationId)}>
                      去聊天查看
                    </Link>
                  </div>
                </section>
              ) : null}
            </main>
          </MobileFullscreenPage>
        )}

        {canComposeOnActiveTab ? (
          <FloatingActionButton
            ariaLabel={composerType === "demand" ? "发送需求" : "发送情报"}
            onClick={() => setShowComposer(true)}
            storageKey="needo.fab.exchange-compose"
          >
            <NeedoComposerIcon />
          </FloatingActionButton>
        ) : null}
      </div>
    </MobileShell>
  );
}
