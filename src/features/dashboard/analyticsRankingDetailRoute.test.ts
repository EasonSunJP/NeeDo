import { describe, expect, it } from "vitest";
import type { AnalyticsRankingItem } from "../../api/backofficeRealData";
import { buildAnalyticsRankingDetailLocation } from "./analyticsRankingDetailRoute";

const item = (
  entityType: AnalyticsRankingItem["entityType"],
  entityNumericId: number
): AnalyticsRankingItem => ({
  avatarUrl: null,
  categoryId: 7,
  completedCount: 4,
  dataComposition: "formal",
  displayName: "正式对象",
  entityNumericId,
  entityPublicId: `${entityType}-public`,
  entityType,
  gmvJpy: 12000,
  rank: 1,
  registeredAt: "2026-01-01T00:00:00.000Z",
  testCompletedCount: 0,
  testGmvJpy: 0
});

describe("buildAnalyticsRankingDetailLocation", () => {
  it("routes formal service rows to the existing service detail drawer", () => {
    expect(buildAnalyticsRankingDetailLocation(item("service", 51))).toEqual({
      pathname: "/admin/merchants",
      search: "?module=services&detailServiceId=51&detailServiceType=service"
    });
    expect(buildAnalyticsRankingDetailLocation(item("technician_service", 71))).toEqual({
      pathname: "/admin/merchants",
      search: "?module=services&detailServiceId=71&detailServiceType=technician_service"
    });
  });

  it("routes technicians and customers to their existing formal drawers", () => {
    expect(buildAnalyticsRankingDetailLocation(item("technician", 31))).toEqual({
      pathname: "/admin/technicians",
      search: "?detailTechnicianId=31"
    });
    expect(buildAnalyticsRankingDetailLocation(item("customer", 41))).toEqual({
      pathname: "/admin/users",
      search: "?detailUserId=41"
    });
  });
});
