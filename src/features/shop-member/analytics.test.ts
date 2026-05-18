import { describe, expect, it } from "vitest";
import { getShopMemberAnalytics, getShopMemberOverview, MEMBER_ANALYTICS_DIMENSIONS } from "./analytics";
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

  it("summarizes overview KPI values from members, cards, and ledgers", () => {
    const snapshot = createDefaultShopMemberSnapshot();
    const overview = getShopMemberOverview(snapshot, "store-1");

    expect(overview.activeMemberCount).toBe(snapshot.members.length);
    expect(overview.cardUserCount).toBeGreaterThan(0);
    expect(overview.expiringSoonCards).toBeGreaterThan(0);
    expect(overview.unpaidPrincipalBalance).toBeGreaterThan(0);
  });
});
