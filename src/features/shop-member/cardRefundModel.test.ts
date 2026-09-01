import { describe, expect, it } from "vitest";
import { buildCardRefundAttempt } from "./cardRefundModel";

describe("card refund model", () => {
  it("keeps one idempotency key for an exact retry and rotates it when the reason changes", () => {
    const first = buildCardRefundAttempt(null, " redemption-1 ", " 订单退款 ", () => "refund-key-001");
    const retry = buildCardRefundAttempt(first, "redemption-1", "订单退款", () => "refund-key-002");
    const changed = buildCardRefundAttempt(first, "redemption-1", "重复扣款", () => "refund-key-003");
    expect(first).toEqual({ redemptionPublicId: "redemption-1", reason: "订单退款", idempotencyKey: "refund-key-001" });
    expect(retry.idempotencyKey).toBe("refund-key-001");
    expect(changed.idempotencyKey).toBe("refund-key-003");
  });
});
