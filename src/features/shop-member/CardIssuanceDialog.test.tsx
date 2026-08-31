import { describe, expect, it } from "vitest";
import source from "./CardIssuanceDialog.tsx?raw";

describe("CardIssuanceDialog UI contract", () => {
  it("provides a formal mobile-first member, plan, and value review flow", () => {
    for (const copy of ["选择会员", "选择卡方案", "开卡初始值", "开卡来源", "NDP 返点规则", "平台费", "确认开卡"]) {
      expect(source).toContain(copy);
    }
    expect(source).toContain("<TestFeatureBadge");
    expect(source).toContain("merchantShopMembershipApi.list");
    expect(source).toContain("merchantShopMembershipApi.listCardPlans");
    expect(source).toContain("merchantShopMembershipApi.issueCard");
  });

  it("keeps retries idempotent and does not implement later money mutations", () => {
    expect(source).toContain("buildCardIssuanceAttempt");
    expect(source).not.toContain("topup");
    expect(source).not.toContain("redeem");
    expect(source).not.toContain("refund");
    expect(source).not.toContain("adjustBalance");
    expect(source).toContain("开卡不会自动发放 NDP");
  });
});
