import type { ExchangeClaimServiceRef } from "./exchange-claim.types";

export type ExchangeMatchingStatus = "open" | "matched" | "closed";

export type ExchangeMatchingBookingStatus =
  | "pending"
  | "confirmed"
  | "inService"
  | "awaitingCheckout"
  | "awaitingPaymentConfirmation"
  | "completed"
  | "cancelled";

export interface ExchangeMatchAdjustmentPreview {
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
}

export interface ExchangeQuickBudgetDecision {
  action: "increase_to_selected_total";
  activeClaimCount: number;
  selectedQuoteTotalJpy: number;
  effectiveBudgetMaxJpy: number;
  requiredBudgetMaxJpy: number;
  requiredBudgetIncreaseJpy: number;
}

export interface ExchangeMatchParticipantPayload {
  exchangeClaimId: number;
  provider: {
    publicId: string;
    displayName: string;
    avatarUrl: string | null;
  };
  shop: {
    id: number;
    name: string;
  };
  technician: {
    profileId: number;
    publicId: string;
    displayName: string;
  };
  service: {
    ref: ExchangeClaimServiceRef;
    name: string;
    durationMinutes: number;
  };
  scheduleSlotId: number;
  quoteAmountJpy: number;
  currency: "JPY";
  estimatedStartsAt: string;
  estimatedEndsAt: string;
  matchedAt: string;
  booking: {
    orderId: number;
    orderNo: string;
    status: ExchangeMatchingBookingStatus;
  } | null;
}

export interface ExchangeMatchingPayload {
  exchangePostId: number;
  status: ExchangeMatchingStatus;
  version: number;
  effectiveTargetProviderCount: number;
  effectiveBudgetMaxJpy: number;
  selectedQuoteTotalJpy: number;
  matchedAt: string | null;
  participants: ExchangeMatchParticipantPayload[];
  quickBudgetDecision: ExchangeQuickBudgetDecision | null;
  viewer: {
    canSelect: boolean;
    canConfirmQuickBudget: boolean;
    canCreateBookings: boolean;
  };
}
