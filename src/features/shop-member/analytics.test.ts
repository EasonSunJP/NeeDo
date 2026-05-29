import { describe, expect, it } from "vitest";
import { getShopMemberAnalytics, getShopMemberOverview, MEMBER_ANALYTICS_BUCKETS, MEMBER_ANALYTICS_DIMENSIONS } from "./analytics";
import { createDefaultShopMemberSnapshot } from "./seed";

describe("shop member analytics", () => {
  it("builds source dimension data with summary separated from chart total", () => {
    const snapshot = createDefaultShopMemberSnapshot();
    const result = getShopMemberAnalytics(snapshot, "source");

    expect(result.summary.memberCount).toBe(snapshot.members.length);
    expect(result.total).toBe(snapshot.members.length);
    expect(result.items.some((item) => item.label === "LINE")).toBe(true);
    expect(result.items.every((item) => item.percentage >= 0)).toBe(true);
  });

  it("supports all eight required mobile analytics dimensions", () => {
    const keys = MEMBER_ANALYTICS_DIMENSIONS.map((item) => item.key);

    expect(keys).toEqual([
      "gender",
      "age",
      "card_status",
      "source",
      "consume_count",
      "recharge_count",
      "card_count",
      "total_spend"
    ]);
  });

  it("defines configurable gender and detailed age buckets for chart settings", () => {
    expect(MEMBER_ANALYTICS_BUCKETS.gender.map((item) => item.label)).toEqual(["男", "女", "不明", "其他"]);
    expect(MEMBER_ANALYTICS_BUCKETS.age.map((item) => item.label)).toEqual([
      "20岁以下",
      "20~25",
      "25~30",
      "30~35",
      "35~40",
      "40~45",
      "45~50",
      "50~55",
      "55~60",
      "60岁以上",
      "不明"
    ]);
  });

  it("recalculates summary values when a chart group is selected", () => {
    const snapshot = createDefaultShopMemberSnapshot();
    const selected = getShopMemberAnalytics(snapshot, "total_spend", { groupKey: "100000+" });
    const selectedMembers = snapshot.members.filter((member) => !member.deletedAt && member.totalSpend >= 100000);
    const selectedSpend = selectedMembers.reduce((sum, member) => sum + member.totalSpend, 0);
    const selectedOrderCount = selectedMembers.reduce((sum, member) => sum + member.totalOrders, 0);

    expect(selected.summary.memberCount).toBe(selectedMembers.length);
    expect(selected.summary.memberCount).toBeLessThan(snapshot.members.length);
    expect(selected.summary.totalSpend).toBe(selectedSpend);
    expect(selected.summary.avgTicket).toBe(Math.round(selectedSpend / selectedOrderCount));
    expect(selected.total).toBe(selectedMembers.length);
  });

  it("summarizes overview KPI values from members, cards, and ledgers", () => {
    const snapshot = createDefaultShopMemberSnapshot();
    const overview = getShopMemberOverview(snapshot, "store-1");

    expect(overview.activeMemberCount).toBe(snapshot.members.length);
    expect(overview.cardUserCount).toBeGreaterThan(0);
    expect(overview.expiringSoonCards).toBeGreaterThan(0);
    expect(overview.unpaidPrincipalBalance).toBeGreaterThan(0);
  });
});
