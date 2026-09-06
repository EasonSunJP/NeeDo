export type ExchangePostType = "demand" | "intelligence";
export type ExchangePostStatus = "published" | "withdrawn" | "expired" | "matched" | "closed";
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
  canClaim: boolean;
  canViewClaims: boolean;
  canViewMatching?: boolean;
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
  provider: { publicId: string; displayName: string; avatarUrl: string | null };
  shop: { id: number; name: string };
  technician: { profileId: number; publicId: string; displayName: string };
  service: { ref: ExchangeClaimServiceRef; name: string; durationMinutes: number };
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
  quoteAmountJpy: number;
  message: string | null;
};

export type ExchangePriority = {
  active: boolean;
  tierCode: "free" | "silver" | "gold" | "black_diamond";
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
  priority?: ExchangePriority;
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
