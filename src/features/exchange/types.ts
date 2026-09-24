export type ExchangePostType = "demand" | "intelligence";
export type ExchangePostStatus = "published" | "withdrawn" | "expired" | "matched" | "closed";
export type ExchangeServiceMode = "store" | "onsite" | "flexible";
export type ExchangeDemandServiceMode = "home" | "store";
export type ExchangeTechnicianGenderPreference = "any" | "male" | "female";
export type ExchangeContentLocale = "zh-CN" | "zh-TW" | "en" | "ja" | "ko";
export type ExchangeDemandCoverUpload = {
  publicId: string;
  url: string;
  mimeType: string;
  width: number;
  height: number;
};
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
  contactUserId?: number;
  bio?: string | null;
  bioLocales?: Partial<Record<ExchangeContentLocale, string>>;
  membershipLevel?: string | null;
  credit?: { ratingAverage: string; reviewCount: number } | null;
};

export type ExchangePublisherReviews = {
  contactUserId: number;
  credit: { ratingAverage: string; reviewCount: number } | null;
  reviews: Array<{ id: number; rating: number; comment: string; createdAt: string }>;
};

export type ExchangeInteractionCounts = {
  comments: number;
  likes: number;
  shares: number;
};

export type ExchangeViewerState = {
  liked: boolean;
  canWithdraw: boolean;
  canClaim: boolean;
  canViewClaims: boolean;
  canViewMatching?: boolean;
  claimUnavailableReason?: "self_published" | null;
};

export type ExchangeClaimStatus =
  | "active"
  | "withdrawn"
  | "request_withdrawn"
  | "request_expired"
  | "matched"
  | "not_selected"
  | "matching_closed";

export type ExchangeClaimServiceRef = `shop:${number}` | `technician:${number}`;
export type ExchangeClaimSource = "automatic" | "manual" | "shop_dispatch";

export type ExchangeClaimOption = {
  scheduleSlotId: number;
  shop: { id: number; name: string };
  technician: { profileId: number; publicId: string; displayName: string };
  service: { ref: ExchangeClaimServiceRef; name: string; durationMinutes: number };
  startsAt: string;
  endsAt: string;
};

export type ExchangeClaim = {
  id: number;
  exchangePostId: number;
  status: ExchangeClaimStatus;
  source: ExchangeClaimSource;
  provider: { publicId: string; displayName: string; avatarUrl: string | null };
  shop: { id: number; name: string; publicId: string | null };
  technician: { profileId: number; publicId: string; displayName: string };
  service: { ref: ExchangeClaimServiceRef; publicId: string; name: string; durationMinutes: number };
  scheduleSlotId: number;
  quoteAmountJpy: number;
  currency: "JPY";
  message: string | null;
  estimatedStartsAt: string;
  estimatedEndsAt: string;
  createdAt: string;
  withdrawnAt: string | null;
  terminalAt: string | null;
};

export type ExchangeClaimMine = {
  claim: ExchangeClaim | null;
};

export type ExchangeMatchingStatus = "open" | "matched" | "closed";

export type ExchangeQuickBudgetDecision = {
  action: "increase_to_selected_total";
  activeClaimCount: number;
  selectedQuoteTotalJpy: number;
  effectiveBudgetMaxJpy: number;
  requiredBudgetMaxJpy: number;
  requiredBudgetIncreaseJpy: number;
};

export type ExchangeMatchParticipant = {
  exchangeClaimId: number;
  provider: { publicId: string; displayName: string; avatarUrl: string | null };
  shop: { id: number; name: string };
  technician: { profileId: number; publicId: string; displayName: string };
  service: { ref: ExchangeClaimServiceRef; name: string; durationMinutes: number };
  scheduleSlotId: number;
  quoteAmountJpy: number;
  currency: "JPY";
  estimatedStartsAt: string;
  estimatedEndsAt: string;
  matchedAt: string;
  booking: ExchangeParticipantBooking | null;
};

export type ExchangeParticipantBooking = {
  orderId: number;
  orderNo: string;
  status:
    | "pending"
    | "confirmed"
    | "inService"
    | "awaitingCheckout"
    | "awaitingPaymentConfirmation"
    | "completed"
    | "cancelled";
};

