import { describe, expect, it } from "vitest";
import type { ShopMembershipCardPlan } from "./api";
import {
  buildCardIssuanceAttempt,
  cardIssuanceExpirySummary,
  cardIssuanceRewardSummary,
  createCardIssuanceEditor,
  validateCardIssuance
} from "./cardIssuanceModel";

const membershipPublicId = "00000000-0000-4000-8000-000000000401";
const planPublicId = "00000000-0000-4000-8000-000000000402";
const scope = { servicePublicIds: [], categoryCodes: [], excludedServicePublicIds: [], excludedCategoryCodes: [], activeFrom: null, activeTo: null };

function plan(cardType: "stored_value" | "count" | "benefit" = "stored_value"): ShopMembershipCardPlan {
  return {
    publicId: planPublicId,
    status: "active",
    currentVersion: {
      publicId: "00000000-0000-4000-8000-000000000403",
      version: 3,
      status: "published",
      lockVersion: 4,
      name: "青山会员卡",
      description: null,
      cardType,
      validity: { mode: "fixed_days", days: 30 },
      issuance: cardType === "stored_value"
        ? { minInitialPrincipalJpy: 1_000, maxInitialPrincipalJpy: 50_000, minInitialUses: null, maxInitialUses: null }
        : cardType === "count"
          ? { minInitialPrincipalJpy: null, maxInitialPrincipalJpy: null, minInitialUses: 1, maxInitialUses: 20 }
          : { minInitialPrincipalJpy: null, maxInitialPrincipalJpy: null, minInitialUses: null, maxInitialUses: null },
      caps: { perOrderNdp: null, perDayNdp: null, perMonthNdp: null, lifetimeNdp: null },
      platformFeePolicyPublicId: "00000000-0000-4000-8000-000000000499",
      platformFeeRateBps: 1_000,
      publishedAt: "2026-08-31T01:00:00.000Z",
      rules: [{ publicId: "00000000-0000-4000-8000-000000000405", ruleGroup: "base", sortOrder: 0, kind: "fixed_per_completion", rewardNdp: 1_000, scope }]
    },
    draftVersion: null,
    createdAt: "2026-08-31T01:00:00.000Z",
    updatedAt: "2026-08-31T01:00:00.000Z"
  };
}

describe("card issuance model", () => {
  it("serializes stored value within the published range without automatic NDP", () => {
    const editor = { ...createCardIssuanceEditor(), initialValue: "10000", issuanceReference: " receipt-1 ", issuanceNote: " 线下付款 " };

    expect(validateCardIssuance(membershipPublicId, plan(), editor, "retry-key-0001")).toEqual({
      planPublicId,
      initialPrincipalJpy: 10_000,
      initialUses: null,
      issuanceSource: "offline_paid",
      issuanceReference: "receipt-1",
      issuanceNote: "线下付款",
      idempotencyKey: "retry-key-0001"
    });
  });

  it("uses count only for count cards and no value for benefit cards", () => {
    expect(validateCardIssuance(membershipPublicId, plan("count"), { ...createCardIssuanceEditor(), initialValue: "8", issuanceNote: "线下购买" }, "retry-key-0002"))
      .toMatchObject({ initialPrincipalJpy: null, initialUses: 8 });
    expect(validateCardIssuance(membershipPublicId, plan("benefit"), { ...createCardIssuanceEditor(), initialValue: "", issuanceSource: "manual_grant", issuanceReference: "", issuanceNote: "客户关怀" }, "retry-key-0003"))
      .toMatchObject({ initialPrincipalJpy: null, initialUses: null, issuanceSource: "manual_grant" });
  });

  it("rejects inactive plans, range violations, and missing source evidence", () => {
    expect(() => validateCardIssuance(membershipPublicId, { ...plan(), status: "retired" }, { ...createCardIssuanceEditor(), initialValue: "10000", issuanceNote: "线下付款" }, "retry-key-0004")).toThrow("plan");
    expect(() => validateCardIssuance(membershipPublicId, plan(), { ...createCardIssuanceEditor(), initialValue: "999", issuanceNote: "线下付款" }, "retry-key-0005")).toThrow("range");
    expect(() => validateCardIssuance(membershipPublicId, plan(), { ...createCardIssuanceEditor(), initialValue: "10000" }, "retry-key-0006")).toThrow("source");
  });

  it("summarizes published validity, base NDP rule, and the snapshotted platform fee", () => {
    expect(cardIssuanceExpirySummary(plan(), new Date("2026-08-31T03:00:00.000Z"))).toContain("30");
    expect(cardIssuanceRewardSummary(plan())).toBe("每次服务返 1,000 NDP · 平台费 10%");
  });

  it("reuses an idempotency key only for an exact retry", () => {
    const editor = { ...createCardIssuanceEditor(), initialValue: "10000", issuanceNote: "线下付款" };
    const first = buildCardIssuanceAttempt(null, membershipPublicId, plan(), editor, () => "retry-key-1001");
    const replay = buildCardIssuanceAttempt(first, membershipPublicId, plan(), editor, () => "retry-key-1002");
    const changed = buildCardIssuanceAttempt(first, membershipPublicId, plan(), { ...editor, initialValue: "12000" }, () => "retry-key-1003");

    expect(replay.idempotencyKey).toBe("retry-key-1001");
    expect(changed.idempotencyKey).toBe("retry-key-1003");
  });
});
