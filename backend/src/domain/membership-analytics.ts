import type { DashboardGranularity, DashboardPeriod, DashboardWindow } from "./dashboard-period";

export const MAX_MEMBERSHIP_ANALYTICS_PAGE = Math.floor(Number.MAX_SAFE_INTEGER / 100);

export type MembershipAnalyticsScope = { kind: "platform" } | { kind: "shop"; shopId: number };

export interface MembershipAnalyticsRepositoryInput {
  scope: MembershipAnalyticsScope;
  city: string | null;
  window: DashboardWindow;
  evaluatedAt: Date;
}

export interface MembershipAnalyticsListInput extends MembershipAnalyticsRepositoryInput {
  needoId?: string;
  nickname?: string;
  page: number;
  pageSize: number;
}

export interface MembershipAnalyticsFilter {
  period: DashboardPeriod;
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
  timeZone: "Asia/Tokyo";
  granularity: DashboardGranularity;
  city: string | null;
  evaluatedAt: string;
}

export interface MembershipTrendPoint {
  key: string;
  label: string;
  value: number;
}

export type MembershipTrendSeries = [
  { seriesKey: "added"; label: "Added members"; unit: "people"; points: MembershipTrendPoint[] },
  {
    seriesKey: "removed";
    label: "Removed members";
    unit: "people";
    points: MembershipTrendPoint[];
  },
  { seriesKey: "net"; label: "Net members"; unit: "people"; points: MembershipTrendPoint[] }
];

export interface MembershipTrendPayload {
  dataStatus: "ready";
  filter: MembershipAnalyticsFilter;
  series: MembershipTrendSeries;
}

export type MemberAcquisitionSource =
  | "offline_paid"
  | "online_paid"
  | "gift"
  | "trial"
  | "renewal"
  | "historical_replacement"
  | "manual_grant";

export interface MemberAnalyticsListItem {
  userNeedoId: string;
  nickname: string;
  city: string;
  shopPublicId: string;
  shopName: string;
  membershipPublicId: string;
  planName: string | null;
  cardPublicId: string;
  cardNoMasked: string;
  acquisitionSource: MemberAcquisitionSource;
  addedAt: string;
  firstPaidAt: string | null;
  memberStatus: "active" | "inactive";
  cardStatus: "active" | "expired" | "frozen" | "void";
  expiresAt: string | null;
}

export interface MemberAnalyticsListPayload {
  list: MemberAnalyticsListItem[];
  total: number;
  page: number;
  page_size: number;
}

export class MembershipAnalyticsIncompleteHistoryError extends Error {
  public constructor() {
    super("Membership analytics history is incomplete");
    this.name = "MembershipAnalyticsIncompleteHistoryError";
  }
}