export type ExchangeBookingConversion = {
  exchangePostId: number;
  matchingVersion: number;
  bookedAt: string;
  orders: Array<{
    exchangeClaimId: number;
    orderId: number;
    orderNo: string;
    status: "pending";
    providerPublicId: string;
    quoteAmountJpy: number;
    startsAt: string;
    endsAt: string;
  }>;
};

export type ExchangeCancellationAction = "request" | "accept" | "reject" | "withdraw";
export type ExchangeCancellationParty = "customer" | "provider";
export type ExchangeCancellationStatus = "pending" | "accepted" | "rejected" | "withdrawn";

export type ExchangeCancellation = {
  orderId: number;
  orderStatus:
    | "pending"
    | "confirmed"
    | "in_service"
    | "awaiting_checkout"
    | "awaiting_payment_confirmation"
    | "completed"
    | "cancelled";
  viewerParty: ExchangeCancellationParty;
  allowedActions: ExchangeCancellationAction[];
  cancellation: null | {
    id: number;
    status: ExchangeCancellationStatus;
    reason: string;
    initiatorParty: ExchangeCancellationParty;
    version: number;
    requestedAt: string;
    resolvedAt: string | null;
  };
};

export type ExchangeMatching = {
  exchangePostId: number;
  status: ExchangeMatchingStatus;
  version: number;
  effectiveTargetProviderCount: number;
  effectiveBudgetMaxJpy: number;
  selectedQuoteTotalJpy: number;
  matchedAt: string | null;
  participants: ExchangeMatchParticipant[];
  quickBudgetDecision: ExchangeQuickBudgetDecision | null;
  viewer: {
    canSelect: boolean;
    canConfirmQuickBudget: boolean;
    canCreateBookings: boolean;
  };
};

export type ExchangeMatchAdjustmentPreview = {
  currentVersion: number;
  selectedCount: number;
  selectedQuoteTotalJpy: number;
  effectiveTargetProviderCount: number;
  effectiveBudgetMaxJpy: number;
  requiredTargetProviderCount: number | null;
  requiredBudgetMaxJpy: number | null;
  requiredBudgetIncreaseJpy: number;
  requiresTargetConfirmation: boolean;
  requiresBudgetConfirmation: boolean;
};

export type SelectExchangeMatchingInput = {
  selectedClaimIds: number[];
  expectedVersion: number;
  budgetConfirmation: {
    action: "increase_to_selected_total";
    confirmedBudgetMaxJpy: number;
  } | null;
  targetConfirmation: {
    action: "reduce_to_selected_count";
    confirmedTargetProviderCount: number;
  } | null;
};

export type ConfirmQuickExchangeBudgetInput = {
  expectedVersion: number;
  budgetConfirmation: {
    action: "increase_to_selected_total";
    confirmedBudgetMaxJpy: number;
  };
};

export type ExchangeClaimOptionListInput = PaginationInput & {
  shopId?: number;
  technicianProfileId?: number;
  serviceRef?: ExchangeClaimServiceRef;
};

export type CreateExchangeClaimInput = {
  scheduleSlotId: number;
  serviceRef?: ExchangeClaimServiceRef;
  quoteAmountJpy: number;
  message: string | null;
};

export type ExchangePriority = {
  active: boolean;
  tierCode: "free" | "silver" | "gold" | "black_diamond";
};

export type ExchangeDemand = {
  cover: { url: string; isDefault: boolean };
  categoryId?: number | null;
  businessKeywordIds?: number[];
  serviceMode: ExchangeDemandServiceMode;
  preferredTechnicianGender?: ExchangeTechnicianGenderPreference;
  targetProviderCount: number;
  targetProviderLimitSnapshot: number;
  publisherCapacitySource: ExchangePublisherCapacitySource;
  membershipLevelSnapshot: ExchangeCustomerMembershipLevel | null;
  matchMode: ExchangeMatchMode;
  budgetMode: ExchangeBudgetMode;
  budgetMinJpy: number | null;
  budgetMaxJpy: number;
  payment?: {
    prepaidPercent: number;
    selectedMethod: "onsite" | "bank_transfer" | "cash" | "ndp" | "other" | null;
  };
  address: ExchangeRequestAddress;
};

