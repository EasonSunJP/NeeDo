import { describe, expect, it } from "vitest";
import type { AffiliatePlatformFeeRule } from "../../api/affiliatePlatformFee";
import {
  buildAffiliateFeeCreateInput,
  classifyAffiliateFeeRule,
  toFeeBps,
  validateAffiliateFeeDraft,
  type AffiliateFeeDraft
} from "./affiliateFeeRuleModel";

const now = new Date("2026-08-30T02:00:00.000Z");
const rule = (
  effectiveFrom: string,
  effectiveTo: string | null
): AffiliatePlatformFeeRule => ({
  id: 41,
  scopeType: "global",
  scopeKey: "global",
  shopId: null,
  shopName: null,
  shopCity: null,
  feeBps: 1000,
  version: 1,
  effectiveFrom,
  effectiveTo,
  activeKey: "global",
  reason: "initial",
  createdByNeedoId: null,
  updatedByNeedoId: null,
  createdAt: effectiveFrom,
  updatedAt: effectiveFrom
});

const validDraft: AffiliateFeeDraft = {
  scopeType: "global",
  shop: null,
  percent: "10",
  effectiveMode: "now",
  scheduledAt: "",
  reason: "业务费率调整"
};

describe("affiliate fee rule model", () => {
  it("converts a percentage to exact integer basis points", () => {
    expect(toFeeBps("0")).toBe(0);
    expect(toFeeBps("10")).toBe(1000);
    expect(toFeeBps("10.25")).toBe(1025);
    expect(toFeeBps("100")).toBe(10_000);
    expect(toFeeBps("10.256")).toBeNull();
    expect(toFeeBps("100.01")).toBeNull();
    expect(toFeeBps("-1")).toBeNull();
  });

  it("classifies current, scheduled, and historical versions at the server timestamp", () => {
    expect(
      classifyAffiliateFeeRule(
        rule("2026-08-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z"),
        now.toISOString()
      )
    ).toBe("current");
    expect(
      classifyAffiliateFeeRule(
        rule("2026-09-01T00:00:00.000Z", null),
        now.toISOString()
      )
    ).toBe("scheduled");
    expect(
      classifyAffiliateFeeRule(
        rule("2026-07-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z"),
        now.toISOString()
      )
    ).toBe("historical");
  });

  it("validates shop selection, percent, future time, and reason", () => {
    expect(validateAffiliateFeeDraft(validDraft, now)).toEqual({});
    expect(
      validateAffiliateFeeDraft({ ...validDraft, scopeType: "shop", shop: null }, now)
    ).toMatchObject({ shop: "required" });
    expect(validateAffiliateFeeDraft({ ...validDraft, percent: "10.256" }, now)).toMatchObject({
      percent: "invalid"
    });
    expect(
      validateAffiliateFeeDraft(
        {
          ...validDraft,
          effectiveMode: "scheduled",
          scheduledAt: "2026-08-29T00:00:00.000Z"
        },
        now
      )
    ).toMatchObject({ scheduledAt: "future" });
    expect(validateAffiliateFeeDraft({ ...validDraft, reason: " " }, now)).toMatchObject({
      reason: "invalid"
    });
  });

  it("builds global and shop create inputs without accepting a free-form shop id", () => {
    expect(buildAffiliateFeeCreateInput(validDraft, 2, now)).toEqual({
      scopeType: "global",
      shopId: null,
      feeBps: 1000,
      expectedVersion: 2,
      effectiveFrom: now.toISOString(),
      reason: "业务费率调整"
    });

    const scheduledAt = "2026-09-01T09:00:00.000Z";
    expect(
      buildAffiliateFeeCreateInput(
        {
          ...validDraft,
          scopeType: "shop",
          shop: { id: 11, name: "GINZA Calm Body", city: "Tokyo" },
          percent: "12.5",
          effectiveMode: "scheduled",
          scheduledAt,
          reason: " 店铺活动费率 "
        },
        4,
        now
      )
    ).toEqual({
      scopeType: "shop",
      shopId: 11,
      feeBps: 1250,
      expectedVersion: 4,
      effectiveFrom: new Date(scheduledAt).toISOString(),
      reason: "店铺活动费率"
    });
  });
});
