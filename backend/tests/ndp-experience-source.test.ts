import { classifyExperienceSource } from "../src/domain/ndp-experience-source";

const occurredAt = new Date("2026-09-01T03:00:00.000Z");

const transaction = (overrides: Record<string, unknown> = {}) => ({
  ledgerTransactionId: 71,
  transactionNo: "TX-NDP-71",
  type: "booking_complete_settlement",
  status: "applied",
  referenceType: "booking_order",
  referenceId: 501,
  currency: "NDP",
  occurredAt,
  metadata: { experienceConsumptionKind: "service" },
  ...overrides
});

const userDebit = (overrides: Record<string, unknown> = {}) => ({
  walletOwnerType: "user",
  walletOwnerId: 41,
  walletCurrency: "NDP",
  direction: "available_debit",
  amount: 12_345,
  availableDelta: -12_345,
  frozenDelta: 0,
  ...overrides
});

describe("NDP experience settlement source classification", () => {
  it("allows only an applied final user-wallet service debit", () => {
    expect(classifyExperienceSource(transaction(), userDebit())).toEqual({
      kind: "qualifying_consumption",
      userId: 41,
      settledNdp: 12_345,
      ledgerTransactionId: 71,
      transactionNo: "TX-NDP-71",
      occurredAt
    });
    expect(
      classifyExperienceSource(
        transaction({
          type: "product_consumption_settlement",
          referenceType: "product_order",
          metadata: { experienceConsumptionKind: "product" }
        }),
        userDebit({ direction: "frozen_debit", availableDelta: 0, frozenDelta: -12_345 })
      ).kind
    ).toBe("qualifying_consumption");
  });

  it.each([
    ["pending transaction", transaction({ status: "pending" }), userDebit()],
    ["freeze", transaction({ type: "booking_accept_freeze" }), userDebit({ direction: "freeze" })],
    [
      "unfreeze",
      transaction({ type: "booking_cancel_unfreeze" }),
      userDebit({ direction: "unfreeze" })
    ],
    ["platform fee", transaction(), userDebit({ walletOwnerType: "platform" })],
    ["affiliate transfer", transaction({ type: "affiliate_reward_settlement" }), userDebit()],
    ["unmarked fee debit", transaction({ metadata: null }), userDebit()],
    [
      "top-up",
      transaction({ type: "manual_topup_approved" }),
      userDebit({ direction: "available_credit", availableDelta: 12_345 })
    ],
    [
      "test currency",
      transaction({ currency: "TEST_NDP" }),
      userDebit({ walletCurrency: "TEST_NDP" })
    ],
    ["mismatched amount", transaction(), userDebit({ availableDelta: -100 })]
  ])("rejects %s", (_label, sourceTransaction, sourceEntry) => {
    expect(classifyExperienceSource(sourceTransaction, sourceEntry).kind).toBe("ineligible");
  });

  it("defers a validated membership purchase to its entitlement event", () => {
    expect(
      classifyExperienceSource(
        transaction({
          type: "platform_membership_purchase",
          referenceType: "platform_membership_entitlement",
          metadata: { entitlementPublicId: "00000000-0000-4000-8000-000000000123" }
        }),
        userDebit()
      )
    ).toEqual({
      kind: "membership_purchase",
      userId: 41,
      settledNdp: 12_345,
      ledgerTransactionId: 71,
      transactionNo: "TX-NDP-71",
      entitlementPublicId: "00000000-0000-4000-8000-000000000123",
      occurredAt
    });
    expect(
      classifyExperienceSource(
        transaction({
          type: "platform_membership_purchase",
          referenceType: "platform_membership_entitlement",
          metadata: { entitlementPublicId: "not-a-public-id" }
        }),
        userDebit()
      ).kind
    ).toBe("ineligible");
  });

  it.each([4_000, 12_345])("classifies a bounded %i NDP refund reversal", (amount) => {
    expect(
      classifyExperienceSource(
        transaction({
          type: "booking_consumption_refund",
          referenceType: "booking_order_refund",
          metadata: { originalLedgerTransactionNo: "TX-NDP-ORIGINAL" }
        }),
        userDebit({
          amount,
          direction: "available_credit",
          availableDelta: amount,
          frozenDelta: 0
        })
      )
    ).toEqual({
      kind: "reversal",
      userId: 41,
      reversedNdp: amount,
      ledgerTransactionId: 71,
      transactionNo: "TX-NDP-71",
      originalLedgerTransactionNo: "TX-NDP-ORIGINAL",
      occurredAt
    });
  });
});
