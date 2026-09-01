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