export type ExchangeRequestAddress = {
  line1: string | null;
  line2: string | null;
  line3: string | null;
  line1GenerallyVisible?: boolean;
  line2GenerallyVisible: boolean;
  line3GenerallyVisible: boolean;
  disclosure: "owner" | "general" | "matched_participant";
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
  booking: ExchangeIntelligenceBooking;
  publisherCard: ExchangeIntelligencePublisherProfileProjection | null;
  serviceCard: ExchangeIntelligenceServiceCardProjection | null;
};

export type ExchangeIntelligenceUnavailableReason =
  | "legacy_unbound"
  | "post_unavailable"
  | "publisher_unavailable"
  | "service_unavailable";

export type ExchangeIntelligenceBooking = {
  available: boolean;
  unavailableReason: ExchangeIntelligenceUnavailableReason | null;
  target: { type: "shop_service" | "technician_service"; id: number } | null;
  catalogPriceJpy: number | null;
  campaignPriceJpy: number;
  serviceName: string | null;
  durationMinutes: number | null;
  serviceMode: ExchangeServiceMode;
  serviceWindow: { startsAt: string; endsAt: string };
};

export type ExchangeIntelligenceServiceRef = `shop:${number}` | `technician:${number}`;

export type ExchangeIntelligenceServiceOption = {
  serviceRef: ExchangeIntelligenceServiceRef;
  ownerType: "shop" | "technician";
  name: string;
  durationMinutes: number;
  catalogPriceJpy: number;
  currency: "JPY";
  serviceMode: ExchangeServiceMode;
  available: true;
  shop: { publicId: string; name: string; city: string; address: string };
  technician: null | { publicId: string; displayName: string; avatarUrl: string | null; serviceArea: string | null; serviceAreas: string[] };
};

export type ExchangePost = {
  id: number;
  type: ExchangePostType;
  status: ExchangePostStatus;
  title: string;
  detail: string;
  contentLocale: ExchangeContentLocale;
  contentTranslations?: Partial<Record<ExchangeContentLocale, { title: string; detail: string }>>;
  areaLabel: string;
  serviceStartAt: string;
  serviceEndAt: string;
  expiresAt: string;
  publishedAt: string;
  publisher: ExchangeActor | null;
  counts: ExchangeInteractionCounts;
  viewer: ExchangeViewerState;
  priority?: ExchangePriority;
  demand: ExchangeDemand | null;
  intelligence: ExchangeIntelligence | null;
};

export type ExchangeComment = {
  id: number;
  postId: number;
  author: ExchangeActor;
  authorProfilePath?: string | null;
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
  contentTranslations?: Partial<Record<ExchangeContentLocale, { title: string; detail: string }>>;
  serviceStartAt: string;
  serviceEndAt: string;
  expiresAt: string;
};

export type PublishExchangeDemandInput = ExchangePublishCommon & {
  type: "demand";
  coverMediaAssetPublicId?: string;
  categoryId: number;
  businessKeywordIds: number[];
  serviceMode: ExchangeDemandServiceMode;
  preferredTechnicianGender: ExchangeTechnicianGenderPreference;
  targetProviderCount: number;
  matchMode: ExchangeMatchMode;
  budgetMode: ExchangeBudgetMode;
  budgetMinJpy: number | null;
  budgetMaxJpy: number;
  addressLine1: string;
  addressLine1Public?: boolean;
  addressLine2: string | null;
  addressLine3: string | null;
  addressLine2Public: boolean;
  addressLine3Public: boolean;
  publisherIdentityPublic: boolean;
};

export type PublishExchangeIntelligenceInput = ExchangePublishCommon & {
  type: "intelligence";
  serviceRef: ExchangeIntelligenceServiceRef;
  campaignPriceJpy: number;
};

export type PublishExchangePostInput = PublishExchangeDemandInput | PublishExchangeIntelligenceInput;
import type { ExchangeIntelligencePublisherProfileProjection } from "../../shared/profile-card";
import type { ExchangeIntelligenceServiceCardProjection } from "../../shared/service-card";
