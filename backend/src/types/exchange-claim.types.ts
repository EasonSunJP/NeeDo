import type { PaginatedResponse } from "../utils/pagination";

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

export interface ExchangeClaimOptionPayload {
  scheduleSlotId: number;
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
  startsAt: string;
  endsAt: string;
}

export interface ExchangeClaimPayload {
  id: number;
  exchangePostId: number;
  status: ExchangeClaimStatus;
  source: ExchangeClaimSource;
  provider: {
    publicId: string;
    displayName: string;
    avatarUrl: string | null;
  };
  shop: {
    id: number;
    name: string;
    publicId: string | null;
  };
  technician: {
    profileId: number;
    publicId: string;
    displayName: string;
  };
  service: {
    ref: ExchangeClaimServiceRef;
    publicId: string;
    name: string;
    durationMinutes: number;
  };
  scheduleSlotId: number;
  quoteAmountJpy: number;
  currency: "JPY";
  message: string | null;
  estimatedStartsAt: string;
  estimatedEndsAt: string;
  createdAt: string;
  withdrawnAt: string | null;
  terminalAt: string | null;
}

export interface ExchangeClaimMinePayload {
  claim: ExchangeClaimPayload | null;
}

export type ExchangeClaimOptionPage = PaginatedResponse<ExchangeClaimOptionPayload>;
export type ExchangeClaimPage = PaginatedResponse<ExchangeClaimPayload>;
