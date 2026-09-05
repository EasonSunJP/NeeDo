import { httpClient } from "./httpClient";

export type OfficialNoticeScope = "platform" | "merchant";
export type OfficialNoticeLocale = "zh-CN" | "zh-TW" | "en" | "ja" | "ko";
export type OfficialNoticeLevel = "general" | "important" | "urgent";
export type OfficialNoticeStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "scheduled"
  | "sending"
  | "sent"
  | "cancelled"
  | "archived";

export type OfficialNoticeBlockType =
  | "paragraph"
  | "heading"
  | "subheading"
  | "bullet"
  | "numbered"
  | "quote"
  | "callout"
  | "divider"
  | "image"
  | "video"
  | "file";

export type OfficialNoticeBlock = {
  id: string;
  type: OfficialNoticeBlockType;
  content: string;
  caption?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  source?: "url" | "media";
  mediaAssetId?: number;
};

export type MerchantNoticeAudience = {
  type: "shop_card_holders" | "shop_employees" | "shop_technicians";
};
export type PlatformNoticeAudience =
  | { type: "all" }
  | {
      type: "identity_types";
      identityTypes: Array<
        | "customer"
        | "technician"
        | "merchant_owner"
        | "merchant_staff"
        | "platform"
        | "platform_admin"
        | "scout"
      >;
    };

export type ManagedNoticeCreateInput = {
  sourceLocale: OfficialNoticeLocale;
  level: OfficialNoticeLevel;
  title: string;
  summary: string;
  blocks: OfficialNoticeBlock[];
  audience: MerchantNoticeAudience | PlatformNoticeAudience;
  sendMode: "now" | "scheduled";
  scheduledAt: string | null;
  idempotencyKey: string;
};

export type OfficialNoticeTranslation = {
  title: string;
  summary: string;
  blocks: OfficialNoticeBlock[];
  sourceLocale: OfficialNoticeLocale;
  isInitialCopy: boolean;
};

export type OfficialNotice = {
  publicId: string;
  level: OfficialNoticeLevel;
  status: OfficialNoticeStatus;
  sourceLocale: OfficialNoticeLocale;
  targetSummary: string;
  scheduledAt: string | null;
  sentAt: string | null;
  cancelledAt: string | null;
  archivedAt: string | null;
  lockVersion: number;
  translations: Partial<Record<OfficialNoticeLocale, OfficialNoticeTranslation>>;
  audienceCount: number;
  delivery: { pending: number; delivered: number; failed: number; read: number };
  createdAt: string;
  updatedAt: string;
};

export type RecipientOfficialNotice = {
  publicId: string;
  level: OfficialNoticeLevel;
  title: string;
  summary: string;
  blocks: OfficialNoticeBlock[];
  targetSummary: string;
  sentAt: string;
  readAt: string | null;
};

export type OfficialNoticePage<T> = {
  list: T[];
  total: number;
  page: number;
  page_size: number;
};

export type ManagedNoticeQuery = {
  page: number;
  pageSize: number;
  status?: OfficialNoticeStatus;
  level?: OfficialNoticeLevel;
};

export type NoticeLifecycleInput = {
  expectedLockVersion: number;
  reason: string;
  idempotencyKey: string;
};

const managementBase = (scope: OfficialNoticeScope) =>
  scope === "platform" ? "/backoffice/official-notices" : "/merchant-admin/official-notices";

const queryString = (entries: Array<[string, string | number | boolean | undefined]>) => {
  const params = new URLSearchParams();
  for (const [key, value] of entries) if (value !== undefined) params.set(key, String(value));
  return params.toString();
};

export const officialNoticesApi = {
  listManaged(scope: OfficialNoticeScope, query: ManagedNoticeQuery) {
    const search = queryString([
      ["page", query.page],
      ["pageSize", query.pageSize],
      ["status", query.status],
      ["level", query.level]
    ]);
    return httpClient.request<OfficialNoticePage<OfficialNotice>>(
      `${managementBase(scope)}?${search}`
    );
  },
  createManaged(scope: OfficialNoticeScope, input: ManagedNoticeCreateInput) {
    return httpClient.request<OfficialNotice>(managementBase(scope), {
      method: "POST",
      body: input
    });
  },
  cancelManaged(scope: OfficialNoticeScope, publicId: string, input: NoticeLifecycleInput) {
    return httpClient.request<OfficialNotice>(`${managementBase(scope)}/${publicId}/cancel`, {
      method: "POST",
      body: input
    });
  },
  archiveManaged(scope: OfficialNoticeScope, publicId: string, input: NoticeLifecycleInput) {
    return httpClient.request<OfficialNotice>(`${managementBase(scope)}/${publicId}/archive`, {
      method: "POST",
      body: input
    });
  },
  retryManaged(scope: OfficialNoticeScope, publicId: string, input: NoticeLifecycleInput) {
    return httpClient.request<OfficialNotice>(
      `${managementBase(scope)}/${publicId}/retry-failures`,
      { method: "POST", body: input }
    );
  },
  listInbox(query: {
    locale: OfficialNoticeLocale;
    unreadOnly: boolean;
    page: number;
    pageSize: number;
  }) {
    const search = queryString([
      ["locale", query.locale],
      ["unreadOnly", query.unreadOnly],
      ["page", query.page],
      ["pageSize", query.pageSize]
    ]);
    return httpClient.request<OfficialNoticePage<RecipientOfficialNotice>>(
      `/official-notices?${search}`
    );
  },
  markRead(publicId: string) {
    return httpClient.request<{ publicId: string; readAt: string }>(
      `/official-notices/${publicId}/read`,
      { method: "POST" }
    );
  }
};
