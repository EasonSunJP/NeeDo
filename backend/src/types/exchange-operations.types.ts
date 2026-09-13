import type { PaginatedResponse } from "../utils/pagination";

export type ExchangeOperationsPostType = "demand" | "intelligence";
export type ExchangeOperationsPostStatus =
  | "published"
  | "matched"
  | "expired"
  | "withdrawn"
  | "closed";
export type ExchangeOperationsMatchMode = "quick" | "selective";
export type ExchangeOperationsServiceMode = "home" | "store" | "onsite" | "flexible";
export type ExchangeOperationsFinancialState = "held" | "captured" | "released";
export type ExchangeOperationsCurrency = "NDP" | "TEST_NDP";

export interface ExchangeOperationsPublisher {
  publicIdMasked: string;
  displayNameMasked: string;
  identityType: string;
}

export interface ExchangeOperationsFinancial {
  state: ExchangeOperationsFinancialState;
  amountNdp: number;
  currency: ExchangeOperationsCurrency;
  heldAmountNdp: number;
  capturedAmountNdp: number;
  releasedAmountNdp: number;
  ruleSetVersion: number;
  createdAt: string;
  capturedAt: string | null;
  releasedAt: string | null;
}

export interface ExchangeOperationsPost {
  id: number;
  type: ExchangeOperationsPostType;
  status: ExchangeOperationsPostStatus;
  title: string;
  publisher: ExchangeOperationsPublisher;
  serviceMode: ExchangeOperationsServiceMode;
  areaLabel: string;
  serviceStartAt: string;
  serviceEndAt: string;
  expiresAt: string;
  publishedAt: string;
  budgetMinJpy: number | null;
  budgetMaxJpy: number | null;
  matchMode: ExchangeOperationsMatchMode | null;
  claimCount: number;
  activeClaimCount: number;
  matchedCount: number;
  financial: ExchangeOperationsFinancial | null;
}

export interface ExchangeOperationsDemandDetail {
  targetProviderCount: number;
  targetProviderLimitSnapshot: number;
  publisherCapacitySource: "customer_membership" | "shop_merchant";
  membershipLevelSnapshot: string | null;
  matchMode: ExchangeOperationsMatchMode;
  budgetMode: "total" | "per_provider";
  budgetMinJpy: number | null;
  budgetMaxJpy: number;
  serviceMode: "home" | "store";
  addressLine1: string;
}

export interface ExchangeOperationsIntelligenceDetail {
  serviceMode: "store" | "onsite" | "flexible";
  addressLabel: string | null;
  serviceAreas: string[];
  originalPriceJpy: number | null;
  campaignPriceJpy: number;
  serviceName: string | null;
  serviceDurationMinutes: number | null;
}

export interface ExchangeOperationsClaim {
  id: number;
  status:
    | "active"
    | "withdrawn"
    | "request_withdrawn"
    | "request_expired"
    | "matched"
    | "not_selected"
    | "matching_closed";
  providerPublicIdMasked: string;
  providerDisplayNameMasked: string;
  shopName: string;
  technicianDisplayNameMasked: string;
  serviceName: string;
  durationMinutes: number;
  quoteAmountJpy: number;
  currency: "JPY";
  message: string | null;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  withdrawnAt: string | null;
  terminalAt: string | null;
}

export interface ExchangeOperationsMatchParticipant {
  exchangeClaimId: number;
  providerPublicIdMasked: string;
  providerDisplayNameMasked: string;
  shopName: string;
  technicianDisplayNameMasked: string;
  serviceName: string;
  durationMinutes: number;
  quoteAmountJpy: number;
  currency: "JPY";
  startsAt: string;
  endsAt: string;
  matchedAt: string;
  bookingOrderNo: string | null;
  bookingStatus: string | null;
}

export interface ExchangeOperationsMatching {
  status: "open" | "matched" | "closed";
  version: number;
  effectiveTargetProviderCount: number;
  effectiveBudgetMaxJpy: number;
  selectedQuoteTotalJpy: number;
  matchedAt: string | null;
  participants: ExchangeOperationsMatchParticipant[];
}

export interface ExchangeOperationsTimelineEvent {
  id: string;
  source: "post" | "claim" | "matching" | "financial" | "audit";
  event: string;
  status: string | null;
  actorDisplayNameMasked: string | null;
  amount: number | null;
  currency: ExchangeOperationsCurrency | null;
  createdAt: string;
}

export interface ExchangeOperationsDetail extends ExchangeOperationsPost {
  detail: string;
  contentLocale: string;
  demand: ExchangeOperationsDemandDetail | null;
  intelligence: ExchangeOperationsIntelligenceDetail | null;
  claims: ExchangeOperationsClaim[];
  matching: ExchangeOperationsMatching | null;
  timeline: ExchangeOperationsTimelineEvent[];
}

export type ExchangeOperationsPage = PaginatedResponse<ExchangeOperationsPost>;

