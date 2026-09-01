import type { DashboardPeriod, DashboardWindow } from "./dashboard-period";

export type RankingKind = "service" | "technician" | "customer";
export type RankingMetric = "gmv" | "completedCount";
export type RankingEntityType = "service" | "technician_service" | "technician" | "customer";

export const MAX_ANALYTICS_RANKING_PAGE = Math.floor(Number.MAX_SAFE_INTEGER / 10);

export interface AnalyticsRankingInput {
  kind: RankingKind;
  metric: RankingMetric;
  window: DashboardWindow;
  evaluatedAt: Date;
  city: string | null;
  categoryId: number | null;
  page: number;
  pageSize: number;
}

export interface AnalyticsRankingItem {
  rank: number;
  entityType: RankingEntityType;
  entityPublicId: string;
  entityNumericId: number;
  displayName: string;
  avatarUrl: string | null;
  categoryId: number | null;
  gmvJpy: number;
  completedCount: number;
  registeredAt: string;
}

export interface AnalyticsRankingPage {
  list: AnalyticsRankingItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface AnalyticsRankingResponse extends AnalyticsRankingPage {
  dataStatus: "ready";
  filter: {
    kind: RankingKind;
    metric: RankingMetric;
    period: DashboardPeriod;
    from: string;
    to: string;
    timeZone: "Asia/Tokyo";
    city: string | null;
    categoryId: number | null;
    evaluatedAt: string;
  };
}

export class AnalyticsRankingIncompleteEvidenceError extends Error {
  public constructor() {
    super("Analytics ranking evidence is incomplete or contradictory");
    this.name = "AnalyticsRankingIncompleteEvidenceError";
  }
}
