import { shopMembershipCardRefundCreateBodySchema } from "../src/validators/shop-membership-card-refund.validator";

describe("shop membership card refund validators", () => {
  it("normalizes a strict refund command", () => {
    expect(shopMembershipCardRefundCreateBodySchema.parse({
      reason: "  订单已完成原路退款  ",
      idempotencyKey: "  membership-refund-001  "
    })).toEqual({ reason: "订单已完成原路退款", idempotencyKey: "membership-refund-001" });
  });

  it.each([
    { reason: " ", idempotencyKey: "membership-refund-002" },
    { reason: "退款", idempotencyKey: "short" },
    { reason: "退款", idempotencyKey: "membership-refund-003", unexpected: true }
  ])("rejects malformed input %#", (input) => {
    expect(shopMembershipCardRefundCreateBodySchema.safeParse(input).success).toBe(false);
  });
});
