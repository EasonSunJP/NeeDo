import { ERROR_CODES } from "../src/constants/error-codes";
import {
  EXCHANGE_PERMISSIONS,
  SYSTEM_PERMISSION_CODES,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";
import {
  exchangeMatchingPostIdParamSchema,
  selectExchangeMatchSchema
} from "../src/validators/exchange-matching.validators";

describe("Exchange selective exact matching validators", () => {
  it("accepts a bounded unique selection and optimistic version", () => {
    expect(
      selectExchangeMatchSchema.parse({ selectedClaimIds: [9, 4], expectedVersion: 3 })
    ).toEqual({ selectedClaimIds: [9, 4], expectedVersion: 3 });
  });

  it("rejects duplicates, empty selections, unknown fields and invalid versions", () => {
    expect(
      selectExchangeMatchSchema.safeParse({ selectedClaimIds: [9, 9], expectedVersion: 3 })
        .success
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
      EXCHANGE_MATCH_IDEMPOTENCY_CONFLICT: 40998
    });
  });

  it("registers and grants only the owner matching permissions", () => {
    expect(EXCHANGE_PERMISSIONS).toMatchObject({
      matchingReadOwn: "exchange:matching:read-own",
      matchingSelectOwn: "exchange:matching:select-own"
    });
    const assignments = buildRolePermissionAssignments();
    for (const permission of [
      "exchange:matching:read-own",
      "exchange:matching:select-own"
    ]) {
      expect(SYSTEM_PERMISSION_CODES.filter((code) => code === permission)).toHaveLength(1);
      expect(assignments.customer).toContain(permission);
      expect(assignments.merchant_owner).toContain(permission);
      expect(assignments.merchant_staff).not.toContain(permission);
      expect(assignments.technician).not.toContain(permission);
    }
  });
});
