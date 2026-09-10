import { ERROR_CODES } from "../src/constants/error-codes";
import {
  EXCHANGE_PERMISSIONS,
  SYSTEM_PERMISSION_CODES,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";
import {
  confirmQuickExchangeBudgetSchema,
  exchangeMatchingPostIdParamSchema,
  selectExchangeMatchSchema
} from "../src/validators/exchange-matching.validators";

describe("Exchange selective exact matching validators", () => {
  it("accepts only an exact strict Quick budget confirmation", () => {
    expect(
      confirmQuickExchangeBudgetSchema.parse({
        expectedVersion: 4,
        budgetConfirmation: {
          action: "increase_to_selected_total",
          confirmedBudgetMaxJpy: 31_000
        }
      })
    ).toEqual({
      expectedVersion: 4,
      budgetConfirmation: {
        action: "increase_to_selected_total",
        confirmedBudgetMaxJpy: 31_000
      }
    });
    for (const invalid of [
      { expectedVersion: 0, budgetConfirmation: null },
      {
        expectedVersion: 4,
        budgetConfirmation: { action: "raise", confirmedBudgetMaxJpy: 31_000 }
      },
      {
        expectedVersion: 4,
        budgetConfirmation: {
          action: "increase_to_selected_total",
          confirmedBudgetMaxJpy: 31_000,
          selectedClaimIds: [301]
        }
      }
    ]) {
      expect(confirmQuickExchangeBudgetSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("accepts a bounded unique selection and optimistic version", () => {
    expect(
      selectExchangeMatchSchema.parse({ selectedClaimIds: [9, 4], expectedVersion: 3 })
    ).toEqual({
      selectedClaimIds: [9, 4],
      expectedVersion: 3,
      budgetConfirmation: null,
      targetConfirmation: null
    });
  });

  it("accepts only strict budget and target adjustment confirmations", () => {
    expect(
      selectExchangeMatchSchema.parse({
        selectedClaimIds: [11],
        expectedVersion: 4,
        budgetConfirmation: {
          action: "increase_to_selected_total",
          confirmedBudgetMaxJpy: 24_000
        },
        targetConfirmation: {
          action: "reduce_to_selected_count",
          confirmedTargetProviderCount: 1
        }
      })
    ).toEqual({
      selectedClaimIds: [11],
      expectedVersion: 4,
      budgetConfirmation: {
        action: "increase_to_selected_total",
        confirmedBudgetMaxJpy: 24_000
      },
      targetConfirmation: {
        action: "reduce_to_selected_count",
        confirmedTargetProviderCount: 1
      }
    });

    for (const invalid of [
      {
        selectedClaimIds: [11],
        expectedVersion: 4,
        budgetConfirmation: { action: "raise", confirmedBudgetMaxJpy: 24_000 }
      },
      {
        selectedClaimIds: [11],
        expectedVersion: 4,
        budgetConfirmation: {
          action: "increase_to_selected_total",
          confirmedBudgetMaxJpy: 1_000_000_001
        }
      },
      {
        selectedClaimIds: [11],
        expectedVersion: 4,
        targetConfirmation: {
          action: "reduce_to_selected_count",
          confirmedTargetProviderCount: 0
        }
      },
      {
        selectedClaimIds: [11],
        expectedVersion: 4,
        targetConfirmation: {
          action: "reduce_to_selected_count",
          confirmedTargetProviderCount: 1,
          createBooking: true
        }
      }
    ]) {
      expect(selectExchangeMatchSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("rejects duplicates, empty selections, unknown fields and invalid versions", () => {
    expect(
      selectExchangeMatchSchema.safeParse({ selectedClaimIds: [9, 9], expectedVersion: 3 }).success
    ).toBe(false);
    expect(
      selectExchangeMatchSchema.safeParse({ selectedClaimIds: [], expectedVersion: 3 }).success
    ).toBe(false);
    expect(
      selectExchangeMatchSchema.safeParse({
        selectedClaimIds: [9],
        expectedVersion: 0,
        createBooking: true
      }).success
    ).toBe(false);
  });

  it("parses only a positive post id", () => {
    expect(exchangeMatchingPostIdParamSchema.parse({ id: "41" })).toEqual({ id: 41 });
    expect(exchangeMatchingPostIdParamSchema.safeParse({ id: 0 }).success).toBe(false);
  });

  it("reserves stable matching service errors", () => {
    expect(ERROR_CODES).toMatchObject({
      EXCHANGE_MATCH_NOT_ALLOWED: 40312,
      EXCHANGE_MATCH_NOT_FOUND: 40423,
      EXCHANGE_MATCH_INVALID_STATE: 40992,
      EXCHANGE_MATCH_VERSION_CONFLICT: 40993,
      EXCHANGE_MATCH_CLAIM_SET_INVALID: 40994,
      EXCHANGE_MATCH_COUNT_MISMATCH: 40995,
      EXCHANGE_MATCH_BUDGET_EXCEEDED: 40996,
      EXCHANGE_MATCH_TIME_CONFLICT: 40997,
      EXCHANGE_MATCH_IDEMPOTENCY_CONFLICT: 40998,
      EXCHANGE_MATCH_TARGET_CONFIRMATION_REQUIRED: 40999,
      EXCHANGE_MATCH_BUDGET_CONFIRMATION_REQUIRED: 41001,
      EXCHANGE_MATCH_BOOKING_INVALID_STATE: 41010,
      EXCHANGE_MATCH_BOOKING_IDEMPOTENCY_CONFLICT: 41014
    });
  });

  it("grants matched providers read-only matching access while keeping selection and booking owner-only", () => {
    expect(EXCHANGE_PERMISSIONS).toMatchObject({
      matchingReadOwn: "exchange:matching:read-own",
      matchingSelectOwn: "exchange:matching:select-own",
      matchingBookOwn: "exchange:matching:book-own"
    });
    const assignments = buildRolePermissionAssignments();
    for (const permission of [
      "exchange:matching:read-own",
      "exchange:matching:select-own",
      "exchange:matching:book-own"
    ]) {
      expect(SYSTEM_PERMISSION_CODES.filter((code) => code === permission)).toHaveLength(1);
    }
    for (const role of ["customer", "merchant_owner"] as const) {
      expect(assignments[role]).toEqual(
        expect.arrayContaining([
          "exchange:matching:read-own",
          "exchange:matching:select-own",
          "exchange:matching:book-own"
        ])
      );
    }
    for (const role of ["merchant_staff", "technician"] as const) {
      expect(assignments[role]).toContain("exchange:matching:read-own");
      expect(assignments[role]).not.toContain("exchange:matching:select-own");
      expect(assignments[role]).not.toContain("exchange:matching:book-own");
    }
  });
});
