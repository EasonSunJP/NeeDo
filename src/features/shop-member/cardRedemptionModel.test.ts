import { describe, expect, it } from "vitest";
import { buildCardRedemptionAttempt } from "./cardRedemptionModel";

describe("card redemption model", () => {
  it("reuses the idempotency key only for the same completed order", () => {
    const first = buildCardRedemptionAttempt(null, " B202609010001 ", () => "redemption-key-001");
    const replay = buildCardRedemptionAttempt(first, "B202609010001", () => "redemption-key-002");
    const changed = buildCardRedemptionAttempt(first, "B202609010002", () => "redemption-key-003");

    expect(first).toEqual({ orderNo: "B202609010001", idempotencyKey: "redemption-key-001" });
    expect(replay.idempotencyKey).toBe("redemption-key-001");
    expect(changed.idempotencyKey).toBe("redemption-key-003");
  });

  it("rejects an empty or oversized order number", () => {
    expect(() => buildCardRedemptionAttempt(null, " ", () => "key")).toThrow("order");
    expect(() => buildCardRedemptionAttempt(null, "B".repeat(41), () => "key")).toThrow("order");
  });
});
