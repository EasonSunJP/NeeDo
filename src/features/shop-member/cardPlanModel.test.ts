import { describe, expect, it } from "vitest";
import {
  cardPlanBonusRuleOptions,
  cardPlanRuleOptions,
  createEmptyCardPlanEditor,
  parsePercentageToBps,
  validateCardPlanDraft
} from "./cardPlanModel";

describe("membership card plan model", () => {
  it("supports only NDP reward kinds and never discount, gift, or free service outputs", () => {
    expect(cardPlanRuleOptions).toHaveLength(10);
    expect(cardPlanBonusRuleOptions).toHaveLength(7);
    const serialized = JSON.stringify(cardPlanRuleOptions);
    expect(serialized).not.toMatch(/discount|gift|free_service|折扣|礼物|赠送服务/i);
  });

  it("converts percentage text to exact integer bps", () => {
    expect(parsePercentageToBps("10")).toBe(1000);
    expect(parsePercentageToBps("12.34")).toBe(1234);
    expect(() => parsePercentageToBps("12.345")).toThrow("percentage");
    expect(() => parsePercentageToBps("101")).toThrow("percentage");
  });

  it("keeps form numerics as strings and emits one strict base NDP rule", () => {
    const editor = createEmptyCardPlanEditor();
    expect(editor.baseRule.rewardNdp).toBe("");
    const result = validateCardPlanDraft({ ...editor, name: "青山会员", baseRule: { ...editor.baseRule, rewardNdp: "1000" } });
    expect(result.rules).toEqual([expect.objectContaining({ kind: "fixed_per_completion", rewardNdp: 1000 })]);
    expect(result).not.toHaveProperty("shopId");
    expect(result).not.toHaveProperty("platformFeeRateBps");
  });

  it("enforces amount/use issuance fields by card type", () => {
    const editor = createEmptyCardPlanEditor();
    expect(() => validateCardPlanDraft({ ...editor, name: "权益卡", minInitialUses: "1", baseRule: { ...editor.baseRule, rewardNdp: "100" } })).toThrow("issuance");
    expect(() => validateCardPlanDraft({ ...editor, name: "储值卡", cardType: "stored_value", minInitialUses: "1", baseRule: { ...editor.baseRule, rewardNdp: "100" } })).toThrow("issuance");
    expect(() => validateCardPlanDraft({ ...editor, name: "次数卡", cardType: "count", minInitialPrincipalJpy: "1000", baseRule: { ...editor.baseRule, rewardNdp: "100" } })).toThrow("issuance");
  });
});
