import type { ContentLocaleCode } from "../constants/content-locales";
import type { PaginatedResponse } from "../utils/pagination";

export type ExchangePostType = "demand" | "intelligence";
export type ExchangePostStatus = "published" | "withdrawn" | "expired" | "matched" | "closed";
export type ExchangeServiceMode = "store" | "onsite" | "flexible";
export type ExchangeDemandServiceMode = "home" | "store";
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
  canViewMatching: boolean;
  claimUnavailableReason: "self_published" | null;
}

export interface ExchangePriorityPayload {
  active: boolean;
  tierCode: "free" | "silver" | "gold" | "black_diamond";
}

export interface ExchangeDemandPayload {
  serviceMode: ExchangeDemandServiceMode;
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
  line1: string | null;
  line2: string | null;
  line3: string | null;
  line2GenerallyVisible: boolean;
  line3GenerallyVisible: boolean;
  disclosure: "owner" | "matched_participant" | "general";
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
  booking: ExchangeIntelligenceBookingPayload;
  publisherCard: ExchangeIntelligencePublisherCardPayload | null;
  serviceCard: ExchangeIntelligenceServiceCardPayload | null;
}

export type ExchangeIntelligenceUnavailableReason =
  | "legacy_unbound"
  | "post_unavailable"
  | "publisher_unavailable"
  | "service_unavailable";

export interface ExchangeIntelligenceBookingPayload {
  available: boolean;
  unavailableReason: ExchangeIntelligenceUnavailableReason | null;
  target: {
    type: "shop_service" | "technician_service";
    id: number;
  } | null;
  catalogPriceJpy: number | null;
  campaignPriceJpy: number;
  serviceName: string | null;
  durationMinutes: number | null;
  serviceMode: ExchangeServiceMode;
  serviceWindow: {
    startsAt: string;
    endsAt: string;
  };
}

export interface ExchangeIntelligenceShopPublisherCardPayload {
  type: "shop";
  publicId: string;
  name: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  imageUrls: string[];
  status: string;
  isBookable: boolean;
  ratingAverage: string | null;
  reviewCount: number;
  completedOrderCount: number;
  favoriteCount: number;
  shareCount: number;
  address: string;
  serviceMode: ExchangeServiceMode;
  detailPath: string;
}

export interface ExchangeIntelligenceTechnicianPublisherCardPayload {
  type: "technician";
  publicId: string;
  displayName: string;
  avatarUrl: string | null;
  shop: { publicId: string; name: string };
  status: string;
  isBookable: boolean;
  yearsExperience: number;
  completedOrderCount: number | null;
  acceptanceRatePercent: number | null;
  ratingAverage: string | null;
  reviewCount: number;
  serviceAreas: string[];
  languages: string[];
  detailPath: string;
  servicesPath: string;
}

export type ExchangeIntelligencePublisherCardPayload =
  | ExchangeIntelligenceShopPublisherCardPayload
  | ExchangeIntelligenceTechnicianPublisherCardPayload;

export interface ExchangeIntelligenceServiceCardPayload {
  targetType: "shop_service" | "technician_service";
  publicId: string;
  name: string;
  description: string | null;
  coverUrl: string | null;
  imageUrls: string[];
  tags: string[];
  catalogPriceJpy: number;
  campaignPriceJpy: number;
  currency: "JPY";
  durationMinutes: number;
  serviceMode: ExchangeServiceMode;
  shopPublicId: string;
  shopAddress: string;
  detailPath: string;
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
  priority?: ExchangePriorityPayload;
  demand: ExchangeDemandPayload | null;
  intelligence: ExchangeIntelligencePayload | null;
}

export interface ExchangeCommentPayload {
  id: number;
  postId: number;
  author: ExchangeActorPayload;
  authorProfilePath?: string | null;
  content: string;
  createdAt: string;
}

export interface ExchangeListInput {
  type: ExchangePostType;
  page: number;
  pageSize: number;
  viewerIdentityId: number;
  participantIdentityId?: number;
  claimProviderUserId?: number;
  authorIdentityId?: number;
  now: Date;
}

export type ExchangePostPage = PaginatedResponse<ExchangePostPayload>;
export type ExchangeCommentPage = PaginatedResponse<ExchangeCommentPayload>;
