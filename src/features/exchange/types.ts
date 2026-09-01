export type ExchangePostType = "demand" | "intelligence";
export type ExchangePostStatus = "published" | "withdrawn" | "expired";
export type ExchangeServiceMode = "store" | "onsite" | "flexible";
export type ExchangeDemandServiceMode = "home" | "store";
export type ExchangeContentLocale = "zh-CN" | "zh-TW" | "en" | "ja" | "ko";
export type ExchangeMatchMode = "quick" | "selective";
export type ExchangeBudgetMode = "total" | "per_provider";
export type ExchangePublisherCapacitySource = "customer_membership" | "shop_merchant";
export type ExchangeCustomerMembershipLevel = "standard" | "silver" | "gold" | "black";
export type ExchangeNdpCurrency = "NDP" | "TEST_NDP";

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
  serviceMode: ExchangeDemandServiceMode;
  targetProviderCount: number;
  targetProviderLimitSnapshot: number;
  publisherCapacitySource: ExchangePublisherCapacitySource;
  membershipLevelSnapshot: ExchangeCustomerMembershipLevel | null;
  matchMode: ExchangeMatchMode;
  budgetMode: ExchangeBudgetMode;
  budgetMinJpy: number | null;
  budgetMaxJpy: number;
  address: ExchangeRequestAddress;
};

export type ExchangeRequestAddress = {
  line1: string;
  line2: string | null;
  line3: string | null;
  line2GenerallyVisible: boolean;
  line3GenerallyVisible: boolean;
  disclosure: "owner" | "general";
};

export type ExchangeRequestPublicationContext = {
  canPublish: boolean;
  capacitySource: ExchangePublisherCapacitySource;
  membershipLevel: ExchangeCustomerMembershipLevel | null;
  maxTargetProviderCount: number;
  publicationFee: {
    amountNdp: number;
    currency: ExchangeNdpCurrency;
    ruleSetVersion: number;
  };
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
  publisher: ExchangeActor | null;
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
  serviceStartAt: string;
  serviceEndAt: string;
  expiresAt: string;
};

export type PublishExchangeDemandInput = ExchangePublishCommon & {
  type: "demand";
  serviceMode: ExchangeDemandServiceMode;
  targetProviderCount: number;
  matchMode: ExchangeMatchMode;
  budgetMode: ExchangeBudgetMode;
  budgetMinJpy: number | null;
  budgetMaxJpy: number;
  addressLine1: string;
  addressLine2: string | null;
  addressLine3: string | null;
  addressLine2Public: boolean;
  addressLine3Public: boolean;
  publisherIdentityPublic: boolean;
};

export type PublishExchangeIntelligenceInput = ExchangePublishCommon & {
  type: "intelligence";
  areaLabel: string;
  serviceMode: ExchangeServiceMode;
  addressLabel: string | null;
  serviceAreas: string[];
  originalPriceJpy: number | null;
  campaignPriceJpy: number;
};

export type PublishExchangePostInput = PublishExchangeDemandInput | PublishExchangeIntelligenceInput;
