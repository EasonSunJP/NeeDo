import { describe, expect, it } from "vitest";
import type { MerchantShopMembershipCard } from "./api";
import { buildCardAdjustmentAttempt, createCardAdjustmentEditor, formatAdjustmentDeadline } from "./cardAdjustmentModel";

const card = (overrides: Partial<MerchantShopMembershipCard> = {}): MerchantShopMembershipCard => ({
  publicId: "00000000-0000-4000-8000-000000000601",
  cardNoMasked: "NMC-****-0012",
  name: "青山储值卡",
  type: "stored_value",
  status: "active",
  principalBalanceJpy: 10_000,
  bonusBalanceJpy: 500,
  remainingUses: null,
  totalUses: null,
  initialPrincipalJpy: 10_000,
  initialUses: null,
  issuanceSource: "offline_paid",
  platformFeeRateBpsSnapshot: 1000,
  planPublicId: null,
  planVersionPublicId: null,
  planVersion: null,
  issuedAt: "2026-08-01T00:00:00.000Z",
  expiresAt: null,
  frozenAt: null,
  membershipPublicId: "00000000-0000-4000-8000-000000000602",
  customerNeedoId: "u0000000041",
  customerDisplayName: "王小美",
  ...overrides
});

describe("card adjustment model", () => {
  it("submits the final principal target without changing bonus or sending a client before-value", () => {
    const attempt = buildCardAdjustmentAttempt(null, card(), { targetValue: "12000", reason: "  线下账目核对后修正  " }, () => "request-key-001");
    expect(attempt.request).toEqual({
      targetPrincipalBalanceJpy: 12_000,
      targetRemainingUses: null,
      reason: "线下账目核对后修正",
      idempotencyKey: "request-key-001"
    });
    expect(attempt.request).not.toHaveProperty("beforeValue");
    expect(attempt.request).not.toHaveProperty("bonusBalanceJpy");
  });

  it("submits the final remaining count and keeps the idempotency key only for an identical retry", () => {
    const countCard = card({ type: "count", principalBalanceJpy: null, bonusBalanceJpy: null, remainingUses: 4, totalUses: 10 });
    const editor = { targetValue: "6", reason: "补登记两次线下服务" };
    const first = buildCardAdjustmentAttempt(null, countCard, editor, () => "request-key-001");
    const replay = buildCardAdjustmentAttempt(first, countCard, editor, () => "request-key-002");
    const changed = buildCardAdjustmentAttempt(first, countCard, { ...editor, targetValue: "7" }, () => "request-key-003");
    expect(first.request).toMatchObject({ targetPrincipalBalanceJpy: null, targetRemainingUses: 6 });
    expect(replay.idempotencyKey).toBe("request-key-001");
    expect(changed.idempotencyKey).toBe("request-key-003");
  });

  it.each([
    [card({ status: "frozen" }), { targetValue: "12000", reason: "原因充分" }, "state"],
    [card({ type: "benefit", principalBalanceJpy: null, bonusBalanceJpy: null }), { targetValue: "1", reason: "原因充分" }, "type"],
    [card(), { targetValue: "10000", reason: "原因充分" }, "unchanged"],
    [card(), { targetValue: "-1", reason: "原因充分" }, "value"],
    [card(), { targetValue: "12000", reason: "  " }, "reason"]
  ])("rejects unsafe adjustment input", (inputCard, editor, message) => {
    expect(() => buildCardAdjustmentAttempt(null, inputCard, editor, () => "request-key-001")).toThrow(message);
  });

  it("creates an empty editor and formats the 72-hour deadline", () => {
    expect(createCardAdjustmentEditor()).toEqual({ targetValue: "", reason: "" });
    expect(formatAdjustmentDeadline("2026-09-03T03:00:00.000Z", new Date("2026-09-01T03:00:00.000Z"))).toContain("48");
    expect(formatAdjustmentDeadline("2026-09-01T03:00:00.000Z", new Date("2026-09-01T03:00:00.000Z"))).toBe("已截止");
  });
});
