import { describe, expect, it } from "vitest";
import type { MerchantShopMembershipCard } from "./api";
import { buildCardTopUpAttempt, createCardTopUpEditor, isCardTopUpEligible } from "./cardTopUpModel";

const card = (overrides: Partial<MerchantShopMembershipCard> = {}): MerchantShopMembershipCard => ({
  publicId: "00000000-0000-4000-8000-000000000701",
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
  platformFeeRateBpsSnapshot: 1_000,
  planPublicId: null,
  planVersionPublicId: null,
  planVersion: null,
  issuedAt: "2026-08-01T00:00:00.000Z",
  expiresAt: null,
  frozenAt: null,
  membershipPublicId: "00000000-0000-4000-8000-000000000702",
  customerNeedoId: "u0000000041",
  customerDisplayName: "王小美",
  pendingAdjustment: null,
  ...overrides
});

describe("card top-up model", () => {
  it("builds an exact paid-principal request and reuses a key only for identical retries", () => {
    const editor = { amountJpy: "5000", paymentMethod: "cash" as const, paymentReference: " receipt-001 ", note: " 店内现金充值 " };
    const first = buildCardTopUpAttempt(null, card(), editor, () => "topup-key-001");
    const replay = buildCardTopUpAttempt(first, card(), editor, () => "topup-key-002");
    const changed = buildCardTopUpAttempt(first, card(), { ...editor, amountJpy: "6000" }, () => "topup-key-003");
    expect(first.request).toEqual({
      amountJpy: 5_000,
      paymentMethod: "cash",
      paymentReference: "receipt-001",
      note: "店内现金充值",
      idempotencyKey: "topup-key-001"
    });
    expect(replay.idempotencyKey).toBe("topup-key-001");
    expect(changed.idempotencyKey).toBe("topup-key-003");
    expect(first.request).not.toHaveProperty("bonusJpy");
    expect(first.request).not.toHaveProperty("ndp");
    expect(first.request).not.toHaveProperty("shopId");
  });

  it.each([
    [card({ type: "count", principalBalanceJpy: null }), "type"],
    [card({ status: "frozen" }), "state"],
    [card({ principalBalanceJpy: null }), "state"],
    [card({ pendingAdjustment: { publicId: "pending", status: "pending", beforeValue: 10_000, targetValue: 12_000, expiresAt: "2026-09-03T00:00:00.000Z" } }), "pending"]
  ])("rejects an ineligible card", (input, message) => {
    expect(isCardTopUpEligible(input)).toBe(false);
    expect(() => buildCardTopUpAttempt(null, input, { amountJpy: "1000", paymentMethod: "cash", paymentReference: "receipt", note: "" }, () => "topup-key-001")).toThrow(message);
  });

  it.each([
    [{ amountJpy: "0", paymentMethod: "cash", paymentReference: "receipt", note: "" }, "amount"],
    [{ amountJpy: "10000001", paymentMethod: "cash", paymentReference: "receipt", note: "" }, "amount"],
    [{ amountJpy: "1.5", paymentMethod: "cash", paymentReference: "receipt", note: "" }, "amount"],
    [{ amountJpy: "1000", paymentMethod: "cash", paymentReference: "", note: "" }, "evidence"]
  ])("rejects invalid offline-payment evidence", (editor, message) => {
    expect(() => buildCardTopUpAttempt(null, card(), editor as never, () => "topup-key-001")).toThrow(message);
  });

  it("creates an empty editor with no inferred amount", () => {
    expect(createCardTopUpEditor()).toEqual({ amountJpy: "", paymentMethod: "cash", paymentReference: "", note: "" });
  });
});
