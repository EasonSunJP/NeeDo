import type { AnalyticsRankingItem } from "../../api/backofficeRealData";

export function buildAnalyticsRankingDetailLocation(item: AnalyticsRankingItem): {
  pathname: string;
  search: string;
} {
  if (item.entityType === "technician") {
    return {
      pathname: "/admin/technicians",
      search: `?detailTechnicianId=${item.entityNumericId}`
    };
  }
  if (item.entityType === "customer") {
    return {
      pathname: "/admin/users",
      search: `?detailUserId=${item.entityNumericId}`
    };
  }
  const search = new URLSearchParams({
    module: "services",
    detailServiceId: String(item.entityNumericId),
    detailServiceType: item.entityType
  });
  return {
    pathname: "/admin/merchants",
    search: `?${search.toString()}`
  };
}
