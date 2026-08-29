import type { ContentLocaleCode } from "../constants/content-locales";
import type { PaginatedResponse } from "../utils/pagination";

export type ExchangePostType = "demand" | "intelligence";
export type ExchangePostStatus = "published" | "withdrawn" | "expired";
export type ExchangeServiceMode = "store" | "onsite" | "flexible";

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
}

export interface ExchangeDemandPayload {
  budgetMinJpy: number;
  budgetMaxJpy: number;
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
  publisher: ExchangeActorPayload;
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
  viewerUserId: number;
  authorUserId?: number;
  now: Date;
}

export type ExchangePostPage = PaginatedResponse<ExchangePostPayload>;
export type ExchangeCommentPage = PaginatedResponse<ExchangeCommentPayload>;
