import type { ContentLocaleCode } from "../constants/content-locales";
import type { PaginatedResponse } from "../utils/pagination";

export type ExchangePostType = "demand" | "intelligence";
export type ExchangePostStatus = "published" | "withdrawn" | "expired";
export type ExchangeServiceMode = "store" | "onsite" | "flexible";
export type ExchangeMatchMode = "quick" | "selective";
export type ExchangeBudgetMode = "total" | "per_provider";
export type ExchangePublisherCapacitySource = "customer_membership" | "shop_merchant";
export type ExchangeCustomerMembershipLevel = "standard" | "silver" | "gold" | "black";
export type ExchangeNdpCurrency = "NDP" | "TEST_NDP";

export interface ExchangeActorPayload {
  publicId: string;
  identityType: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface ExchangeInteractionCounts {
  comments: number;
  likes: number;
  shares: number;
}

export interface ExchangeViewerState {
  liked: boolean;
  canWithdraw: boolean;
  canClaim: boolean;
  canViewClaims: boolean;
}

export interface ExchangeDemandPayload {
  targetProviderCount: number;
  targetProviderLimitSnapshot: number;
  publisherCapacitySource: ExchangePublisherCapacitySource;
  membershipLevelSnapshot: ExchangeCustomerMembershipLevel | null;
  matchMode: ExchangeMatchMode;
  budgetMode: ExchangeBudgetMode;
  budgetMinJpy: number | null;
  budgetMaxJpy: number;
  address: ExchangeRequestAddressPayload;
}

export interface ExchangeRequestAddressPayload {
  line1: string;
  line2: string | null;
  line3: string | null;
  line2GenerallyVisible: boolean;
  line3GenerallyVisible: boolean;
  disclosure: "owner" | "general";
}

export interface ExchangePublisherCapacity {
  source: ExchangePublisherCapacitySource;
  membershipLevel: ExchangeCustomerMembershipLevel | null;
  targetProviderLimit: number;
  payerOwnerType: "user" | "shop";
  payerOwnerId: number;
  currency: ExchangeNdpCurrency;
}

export interface ExchangeRequestPublicationContextPayload {
  canPublish: boolean;
  capacitySource: ExchangePublisherCapacitySource;
  membershipLevel: ExchangeCustomerMembershipLevel | null;
  maxTargetProviderCount: number;
  publicationFee: {
    amountNdp: number;
    currency: ExchangeNdpCurrency;
    ruleSetVersion: number;
  };
}

export interface ExchangeIntelligencePayload {
  serviceMode: ExchangeServiceMode;
  addressLabel: string | null;
  serviceAreas: string[];
  originalPriceJpy: number | null;
  campaignPriceJpy: number;
}

export interface ExchangePostPayload {
  id: number;
  type: ExchangePostType;
  status: ExchangePostStatus;
  title: string;
  detail: string;
  contentLocale: ContentLocaleCode;
  areaLabel: string;
  serviceStartAt: string;
  serviceEndAt: string;
  expiresAt: string;
  publishedAt: string;
  publisher: ExchangeActorPayload | null;
  counts: ExchangeInteractionCounts;
  viewer: ExchangeViewerState;
  demand: ExchangeDemandPayload | null;
  intelligence: ExchangeIntelligencePayload | null;
}

export interface ExchangeCommentPayload {
  id: number;
  postId: number;
  author: ExchangeActorPayload;
  content: string;
  createdAt: string;
}

export interface ExchangeListInput {
  type: ExchangePostType;
  page: number;
  pageSize: number;
  viewerIdentityId: number;
  authorIdentityId?: number;
  now: Date;
}

export type ExchangePostPage = PaginatedResponse<ExchangePostPayload>;
export type ExchangeCommentPage = PaginatedResponse<ExchangeCommentPayload>;
