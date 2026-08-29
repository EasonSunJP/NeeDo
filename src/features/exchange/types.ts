export type ExchangePostType = "demand" | "intelligence";
export type ExchangePostStatus = "published" | "withdrawn" | "expired";
export type ExchangeServiceMode = "store" | "onsite" | "flexible";
export type ExchangeContentLocale = "zh-CN" | "zh-TW" | "en" | "ja" | "ko";

export type ExchangeActor = {
  publicId: string;
  identityType: string;
  displayName: string;
  avatarUrl: string | null;
};

export type ExchangeInteractionCounts = {
  comments: number;
  likes: number;
  shares: number;
};

export type ExchangeViewerState = {
  liked: boolean;
  canWithdraw: boolean;
};

export type ExchangeDemand = {
  budgetMinJpy: number;
  budgetMaxJpy: number;
};

export type ExchangeIntelligence = {
  serviceMode: ExchangeServiceMode;
  addressLabel: string | null;
  serviceAreas: string[];
  originalPriceJpy: number | null;
  campaignPriceJpy: number;
};

export type ExchangePost = {
  id: number;
  type: ExchangePostType;
  status: ExchangePostStatus;
  title: string;
  detail: string;
  contentLocale: ExchangeContentLocale;
  areaLabel: string;
  serviceStartAt: string;
  serviceEndAt: string;
  expiresAt: string;
  publishedAt: string;
  publisher: ExchangeActor;
  counts: ExchangeInteractionCounts;
  viewer: ExchangeViewerState;
  demand: ExchangeDemand | null;
  intelligence: ExchangeIntelligence | null;
};

export type ExchangeComment = {
  id: number;
  postId: number;
  author: ExchangeActor;
  content: string;
  createdAt: string;
};

export type Paginated<TItem> = {
  list: TItem[];
  total: number;
  page: number;
  page_size: number;
};

export type PaginationInput = {
  page?: number;
  pageSize?: number;
  signal?: AbortSignal;
};

export type ExchangeListInput = PaginationInput & {
  type: ExchangePostType;
};

type ExchangePublishCommon = {
  title: string;
  detail: string;
  contentLocale: ExchangeContentLocale;
  areaLabel: string;
  serviceStartAt: string;
  serviceEndAt: string;
  expiresAt: string;
};

export type PublishExchangeDemandInput = ExchangePublishCommon & {
  type: "demand";
  budgetMinJpy: number;
  budgetMaxJpy: number;
};

export type PublishExchangeIntelligenceInput = ExchangePublishCommon & {
  type: "intelligence";
  serviceMode: ExchangeServiceMode;
  addressLabel: string | null;
  serviceAreas: string[];
  originalPriceJpy: number | null;
  campaignPriceJpy: number;
};

export type PublishExchangePostInput = PublishExchangeDemandInput | PublishExchangeIntelligenceInput;
