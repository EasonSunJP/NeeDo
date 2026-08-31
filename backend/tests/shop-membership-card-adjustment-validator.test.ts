import {
  shopMembershipCardAdjustmentCreateBodySchema,
  shopMembershipCardAdjustmentDecisionBodySchema,
  shopMembershipCardAdjustmentListQuerySchema
} from "../src/validators/shop-membership-card-adjustment.validator";

describe("shop membership card adjustment validators", () => {
  it("accepts exactly one target field and trims the mandatory reason", () => {
    expect(shopMembershipCardAdjustmentCreateBodySchema.parse({
      targetPrincipalBalanceJpy: 12_000,
      targetRemainingUses: null,
      reason: "  线下账目核对后修正  ",
      idempotencyKey: "adjustment-request-001"
    })).toEqual({
      targetPrincipalBalanceJpy: 12_000,
      targetRemainingUses: null,
      reason: "线下账目核对后修正",
      idempotencyKey: "adjustment-request-001"
    });
    expect(() => shopMembershipCardAdjustmentCreateBodySchema.parse({
      targetPrincipalBalanceJpy: 12_000,
      targetRemainingUses: 6,
      reason: "不能同时修改",
      idempotencyKey: "adjustment-request-002"
    })).toThrow();
  });

  it("rejects negative, unchanged-shape, empty-reason and unknown fields", () => {
    for (const input of [
      { targetPrincipalBalanceJpy: -1, targetRemainingUses: null, reason: "原因", idempotencyKey: "request-001" },
      { targetPrincipalBalanceJpy: null, targetRemainingUses: null, reason: "原因", idempotencyKey: "request-002" },
      { targetPrincipalBalanceJpy: 1, targetRemainingUses: null, reason: " ", idempotencyKey: "request-003" },
      { targetPrincipalBalanceJpy: 1, targetRemainingUses: null, reason: "原因", idempotencyKey: "request-004", shopId: 3 }
    ]) expect(() => shopMembershipCardAdjustmentCreateBodySchema.parse(input)).toThrow();
  });

  it("accepts only approve/reject decisions and bounded pagination", () => {
    expect(shopMembershipCardAdjustmentDecisionBodySchema.parse({
      decision: "approve",
      idempotencyKey: "decision-001"
    })).toEqual({ decision: "approve", idempotencyKey: "decision-001" });
    expect(() => shopMembershipCardAdjustmentDecisionBodySchema.parse({ decision: "cancel", idempotencyKey: "decision-002" })).toThrow();
    expect(shopMembershipCardAdjustmentListQuerySchema.parse({ page: "2", pageSize: "10", status: "pending" }))
      .toEqual({ page: 2, pageSize: 10, status: "pending" });
    expect(() => shopMembershipCardAdjustmentListQuerySchema.parse({ pageSize: "501" })).toThrow();
  });
});
